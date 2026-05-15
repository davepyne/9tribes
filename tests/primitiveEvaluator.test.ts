import { describe, it, expect } from 'vitest';
import { evaluateCondition } from '../src/systems/primitiveEvaluator.js';
import type { ConditionSpec } from '../src/systems/synergyPrimitives.js';
import type { CombatContext } from '../src/systems/synergyTypes.js';

function makeContext(overrides: Partial<CombatContext> = {}): CombatContext {
  return {
    attackerId: 'a1',
    defenderId: 'd1',
    attackerTags: [],
    defenderTags: [],
    attackerHp: 100,
    defenderHp: 100,
    terrain: 'plains',
    isCharge: false,
    isStealthAttack: false,
    isRetreat: false,
    isStealthed: false,
    position: { x: 0, y: 0 },
    attackerPosition: { x: 0, y: 0 },
    defenderPosition: { x: 1, y: 1 },
    ...overrides,
  };
}

describe('evaluateCondition', () => {
  it('returns true for undefined condition', () => {
    expect(evaluateCondition(undefined, makeContext())).toBe(true);
  });

  it('checks isCharge', () => {
    expect(evaluateCondition('isCharge', makeContext({ isCharge: true }))).toBe(true);
    expect(evaluateCondition('isCharge', makeContext({ isCharge: false }))).toBe(false);
  });

  it('checks isStealthAttack', () => {
    expect(evaluateCondition('isStealthAttack', makeContext({ isStealthAttack: true }))).toBe(true);
    expect(evaluateCondition('isStealthAttack', makeContext({ isStealthAttack: false }))).toBe(false);
  });

  it('checks isRetreat', () => {
    expect(evaluateCondition('isRetreat', makeContext({ isRetreat: true }))).toBe(true);
    expect(evaluateCondition('isRetreat', makeContext({ isRetreat: false }))).toBe(false);
  });

  it('checks isStealthed', () => {
    expect(evaluateCondition('isStealthed', makeContext({ isStealthed: true }))).toBe(true);
    expect(evaluateCondition('isStealthed', makeContext({ isStealthed: false }))).toBe(false);
  });

  it('checks isWater', () => {
    expect(evaluateCondition('isWater', makeContext({ terrain: 'coast' }))).toBe(true);
    expect(evaluateCondition('isWater', makeContext({ terrain: 'ocean' }))).toBe(true);
    expect(evaluateCondition('isWater', makeContext({ terrain: 'desert' }))).toBe(false);
  });

  it('checks tag:poison', () => {
    expect(evaluateCondition('tag:poison', makeContext({ attackerTags: ['poison', 'fortress'] }))).toBe(true);
    expect(evaluateCondition('tag:poison', makeContext({ attackerTags: ['fortress'] }))).toBe(false);
  });

  it('checks arbitrary tag:xxx values', () => {
    expect(evaluateCondition('tag:customTag', makeContext({ attackerTags: ['customTag'] }))).toBe(true);
    expect(evaluateCondition('tag:customTag', makeContext({ attackerTags: [] }))).toBe(false);
  });

  it('checks terrain:desert', () => {
    expect(evaluateCondition('terrain:desert', makeContext({ terrain: 'desert' }))).toBe(true);
    expect(evaluateCondition('terrain:desert', makeContext({ terrain: 'plains' }))).toBe(false);
  });

  it('checks multi-terrain: terrain:desert,coast,hill', () => {
    expect(evaluateCondition('terrain:desert,coast,hill', makeContext({ terrain: 'coast' }))).toBe(true);
    expect(evaluateCondition('terrain:desert,coast,hill', makeContext({ terrain: 'plains' }))).toBe(false);
  });

  it('checks targetHp<25', () => {
    expect(evaluateCondition('targetHp<25', makeContext({ defenderHp: 20 }))).toBe(true);
    expect(evaluateCondition('targetHp<25', makeContext({ defenderHp: 30 }))).toBe(false);
  });

  it('handles compound AND', () => {
    const ctx = makeContext({ isRetreat: true, defenderHp: 20 });
    expect(evaluateCondition('isRetreat AND targetHp<25', ctx)).toBe(true);
    expect(evaluateCondition('isRetreat AND targetHp<10', ctx)).toBe(false);
  });

  it('handles compound OR', () => {
    const ctx = makeContext({ isCharge: true });
    expect(evaluateCondition('isCharge OR isRetreat', ctx)).toBe(true);
    expect(evaluateCondition('isStealthAttack OR isRetreat', ctx)).toBe(false);
  });

  it('handles negation', () => {
    expect(evaluateCondition('!isCharge', makeContext({ isCharge: false }))).toBe(true);
    expect(evaluateCondition('!isCharge', makeContext({ isCharge: true }))).toBe(false);
  });

  it('returns false for unknown conditions', () => {
    expect(evaluateCondition('unknownCondition' as ConditionSpec, makeContext())).toBe(false);
  });
});
