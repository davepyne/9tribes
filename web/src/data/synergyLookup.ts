// Shared frontend projections of the backend synergy catalog.
//
// The single source of truth lives in src/content/synergies/index.ts. UI
// components use the slim PairSynergyData / EmergentRuleData shapes defined
// in ui/SynergyCard.tsx; this module performs the one-shot projection from
// the backend types so every consumer reads from the same in-memory copy.

import {
  PAIR_SYNERGIES as PAIR_SYNERGIES_BACKEND,
  EMERGENT_RULES as EMERGENT_RULES_BACKEND,
} from '../../../src/content/synergies/index';
import type { PairSynergyData, EmergentRuleData } from '../ui/SynergyCard';

export const ALL_PAIR_SYNERGIES: PairSynergyData[] = PAIR_SYNERGIES_BACKEND.map((s) => ({
  id: s.id,
  name: s.name,
  domains: [...s.domains],
  description: s.description,
  friendlyFlavor: s.friendlyFlavor,
  enemyFlavor: s.enemyFlavor,
}));

export const ALL_EMERGENT_RULES: EmergentRuleData[] = EMERGENT_RULES_BACKEND.map((r) => ({
  id: r.id,
  name: r.name,
  condition: r.condition,
  domainSets: r.domainSets,
  mobilityDomains: r.mobilityDomains,
  combatDomains: r.combatDomains,
  effect: { description: r.effect.description },
  friendlyFlavor: r.friendlyFlavor,
  enemyFlavor: r.enemyFlavor,
}));

export const PAIR_SYNERGY_BY_ID = new Map<string, PairSynergyData>(
  ALL_PAIR_SYNERGIES.map((s) => [s.id, s]),
);

export const EMERGENT_RULE_BY_ID = new Map<string, EmergentRuleData>(
  ALL_EMERGENT_RULES.map((r) => [r.id, r]),
);

export function findSynergyById(
  id: string,
): { kind: 'pair'; data: PairSynergyData } | { kind: 'triple'; data: EmergentRuleData } | undefined {
  const pair = PAIR_SYNERGY_BY_ID.get(id);
  if (pair) return { kind: 'pair', data: pair };
  const rule = EMERGENT_RULE_BY_ID.get(id);
  if (rule) return { kind: 'triple', data: rule };
  return undefined;
}
