// Condition evaluator and target resolver for synergy primitives.
// Maps condition/target strings from PrimitiveEffect records to runtime checks.

import type { CombatContext } from './synergyTypes.js';
import type { ConditionSpec, TargetSpec, TriggerSpec } from './synergyPrimitives.js';
import { isWaterTerrain } from './terrainUtils.js';

// ---------------------------------------------------------------------------
// Condition evaluator
// ---------------------------------------------------------------------------

export function evaluateCondition(
  condition: ConditionSpec | undefined,
  context: CombatContext,
): boolean {
  if (condition === undefined) return true;

  // Compound conditions: split on ' AND ', all must pass
  if (condition.includes(' AND ')) {
    return condition.split(' AND ').every(part => evaluateCondition(part.trim(), context));
  }

  // Compound conditions: split on ' OR ', any must pass
  if (condition.includes(' OR ')) {
    return condition.split(' OR ').some(part => evaluateCondition(part.trim(), context));
  }

  // Simple negation
  if (condition.startsWith('!')) {
    return !evaluateCondition(condition.slice(1), context);
  }

  switch (condition) {
    case 'isCharge':       return context.isCharge;
    case 'isStealthAttack': return context.isStealthAttack;
    case 'isRetreat':      return context.isRetreat;
    case 'isStealthed':    return context.isStealthed;
    case 'isWater':        return isWaterTerrain(context.terrain);
    case 'afterRetreat':   return context.isRetreat;

    // Tag checks
    case 'tag:poison':     return context.attackerTags.includes('poison');
    case 'tag:fortress':   return context.attackerTags.includes('fortress');
    case 'tag:elephant':   return context.attackerTags.includes('elephant');
    case 'tag:skirmish':   return context.attackerTags.includes('skirmish');
    case 'tag:naval':      return context.attackerTags.includes('naval');
    case 'tag:stealth':    return context.attackerTags.includes('stealth');
    case 'tag:heavy':      return context.attackerTags.includes('heavy');
    case 'tag:slave':      return context.attackerTags.includes('slave');
    case 'tag:healer':     return context.attackerTags.includes('healer');

    default:
      // Terrain conditions: 'terrain:desert', 'terrain:coast', 'terrain:hill'
      if (condition.startsWith('terrain:')) {
        const terrainType = condition.slice('terrain:'.length);
        // Multi-terrain: 'terrain:desert,coast,hill'
        if (terrainType.includes(',')) {
          return terrainType.split(',').some(t => context.terrain === t.trim());
        }
        return context.terrain === terrainType;
      }

      // HP threshold: 'targetHp<0.25'
      const hpMatch = condition.match(/^targetHp([<>=]+)([\d.]+)$/);
      if (hpMatch) {
        const threshold = parseFloat(hpMatch[2]);
        const defenderHp = context.defenderHp ?? 0;
        switch (hpMatch[1]) {
          case '<':  return defenderHp < threshold;
          case '<=': return defenderHp <= threshold;
          case '>':  return defenderHp > threshold;
          case '>=': return defenderHp >= threshold;
          default:   return false;
        }
      }

      // Fallback: unknown condition → fail-safe false
      return false;
  }
}

// ---------------------------------------------------------------------------
// Target resolver
// ---------------------------------------------------------------------------

export type ResolvedTarget =
  | { kind: 'self' }
  | { kind: 'attacker' }
  | { kind: 'defender' }
  | { kind: 'alliesInRadius'; radius: number }
  | { kind: 'enemiesInRadius'; radius: number }
  | { kind: 'role'; role: string }
  | { kind: 'position' };

export function resolveTarget(target: TargetSpec | undefined): ResolvedTarget {
  if (target === undefined || target === 'self' || target === 'attacker') {
    return { kind: 'self' };
  }
  if (target === 'defender') return { kind: 'defender' };
  if (target === 'position') return { kind: 'position' };

  if (typeof target === 'object') {
    if ('alliesInRadius' in target) return { kind: 'alliesInRadius', radius: target.alliesInRadius };
    if ('enemiesInRadius' in target) return { kind: 'enemiesInRadius', radius: target.enemiesInRadius };
    if ('role' in target) return { kind: 'role', role: target.role };
  }

  return { kind: 'self' };
}

// ---------------------------------------------------------------------------
// Trigger match
// ---------------------------------------------------------------------------

export function triggerMatches(
  trigger: TriggerSpec | undefined,
  event: string,
): boolean {
  if (trigger === undefined) return true;
  if (typeof trigger === 'string') return trigger === event;
  return trigger.event === event;
}
