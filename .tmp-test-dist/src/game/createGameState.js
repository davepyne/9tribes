import { createRNG } from '../core/rng.js';
/**
 * Creates a minimal empty game state with:
 * - The provided seed
 * - Round 1, turn 1
 * - No active faction (null)
 * - Status "in_progress"
 * - Empty Maps for all entities
 * - Fresh RNG state from seed
 */
export function createEmptyGameState(seed) {
    return {
        seed,
        round: 1,
        turnNumber: 1,
        activeFactionId: null,
        status: 'in_progress',
        factions: new Map(),
        factionResearch: new Map(),
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
/**
 * Creates a game state for a scenario.
 * For MVP, this delegates to createEmptyGameState.
 * Will be expanded in Phase 10 (Scenario System).
 */
export function createScenarioState(seed, scenarioConfig) {
    // MVP: Just create an empty state
    // Phase 10: Expand to use scenarioConfig for initial setup
    return createEmptyGameState(seed);
}
