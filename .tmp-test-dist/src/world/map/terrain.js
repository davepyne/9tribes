// Terrain definitions and utilities
// Terrain definitions registry
export const TERRAIN_DEFINITIONS = {
    plains: {
        id: 'plains',
        name: 'Plains',
        movementCost: 1,
        defenseBonus: 0,
    },
    forest: {
        id: 'forest',
        name: 'Forest',
        movementCost: 2,
        defenseBonus: 1,
    },
    jungle: {
        id: 'jungle',
        name: 'Jungle',
        movementCost: 3,
        defenseBonus: 2,
    },
    hill: {
        id: 'hill',
        name: 'Hill',
        movementCost: 2,
        defenseBonus: 1,
    },
    desert: {
        id: 'desert',
        name: 'Desert',
        movementCost: 2,
        defenseBonus: -1,
    },
    tundra: {
        id: 'tundra',
        name: 'Tundra',
        movementCost: 2,
        defenseBonus: 0,
    },
    savannah: {
        id: 'savannah',
        name: 'Savannah',
        movementCost: 1,
        defenseBonus: 0,
    },
    coast: {
        id: 'coast',
        name: 'Coast',
        movementCost: 2,
        defenseBonus: 0,
    },
    river: {
        id: 'river',
        name: 'River',
        movementCost: 2,
        defenseBonus: 0,
    },
    swamp: {
        id: 'swamp',
        name: 'Swamp',
        movementCost: 3,
        defenseBonus: 0,
    },
    ocean: {
        id: 'ocean',
        name: 'Ocean',
        movementCost: 1,
        defenseBonus: 0,
        passable: false,
    },
};
/**
 * Get terrain definition by terrain type
 */
export function getTerrainDef(terrainType) {
    return TERRAIN_DEFINITIONS[terrainType];
}
