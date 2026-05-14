// Core resolution engine for ability domain synergies

import type {
  DomainConfig,
  PairSynergyConfig,
  EmergentRuleConfig,
  SynergyEffect,
  EmergentEffect,
  ActiveSynergy,
  ActiveDoubleStack,
  ActiveTripleStack,
} from './synergyTypes.js';

export type {
  DomainConfig,
  PairSynergyConfig,
  EmergentRuleConfig,
  SynergyEffect,
  EmergentEffect,
  ActiveSynergy,
  ActiveDoubleStack,
  ActiveTripleStack,
};

export class SynergyEngine {
  constructor(
    private pairSynergies: PairSynergyConfig[],
    private emergentRules: EmergentRuleConfig[],
    private abilityDomains: DomainConfig[],
  ) {}

  /**
   * Get a synergy score (0-3) indicating how well two domains complement each other.
   * Higher = more strategic to pursue.
   * Based on emergent rules: if two domains appear together in any emergent rule condition,
   * they have synergy potential (score 2+). Score 3 = direct pair in a pair synergy.
   */
  getDomainSynergyScore(domainA: string, domainB: string): number {
    // First check if there's a direct pair synergy between these two domains
    for (const synergy of this.pairSynergies) {
      const [d1, d2] = synergy.domains;
      if ((d1 === domainA && d2 === domainB) || (d1 === domainB && d2 === domainA)) {
        // Check if this pair forms part of an emergent triple (high value)
        for (const rule of this.emergentRules) {
          if (this.ruleMentionsBothDomains(domainA, domainB, rule)) {
            return 3; // Direct pair + emergent potential = highest synergy
          }
        }
        return 2; // Direct pair synergy exists
      }
    }

    // Check if both domains appear together in any emergent rule
    for (const rule of this.emergentRules) {
      if (this.ruleMentionsBothDomains(domainA, domainB, rule)) {
        return 2; // Both appear in same emergent rule
      }
    }

    // Check if they share a category (both combat, both mobility, etc.)
    const categoryA = this.getDomainCategory(domainA);
    const categoryB = this.getDomainCategory(domainB);
    if (categoryA && categoryA === categoryB) {
      return 1; // Same category = minor synergy
    }

    return 0; // No synergy
  }

  /**
   * Get the category of a domain (combat, mobility, healing, terrain, summoning).
   */
  private getDomainCategory(domainId: string): string | null {
    for (const rule of this.emergentRules) {
      if (rule.domainSets) {
        for (const [category, domains] of Object.entries(rule.domainSets)) {
          if (domains.includes(domainId)) {
            return category;
          }
        }
      }
      if (rule.mobilityDomains?.includes(domainId)) return 'mobility';
      if (rule.combatDomains?.includes(domainId)) return 'combat';
    }
    return null;
  }

  /**
   * Check if an emergent rule mentions both domains (in any of its domain sets).
   */
  private ruleMentionsBothDomains(domainA: string, domainB: string, rule: EmergentRuleConfig): boolean {
    if (rule.domainSets) {
      const allRuleDomains = Object.values(rule.domainSets).flat();
      return allRuleDomains.includes(domainA) && allRuleDomains.includes(domainB);
    }
    if (rule.mobilityDomains) {
      return rule.mobilityDomains.includes(domainA) && rule.mobilityDomains.includes(domainB);
    }
    if (rule.combatDomains) {
      return rule.combatDomains.includes(domainA) && rule.combatDomains.includes(domainB);
    }
    return false;
  }

  /**
   * Get all domains that synergize well with a given domain (score >= 2).
   */
  getHighSynergyDomains(domainId: string): string[] {
    const highSynergy: string[] = [];
    for (const abilityDomain of this.abilityDomains) {
      if (abilityDomain.id !== domainId) {
        const score = this.getDomainSynergyScore(domainId, abilityDomain.id);
        if (score >= 2) {
          highSynergy.push(abilityDomain.id);
        }
      }
    }
    return highSynergy;
  }

  // Given a unit's tags, resolve all active pair synergies
  resolveUnitPairs(unitTags: string[]): ActiveSynergy[] {
    const active: ActiveSynergy[] = [];
    const unitTagCounts = new Map<string, number>();
    for (const tag of unitTags) {
      unitTagCounts.set(tag, (unitTagCounts.get(tag) ?? 0) + 1);
    }
    for (const synergy of this.pairSynergies) {
      const requiredTagCounts = new Map<string, number>();
      for (const tag of synergy.requiredTags) {
        requiredTagCounts.set(tag, (requiredTagCounts.get(tag) ?? 0) + 1);
      }
      const hasAllTags = [...requiredTagCounts.entries()].every(
        ([tag, count]) => (unitTagCounts.get(tag) ?? 0) >= count,
      );
      if (hasAllTags) {
        active.push({
          pairId: synergy.id,
          name: synergy.name,
          domains: synergy.domains,
          effect: synergy.effect,
        });
      }
    }
    return active;
  }

