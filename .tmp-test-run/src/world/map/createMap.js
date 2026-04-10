// Map creation utilities
import { hexToKey } from '../../core/grid.js';
/**
 * Create an empty map with all tiles set to plains
 */
export function createMap(width, height) {
    const tiles = new Map();
    // Fill with plains tiles in a rectangular pattern
    for (let q = 0; q < width; q++) {
        for (let r = 0; r < height; r++) {
            const key = hexToKey({ q, r });
            tiles.set(key, {
                position: { q, r },
                terrain: 'plains',
            });
        }
    }
    return { width, height, tiles };
}
