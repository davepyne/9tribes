import type { GameState } from '../../game/types.js';
import type { FactionId, UnitId } from '../../types.js';
import type { Unit } from '../../features/units/types.js';
import { hexDistance } from '../../core/grid.js';
import type { SimulationTrace } from './traceTypes.js';
import { log } from './traceRecorder.js';
import { getTerrainAt } from './environmentalEffects.js';

export function applyWarlordAura(
  state: GameState,
  factionId: FactionId,
  _registry: unknown,
  trace?: SimulationTrace,
): GameState {
  const faction = state.factions.get(factionId);
  if (!faction) return state;

  const auraRadius = 3;
  const moraleBoost = 10;

  const warlordUnits: Unit[] = [];
  for (const unitId of faction.unitIds) {
    const unit = state.units.get(unitId);
    if (!unit || unit.hp <= 0) continue;
    const protoTags = state.prototypes.get(unit.prototypeId)?.tags ?? [];
    if (protoTags.includes('warlord')) {
      warlordUnits.push(unit);
    }
  }

  if (warlordUnits.length === 0) return state;

  const unitsMap = new Map(state.units);
  let anyBuffed = false;

  for (const warlord of warlordUnits) {
    for (const [unitId, unit] of unitsMap) {
      if (unit.hp <= 0 || unit.factionId !== factionId) continue;

      const dist = hexDistance(warlord.position, unit.position);
      if (dist > auraRadius) continue;

      const protoTags = state.prototypes.get(unit.prototypeId)?.tags ?? [];
      if (!protoTags.includes('cavalry') && !protoTags.includes('mounted')) continue;

      const newMorale = Math.min(100, unit.morale + moraleBoost);
      if (newMorale !== unit.morale) {
        unitsMap.set(unitId, { ...unit, morale: newMorale });
        anyBuffed = true;
      }
    }
  }

  if (anyBuffed) {
    log(trace, `${faction.name}'s Warlord Command aura buffed nearby cavalry/mounted units`);
  }

  return { ...state, units: unitsMap };
}

export function applyHillEngineering(state: GameState, factionId: FactionId): GameState {
  const faction = state.factions.get(factionId);
  if (!faction || faction.identityProfile?.passiveTrait !== 'hill_engineering') return state;

  const hillUnits = new Map(state.units);
  for (const unitIdStr of faction.unitIds) {
    const unit = hillUnits.get(unitIdStr as UnitId);
    if (!unit || unit.hp <= 0 || getTerrainAt(state, unit.position) !== 'hill') continue;
    if (unit.movesRemaining === unit.maxMoves) {
      const newStacks = Math.min((unit.digInStacks ?? 0) + 1, 3);
      hillUnits.set(unitIdStr as UnitId, {
        ...unit,
        digInStacks: newStacks,
        hillDugIn: newStacks > 0,
      });
    } else {
      hillUnits.set(unitIdStr as UnitId, {
        ...unit,
        digInStacks: 0,
        hillDugIn: false,
      });
    }
  }
  return { ...state, units: hillUnits };
}
