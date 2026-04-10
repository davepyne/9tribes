// Hex coordinate math using axial coordinate system
// Reference: https://www.redblobgames.com/grids/hexagons/
// Direction vectors for axial neighbors (6 directions)
const AXIAL_DIRECTIONS = [
    { q: 1, r: 0 }, // East
    { q: 1, r: -1 }, // Northeast
    { q: 0, r: -1 }, // Northwest
    { q: -1, r: 0 }, // West
    { q: -1, r: 1 }, // Southwest
    { q: 0, r: 1 }, // Southeast
];
export const HEX_DIRECTION_COUNT = AXIAL_DIRECTIONS.length;
/**
 * Convert axial coordinates to cube coordinates
 */
export const axialToCube = (coord) => ({
    x: coord.q,
    y: -coord.q - coord.r,
    z: coord.r,
});
/**
 * Convert cube coordinates to axial coordinates
 */
export const cubeToAxial = (cube) => ({
    q: cube.x,
    r: cube.z,
});
/**
 * Get all 6 neighboring hex coordinates
 */
export const getNeighbors = (coord) => AXIAL_DIRECTIONS.map(dir => ({
    q: coord.q + dir.q,
    r: coord.r + dir.r,
}));
export const getDirectionVector = (direction) => AXIAL_DIRECTIONS[((direction % HEX_DIRECTION_COUNT) + HEX_DIRECTION_COUNT) % HEX_DIRECTION_COUNT];
export const getDirectionIndex = (from, to) => {
    const dq = to.q - from.q;
    const dr = to.r - from.r;
    const index = AXIAL_DIRECTIONS.findIndex((dir) => dir.q === dq && dir.r === dr);
    return index === -1 ? null : index;
};
export const getOppositeDirection = (direction) => (direction + 3) % HEX_DIRECTION_COUNT;
/**
 * Calculate the distance between two hex coordinates
 */
export const hexDistance = (a, b) => {
    const cubeA = axialToCube(a);
    const cubeB = axialToCube(b);
    return (Math.abs(cubeA.x - cubeB.x) +
        Math.abs(cubeA.y - cubeB.y) +
        Math.abs(cubeA.z - cubeB.z)) / 2;
};
/**
 * Convert hex coordinate to string key for use in Maps/Sets
 */
export const hexToKey = (coord) => `${coord.q},${coord.r}`;
/**
 * Parse string key back to hex coordinate
 */
export const keyToHex = (key) => {
    const [q, r] = key.split(',').map(Number);
    return { q, r };
};
/**
 * Get all hexes within a given range (including center)
 */
export const getHexesInRange = (center, range) => {
    const results = [];
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
