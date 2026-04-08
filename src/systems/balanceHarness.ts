import { buildMvpScenario } from '../game/buildMvpScenario.js';
import { getMvpFactionConfigs } from '../game/scenarios/mvp.js';
import type { RulesRegistry } from '../data/registry/types.js';
import type { FactionId } from '../types.js';
import type { MapGenerationMode } from '../world/map/types.js';
import type { BalanceOverrides } from '../balance/types.js';
import { getBattleCount, getKillCount } from './historySystem.js';
import {
  assertSettlementOwnershipConsistency,
  getFactionCityCount,
  getFactionVillageCount,
} from './factionOwnershipSystem.js';
import {
  createSimulationTrace,
  getVictoryStatus,
  runWarEcologySimulation,
  type SimulationTrace,
  type VictoryType,
} from './warEcologySimulation.js';

export const SMOKE_HARNESS_SEEDS = [11, 23, 37, 41, 59, 73, 89, 97, 101, 131] as const;
export const STRATIFIED_HARNESS_SEEDS_BY_ARCHETYPE = {
  jungle_warfare: [1, 2, 7],
  harsh_frontier: [3, 4, 5],
  open_war: [11, 13, 56],
  coastal: [124, 170, 173],
} as const;
export const STRATIFIED_HARNESS_SEEDS = Object.values(STRATIFIED_HARNESS_SEEDS_BY_ARCHETYPE).flat() as number[];
export const DEFAULT_HARNESS_TURNS = 150;

export interface SeedEventCounts {
  battles: number;
  kills: number;
  cityCaptures: number;
  villagesRazored: number;
  siegesStarted: number;
  siegeBreaks: number;
  codificationsStarted: number;
  codificationsCompleted: number;
  poisonTicks: number;
  jungleAttrition: number;
  villageCaptures: number; // Pirate greedy village captures
  unitCaptures: number; // Slaver unit captures
}

export interface UnitComposition {
  /** chassisId → living count (e.g. infantry_frame: 3, cavalry_frame: 2) */
  byChassis: Record<string, number>;
  /** role → living count (e.g. melee: 5, mounted: 2, ranged: 1) */
  byRole: Record<string, number>;
}

export interface FactionSeedMetrics {
  factionId: string;
  livingUnits: number;
  cities: number;
  villages: number;
  warExhaustion: number;
  capabilityTotal: number;
  unlockedRecipes: number;
  routedUnits: number;
  signatureUnits: number;
  homeTerrainUnits: number;
  unitComposition: UnitComposition;
}

export interface SeedBalanceMetrics {
  seed: number;
  maxTurns: number;
  mapMode: MapGenerationMode;
  mapArchetype: string;
  finalRound: number;
  winnerFactionId: string | null;
  victoryType: VictoryType;
  unresolved: boolean;
  livingUnits: number;
  routedUnits: number;
  totalWarExhaustion: number;
  eventCounts: SeedEventCounts;
  factions: Record<string, FactionSeedMetrics>;
}

export interface FactionBatchMetrics {
  factionId: string;
  wins: number;
  avgLivingUnits: number;
  avgCities: number;
  avgVillages: number;
  avgWarExhaustion: number;
  avgCapabilityTotal: number;
  avgUnlockedRecipes: number;
  avgRoutedUnits: number;
  avgSignatureUnits: number;
  avgHomeTerrainUnits: number;
  avgUnitComposition: UnitComposition;
}

export interface BatchBalanceSummary {
  seeds: number[];
  maxTurns: number;
  mapMode: MapGenerationMode;
  totalSeeds: number;
  decisiveGames: number;
  unresolvedGames: number;
  avgFinalRound: number;
  avgLivingUnits: number;
  avgRoutedUnits: number;
  avgTotalWarExhaustion: number;
  totalBattles: number;
  totalKills: number;
  totalCityCaptures: number;
  totalVillagesRazored: number;
  totalSiegesStarted: number;
  totalSiegeBreaks: number;
  totalCodificationsStarted: number;
  totalCodificationsCompleted: number;
  totalPoisonTicks: number;
  totalJungleAttrition: number;
  totalVillageCaptures: number;
  totalUnitCaptures: number;
  mapArchetypes: Record<string, number>;
  factions: Record<string, FactionBatchMetrics>;
}

