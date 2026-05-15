import { getDirectionIndex, hexDistance, hexToKey } from '../../core/grid.js';
import type { GameState, UnitId } from '../../game/types.js';
import type { Unit } from '../../features/units/types.js';
import type { HexCoord } from '../../types.js';
import type { RulesRegistry } from '../../data/registry/types.js';
import { resolveCapabilityDoctrine } from '../capabilityDoctrine.js';
import { getPrototype } from '../../game/stateAccess.js';
import { clearPreparedAbility } from '../abilitySystem.js';
import { applyKnockback } from '../signatureAbilitySystem.js';
import { destroyTransport, isTransportUnit } from '../transportSystem.js';
import { hasCaptureAbility } from '../captureSystem.js';
import { isWaterTerrain } from '../terrainUtils.js';
import { resolveEffectiveSynergies } from '../synergyRuntime.js';

export function getImprovementBonus(state: GameState, position: { q: number; r: number }, factionId?: string) {
  for (const improvement of state.improvements.values()) {
    if (improvement.position.q === position.q && improvement.position.r === position.r) {
      const base = improvement.defenseBonus ?? 0;
      if (factionId === 'hill_clan' && improvement.type === 'fortification') return Math.max(base, 3);
      return base;
    }
  }
  for (const city of state.cities.values()) {
    if (city.position.q === position.q && city.position.r === position.r) {
      return 1;
    }
  }
  for (const village of state.villages.values()) {
    if (village.position.q === position.q && village.position.r === position.r) {
      return 0.5;
    }
  }

  // Citadel (fortress+nature_healing): units with countsAsCity synergy get city defense bonus
  if (factionId) {
    for (const [, unit] of state.units) {
      if (unit.position.q !== position.q || unit.position.r !== position.r) continue;
      if (unit.factionId !== factionId || unit.hp <= 0) continue;
      const proto = state.prototypes.get(unit.prototypeId);
      const tags = proto?.tags ?? [];
      const faction = state.factions.get(unit.factionId);
      const synergies = resolveEffectiveSynergies(faction, tags);
      if (synergies.some(s => s.effects.some(e => e.kind === 'setFlag' && (e as { flag: string }).flag === 'countsAsCity'))) {
        return 1;
      }
    }
  }

  return 0;
}

export function removeDeadUnitsFromFactions(factions: GameState['factions'], units: GameState['units']) {
  const nextFactions = new Map(factions);
  for (const [factionId, faction] of nextFactions.entries()) {
    nextFactions.set(factionId, {
      ...faction,
      unitIds: faction.unitIds.filter((unitId) => units.has(unitId as UnitId)),
    });
  }
  return nextFactions;
}

export function canAttackTarget(state: GameState, registry: RulesRegistry, attacker: Unit, defender: Unit): boolean {
  const attackerPrototype = getPrototype(state, attacker.prototypeId);
  if (!attackerPrototype) {
    return false;
  }

  const attackRange = attackerPrototype.derivedStats.range ?? 1;
  if (hexDistance(attacker.position, defender.position) > attackRange) {
    return false;
  }

  const chassis = registry.getChassis(attackerPrototype.chassisId);
  const isNavalUnit = chassis?.movementClass === 'naval';
  if (!isNavalUnit) {
    return true;
  }

  const faction = state.factions.get(attacker.factionId);
  const doctrine = faction
    ? resolveCapabilityDoctrine(state.research.get(attacker.factionId), faction)
    : undefined;
  if (doctrine?.amphibiousAssaultEnabled === true) {
    return true;
  }

  // Amphibious-tagged naval units can attack land targets
  const isAmphibious = attackerPrototype.tags?.includes('amphibious') ?? false;
  if (isAmphibious) {
    return true;
  }
  // Capture-capable naval units (e.g. Slave Galley) can target land units.
  if (hasCaptureAbility(attackerPrototype, registry)) {
    return true;
  }

  const defenderTerrain = state.map?.tiles.get(hexToKey(defender.position))?.terrain ?? '';
  return isWaterTerrain(defenderTerrain);
}

