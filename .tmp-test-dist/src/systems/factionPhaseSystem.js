import { processFactionPhases } from './warEcologySimulation.js';
export function runFactionPhase(state, factionId, registry, options = {}) {
    return processFactionPhases(state, factionId, registry, options.trace, options.difficulty);
}
