// Hex grid math — 6-directional (pointy-top isometric)
// Coordinate type: TileCoord { q, r } on an axial hex grid.
// Screen projection: x = (q-r)*HALF_W, y = (q+r)*HALF_H.
// Property names q/r preserved from old HexCoord to avoid property-access churn.

import type { TileCoord } from '../types.js';

// 6 hex directions: N, NE, SE, S, SW, NW (clockwise from North)
const HEX_DIRECTIONS: TileCoord[] = [
  { q: -1, r: -1 }, // N
  { q:  0, r: -1 }, // NE
  { q:  1, r:  0 }, // SE
  { q:  1, r:  1 }, // S
  { q:  0, r:  1 }, // SW
  { q: -1, r:  0 }, // NW
];

export const DIRECTION_COUNT = HEX_DIRECTIONS.length;

/** All 6 adjacent hexes */
export const getNeighbors = (coord: TileCoord): TileCoord[] =>
  HEX_DIRECTIONS.map(dir => ({
    q: coord.q + dir.q,
    r: coord.r + dir.r,
  }));

export const getDirectionVector = (direction: number): TileCoord =>
  HEX_DIRECTIONS[((direction % DIRECTION_COUNT) + DIRECTION_COUNT) % DIRECTION_COUNT];

/** Returns the direction index (0–5) from `from` to an adjacent `to`, or null if not a direct neighbor */
export const getDirectionIndex = (from: TileCoord, to: TileCoord): number | null => {
  const dq = to.q - from.q;
  const dr = to.r - from.r;
  const index = HEX_DIRECTIONS.findIndex(dir => dir.q === dq && dir.r === dr);
  return index === -1 ? null : index;
};

/** Opposite direction: (dir + 3) % 6 */
export const getOppositeDirection = (direction: number): number =>
  (direction + 3) % DIRECTION_COUNT;

/**
 * Hex distance on an axial hex grid.
 * When dq and dr have the same sign, diagonal steps cover both axes
 * (each step moves one q AND one r). Otherwise steps must zigzag.
 */
export const tileDistance = (a: TileCoord, b: TileCoord): number => {
  const dq = b.q - a.q;
  const dr = b.r - a.r;
  if (dq * dr > 0) {
    return Math.max(Math.abs(dq), Math.abs(dr));
  }
  return Math.abs(dq) + Math.abs(dr);
};

/** Convert tile coordinate to string key */
export const tileToKey = (coord: TileCoord): string => `${coord.q},${coord.r}`;

/** Parse string key back to tile coordinate */
export const keyToTile = (key: string): TileCoord => {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
};

/**
 * All tiles within hex range of center.
 * At range 1: 7 tiles (center + 6 neighbors).
 * At range 2: 19 tiles.
 */
export const getHexesInRange = (center: TileCoord, range: number): TileCoord[] => {
  const results: TileCoord[] = [];
  for (let dq = -range; dq <= range; dq++) {
    for (let dr = -range; dr <= range; dr++) {
      if (tileDistance(center, { q: center.q + dq, r: center.r + dr }) <= range) {
        results.push({ q: center.q + dq, r: center.r + dr });
      }
    }
  }
  return results;
};

/**
 * Trace `steps` hexes in a straight line, starting one hex beyond `origin`,
 * heading in the direction *away from* `toward`. Origin itself is not included.
 */
export function hexLineAwayFrom(origin: TileCoord, toward: TileCoord, steps: number): TileCoord[] {
  if (steps <= 0) return [];
  const dq = origin.q - toward.q;
  const dr = origin.r - toward.r;
  const n = tileDistance(origin, toward);
  if (n === 0) return [];
  const stepQ = dq / n;
  const stepR = dr / n;
  const result: TileCoord[] = [];
  for (let i = 1; i <= steps; i++) {
    result.push(roundHex(origin.q + stepQ * i, origin.r + stepR * i));
  }
  return result;
}

/** Round fractional axial coordinates to the nearest hex (cube-coordinate rounding). */
function roundHex(q: number, r: number): TileCoord {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  let rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) {
    rq = -rr - rs;
  } else if (dr > ds) {
    rr = -rq - rs;
  }
  return { q: rq, r: rr };
}

// ---------------------------------------------------------------------------
// Backwards-compatible aliases from hex.ts migration — kept because these
// names are used pervasively across the codebase.
// ---------------------------------------------------------------------------
export const hexDistance = tileDistance;
export const hexToKey    = tileToKey;
export const keyToHex    = keyToTile;
export const HEX_DIRECTION_COUNT = DIRECTION_COUNT;
