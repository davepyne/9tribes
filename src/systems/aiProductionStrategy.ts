import type { GameState } from '../game/types.js';
import type { RulesRegistry } from '../data/registry/types.js';
import type { FactionId } from '../types.js';
import type { Prototype } from '../features/prototypes/types.js';
import type { FactionStrategy, ProductionPriority } from './factionStrategy.js';
import { calculatePrototypeCost, getDomainIdsByTags } from './knowledgeSystem.js';
import {
  canPaySettlerVillageCost,
  getAvailableProductionPrototypes,
  getPrototypeCostType,
  getPrototypeQueueCost,
  getPrototypeEconomicProfile,
  getProjectedSupplyDemandWithPrototype,
  getUnitCost,
  isSettlerPrototype,
  SETTLER_VILLAGE_COST,
} from './productionSystem.js';
import { getSupplyDeficit } from './economySystem.js';
import { getVisibleEnemyUnits } from './fogSystem.js';
import { scoreProductionCandidate } from './aiPersonality.js';
import type { DifficultyLevel } from './aiDifficulty.js';
import { usesNormalAiBehavior } from './aiDifficulty.js';

export interface ProductionDecision {
  prototypeId: string;
  chassisId: string;
  cost: number;
  costType: 'production' | 'villages';
  reason: string;
}

interface ProductionScoringContext {
  supplyIncome: number;
  currentSupplyDemand: number;
  currentSupplyDeficit: number;
}

const NORMAL_DOMAIN_PIVOT_DURATION = 3;

export function getSupplyMargin(economy: { supplyIncome: number; supplyDemand: number }): number {
  return Number((economy.supplyIncome - economy.supplyDemand).toFixed(2));
}

export function getProjectedSupplyMarginAfterBuild(
  state: GameState,
  factionId: FactionId,
  prototype: Pick<Prototype, 'chassisId'>,
  registry: RulesRegistry,
): number {
  const economy = state.economy.get(factionId) ?? { supplyIncome: 0, supplyDemand: 0 };
  const projectedDemand = getProjectedSupplyDemandWithPrototype(state, factionId, prototype, registry);
  return Number((economy.supplyIncome - projectedDemand).toFixed(2));
}

export function scoreSupplyEfficiency(prototype: Pick<Prototype, 'chassisId'> & {
  derivedStats: { attack: number; defense: number; hp: number; moves: number; range: number };
}, registry: RulesRegistry): number {
  const economic = getPrototypeEconomicProfile(prototype, registry);
  const combatValue =
    prototype.derivedStats.attack * 1.2 +
    prototype.derivedStats.defense * 1.1 +
    prototype.derivedStats.hp * 0.25 +
    prototype.derivedStats.moves * 0.6 +
    Math.max(0, prototype.derivedStats.range - 1) * 0.9;
  return combatValue / Math.max(0.25, economic.supplyCost);
}

export function scoreForceProjectionValue(
  prototype: {
    tags?: string[];
    derivedStats: { role: string; attack: number; moves: number; range: number };
  },
  strategy: FactionStrategy,
): number {
  const tags = prototype.tags ?? [];
  let score = prototype.derivedStats.attack * 1.1 + prototype.derivedStats.moves * 1.2;

  if (prototype.derivedStats.role === 'mounted') {
    score +=
      strategy.personality.scalars.mobilityBias * 5 +
      strategy.personality.scalars.aggression * 4 +
      strategy.personality.scalars.opportunism * 2;
  }
  if (prototype.derivedStats.role === 'siege' || tags.includes('siege')) {
    score += strategy.personality.scalars.siegeBias * 3;
  }
  if (tags.includes('naval') || tags.includes('transport')) {
    score += strategy.personality.scalars.raidBias * 2;
  }
  if (prototype.derivedStats.range > 1) {
    score += strategy.personality.scalars.caution * 1.5;
  }

  return score;
}

