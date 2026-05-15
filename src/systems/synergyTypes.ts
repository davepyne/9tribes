// Shared types for the synergy system.
// Extracted from synergyEngine.ts and synergyEffects.ts to break circular deps
// and provide a single import site for all synergy-related types.

import type {
  PrimitiveEffect, StatName, FlagName, VerbName, StatusName, EffectTypeName,
} from './synergyPrimitives.js';

// --- From synergyEngine.ts ---

export interface DomainConfig {
  id: string;
  name: string;
  nativeFaction: string;
  tags: string[];
  baseEffect: unknown;
}

export interface PairSynergyConfig {
  id: string;
  name: string;
  domains: [string, string];
  requiredTags: string[];
  effects: PrimitiveEffect[];
  description: string;
  friendlyFlavor: string;
  enemyFlavor: string;
}

export interface EmergentRuleConfig {
  id: string;
  name: string;
  condition: string;
  domainSets?: Record<string, string[]>;
  mobilityDomains?: string[];
  combatDomains?: string[];
  /** Per-combat effects only. Faction-scoped tuning (zone radii, terraform charges,
   *  economy bonuses, phase distances) belongs in EMERGENT_PARAMS in
   *  `src/systems/emergentRuleParams.ts`. */
  effects: PrimitiveEffect[];
  description: string;
  friendlyFlavor: string;
  enemyFlavor: string;
}

export interface ActiveSynergy {
  pairId: string;
  name: string;
  domains: [string, string];
  effects: PrimitiveEffect[];
}

export interface ActiveDoubleStack {
  domains: [string, string];  // [nativeDomain, foreignDomain]
  pairs: ActiveSynergy[];     // cross-pair(s) only (no self-pairs)
}

export interface ActiveTripleStack {
  domains: [string, string, string];
  pairs: ActiveSynergy[];
  emergentRule: EmergentRuleConfig;
  name: string;
}

// --- Combat context ---

export interface CombatContext {
  attackerId: string;
  defenderId: string;
  attackerTags: string[];
  defenderTags: string[];
  attackerHp: number;
  defenderHp: number;
  terrain: string;
  isCharge: boolean;
  isStealthAttack: boolean;
  isRetreat: boolean;
  isStealthed: boolean;
  position: { x: number; y: number };
  attackerPosition: { x: number; y: number };
  defenderPosition: { x: number; y: number };
  attackerLearnedDomains: string[];
}

// --- Result containers ---

export interface AppliedStatus {
  name: StatusName;
  stacks: number;
  duration: number;
  fields?: Record<string, unknown>;
}

export interface MapSpawn {
  effectType: EffectTypeName;
  position: { x: number; y: number };
  radius?: number;
  duration?: number;
  fields?: Record<string, unknown>;
}

// Generic synergy combat result.
//
// All synergy effects accumulate into a fixed set of containers:
//   - stats:  numeric scalars keyed by StatName
//   - flags:  boolean toggles keyed by FlagName
//   - verbs:  granted action verbs keyed by VerbName
//   - statuses, spawns: discrete effect records
//   - data:   misc non-numeric/non-boolean entries (string lists, etc.)
//   - additionalEffects: dispatch trace for log lines / debugging
//
// Consumers MUST go through helper methods (getStat/hasFlag/...).
// Adding a new synergy never adds a named field anywhere — only entries
// in these containers.
export class SynergyCombatResult {
  readonly stats = new Map<StatName, number>();
  readonly flags = new Set<FlagName>();
  readonly verbs = new Set<VerbName>();
  readonly statuses: AppliedStatus[] = [];
  readonly spawns: MapSpawn[] = [];
  readonly data = new Map<string, unknown>();
  readonly additionalEffects: string[] = [];

  getStat(name: StatName, dflt = 0): number {
    return this.stats.get(name) ?? dflt;
  }

  setStat(name: StatName, value: number): void {
    this.stats.set(name, value);
  }

  hasFlag(name: FlagName): boolean {
    return this.flags.has(name);
  }

  hasVerb(name: VerbName): boolean {
    return this.verbs.has(name);
  }

  findStatus(name: StatusName): AppliedStatus | undefined {
    return this.statuses.find(s => s.name === name);
  }

  getList(key: string): readonly string[] {
    const v = this.data.get(key);
    return Array.isArray(v) ? (v as string[]) : [];
  }

  getSpawns(effectType?: EffectTypeName): readonly MapSpawn[] {
    return effectType ? this.spawns.filter(s => s.effectType === effectType) : this.spawns;
  }
}

export interface HealingContext {
  unitId: string;
  unitTags: string[];
  baseHeal: number;
  position: { q: number; r: number };
  adjacentAllies: string[];
  isStealthed: boolean;
}
