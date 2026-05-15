import type { GameState, UnitId } from '../../game/types.js';
import type { FactionId, HexCoord } from '../../types.js';
import type { RulesRegistry } from '../../data/registry/types.js';
import { hexDistance } from '../../core/grid.js';
import { countEnemyUnitsNearHex } from './helpers.js';
import { canSubmerge, getConnectedWaterway } from '../submergeSystem.js';

export interface SubmergeOpportunity {
  score: number;
  reason: string;
  destination: HexCoord;
}

export const SUBMERGE_DECISION_SCORE = 6;

export function getSubmergeOpportunity(
  state: GameState,
  factionId: FactionId,
  unitId: UnitId,
  registry: RulesRegistry,
): SubmergeOpportunity | null {
  void registry;
  const check = canSubmerge(state, factionId, unitId);
  if (!check.canSubmerge) return null;

  const unit = state.units.get(unitId);
  if (!unit) return null;

  const waterway = getConnectedWaterway(state, unit.position);
  if (waterway.length === 0) return null;

  // Score each destination by proximity to enemies (ambush potential)
  let bestScore = 0;
  let bestDestination: HexCoord | null = null;
  let bestReason = '';

  for (const dest of waterway) {
    const enemiesNearby = countEnemyUnitsNearHex(state, factionId, dest, 2);
    const distance = hexDistance(unit.position, dest);

    const ambushScore = enemiesNearby * 4;
    const distanceScore = Math.min(distance, 5) * 0.5;
    const stealthPenalty = unit.isStealthed ? -2 : 0;

    const totalScore = ambushScore + distanceScore + stealthPenalty;
    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestDestination = dest;
      bestReason = `enemies_near=${enemiesNearby} dist=${distance} stealthed=${unit.isStealthed}`;
    }
  }

  if (bestScore <= 0 || !bestDestination) return null;

  return { score: bestScore, reason: bestReason, destination: bestDestination };
}
