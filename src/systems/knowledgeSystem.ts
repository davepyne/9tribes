// Knowledge Acquisition System - Phase 5
// Factions learn foreign domains through combat exposure, city capture, and proximity

import type { GameState } from '../game/types.js';
import type { FactionId } from '../types.js';
import type { Faction } from '../features/factions/types.js';
import { getNativeDomains } from '../features/factions/types.js';
import type { RulesRegistry } from '../data/registry/types.js';
import { ABILITY_DOMAINS, type AbilityDomainDef } from '../content/domains/index.js';
import pairSynergiesData from '../content/base/pair-synergies.json' with { type: 'json' };
import { recordDomainLearned, recordSynergyPair } from './simulation/traceRecorder.js';
import type { SimulationTrace } from './simulation/traceTypes.js';

// Domain tags to domain ID mapping (sourced from src/content/domains)
type DomainConfig = AbilityDomainDef;

const DOMAINS: Record<string, DomainConfig> = ABILITY_DOMAINS;

// Domains restricted to their native faction only — derived from ability-domains.json
const RESTRICTED_DOMAINS = new Set(
  Object.values(DOMAINS).filter(d => d.restrictedToNative).map(d => d.id),
);

export function isDomainRestricted(domainId: string): boolean {
  return RESTRICTED_DOMAINS.has(domainId);
}

// Exposure thresholds: how many points needed to learn each successive domain via proximity
// Index 0 = first foreign domain (after native), escalating for each subsequent domain
const EXPOSURE_THRESHOLDS = [20, 120, 200, 300, 400, 500, 600, 700, 800] as const;

// Scaled XP cost for ecology-assimilated foreign T1 domains
// 1st foreign domain = 20 XP, 2nd = 40, 3rd = 60, etc.
export function getForeignT1Cost(assimilatedCount: number): number {
  return 20 * (assimilatedCount + 1);
}

// Domain research cost multiplier: each non-native domain costs 33% more per slot
// Native domain = 1.0x, 1st non-native = 1.33x, 2nd = 1.66x, 3rd = 1.99x, etc.
// Position is derived from learnedDomains array (native always at index 0)
export function getDomainCostMultiplier(faction: Faction, domainId: string): number {
  if (getNativeDomains(faction).includes(domainId)) return 1.0;
  const index = faction.learnedDomains.indexOf(domainId);
  const effectiveIndex = index >= 0 ? index : faction.learnedDomains.length;
  return 1 + (effectiveIndex * 0.33);
}

export function getEffectiveXpCost(faction: Faction, domainId: string, baseXpCost: number): number {
  return Math.ceil(baseXpCost * getDomainCostMultiplier(faction, domainId));
}

// Prototype mastery cost multipliers
const PROTOTYPE_COST_MODIFIERS: Record<number, number> = {
  0: 2.0,  // First build - cultural shock
  1: 1.5,  // Second build - rough idea
  2: 1.2,  // Third build - starting to institutionalize
  3: 1.0,  // Fourth+ build - fully integrated
};

const MAX_MASTERY_INDEX = 3; // 3+ builds = 1.0x cost

/**
 * Get the exposure threshold for the next domain to be learned.
 * Based on how many foreign domains the faction already has.
 */
export function getNextExposureThreshold(learnedDomainsCount: number, nativeDomain: string): number {
  // learnedDomains includes native domain already
  // So if learnedDomains = [venom, fortress], foreignCount = 1
  const foreignCount = learnedDomainsCount - 1;
  
  if (foreignCount < 0 || foreignCount >= EXPOSURE_THRESHOLDS.length) {
    return EXPOSURE_THRESHOLDS[EXPOSURE_THRESHOLDS.length - 1];
  }
  
  return EXPOSURE_THRESHOLDS[foreignCount];
}

/**
 * Find which domain (if any) is associated with a given tag.
 * Returns the domain ID or null if not found.
 */
export function getDomainIdByTag(tag: string): string | null {
  for (const [domainId, domain] of Object.entries(DOMAINS)) {
    if (domain.tags.includes(tag)) {
      return domainId;
    }
  }
  return null;
}

