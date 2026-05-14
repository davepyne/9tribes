export type VisibilityState = 'visible' | 'explored' | 'hidden';

export type HexCoord = {
  q: number;
  r: number;
};

export type HexView = {
  key: string;
  q: number;
  r: number;
  terrain: string;
  resource?: string;
  visibility: VisibilityState;
  ownerFactionId: string | null;
  ownerFactionName: string | null;
};

export type FactionView = {
  id: string;
  name: string;
  color: string;
  nativeDomain: string;
  signatureUnit: string;
  economyAngle: string;
  homeCityId?: string;
  learnedDomains?: string[];
  synergyEligibleDomains?: string[];
  activeNativePairId?: string;
  activeDoubleStackPairIds?: string[];
  hasActiveTriple?: boolean;
  activeTriplePairIds?: string[];
  activeTripleEmergentRuleId?: string;
};

export type UnitStatusView = 'ready' | 'fortified' | 'spent' | 'inactive';

export type UnitView = {
  id: string;
  factionId: string;
  factionName: string;
  q: number;
  r: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  effectiveDefense: number;
  range: number;
  movesRemaining: number;
  movesMax: number;
  acted: boolean;
  canAct: boolean;
  isActiveFaction: boolean;
  status: UnitStatusView;
  prototypeId: string;
  prototypeName: string;
  chassisId: string;
  movementClass?: string;
  role?: string;
  spriteKey: string;
  facing: number;
  visible: boolean;
  veteranLevel?: string;
  xp?: number;
  nativeDomain?: string;
  learnedAbilities?: string[];
  isStealthed?: boolean;
  poisoned?: boolean;
  morale: number;
  routed?: boolean;
  preparedAbility?: string;
  isSettler?: boolean;
  canBuildBastion?: boolean;
  canDeclareMaelstrom?: boolean;
  canDestroyFort?: boolean;
  canSacrifice?: boolean;
  canBrace?: boolean;
  canAmbush?: boolean;
  isEmbarked?: boolean;
  transportId?: string | null;
  boardableTransportIds?: string[];
  validDisembarkHexes?: HexCoord[];
  embarkedUnitIds?: string[];
  embarkedValidDisembarkHexes?: HexCoord[];
  supplyCost?: number;
  isPrototype?: boolean;
  summonTurnsRemaining?: number;
  canSummon?: boolean;
  summonName?: string;
  summonBlockedReason?: string;
  isEngineer?: boolean;
};

export type CityView = {
  id: string;
  name: string;
  factionId: string;
  q: number;
  r: number;
  visible: boolean;
  remembered: boolean;
  besieged?: boolean;
  siegeTurnsUntilCapture?: number;
  wallHp?: number;
  maxWallHp?: number;
  turnsSinceCapture?: number;
};

export type VillageView = {
  id: string;
  name: string;
  factionId: string;
  q: number;
  r: number;
  visible: boolean;
  remembered: boolean;
};

export type ImprovementView = {
  id: string;
  type: string;
  q: number;
  r: number;
  ownerFactionId: string | null;
  spriteKey: string;
  visible: boolean;
};

export type BorderSide = 'nw' | 'n' | 'ne' | 'se' | 's' | 'sw';

export type BorderEdgeView = {
  id: string;
  q: number;
  r: number;
  side: BorderSide;
  factionId: string;
  color: string;
};

export type ReachableHexView = {
  key: string;
  q: number;
  r: number;
  cost: number;
  movesRemainingAfterMove: number;
  path: HexCoord[];
  terrainCausesDamage?: boolean;
};

export type AttackTargetView = {
  key: string;
  q: number;
  r: number;
  unitId: string;
  distance: number;
};

export type PathPreviewNodeView = {
  key: string;
  q: number;
  r: number;
  step: number;
};

export type WorldViewModel = {
  activeFactionId: string | null;
  map: {
    width: number;
    height: number;
    hexes: HexView[];
  };
  factions: FactionView[];
  units: UnitView[];
  cities: CityView[];
  villages: VillageView[];
  improvements: ImprovementView[];
  overlays: {
    borders: BorderEdgeView[];
    reachableHexes: ReachableHexView[];
    attackHexes: AttackTargetView[];
    disembarkHexes: ReachableHexView[];
    pathPreview: PathPreviewNodeView[];
    queuedPath: PathPreviewNodeView[];
    lastMove:
      | {
          unitId: string;
          destination: HexCoord;
        }
      | null;
  };
  visibility: {
    mode: 'full' | 'fogged';
    activeFactionId: string | null;
  };
};
