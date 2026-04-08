export type ReplayBundle = {
  version: number;
  generatedAt: string;
  seed: number;
  maxTurns: number;
  map: {
    width: number;
    height: number;
    hexes: ReplayHex[];
  };
  factions: ReplayFactionSummary[];
  turns: ReplayTurn[];
  victory: ReplayVictory;
};

export type ReplayHex = {
  key: string;
  q: number;
  r: number;
  terrain: string;
};

export type ReplayFactionSummary = {
  id: string;
  name: string;
  color: string;
  nativeDomain: string;
  learnedDomains: string[];
  homeBiome: string;
  signatureUnit: string;
  passiveTrait: string;
  economyAngle: string;
  terrainDependence: string;
  capabilities: Record<string, number>;
};

export type ReplayTurn = {
  round: number;
  snapshotStart: ReplaySnapshot;
  snapshotEnd: ReplaySnapshot;
  events: { round: number; message: string }[];
  combatEvents: ReplayCombatEvent[];
  siegeEvents: ReplaySiegeEvent[];
  aiIntentEvents: ReplayAiIntentEvent[];
  factionStrategyEvents?: ReplayFactionStrategyEvent[];
};

export type ReplaySnapshot = {
  round: number;
  phase: 'start' | 'end';
  factions: ReplayFactionState[];
  units: ReplayUnit[];
  cities: ReplayCity[];
  villages: ReplayVillage[];
  factionTripleStacks: ReplayTripleStack[];
};

export type ReplayFactionState = {
  id: string;
  name: string;
  livingUnits: number;
  cities: number;
  villages: number;
};

export type ReplayUnit = {
  id: string;
  factionId: string;
  prototypeId: string;
  prototypeName: string;
  q: number;
  r: number;
  hp: number;
  maxHp: number;
  attack?: number;
  defense?: number;
  range?: number;
  facing?: number;
};

export type ReplayCity = {
  id: string;
  name: string;
  factionId: string;
  q: number;
  r: number;
  besieged: boolean;
  wallHp: number;
  maxWallHp: number;
  turnsUnderSiege: number;
  turnsSinceCapture: number;
};

export type ReplayVillage = {
  id: string;
  name: string;
  factionId: string;
  q: number;
  r: number;
};

export type ReplayTripleStack = {
  factionId: string;
  domains: string[];
  tripleName: string;
  emergentRule: string;
};

export type ReplayCombatEvent = {
  round: number;
  attackerUnitId: string;
  defenderUnitId: string;
  attackerFactionId: string;
  defenderFactionId: string;
  attackerPrototypeName: string;
  defenderPrototypeName: string;
  attackerDamage: number;
  defenderDamage: number;
  attackerDestroyed: boolean;
  defenderDestroyed: boolean;
  attackerRouted: boolean;
  defenderRouted: boolean;
  attackerFled: boolean;
  defenderFled: boolean;
  summary: string;
  breakdown: {
    modifiers: {
      flankingBonus: number;
      stealthAmbushBonus: number;
      rearAttackBonus: number;
      finalAttackStrength: number;
      finalDefenseStrength: number;
    };
    outcome: {
      attackerDamage: number;
      defenderDamage: number;
    };
    triggeredEffects: {
      label: string;
      detail: string;
      category: 'positioning' | 'ability' | 'synergy' | 'aftermath';
    }[];
  };
};

export type ReplaySiegeEvent = {
  round: number;
  cityId: string;
  cityName: string;
  factionId: string;
  eventType: 'siege_started' | 'siege_broken' | 'wall_damaged' | 'wall_repaired' | 'city_captured';
  wallHP: number;
  maxWallHP: number;
  turnsUnderSiege: number;
  attackerFactionId?: string;
};

export type ReplayAiIntentEvent = {
  round: number;
  factionId: string;
  unitId: string;
  intent: 'retreat' | 'regroup' | 'advance' | 'siege' | 'support';
  from: { q: number; r: number };
  to?: { q: number; r: number };
  reason: string;
  targetUnitId?: string;
  targetCityId?: string;
};

export type ReplayFactionStrategyEvent = {
  round: number;
  factionId: string;
  posture: 'offensive' | 'balanced' | 'defensive' | 'recovery' | 'siege';
  primaryObjective: string;
  reasons: string[];
};

export type ReplayVictory = {
  winnerFactionId: string | null;
  victoryType: string;
  controlledCities: number | null;
  dominationThreshold: number | null;
};
