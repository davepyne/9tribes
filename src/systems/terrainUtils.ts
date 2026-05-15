import { hexToKey } from '../core/grid.js';
import type { GameState } from '../game/types.js';

const WATER_TERRAINS = new Set(['coast', 'river', 'ocean']);
const DEEP_WATER_TERRAINS = new Set(['coast', 'ocean']);
const RIVER_STEALTH_TERRAINS = new Set(['river', 'swamp']);
const WETLAND_TERRAINS = new Set(['river', 'coast', 'swamp']);

export function isWaterTerrain(terrainId: string | undefined): boolean {
  return terrainId ? WATER_TERRAINS.has(terrainId) : false;
}

export function isDeepWaterTerrain(terrainId: string | undefined): boolean {
  return terrainId ? DEEP_WATER_TERRAINS.has(terrainId) : false;
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

/** Terrain that provides cover for doctrine effects (rough terrain movement, stealth recharge, defense bonus). */
export const COVER_TERRAINS = new Set(['forest', 'jungle', 'hill', 'swamp']);

export function isCoverTerrain(terrainId: string | undefined): boolean {
  return terrainId ? COVER_TERRAINS.has(terrainId) : false;
}

export function isWetlandTerrain(terrainId: string | undefined): boolean {
  return terrainId ? WETLAND_TERRAINS.has(terrainId) : false;
}

const WOODLAND_TERRAINS = new Set(['forest', 'jungle']);

export function isWoodlandTerrain(terrainId: string | undefined): boolean {
  return terrainId ? WOODLAND_TERRAINS.has(terrainId) : false;
}

export function getTerrainAt(state: GameState, position: { q: number; r: number }): string {
  return state.map?.tiles.get(hexToKey(position))?.terrain ?? 'plains';
}
