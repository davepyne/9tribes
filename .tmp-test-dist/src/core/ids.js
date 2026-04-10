// Branded ID factory functions for type-safe identifiers
// Uses nominal typing pattern to prevent ID mixing
// Counter-based ID generation (deterministic within a session)
// For cross-session determinism, use IDs from game state serialization
let idCounter = 0;
const resetCounter = (value = 0) => {
    idCounter = value;
};
// Format: {prefix}_{counter} - simple and deterministic
const generateId = (prefix) => {
    idCounter += 1;
    return `${prefix}_${idCounter}`;
};
// Branded ID factories - cast string to branded type
export const createFactionId = (id) => (id ?? generateId('faction'));
export const createUnitId = (id) => (id ?? generateId('unit'));
export const createCityId = (id) => (id ?? generateId('city'));
export const createPrototypeId = (id) => (id ?? generateId('prototype'));
export const createImprovementId = (id) => (id ?? generateId('improvement'));
export const createChassisId = (id) => (id ?? generateId('chassis'));
export const createComponentId = (id) => (id ?? generateId('component'));
export const createResearchNodeId = (id) => (id ?? generateId('research'));
export const createVillageId = (id) => (id ?? generateId('village'));
// Type guards for runtime validation
export const isFactionId = (value) => typeof value === 'string' && value.startsWith('faction_');
export const isUnitId = (value) => typeof value === 'string' && value.startsWith('unit_');
export const isCityId = (value) => typeof value === 'string' && value.startsWith('city_');
export const isPrototypeId = (value) => typeof value === 'string' && value.startsWith('prototype_');
export const isImprovementId = (value) => typeof value === 'string' && value.startsWith('improvement_');
export const isChassisId = (value) => typeof value === 'string' && value.startsWith('chassis_');
export const isComponentId = (value) => typeof value === 'string' && value.startsWith('component_');
export const isResearchNodeId = (value) => typeof value === 'string' && value.startsWith('research_');
export const isVillageId = (value) => typeof value === 'string' && value.startsWith('village_');
// Export for testing - allows resetting counter between tests
export const _resetIdCounter = resetCounter;
