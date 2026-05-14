import type { GameState } from '../../game/types.js';
import type { FactionId } from '../../types.js';
import type { VictoryType, VictoryStatus } from './traceTypes.js';
import { isWildFaction } from '../wildCyclopsConstants.js';

export function getAliveFactions(state: GameState): Set<FactionId> {
  const factionsWithUnits = new Set(
    Array.from(state.units.values())
      .filter((u) => u.hp > 0)
      .map((unit) => unit.factionId),
  );
  const factionsWithCities = new Set(
    Array.from(state.cities.values())
      .filter((city) => !city.besieged)
      .map((city) => city.factionId),
  );

  return new Set(
    [...factionsWithUnits, ...factionsWithCities].filter(id => !isWildFaction(id))
  );
}

export function getVictoryStatus(state: GameState): VictoryStatus {
  const aliveFactionIds = getAliveFactions(state);

  if (aliveFactionIds.size === 1) {
    return {
      winnerFactionId: [...aliveFactionIds][0],
      victoryType: 'elimination',
      controlledCities: null,
      dominationThreshold: null,
    };
  }

  const totalCities = state.cities.size;
  if (totalCities > 0) {
    const dominationThreshold = Math.ceil(totalCities * 0.51);
    const cityControl = new Map<FactionId, number>();
    for (const city of state.cities.values()) {
      cityControl.set(city.factionId, (cityControl.get(city.factionId) ?? 0) + 1);
    }

    for (const [factionId, controlledCities] of cityControl) {
      if (controlledCities >= dominationThreshold) {
        return {
          winnerFactionId: factionId,
          victoryType: 'domination',
          controlledCities,
          dominationThreshold,
        };
      }
    }

    return {
      winnerFactionId: null,
      victoryType: 'unresolved',
      controlledCities: Math.max(0, ...cityControl.values()),
      dominationThreshold,
    };
  }

  return {
    winnerFactionId: null,
    victoryType: 'unresolved',
    controlledCities: null,
    dominationThreshold: null,
  };
}

export function isFactionEliminated(state: GameState, factionId: FactionId): boolean {
  if (isWildFaction(factionId)) return false;
  return !getAliveFactions(state).has(factionId);
}
