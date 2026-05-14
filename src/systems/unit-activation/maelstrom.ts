// Maelstrom declaration — Tidal Warfare T3 capstone.
//
// A Maelstrom is a once-per-game zone effect (damage + movement penalty)
// centered on a water hex. The AI scores it based on how many enemy units
// are within the zone radius, with bonuses for native auto-capture synergy.
//
// This module exports the AI-side heuristic (getMaelstromOpportunity /
// declareMaelstromIfEligible). The player-side path lives in
// web/src/game/controller/sessionUtils.ts and dispatches via the
// 'declare_maelstrom' ClientAction. Both paths funnel through
// canDeclareMaelstrom in capabilityDoctrine.ts and the increment on
// faction.maelstromsDeclared.

import type { GameState, UnitId } from '../../game/types.js';
import type { FactionId } from '../../types.js';
import type { RulesRegistry } from '../../data/registry/types.js';
import { resolveResearchDoctrine } from '../capabilityDoctrine.js';
import { isWaterTerrain } from '../terrainUtils.js';
import { hexToKey } from '../../core/grid.js';
import { declareMaelstrom } from '../maelstromSystem.js';
import { countUnitsNearHex } from './helpers.js';

interface MaelstromOpportunity {
  score: number;
  reason: string;
}

const MAELSTROM_DECISION_SCORE = 8;

export { MAELSTROM_DECISION_SCORE };

export function getMaelstromOpportunity(
  state: GameState,
  factionId: FactionId,
  unitId: UnitId,
  registry: RulesRegistry,
): MaelstromOpportunity | null {
  void registry;
  const faction = state.factions.get(factionId);
  const unit = state.units.get(unitId);
  const research = state.research.get(factionId);
  const doctrine = resolveResearchDoctrine(research, faction);

  if (!faction || !unit || !doctrine.canDeclareMaelstrom) {
    return null;
  }
  if (unit.hp <= 0 || unit.status !== 'ready') {
    return null;
  }

  const terrainId = state.map?.tiles.get(hexToKey(unit.position))?.terrain;
  if (!terrainId || !isWaterTerrain(terrainId)) {
    return null;
  }

  const radius = doctrine.maelstromRadius;
  const enemiesInRadius = countUnitsNearHex(
    state, unit.position, radius,
    (other) => other.factionId !== factionId && other.hp > 0,
  );

  if (enemiesInRadius < 3) {
    return null;
  }

  let score = enemiesInRadius * 2;
  if (doctrine.maelstromAutoCaptureEnabled) {
    score += enemiesInRadius * 1.5;
  }

  const reason = `enemies=${enemiesInRadius} radius=${radius} autoCapture=${doctrine.maelstromAutoCaptureEnabled}`;
  return { score, reason };
}

export function declareMaelstromIfEligible(
  state: GameState,
  factionId: FactionId,
  unitId: UnitId,
  registry: RulesRegistry,
): GameState {
  const opportunity = getMaelstromOpportunity(state, factionId, unitId, registry);
  if (!opportunity || opportunity.score < MAELSTROM_DECISION_SCORE) {
    return state;
  }

  const unit = state.units.get(unitId);
  if (!unit) return state;

  const result = declareMaelstrom(state, factionId, unit.position);
  return result.state;
}
