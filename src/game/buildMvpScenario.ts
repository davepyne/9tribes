// MVP Scenario Builder - Creates a complete game state from scenario config

import type { GameState, City, Prototype, Improvement, ResearchState, FactionEconomy, Village } from './types.js';
import { createEmptyGameState } from './createGameState.js';
import { generateMvpMap } from '../world/generation/generateMvpMap.js';
import { generateClimateBandMap } from '../world/generation/generateClimateBandMap.js';
import { loadRulesRegistry } from '../data/loader/loadRulesRegistry.js';
import { assemblePrototype } from '../design/assemblePrototype.js';
import { createFactionId, createUnitId, createCityId, createImprovementId, createPrototypeId } from '../core/ids.js';
import { createCombatRecord } from '../features/factions/types.js';
import { isWaterTerrain, isDeepWaterTerrain } from '../systems/terrainUtils.js';
import type { CityId, ChassisId, ComponentId, PrototypeId, UnitId, ImprovementId, FactionId, VillageId } from '../types.js';
import type { Faction } from '../game/types.js';
import { getHexesInRange, getNeighbors, hexToKey } from '../core/grid.js';
import { createResearchState } from '../systems/researchSystem.js';
import { recordUnitCreated } from '../systems/historySystem.js';
import { createCapabilityState } from '../systems/capabilitySystem.js';
import { createFactionEconomy } from '../features/economy/types.js';
import type { Unit } from '../features/units/types.js';
import type { VeteranLevel } from '../core/enums.js';
import type { MapGenerationMode, TerrainType } from '../world/map/types.js';
import type { RulesRegistry } from '../data/registry/types.js';
import type { BalanceOverrides } from '../balance/types.js';
import { getMvpFactionConfigs, getMvpScenarioConfig, getStartingUnits, MVP_IMPROVEMENTS } from './scenarios/mvp.js';
import { createCitySiteBonuses } from '../systems/citySiteSystem.js';

// Mutable version of GameState for one-shot scenario building
export type MutableGameState = GameState & {
  cities: Map<CityId, City>;
  factions: Map<FactionId, Faction>;
  units: Map<UnitId, Unit>;
  prototypes: Map<PrototypeId, Prototype>;
  improvements: Map<ImprovementId, Improvement>;
  research: Map<FactionId, ResearchState>;
  economy: Map<FactionId, FactionEconomy>;
  villages: Map<VillageId, Village>;
};

// ---------------------------------------------------------------------------
// ONE-TIME SETUP WITH INTENTIONAL MUTATION
// This file builds the initial MVP game state (factions, cities, units, map).
// Unlike the rest of the engine (which favors pure-ish functions returning
// new state), this module directly mutates the GameState it's constructing.
// This is a deliberate pattern: scenario setup is a one-shot, linear build
// process — there's no benefit to immutability when no other code reads the
// in-progress state. The mutation is fully contained within this file and
// never leaks into the simulation loop.
// ---------------------------------------------------------------------------

/**
 * Check if a position is valid terrain for a unit with the given chassis.
 * Non-naval units cannot be on deep water (coast/ocean).
 * Naval units must be on water unless amphibious.
 */
function isValidSpawnTerrain(
  state: GameState,
  pos: { q: number; r: number },
  registry: RulesRegistry,
  chassisId: string,
  tags?: string[],
): boolean {
  if (!state.map) return false;
  const tile = state.map.tiles.get(hexToKey(pos));
  if (!tile) return false;
  const terrainDef = registry.getTerrain(tile.terrain);
  if (terrainDef && terrainDef.passable === false) return false;

  const chassis = registry.getChassis(chassisId);
  const isNavalUnit = chassis?.movementClass === 'naval';
  const isAmphibious = tags?.includes('amphibious') ?? false;
  const tid = tile.terrain;
  const isDeepWater = isDeepWaterTerrain(tid);
  const isWater = isWaterTerrain(tid);

  if (isDeepWater && !isNavalUnit) return false;
  if (isNavalUnit && !isWater && !isAmphibious) return false;
  return true;
}

/**
 * Find a valid spawn position near `preferred`, expanding outward in rings.
 * Returns `preferred` itself if already valid.
 */
