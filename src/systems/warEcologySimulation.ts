import { activateUnit } from './unitActivationSystem.js';
import {
  buildActivationQueue,
  nextUnitActivation,
  resetAllUnitsForRound,
} from './turnSystem.js';
import { resetCombatRecordStreaks } from './historySystem.js';
import type { GameState } from '../game/types.js';
import type { FactionId } from '../types.js';
import type { RulesRegistry } from '../data/registry/types.js';
import type { DifficultyLevel } from './aiDifficulty.js';

// Re-export from submodules for backward compatibility
export type { SimulationTrace, TurnSnapshot, VictoryType, VictoryStatus } from './simulation/traceTypes.js';
export type {
  TraceLogEvent,
  TraceCombatEvent,
  TraceCombatBreakdown,
  TraceCombatUnitBreakdown,
  TraceCombatModifiers,
  TraceCombatMoraleBreakdown,
  TraceCombatOutcomeBreakdown,
  TraceCombatEffect,
  TraceSiegeEvent,
  TraceAiIntentEvent,
  TraceFactionStrategyEvent,
  TraceAbilityLearnedEvent,
  TraceUnitSacrificedEvent,
} from './simulation/traceTypes.js';
export { createSimulationTrace, log, recordCombatEvent, recordAiIntent, recordAbilityLearned, recordUnitSacrificed } from './simulation/traceRecorder.js';
export { getVictoryStatus, isFactionEliminated } from './simulation/victory.js';
export { getAliveFactions } from './simulation/victory.js';
export { processFactionPhases } from './simulation/factionTurnEffects.js';
export { summarizeFaction } from './simulation/summarizeFaction.js';
export { occupiesFriendlySettlement } from './simulation/environmentalEffects.js';
export { getSynergyEngine, calculateSynergyAttackBonus, calculateSynergyDefenseBonus } from './synergyRuntime.js';

import { recordSnapshot, maybeRecordEndSnapshot } from './simulation/traceRecorder.js';
import { getVictoryStatus, getAliveFactions } from './simulation/victory.js';
import { processFactionPhases, tickDecoyState } from './simulation/factionTurnEffects.js';
import { tickZoneEffectLifetimes } from './zoneEffectSystem.js';
import { detectAndSpawnToxicBlooms, cleanseToxicBlooms } from './toxicBloomSystem.js';


export function runWarEcologySimulation(
  initialState: GameState,
  registry: RulesRegistry,
  maxTurns: number,
  trace?: import('./simulation/traceTypes.js').SimulationTrace,
  difficulty?: DifficultyLevel,
): GameState {
  let current: GameState = {
    ...initialState,
    factions: new Map(initialState.factions),
    units: new Map(initialState.units),
    cities: new Map(initialState.cities),
    villages: new Map(initialState.villages),
    prototypes: new Map(initialState.prototypes),
    improvements: new Map(initialState.improvements),
    research: new Map(initialState.research),
    economy: new Map(initialState.economy),
    factionStrategies: new Map(initialState.factionStrategies),
    poisonTraps: new Map(initialState.poisonTraps),
    fogState: new Map(initialState.fogState),
    transportMap: new Map(initialState.transportMap),
    villageCaptureCooldowns: new Map(initialState.villageCaptureCooldowns),
    contaminatedHexes: new Set(initialState.contaminatedHexes),
    zoneEffects: new Map(initialState.zoneEffects),
  };
  let roundsCompleted = 0;

  while (roundsCompleted < maxTurns && getAliveFactions(current).size > 1) {
    const roundStartVictory = getVictoryStatus(current);
    if (roundStartVictory.victoryType !== 'unresolved') {
      return current;
    }

    if (trace) {
      trace.currentRound = current.round;
    }

    current = resetAllUnitsForRound(current);
    recordSnapshot(current, trace, 'start');

    for (const factionId of current.factions.keys()) {
      if (!getAliveFactions(current).has(factionId)) {
        continue;
      }
      current = processFactionPhases(current, factionId, registry, trace, difficulty);
      const phaseVictory = getVictoryStatus(current);
      if (phaseVictory.victoryType !== 'unresolved') {
        maybeRecordEndSnapshot(current, trace);
        return current;
      }
    }

    if (getVictoryStatus(current).victoryType !== 'unresolved') {
      maybeRecordEndSnapshot(current, trace);
      break;
    }

    const activation = buildActivationQueue(current);
    const fortsBuiltThisRound = new Set<FactionId>();

    while (true) {
      const nextActivation = nextUnitActivation(current, activation);
      if (!nextActivation) {
        break;
      }

      current = activateUnit(
        current,
        nextActivation.unitId,
        registry,
        {
          trace,
          fortsBuiltThisRound,
          combatMode: 'apply',
        },
      ).state;

      if (getVictoryStatus(current).victoryType !== 'unresolved') {
        maybeRecordEndSnapshot(current, trace);
        return current;
      }
    }

    for (const factionId of current.factions.keys()) {
      current = resetCombatRecordStreaks(current, factionId);
    }

    maybeRecordEndSnapshot(current, trace);

    // Tick zone-effect lifetimes at the same logical point as turnSystem.ts
    // (on round rollover, before the round counter advances). Run the Toxic
    // Bloom passes in the same order as turnSystem.ts: tick → cleanse →
    // detect, so re-spawn is consistent across both round-rollover paths.
    current = tickZoneEffectLifetimes(current);
    current = tickDecoyState(current);
    current = cleanseToxicBlooms(current);
    current = detectAndSpawnToxicBlooms(current);

    current = {
      ...current,
      round: current.round + 1,
    };
    if (trace) {
      trace.currentRound = current.round;
    }
    roundsCompleted += 1;
  }

  return current;
}
