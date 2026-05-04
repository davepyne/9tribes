import type { SynergyCombatResult } from './synergyEffects.js';
import {
  SynergyEngine,
  type DomainConfig,
  type EmergentRuleConfig,
  type PairSynergyConfig,
} from './synergyEngine.js';
import pairSynergiesData from '../content/base/pair-synergies.json' with { type: 'json' };
import abilityDomainsData from '../content/base/ability-domains.json' with { type: 'json' };
import emergentRulesData from '../content/base/emergent-rules.json' with { type: 'json' };

let synergyEngine: SynergyEngine | null = null;

export function getSynergyEngine(): SynergyEngine {
  if (!synergyEngine) {
    synergyEngine = new SynergyEngine(
      pairSynergiesData.pairSynergies as PairSynergyConfig[],
      emergentRulesData.rules as EmergentRuleConfig[],
      Object.values(abilityDomainsData.domains) as DomainConfig[],
    );
  }
  return synergyEngine;
}

export function calculateSynergyAttackBonus(result: SynergyCombatResult): number {
  if (result.multiplierStackValue > 0) {
    return result.multiplierStackValue - 1;
  }
  return 0;
}

export function calculateSynergyDefenseBonus(result: SynergyCombatResult): number {
  return result.dugInDefense + result.auraOverlapDefense;
}
