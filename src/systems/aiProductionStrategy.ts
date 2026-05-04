// src/systems/aiProductionStrategy.ts
// AI Production Strategy — orchestration layer.
// Scoring functions extracted to aiProductionScoring.ts.

import type { GameState } from '../game/types.js';
import type { RulesRegistry } from '../data/registry/types.js';
import type { FactionId } from '../types.js';
import type { FactionStrategy, ProductionPriority } from './factionStrategy.js';
import { calculatePrototypeCost, getDomainIdsByTags } from './knowledgeSystem.js';
import {
  canPaySettlerVillageCost,
  getAvailableProductionPrototypes,
  getPrototypeCostType,
  getPrototypeEconomicProfile,
  getUnitCost,
  isSettlerPrototype,
  SETTLER_VILLAGE_COST,
} from './productionSystem.js';
import { getSupplyDeficit } from './economySystem.js';
import { getVisibleEnemyUnits } from './fogSystem.js';
import { scoreProductionCandidate } from './aiPersonality.js';
import type { DifficultyLevel } from './aiDifficulty.js';
import { getAiDifficultyProfile } from './aiDifficulty.js';
import {
  type ProductionScoringContext,
  isMilitaryPrototype,
  getSupplyUtilizationRatio,
  getTargetArmySize,
  getProductionCostForPrototype,
  getSupplyMargin,
  getProjectedSupplyMarginAfterBuild,
  scoreSupplyEfficiency,
  scoreForceProjectionValue,
  scorePriestSummonValue,
  scoreUnderCapPressure,
  scoreArmySizePressure,
  scoreArmyQualityLag,
  scoreAggressiveSupplyFill,
  scoreSettlerExpansionValue,
  scoreCatapultPreference,
  scoreEnemyCounterPressure,
  scoreCounterCompositionPivot,
  scorePostureFit,
  scoreIdentityFit,
  scoreFactionSignatureExploit,
  scoreHybridFit,
  scoreRecentCodifiedDomainPivot,
  scoreEmergentRuleCompletionFit,
  buildProductionReason,
} from './aiProductionScoring.js';

// Re-export public helpers used by other modules
export { getSupplyMargin, getProjectedSupplyMarginAfterBuild } from './aiProductionScoring.js';

export interface ProductionDecision {
  prototypeId: string;
  chassisId: string;
  cost: number;
  costType: 'production' | 'villages';
  reason: string;
}