export function rankProductionPriorities(
  state: GameState,
  factionId: FactionId,
  strategy: FactionStrategy,
  registry: RulesRegistry,
  difficulty?: DifficultyLevel,
): ProductionPriority[] {
  const faction = state.factions.get(factionId);
  if (!faction) return [];

  const enemyUnits = getVisibleEnemyUnits(state, factionId).map((entry) => entry.unit);
  const currentRoles = new Map<string, number>();
  let totalFriendlyUnits = 0;
  for (const unit of state.units.values()) {
    if (unit.factionId !== factionId || unit.hp <= 0) continue;
    const prototype = state.prototypes.get(unit.prototypeId);
    if (!prototype) continue;
    totalFriendlyUnits += 1;
    currentRoles.set(prototype.derivedStats.role, (currentRoles.get(prototype.derivedStats.role) ?? 0) + 1);
  }

  const factionEconomy = state.economy.get(factionId) ?? { factionId, productionPool: 0, supplyIncome: 0, supplyDemand: 0 };
  const currentSupplyDeficit = getSupplyDeficit(factionEconomy);
  const scoringContext: ProductionScoringContext = {
    supplyIncome: factionEconomy.supplyIncome,
    currentSupplyDemand: factionEconomy.supplyDemand,
    currentSupplyDeficit,
  };

  const availablePrototypes = getAvailableProductionPrototypes(state, factionId, registry)
    .filter((prototype) => {
      if (!isSettlerPrototype(prototype)) {
        return true;
      }
      if (difficulty === 'easy') {
        return false;
      }
      return canPaySettlerVillageCost(state, factionId, SETTLER_VILLAGE_COST);
    });
  if (usesNormalAiBehavior(difficulty) && state.round <= 10) {
    return rankRushProductionPriorities(state, factionId, strategy, registry, availablePrototypes);
  }
  const researchState = state.research.get(factionId);
  const recentCodifiedDomains =
    usesNormalAiBehavior(difficulty)
    && researchState?.recentCodifiedRound !== undefined
    && state.round - researchState.recentCodifiedRound <= NORMAL_DOMAIN_PIVOT_DURATION
      ? new Set(researchState.recentCodifiedDomainIds ?? [])
      : undefined;

  return availablePrototypes
    .map((prototype) => {
      const role = prototype.derivedStats.role;
      const myRoleCount = currentRoles.get(role) ?? 0;
      const enemyCounterPressure = scoreEnemyCounterPressure(enemyUnits, state, role);
      const desiredRatio = strategy.personality.desiredRoleRatios[role] ?? 0;
      const currentRatio = totalFriendlyUnits > 0 ? myRoleCount / totalFriendlyUnits : 0;
      const roleNeed = Math.max(0, desiredRatio - currentRatio) * 10;
      const postureScore = scorePostureFit(strategy.posture, prototype.tags ?? [], role);
      const identityScore = scoreIdentityFit(faction.identityProfile.signatureUnit, faction.identityProfile.economyAngle, prototype);
      const hybridScore = scoreHybridFit(strategy, prototype);
      const catapultScore = scoreCatapultPreference(factionId, state, strategy, prototype);
      const domains = getDomainIdsByTags(prototype.tags ?? []);
      const codifiedPivotScore = scoreRecentCodifiedDomainPivot(domains, recentCodifiedDomains);
      const settlerScore = scoreSettlerExpansionValue(state, factionId, strategy, prototype, difficulty);
      const baseCost = getUnitCost(prototype.chassisId);
      const totalCost = calculatePrototypeCost(baseCost, faction, domains);
      const economic = getPrototypeEconomicProfile(prototype, registry);
      const projectedSupplyMargin = getProjectedSupplyMarginAfterBuild(state, factionId, prototype, registry);
      const projectedDeficitPenalty = projectedSupplyMargin >= 0 ? 0 : Math.abs(projectedSupplyMargin) * 12;
      const supplyCostPenalty = economic.supplyCost * (2 + scoringContext.currentSupplyDeficit * 1.4);
      const productionCostPenalty = totalCost * 0.18;
      const supplyEfficiencyScore = scoreSupplyEfficiency(prototype, registry) * 0.22;
      const forceProjectionScore = scoreForceProjectionValue(prototype, strategy) * 0.95;
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
      const score =
        postureScore +
        enemyCounterPressure +
        roleNeed +
        identityScore +
        hybridScore +
        catapultScore +
        codifiedPivotScore +
        settlerScore +
        doctrineScore +
        supplyEfficiencyScore +
        forceProjectionScore -
        productionCostPenalty -
        supplyCostPenalty -
        projectedDeficitPenalty;
      const reason = buildProductionReason(
        strategy.posture,
        role,
        totalCost,
        hybridScore,
        enemyCounterPressure,
        roleNeed,
        projectedSupplyMargin,
        codifiedPivotScore,
        settlerScore,
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
    getDomainIdsByTags(prototype.tags ?? [])
  );
  return {
    prototypeId: prototype.id,
    chassisId: prototype.chassisId,
    cost: getPrototypeCostType(prototype) === 'villages'
      ? getPrototypeQueueCost(prototype)
      : cost,
    costType: getPrototypeCostType(prototype),
    reason: best.reason,
  };
}

function rankRushProductionPriorities(
  state: GameState,
  factionId: FactionId,
  strategy: FactionStrategy,
  registry: RulesRegistry,
  prototypes: ReturnType<typeof getAvailableProductionPrototypes>,
): ProductionPriority[] {
  const militaryPrototypes = prototypes.filter((prototype) => isRushMilitaryPrototype(prototype));
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
      const score = 1000 - totalCost * 100 + supplyEfficiency * 10 + forceProjection * 0.25;
      return {
        prototypeId: prototype.id,
        score,
        reason: `normal rush, cheapest military push, cost ${totalCost}, efficiency ${supplyEfficiency.toFixed(2)}`,
      };
    })
    .sort((left, right) => right.score - left.score || left.prototypeId.localeCompare(right.prototypeId));
}