function roundMetric(value: number): number {
  return Number(value.toFixed(3));
}

function countTraceEvents(trace: SimulationTrace): SeedEventCounts {
  return {
    battles: trace.lines.filter((line) => line.includes('fought')).length,
    kills: 0, // Not available in trace; use totalKills from unit history
    cityCaptures: trace.lines.filter((line) => line.includes('captured by')).length,
    villagesRazored: trace.lines.filter((line) => line.includes('razed')).length,
    siegesStarted: trace.lines.filter((line) => line.includes('is now besieged')).length,
    siegeBreaks: trace.lines.filter((line) => line.includes('siege broken')).length,
    codificationsStarted: trace.lines.filter((line) => line.includes('starts codifying')).length,
    codificationsCompleted: trace.lines.filter((line) => line.includes(' codified ')).length,
    poisonTicks: trace.lines.filter((line) => line.includes('suffers poison')).length,
    jungleAttrition: trace.lines.filter((line) => line.includes('suffers jungle attrition')).length,
    villageCaptures: trace.lines.filter((line) => line.includes('CAPTURED village')).length,
    unitCaptures: trace.lines.filter((line) => line.includes('CAPTURED') && !line.includes('village')).length,
  };
}

function classifyMapArchetype(state: ReturnType<typeof buildMvpScenario>): string {
  const counts = Array.from(state.map?.tiles.values() ?? []).reduce<Record<string, number>>((acc, tile) => {
    acc[tile.terrain] = (acc[tile.terrain] ?? 0) + 1;
    return acc;
  }, {});

  const river = counts['river'] ?? 0;
  const coast = counts['coast'] ?? 0;
  const jungle = counts['jungle'] ?? 0;
  const open = (counts['plains'] ?? 0) + (counts['savannah'] ?? 0);
  const harsh = (counts['desert'] ?? 0) + (counts['tundra'] ?? 0);

  if (jungle >= Math.max(river, coast) && jungle >= open / 3) {
    return 'jungle_warfare';
  }
  if (river >= coast && river >= harsh && river >= open / 2) {
    return 'river_rich';
  }
  if (coast > river && coast >= harsh) {
    return 'coastal';
  }
  if (harsh > open / 2) {
    return 'harsh_frontier';
  }
  return 'open_war';
}

function countSignatureUnits(state: ReturnType<typeof buildMvpScenario>, factionId: FactionId): number {
  const faction = state.factions.get(factionId);
  if (!faction) {
    return 0;
  }

  return faction.unitIds.reduce((sum, unitId) => {
    const unit = state.units.get(unitId);
    const prototype = unit ? state.prototypes.get(unit.prototypeId) : undefined;
    if (!unit || unit.hp <= 0 || !prototype) {
      return sum;
    }

    const tags = new Set(prototype.tags ?? []);
    switch (factionId) {
      case 'jungle_clan' as FactionId:
        return sum + (tags.has('poison') ? 1 : 0);
      case 'druid_circle' as FactionId:
        return sum + (tags.has('druid') ? 1 : 0);
      case 'steppe_clan' as FactionId:
        return sum + (tags.has('warlord') ? 1 : 0);
      case 'hill_clan' as FactionId:
        return sum + (tags.has('fortress') ? 1 : 0);
      case 'coral_people' as FactionId:
        // Galley (transport tag) is the signature unit; ranged_naval_frame is the starter
        return sum + (tags.has('transport') ? 1 : 0);
      case 'desert_nomads' as FactionId:
        return sum + (tags.has('camel') ? 1 : 0);
      case 'savannah_lions' as FactionId:
        return sum + (tags.has('elephant') ? 1 : 0);
      case 'plains_riders' as FactionId:
        return sum + (tags.has('river') || tags.has('amphibious') ? 1 : 0);
      case 'frost_wardens' as FactionId:
        return sum + (tags.has('cold') || tags.has('endurance') ? 1 : 0);
      default:
        return sum;
    }
  }, 0);
}

