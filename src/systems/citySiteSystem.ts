import { getHexesInRange, hexToKey } from '../core/grid.js';
import type { CitySiteBonuses, CitySiteTrait } from '../features/cities/types.js';
import type { City, GameState } from '../game/types.js';
import type { FactionId, HexCoord } from '../types.js';
import type { GameMap, TerrainType } from '../world/map/types.js';
import { getFactionCityIds } from './factionOwnershipSystem.js';

const FRESH_WATER_TERRAINS = new Set<TerrainType>(['river']);
const WOODLAND_TERRAINS = new Set<TerrainType>(['forest', 'jungle']);
const OPEN_LAND_TERRAINS = new Set<TerrainType>(['plains', 'savannah']);

export const CITY_SITE_PRODUCTION_BONUS = 0.5;
export const CITY_SITE_SUPPLY_BONUS = 0.5;
export const CITY_SITE_VILLAGE_COOLDOWN_REDUCTION = 1;

export type SettlementOccupancyBlocker = 'city' | 'village' | 'improvement' | null;

export const EMPTY_CITY_SITE_BONUSES: CitySiteBonuses = {
  productionBonus: 0,
  supplyBonus: 0,
  villageCooldownReduction: 0,
  traits: [
    { key: 'fresh_water', label: 'Fresh Water', effect: 'Village cooldown -1 round', active: false, count: 0 },
    { key: 'woodland', label: 'Woodland', effect: '+0.5 production', active: false, count: 0 },
    { key: 'open_land', label: 'Open Land', effect: '+0.5 supply', active: false, count: 0 },
  ],
};

export function evaluateCitySiteBonuses(
  map: GameMap | undefined,
  position: HexCoord,
  territoryRadius = 2,
): CitySiteBonuses {
  if (!map) {
    return cloneCitySiteBonuses(EMPTY_CITY_SITE_BONUSES);
  }

  const freshWaterCount = countTerrainsInRange(map, position, territoryRadius, FRESH_WATER_TERRAINS);
  const woodlandCount = countTerrainsInRange(map, position, territoryRadius, WOODLAND_TERRAINS);
  const openLandCount = countTerrainsInRange(map, position, territoryRadius, OPEN_LAND_TERRAINS);

  const traits: CitySiteTrait[] = [
    {
      key: 'fresh_water',
      label: 'Fresh Water',
      effect: 'Village cooldown -1 round',
      active: freshWaterCount > 0,
      count: freshWaterCount,
    },
    {
      key: 'woodland',
      label: 'Woodland',
      effect: `+${CITY_SITE_PRODUCTION_BONUS} production`,
      active: woodlandCount > 0,
      count: woodlandCount,
    },
    {
      key: 'open_land',
      label: 'Open Land',
      effect: `+${CITY_SITE_SUPPLY_BONUS} supply`,
      active: openLandCount > 0,
      count: openLandCount,
    },
  ];

  return {
    productionBonus: woodlandCount > 0 ? CITY_SITE_PRODUCTION_BONUS : 0,
    supplyBonus: openLandCount > 0 ? CITY_SITE_SUPPLY_BONUS : 0,
    villageCooldownReduction: freshWaterCount > 0 ? CITY_SITE_VILLAGE_COOLDOWN_REDUCTION : 0,
    traits,
  };
}

export function getCitySiteBonuses(
  city: Pick<City, 'position' | 'territoryRadius' | 'siteBonuses'>,
  map: GameMap | undefined,
): CitySiteBonuses {
  return city.siteBonuses
    ? cloneCitySiteBonuses(city.siteBonuses)
    : evaluateCitySiteBonuses(map, city.position, city.territoryRadius ?? 2);
}

export function createCitySiteBonuses(
  map: GameMap | undefined,
  position: HexCoord,
  territoryRadius = 2,
): CitySiteBonuses {
  return evaluateCitySiteBonuses(map, position, territoryRadius);
}

export function getFactionVillageCooldownReduction(
  state: GameState,
  factionId: FactionId,
): number {
  const map = state.map;
  for (const cityId of getFactionCityIds(state, factionId)) {
    const city = state.cities.get(cityId);
    if (!city) continue;
    if (getCitySiteBonuses(city, map).villageCooldownReduction > 0) {
      return CITY_SITE_VILLAGE_COOLDOWN_REDUCTION;
    }
  }

  return 0;
}

export function getSettlementOccupancyBlocker(
  state: GameState,
  position: HexCoord,
): SettlementOccupancyBlocker {
  for (const city of state.cities.values()) {
    if (city.position.q === position.q && city.position.r === position.r) {
      return 'city';
    }
  }

  for (const village of state.villages.values()) {
    if (village.position.q === position.q && village.position.r === position.r) {
      return 'village';
    }
  }

  for (const improvement of state.improvements.values()) {
    if (improvement.position.q === position.q && improvement.position.r === position.r) {
      return 'improvement';
    }
  }

  return null;
}

export function formatSettlementOccupancyBlocker(
  blocker: SettlementOccupancyBlocker,
): string | undefined {
  switch (blocker) {
    case 'city':
      return 'Blocked by an existing city.';
    case 'village':
      return 'Blocked by an existing village.';
    case 'improvement':
      return 'Blocked by an existing improvement.';
    default:
      return undefined;
  }
}

function countTerrainsInRange(
  map: GameMap,
  position: HexCoord,
  territoryRadius: number,
  terrains: Set<TerrainType>,
): number {
  let count = 0;

  for (const hex of getHexesInRange(position, territoryRadius)) {
    const tile = map.tiles.get(hexToKey(hex));
    if (tile && terrains.has(tile.terrain)) {
      count += 1;
    }
  }

  return count;
}

function cloneCitySiteBonuses(bonuses: CitySiteBonuses): CitySiteBonuses {
  return {
    productionBonus: bonuses.productionBonus,
    supplyBonus: bonuses.supplyBonus,
    villageCooldownReduction: bonuses.villageCooldownReduction,
    traits: bonuses.traits.map((trait) => ({ ...trait })),
  };
}
