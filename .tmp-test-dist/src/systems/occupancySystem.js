import { hexToKey } from '../core/grid.js';
/**
 * Build a map of hex key -> unit id for quick occupancy lookup
 */
export function buildOccupancyMap(gameState) {
    const occupancy = new Map();
    for (const [unitId, unit] of gameState.units) {
        const key = hexToKey(unit.position);
        occupancy.set(key, unitId);
    }
    return occupancy;
}
/**
 * Get the unit ID at a specific hex, if any
 */
export function getUnitAtHex(gameState, hex) {
    const key = hexToKey(hex);
    for (const [unitId, unit] of gameState.units) {
        if (hexToKey(unit.position) === key) {
            return unitId;
        }
    }
    return undefined;
}
/**
 * Check if a hex is occupied by any unit
 */
export function isHexOccupied(gameState, hex) {
    return getUnitAtHex(gameState, hex) !== undefined;
}
/**
 * Check if a hex is occupied by a specific faction's unit
 */
export function isHexOccupiedByFaction(gameState, hex, factionId) {
    const unitId = getUnitAtHex(gameState, hex);
    if (!unitId)
        return false;
    const unit = gameState.units.get(unitId);
    return unit?.factionId === factionId;
}
