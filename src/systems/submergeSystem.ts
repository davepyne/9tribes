// Submerge System — River Stealth T3 native mechanic.
//
// River People units may spend their action on a water hex to teleport
// to any other hex in the connected waterway, arriving in stealth.
// Costs all remaining moves and attacks.

import type { GameState } from '../game/types.js';
import type { FactionId, HexCoord, UnitId } from '../types.js';
import { getNeighbors, hexToKey } from '../core/grid.js';
import { resolveResearchDoctrine } from './capabilityDoctrine.js';
import { getUnitAtHex } from './occupancySystem.js';
import { isWaterTerrain } from './terrainUtils.js';

export const SUBMERGE_MAX_RANGE = 8;

export interface SubmergeResult {
  state: GameState;
  submerged: boolean;
  reason?: string;
  destination?: HexCoord;
}

/** BFS flood-fill through water tiles from origin, returning valid unoccupied destinations. */
export function getConnectedWaterway(
  state: GameState,
  origin: HexCoord,
  maxRange: number = SUBMERGE_MAX_RANGE,
): HexCoord[] {
  const originKey = hexToKey(origin);
  const visited = new Set<string>();
  const result: HexCoord[] = [];
  // Queue entries: [hex, distance from origin]
  const queue: [HexCoord, number][] = [[origin, 0]];
  visited.add(originKey);

  while (queue.length > 0) {
    const [current, dist] = queue.shift()!;
    const key = hexToKey(current);
    const tile = state.map?.tiles.get(key);
    if (!tile) continue;

    if (!isWaterTerrain(tile.terrain)) continue;

    // Include as destination if unoccupied and not the origin
    if (key !== originKey && !getUnitAtHex(state, current)) {
      result.push(current);
    }

    if (dist >= maxRange) continue;

    for (const neighbor of getNeighbors(current)) {
      const nKey = hexToKey(neighbor);
      if (visited.has(nKey)) continue;
      const nTile = state.map?.tiles.get(nKey);
      if (!nTile || !isWaterTerrain(nTile.terrain)) continue;
      visited.add(nKey);
      queue.push([neighbor, dist + 1]);
    }
  }

  return result;
}

export function canSubmerge(
  state: GameState,
  factionId: FactionId,
  unitId: UnitId,
): { canSubmerge: boolean; reason?: string } {
  const faction = state.factions.get(factionId);
  if (!faction) return { canSubmerge: false, reason: 'no faction' };

  const research = state.research.get(factionId);
  const doctrine = resolveResearchDoctrine(research, faction);
  if (!doctrine.submergeEnabled) {
    return { canSubmerge: false, reason: 'doctrine not met' };
  }

  const unit = state.units.get(unitId);
  if (!unit || unit.hp <= 0) return { canSubmerge: false, reason: 'unit dead' };
  if (unit.factionId !== factionId) return { canSubmerge: false, reason: 'not owner' };
  if (unit.status !== 'ready') return { canSubmerge: false, reason: 'unit not ready' };

  const terrainId = state.map?.tiles.get(hexToKey(unit.position))?.terrain;
  if (!isWaterTerrain(terrainId)) {
    return { canSubmerge: false, reason: 'not on water terrain' };
  }

  return { canSubmerge: true };
}

export function executeSubmerge(
  state: GameState,
  factionId: FactionId,
  unitId: UnitId,
  destination: HexCoord,
): SubmergeResult {
  const check = canSubmerge(state, factionId, unitId);
  if (!check.canSubmerge) {
    return { state, submerged: false, reason: check.reason };
  }

  const unit = state.units.get(unitId)!;
  const waterway = getConnectedWaterway(state, unit.position);
  const destKey = hexToKey(destination);
  const isValidDestination = waterway.some(h => hexToKey(h) === destKey);
  if (!isValidDestination) {
    return { state, submerged: false, reason: 'destination not in connected waterway or occupied' };
  }

  // Teleport the unit
  const updatedUnit = {
    ...unit,
    position: destination,
    isStealthed: true,
    turnsSinceStealthBreak: 0,
    movesRemaining: 0,
    attacksRemaining: 0,
    status: 'spent' as const,
  };

  const units = new Map(state.units);
  units.set(unitId, updatedUnit);

  return {
    state: { ...state, units },
    submerged: true,
    destination,
  };
}
