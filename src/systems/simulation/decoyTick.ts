import type { GameState } from '../../game/types.js';
import type { UnitId } from '../../types.js';
import type { SimulationTrace } from './traceTypes.js';
import { log } from './traceRecorder.js';

export function tickDecoyState(
  state: GameState,
  trace?: SimulationTrace,
): GameState {
  let current = state;
  for (const [, unit] of current.units) {
    if (unit.isDecoy && unit.decoyTurnsRemaining !== undefined) {
      const remaining = unit.decoyTurnsRemaining - 1;
      if (remaining <= 0) {
        const units = new Map(current.units);
        units.delete(unit.id);
        current = { ...current, units };
        log(trace, `Decoy unit ${unit.id} expired`);
      } else if (remaining !== unit.decoyTurnsRemaining) {
        const units = new Map(current.units);
        units.set(unit.id, { ...unit, decoyTurnsRemaining: remaining });
        current = { ...current, units };
      }
    }
  }
  return current;
}
