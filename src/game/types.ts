// Game state types - re-exports and extends domain entities
import type { RNGState } from '../core/rng.js';
import type { GameStatus } from '../core/enums.js';

// Re-export domain entities
export type { Faction, FactionResearch, CombatRecord, WarExhaustion } from '../features/factions/types.js';
export type { Unit, HistoryEntry } from '../features/units/types.js';
export type { City, ProductionItem } from '../features/cities/types.js';
export type { Village } from '../features/villages/types.js';
export type { Prototype, UnitStats } from '../features/prototypes/types.js';
export type { Improvement } from '../features/improvements/types.js';
export type { ResearchState, ResearchUnlock } from '../features/research/types.js';
export type { FactionEconomy, ResourceYield, TerrainYieldDef } from '../features/economy/types.js';

// Re-export IDs
export type { FactionId, UnitId, CityId, VillageId, PrototypeId, ImprovementId, ChassisId, ComponentId, ResearchNodeId } from '../types.js';
export type { HexCoord } from '../types.js';

// Import for GameState composition
import type { FactionId, UnitId, CityId, VillageId, PrototypeId, ImprovementId } from '../types.js';
import type { Faction } from '../features/factions/types.js';
import type { FactionResearch } from '../features/factions/types.js';
import type { Unit } from '../features/units/types.js';
import type { City } from '../features/cities/types.js';
import type { Village } from '../features/villages/types.js';
import type { Prototype } from '../features/prototypes/types.js';
import type { Improvement } from '../features/improvements/types.js';
import type { ResearchState } from '../features/research/types.js';
import type { FactionEconomy } from '../features/economy/types.js';
import type { WarExhaustion } from '../features/factions/types.js';
import type { GameMap } from '../world/map/types.js';
import type { FactionStrategy } from '../systems/factionStrategy.js';
import type { TransportMap } from '../systems/transportSystem.js';
import type { VillageCaptureCooldownMap } from '../systems/villageCaptureSystem.js';
import type { FactionFogState } from '../systems/fogSystem.js';

// Main game state
export interface GameState {
  seed: number;
  round: number;
  turnNumber: number;
  activeFactionId: FactionId | null;
  status: GameStatus;
  map?: GameMap;
  factions: Map<FactionId, Faction>;
  factionResearch: Map<FactionId, FactionResearch>;
  units: Map<UnitId, Unit>;
  cities: Map<CityId, City>;
  villages: Map<VillageId, Village>;
  prototypes: Map<PrototypeId, Prototype>;
  improvements: Map<ImprovementId, Improvement>;
  research: Map<FactionId, ResearchState>;
  economy: Map<FactionId, FactionEconomy>;
  warExhaustion: Map<FactionId, WarExhaustion>;
  factionStrategies: Map<FactionId, FactionStrategy>;
  poisonTraps: Map<string, { damage: number; slow: number; ownerFactionId: FactionId }>;
  contaminatedHexes: Set<string>;
  transportMap: TransportMap;
  villageCaptureCooldowns: VillageCaptureCooldownMap;
  fogState: Map<FactionId, FactionFogState>;
  rngState: RNGState;
}
