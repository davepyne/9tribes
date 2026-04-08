// Map creation utilities

import type { GameMap } from './types.js';
import { hexToKey } from '../../core/grid.js';

/**
 * Create an empty map with all tiles set to plains
 */
export function createMap(width: number, height: number): GameMap {
  const tiles = new Map<string, { position: { q: number; r: number }; terrain: 'plains'; improvementId?: undefined; unitId?: undefined }>();
  
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
