// Tile access utilities

import type { GameMap, Tile } from './types.js';
import type { HexCoord } from '../../types.js';
import { hexToKey } from '../../core/grid.js';

/**
 * Get tile at given coordinates
 */
export function getTile(map: GameMap, coord: HexCoord): Tile | undefined {
  return map.tiles.get(hexToKey(coord));
}

/**
 * Get tile by string key (format: "q,r")
 */
export function getTileByKey(map: GameMap, key: string): Tile | undefined {
  return map.tiles.get(key);
}

/**
 * Check if a tile exists at given coordinates
 */
export function hasTile(map: GameMap, coord: HexCoord): boolean {
  return map.tiles.has(hexToKey(coord));
}
