// Bastion construction — the Hill Engineers' native fortress T3 capstone.
//
// A Bastion is a player- (or AI-) initiated improvement that converts the hex
// under a qualified Hill unit into a permanent +400% defense fortification.
// Each Hill faction may build at most 3 Bastions per game (tracked on
// faction.bastionsBuilt) and only after researching the native fortress T3.
//
// This module exports both:
//   - getBastionOpportunity / buildBastionIfEligible — the AI-side heuristic,
//     invoked from activateUnit during the autonomous loop.
//   - The player-side path lives in web/src/game/controller/sessionUtils.ts
//     (getBastionBuildEligibility / buildBastionAtUnit) and dispatches via
//     the 'build_bastion' ClientAction. Both paths funnel through the
//     `canBuildBastion` doctrine flag in capabilityDoctrine.ts and through
//     the +1 increment on faction.bastionsBuilt.

import { createImprovementId } from '../../core/ids.js';
import { hexDistance } from '../../core/grid.js';
import type { GameState, UnitId } from '../../game/types.js';
import type { FactionId } from '../../types.js';
import type { RulesRegistry } from '../../data/registry/types.js';
import { resolveResearchDoctrine } from '../capabilityDoctrine.js';
import { getNearestFriendlyCity, getUnitIntent } from '../strategicAi.js';

import { getTerrainAt, getImprovementAtHex, countFriendlyUnitsNearHex, countUnitsNearHex, countFortificationsNearHex } from './helpers.js';

interface BastionOpportunity {
  score: number;
  reason: string;
}

// Bastion is a much more deliberate placement than the retired field forts:
// the score threshold is higher and the cap is global, so the AI only commits
// when the position genuinely matters.
const BASTION_DECISION_SCORE = 10;
const BASTION_ATTACK_MARGIN = 1;

export { BASTION_ATTACK_MARGIN, BASTION_DECISION_SCORE };

export function getBastionOpportunity(
  state: GameState,
  factionId: FactionId,
  unitId: UnitId,
  registry: RulesRegistry,
  bastionsBuiltThisRound?: Set<FactionId>,
): BastionOpportunity | null {
  const faction = state.factions.get(factionId);
  const unit = state.units.get(unitId);
  const research = state.research.get(factionId);
  const doctrine = resolveResearchDoctrine(research, faction);
  if (
    !faction ||
    !unit ||
    factionId !== ('hill_clan' as FactionId) ||
    unit.hp <= 0 ||
    bastionsBuiltThisRound?.has(factionId) ||
    unit.movesRemaining !== unit.maxMoves ||
    unit.status !== 'ready'
  ) {
    return null;
  }

  // canBuildBastion already enforces the native-fortress-T3 gate and the
  // 3-per-game cap from faction.bastionsBuilt.
  if (!doctrine.canBuildBastion) {
    return null;
  }

  const prototype = state.prototypes.get(unit.prototypeId);
  const movementClass = prototype ? registry.getChassis(prototype.chassisId)?.movementClass : undefined;
  const role = prototype?.derivedStats.role;
  if (!(movementClass === 'infantry' || role === 'ranged')) {
    return null;
  }

  if (getImprovementAtHex(state, unit.position)) {
    return null;
  }

  const strategy = state.factionStrategies.get(factionId);
  const unitIntent = getUnitIntent(strategy, unitId);
  const nearbyEnemies = countUnitsNearHex(state, unit.position, 2, (other) => other.factionId !== factionId);
  const nearbyFriendlySupport = countFriendlyUnitsNearHex(state, factionId, unit.position, 2, unitId);
  const nearbyFortCount = countFortificationsNearHex(state, unit.position, 2);
  const nearestCity = getNearestFriendlyCity(state, factionId, unit.position);
  const cityDistance = nearestCity ? hexDistance(unit.position, nearestCity.position) : 99;
  const terrain = getTerrainAt(state, unit.position);
  const isDefensiveAssignment =
    unitIntent?.assignment === 'defender'
    || unitIntent?.assignment === 'recovery'
    || unitIntent?.assignment === 'reserve';
  const defensiveHold = isDefensiveAssignment && terrain === 'hill' && cityDistance <= 3;
  if (
    nearbyFriendlySupport <= 0
    || nearbyFortCount > 0
    || (!defensiveHold && nearbyEnemies <= 0)
  ) {
    return null;
  }

  let score = Math.min(nearbyFriendlySupport, 2) * 1.5;
  score += Math.min(nearbyEnemies, 2) * 3;
  if (terrain === 'hill') score += 3;
  if (isDefensiveAssignment) score += 3;
  if (cityDistance <= 1) {
    score += 2.5;
  } else if (cityDistance <= 2) {
    score += 1.5;
  } else if (cityDistance <= 3) {
    score += 0.5;
  }
  if (unitIntent?.threatenedCityId && nearestCity?.id === unitIntent.threatenedCityId) {
    score += 2;
  } else if (nearestCity?.besieged) {
    score += 1.5;
  }

  const reason = nearbyEnemies > 0
    ? `pressure=${nearbyEnemies} support=${nearbyFriendlySupport} terrain=${terrain}`
    : `hold=${isDefensiveAssignment ? unitIntent?.assignment : 'none'} terrain=${terrain} city=${cityDistance}`;
  return { score, reason };
}

export function buildBastionIfEligible(
  state: GameState,
  factionId: FactionId,
  unitId: UnitId,
  registry: RulesRegistry,
  bastionsBuiltThisRound?: Set<FactionId>
): GameState {
  const opportunity = getBastionOpportunity(state, factionId, unitId, registry, bastionsBuiltThisRound);
  if (!opportunity) {
    return state;
  }

  const faction = state.factions.get(factionId);
  const unit = state.units.get(unitId);
  if (!faction || !unit) {
    return state;
  }

  const improvementId = createImprovementId();
  const improvements = new Map(state.improvements);
  const bastion = registry.getImprovement('bastion');
  improvements.set(improvementId, {
    id: improvementId,
    type: 'fortification',
    position: { ...unit.position },
    ownerFactionId: factionId,
    defenseBonus: bastion?.defenseBonus ?? 4,
  });

  // Increment the per-game cap counter — new faction object with bumped count.
  const factions = new Map(state.factions);
  factions.set(factionId, { ...faction, bastionsBuilt: faction.bastionsBuilt + 1 });

  bastionsBuiltThisRound?.add(factionId);
  return { ...state, improvements, factions };
}
