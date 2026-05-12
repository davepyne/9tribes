import pairSynergiesData from '../data/pair-synergies.json';
import emergentRulesData from '../data/emergent-rules.json';
import type { PairSynergyData, EmergentRuleData } from '../ui/SynergyCard';

const ALL_PAIRS = (pairSynergiesData.pairSynergies as PairSynergyData[]);
const ALL_RULES = (emergentRulesData.rules as EmergentRuleData[]);

export type ResolvedPairSynergy = {
  data: PairSynergyData;
  domains: [string, string];
};

export type ResolvedActiveSynergies = {
  activePairs: ResolvedPairSynergy[];
  activeTriple: EmergentRuleData | null;
};

export type BackendSynergyState = {
  activeNativePairId?: string;
  activeDoubleStackPairIds?: string[];
  hasActiveTriple?: boolean;
  activeTriplePairIds?: string[];
  activeTripleEmergentRuleId?: string;
};

/**
 * Resolve active synergies from backend-computed state.
 * Uses the faction's actual active synergy fields rather than
 * client-side capability-level thresholds.
 */
export function resolveActiveSynergiesFromBackend(
  state: BackendSynergyState,
): ResolvedActiveSynergies {
  const activePairs: ResolvedPairSynergy[] = [];
  const pairIds = new Set<string>();

  if (state.hasActiveTriple && state.activeTriplePairIds) {
    for (const pairId of state.activeTriplePairIds) {
      pairIds.add(pairId);
    }
  } else {
    if (state.activeNativePairId) {
      pairIds.add(state.activeNativePairId);
    }
    if (state.activeDoubleStackPairIds) {
      for (const pairId of state.activeDoubleStackPairIds) {
        pairIds.add(pairId);
      }
    }
  }

  for (const pairId of pairIds) {
    const data = ALL_PAIRS.find((p) => p.id === pairId);
    if (data) {
      activePairs.push({ data, domains: data.domains as [string, string] });
    }
  }

  let activeTriple: EmergentRuleData | null = null;
  if (state.hasActiveTriple && state.activeTripleEmergentRuleId) {
    activeTriple = ALL_RULES.find((r) => r.id === state.activeTripleEmergentRuleId) ?? null;
  }

  return { activePairs, activeTriple };
}

/**
 * Resolve which pair synergies and emergent triples are active
 * for a faction given its research capabilities.
 */
export function resolveActiveSynergies(
  pairEligibleDomains: string[],
  emergentEligibleDomains: string[],
): ResolvedActiveSynergies {
  const activePairs: ResolvedPairSynergy[] = [];
  for (const synergy of ALL_PAIRS) {
    const [d1, d2] = synergy.domains;
    if (pairEligibleDomains.includes(d1) && pairEligibleDomains.includes(d2)) {
      activePairs.push({ data: synergy, domains: [d1, d2] });
    }
  }

  let activeTriple: EmergentRuleData | null = null;
  for (const rule of ALL_RULES) {
    if (rule.condition === 'default') continue;

    if (rule.domainSets) {
      const categories = Object.keys(rule.domainSets);
      const met = categories.filter((cat) =>
        rule.domainSets![cat]?.some((d) => emergentEligibleDomains.includes(d)),
      ).length;
      if (met >= categories.length && emergentEligibleDomains.length >= 3) {
        activeTriple = rule;
        break;
      }
    }

    if (rule.mobilityDomains) {
      const count = emergentEligibleDomains.filter((d) => rule.mobilityDomains!.includes(d)).length;
      if (count >= 3 && emergentEligibleDomains.length >= 3) {
        activeTriple = rule;
        break;
      }
    }

    if (rule.combatDomains) {
      const count = emergentEligibleDomains.filter((d) => rule.combatDomains!.includes(d)).length;
      if (count >= 3 && emergentEligibleDomains.length >= 3) {
        activeTriple = rule;
        break;
      }
    }
  }

  return { activePairs, activeTriple };
}
