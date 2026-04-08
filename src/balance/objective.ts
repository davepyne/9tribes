import type { BatchBalanceSummary } from '../systems/balanceHarness.js';

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
  //    A faction is "non-viable" when it has very low units AND very low cities.
  //    This replaces the old zeroWinPenalty — survival matters more than wins.
  const nonViableFactions = factionMetrics.filter(
    (f) => f.avgLivingUnits < 2 && f.avgCities < 0.3,
  ).length;
  const survivalPenalty = nonViableFactions * 2.5;

  // 2. Near-death penalty: factions barely hanging on but not totally dead
  const nearDeathFactions = factionMetrics.filter(
    (f) => f.avgLivingUnits >= 2 && f.avgLivingUnits < 4 && f.avgCities < 0.5,
  ).length;
  const nearDeathPenalty = nearDeathFactions * 0.75;

  // 3. Runaway penalty: any single faction winning too much
  //    In a 9-faction FFA, fair share is ~11%. Above 25% is a dominance problem.
  //    Quadratic scaling so extreme cases (40%+) are penalized much harder.
  const runawayPenalty = maxWinRate > 0.25
    ? Math.pow(maxWinRate - 0.25, 2) * 40
    : 0;

  // 4. Activity penalty: the game needs enough combat and progression to be meaningful
  const avgBattlesPerSeed = summary.totalBattles / totalSeeds;
  const avgKillsPerSeed = summary.totalKills / totalSeeds;
  const avgCodificationsPerSeed = summary.totalCodificationsCompleted / totalSeeds;
  const avgSiegesPerSeed = summary.totalSiegesStarted / totalSeeds;
  const inactivityPenalty =
    (avgBattlesPerSeed < 8 ? (8 - avgBattlesPerSeed) * 0.6 : 0) +
    (avgKillsPerSeed < 4 ? (4 - avgKillsPerSeed) * 0.8 : 0) +
    (avgCodificationsPerSeed < 0.75 ? (0.75 - avgCodificationsPerSeed) * 2 : 0) +
    (avgSiegesPerSeed < 0.5 ? (0.5 - avgSiegesPerSeed) * 2.5 : 0);

  // 5. Unresolved penalty: too many or too few decisive games
  const unresolvedPenalty =
    (unresolvedRate > 0.8 ? (unresolvedRate - 0.8) * 25 : 0) +
    (unresolvedRate < 0.05 ? (0.05 - unresolvedRate) * 10 : 0);

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
  const siegePresencePenalty = totalLivingUnits > 0 && avgSiegeUnits < 0.25
    ? (0.25 - avgSiegeUnits) * 4
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
    winRateStdDev * 6 +
    livingUnitStdDev * 1.5 +
    cityControlStdDev * 2.0 +
    recipeStdDev * 0.8 +
    signatureStdDev * 0.5 +
    rangedShareStdDev * 1.5 +
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
