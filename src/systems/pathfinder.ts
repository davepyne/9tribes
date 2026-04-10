// Long-distance A* pathfinder for move queues.
// Uses previewMove() as edge-weight so all terrain/ZoC/naval/doctrine rules apply.
import type { GameState } from '../game/types.js';
import type { UnitId, HexCoord } from '../types.js';
import type { RulesRegistry } from '../data/registry/types.js';
import type { GameMap } from '../world/map/types.js';
import { getNeighbors, tileDistance, hexToKey } from '../core/grid.js';
import { previewMove } from './movementSystem.js';

export interface PathfinderResult {
  /** Full path from origin (index 0) to destination (last). Each step is adjacent. */
  path: HexCoord[];
  /** Total movement-point cost of the path. */
  totalCost: number;
  /** Estimated turns to traverse at the unit's maxMoves per turn. */
  estimatedTurns: number;
}

/**
 * Find the shortest path from a unit's current position to a destination,
 * ignoring movement-point budget. Uses A* with Chebyshev distance heuristic.
 *
 * Returns null if no path exists (unreachable due to impassable terrain or islands).
 */
export function findPath(
  gameState: GameState,
  unitId: UnitId,
  destination: HexCoord,
  map: GameMap,
  rulesRegistry: RulesRegistry,
): PathfinderResult | null {
  const unit = gameState.units.get(unitId);
  if (!unit || unit.status !== 'ready') return null;
  if (unit.hp <= 0) return null;

  const origin = unit.position;
  const originKey = hexToKey(origin);
  const destKey = hexToKey(destination);

  // Already there
  if (originKey === destKey) {
    return { path: [origin], totalCost: 0, estimatedTurns: 0 };
  }

  // A* open set (sorted array — adequate for map sizes up to ~60x60)
  interface SearchNode {
    coord: HexCoord;
    g: number;  // cost from origin
    f: number;  // g + heuristic
  }

  const openSet: SearchNode[] = [{ coord: origin, g: 0, f: tileDistance(origin, destination) }];
  const closedSet = new Set<string>();
  const gScore = new Map<string, number>();
  const cameFrom = new Map<string, HexCoord>();

  gScore.set(originKey, 0);

  let iterations = 0;
  const MAX_ITERATIONS = 10000;

  while (openSet.length > 0 && iterations < MAX_ITERATIONS) {
    iterations++;

    // Pop lowest f-score
    openSet.sort((a, b) => a.f - b.f);
    const current = openSet.shift()!;
    const currentKey = hexToKey(current.coord);

    if (currentKey === destKey) {
      return reconstructPath(cameFrom, origin, destination, current.g, unit.maxMoves);
    }

    if (closedSet.has(currentKey)) continue;
    closedSet.add(currentKey);

    const neighbors = getNeighbors(current.coord);
    for (const neighbor of neighbors) {
      const neighborKey = hexToKey(neighbor);
      if (closedSet.has(neighborKey)) continue;

      const searchState = withVirtualUnitPosition(gameState, unitId, current.coord);
      const preview = previewMove(searchState, unitId, neighbor, map, rulesRegistry);
      if (!preview) continue; // impassable

      const tentativeG = current.g + preview.totalCost;

      const existingG = gScore.get(neighborKey);
      if (existingG !== undefined && tentativeG >= existingG) continue;

      gScore.set(neighborKey, tentativeG);
      cameFrom.set(neighborKey, current.coord);

      const h = tileDistance(neighbor, destination);
      openSet.push({ coord: neighbor, g: tentativeG, f: tentativeG + h });
    }
  }

  return null; // No path found
}

function withVirtualUnitPosition(
  gameState: GameState,
  unitId: UnitId,
  position: HexCoord,
): GameState {
  const unit = gameState.units.get(unitId);
  if (!unit) {
    return gameState;
  }

  const units = new Map(gameState.units);
  units.set(unitId, {
    ...unit,
    position,
  });

  return {
    ...gameState,
    units,
  };
}

function reconstructPath(
  cameFrom: Map<string, HexCoord>,
  origin: HexCoord,
  destination: HexCoord,
  totalCost: number,
  movesPerTurn: number,
): PathfinderResult {
  const path: HexCoord[] = [destination];
  let current = destination;
  const originKey = hexToKey(origin);

  while (hexToKey(current) !== originKey) {
    const prev = cameFrom.get(hexToKey(current));
    if (!prev) break;
    path.unshift(prev);
    current = prev;
  }

  return {
    path,
    totalCost,
    estimatedTurns: Math.ceil(totalCost / Math.max(1, movesPerTurn)),
  };
}
