import type { BatchBalanceSummary } from '../systems/balanceHarness.js';

// Survival penalties — factions that can't compete
const NON_VIABLE_UNIT_THRESHOLD = 2;
const NON_VIABLE_CITY_THRESHOLD = 0.3;
const NON_VIABLE_PENALTY_WEIGHT = 2.5;

const NEAR_DEATH_UNIT_MIN = 2;
const NEAR_DEATH_UNIT_MAX = 4;
const NEAR_DEATH_CITY_THRESHOLD = 0.5;
const NEAR_DEATH_PENALTY_WEIGHT = 0.75;

// Activity floor thresholds (below these → penalty)
const MIN_BATTLES_PER_SEED = 8;
const MIN_KILLS_PER_SEED = 4;
const MIN_CODIFICATIONS_PER_SEED = 0.75;
const MIN_SIEGES_PER_SEED = 0.5;

// Activity penalty weights
const BATTLE_DEFICIT_WEIGHT = 0.6;
const KILL_DEFICIT_WEIGHT = 0.8;
const CODIFICATION_DEFICIT_WEIGHT = 2;
const SIEGE_DEFICIT_WEIGHT = 2.5;

// Unresolved game penalties
const UNRESOLVED_HIGH_THRESHOLD = 0.8;
const UNRESOLVED_HIGH_WEIGHT = 25;
const UNRESOLVED_LOW_THRESHOLD = 0.05;
const UNRESOLVED_LOW_WEIGHT = 10;

// Siege composition floor
const MIN_AVG_SIEGE_UNITS = 0.25;
const SIEGE_PRESENCE_WEIGHT = 4;

// Parity metric weights (higher = more important for balance)
const SURVIVAL_RATE_PARITY_WEIGHT = 3.0;
const COMPETITIVE_PARITY_WEIGHT = 4.0;
const KILL_PARITY_WEIGHT = 2.0;
const LIVING_UNIT_PARITY_WEIGHT = 1.5;
const CITY_CONTROL_PARITY_WEIGHT = 2.0;
const RECIPE_PARITY_WEIGHT = 0.8;
const SIGNATURE_PARITY_WEIGHT = 0.5;
const RANGED_SHARE_PARITY_WEIGHT = 1.5;

export interface BalanceObjectiveBreakdown {
  survivalRateStdDev: number;
  competitiveParityStdDev: number;
  killParityStdDev: number;
  livingUnitStdDev: number;
  cityControlStdDev: number;
  recipeStdDev: number;
  signatureStdDev: number;
  rangedShareStdDev: number;
  siegePresencePenalty: number;
  survivalPenalty: number;
  nearDeathPenalty: number;
  inactivityPenalty: number;
  unresolvedPenalty: number;
  score: number;
}

function roundMetric(value: number): number {
  return Number(value.toFixed(6));
}

function stdDev(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  return Math.sqrt(variance);
}