function getFactionMetrics(state: ReturnType<typeof buildMvpScenario>, factionId: FactionId): FactionSeedMetrics {
  const faction = state.factions.get(factionId);
  if (!faction) {
    return {
      factionId,
      livingUnits: 0,
      cities: 0,
      villages: 0,
      warExhaustion: 0,
      capabilityTotal: 0,
      unlockedRecipes: 0,
      routedUnits: 0,
      signatureUnits: 0,
      homeTerrainUnits: 0,
      unitComposition: { byChassis: {}, byRole: {} },
    };
  }

  const livingUnits = faction.unitIds
    .map((unitId) => state.units.get(unitId))
    .filter((unit): unit is NonNullable<typeof unit> => Boolean(unit && unit.hp > 0));
  const routedUnits = livingUnits.filter((unit) => unit.routed).length;
  const capabilityTotal = Object.values(faction.capabilities?.domainLevels ?? {})
    .reduce((sum, amount) => sum + amount, 0);

  const homeTerrainUnits = livingUnits.filter((unit) => {
    const terrain = state.map?.tiles.get(`${unit.position.q},${unit.position.r}`)?.terrain;
    return terrain === faction.identityProfile.homeBiome;
  }).length;

  const unitComposition = collectUnitComposition(state, livingUnits);

  return {
    factionId,
    livingUnits: livingUnits.length,
    cities: getFactionCityCount(state, factionId),
    villages: getFactionVillageCount(state, factionId),
    warExhaustion: state.warExhaustion.get(factionId)?.exhaustionPoints ?? 0,
    capabilityTotal: roundMetric(capabilityTotal), // Raw aggregate, not normalized for balance.
    unlockedRecipes: faction.capabilities?.unlockedRecipeIds.length ?? 0,
    routedUnits,
    signatureUnits: countSignatureUnits(state, factionId),
    homeTerrainUnits,
    unitComposition,
  };
}

function collectUnitComposition(
  state: ReturnType<typeof buildMvpScenario>,
  livingUnits: NonNullable<ReturnType<typeof state.units.get>>[]
): UnitComposition {
  const byChassis: Record<string, number> = {};
  const byRole: Record<string, number> = {};

  for (const unit of livingUnits) {
    const prototype = state.prototypes.get(unit.prototypeId);
    if (!prototype) continue;

    byChassis[prototype.chassisId] = (byChassis[prototype.chassisId] ?? 0) + 1;
    byRole[prototype.derivedStats.role] = (byRole[prototype.derivedStats.role] ?? 0) + 1;
  }

  return { byChassis, byRole };
}

function averageUnitComposition(compositions: UnitComposition[]): UnitComposition {
  const byChassis: Record<string, number> = {};
  const byRole: Record<string, number> = {};
  const n = compositions.length || 1;

  for (const comp of compositions) {
    for (const [chassis, count] of Object.entries(comp.byChassis)) {
      byChassis[chassis] = (byChassis[chassis] ?? 0) + count / n;
    }
    for (const [role, count] of Object.entries(comp.byRole)) {
      byRole[role] = (byRole[role] ?? 0) + count / n;
    }
  }

  // Round to 1 decimal place for readability
  for (const key of Object.keys(byChassis)) byChassis[key] = roundMetric(byChassis[key] * 10) / 10;
  for (const key of Object.keys(byRole)) byRole[key] = roundMetric(byRole[key] * 10) / 10;

  return { byChassis, byRole };
}

