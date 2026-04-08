// Hex coordinate math using axial coordinate system
// Reference: https://www.redblobgames.com/grids/hexagons/

import type { HexCoord } from '../types.js';

// Cube coordinate for hex calculations (x + y + z = 0)
interface CubeCoord {
  x: number;
  y: number;
  z: number;
}

// Direction vectors for axial neighbors (6 directions)
const AXIAL_DIRECTIONS: HexCoord[] = [
  { q: 1, r: 0 },   // East
  { q: 1, r: -1 },  // Northeast
  { q: 0, r: -1 },  // Northwest
  { q: -1, r: 0 },  // West
  { q: -1, r: 1 },  // Southwest
  { q: 0, r: 1 },   // Southeast
];

export const HEX_DIRECTION_COUNT = AXIAL_DIRECTIONS.length;

/**
 * Convert axial coordinates to cube coordinates
 */
export const axialToCube = (coord: HexCoord): CubeCoord => ({
  x: coord.q,
  y: -coord.q - coord.r,
  z: coord.r,
});

/**
 * Convert cube coordinates to axial coordinates
 */
export const cubeToAxial = (cube: CubeCoord): HexCoord => ({
  q: cube.x,
  r: cube.z,
});

/**
 * Get all 6 neighboring hex coordinates
 */
export const getNeighbors = (coord: HexCoord): HexCoord[] =>
  AXIAL_DIRECTIONS.map(dir => ({
    q: coord.q + dir.q,
    r: coord.r + dir.r,
  }));

export const getDirectionVector = (direction: number): HexCoord =>
  AXIAL_DIRECTIONS[((direction % HEX_DIRECTION_COUNT) + HEX_DIRECTION_COUNT) % HEX_DIRECTION_COUNT];

export const getDirectionIndex = (from: HexCoord, to: HexCoord): number | null => {
  const dq = to.q - from.q;
  const dr = to.r - from.r;
  const index = AXIAL_DIRECTIONS.findIndex((dir) => dir.q === dq && dir.r === dr);
  return index === -1 ? null : index;
};

export const getOppositeDirection = (direction: number): number =>
  (direction + 3) % HEX_DIRECTION_COUNT;

/**
 * Calculate the distance between two hex coordinates
 */
export const hexDistance = (a: HexCoord, b: HexCoord): number => {
  const cubeA = axialToCube(a);
  const cubeB = axialToCube(b);
  return (
    Math.abs(cubeA.x - cubeB.x) +
    Math.abs(cubeA.y - cubeB.y) +
    Math.abs(cubeA.z - cubeB.z)
  ) / 2;
};

/**
 * Convert hex coordinate to string key for use in Maps/Sets
 */
export const hexToKey = (coord: HexCoord): string => `${coord.q},${coord.r}`;

/**
 * Parse string key back to hex coordinate
 */
export const keyToHex = (key: string): HexCoord => {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
};

/**
 * Get all hexes within a given range (including center)
 */
export const getHexesInRange = (center: HexCoord, range: number): HexCoord[] => {
  const results: HexCoord[] = [];
  
  for (let q = -range; q <= range; q++) {
    for (let r = Math.max(-range, -q - range); r <= Math.min(range, -q + range); r++) {
      results.push({
        q: center.q + q,
        r: center.r + r,
      });
    }
  }
  
  return results;
};
