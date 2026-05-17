import type { GameState } from '../../game/types.js';
import type { FactionId, UnitId } from '../../types.js';
import type { RulesRegistry } from '../../data/registry/types.js';
import type { SimulationTrace } from './traceTypes.js';
import { log } from './traceRecorder.js';

export function tickSummonState(
  state: GameState,
  factionId: FactionId,
  registry: RulesRegistry,
  trace?: SimulationTrace,
): GameState {
  const faction = state.factions.get(factionId);
  if (!faction) return state;

  const abilities = registry.getSignatureAbility(factionId);
  if (!abilities) return state;

  const summonConfig = abilities.summon;
  if (!summonConfig) return state;

  const summonDuration = abilities.summonDuration ?? 5;
  const cooldownDuration = abilities.cooldownDuration ?? 5;

  let summonState = faction.summonState ?? {
    summoned: false,
    turnsRemaining: 0,
    cooldownRemaining: 4,
    unitId: null,
  };

  if (summonState.summoned && summonState.unitId) {
    summonState = {
      ...summonState,
      turnsRemaining: summonState.turnsRemaining - 1,
    };

    if (summonState.turnsRemaining <= 0 && summonState.unitId) {
      const units = new Map(state.units);
      units.delete(summonState.unitId);

      const updatedFaction = {
        ...faction,
        unitIds: faction.unitIds.filter(id => id !== summonState.unitId),
        summonState: {
          ...summonState,
          summoned: false,
          unitId: null,
          cooldownRemaining: cooldownDuration,
        },
      };
      const factions = new Map(state.factions);
      factions.set(factionId, updatedFaction);

      log(trace, `${faction.name}'s ${summonConfig.name} expired`);
      return { ...state, units, factions };
    }
  } else if (summonState.cooldownRemaining > 0) {
    summonState = {
      ...summonState,
      cooldownRemaining: summonState.cooldownRemaining - 1,
    };
  }

  if (faction.summonState !== summonState) {
    const updatedFaction = { ...faction, summonState };
    const factions = new Map(state.factions);
    factions.set(factionId, updatedFaction);
    return { ...state, factions };
  }

  return state;
}
