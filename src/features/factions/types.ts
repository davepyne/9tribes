// Faction entity types
import type { FactionId, UnitId, CityId, VillageId, PrototypeId } from '../../types.js';
import type { ActiveTripleStack, ActiveDoubleStack, ActiveSynergy } from '../../systems/synergyEngine.js';

export type CapabilitySourceType =
  | 'ecology'
  | 'force'
  | 'combat'
  | 'codification'
  | 'contact'
  | 'absorption'
  | 'sacrifice';

export interface CapabilityGain {
  round: number;
  domainId: string;
  amount: number;
  sourceType: CapabilitySourceType;
  sourceDetail: string;
  fromFactionId?: FactionId;
}

export interface LearnedCapabilitySource {
  domainId: string;
  amount: number;
  fromFactionId: FactionId;
  method: 'contact' | 'absorption';
  note: string;
}

export interface CapabilityState {
  domainLevels: Record<string, number>;
  gainHistory: CapabilityGain[];
  learnedSources: LearnedCapabilitySource[];
  codifiedDomains: string[];
  unlockedChassis: string[];
  unlockedComponents: string[];
  unlockedRecipeIds: string[];
}

export interface CombatRecord {
  recentWins: number;
  recentLosses: number;
  lastLossRound: number;
  lastWinRound: number;
  totalEliminations: number;
}

export function createCombatRecord(): CombatRecord {
  return {
    recentWins: 0,
    recentLosses: 0,
    lastLossRound: 0,
    lastWinRound: 0,
    totalEliminations: 0,
  };
}

export interface WarExhaustion {
  factionId: FactionId;
  exhaustionPoints: number;
  turnsWithoutLoss: number;
}

export interface FactionIdentityProfile {
  homeBiome: string;
  signatureUnit: string;
  passiveTrait: string;
  earlyResearchBias: string;
  naturalPrey: string;
  naturalCounter: string;
  economyAngle: string;
  terrainDependence: string;
  lateGameHybridPotential: string;
}

export interface SummonState {
  summoned: boolean;
  turnsRemaining: number;
  cooldownRemaining: number;
  unitId: UnitId | null;
}

export interface Faction {
  id: FactionId;
  name: string;
  unitIds: UnitId[];
  cityIds: CityId[];
  villageIds: VillageId[];
  prototypeIds: PrototypeId[];
  identityProfile: FactionIdentityProfile;
  capabilities?: CapabilityState;
  combatRecord: CombatRecord;
  summonState?: SummonState;
  nativeDomain: string;
  learnedDomains: string[];
  activeTripleStack?: ActiveTripleStack;
  activeDoubleStack?: ActiveDoubleStack;    // native+foreign cross-pair (1 foreign domain eligible)
  activeNativeSelfPair?: ActiveSynergy;     // native self-pair, always active when native T3 done
  juggernautActive?: boolean;
  // Knowledge system tracking (Phase 5)
  exposureProgress: Record<string, number>;  // domainId -> current exposure points
  prototypeMastery: Record<string, number>;  // domainId -> count of prototypes built
  assimilatedDomainCount: number;           // domains learned via ecology assimilation (not sacrifice)
  domainAcquisitionMethod: Record<string, DomainAcquisitionMethod>;  // how each learned domain was acquired
  synergyEligibleDomains: string[];        // domains that activate pair/triple synergies (sacrifice + native only)
  // Home city for sacrifice mechanic - the faction's starting city
  homeCityId?: CityId;
}

export type DomainAcquisitionMethod = 'native' | 'sacrifice' | 'ecology' | 'exposure' | 'absorption';

