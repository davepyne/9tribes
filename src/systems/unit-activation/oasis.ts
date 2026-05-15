// Oasis AI heuristic — Camel Adaptation T3 native capstone.

import type { GameState, UnitId } from '../../game/types.js';
import type { FactionId } from '../../types.js';
import type { RulesRegistry } from '../../data/registry/types.js';
import { resolveResearchDoctrine } from '../capabilityDoctrine.js';
import { isLandTerrain } from '../terrainUtils.js';
import { hexToKey } from '../../core/grid.js';
import { countFriendlyUnitsNearHex, countEnemyUnitsNearHex } from './helpers.js';

interface OasisOpportunity {
  score: number;
  reason: string;
}

const OASIS_DECISION_SCORE = 8;
const OASIS_RADIUS = 2;

export { OASIS_DECISION_SCORE };

export function getOasisOpportunity(
  state: GameState,
  factionId: FactionId,
  unitId: UnitId,
  registry: RulesRegistry,
): OasisOpportunity | null {
  const faction = state.factions.get(factionId);
  const unit = state.units.get(unitId);
  const research = state.research.get(factionId);
  const doctrine = resolveResearchDoctrine(research, faction);

  if (!faction || !unit || !doctrine.canDeclareOasis) {
    return null;
  }
  if (unit.hp <= 0 || unit.status !== 'ready') {
    return null;
  }

  const terrainId = state.map?.tiles.get(hexToKey(unit.position))?.terrain;
  if (!terrainId || !isLandTerrain(terrainId)) {
    return null;
  }

  const friendlyInRadius = countFriendlyUnitsNearHex(
    state, factionId, unit.position, OASIS_RADIUS, unitId,
  );

  if (friendlyInRadius < 2) {
    return null;
  }

  const enemiesInRadius = countEnemyUnitsNearHex(
    state, factionId, unit.position, OASIS_RADIUS,
  );

  const score = friendlyInRadius * 3 + enemiesInRadius * 1.5;

  const reason = `friendlies=${friendlyInRadius} enemies=${enemiesInRadius}`;
  return { score, reason };
}