function isRushMilitaryPrototype(
  prototype: NonNullable<GameState['prototypes'] extends Map<any, infer P> ? P : never>,
): boolean {
  const tags = prototype.tags ?? [];
  return prototype.derivedStats.role !== 'support'
    && !tags.includes('transport')
    && !tags.includes('naval')
    && !tags.includes('settler');
}

function scoreSettlerExpansionValue(
  state: GameState,
  factionId: FactionId,
  strategy: FactionStrategy,
  prototype: NonNullable<GameState['prototypes'] extends Map<any, infer P> ? P : never>,
  difficulty?: DifficultyLevel,
): number {
  if (!isSettlerPrototype(prototype)) {
    return 0;
  }
  if (difficulty === 'easy') {
    return Number.NEGATIVE_INFINITY;
  }

  const villageCount = state.factions.get(factionId)?.villageIds.length ?? 0;
  if (villageCount < SETTLER_VILLAGE_COST) {
    return Number.NEGATIVE_INFINITY;
  }

  const postureBonus =
    strategy.posture === 'defensive' ? 10
    : strategy.posture === 'recovery' ? 8
    : strategy.posture === 'balanced' ? 4
    : strategy.posture === 'exploration' ? 2
    : strategy.posture === 'offensive' ? -8
    : -4;

  return (
    strategy.personality.scalars.defenseBias * 14 +
    strategy.personality.scalars.caution * 8 +
    Math.max(0, villageCount - SETTLER_VILLAGE_COST) * 1.5 +
    postureBonus -
    strategy.personality.scalars.aggression * 12 -
    strategy.personality.scalars.siegeBias * 4
  );
}

function scoreCatapultPreference(
  factionId: FactionId,
  state: GameState,
  strategy: FactionStrategy,
  prototype: NonNullable<GameState['prototypes'] extends Map<any, infer P> ? P : never>
): number {
  if (!(prototype.tags ?? []).includes('siege')) return 0;
  const posture = strategy.posture;
  // Hill Clan strongly prefers catapults regardless of posture
  if (factionId === 'hill_clan') {
    const myUnitCount = Array.from(state.units.values()).filter(
      (u) => u.factionId === factionId && u.hp > 0
    ).length;
    const myCityCount = Array.from(state.cities.values()).filter(
      (c) => c.factionId === factionId
    ).length;
    if (myUnitCount >= 2 && myCityCount >= 1) return 6;
    if (myUnitCount >= 2) return 3;
  }
  // All factions get siege bias when in siege or offensive posture
  if (posture === 'siege' || posture === 'offensive') {
    const myUnitCount = Array.from(state.units.values()).filter(
      (u) => u.factionId === factionId && u.hp > 0
    ).length;
    if (myUnitCount >= 3) return 4;
    if (myUnitCount >= 2) return 2;
  }
  return 0;
}

function scoreEnemyCounterPressure(enemyUnits: GameState['units'] extends Map<any, infer U> ? U[] : never, state: GameState, role: string): number {
  let score = 0;
  for (const enemy of enemyUnits) {
    const prototype = state.prototypes.get(enemy.prototypeId);
    const enemyRole = prototype?.derivedStats.role;
    if (!enemyRole) continue;
    if (enemyRole === 'mounted' && role === 'melee') score += 1.5;
    if (enemyRole === 'ranged' && role === 'mounted') score += 1.25;
    if (enemyRole === 'melee' && role === 'ranged') score += 0.75;
    if (enemyRole === 'support' && role !== 'support') score += 0.5;
  }
  return score;
}

