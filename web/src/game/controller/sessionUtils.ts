/**
 * Pure helper functions extracted from GameSession.
 * None of these depend on `this` — they take explicit state and return new state.
 */

import type { GameState, Unit, UnitId } from '../../../../src/game/types.js';
import type { HexCoord } from '../../../../src/types.js';
import { createImprovementId } from '../../../../src/core/ids.js';
import { resolveCapabilityDoctrine } from '../../../../src/systems/capabilityDoctrine.js';
import { updateFogState } from '../../../../src/systems/fogSystem.js';
import { getFaction, getPrototype, getResearch, asImprovementId, asFactionId } from '../stateAccess.js';
import { isCityEncircled } from '../../../../src/systems/territorySystem.js';
import { calculatePrototypeCost, getDomainIdsByTags, isUnlockPrototype } from '../../../../src/systems/knowledgeSystem.js';
import { hasCaptureAbility } from '../../../../src/systems/captureSystem.js';
import { canPriestSummon, attemptPriestSummon } from '../../../../src/systems/summonSystem.js';
import { declareMaelstrom } from '../../../../src/systems/maelstromSystem.js';
import type { RulesRegistry } from '../../../../src/data/registry/types.js';

// ---------------------------------------------------------------------------
// Re-exports: combat-system utilities proxied through sessionUtils so that
// GameSession does not import banned systems directly.
// ---------------------------------------------------------------------------

export { hasCaptureAbility, canPriestSummon, attemptPriestSummon };

// ---------------------------------------------------------------------------
// Fog
// ---------------------------------------------------------------------------

export function refreshFogForAllFactions(state: GameState): GameState {
  let nextState = state;
  for (const fid of nextState.factions.keys()) {
    nextState = updateFogState(nextState, fid);
  }
  return nextState;
}

// ---------------------------------------------------------------------------
// Siege
// ---------------------------------------------------------------------------

export function updateSiegeState(state: GameState): GameState {
  const cities = new Map(state.cities);
  let changed = false;
  for (const [cityId, city] of cities) {
    const encircled = isCityEncircled(city, state);
    if (encircled && !city.besieged) {
      cities.set(cityId, { ...city, besieged: true, turnsUnderSiege: 0 });
      changed = true;
    } else if (!encircled && city.besieged) {
      cities.set(cityId, { ...city, besieged: false, turnsUnderSiege: 0 });
      changed = true;
    } else if (city.besieged) {
      cities.set(cityId, { ...city, turnsUnderSiege: (city.turnsUnderSiege ?? 0) + 1 });
      changed = true;
    }
  }
  return changed ? { ...state, cities } : state;
}

// ---------------------------------------------------------------------------
// Improvements & Forts
// ---------------------------------------------------------------------------

export function getImprovementAtHex(state: GameState, position: { q: number; r: number }) {
  for (const improvement of state.improvements.values()) {
    if (improvement.position.q === position.q && improvement.position.r === position.r) {
      return improvement;
    }
  }
  return null;
}

export function isFortificationHex(state: GameState, position: { q: number; r: number }): boolean {
  return getImprovementAtHex(state, position)?.type === 'fortification';
}

export function getBastionBuildEligibility(
  state: GameState,
  registry: RulesRegistry,
  unit: Unit,
): { canBuild: boolean; defenseBonus: number } {
  const faction = state.factions.get(unit.factionId);
  const research = getResearch(state, unit.factionId);
  const doctrine = faction ? resolveCapabilityDoctrine(research, faction) : undefined;
  const prototype = getPrototype(state, unit.prototypeId);

  if (!faction || faction.id !== 'hill_clan') {
    return { canBuild: false, defenseBonus: 0 };
  }

  // canBuildBastion already enforces fortress native T3 + the 3-per-game cap
  // (faction.bastionsBuilt < 3) at the doctrine layer.
  if (!doctrine?.canBuildBastion) {
    return { canBuild: false, defenseBonus: 0 };
  }

  if (unit.hp <= 0 || unit.status !== 'ready' || unit.movesRemaining !== unit.maxMoves) {
    return { canBuild: false, defenseBonus: 0 };
  }

  if (!prototype) {
    return { canBuild: false, defenseBonus: 0 };
  }

  const movementClass = registry.getChassis(prototype.chassisId)?.movementClass;
  const role = prototype.derivedStats.role;
  if (!(movementClass === 'infantry' || role === 'ranged')) {
    return { canBuild: false, defenseBonus: 0 };
  }

  if (getImprovementAtHex(state, unit.position)) {
    return { canBuild: false, defenseBonus: 0 };
  }

  const bastion = registry.getImprovement('bastion');
  return {
    canBuild: true,
    defenseBonus: bastion?.defenseBonus ?? 4,
  };
}

