// Condition evaluator for synergy primitives.

import type { CombatContext } from './synergyTypes.js';
import type { ConditionSpec } from './synergyPrimitives.js';
import { isWaterTerrain } from './terrainUtils.js';

// ---------------------------------------------------------------------------
// Condition evaluator
// ---------------------------------------------------------------------------

const RE_TARGET_HP = /^targetHp([<>=]+)([\d.]+)$/;

export function evaluateCondition(
  condition: ConditionSpec | undefined,
  context: CombatContext,
): boolean {
  if (condition === undefined) return true;

  if (condition.includes(' AND ')) {
    return condition.split(' AND ').every(part => evaluateCondition(part.trim(), context));
  }

  if (condition.includes(' OR ')) {
    return condition.split(' OR ').some(part => evaluateCondition(part.trim(), context));
  }

  if (condition.startsWith('!')) {
    return !evaluateCondition(condition.slice(1), context);
  }

  switch (condition) {
    case 'isCharge':       return context.isCharge;
    case 'isStealthAttack': return context.isStealthAttack;
    case 'isRetreat':      return context.isRetreat;
    case 'isStealthed':    return context.isStealthed;
    case 'isWater':        return isWaterTerrain(context.terrain);
    default:
      // Tag checks: 'tag:xxx' → attackerTags.includes('xxx')
      if (condition.startsWith('tag:')) {
        return context.attackerTags.includes(condition.slice(4));
      }

      // Terrain conditions: 'terrain:desert', multi: 'terrain:desert,coast,hill'
      if (condition.startsWith('terrain:')) {
        const terrainType = condition.slice('terrain:'.length);
        if (terrainType.includes(',')) {
          return terrainType.split(',').some(t => context.terrain === t.trim());
        }
        return context.terrain === terrainType;
      }

      // HP threshold: 'targetHp<0.25'
      const hpMatch = condition.match(RE_TARGET_HP);
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

      return false;
  }
}
