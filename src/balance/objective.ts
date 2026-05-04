import type { BatchBalanceSummary } from '../systems/balanceHarness.js';

// Survival penalties — factions that can't compete
const NON_VIABLE_UNIT_THRESHOLD = 2;
const NON_VIABLE_CITY_THRESHOLD = 0.3;
const NON_VIABLE_PENALTY_WEIGHT = 2.5;

const NEAR_DEATH_UNIT_MIN = 2;
const NEAR_DEATH_UNIT_MAX = 4;
const NEAR_DEATH_CITY_THRESHOLD = 0.5;
const NEAR_DEATH_PENALTY_WEIGHT = 0.75;

// Runaway leader penalty
const RUNAWAY_WIN_RATE_THRESHOLD = 0.25;
const RUNAWAY_QUADRATIC_MULTIPLIER = 40;

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
const WIN_RATE_PARITY_WEIGHT = 6;
const LIVING_UNIT_PARITY_WEIGHT = 1.5;
const CITY_CONTROL_PARITY_WEIGHT = 2.0;
const RECIPE_PARITY_WEIGHT = 0.8;
const SIGNATURE_PARITY_WEIGHT = 0.5;
const RANGED_SHARE_PARITY_WEIGHT = 1.5;

export interface BalanceObjectiveBreakdown {
  winRateStdDev: number;
  livingUnitStdDev: number;
  cityControlStdDev: number;
  recipeStdDev: number;
  signatureStdDev: number;
  rangedShareStdDev: number;
  siegePresencePenalty: number;
  survivalPenalty: number;
  nearDeathPenalty: number;
  runawayPenalty: number;
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
  const winRates = factionMetrics.map((faction) => faction.wins / totalSeeds);
  const livingUnits = factionMetrics.map((faction) => faction.avgLivingUnits);
  const cityControl = factionMetrics.map((faction) => faction.avgCities);
  const unlockedRecipes = factionMetrics.map((faction) => faction.avgUnlockedRecipes);
  const signatureUnits = factionMetrics.map((faction) => faction.avgSignatureUnits);
  const unresolvedRate = summary.unresolvedGames / totalSeeds;
  const maxWinRate = Math.max(...winRates, 0);

  // 1. Survival penalty: factions that are effectively eliminated
  const nonViableFactions = factionMetrics.filter(
    (f) => f.avgLivingUnits < NON_VIABLE_UNIT_THRESHOLD && f.avgCities < NON_VIABLE_CITY_THRESHOLD,
  ).length;
  const survivalPenalty = nonViableFactions * NON_VIABLE_PENALTY_WEIGHT;

  // 2. Near-death penalty: factions barely hanging on but not totally dead
  const nearDeathFactions = factionMetrics.filter(
    (f) => f.avgLivingUnits >= NEAR_DEATH_UNIT_MIN && f.avgLivingUnits < NEAR_DEATH_UNIT_MAX && f.avgCities < NEAR_DEATH_CITY_THRESHOLD,
  ).length;
  const nearDeathPenalty = nearDeathFactions * NEAR_DEATH_PENALTY_WEIGHT;

  // 3. Runaway penalty: any single faction winning too much
  const runawayPenalty = maxWinRate > RUNAWAY_WIN_RATE_THRESHOLD
    ? Math.pow(maxWinRate - RUNAWAY_WIN_RATE_THRESHOLD, 2) * RUNAWAY_QUADRATIC_MULTIPLIER
    : 0;

  // 4. Activity penalty: the game needs enough combat and progression to be meaningful
  const avgBattlesPerSeed = summary.totalBattles / totalSeeds;
  const avgKillsPerSeed = summary.totalKills / totalSeeds;
  const avgCodificationsPerSeed = summary.totalCodificationsCompleted / totalSeeds;
  const avgSiegesPerSeed = summary.totalSiegesStarted / totalSeeds;
  const inactivityPenalty =
    (avgBattlesPerSeed < MIN_BATTLES_PER_SEED ? (MIN_BATTLES_PER_SEED - avgBattlesPerSeed) * BATTLE_DEFICIT_WEIGHT : 0) +
    (avgKillsPerSeed < MIN_KILLS_PER_SEED ? (MIN_KILLS_PER_SEED - avgKillsPerSeed) * KILL_DEFICIT_WEIGHT : 0) +
    (avgCodificationsPerSeed < MIN_CODIFICATIONS_PER_SEED ? (MIN_CODIFICATIONS_PER_SEED - avgCodificationsPerSeed) * CODIFICATION_DEFICIT_WEIGHT : 0) +
    (avgSiegesPerSeed < MIN_SIEGES_PER_SEED ? (MIN_SIEGES_PER_SEED - avgSiegesPerSeed) * SIEGE_DEFICIT_WEIGHT : 0);