export function collectSeedBalanceMetrics(
  seed: number,
  registry: RulesRegistry,
  maxTurns = DEFAULT_HARNESS_TURNS,
  mapMode: MapGenerationMode = 'fixed',
  balanceOverrides?: BalanceOverrides
): SeedBalanceMetrics {
  const factionConfigs = getMvpFactionConfigs(balanceOverrides);
  const initialState = buildMvpScenario(seed, { mapMode, registry, balanceOverrides });
  const trace = createSimulationTrace();
  const finalState = runWarEcologySimulation(initialState, registry, maxTurns, trace);
  assertSettlementOwnershipConsistency(finalState);
  const livingUnits = Array.from(finalState.units.values()).filter((unit) => unit.hp > 0);
  const routedUnits = livingUnits.filter((unit) => unit.routed).length;
  const factions = Object.fromEntries(
    factionConfigs.map((config) => {
      const factionId = config.id as FactionId;
      return [config.id, getFactionMetrics(finalState, factionId)];
    })
  );

  const totalBattles = Array.from(finalState.units.values())
    .reduce((sum, unit) => sum + getBattleCount(unit), 0);
  const totalKills = Array.from(finalState.units.values())
    .reduce((sum, unit) => sum + getKillCount(unit), 0);
  const traceCounts = countTraceEvents(trace);

  const victoryStatus = getVictoryStatus(finalState);
  const winnerFactionId = victoryStatus.winnerFactionId;
  const unresolved = victoryStatus.victoryType === 'unresolved';

  return {
    seed,
    maxTurns,
    mapMode,
    mapArchetype: classifyMapArchetype(finalState),
    finalRound: finalState.round,
    winnerFactionId,
    victoryType: victoryStatus.victoryType,
    unresolved,
    livingUnits: livingUnits.length,
    routedUnits,
    totalWarExhaustion: roundMetric(
      Array.from(finalState.warExhaustion.values())
        .reduce((sum, entry) => sum + entry.exhaustionPoints, 0)
    ),
    eventCounts: {
      battles: totalBattles,
      kills: totalKills,
      cityCaptures: traceCounts.cityCaptures,
      villagesRazored: traceCounts.villagesRazored,
      siegesStarted: traceCounts.siegesStarted,
      siegeBreaks: traceCounts.siegeBreaks,
      codificationsStarted: traceCounts.codificationsStarted,
      codificationsCompleted: traceCounts.codificationsCompleted,
      poisonTicks: traceCounts.poisonTicks,
      jungleAttrition: traceCounts.jungleAttrition,
      villageCaptures: traceCounts.villageCaptures,
      unitCaptures: traceCounts.unitCaptures,
    },
    factions,
  };
}

