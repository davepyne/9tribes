import { ALL_PAIR_SYNERGIES, ALL_EMERGENT_RULES } from '../data/synergyLookup';
import type { PairSynergyData, EmergentRuleData } from '../ui/SynergyCard';

const ALL_PAIRS = ALL_PAIR_SYNERGIES;
const ALL_RULES = ALL_EMERGENT_RULES;

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