/**
 * Get all domain IDs associated with a set of tags.
 */
export function getDomainIdsByTags(tags: string[]): string[] {
  const domainIds = new Set<string>();
  for (const tag of tags) {
    const domainId = getDomainIdByTag(tag);
    if (domainId) {
      domainIds.add(domainId);
    }
  }
  return Array.from(domainIds);
}

/**
 * Check if a domain is foreign to a faction (not native, not already learned).
 */
export function isForeignDomain(faction: Faction, domainId: string): boolean {
  return !getNativeDomains(faction).includes(domainId) && !faction.learnedDomains.includes(domainId);
}

/**
 * Add exposure points to a faction for a specific domain.
 * If the faction has already learned 3 domains (max), exposure is silently lost.
 * 
 * Returns the updated GameState.
 */
export function gainExposure(
  state: GameState,
  factionId: FactionId,
  domainId: string,
  amount: number,
  trace?: SimulationTrace,
  registry?: RulesRegistry
): GameState {
  const faction = state.factions.get(factionId);
  if (!faction) return state;

  // Silently ignore if domain is native or already learned
  if (!isForeignDomain(faction, domainId)) {
    return state;
  }

  // Skip restricted domains (can only be acquired natively)
  if (isDomainRestricted(domainId)) {
    return state;
  }

  const currentExposure = faction.exposureProgress[domainId] ?? 0;
  const threshold = getNextExposureThreshold(faction.learnedDomains.length, faction.nativeDomain);
  const newExposure = currentExposure + amount;

  // Check if domain was just learned
  const wasLearned = currentExposure >= threshold;
  const isNowLearned = newExposure >= threshold;

  // Update exposure progress
  const newExposureProgress = {
    ...faction.exposureProgress,
    [domainId]: newExposure,
  };

  // If newly learned, update learnedDomains and clear exposure
  let newLearnedDomains = faction.learnedDomains;
  let autoCompletedState = state;
  if (isNowLearned && !wasLearned) {
    newLearnedDomains = [...faction.learnedDomains, domainId];

    // Get the domain name for logging
    const domainName = DOMAINS[domainId]?.name ?? domainId;
    const sourceFactionNative = DOMAINS[domainId]?.nativeFaction ?? 'unknown';

    trace?.lines.push(`${faction.name} has learned ${domainName} from ${sourceFactionNative} through exposure!`);

    // Check for synergy with existing learned domains
    let synergyPartner: string | undefined;
    for (const existingDomain of faction.learnedDomains) {
      const synergyPairId = `${existingDomain}+${domainId}`;
      const reversePairId = `${domainId}+${existingDomain}`;
      const synergyExists = (pairSynergiesData.pairSynergies as any[]).some(
        (pair) => pair.id === synergyPairId || pair.id === reversePairId
      );
      if (synergyExists) {
        synergyPartner = existingDomain;
        if (trace) {
          trace.lines.push(`New domain ${DOMAINS[domainId]?.name ?? domainId} synergizes with ${DOMAINS[existingDomain]?.name ?? existingDomain} — potential emergent combination!`);
        }
        break; // Only log once per new domain learned
      }
    }

    recordDomainLearned(trace, {
      round: trace?.currentRound ?? 0,
      factionId,
      domainId,
      domainName,
      source: 'exposure',
      synergizesWith: synergyPartner ? (DOMAINS[synergyPartner]?.name ?? synergyPartner) : undefined,
    });

    // Exposure grants domain awareness (learnedDomains) but NOT T1 auto-complete
    // The domain's T1 must be earned via ecology assimilation at scaled cost
  }

  // Update faction state (use autoCompletedState if research was updated)
  const baseFaction = autoCompletedState.factions.get(factionId) ?? faction;
  const newAcquisitionMethods = isNowLearned && !wasLearned
    ? { ...baseFaction.domainAcquisitionMethod, [domainId]: 'exposure' as const }
    : baseFaction.domainAcquisitionMethod;
  const factions = new Map(autoCompletedState.factions);
  factions.set(factionId, {
    ...baseFaction,
    exposureProgress: newExposureProgress,
    learnedDomains: newLearnedDomains,
    domainAcquisitionMethod: newAcquisitionMethods,
  });

  return {
    ...autoCompletedState,
    factions,
  };
}