export function scoreBalanceSummary(summary: BatchBalanceSummary): BalanceObjectiveBreakdown {
  const factionMetrics = Object.values(summary.factions);
  const totalSeeds = Math.max(1, summary.totalSeeds);
  const unresolvedRate = summary.unresolvedGames / totalSeeds;

  // 1. Survival rate parity — fraction of games each faction survives with units intact.
  //    Unlike win rate, this fires in every game (not just decisive ones) and is a direct
  //    measure of whether a faction can compete at all.
  const survivalRates = factionMetrics.map((f) => f.survivedGames / totalSeeds);
  const survivalRateStdDev = stdDev(survivalRates);

  // 2. Competitive parity — each faction's army×territory product vs the batch mean.
  //    Captures whether factions are genuinely competitive in both military strength
  //    and territorial control simultaneously. Ratios near 1.0 = balanced.
  const competitiveProducts = factionMetrics.map((f) => f.avgLivingUnits * f.avgCities);
  const meanProduct = competitiveProducts.reduce((s, v) => s + v, 0) / competitiveProducts.length;
  const competitiveRatios = meanProduct > 0
    ? competitiveProducts.map((p) => p / meanProduct)
    : competitiveProducts.map(() => 1);
  const competitiveParityStdDev = stdDev(competitiveRatios);

  // 3. Kill parity — are all factions engaging in combat?
  //    Imbalanced kill counts reveal factions that can't fight (turtle-only) or that
  //    dominate combat (snowballing) even if living-unit counts haven't diverged yet.
  const avgKills = factionMetrics.map((f) => f.avgKills);
  const killParityStdDev = stdDev(avgKills);

  // 4-8. Continuous parity metrics
  const livingUnits = factionMetrics.map((faction) => faction.avgLivingUnits);
  const cityControl = factionMetrics.map((faction) => faction.avgCities);
  const unlockedRecipes = factionMetrics.map((faction) => faction.avgUnlockedRecipes);
  const signatureUnits = factionMetrics.map((faction) => faction.avgSignatureUnits);

  const livingUnitStdDev = stdDev(livingUnits);
  const cityControlStdDev = stdDev(cityControl);
  const recipeStdDev = stdDev(unlockedRecipes);
  const signatureStdDev = stdDev(signatureUnits);

  // 9. Survival penalty: factions that are effectively eliminated
  const nonViableFactions = factionMetrics.filter(
    (f) => f.avgLivingUnits < NON_VIABLE_UNIT_THRESHOLD && f.avgCities < NON_VIABLE_CITY_THRESHOLD,
  ).length;
  const survivalPenalty = nonViableFactions * NON_VIABLE_PENALTY_WEIGHT;

  // 10. Near-death penalty: factions barely hanging on but not totally dead
  const nearDeathFactions = factionMetrics.filter(
    (f) => f.avgLivingUnits >= NEAR_DEATH_UNIT_MIN && f.avgLivingUnits < NEAR_DEATH_UNIT_MAX && f.avgCities < NEAR_DEATH_CITY_THRESHOLD,
  ).length;
  const nearDeathPenalty = nearDeathFactions * NEAR_DEATH_PENALTY_WEIGHT;

  // 11. Activity penalty: the game needs enough combat and progression to be meaningful
  const avgBattlesPerSeed = summary.totalBattles / totalSeeds;
  const avgKillsPerSeed = summary.totalKills / totalSeeds;
  const avgCodificationsPerSeed = summary.totalCodificationsCompleted / totalSeeds;
  const avgSiegesPerSeed = summary.totalSiegesStarted / totalSeeds;
  const inactivityPenalty =
    (avgBattlesPerSeed < MIN_BATTLES_PER_SEED ? (MIN_BATTLES_PER_SEED - avgBattlesPerSeed) * BATTLE_DEFICIT_WEIGHT : 0) +
    (avgKillsPerSeed < MIN_KILLS_PER_SEED ? (MIN_KILLS_PER_SEED - avgKillsPerSeed) * KILL_DEFICIT_WEIGHT : 0) +
    (avgCodificationsPerSeed < MIN_CODIFICATIONS_PER_SEED ? (MIN_CODIFICATIONS_PER_SEED - avgCodificationsPerSeed) * CODIFICATION_DEFICIT_WEIGHT : 0) +
    (avgSiegesPerSeed < MIN_SIEGES_PER_SEED ? (MIN_SIEGES_PER_SEED - avgSiegesPerSeed) * SIEGE_DEFICIT_WEIGHT : 0);

  // 12. Unresolved penalty: too many or too few decisive games
  const unresolvedPenalty =
    (unresolvedRate > UNRESOLVED_HIGH_THRESHOLD ? (unresolvedRate - UNRESOLVED_HIGH_THRESHOLD) * UNRESOLVED_HIGH_WEIGHT : 0) +
    (unresolvedRate < UNRESOLVED_LOW_THRESHOLD ? (UNRESOLVED_LOW_THRESHOLD - unresolvedRate) * UNRESOLVED_LOW_WEIGHT : 0);

  // 13. Composition diversity — ranged/siege balance across factions
  const rangedShares = factionMetrics.map((f) => {
    const total = Object.values(f.avgUnitComposition.byRole).reduce((s, v) => s + v, 0);
    if (total === 0) return 0;
    return (f.avgUnitComposition.byRole['ranged'] ?? 0) / total;
  });
  const rangedShareStdDev = stdDev(rangedShares);

  //    Siege presence: are catapults being built at all?
  const totalLivingUnits = factionMetrics.reduce(
    (sum, f) => sum + Object.values(f.avgUnitComposition.byRole).reduce((s, v) => s + v, 0), 0,
  );
  const avgSiegeUnits = factionMetrics.reduce(
    (sum, f) => sum + (f.avgUnitComposition.byChassis['catapult_frame'] ?? 0), 0,
  ) / factionMetrics.length;
  const siegePresencePenalty = totalLivingUnits > 0 && avgSiegeUnits < MIN_AVG_SIEGE_UNITS
    ? (MIN_AVG_SIEGE_UNITS - avgSiegeUnits) * SIEGE_PRESENCE_WEIGHT
    : 0;

  const score =
    survivalRateStdDev * SURVIVAL_RATE_PARITY_WEIGHT +
    competitiveParityStdDev * COMPETITIVE_PARITY_WEIGHT +
    killParityStdDev * KILL_PARITY_WEIGHT +
    livingUnitStdDev * LIVING_UNIT_PARITY_WEIGHT +
    cityControlStdDev * CITY_CONTROL_PARITY_WEIGHT +
    recipeStdDev * RECIPE_PARITY_WEIGHT +
    signatureStdDev * SIGNATURE_PARITY_WEIGHT +
    rangedShareStdDev * RANGED_SHARE_PARITY_WEIGHT +
    siegePresencePenalty +
    survivalPenalty +
    nearDeathPenalty +
    inactivityPenalty +
    unresolvedPenalty;

  return {
    survivalRateStdDev: roundMetric(survivalRateStdDev),
    competitiveParityStdDev: roundMetric(competitiveParityStdDev),
    killParityStdDev: roundMetric(killParityStdDev),
    livingUnitStdDev: roundMetric(livingUnitStdDev),
    cityControlStdDev: roundMetric(cityControlStdDev),
    recipeStdDev: roundMetric(recipeStdDev),
    signatureStdDev: roundMetric(signatureStdDev),
    rangedShareStdDev: roundMetric(rangedShareStdDev),
    siegePresencePenalty: roundMetric(siegePresencePenalty),
    survivalPenalty: roundMetric(survivalPenalty),
    nearDeathPenalty: roundMetric(nearDeathPenalty),
    inactivityPenalty: roundMetric(inactivityPenalty),
    unresolvedPenalty: roundMetric(unresolvedPenalty),
    score: roundMetric(score),
  };
}
