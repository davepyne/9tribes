// Slim view-model types for synergy data on the frontend. The full
// PairSynergyConfig / EmergentRuleConfig live in
// src/content/synergies/index.ts (backend source of truth). UI components
// project the full types into these narrower shapes when only id/name/
// description (and friends) are needed.

export type PairSynergy = {
  id: string;
  name: string;
  domains: string[];
  description: string;
};

export type EmergentRule = {
  id: string;
  name: string;
  condition: string;
  domainSets: Record<string, string[]>;
  description: string;
};