export function rankProductionPriorities(
  state: GameState,
  factionId: FactionId,
  strategy: FactionStrategy,
  registry: RulesRegistry,
  difficulty?: DifficultyLevel,
): ProductionPriority[] {
  const difficultyProfile = getAiDifficultyProfile(difficulty);
  const faction = state.factions.get(factionId);
  if (!faction) return [];

  const enemyUnits = difficultyProfile.strategy.strategicFogCheat
    ? Array.from(state.units.values()).filter((unit) => unit.factionId !== factionId && unit.hp > 0)
    : getVisibleEnemyUnits(state, factionId).map((entry) => entry.unit);
  const currentRoles = new Map<string, number>();
  let totalFriendlyUnits = 0;
  const fieldedMilitaryCosts: number[] = [];
  for (const unit of state.units.values()) {
    if (unit.factionId !== factionId || unit.hp <= 0) continue;
    const prototype = state.prototypes.get(unit.prototypeId);
    if (!prototype) continue;
    totalFriendlyUnits += 1;
    currentRoles.set(prototype.derivedStats.role, (currentRoles.get(prototype.derivedStats.role) ?? 0) + 1);
    if (isMilitaryPrototype(prototype)) {
      fieldedMilitaryCosts.push(getProductionCostForPrototype(prototype, faction));
    }
  }

  const factionEconomy = state.economy.get(factionId) ?? { factionId, productionPool: 0, supplyIncome: 0, supplyDemand: 0 };
  const currentSupplyDeficit = getSupplyDeficit(factionEconomy);
  const supplyUtilizationRatio = getSupplyUtilizationRatio(factionEconomy);
  const targetArmySize = getTargetArmySize(state, factionId);
  const scoringContext: ProductionScoringContext = {
    supplyIncome: factionEconomy.supplyIncome,
    currentSupplyDemand: factionEconomy.supplyDemand,
    currentSupplyDeficit,
    supplyUtilizationRatio,
    totalFriendlyUnits,
    visibleEnemyPressure: enemyUnits.length,
    highestAvailableMilitaryCost: 0,
    highestFieldedMilitaryCost: fieldedMilitaryCosts.length > 0 ? Math.max(...fieldedMilitaryCosts) : 0,
    averageFieldedMilitaryCost: fieldedMilitaryCosts.length > 0
      ? Number((fieldedMilitaryCosts.reduce((sum, cost) => sum + cost, 0) / fieldedMilitaryCosts.length).toFixed(3))
      : 0,
    targetArmySize,
  };

  const availablePrototypes = getAvailableProductionPrototypes(state, factionId, registry)
    .filter((prototype) => {
      if (!isSettlerPrototype(prototype)) {
        return true;
      }
      if (difficulty === 'easy') {
        return false;
      }
      const cityCount = state.factions.get(factionId)?.cityIds.length ?? 0;
      const effectiveCost = cityCount >= 3 ? SETTLER_VILLAGE_COST : difficultyProfile.production.settlerVillageCost;
      return canPaySettlerVillageCost(state, factionId, effectiveCost);
    });
  const availableMilitaryCosts = availablePrototypes
    .filter((prototype) => isMilitaryPrototype(prototype))
    .map((prototype) => getProductionCostForPrototype(prototype, faction));
  scoringContext.highestAvailableMilitaryCost = availableMilitaryCosts.length > 0
    ? Math.max(...availableMilitaryCosts)
    : 0;
  if (difficultyProfile.adaptiveAi && state.round <= difficultyProfile.production.rushTurns) {
    return rankRushProductionPriorities(state, factionId, strategy, registry, availablePrototypes, enemyUnits);
  }
  const researchState = state.research.get(factionId);
  const recentCodifiedDomains =
    difficultyProfile.adaptiveAi
    && researchState?.recentCodifiedRound !== undefined
    && state.round - researchState.recentCodifiedRound <= difficultyProfile.production.codifiedPivotDuration
      ? new Set(researchState.recentCodifiedDomainIds ?? [])
      : undefined;

  return availablePrototypes
    .map((prototype) => {
      const role = prototype.derivedStats.role;
      const myRoleCount = currentRoles.get(role) ?? 0;
      const enemyCounterPressure = scoreEnemyCounterPressure(enemyUnits, state, role);
      const counterCompositionScore = scoreCounterCompositionPivot(
        enemyUnits,
        state,
        role,
        difficultyProfile,
      );
      const desiredRatio = strategy.personality.desiredRoleRatios[role] ?? 0;
      const currentRatio = totalFriendlyUnits > 0 ? myRoleCount / totalFriendlyUnits : 0;
      const roleNeed = Math.max(0, desiredRatio - currentRatio) * 10;
      const postureScore = scorePostureFit(strategy.posture, prototype.tags ?? [], role);
      const identityScore =
        scoreIdentityFit(faction.identityProfile.signatureUnit, faction.identityProfile.economyAngle, prototype)
        + scoreFactionSignatureExploit(faction, prototype, difficultyProfile);
      const hybridScore = scoreHybridFit(strategy, prototype);
      const catapultScore = scoreCatapultPreference(factionId, state, strategy, prototype);
      const domains = getDomainIdsByTags(prototype.tags ?? []);
      const emergentRuleCompletionScore = scoreEmergentRuleCompletionFit(
        domains,
        faction.activeTripleStack?.domains,
        difficultyProfile,
      );
      const codifiedPivotScore = scoreRecentCodifiedDomainPivot(
        domains,
        recentCodifiedDomains,
        difficultyProfile.production.codifiedPivotScoringBonus,
      );
      const settlerScore = scoreSettlerExpansionValue(state, factionId, strategy, prototype, difficultyProfile, difficulty);
      const baseCost = getUnitCost(prototype.chassisId);
      const totalCost = calculatePrototypeCost(baseCost, faction, domains);
      const economic = getPrototypeEconomicProfile(prototype, registry);
      const projectedSupplyMargin = getProjectedSupplyMarginAfterBuild(state, factionId, prototype, registry);
      const projectedDeficitPenalty = projectedSupplyMargin >= 0 ? 0 : Math.abs(projectedSupplyMargin) * 12;
      const supplyCostPenalty = economic.supplyCost * (2 + scoringContext.currentSupplyDeficit * 1.4);
      const productionCostPenalty = totalCost * 0.18;
      const supplyEfficiencyScore =
        scoreSupplyEfficiency(prototype, registry) * difficultyProfile.production.supplyEfficiencyWeight;
      const forceProjectionScore =
        scoreForceProjectionValue(prototype, strategy) * difficultyProfile.production.forceProjectionWeight;
      const underCapScore = scoreUnderCapPressure(
        prototype,
        totalCost,
        economic.supplyCost,
        scoringContext,
        difficultyProfile,
      );
      const aggressiveFillScore = scoreAggressiveSupplyFill(
        prototype,
        economic.supplyCost,
        scoringContext,
        difficultyProfile,
      );
      const armySizePressure = scoreArmySizePressure(
        prototype,
        totalFriendlyUnits,
        targetArmySize,
        difficultyProfile,
      );
      const qualityLagScore = scoreArmyQualityLag(
        prototype,
        totalCost,
        scoringContext,
        difficultyProfile,
      );
      const doctrineScore = scoreProductionCandidate(
        strategy.personality,
        { supplyDeficit: currentSupplyDeficit },
        {
          role,
          tags: prototype.tags ?? [],
          supplyCost: economic.supplyCost,
          productionCost: totalCost,
        },
      );
      const priestScore = scorePriestSummonValue(
        state,
        factionId,
        prototype,
        registry,
        difficultyProfile.production.priestSummonWeight,
      );
      const score =
        postureScore +
        enemyCounterPressure +
        counterCompositionScore +
        roleNeed +
        identityScore +
        hybridScore +
        catapultScore +
        emergentRuleCompletionScore +
        codifiedPivotScore +
        settlerScore +
        doctrineScore +
        supplyEfficiencyScore +
        underCapScore +
        aggressiveFillScore +
        armySizePressure +
        qualityLagScore +
        forceProjectionScore +
        priestScore -
        productionCostPenalty -
        supplyCostPenalty -
        projectedDeficitPenalty;
      const reason = buildProductionReason(
        strategy.posture,
        role,
        totalCost,
        hybridScore,
        enemyCounterPressure + counterCompositionScore,
        roleNeed,
        projectedSupplyMargin,
        codifiedPivotScore,
        settlerScore,
        underCapScore,
        aggressiveFillScore,
        armySizePressure,
        qualityLagScore,
      );
      return {
        prototypeId: prototype.id,
        chassisId: prototype.chassisId,
        prototypeName: prototype.name,
        score,
        reason,
      };
    })
    .sort((left, right) =>
      right.score - left.score
      || left.chassisId.localeCompare(right.chassisId)
      || left.prototypeName.localeCompare(right.prototypeName)
    )
    .map(({ prototypeId, score, reason }) => ({ prototypeId, score, reason }));
}

