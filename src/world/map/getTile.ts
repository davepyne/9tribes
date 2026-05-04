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
