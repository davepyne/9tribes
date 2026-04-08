// Transport system - handles naval transport of land units (e.g., Galley carrying infantry)
import type { GameState } from '../game/types.js';
import type { UnitId, HexCoord } from '../types.js';
import type { RulesRegistry } from '../data/registry/types.js';
import { getNeighbors, hexToKey, hexDistance } from '../core/grid.js';

/**
 * Transport state for a transport ship carrying land units.
 * The TransportMap is managed separately from GameState (caller manages it).
 */
export interface TransportState {
  transportId: UnitId;         // The ship carrying units
  embarkedUnitIds: UnitId[];   // Units being carried
}

export type TransportMap = Map<UnitId, TransportState>; // keyed by transport unitId

/**
 * Water terrain types that are naval-only
 */
const WATER_TERRAINS = new Set(['coast', 'river', 'ocean']);

/**
 * Check if a unit is a transport unit (has transport tag and transportCapacity > 0)
 */
export function isTransportUnit(
  prototype: { chassisId: string; tags?: string[] },
  registry: RulesRegistry
): boolean {
  const chassis = registry.getChassis(prototype.chassisId);
  if (!chassis) return false;
  if (!chassis.tags?.includes('transport')) return false;
  if (!chassis.transportCapacity || chassis.transportCapacity <= 0) return false;
  return true;
}

/**
 * Get transport capacity for a chassis
 */
export function getTransportCapacity(chassisId: string, registry: RulesRegistry): number {
  const chassis = registry.getChassis(chassisId);
  return chassis?.transportCapacity ?? 0;
}

/**
 * Get currently embarked count for a transport
 */
export function getEmbarkedCount(transportId: UnitId, transportMap: TransportMap): number {
  const transportState = transportMap.get(transportId);
  return transportState?.embarkedUnitIds.length ?? 0;
}

/**
 * Get all embarked unit IDs for a transport
 */
export function getEmbarkedUnits(transportId: UnitId, transportMap: TransportMap): UnitId[] {
  return transportMap.get(transportId)?.embarkedUnitIds ?? [];
}

/**
 * Check if a unit is currently embarked
 */
export function isUnitEmbarked(unitId: UnitId, transportMap: TransportMap): boolean {
  for (const transportState of transportMap.values()) {
    if (transportState.embarkedUnitIds.includes(unitId)) {
      return true;
    }
  }
  return false;
}

/**
 * Get the transport that a unit is embarked on
 */
export function getUnitTransport(
  unitId: UnitId,
  transportMap: TransportMap
): TransportState | undefined {
  for (const transportState of transportMap.values()) {
    if (transportState.embarkedUnitIds.includes(unitId)) {
      return transportState;
    }
  }
  return undefined;
}

/**
 * Check if a terrain is land (not water/naval-only)
 */
function isLandTerrain(terrainId: string): boolean {
  return !WATER_TERRAINS.has(terrainId);
}

/**
 * Check if a hex is a valid land hex for disembarking
 */
function isValidDisembarkHex(
  state: GameState,
  hex: HexCoord
): boolean {
  if (!state.map) return false;
  const tile = state.map.tiles.get(hexToKey(hex));
  if (!tile) return false;
  
  const terrain = tile.terrain;
  // Must be land terrain (not coast, river, ocean)
  if (!isLandTerrain(terrain)) return false;
  
  // Terrain must be passable
  return true;
}

/**
 * Check if a land unit can board a transport.
 * Conditions:
 * 1. Land unit is adjacent to transport
 * 2. Land unit and transport are same faction
 * 3. Transport has capacity remaining
 * 4. Both units are 'ready' status
 */