function scorePostureFit(posture: FactionStrategy['posture'], tags: string[], role: string): number {
  if (posture === 'recovery' || posture === 'defensive') {
    if (tags.includes('fortress') || role === 'melee') return 5;
    if (role === 'ranged') return 3;
    return 1;
  }
  if (posture === 'siege') {
    if (tags.includes('siege')) return 5;
    if (role === 'melee') return 4;
    if (tags.includes('shock')) return 3;
    return 2;
  }
  if (posture === 'offensive') {
    if (role === 'mounted') return 4;
    if (role === 'ranged') return 3;
    // Bias toward siege units when pushing aggressively to take territory
    if (tags.includes('siege')) return 3;
    if (role === 'melee') return 2;
  }
  return 2;
}

function scoreIdentityFit(signatureUnit: string, economyAngle: string, prototype: NonNullable<GameState['prototypes'] extends Map<any, infer P> ? P : never>): number {
  let score = 0;
  const signature = signatureUnit.toLowerCase();
  const name = prototype.name.toLowerCase();
  const tags = prototype.tags ?? [];
  if (signature.includes('cavalry') && prototype.derivedStats.role === 'mounted') score += 2;
  if (signature.includes('archer') && prototype.derivedStats.role === 'ranged') score += 2;
  if (signature.includes('catapult') && tags.includes('siege')) score += 2;
  if (signature.includes('elephant') && name.includes('elephant')) score += 2;
  if (signature.includes('immortal') && tags.includes('camel')) score += 2;
  if (signature.includes('bear') && name.includes('bear')) score += 2;
  if (signature.includes('galley') && tags.includes('naval')) score += 2;
  if (signature.includes('ship') && tags.includes('naval')) score += 2;
  if (economyAngle.includes('attritional') && tags.includes('poison')) score += 1.5;
  if (economyAngle.includes('mobile') && prototype.derivedStats.moves >= 3) score += 1.5;
  if (economyAngle.includes('siege') && prototype.derivedStats.role === 'melee') score += 1;
  if (economyAngle.includes('raiding') && tags.includes('naval')) score += 1.5;
  if (economyAngle.includes('coastal') && tags.includes('naval')) score += 1.5;
  if (economyAngle.includes('ocean') && tags.includes('transport')) score += 1.5;
  return score;
}

function scoreHybridFit(strategy: FactionStrategy, prototype: NonNullable<GameState['prototypes'] extends Map<any, infer P> ? P : never>): number {
  if (!prototype.sourceRecipeId) return 0;
  let score = strategy.hybridGoal.pursueHybridProduction ? 2.5 : 0.5;
  if (strategy.hybridGoal.preferredRecipeIds.includes(prototype.sourceRecipeId)) {
    score += 3;
  }
  return score;
}

function scoreRecentCodifiedDomainPivot(domains: string[], recentCodifiedDomains?: Set<string>): number {
  if (!recentCodifiedDomains || recentCodifiedDomains.size === 0) {
    return 0;
  }
  const matches = domains.filter((domainId) => recentCodifiedDomains.has(domainId)).length;
  return matches > 0 ? 6 + (matches - 1) * 2 : 0;
}

function buildProductionReason(
  posture: FactionStrategy['posture'],
  role: string,
  cost: number,
  hybridScore: number,
  enemyCounterPressure: number,
  roleNeed: number,
  projectedSupplyMargin: number,
  codifiedPivotScore: number,
  settlerScore: number,
): string {
  if (settlerScore > 0) {
    return `${posture} settler expansion, village-funded growth, score ${settlerScore.toFixed(1)}`;
  }
  const parts = [`${posture} posture`, `${role} role`];
  if (roleNeed > 0.5) parts.push('fills role gap');
  if (enemyCounterPressure > 1) parts.push('counters enemy composition');
  if (hybridScore >= 3) parts.push('hybrid synergy payoff');
  if (codifiedPivotScore > 0) parts.push('recent codified domain pivot');
  if (projectedSupplyMargin < 0) {
    parts.push(`projects supply deficit ${Math.abs(projectedSupplyMargin).toFixed(2)}`);
  } else {
    parts.push(`projects supply margin ${projectedSupplyMargin.toFixed(2)}`);
  }
  parts.push(`cost ${cost}`);
  return parts.join(', ');
}