  // 5. Unresolved penalty: too many or too few decisive games
  const unresolvedPenalty =
    (unresolvedRate > UNRESOLVED_HIGH_THRESHOLD ? (unresolvedRate - UNRESOLVED_HIGH_THRESHOLD) * UNRESOLVED_HIGH_WEIGHT : 0) +
    (unresolvedRate < UNRESOLVED_LOW_THRESHOLD ? (UNRESOLVED_LOW_THRESHOLD - unresolvedRate) * UNRESOLVED_LOW_WEIGHT : 0);

  // 6. Composition diversity — ranged/siege balance across factions
  //    Ranged share: fraction of a faction's living units that are ranged.
  //    High std dev means some factions over-rely on ranged while others can't field any.
  const rangedShares = factionMetrics.map((f) => {
    const total = Object.values(f.avgUnitComposition.byRole).reduce((s, v) => s + v, 0);
    if (total === 0) return 0;
    return (f.avgUnitComposition.byRole['ranged'] ?? 0) / total;
  });
  const rangedShareStdDev = stdDev(rangedShares);

  //    Siege presence: are catapults (siege-tagged units) being built at all?
  //    If no faction fields siege units, sieges become pure wall-hp races —
  //    favoring factions with innate wall bonuses (Pirate Lords) and hurting
  //    factions that need siege to break forts.
  const totalLivingUnits = factionMetrics.reduce(
    (sum, f) => sum + Object.values(f.avgUnitComposition.byRole).reduce((s, v) => s + v, 0), 0,
  );
  const avgSiegeUnits = factionMetrics.reduce(
    (sum, f) => sum + (f.avgUnitComposition.byChassis['catapult_frame'] ?? 0), 0,
  ) / factionMetrics.length;
  const siegePresencePenalty = totalLivingUnits > 0 && avgSiegeUnits < MIN_AVG_SIEGE_UNITS
    ? (MIN_AVG_SIEGE_UNITS - avgSiegeUnits) * SIEGE_PRESENCE_WEIGHT
    : 0;

  // 7. Continuous parity metrics — the real balance signals
  //    These measure how evenly distributed health outcomes are across factions.
  //    Weighted higher than win-based metrics because they're more granular.
  const winRateStdDev = stdDev(winRates);
  const livingUnitStdDev = stdDev(livingUnits);
  const cityControlStdDev = stdDev(cityControl);
  const recipeStdDev = stdDev(unlockedRecipes);
  const signatureStdDev = stdDev(signatureUnits);

  const score =
    winRateStdDev * WIN_RATE_PARITY_WEIGHT +
    livingUnitStdDev * LIVING_UNIT_PARITY_WEIGHT +
    cityControlStdDev * CITY_CONTROL_PARITY_WEIGHT +
    recipeStdDev * RECIPE_PARITY_WEIGHT +
    signatureStdDev * SIGNATURE_PARITY_WEIGHT +
    rangedShareStdDev * RANGED_SHARE_PARITY_WEIGHT +
    siegePresencePenalty +
    survivalPenalty +
    nearDeathPenalty +
    runawayPenalty +
    inactivityPenalty +
    unresolvedPenalty;

  return {
    winRateStdDev: roundMetric(winRateStdDev),
    livingUnitStdDev: roundMetric(livingUnitStdDev),
    cityControlStdDev: roundMetric(cityControlStdDev),
    recipeStdDev: roundMetric(recipeStdDev),
    signatureStdDev: roundMetric(signatureStdDev),
    rangedShareStdDev: roundMetric(rangedShareStdDev),
    siegePresencePenalty: roundMetric(siegePresencePenalty),
    survivalPenalty: roundMetric(survivalPenalty),
    nearDeathPenalty: roundMetric(nearDeathPenalty),
    runawayPenalty: roundMetric(runawayPenalty),
    inactivityPenalty: roundMetric(inactivityPenalty),
    unresolvedPenalty: roundMetric(unresolvedPenalty),
    score: roundMetric(score),
  };
}
