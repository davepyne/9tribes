// Maelstrom AI heuristic — Tidal Warfare T3 capstone.

import type { GameState, UnitId } from '../../game/types.js';
import type { FactionId } from '../../types.js';
import type { RulesRegistry } from '../../data/registry/types.js';
import { resolveResearchDoctrine } from '../capabilityDoctrine.js';
import { isWaterTerrain } from '../terrainUtils.js';
import { hexToKey } from '../../core/grid.js';
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
