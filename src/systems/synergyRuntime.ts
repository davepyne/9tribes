import type { SynergyCombatResult } from './synergyEffects.js';
import {
  SynergyEngine,
  type ActiveSynergy,
  type DomainConfig,
} from './synergyEngine.js';
import type { FlagName } from './synergyPrimitives.js';
import { getAllAbilityDomains } from '../content/domains/index.js';
import {
  getAllPairSynergies,
  getAllEmergentRules,
} from '../content/synergies/index.js';

let _engine: SynergyEngine | null = null;

export function getSynergyEngine(): SynergyEngine {
  if (!_engine) {
    _engine = new SynergyEngine(
      [...getAllPairSynergies()],
      [...getAllEmergentRules()],
      getAllAbilityDomains() as DomainConfig[],
    );
  }
  return _engine;
}

type FactionSynergyState = {
  activeTripleStack?: { pairs: ActiveSynergy[]; emergentRule?: { effects: readonly { kind: string; flag?: string }[] } };
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

/**
 * Check if a faction's active emergent rule sets a specific flag.
 * Used by non-combat systems (e.g. zocSystem) to read emergent effects
 * without needing a SynergyCombatResult.
 */
export function factionHasEmergentFlag(
  faction: FactionSynergyState | null | undefined,
  flagName: FlagName,
): boolean {
  const effects = faction?.activeTripleStack?.emergentRule?.effects;
  if (!effects) return false;
  return effects.some(e => e.kind === 'setFlag' && e.flag === flagName);
}
