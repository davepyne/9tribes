/**
 * TerrainGeometry — Freeciv-compatible rect-cell constants.
 *
 * Pure data, no Phaser dependency. Shared by freelandTilespec (tag resolution)
 * and TerrainCompositor (canvas composition).
 */
export const RECT_CELLS = {
    up: { xOffset: -24, yOffset: -48, cropX: 24, cropY: 24, cropWidth: 48, cropHeight: 24, maskOffsetX: 0, maskOffsetY: 24 },
    down: { xOffset: -24, yOffset: -24, cropX: 24, cropY: 0, cropWidth: 48, cropHeight: 24, maskOffsetX: 0, maskOffsetY: -24 },
    right: { xOffset: 0, yOffset: -36, cropX: 0, cropY: 12, cropWidth: 48, cropHeight: 24, maskOffsetX: -48, maskOffsetY: 0 },
    left: { xOffset: -48, yOffset: -36, cropX: 48, cropY: 12, cropWidth: 48, cropHeight: 24, maskOffsetX: 48, maskOffsetY: 0 },
};
export const RECT_CORNER_NEIGHBORS = {
    up: [[-1, 0], [-1, -1], [0, -1]],
    down: [[1, 0], [1, 1], [0, 1]],
    right: [[0, -1], [1, -1], [1, 0]],
    left: [[0, 1], [-1, 1], [-1, 0]],
};
