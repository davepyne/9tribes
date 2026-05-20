import type { GameState } from '../../game/types.js';
import type { FactionId, UnitId } from '../../types.js';
import type { Unit } from '../../features/units/types.js';
import { CYCLOPS_REGEN_PER_ROUND, isWildFaction } from '../wildCyclopsConstants.js';

export { isWildFaction } from '../wildCyclopsConstants.js';

export function findMeatiestUnit(state: GameState, factionId: FactionId): Unit | undefined {
  const faction = state.factions.get(factionId);
  if (!faction) return undefined;
  let best: Unit | undefined;
  for (const uid of faction.unitIds) {
    const u = state.units.get(uid as UnitId);
    if (u && u.hp > 0 && (!best || u.maxHp > best.maxHp)) best = u;
  }
  return best;
}

export function processWildFactionPhases(state: GameState, factionId: FactionId): GameState {
  const faction = state.factions.get(factionId);
  if (!faction) return state;

  const newUnits = new Map(state.units);
  for (const uid of faction.unitIds) {
    const unit = newUnits.get(uid);
    if (!unit || unit.hp <= 0) continue;
    newUnits.set(uid, {
      ...unit,
      movesRemaining: unit.maxMoves,
      attacksRemaining: 1,
      status: 'ready',
      activatedThisRound: false,
      enteredZoCThisActivation: false,
      hp: Math.min(unit.maxHp, unit.hp + CYCLOPS_REGEN_PER_ROUND),
    });
  }
  return { ...state, units: newUnits };
}