export function chooseStrategicProduction(
  state: GameState,
  factionId: FactionId,
  strategy: FactionStrategy,
  registry: RulesRegistry,
  difficulty?: DifficultyLevel,
): ProductionDecision | null {
  const priorities = rankProductionPriorities(state, factionId, strategy, registry, difficulty);
  strategy.productionPriorities = priorities;
  const best = priorities[0];
  if (!best) return null;

  const prototype = state.prototypes.get(best.prototypeId as never);
  const faction = state.factions.get(factionId);
  if (!prototype || !faction) return null;

  const cost = calculatePrototypeCost(
    getUnitCost(prototype.chassisId),
    faction,
    getDomainIdsByTags(prototype.tags ?? []),
    prototype,
  );
  const difficultyProfile = getAiDifficultyProfile(difficulty);
  const cityCount = faction.cityIds.length;
  return {
    prototypeId: prototype.id,
    chassisId: prototype.chassisId,
    cost: getPrototypeCostType(prototype) === 'villages'
      ? (cityCount >= 3 ? SETTLER_VILLAGE_COST : difficultyProfile.production.settlerVillageCost)
      : cost,
    costType: getPrototypeCostType(prototype),
    reason: best.reason,
  };
}

// ---------------------------------------------------------------------------
// Rush production (internal)
// ---------------------------------------------------------------------------

function rankRushProductionPriorities(
  state: GameState,
  factionId: FactionId,
  strategy: FactionStrategy,
  registry: RulesRegistry,
  prototypes: ReturnType<typeof getAvailableProductionPrototypes>,
  enemyUnits: GameState['units'] extends Map<any, infer U> ? U[] : never,
): ProductionPriority[] {
  const militaryPrototypes = prototypes.filter((prototype) => isMilitaryPrototype(prototype));
  const candidates = militaryPrototypes.length > 0 ? militaryPrototypes : prototypes;
  const faction = state.factions.get(factionId);
  if (!faction) {
    return [];
  }

  return candidates
    .map((prototype) => {
      const domains = getDomainIdsByTags(prototype.tags ?? []);
      const baseCost = getUnitCost(prototype.chassisId);
      const totalCost = calculatePrototypeCost(baseCost, faction, domains);
      const supplyEfficiency = scoreSupplyEfficiency(prototype, registry);
      const forceProjection = scoreForceProjectionValue(prototype, strategy);
      const role = prototype.derivedStats.role ?? 'melee';
      const enemyCounterPressure = scoreEnemyCounterPressure(enemyUnits, state, role);
      const score = 1000 - totalCost * 100 + supplyEfficiency * 10 + forceProjection * 0.25 + enemyCounterPressure * 0.3;
      return {
        prototypeId: prototype.id,
        score,
        reason: `rush phase, cheapest military push, cost ${totalCost}, efficiency ${supplyEfficiency.toFixed(2)}`,
      };
    })
    .sort((left, right) => right.score - left.score || left.prototypeId.localeCompare(right.prototypeId));
}
