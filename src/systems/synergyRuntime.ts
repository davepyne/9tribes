import type { SynergyCombatResult } from './synergyEffects.js';
import {
  SynergyEngine,
  type ActiveSynergy,
  type DomainConfig,
} from './synergyEngine.js';
import { getAllAbilityDomains } from '../content/domains/index.js';
import {
  getAllPairSynergies,
  getAllEmergentRules,
} from '../content/synergies/index.js';

const synergyEngine: SynergyEngine = new SynergyEngine(
  [...getAllPairSynergies()],
  [...getAllEmergentRules()],
  getAllAbilityDomains() as DomainConfig[],
);

export function getSynergyEngine(): SynergyEngine {
  return synergyEngine;
}

type FactionSynergyState = {
  activeTripleStack?: { pairs: ActiveSynergy[] };
  activeDoubleStack?: { pairs: ActiveSynergy[] };
  activeNativeSelfPair?: ActiveSynergy;
};

export function resolveEffectiveSynergies(
  faction: FactionSynergyState | null | undefined,
  tags: string[],
): ActiveSynergy[] {
  if (faction?.activeTripleStack) return faction.activeTripleStack.pairs;
  const factionWide: ActiveSynergy[] = [];
  if (faction?.activeNativeSelfPair) factionWide.push(faction.activeNativeSelfPair);
  if (faction?.activeDoubleStack) factionWide.push(...faction.activeDoubleStack.pairs);
  if (factionWide.length > 0) return factionWide;
  if (tags.length > 0) return getSynergyEngine().resolveUnitPairs(tags);
  return [];
}

export function calculateSynergyAttackBonus(result: SynergyCombatResult): number {
  const mult = result.getStat('multiplierStackValue');
  if (mult > 0) {
    return mult - 1;
  }
  return 0;
}

export function calculateSynergyDefenseBonus(result: SynergyCombatResult): number {
  return result.getStat('dugInDefense');
}
