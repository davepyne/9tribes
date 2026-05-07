import {
  createWarExhaustion,
  addExhaustion,
  calculateProductionPenalty,
  calculateMoralePenalty,
  applyDecay,
  tickWarExhaustion,
  EXHAUSTION_CONFIG,
} from '../src/systems/warExhaustionSystem';

describe('War Exhaustion System', () => {
  it('creates initial state with zero exhaustion', () => {
    const we = createWarExhaustion('faction_1');
    expect(we.exhaustionPoints).toBe(0);
    expect(we.turnsWithoutLoss).toBe(0);
  });

  it('adds exhaustion points', () => {
    const we = createWarExhaustion('faction_1');
    const updated = addExhaustion(we, 15);
    expect(updated.exhaustionPoints).toBe(15);
  });

  it('exhaustion cannot go below zero', () => {
    const we = { ...createWarExhaustion('faction_1'), exhaustionPoints: 5 };
    const updated = addExhaustion(we, -10);
    expect(updated.exhaustionPoints).toBe(0);
  });

  it('production penalty is always zero (WE disabled)', () => {
    expect(calculateProductionPenalty(0)).toBe(0);
    expect(calculateProductionPenalty(20)).toBe(0);
    expect(calculateProductionPenalty(100)).toBe(0);
  });

  it('morale penalty is always zero (WE disabled)', () => {
    expect(calculateMoralePenalty(9)).toBe(0);
    expect(calculateMoralePenalty(50)).toBe(0);
    expect(calculateMoralePenalty(100)).toBe(0);
  });

  it('decay is a no-op (WE disabled)', () => {
    const we = { ...createWarExhaustion('faction_1'), exhaustionPoints: 50 };
    const decayed = applyDecay(we, { noLossTurns: 5, territoryClear: false });
    expect(decayed.exhaustionPoints).toBe(50);
  });

  it('decay with territory clear is also a no-op', () => {
    const we = { ...createWarExhaustion('faction_1'), exhaustionPoints: 50 };
    const decayed = applyDecay(we, { noLossTurns: 5, territoryClear: true });
    expect(decayed.exhaustionPoints).toBe(50);
  });

  it('tick increments turns without loss', () => {
    const we = createWarExhaustion('faction_1');
    const ticked = tickWarExhaustion(we, false);
    expect(ticked.turnsWithoutLoss).toBe(1);
  });

  it('tick resets turnsWithoutLoss on loss', () => {
    const we = { ...createWarExhaustion('faction_1'), turnsWithoutLoss: 5 };
    const ticked = tickWarExhaustion(we, true);
    expect(ticked.turnsWithoutLoss).toBe(0);
  });

  it('config values are zeroed (WE disabled)', () => {
    expect(EXHAUSTION_CONFIG.UNIT_KILLED).toBe(0);
    expect(EXHAUSTION_CONFIG.CITY_CAPTURED).toBe(0);
    expect(EXHAUSTION_CONFIG.DECAY_NO_LOSS).toBe(0);
  });
});
