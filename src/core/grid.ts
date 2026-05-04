// Square isometric grid math — 8-directional (Civ II default)
// Replaces hex.ts. Coordinate type: TileCoord { q, r } where q=x, r=y on a square grid.
// Property names q/r are preserved from the old HexCoord to avoid property-access churn.

import type { TileCoord } from '../types.js';

// 8 directions: N, NE, E, SE, S, SW, W, NW (clockwise from North)
const ISO_DIRECTIONS: TileCoord[] = [
  { q:  0, r: -1 }, // N
  { q:  1, r: -1 }, // NE
  { q:  1, r:  0 }, // E
  { q:  1, r:  1 }, // SE
  { q:  0, r:  1 }, // S
  { q: -1, r:  1 }, // SW
  { q: -1, r:  0 }, // W
  { q: -1, r: -1 }, // NW
];

export const DIRECTION_COUNT = ISO_DIRECTIONS.length;

/** All 8 adjacent tiles */
export const getNeighbors = (coord: TileCoord): TileCoord[] =>
  ISO_DIRECTIONS.map(dir => ({
    q: coord.q + dir.q,
    r: coord.r + dir.r,
  }));

export const getDirectionVector = (direction: number): TileCoord =>
  ISO_DIRECTIONS[((direction % DIRECTION_COUNT) + DIRECTION_COUNT) % DIRECTION_COUNT];

/** Returns the direction index (0–7) from `from` to an adjacent `to`, or null if not a direct neighbor */
export const getDirectionIndex = (from: TileCoord, to: TileCoord): number | null => {
  const dq = to.q - from.q;
  const dr = to.r - from.r;
  const index = ISO_DIRECTIONS.findIndex(dir => dir.q === dq && dir.r === dr);
  return index === -1 ? null : index;
};

/** Opposite direction: (dir + 4) % 8 */
export const getOppositeDirection = (direction: number): number =>
  (direction + 4) % DIRECTION_COUNT;

/**
 * Chebyshev distance — matches movement cost semantics:
 * adjacent tiles are distance 1, diagonals are also distance 1.
 */
export const tileDistance = (a: TileCoord, b: TileCoord): number =>
  Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r));

/** Convert tile coordinate to string key */
export const tileToKey = (coord: TileCoord): string => `${coord.q},${coord.r}`;

/** Parse string key back to tile coordinate */
export const keyToTile = (key: string): TileCoord => {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
};

/**
 * All tiles within Chebyshev range (a square of side 2*range+1).
 * At range 1: 9 tiles. At range 2: 25 tiles.
 */
export const getHexesInRange = (center: TileCoord, range: number): TileCoord[] => {
  const results: TileCoord[] = [];
  for (let dq = -range; dq <= range; dq++) {
    for (let dr = -range; dr <= range; dr++) {
      results.push({ q: center.q + dq, r: center.r + dr });
    }
  }
  return results;
};

// ---------------------------------------------------------------------------
// Backwards-compatible aliases from hex.ts migration — kept because these
// names are used pervasively across the codebase.
// ---------------------------------------------------------------------------
export const hexDistance = tileDistance;
export const hexToKey    = tileToKey;
export const keyToHex    = keyToTile;
export const HEX_DIRECTION_COUNT = DIRECTION_COUNT;
