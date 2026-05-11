const WATER_TERRAINS = new Set(['coast', 'river', 'ocean']);
const RIVER_STEALTH_TERRAINS = new Set(['river', 'swamp']);

export function isWaterTerrain(terrainId: string | undefined): boolean {
  return terrainId ? WATER_TERRAINS.has(terrainId) : false;
}

export function isLandTerrain(terrainId: string | undefined): boolean {
  return !isWaterTerrain(terrainId);
}

/**
 * Check if terrain grants River Stealth (auto-stealth for River People).
 * Only river and swamp — NOT coast or ocean.
 */
export function isRiverStealthTerrain(terrainId: string | undefined): boolean {
  return terrainId ? RIVER_STEALTH_TERRAINS.has(terrainId) : false;
}
