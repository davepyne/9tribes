import type { GameState, FactionId } from '../game/types.js';
import type { RulesRegistry } from '../data/registry/types.js';
import type { DifficultyLevel } from './aiDifficulty.js';
import type { SimulationTrace } from './warEcologySimulation.js';
import { processFactionPhases } from './warEcologySimulation.js';

export interface FactionPhaseOptions {
  trace?: SimulationTrace;
  difficulty?: DifficultyLevel;
}

export function runFactionPhase(
  state: GameState,
  factionId: FactionId,
  registry: RulesRegistry,
  options: FactionPhaseOptions = {},
): GameState {
  return processFactionPhases(state, factionId, registry, options.trace, options.difficulty);
}
