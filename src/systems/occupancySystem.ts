// Occupancy system - tracks unit positions on the map
import type { GameState } from '../game/types.js';
import type { UnitId, HexCoord } from '../types.js';
import { hexToKey } from '../core/grid.js';

/**
 * Build a map of hex key -> unit id for quick occupancy lookup
 */
export function buildOccupancyMap(gameState: GameState): Map<string, UnitId> {
  const occupancy = new Map<string, UnitId>();
  for (const [unitId, unit] of gameState.units) {
    const key = hexToKey(unit.position);
    occupancy.set(key, unitId);
  }
  return occupancy;
}

/**
 * Get the unit ID at a specific hex, if any
 */
export function getUnitAtHex(
  gameState: GameState,
  hex: HexCoord
): UnitId | undefined {
  const key = hexToKey(hex);
  for (const [unitId, unit] of gameState.units) {
    if (hexToKey(unit.position) === key) {
      return unitId;
    }
  }
  return undefined;
}

/**
 * Check if a hex is occupied by any unit
 */
export function isHexOccupied(gameState: GameState, hex: HexCoord): boolean {
  return getUnitAtHex(gameState, hex) !== undefined;
}

/**
 * Check if a hex is occupied by a specific faction's unit
 */
export function isHexOccupiedByFaction(
  gameState: GameState,
  hex: HexCoord,
  factionId: string
): boolean {
  const unitId = getUnitAtHex(gameState, hex);
  if (!unitId) return false;
  const unit = gameState.units.get(unitId);
  return unit?.factionId === factionId;
}
