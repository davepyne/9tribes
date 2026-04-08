// Village entity types
// Villages are auto-spawning settlement outcroppings driven by military stability.
// Simpler than cities: no production queue, just provide production bonus to faction.

import type { VillageId, FactionId } from '../../types.js';
import type { HexCoord } from '../../types.js';

export interface Village {
  id: VillageId;
  factionId: FactionId;
  position: HexCoord;
  name: string;
  foundedRound: number;
  productionBonus: number;
  supplyBonus: number;
}