function findValidSpawnPosition(
  state: GameState,
  preferred: { q: number; r: number },
  registry: RulesRegistry,
  chassisId: string,
  tags?: string[],
  maxRadius: number = 3,
): { q: number; r: number } {
  if (isValidSpawnTerrain(state, preferred, registry, chassisId, tags)) {
    return preferred;
  }
  for (let radius = 1; radius <= maxRadius; radius++) {
    for (const hex of getHexesInRange(preferred, radius)) {
      if (isValidSpawnTerrain(state, hex, registry, chassisId, tags)) {
        return hex;
      }
    }
  }
  return preferred; // fallback
}

export interface BuildMvpScenarioOptions {
  mapMode?: MapGenerationMode;
  mapSize?: 'small' | 'medium' | 'large';
  selectedFactionIds?: string[];
  settlerStartFactionIds?: string[];
  registry?: RulesRegistry;
  balanceOverrides?: BalanceOverrides;
  rerollCap?: number;
}

const MAP_SIZE_DIMENSIONS: Record<NonNullable<BuildMvpScenarioOptions['mapSize']>, { width: number; height: number }> = {
  small: { width: 32, height: 24 },
  medium: { width: 40, height: 30 },
  large: { width: 48, height: 37 },
};

function getClimateBandStartSeparation(
  width: number,
  height: number,
  factionCount: number,
): number {
  if (factionCount <= 0) {
    return 10;
  }

  const areaPerFaction = (width * height) / factionCount;
  return Math.max(5, Math.min(12, Math.round(Math.sqrt(areaPerFaction) * 0.58)));
}

function stampTerrainPatch(
  state: GameState,
  center: { q: number; r: number },
  terrain: TerrainType,
  radius = 2,
  preserveCenter = false,
): void {
  const map = state.map;
  if (!map) {
    return;
  }

  for (const hex of getHexesInRange(center, radius)) {
    if (preserveCenter && hex.q === center.q && hex.r === center.r) continue;
    const tile = map.tiles.get(hexToKey(hex));
    if (tile) {
      tile.terrain = terrain;
    }
  }
}

