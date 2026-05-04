// Signature Ability System - Helper functions for faction-specific abilities
import type { GameState, Unit, HexCoord } from '../game/types.js';
import type { RulesRegistry } from '../data/registry/types.js';
import { getNeighbors } from '../core/grid.js';
import { getUnitAtHex } from './occupancySystem.js';
import { getTerrainAt } from './abilitySystem.js';
import { isUnitVisibleTo } from './fogSystem.js';
import abilityDomainsData from '../content/base/ability-domains.json' assert { type: 'json' };

// Type for ability domain entries
type AbilityDomain = {
  id: string;
  name: string;
  nativeFaction: string;
  tags: string[];
  baseEffect: {
    type: string;
    [key: string]: unknown;
  };
};

function getAbilityDomains(): Record<string, AbilityDomain> {
  return (abilityDomainsData as { domains: Record<string, AbilityDomain> }).domains;
}

function getDomainForTag(tag: string): AbilityDomain | null {
  const domains = getAbilityDomains();
  for (const domain of Object.values(domains)) {
    if (domain.tags.includes(tag)) {
      return domain;
    }
  }
  return null;
}

/**
 * Check if a unit has fortress training (for Bulwark ability)
 */
export function hasFortressTraining(
  unitId: string,
  state: GameState,
  registry: RulesRegistry
): boolean {
  const prototype = state.prototypes.get(unitId as unknown as import('../types.js').PrototypeId);
  if (!prototype) return false;
  // Check prototype tags first
  if (prototype.tags?.includes('fortress')) return true;
  // Also check component tags for backward compatibility
  const componentIds = (prototype as unknown as { componentIds?: string[] }).componentIds ?? [];
  for (const componentId of componentIds) {
    const component = registry.getComponent(componentId);
    if (component?.tags?.includes('fortress')) return true;
  }
  return false;
}

/**
 * Get defense bonus from adjacent fortress units (Bulwark ability)
 * Reads value from ability-domains.json fortress domain.
 */
export function getBulwarkDefenseBonus(
  defender: Unit,
  state: GameState,
  registry: RulesRegistry,
  baseBonus: number = 0
): number {
  const fortressDomain = getDomainForTag('fortress');
  const bonusValue = fortressDomain
    ? (fortressDomain.baseEffect.value as number) ?? baseBonus
    : baseBonus;

  const neighbors = getNeighbors(defender.position);
  for (const hex of neighbors) {
    const unitId = getUnitAtHex(state, hex);
    if (unitId) {
      const neighbor = state.units.get(unitId);
      if (neighbor && neighbor.factionId === defender.factionId && neighbor.hp > 0) {
        if (hasFortressTraining(unitId, state, registry)) {
          return bonusValue;
        }
      }
    }
  }
  return 0;
}

/**
 * Find the best retreat hex for Hit and Run ability
 * Returns hex furthest from any enemy that is adjacent to current position
 */
export function findRetreatHex(
  unit: Unit,
  state: GameState
): HexCoord | null {
  const neighbors = getNeighbors(unit.position);
  let bestHex: HexCoord | null = null;
  let maxEnemyDistance = -1;

  const faction = state.factions.get(unit.factionId);
  const passiveTrait = faction?.identityProfile.passiveTrait ?? '';
  const prototype = state.prototypes.get(unit.prototypeId);
  const unitTags = prototype?.tags ?? [];
  const isAmphibious = unitTags.includes('amphibious');

  for (const hex of neighbors) {
    // Check if hex is occupied
    if (getUnitAtHex(state, hex)) continue;

    const retreatTerrain = getTerrainAt(state, hex);
    const isJungle = retreatTerrain === 'jungle';
    const isDesert = retreatTerrain === 'desert';
    const isSwamp = retreatTerrain === 'swamp';
    const wouldTakeDamage =
      (isJungle && passiveTrait !== 'jungle_stalkers')
      || (isDesert && passiveTrait !== 'desert_logistics' && passiveTrait !== 'charge_momentum')
      || (isSwamp && passiveTrait !== 'healing_druids' && passiveTrait !== 'jungle_stalkers' && passiveTrait !== 'river_assault' && !isAmphibious);

    // Skip hexes with damaging terrain unless no safer hex is available
    if (wouldTakeDamage) continue;

    // Calculate distance to nearest visible enemy
    let minEnemyDist = Infinity;
    for (const [, enemy] of state.units) {
      if (enemy.factionId !== unit.factionId && enemy.hp > 0 && isUnitVisibleTo(state, unit.factionId, enemy)) {
        const dist = Math.abs(hex.q - enemy.position.q) + Math.abs(hex.r - enemy.position.r);
        minEnemyDist = Math.min(minEnemyDist, dist);
      }
    }

    // Prefer hexes further from enemies
    if (minEnemyDist > maxEnemyDistance) {
      maxEnemyDistance = minEnemyDist;
      bestHex = hex;
    }
  }

  // Fallback: if all adjacent hexes are occupied or damaging, allow damaging hexes
  if (bestHex === null) {
    for (const hex of neighbors) {
      if (getUnitAtHex(state, hex)) continue;
      return hex;
    }
  }

  return bestHex;
}

