// Apply synergy effects to combat and healing via primitive dispatch.

import {
  SynergyCombatResult,
  type ActiveSynergy,
  type ActiveTripleStack,
  type CombatContext,
  type HealingContext,
} from './synergyTypes.js';
import { resolvePrimitives } from './primitiveDispatcher.js';

export {
  SynergyCombatResult,
} from './synergyTypes.js';
export type {
  CombatContext,
  HealingContext,
  AppliedStatus,
  MapSpawn,
} from './synergyTypes.js';
export type CombatResult = SynergyCombatResult;

export function makeEmptyResult(): SynergyCombatResult {
  return new SynergyCombatResult();
}

// --- Public API ---

export function applyCombatSynergies(
  context: CombatContext,
  synergies: ActiveSynergy[],
  tripleStack: ActiveTripleStack | null,
): SynergyCombatResult {
  const result = makeEmptyResult();

  for (const synergy of synergies) {
    resolvePrimitives(synergy.effects, context, result);
  }

  if (tripleStack) {
    resolvePrimitives(tripleStack.emergentRule.effects, context, result);
  }

  if (context.isStealthAttack && context.attackerTags.includes('stealth')) {
    result.stats.set('damage', Math.floor(result.getStat('damage') * 1.5));
    result.additionalEffects.push('ambush_damage');
  }

  return result;
}

export function applyHealingSynergies(
  context: HealingContext,
  synergies: ActiveSynergy[],
): number {
  let healAmount = context.baseHeal;

  for (const synergy of synergies) {
    for (const p of synergy.effects) {
      if (p.kind === 'heal') {
        switch (p.mode) {
          case 'flat':
            healAmount += p.amount;
            break;
          case 'percentMaxHp':
          case 'percentDamage':
            healAmount += Math.floor(context.baseHeal * p.amount);
            break;
        }
      }
      if (p.kind === 'statMod' && p.stat === 'heavyRegenPercent') {
        healAmount += Math.max(1, Math.floor(context.baseHeal * p.value));
      }
    }
  }

  return healAmount;
}