function initializeFaction(
  state: MutableGameState,
  factionConfig: ReturnType<typeof getMvpFactionConfigs>[number],
  startHex: { q: number; r: number },
  registry: RulesRegistry,
  existingPrototypeIds: string[],
  settlerStartFactionIds: Set<string>,
  options: BuildMvpScenarioOptions,
): void {
  const factionId = createFactionId(factionConfig.id);
  const usesSettlerStart = settlerStartFactionIds.has(factionConfig.id);

  let cityId: CityId | undefined;
  if (!usesSettlerStart) {
    cityId = createCityId();
    state.cities.set(cityId, {
      id: cityId,
      factionId,
      position: startHex,
      name: `${factionConfig.name} Capital`,
      isCapital: true,
      productionQueue: [],
      productionProgress: 0,
      territoryRadius: 2,
      wallHP: 100,
      maxWallHP: 100,
      besieged: false,
      turnsUnderSiege: 0,
      siteBonuses: createCitySiteBonuses(state.map, startHex, 2),
      foundedRound: 0,
    });
  }

  const faction: Faction = {
    id: factionId,
    name: factionConfig.name,
    unitIds: [],
    cityIds: cityId ? [cityId] : [],
    villageIds: [],
    prototypeIds: [],
    identityProfile: {
      homeBiome: factionConfig.homeBiome,
      signatureUnit: factionConfig.signatureUnit,
      passiveTrait: factionConfig.passiveTrait,
      earlyResearchBias: factionConfig.earlyResearchBias,
      naturalPrey: factionConfig.naturalPrey,
      naturalCounter: factionConfig.naturalCounter,
      economyAngle: factionConfig.economyAngle,
      terrainDependence: factionConfig.terrainDependence,
      lateGameHybridPotential: factionConfig.lateGameHybridPotential,
    },
    capabilities: createCapabilityState(factionConfig.capabilitySeeds),
    combatRecord: createCombatRecord(),
    nativeDomain: factionConfig.nativeDomain,
    learnedDomains: Array.from(new Set([
      factionConfig.nativeDomain,
      ...(factionConfig.startingLearnedDomains ?? []),
    ])),
    exposureProgress: {},
    prototypeMastery: {},
    assimilatedDomainCount: 0,
    domainAcquisitionMethod: Object.fromEntries(
      Array.from(new Set([
        factionConfig.nativeDomain,
        ...(factionConfig.startingLearnedDomains ?? []),
      ])).map((d) => [d, d === factionConfig.nativeDomain ? 'native' as const : 'sacrifice' as const]),
    ),
    synergyEligibleDomains: [factionConfig.nativeDomain],
    homeCityId: cityId,
  };
  state.factions.set(factionId, faction);

  // Settler prototype (non-combatant)
  const settlerPrototype = assemblePrototype(
    factionId,
    'infantry_frame' as ChassisId,
    ['basic_spear', 'simple_armor'] as unknown as ComponentId[],
    registry,
    existingPrototypeIds as PrototypeId[],
    {
      faction,
      validation: { ignoreResearchRequirements: true, ignoreProgressionRequirements: true },
      name: 'Settler',
      tags: ['settler'],
      sourceRecipeId: 'settler',
    }
  );
  existingPrototypeIds.push(settlerPrototype.id);
  settlerPrototype.derivedStats = { ...settlerPrototype.derivedStats, attack: 1, defense: 1 };
  state.prototypes.set(settlerPrototype.id, settlerPrototype);
  faction.prototypeIds.push(settlerPrototype.id);

  if (usesSettlerStart) {
    const settlerId = createUnitId();
    let settler: Unit = {
      id: settlerId,
      factionId,
      position: startHex,
      facing: 0,
      hp: settlerPrototype.derivedStats.hp,
      maxHp: settlerPrototype.derivedStats.hp,
      movesRemaining: settlerPrototype.derivedStats.moves,
      maxMoves: settlerPrototype.derivedStats.moves,
      attacksRemaining: 1,
      xp: 0,
      veteranLevel: 'green' as VeteranLevel,
      status: 'ready',
      prototypeId: settlerPrototype.id,
      history: [],
      morale: 100,
      routed: false,
      poisoned: false,
      enteredZoCThisActivation: false,
      poisonStacks: 0,
      poisonTurnsRemaining: 0,
      isStealthed: false,
      turnsSinceStealthBreak: 0,
      learnedAbilities: [],
    };
    settler = recordUnitCreated(settler, factionId, settlerPrototype.id, state.round);
    state.units.set(settlerId, settler);
    faction.unitIds.push(settlerId);
  }

  // Combat units
  const unitConfigs = factionConfig.startingUnits.length > 0
    ? factionConfig.startingUnits
    : getStartingUnits(state.factions.size - 1, options.balanceOverrides);
  for (const unitConfig of unitConfigs) {
    const rawPosition = {
      q: startHex.q + unitConfig.positionOffset.q,
      r: startHex.r + unitConfig.positionOffset.r,
    };

    const prototype = assemblePrototype(
      factionId,
      unitConfig.chassisId as ChassisId,
      unitConfig.componentIds as unknown as ComponentId[],
      registry,
      existingPrototypeIds as PrototypeId[],
      {
        faction,
        name: (unitConfig as { name?: string }).name,
        productionCost: (unitConfig as { costOverride?: number }).costOverride,
        tags: (unitConfig as { tags?: string[] }).tags,
        rangeBonus: (unitConfig as { rangeBonus?: number }).rangeBonus,
        movesBonus: (unitConfig as { movesBonus?: number }).movesBonus,
        validation: { ignoreResearchRequirements: true, ignoreProgressionRequirements: true },
      }
    );
    existingPrototypeIds.push(prototype.id);
    state.prototypes.set(prototype.id, prototype);
    faction.prototypeIds.push(prototype.id);

    const position = findValidSpawnPosition(state, rawPosition, registry, prototype.chassisId, prototype.tags);
    const unitId = createUnitId();
    let unit: Unit = {
      id: unitId,
      factionId,
      position,
      facing: 0,
      hp: prototype.derivedStats.hp,
      maxHp: prototype.derivedStats.hp,
      movesRemaining: prototype.derivedStats.moves,
      maxMoves: prototype.derivedStats.moves,
      attacksRemaining: 1,
      xp: 0,
      veteranLevel: 'green' as VeteranLevel,
      status: 'ready',
      prototypeId: prototype.id,
      history: [],
      morale: 100,
      routed: false,
      poisoned: false,
      enteredZoCThisActivation: false,
      poisonStacks: 0,
      poisonTurnsRemaining: 0,
      isStealthed: false,
      turnsSinceStealthBreak: 0,
      learnedAbilities: [],
    };
    unit = recordUnitCreated(unit, factionId, prototype.id, state.round);
    state.units.set(unitId, unit);
    faction.unitIds.push(unitId);
  }

  // Research, economy
  const researchState = createResearchState(factionId, factionConfig.nativeDomain, factionConfig.researchRate);
  if (factionConfig.startingCompletedResearchNodes?.length) {
    researchState.completedNodes = Array.from(new Set([
      ...researchState.completedNodes,
      ...factionConfig.startingCompletedResearchNodes,
    ])) as typeof researchState.completedNodes;
  }
  state.research.set(factionId, researchState);
  state.economy.set(factionId, createFactionEconomy(factionId));
}

