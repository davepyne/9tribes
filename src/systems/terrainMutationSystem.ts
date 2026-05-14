// Terrain Mutation — runtime conversion of a map hex's terrain id.
//
// Used by:
//   - Oasis (Camel Adaptation T3 native): convert a 2-hex radius to desert.
//   - Sapling (Nature Healing T3 native): convert a kill-target hex to forest.
//
// Design notes:
//   - We mutate `state.map.tiles` directly. Movement cost, defense modifier,
//     vision, and ecology research all read from `tile.terrain`, so every
//     downstream system picks up the change for free.
//   - Mutation is one-way: there is no automatic reversal. Counter-play
//     (cleanse, scorch, etc.) is a separate explicit mechanic for a later
//     pass; until then, mutated hexes persist for the rest of the game.
//   - The original terrain is NOT preserved. If we ever need reversibility
//     we will add a sibling `terrainOverrides` overlay layer; for now,
//     simplicity wins.
//   - Stacking: last-write-wins. A Sapling forest declared on a hex that
//     was previously Oasis-converted to desert simply becomes forest.

import { hexToKey } from '../core/grid.js';
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
  for (const [key, tile] of newTiles) {
    const dq = tile.position.q - center.q;
    const dr = tile.position.r - center.r;
    // Hex distance via cube coordinates
    const distance = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
    if (distance > radius) continue;
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
