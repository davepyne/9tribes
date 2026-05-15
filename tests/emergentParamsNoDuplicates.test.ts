import { describe, it, expect } from 'vitest';
import { EMERGENT_PARAMS } from '../src/systems/emergentRuleParams';
import { EMERGENT_RULES } from '../src/content/synergies/index';

type PrimitiveEffect = { kind: string; stat?: string; value?: number; op?: string };

/**
 * Known coincidental value matches that are NOT duplicates — different effects
 * on different code paths. Each entry: `${ruleId}.${paramKey}=${value}`.
 *
 * These exist because faction-scoped tuning (EMERGENT_PARAMS) and per-combat
 * primitives often land on the same small numbers (0.3, 0.5, etc.) for
 * different mechanical effects.
 */
const KNOWN_COINCIDENCES = new Set([
  // iron_turtle: damageReflection (faction-scoped) vs primitive (per-combat) — different scope
  'iron_turtle.damageReflection=0.5',
  // poison_shadow: poisonCloudDamage (spawn damage) vs poisonTrapDamage (retreat trap) — different effects
  'poison_shadow.poisonCloudDamage=2',
  // standing_stone: anchoredDefenseBonus (aura) vs defense primitive (per-combat) — different scope
  'standing_stone.anchoredDefenseBonus=0.3',
  // slave_empire: captureChanceBonus (faction-scoped) vs emergentCaptureBonus (per-combat) — different scope
  'slave_empire.captureChanceBonus=0.2',
  // raid_camp: captureBonus (zone spawning) vs emergentCaptureBonus (per-combat) — different scope
  'raid_camp.captureBonus=0.3',
]);

/**
 * Invariant 3 enforcement: no emergent rule's per-combat primitive may duplicate
 * a tuning value in EMERGENT_PARAMS. If someone adds a statMod primitive with
 * value X and also adds the same value X under the same rule in EMERGENT_PARAMS,
 * this test fails.
 */
describe('EMERGENT_PARAMS vs emergent-rule primitives', () => {
  it('has no duplicate tuning values between EMERGENT_PARAMS and emergent rule primitives', () => {
    const rules = EMERGENT_RULES;

    const failures: string[] = [];

    for (const rule of rules) {
      const params = (EMERGENT_PARAMS as Record<string, Record<string, unknown>>)[rule.id];
      if (!params) continue;

      // Collect numeric values from this rule's statMod primitives
      const primitiveValues = new Map<number, string>();
      for (const eff of rule.effects as PrimitiveEffect[]) {
        if (eff.kind === 'statMod' && typeof eff.value === 'number') {
          primitiveValues.set(eff.value, eff.stat ?? '(unknown)');
        }
      }

      if (primitiveValues.size === 0) continue;

      // Flatten all numeric values in EMERGENT_PARAMS for this rule
      for (const [paramKey, paramVal] of Object.entries(params)) {
        if (typeof paramVal !== 'number') continue;
        if (KNOWN_COINCIDENCES.has(`${rule.id}.${paramKey}=${paramVal}`)) continue;
        const matchingStat = primitiveValues.get(paramVal);
        if (matchingStat !== undefined) {
          failures.push(
            `Duplicate tuning: ${rule.id}.${paramKey} = ${paramVal} duplicates primitive { stat: '${matchingStat}', value: ${paramVal} }`,
          );
        }
      }
    }

    expect(failures, 'No EMERGENT_PARAMS key should duplicate an emergent rule primitive value').toEqual([]);
  });
});