export function runBalanceHarness(
  registry: RulesRegistry,
  seeds: readonly number[] = SMOKE_HARNESS_SEEDS,
  maxTurns = DEFAULT_HARNESS_TURNS,
  mapMode: MapGenerationMode = 'fixed',
  balanceOverrides?: BalanceOverrides
): BatchBalanceSummary {
  const factionConfigs = getMvpFactionConfigs(balanceOverrides);
  const runs = seeds.map((seed) => collectSeedBalanceMetrics(seed, registry, maxTurns, mapMode, balanceOverrides));
  const factionIds = factionConfigs.map((config) => config.id);

  const factions = Object.fromEntries(
    factionIds.map((factionId) => {
      const factionRuns = runs.map((run) => run.factions[factionId]);
      const wins = runs.filter((run) => run.winnerFactionId === factionId).length;

      return [
        factionId,
        {
          factionId,
          wins,
          avgLivingUnits: roundMetric(factionRuns.reduce((sum, run) => sum + run.livingUnits, 0) / runs.length),
          avgCities: roundMetric(factionRuns.reduce((sum, run) => sum + run.cities, 0) / runs.length),
          avgVillages: roundMetric(factionRuns.reduce((sum, run) => sum + run.villages, 0) / runs.length),
          avgWarExhaustion: roundMetric(factionRuns.reduce((sum, run) => sum + run.warExhaustion, 0) / runs.length),
          avgCapabilityTotal: roundMetric(factionRuns.reduce((sum, run) => sum + run.capabilityTotal, 0) / runs.length),
          avgUnlockedRecipes: roundMetric(factionRuns.reduce((sum, run) => sum + run.unlockedRecipes, 0) / runs.length),
          avgRoutedUnits: roundMetric(factionRuns.reduce((sum, run) => sum + run.routedUnits, 0) / runs.length),
          avgSignatureUnits: roundMetric(factionRuns.reduce((sum, run) => sum + run.signatureUnits, 0) / runs.length),
          avgHomeTerrainUnits: roundMetric(factionRuns.reduce((sum, run) => sum + run.homeTerrainUnits, 0) / runs.length),
          avgUnitComposition: averageUnitComposition(factionRuns.map((run) => run.unitComposition)),
        } satisfies FactionBatchMetrics,
      ];
    })
  );

  const mapArchetypes = runs.reduce<Record<string, number>>((acc, run) => {
    acc[run.mapArchetype] = (acc[run.mapArchetype] ?? 0) + 1;
    return acc;
  }, {});

  return {
    seeds: [...seeds],
    maxTurns,
    mapMode,
    totalSeeds: runs.length,
    decisiveGames: runs.filter((run) => !run.unresolved).length,
    unresolvedGames: runs.filter((run) => run.unresolved).length,
    avgFinalRound: roundMetric(runs.reduce((sum, run) => sum + run.finalRound, 0) / runs.length),
    avgLivingUnits: roundMetric(runs.reduce((sum, run) => sum + run.livingUnits, 0) / runs.length),
    avgRoutedUnits: roundMetric(runs.reduce((sum, run) => sum + run.routedUnits, 0) / runs.length),
    avgTotalWarExhaustion: roundMetric(
      runs.reduce((sum, run) => sum + run.totalWarExhaustion, 0) / runs.length
    ),
    totalBattles: runs.reduce((sum, run) => sum + run.eventCounts.battles, 0),
    totalKills: runs.reduce((sum, run) => sum + run.eventCounts.kills, 0),
    totalCityCaptures: runs.reduce((sum, run) => sum + run.eventCounts.cityCaptures, 0),
    totalVillagesRazored: runs.reduce((sum, run) => sum + run.eventCounts.villagesRazored, 0),
    totalSiegesStarted: runs.reduce((sum, run) => sum + run.eventCounts.siegesStarted, 0),
    totalSiegeBreaks: runs.reduce((sum, run) => sum + run.eventCounts.siegeBreaks, 0),
    totalCodificationsStarted: runs.reduce((sum, run) => sum + run.eventCounts.codificationsStarted, 0),
    totalCodificationsCompleted: runs.reduce((sum, run) => sum + run.eventCounts.codificationsCompleted, 0),
    totalPoisonTicks: runs.reduce((sum, run) => sum + run.eventCounts.poisonTicks, 0),
    totalJungleAttrition: runs.reduce((sum, run) => sum + run.eventCounts.jungleAttrition, 0),
    totalVillageCaptures: runs.reduce((sum, run) => sum + run.eventCounts.villageCaptures, 0),
    totalUnitCaptures: runs.reduce((sum, run) => sum + run.eventCounts.unitCaptures, 0),
    mapArchetypes,
    factions,
  };
}

export function runStratifiedBalanceHarness(
  registry: RulesRegistry,
  maxTurns = DEFAULT_HARNESS_TURNS,
  mapMode: MapGenerationMode = 'fixed',
  balanceOverrides?: BalanceOverrides
): BatchBalanceSummary {
  return runBalanceHarness(registry, STRATIFIED_HARNESS_SEEDS, maxTurns, mapMode, balanceOverrides);
}
