import type { GameState } from './types.js';
import { createRNG, type RNGState } from '../core/rng.js';

/**
 * Creates a minimal empty game state with:
 * - The provided seed
 * - Round 1, turn 1
 * - No active faction (null)
 * - Status "in_progress"
 * - Empty Maps for all entities
 * - Fresh RNG state from seed
 */
export function createEmptyGameState(seed: number): GameState {
  return {
    seed,
    round: 1,
    turnNumber: 1,
    activeFactionId: null,
    status: 'in_progress',
    factions: new Map(),
    units: new Map(),
    cities: new Map(),
    villages: new Map(),
    prototypes: new Map(),
    improvements: new Map(),
    research: new Map(),
    economy: new Map(),
    warExhaustion: new Map(),
    factionStrategies: new Map(),
    poisonTraps: new Map(),
    contaminatedHexes: new Set(),
    transportMap: new Map(),
    villageCaptureCooldowns: new Map(),
    fogState: new Map(),
    rngState: createRNG(seed)
  };
}