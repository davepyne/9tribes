import type { Unit } from '../../src/features/units/types.js';
import { createUnitId, createFactionId } from '../../src/core/ids.js';

/**
 * Create a test unit with sensible defaults and override support.
 */
export function makeUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: createUnitId(),
    factionId: createFactionId('red'),
    position: { q: 5, r: 5 },
    facing: 0,
    hp: 10,
    maxHp: 10,
    movesRemaining: 2,
    maxMoves: 2,
    attacksRemaining: 1,
    xp: 0,
    veteranLevel: 'green',
    status: 'ready',
    prototypeId: 'test_proto' as never,
    history: [],
    morale: 100,
    routed: false,
    poisoned: false,
    enteredZoCThisActivation: false,
    poisonStacks: 0,
    poisonTurnsRemaining: 0,
    isStealthed: false,
    turnsSinceStealthBreak: 0,
    learnedAbilities: [],
    ...overrides,
  };
}
