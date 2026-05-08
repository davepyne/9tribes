import pairSynergiesData from '../data/pair-synergies.json';
import emergentRulesData from '../data/emergent-rules.json';
import type { PairSynergyData, EmergentRuleData } from '../ui/SynergyCard';

export type ResolvedPairSynergy = {
  data: PairSynergyData;
  domains: [string, string];
};

export type ResolvedActiveSynergies = {
  activePairs: ResolvedPairSynergy[];
  activeTriple: EmergentRuleData | null;
};

/**
 * Resolve which pair synergies and emergent triples are active
 * for a faction given its research capabilities.
 */
export function resolveActiveSynergies(
  pairEligibleDomains: string[],
  emergentEligibleDomains: string[],
): ResolvedActiveSynergies {
  const pairs = (pairSynergiesData.pairSynergies as PairSynergyData[]);
  const rules = (emergentRulesData.rules as EmergentRuleData[]);

  const activePairs: ResolvedPairSynergy[] = [];
  for (const synergy of pairs) {
    const [d1, d2] = synergy.domains;
    if (pairEligibleDomains.includes(d1) && pairEligibleDomains.includes(d2)) {
      activePairs.push({ data: synergy, domains: [d1, d2] });
    }
  }

  let activeTriple: EmergentRuleData | null = null;
  for (const rule of rules) {
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