/**
 * Build the complete MVP scenario game state.
 * Creates factions, units, cities, and map with improvements.
 */
export function buildMvpScenario(seed: number, options: BuildMvpScenarioOptions = {}): GameState {
  const baseState = createEmptyGameState(seed);
  const registry = options.registry ?? loadRulesRegistry(options.balanceOverrides);
  const scenarioConfig = getMvpScenarioConfig(options.balanceOverrides);
  const requestedFactionIds = new Set(options.selectedFactionIds ?? []);
  const factionConfigs = getMvpFactionConfigs(options.balanceOverrides).filter((config) =>
    requestedFactionIds.size === 0 || requestedFactionIds.has(config.id)
  );
  const mapMode = options.mapMode ?? scenarioConfig.mapMode;
  const mapSize = options.balanceOverrides?.scenario ? undefined : (options.mapSize ?? 'medium');
  const mapDimensions = mapSize ? MAP_SIZE_DIMENSIONS[mapSize] : undefined;
  const startingPositions = new Map<string, { q: number; r: number }>();
  const settlerStartFactionIds = new Set(options.settlerStartFactionIds ?? []);

  const state: MutableGameState = {
    ...baseState,
    cities: new Map(baseState.cities),
    factions: new Map(baseState.factions),
    units: new Map(baseState.units),
    prototypes: new Map(baseState.prototypes),
    improvements: new Map(baseState.improvements),
    research: new Map(baseState.research),
    economy: new Map(baseState.economy),
  };

  if (mapMode === 'randomClimateBands') {
    const generated = generateClimateBandMap(
      state.rngState,
      factionConfigs.map((config) => ({
        factionId: config.id,
        homeBiome: config.homeBiome as TerrainType,
        terrainBias: config.terrainBias,
      })),
      {
        width: mapDimensions?.width ?? scenarioConfig.mapWidth,
        height: mapDimensions?.height ?? scenarioConfig.mapHeight,
        mode: mapMode,
        startSeparation: getClimateBandStartSeparation(
          mapDimensions?.width ?? scenarioConfig.mapWidth,
          mapDimensions?.height ?? scenarioConfig.mapHeight,
          factionConfigs.length,
        ),
        rerollCap: options.rerollCap ?? 20,
      }
    );
    state.map = generated.map;
    for (const [factionId, position] of Object.entries(generated.startPositions)) {
      startingPositions.set(factionId, position);
    }
  } else {
    state.map = generateMvpMap(
      state.rngState,
      mapDimensions?.width ?? scenarioConfig.mapWidth,
      mapDimensions?.height ?? scenarioConfig.mapHeight
    );

    for (const factionConfig of factionConfigs) {
      const patchRadius = factionConfig.terrainBias === 'jungle' ? 3 : 2;
      // Preserve the city hex as land when stamping coast so land units can spawn adjacent
      const preserveCenter = factionConfig.terrainBias === 'coast';
      stampTerrainPatch(state, factionConfig.startHex, factionConfig.terrainBias, patchRadius, preserveCenter);
      startingPositions.set(factionConfig.id, factionConfig.startHex);
    }

    if (state.map) {
      state.map.metadata = {
        mode: mapMode,
        repairsApplied: 0,
        rerollsUsed: 0,
      };
    }
  }

  // Track existing prototype IDs for unique naming
  const existingPrototypeIds: string[] = [];

  // Build factions, cities, and units
  for (const factionConfig of factionConfigs) {
    const startHex = startingPositions.get(factionConfig.id) ?? factionConfig.startHex;
    initializeFaction(state, factionConfig, startHex, registry, existingPrototypeIds, settlerStartFactionIds, options);
  }

  // Add map improvements (field fort)
  for (const improvement of MVP_IMPROVEMENTS) {
    const improvementId = createImprovementId();
    state.improvements.set(improvementId, {
      id: improvementId,
      type: 'fortification',
      position: improvement.hex,
      ownerFactionId: null,
      defenseBonus: 2,
    });
  }

  return state;
}
