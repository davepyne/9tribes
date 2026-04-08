import { hexToKey } from '../../../../src/core/grid.js';
import { buildMvpScenario } from '../../../../src/game/buildMvpScenario.js';
import type { GameState, Unit } from '../../../../src/game/types.js';
import type { FactionId } from '../../../../src/types.js';
import { loadRulesRegistry } from '../../../../src/data/loader/loadRulesRegistry.js';
import type { TerrainType } from '../../../../src/world/map/types.js';
import { serializeGameState, type SerializedGameState } from '../types/playState';

const PLAYTEST_SEED = 42;
const PLAYTEST_FACTIONS = ['druid_circle', 'steppe_clan'] as const;

export function createCuratedPlaytestPayload(): SerializedGameState {
  const registry = loadRulesRegistry();
  const state = buildMvpScenario(PLAYTEST_SEED, {
    registry,
    mapMode: 'fixed',
  });

  curatePlaytestState(state);
  return serializeGameState(state);
}

function curatePlaytestState(state: GameState) {
  const factionIds = new Set<string>(PLAYTEST_FACTIONS);
  const curatedFactions = PLAYTEST_FACTIONS.map((factionId) => {
    const faction = state.factions.get(factionId as never);
    if (!faction) {
      throw new Error(`Missing curated playtest faction: ${factionId}`);
    }
    return [factionId as FactionId, faction] as const;
  });
  state.factions = new Map(curatedFactions);

  state.units = new Map(Array.from(state.units.entries()).filter(([, unit]) => factionIds.has(unit.factionId)));
  state.cities = new Map(Array.from(state.cities.entries()).filter(([, city]) => factionIds.has(city.factionId)));
  state.villages = new Map();
  state.research = new Map(Array.from(state.research.entries()).filter(([factionId]) => factionIds.has(factionId)));
  state.economy = new Map(Array.from(state.economy.entries()).filter(([factionId]) => factionIds.has(factionId)));
  state.warExhaustion = new Map(Array.from(state.warExhaustion.entries()).filter(([factionId]) => factionIds.has(factionId)));
  state.factionResearch = new Map(Array.from(state.factionResearch.entries()).filter(([factionId]) => factionIds.has(factionId)));
  state.factionStrategies = new Map();
  state.improvements = new Map();
  state.poisonTraps = new Map();
  state.contaminatedHexes = new Set();
  state.activeFactionId = null;
  state.round = 1;
  state.turnNumber = 1;

  const usedPrototypeIds = new Set(Array.from(state.units.values()).map((unit) => unit.prototypeId));
  state.prototypes = new Map(Array.from(state.prototypes.entries()).filter(([prototypeId]) => usedPrototypeIds.has(prototypeId)));

  const druidFaction = state.factions.get('druid_circle' as never)!;
  const steppeFaction = state.factions.get('steppe_clan' as never)!;
  druidFaction.villageIds = [];
  steppeFaction.villageIds = [];

  // Unlock hitrun domain for steppe_clan so research can be tested on non-native domains
  if (!steppeFaction.learnedDomains?.includes('hitrun')) {
    steppeFaction.learnedDomains = [...(steppeFaction.learnedDomains ?? []), 'hitrun'];
  }

  const druidCity = state.cities.get(druidFaction.cityIds[0] as never);
  const steppeCity = state.cities.get(steppeFaction.cityIds[0] as never);
  if (!druidCity || !steppeCity) {
    throw new Error('Curated playtest is missing one or more cities.');
  }

  druidCity.position = { q: 8, r: 10 };
  druidCity.name = 'Elder Grove';
  steppeCity.position = { q: 15, r: 10 };
  steppeCity.name = 'Windscar Camp';

  const druidUnits = druidFaction.unitIds
    .map((unitId) => state.units.get(unitId as never))
    .filter((unit): unit is Unit => Boolean(unit));
  const steppeUnits = steppeFaction.unitIds
    .map((unitId) => state.units.get(unitId as never))
    .filter((unit): unit is Unit => Boolean(unit));

  if (druidUnits.length < 2 || steppeUnits.length < 2) {
    throw new Error('Curated playtest requires two units per faction.');
  }

  placeUnit(druidUnits[0], { q: 10, r: 10 });
  placeUnit(druidUnits[1], { q: 9, r: 11 });
  placeUnit(steppeUnits[0], { q: 13, r: 10 });
  placeUnit(steppeUnits[1], { q: 14, r: 9 });

  patchTerrain(state, { q: 8, r: 10 }, 'forest');
  patchTerrain(state, { q: 9, r: 10 }, 'forest');
  patchTerrain(state, { q: 9, r: 11 }, 'forest');
  patchTerrain(state, { q: 10, r: 10 }, 'plains');
  patchTerrain(state, { q: 10, r: 11 }, 'plains');
  patchTerrain(state, { q: 11, r: 10 }, 'plains');
  patchTerrain(state, { q: 11, r: 9 }, 'hill');
  patchTerrain(state, { q: 12, r: 10 }, 'plains');
  patchTerrain(state, { q: 12, r: 9 }, 'savannah');
  patchTerrain(state, { q: 13, r: 10 }, 'plains');
  patchTerrain(state, { q: 13, r: 9 }, 'savannah');
  patchTerrain(state, { q: 14, r: 9 }, 'plains');
  patchTerrain(state, { q: 14, r: 10 }, 'plains');
  patchTerrain(state, { q: 15, r: 10 }, 'plains');
}

function placeUnit(unit: Unit, position: { q: number; r: number }) {
  unit.position = position;
  unit.movesRemaining = unit.maxMoves;
  unit.attacksRemaining = 1;
  unit.status = 'ready';
  unit.enteredZoCThisActivation = false;
  unit.activatedThisRound = false;
}

function patchTerrain(state: GameState, position: { q: number; r: number }, terrain: TerrainType) {
  const tile = state.map?.tiles.get(hexToKey(position));
  if (tile) {
    tile.terrain = terrain;
  }
}