  // Resolve the native domain's self-pair (e.g., nature_healing+nature_healing).
  // Returns null if no self-pair exists for the given domain.
  resolveNativeSelfPair(nativeDomain: string): ActiveSynergy | null {
    for (const synergy of this.pairSynergies) {
      if (synergy.domains[0] === nativeDomain && synergy.domains[1] === nativeDomain) {
        return {
          pairId: synergy.id,
          name: synergy.name,
          domains: synergy.domains as [string, string],
          effect: synergy.effect,
        };
      }
    }
    return null;
  }

  // Resolve the faction double stack: native domain + exactly 1 foreign domain.
  // Returns only the cross-pair(s) — no self-pairs included.
  resolveFactionDouble(
    nativeDomain: string,
    pairEligibleDomains: string[],
  ): ActiveDoubleStack | null {
    const foreignDomains = pairEligibleDomains.filter(d => d !== nativeDomain);
    if (foreignDomains.length !== 1) return null;
    const foreignDomain = foreignDomains[0];

    // Find cross-pairs (one domain is native, other is foreign)
    const crossPairs: ActiveSynergy[] = [];
    for (const synergy of this.pairSynergies) {
      const [d1, d2] = synergy.domains;
      if (
        (d1 === nativeDomain && d2 === foreignDomain) ||
        (d1 === foreignDomain && d2 === nativeDomain)
      ) {
        crossPairs.push({
          pairId: synergy.id,
          name: synergy.name,
          domains: synergy.domains as [string, string],
          effect: synergy.effect,
        });
      }
    }

    if (crossPairs.length === 0) return null;
    return { domains: [nativeDomain, foreignDomain], pairs: crossPairs };
  }

  // Resolve the faction triple stack using tier-qualified domain sets.
  // Triples fire based on faction-level domain achievement — no unit-tag gate.
  // The faction earned 3 domains; any unit in that faction benefits.
  resolveFactionTriple(
    pairEligibleDomains: string[],
    emergentEligibleDomains: string[],
  ): ActiveTripleStack | null {
    if (emergentEligibleDomains.length < 3) {
      return null;
    }

    const pairIds = this.resolveFactionPairIds(pairEligibleDomains);
    const pairs = pairIds.map(id => this.pairSynergies.find(s => s.id === id)!).filter(Boolean).map(s => ({
      pairId: s.id,
      name: s.name,
      domains: s.domains,
      effect: s.effect,
    }));

    const emergent = this.resolveEmergentRule(emergentEligibleDomains);
    if (!emergent) {
      return null;
    }

    const tripleName = emergent.name;

    const domainTriple: [string, string, string] = [
      emergentEligibleDomains[0],
      emergentEligibleDomains[1],
      emergentEligibleDomains[2],
    ];

    return {
      domains: domainTriple,
      pairs,
      emergentRule: emergent,
      name: tripleName,
    };
  }

  // Given a faction's learned domains, resolve ALL active pair IDs
  // (pairs activate when a unit has BOTH domain tags)
  resolveFactionPairIds(learnedDomains: string[]): string[] {
    const activePairIds: string[] = [];
    for (const synergy of this.pairSynergies) {
      const [domain1, domain2] = synergy.domains;
      if (learnedDomains.includes(domain1) && learnedDomains.includes(domain2)) {
        activePairIds.push(synergy.id);
      }
    }
    return activePairIds;
  }

  private resolveEmergentRule(domains: string[]): EmergentRuleConfig | null {
    for (const rule of this.emergentRules) {
      if (this.ruleMatches(domains, rule)) {
        return rule;
      }
    }
    return null;
  }

  private ruleMatches(domains: string[], rule: EmergentRuleConfig): boolean {
    // Format: 'contains_X AND contains_Y AND ...', 'contains_3_X', or 'default'.
    const parts = rule.condition.split(' AND ');
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed === 'default') {
        return true;
      }
      const match3 = RE_CONTAINS_3.exec(trimmed);
      if (match3) {
        const category = match3[1];
        const domainList = getCategoryDomainList(rule, category);
        if (!domainList) return false;
        const count = domains.filter(d => domainList.includes(d)).length;
        if (count < 3) return false;
        continue;
      }
      const match = RE_CONTAINS.exec(trimmed);
      if (match && rule.domainSets) {
        const category = match[1];
        const categoryDomains = rule.domainSets[category];
        if (!categoryDomains || !categoryDomains.some(d => domains.includes(d))) {
          return false;
        }
        continue;
      }
      return false;
    }
    return true;
  }

}

const CATEGORY_DOMAIN_KEYS: Record<string, keyof EmergentRuleConfig> = {
  mobility: 'mobilityDomains',
  combat: 'combatDomains',
};

const RE_CONTAINS_3 = /^contains_3_(.+)$/;
const RE_CONTAINS = /^contains_(.+)$/;

function getCategoryDomainList(rule: EmergentRuleConfig, category: string): string[] | undefined {
  const key = CATEGORY_DOMAIN_KEYS[category];
  return key ? (rule[key] as string[] | undefined) : undefined;
}

