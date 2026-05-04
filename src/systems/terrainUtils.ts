const WATER_TERRAINS = new Set(['coast', 'river', 'ocean']);

export function isWaterTerrain(terrainId: string | undefined): boolean {
  return terrainId ? WATER_TERRAINS.has(terrainId) : false;
}

export function isLandTerrain(terrainId: string | undefined): boolean {
  return !isWaterTerrain(terrainId);
}
