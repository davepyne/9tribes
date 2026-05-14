import type { UnitId, FactionId } from '../../types.js';
import type { Prototype } from '../../game/types.js';
import type { Unit } from './types.js';

export function createFreshUnit(
  factionId: FactionId,
  position: { q: number; r: number },
  prototype: Prototype,
  id: UnitId,
): Unit {
  return {
    id,
    factionId,
    position,
    facing: 0,
    hp: prototype.derivedStats.hp,
    maxHp: prototype.derivedStats.hp,
    movesRemaining: prototype.derivedStats.moves,
    maxMoves: prototype.derivedStats.moves,
    attacksRemaining: 1,
    xp: 0,
    veteranLevel: 'green',
    status: 'ready',
    prototypeId: prototype.id,
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
  };
}