// ============================================================
// Bold Base Effect Helpers
// ============================================================

/**
 * applyKnockback — push defender to adjacent hex after combat.
 * Pushes defender away from attacker to the most logical adjacent hex.
 * Returns the knockback target hex, or null if no valid hex found.
 */
export function applyKnockback(
  state: GameState,
  attacker: Unit,
  defender: Unit,
  distance: number = 1
): HexCoord | null {
  const neighbors = getNeighbors(defender.position);

  // Score each neighbor: prefer hexes away from attacker, that are empty and passable
  let bestHex: HexCoord | null = null;
  let bestScore = -Infinity;

  for (const hex of neighbors) {
    // Must be empty
    if (getUnitAtHex(state, hex)) continue;

    // Must be passable (check terrain)
    const tile = state.map?.tiles.get(
      `${hex.q},${hex.r}`
    );
    if (!tile) continue;

    // Score: distance from attacker (further = better)
    const distFromAttacker = Math.abs(hex.q - attacker.position.q) + Math.abs(hex.r - attacker.position.r);
    let score = distFromAttacker;

    // Prefer hex in the direction away from attacker
    const dirQ = defender.position.q - attacker.position.q;
    const dirR = defender.position.r - attacker.position.r;
    const hexDirQ = hex.q - defender.position.q;
    const hexDirR = hex.r - defender.position.r;
    if (dirQ !== 0 && Math.sign(hexDirQ) === Math.sign(dirQ)) score += 2;
    if (dirR !== 0 && Math.sign(hexDirR) === Math.sign(dirR)) score += 2;

    if (score > bestScore) {
      bestScore = score;
      bestHex = hex;
    }
  }

  return bestHex;
}

/**
 * applyPoisonDoT — apply poison stacks to target.
 * Each stack deals damagePerTurn damage for duration turns.
 * Returns the updated unit with poison stacks applied.
 */
export function applyPoisonDoT(
  target: Unit,
  stacks: number,
  damagePerTurn: number,
  duration: number
): Unit {
  const newPoisonStacks = Math.min(target.poisonStacks + stacks, 2); // Cap at 2 stacks
  return {
    ...target,
    poisonStacks: newPoisonStacks,
    poisoned: newPoisonStacks > 0,
    poisonTurnsRemaining: duration, // Refresh to full duration
  };
}

/**
 * tickStealthCooldown — decrement turnsSinceStealthBreak for a unit.
 * Called at the start of each round for stealth-tagged units.
 */
export function tickStealthCooldown(unit: Unit): Unit {
  if (unit.turnsSinceStealthBreak > 0) {
    return { ...unit, turnsSinceStealthBreak: unit.turnsSinceStealthBreak - 1 };
  }
  return unit;
}

/**
 * enterStealth — attempt to enter stealth for a stealth-tagged unit.
 * Only succeeds if turnsSinceStealthBreak === 0.
 */
export function enterStealth(unit: Unit, prototypeTags: string[]): Unit {
  if (!prototypeTags.includes('stealth')) return unit;
  if (unit.turnsSinceStealthBreak > 0) return unit;
  return { ...unit, isStealthed: true };
}

/**
 * getNatureHealingAura — return healing values from ability-domains.json.
 * Returns { selfHeal, allyHeal } for units with healing/druid tags.
 */
export function getNatureHealingAura(): { selfHeal: number; allyHeal: number } {
  const healingDomain = getDomainForTag('healing') ?? getDomainForTag('druid');
  if (!healingDomain) return { selfHeal: 2, allyHeal: 1 };
  return {
    selfHeal: (healingDomain.baseEffect.selfHeal as number) ?? 2,
    allyHeal: (healingDomain.baseEffect.allyHeal as number) ?? 1,
  };
}

/**
 * getTidalCoastDebuff — return the defense debuff from tidal_warfare domain.
 */
export function getTidalCoastDebuff(): number {
  const tidalDomain = getDomainForTag('naval');
  if (!tidalDomain) return 0.25;
  return (tidalDomain.baseEffect.coastDebuff as number) ?? 0.25;
}