export function canBoardTransport(
  state: GameState,
  landUnitId: UnitId,
  transportId: UnitId,
  registry: RulesRegistry,
  transportMap: TransportMap
): boolean {
  // Get the land unit
  const landUnit = state.units.get(landUnitId);
  if (!landUnit) return false;

  // Get the transport unit
  const transport = state.units.get(transportId);
  if (!transport) return false;

  // Both units must be 'ready'
  if (landUnit.status !== 'ready' || transport.status !== 'ready') {
    return false;
  }

  // Must be same faction
  if (landUnit.factionId !== transport.factionId) return false;

  // Land unit must be adjacent to transport
  if (hexDistance(landUnit.position, transport.position) !== 1) return false;

  // Transport must have capacity
  const prototype = state.prototypes.get(transport.prototypeId);
  if (!prototype) return false;
  
  const chassis = registry.getChassis(prototype.chassisId);
  if (!chassis || !chassis.tags?.includes('transport')) return false;
  
  const capacity = chassis.transportCapacity ?? 0;
  const currentCount = getEmbarkedCount(transportId, transportMap);
  if (currentCount >= capacity) return false;

  return true;
}

/**
 * Board a transport: land unit embarks onto ship.
 * The land unit's position will track with the transport.
 */
export function boardTransport(
  state: GameState,
  landUnitId: UnitId,
  transportId: UnitId,
  transportMap: TransportMap
): { state: GameState; transportMap: TransportMap } {
  // Get existing transport state or create new
  let transportState = transportMap.get(transportId);
  const newEmbarkedUnitIds: UnitId[] = transportState
    ? [...transportState.embarkedUnitIds, landUnitId]
    : [landUnitId];

  // Create new transport map with updated state
  const newTransportMap = new Map(transportMap);
  newTransportMap.set(transportId, {
    transportId,
    embarkedUnitIds: newEmbarkedUnitIds,
  });

  // Note: We don't remove the land unit from state.units - we keep it there
  // but hidden from the map. The transport system just tracks which units are embarked.
  // The unit's position remains at its last location but is effectively "hidden"
  // while embarked. The caller should handle visibility rendering.

  return { state, transportMap: newTransportMap };
}

/**
 * Check if an embarked unit can disembark at a target hex.
 * Target hex must be:
 * - Adjacent to the transport
 * - A valid land hex (passable, not water)
 */
export function canDisembark(
  state: GameState,
  transportId: UnitId,
  targetHex: HexCoord,
  registry: RulesRegistry,
  transportMap: TransportMap
): boolean {
  // Get the transport
  const transport = state.units.get(transportId);
  if (!transport) return false;

  // Transport must be 'ready'
  if (transport.status !== 'ready') return false;

  // Target hex must be adjacent to transport
  if (hexDistance(transport.position, targetHex) !== 1) return false;

  // Target hex must be a valid land hex
  if (!isValidDisembarkHex(state, targetHex)) return false;

  // Target hex must not be occupied
  // (Check all units, not just non-embarked, since embarked units aren't really "on" the map)
  if (!state.map) return false;
  const tile = state.map.tiles.get(hexToKey(targetHex));
  if (!tile) return false;
  
  // Check if any non-embarked unit is at that hex
  for (const [unitId, unit] of state.units) {
    if (!isUnitEmbarked(unitId, transportMap)) {
      if (hexToKey(unit.position) === hexToKey(targetHex)) {
        return false; // Hex is occupied by a non-embarked unit
      }
    }
  }

  return true;
}

/**
 * Disembark a unit from transport to adjacent land hex.
 * The land unit is placed on the target hex and its moves are spent.
 * The transport's moves are also spent after disembarking.
 */