export function rotateUnitToward(unit: Unit, target: HexCoord): Unit {
  const facing = getDirectionIndex(unit.position, target);
  if (facing === null) {
    return unit;
  }
  return { ...unit, facing };
}

export function writeUnitToState(state: GameState, unit: Unit | undefined): GameState {
  if (!unit) {
    return state;
  }

  const units = new Map(state.units);
  if (unit.hp <= 0) {
    units.delete(unit.id);
  } else {
    units.set(unit.id, unit);
  }
  return {
    ...state,
    units,
    factions: removeDeadUnitsFromFactions(state.factions, units),
  };
}

export function pruneDeadUnits(state: GameState): GameState {
  let removedAny = false;
  const units = new Map<UnitId, Unit>();
  for (const [unitId, unit] of state.units) {
    if (unit.hp > 0) {
      units.set(unitId, unit);
    } else {
      removedAny = true;
    }
  }

  if (!removedAny) {
    return state;
  }

  return {
    ...state,
    units,
    factions: removeDeadUnitsFromFactions(state.factions, units),
  };
}

export function applyKnockbackDistance(
  state: GameState,
  attackerId: UnitId,
  defenderId: UnitId,
  distance: number,
  collisionDamage = 0,
): { state: GameState; appliedDistance: number; collisionDamageApplied: number } {
  let current = state;
  let appliedDistance = 0;
  let collisionDamageApplied = 0;

  for (let step = 0; step < distance; step += 1) {
    const attacker = current.units.get(attackerId);
    const defender = current.units.get(defenderId);
    if (!attacker || !defender) {
      break;
    }

    const knockbackHex = applyKnockback(current, attacker, defender, 1);
    if (!knockbackHex) {
      // Blocked by obstacle or occupied hex — apply collision damage
      if (collisionDamage > 0 && defender.hp > 0) {
        const afterCollision = current.units.get(defenderId);
        if (afterCollision && afterCollision.hp > 0) {
          current = writeUnitToState(current, {
            ...afterCollision,
            hp: Math.max(0, afterCollision.hp - collisionDamage),
          });
          collisionDamageApplied = collisionDamage;
        }
      }
      break;
    }

    current = writeUnitToState(current, {
      ...defender,
      position: knockbackHex,
    });
    appliedDistance += 1;
  }

  return { state: current, appliedDistance, collisionDamageApplied };
}

export function createCombatActionPreviewRecord(
  state: GameState,
  attackerId: UnitId,
  defenderId: UnitId,
  result: import('../combatSystem.js').CombatResult,
  triggeredEffects: import('./types.js').CombatActionEffect[],
  braceTriggered: boolean,
  attackerWasStealthed: boolean,
  details: import('./types.js').CombatActionPreviewDetails,
): import('./types.js').CombatActionPreview | null {
  const attacker = state.units.get(attackerId);
  const defender = state.units.get(defenderId);
  const attackerPrototype = attacker ? getPrototype(state, attacker.prototypeId) : null;
  const defenderPrototype = defender ? getPrototype(state, defender.prototypeId) : null;
  if (!attacker || !defender || !attackerPrototype || !defenderPrototype) {
    return null;
  }

  return {
    attackerId,
    defenderId,
    result,
    round: state.round,
    attackerFactionId: attacker.factionId,
    defenderFactionId: defender.factionId,
    attackerPrototypeName: attackerPrototype.name,
    defenderPrototypeName: defenderPrototype.name,
    triggeredEffects,
    braceTriggered,
    attackerWasStealthed,
    details,
  };
}

export function destroyTransportIfApplicable(
  state: GameState,
  unitId: UnitId,
  registry: RulesRegistry,
): GameState {
  const unit = state.units.get(unitId);
  if (!unit) return state;
  const proto = getPrototype(state, unit.prototypeId);
  if (proto && isTransportUnit(proto, registry)) {
    const destroyResult = destroyTransport(state, unit.id, state.transportMap);
    return { ...destroyResult.state, transportMap: destroyResult.transportMap };
  }
  return state;
}