export function buildBastionAtUnit(
  state: GameState,
  unit: Unit,
  defenseBonus: number,
): GameState {
  const improvementId = createImprovementId();
  const improvements = new Map(state.improvements);
  improvements.set(improvementId, {
    id: improvementId,
    type: 'fortification',
    position: { ...unit.position },
    ownerFactionId: unit.factionId,
    defenseBonus,
  });

  const units = new Map(state.units);
  units.set(unit.id, {
    ...unit,
    movesRemaining: 0,
    attacksRemaining: 0,
    status: 'fortified' as const,
  });

  // Increment the per-game Bastion counter so the doctrine flag re-evaluates
  // to false once the cap is hit.
  const factions = new Map(state.factions);
  const faction = state.factions.get(unit.factionId);
  if (faction) {
    factions.set(unit.factionId, { ...faction, bastionsBuilt: faction.bastionsBuilt + 1 });
  }

  return {
    ...state,
    improvements,
    units,
    factions,
  };
}

export function getMaelstromDeclareEligibility(
  state: GameState,
  unit: Unit,
): { canDeclare: boolean } {
  const faction = state.factions.get(unit.factionId);
  const research = getResearch(state, unit.factionId);
  const doctrine = faction ? resolveCapabilityDoctrine(research, faction) : undefined;

  if (!faction || !doctrine?.canDeclareMaelstrom) {
    return { canDeclare: false };
  }
  if (unit.hp <= 0 || unit.status !== 'ready') {
    return { canDeclare: false };
  }
  return { canDeclare: true };
}

export function declareMaelstromAtUnit(
  state: GameState,
  unit: Unit,
): GameState {
  const result = declareMaelstrom(state, unit.factionId as import('../../../../src/types.js').FactionId, unit.position);
  return result.state;
}

export function getFortDestroyEligibility(
  state: GameState,
  unit: Unit,
): { canDestroy: boolean; fortId: string | null } {
  const faction = state.factions.get(unit.factionId);
  if (!faction || faction.id !== 'hill_clan') {
    return { canDestroy: false, fortId: null };
  }

  const prototype = getPrototype(state, unit.prototypeId);
  if (!prototype?.tags?.includes('engineer')) {
    return { canDestroy: false, fortId: null };
  }

  if (unit.hp <= 0 || unit.status !== 'ready' || unit.movesRemaining !== unit.maxMoves) {
    return { canDestroy: false, fortId: null };
  }

  const improvement = getImprovementAtHex(state, unit.position);
  if (!improvement) {
    return { canDestroy: false, fortId: null };
  }

  return { canDestroy: true, fortId: improvement.id as string };
}

export function destroyFortAtUnit(
  state: GameState,
  unit: Unit,
  fortId: string,
): GameState {
  const improvements = new Map(state.improvements);
  improvements.delete(asImprovementId(fortId));

  const units = new Map(state.units);
  units.set(unit.id, {
    ...unit,
    movesRemaining: 0,
    attacksRemaining: 0,
    status: 'spent' as const,
  });

  return {
    ...state,
    improvements,
    units,
  };
}

// ---------------------------------------------------------------------------
// Prototype cost
// ---------------------------------------------------------------------------

export function getPrototypeCost(state: GameState, registry: RulesRegistry, prototypeId: string): number {
  const prototype = getPrototype(state, prototypeId);
  if (!prototype) {
    return 10;
  }

  // Unlock prototypes (hybrid recipes) use the mastery cost modifier
  if (isUnlockPrototype(prototype)) {
    const faction = getFaction(state, prototype.factionId);
    if (faction) {
      return calculatePrototypeCost(
        prototype.productionCost,
        faction,
        getDomainIdsByTags(prototype.tags ?? []),
        prototype,
      );
    }
  }

  return prototype.productionCost;
}

// ---------------------------------------------------------------------------
// AI helpers
// ---------------------------------------------------------------------------

export function getAiUnitIds(state: GameState, factionId: string): string[] {
  return Array.from(state.units.values())
    .filter((unit) => unit.factionId === factionId && unit.hp > 0)
    .sort((left, right) => {
      if (left.status !== right.status) {
        return left.status === 'ready' ? -1 : 1;
      }
      return left.id.localeCompare(right.id);
    })
    .map((unit) => unit.id);
}

// ---------------------------------------------------------------------------
// Name helpers
// ---------------------------------------------------------------------------

export function getPrototypeName(state: GameState, prototypeId: string): string {
  return getPrototype(state, prototypeId)?.name ?? prototypeId;
}

export function getActiveFactionName(state: GameState): string {
  const activeFactionId = state.activeFactionId;
  if (!activeFactionId) {
    return 'no faction';
  }
  return state.factions.get(activeFactionId)?.name ?? activeFactionId;
}
