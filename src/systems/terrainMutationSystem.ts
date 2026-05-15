// Terrain Mutation — one-way runtime conversion of map hex terrain.
// Used by Oasis (desert radius) and Sapling (forest on kill hex).

import { hexToKey, getHexesInRange } from '../core/grid.js';
import type { GameState, HexCoord } from '../game/types.js';
import type { TerrainType } from '../world/map/types.js';

/**
 * Convert a single hex's terrain id. Returns the (possibly new) state, or
 * the original state unchanged if no map is loaded or the hex doesn't exist.
 */
export function setTerrainAt(state: GameState, hex: HexCoord, terrain: TerrainType): GameState {
  if (!state.map) return state;
  const key = hexToKey(hex);
  const tile = state.map.tiles.get(key);
  if (!tile) return state;
  if (tile.terrain === terrain) return state;

  const newTiles = new Map(state.map.tiles);
  newTiles.set(key, { ...tile, terrain });
  return {
    ...state,
    map: {
      ...state.map,
      tiles: newTiles,
    },
  };
}

/**
 * Convert a hex and all hexes within `radius` to `terrain`. Used by Oasis
 * (radius 2 → desert). Skips hexes that aren't on the map.
 *
 * Mutates as a single atomic state transition (one new tiles map, one new
 * GameState).
 */
export function setTerrainInRadius(
  state: GameState,
  center: HexCoord,
  radius: number,
  terrain: TerrainType,
): GameState {
  if (!state.map) return state;
  const newTiles = new Map(state.map.tiles);
  let dirty = false;
  for (const hex of getHexesInRange(center, radius)) {
    const key = hexToKey(hex);
    const tile = newTiles.get(key);
    if (!tile) continue;
    if (tile.terrain === terrain) continue;
    newTiles.set(key, { ...tile, terrain });
    dirty = true;
  }
  if (!dirty) return state;
  return {
    ...state,
    map: {
      ...state.map,
      tiles: newTiles,
    },
  };
}