export function disembarkUnit(
  state: GameState,
  transportId: UnitId,
  unitId: UnitId,
  targetHex: HexCoord,
  registry: RulesRegistry,
  transportMap: TransportMap
): { state: GameState; transportMap: TransportMap } {
  // Validate disembark is possible
  if (!canDisembark(state, transportId, targetHex, registry, transportMap)) {
    return { state, transportMap };
  }

  // Get the transport and land unit
  const transport = state.units.get(transportId)!;
  const landUnit = state.units.get(unitId)!;

  // Remove unit from transport state
  const transportState = transportMap.get(transportId);
  if (!transportState) return { state, transportMap };

  const newEmbarkedUnitIds = transportState.embarkedUnitIds.filter(id => id !== unitId);
  
  // Create new transport map
  const newTransportMap = new Map(transportMap);
  if (newEmbarkedUnitIds.length === 0) {
    newTransportMap.delete(transportId);
  } else {
    newTransportMap.set(transportId, {
      ...transportState,
      embarkedUnitIds: newEmbarkedUnitIds,
    });
  }

  // Update land unit: move to target hex, set moves to 0 (spent for disembarking)
  const newUnits = new Map(state.units);
  newUnits.set(unitId, {
    ...landUnit,
    position: { ...targetHex },
    movesRemaining: 0, // Disembarking consumes the unit's moves
  });

  // Update transport: set moves to 0 (disembarking consumes transport's moves too)
  const newTransport = {
    ...transport,
    movesRemaining: 0,
  };
  newUnits.set(transportId, newTransport);

  return {
    state: { ...state, units: newUnits },
    transportMap: newTransportMap,
  };
}

/**
 * Update embarked unit positions when transport moves.
 * Call this after transport movement to sync embarked unit positions.
 */
export function updateEmbarkedPositions(
  state: GameState,
  transportId: UnitId,
  newPosition: HexCoord,
  transportMap: TransportMap
): GameState {
  const transportState = transportMap.get(transportId);
  if (!transportState) return state;

  const newUnits = new Map(state.units);

  // Update position of all embarked units to match transport
  for (const unitId of transportState.embarkedUnitIds) {
    const unit = state.units.get(unitId);
    if (unit) {
      newUnits.set(unitId, {
        ...unit,
        position: { ...newPosition },
      });
    }
  }

  return { ...state, units: newUnits };
}

/**
 * Handle transport destruction - all embarked units are also destroyed.
 * Returns updated state and transport map with the transport and all embarked units removed.
 */
export function destroyTransport(
  state: GameState,
  transportId: UnitId,
  transportMap: TransportMap
): { state: GameState; transportMap: TransportMap } {
  const transportState = transportMap.get(transportId);
  if (!transportState) return { state, transportMap };

  // Get all unit IDs to remove (transport + all embarked)
  const unitsToRemove = [transportId, ...transportState.embarkedUnitIds];

  // Remove all units from state
  const newUnits = new Map(state.units);
  for (const unitId of unitsToRemove) {
    newUnits.delete(unitId);
  }

  // Remove transport from transport map
  const newTransportMap = new Map(transportMap);
  newTransportMap.delete(transportId);

  // Also remove embarked units from their faction's unitIds
  const newFactions = new Map(state.factions);
  for (const unitId of transportState.embarkedUnitIds) {
    const unit = state.units.get(unitId);
    if (unit) {
      const faction = state.factions.get(unit.factionId);
      if (faction) {
        newFactions.set(unit.factionId, {
          ...faction,
          unitIds: faction.unitIds.filter(id => id !== unitId),
        });
      }
    }
  }

  // Remove transport from its faction
  const transport = state.units.get(transportId);
  if (transport) {
    const transportFaction = state.factions.get(transport.factionId);
    if (transportFaction) {
      newFactions.set(transport.factionId, {
        ...transportFaction,
        unitIds: transportFaction.unitIds.filter(id => id !== transportId),
      });
    }
  }

  return {
    state: { ...state, units: newUnits, factions: newFactions },
    transportMap: newTransportMap,
  };
}

/**
 * Get all adjacent valid disembark hexes for a transport
 */
export function getValidDisembarkHexes(
  state: GameState,
  transportId: UnitId,
  registry: RulesRegistry,
  transportMap: TransportMap
): HexCoord[] {
  const transport = state.units.get(transportId);
  if (!transport || transport.status !== 'ready') return [];

  const neighbors = getNeighbors(transport.position);
  return neighbors.filter(hex => canDisembark(state, transportId, hex, registry, transportMap));
}
