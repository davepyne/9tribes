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

  it('production penalty scales with exhaustion', () => {
    // Every 25 exhaustion = 0.05 penalty
    expect(calculateProductionPenalty(0)).toBe(0);
    expect(calculateProductionPenalty(24)).toBe(0);
    expect(calculateProductionPenalty(25)).toBe(0.05);
    expect(calculateProductionPenalty(50)).toBe(0.10);
    expect(calculateProductionPenalty(100)).toBe(0.20);
  });

  it('morale penalty scales with exhaustion', () => {
    // Every 20 exhaustion = 1 morale penalty
    expect(calculateMoralePenalty(0)).toBe(0);
    expect(calculateMoralePenalty(19)).toBe(0);
    expect(calculateMoralePenalty(20)).toBe(1);
    expect(calculateMoralePenalty(50)).toBe(2);
    expect(calculateMoralePenalty(100)).toBe(5);
  });

  it('decay reduces exhaustion when no losses for 3+ turns', () => {
    const we = { ...createWarExhaustion('faction_1'), exhaustionPoints: 50 };
    const decayed = applyDecay(we, { noLossTurns: 5, territoryClear: false });
    // DECAY_NO_LOSS = 2, DECAY_TERRITORY_CLEARED = 1 (not active here)
    expect(decayed.exhaustionPoints).toBe(48);
  });

  it('decay with territory clear applies additional reduction', () => {
    const we = { ...createWarExhaustion('faction_1'), exhaustionPoints: 50 };
    const decayed = applyDecay(we, { noLossTurns: 5, territoryClear: true });
    // DECAY_NO_LOSS = 2, DECAY_TERRITORY_CLEARED = 1
    expect(decayed.exhaustionPoints).toBe(47);
  });

  it('decay does not reduce exhaustion below zero', () => {
    const we = { ...createWarExhaustion('faction_1'), exhaustionPoints: 2 };
    const decayed = applyDecay(we, { noLossTurns: 5, territoryClear: true });
    expect(decayed.exhaustionPoints).toBe(0);
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

  it('config values have been wired with non-zero values', () => {
    expect(EXHAUSTION_CONFIG.UNIT_KILLED).toBe(2);
    expect(EXHAUSTION_CONFIG.CITY_CAPTURED).toBe(5);
    expect(EXHAUSTION_CONFIG.DECAY_NO_LOSS).toBe(2);
    expect(EXHAUSTION_CONFIG.SUPPLY_DEFICIT_PER_POINT).toBe(1);
    expect(EXHAUSTION_CONFIG.BESIEGED_CITY_PER_TURN).toBe(1);
  });
});
