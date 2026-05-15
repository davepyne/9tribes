import {
  calculateSynergyAttackBonus,
  calculateSynergyDefenseBonus,
} from '../src/systems/synergyRuntime';
import { makeEmptyResult, type CombatResult } from '../src/systems/synergyEffects';
import type { StatName } from '../src/systems/synergyPrimitives';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResult(stats: Partial<Record<StatName, number>> = {}, additionalEffects: string[] = []): CombatResult {
  const r = makeEmptyResult();
  for (const [k, v] of Object.entries(stats)) {
    if (typeof v === 'number') r.stats.set(k as StatName, v);
  }
  for (const e of additionalEffects) r.additionalEffects.push(e);
  return r;
}

// ---------------------------------------------------------------------------
// calculateSynergyAttackBonus
// ---------------------------------------------------------------------------

describe('calculateSynergyAttackBonus', () => {
  it('returns 0 when multiplierStackValue is 0', () => {
    const result = makeResult();
    expect(calculateSynergyAttackBonus(result)).toBe(0);
  });

  it('returns 0 when multiplierStackValue is absent (default)', () => {
    const result = makeResult();
    expect(calculateSynergyAttackBonus(result)).toBe(0);
  });

  it('extracts bonus from multiplierStackValue 2.0', () => {
    const result = makeResult({ multiplierStackValue: 2.0 });
    expect(calculateSynergyAttackBonus(result)).toBe(1.0);
  });

  it('extracts bonus from multiplierStackValue 1.5', () => {
    const result = makeResult({ multiplierStackValue: 1.5 });
    expect(calculateSynergyAttackBonus(result)).toBe(0.5);
  });

  it('extracts bonus from multiplierStackValue 3', () => {
    const result = makeResult({ multiplierStackValue: 3 });
    expect(calculateSynergyAttackBonus(result)).toBe(2);
  });

  it('extracts bonus from multiplierStackValue 2.5', () => {
    const result = makeResult({ multiplierStackValue: 2.5 });
    expect(calculateSynergyAttackBonus(result)).toBe(1.5);
  });
});

// ---------------------------------------------------------------------------
// calculateSynergyDefenseBonus
// ---------------------------------------------------------------------------

describe('calculateSynergyDefenseBonus', () => {
  it('returns 0 when no structured defense bonuses present', () => {
    const result = makeResult();
    expect(calculateSynergyDefenseBonus(result)).toBe(0);
  });

  it('returns 0 when only unrelated fields are set', () => {
    const result = makeResult({}, ['charge_shield', 'lethal_ambush', 'heavy_poison']);
    expect(calculateSynergyDefenseBonus(result)).toBe(0);
  });

  it('returns dugInDefense value', () => {
    const result = makeResult({ dugInDefense: 0.75 });
    expect(calculateSynergyDefenseBonus(result)).toBe(0.75);
  });

  it('returns auraOverlapDefense value', () => {
    const result = makeResult({ dugInDefense: 0.5 });
    expect(calculateSynergyDefenseBonus(result)).toBe(0.5);
  });

  it('returns sum when both dugInDefense and auraOverlapDefense are set', () => {
    const result = makeResult({ dugInDefense: 0.75 });
    expect(calculateSynergyDefenseBonus(result)).toBe(0.75);
  });

  it('returns sum when both defense bonuses present with unrelated effects', () => {
    const result = makeResult(
      { dugInDefense: 0.75 },
      ['dug_in', 'lethal_ambush', 'heavy_poison', 'aura_overlap'],
    );
    expect(calculateSynergyDefenseBonus(result)).toBe(0.75);
  });

  it('reads defense values directly from structured fields', () => {
    const result = makeResult({ dugInDefense: 0.75 });
    expect(calculateSynergyDefenseBonus(result)).toBe(0.75);
  });
});
