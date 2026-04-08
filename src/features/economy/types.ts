// Economy types - resource production and supply for war-civ-2

import type { FactionId } from '../../types.js';

export interface ResourceYield {
  production: number;
  supply: number;
}

export interface FactionEconomy {
  factionId: FactionId;
  productionPool: number;
  supplyIncome: number;
  supplyDemand: number;
}

export interface TerrainYieldDef {
  terrainId: string;
  productionYield: number;
}

export function createFactionEconomy(factionId: FactionId): FactionEconomy {
  return {
    factionId,
    productionPool: 0,
    supplyIncome: 0,
    supplyDemand: 0,
  };
}

export function emptyResourceYield(): ResourceYield {
  return { production: 0, supply: 0 };
}
