// Tile access utilities
import { hexToKey } from '../../core/grid.js';
/**
 * Get tile at given coordinates
 */
export function getTile(map, coord) {
    return map.tiles.get(hexToKey(coord));
}
/**
 * Get tile by string key (format: "q,r")
 */
export function getTileByKey(map, key) {
    return map.tiles.get(key);
}
/**
 * Check if a tile exists at given coordinates
 */
export function hasTile(map, coord) {
    return map.tiles.has(hexToKey(coord));
}