/**
 * Check if a faction just learned a new domain this turn.
 * Returns the newly learned domain ID or null.
 * 
 * Note: This is a simpler check that looks at exposure progress reaching threshold.
 * For more complex scenarios, use the gainExposure function which handles the full logic.
 */
export function checkDomainLearned(faction: Faction): string | null {
  const threshold = getNextExposureThreshold(faction.learnedDomains.length, faction.nativeDomain);

  for (const [domainId, exposure] of Object.entries(faction.exposureProgress)) {
    if (exposure >= threshold && isForeignDomain(faction, domainId)) {
      return domainId;
    }
  }

  return null;
}

/**
 * Get the prototype cost modifier for a faction building a unit with a specific domain.
 * 
 * Cost multipliers:
 * - 0 prototypes built with domain = 2.0x
 * - 1 prototype built = 1.5x
 * - 2 prototypes built = 1.2x
 * - 3+ prototypes built = 1.0x (fully integrated)
 */
export function getPrototypeCostModifier(faction: Faction, domainId: string): number {
  const masteryCount = faction.prototypeMastery[domainId] ?? 0;
  
  if (masteryCount >= MAX_MASTERY_INDEX) {
    return PROTOTYPE_COST_MODIFIERS[MAX_MASTERY_INDEX];
  }
  
  return PROTOTYPE_COST_MODIFIERS[masteryCount] ?? 1.0;
}

/**
 * Increment the prototype mastery count for a faction when they build a unit with a domain.
 */
export function incrementPrototypeMastery(
  state: GameState,
  factionId: FactionId,
  domainId: string
): GameState {
  const faction = state.factions.get(factionId);
  if (!faction) return state;

  const currentMastery = faction.prototypeMastery[domainId] ?? 0;
  
  const newPrototypeMastery = {
    ...faction.prototypeMastery,
    [domainId]: currentMastery + 1,
  };

  const factions = new Map(state.factions);
  factions.set(factionId, {
    ...faction,
    prototypeMastery: newPrototypeMastery,
  });

  return {
    ...state,
    factions,
  };
}

/**
 * Get all foreign domain IDs that a faction has exposure progress toward.
 */
export function getExposedDomains(faction: Faction): string[] {
  return Object.keys(faction.exposureProgress).filter(
    domainId => isForeignDomain(faction, domainId)
  );
}

/**
 * Get exposure progress details for a specific domain.
 */
export function getExposureDetails(faction: Faction, domainId: string): { current: number; threshold: number; progress: number } | null {
  if (!isForeignDomain(faction, domainId)) {
    return null;
  }

  const current = faction.exposureProgress[domainId] ?? 0;
  const threshold = getNextExposureThreshold(faction.learnedDomains.length, faction.nativeDomain);
  const progress = threshold > 0 ? Math.min(1, current / threshold) : 0;

  return { current, threshold, progress };
}

/**
 * Whether a prototype is an "unlock" unit (from hybrid-recipes), as opposed to
 * a starting unit or settler. Only unlock prototypes are subject to the cultural-shock
 * mastery cost modifier.
 */
export function isUnlockPrototype(prototype: { sourceRecipeId?: string }): boolean {
  return !!prototype.sourceRecipeId && prototype.sourceRecipeId !== 'settler';
}

/**
 * Calculate total prototype cost with domain mastery modifier applied.
 * Pass a prototype to gate the modifier to unlock prototypes only;
 * omit it to always apply (backwards-compatible).
 */
export function calculatePrototypeCost(baseCost: number, faction: Faction, domainIds: string[], prototype?: { sourceRecipeId?: string }): number {
  if (prototype && !isUnlockPrototype(prototype)) {
    return Math.ceil(baseCost);
  }

  let maxModifier = 1.0;

  for (const domainId of domainIds) {
    const modifier = getPrototypeCostModifier(faction, domainId);
    maxModifier = Math.max(maxModifier, modifier);
  }

  return Math.ceil(baseCost * maxModifier);
}
