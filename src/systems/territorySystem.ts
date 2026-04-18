// Territory Control System
// Cities claim hexes within a radius. Territory provides supply yield.
// Contested hexes (enemy unit inside radius) provide no yield.

import type { GameState } from '../game/types.js';
import type { City } from '../features/cities/types.js';
import type { HexCoord, FactionId, CityId, UnitId } from '../types.js';
import { getHexesInRange, hexDistance, hexToKey, keyToHex } from '../core/grid.js';
import { isUnitVisibleTo } from './fogSystem.js';

const TERRITORY_SUPPLY_PER_HEX = 0.1;

/**
 * Get all hex keys claimed by a city's territory radius.
 */
export function getCityTerritoryHexes(
  city: City,
  map: { tiles: Map<string, any> },
  radius: number = 2
): Set<string> {
  const hexes = getHexesInRange(city.position, radius);
  const onMap = new Set<string>();
  for (const hex of hexes) {
    const key = hexToKey(hex);
    if (map.tiles.has(key)) {
      onMap.add(key);
    }
  }
  return onMap;
}

/**
 * Check if a hex is contested by an enemy unit within territory range.
 * A hex is contested if any enemy unit is within `radius` of the claiming city
 * AND the hex is within that city's territory.
 */
export function isHexContested(
  hex: HexCoord,
  claimingFactionId: FactionId,
  state: GameState
): boolean {
  for (const [, unit] of state.units) {
    if (unit.factionId !== claimingFactionId && unit.hp > 0 && isUnitVisibleTo(state, claimingFactionId, unit)) {
      const dist = hexDistance(unit.position, hex);
      if (dist <= 1) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Get the faction that owns a hex (closest city claims it).
 * Returns null if unclaimed or contested.
 */
export function getHexOwner(
  hex: HexCoord,
  state: GameState
): FactionId | null {
  let closestCity: { city: City; dist: number } | null = null;

  for (const [, city] of state.cities) {
    const dist = hexDistance(city.position, hex);
    if (dist <= (city.territoryRadius ?? 2)) {
      if (!closestCity || dist < closestCity.dist) {
        closestCity = { city, dist };
      }
    }
  }

  if (!closestCity) return null;

  // Check if any enemy unit is adjacent to this hex (contested)
  if (isHexContested(hex, closestCity.city.factionId, state)) {
    return null;
  }

  return closestCity.city.factionId;
}

/**
 * Calculate total territory supply yield for a faction.
 * Each uncontested territory hex provides TERRITORY_SUPPLY_PER_HEX supply.
 */
export function calculateTerritoryYield(
  factionId: FactionId,
  state: GameState
): number {
  let totalYield = 0;
  const countedHexes = new Set<string>();

  for (const [, city] of state.cities) {
    if (city.factionId !== factionId) continue;

    // Skip besieged or vulnerable cities (siege system)
    if (city.besieged) continue;

    const radius = city.territoryRadius ?? 2;
    const territory = getCityTerritoryHexes(city, state.map!, radius);

    for (const hexKey of territory) {
      if (countedHexes.has(hexKey)) continue;
      countedHexes.add(hexKey);

      const hex = keyToHex(hexKey);
      const owner = getHexOwner(hex, state);
      if (owner === factionId) {
        totalYield += TERRITORY_SUPPLY_PER_HEX;
      }
    }
  }

  return Number(totalYield.toFixed(2));
}

const ENCIRCLEMENT_THRESHOLD = 2;
const ENCIRCLEMENT_RADIUS = 2;

/**
 * Check if a city is encircled (enough enemy units nearby).
 * Uses proximity-based check: counts enemy units within ENCIRCLEMENT_RADIUS.
 * Used by the siege system.
 */
export function isCityEncircled(
  city: City,
  state: GameState
): boolean {
  let enemyCount = 0;
  for (const [, unit] of state.units) {
    if (unit.factionId === city.factionId || unit.hp <= 0) continue;
    const dist = hexDistance(unit.position, city.position);
    if (dist <= ENCIRCLEMENT_RADIUS && dist > 0) {
      enemyCount++;
    }
  }

  return enemyCount >= ENCIRCLEMENT_THRESHOLD;
}

/**
 * Check if encirclement is broken (enemy count drops below threshold within radius).
 */
export function isEncirclementBroken(
  city: City,
  state: GameState
): boolean {
  let enemyCount = 0;
  for (const [, unit] of state.units) {
    if (unit.factionId === city.factionId || unit.hp <= 0) continue;
    const dist = hexDistance(unit.position, city.position);
    if (dist <= ENCIRCLEMENT_RADIUS && dist > 0) {
      enemyCount++;
    }
  }

  return enemyCount < ENCIRCLEMENT_THRESHOLD;
}

// Local helper to avoid importing occupancySystem (circular risk)
function getUnitAtHexFromState(state: GameState, hex: HexCoord): UnitId | undefined {
  for (const [unitId, unit] of state.units) {
    if (unit.position.q === hex.q && unit.position.r === hex.r) {
      return unitId;
    }
  }
  return undefined;
}
