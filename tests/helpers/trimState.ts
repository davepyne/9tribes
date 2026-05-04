import type { GameState } from '../../src/game/types.js';
import { initializeFogForFaction } from '../../src/systems/fogSystem.js';

/**
 * Trim a game state to only the specified factions.
 * Removes non-matching factions, units, cities, and clears villages/improvements.
 * Repairs faction references and initializes fog for kept factions.
 */
export function trimState(state: GameState, factionIds: string[]): GameState {
  const keepFactions = new Set(factionIds);
  const keepUnits = new Set(
    Array.from(state.units.values())
      .filter((unit) => keepFactions.has(unit.factionId))
      .map((unit) => unit.id),
  );
  const keepCities = new Set(
    Array.from(state.cities.values())
      .filter((city) => keepFactions.has(city.factionId))
      .map((city) => city.id),
  );

  state.factions = new Map(
    Array.from(state.factions.entries()).filter(([factionId]) => keepFactions.has(factionId)),
  );
  state.units = new Map(
    Array.from(state.units.entries()).filter(([unitId]) => keepUnits.has(unitId)),
  );
  state.cities = new Map(
    Array.from(state.cities.entries()).filter(([cityId]) => keepCities.has(cityId)),
  );
  state.villages = new Map();
  state.improvements = new Map();
  state.economy = new Map(
    Array.from(state.economy.entries()).filter(([factionId]) => keepFactions.has(factionId)),
  );
  state.research = new Map(
    Array.from(state.research.entries()).filter(([factionId]) => keepFactions.has(factionId)),
  );
  state.warExhaustion = new Map(
    Array.from(state.warExhaustion.entries()).filter(([factionId]) => keepFactions.has(factionId)),
  );
  state.factionStrategies = new Map();

  for (const [factionId, faction] of state.factions) {
    state.factions.set(factionId, {
      ...faction,
      unitIds: faction.unitIds.filter((unitId) => state.units.has(unitId)),
      cityIds: faction.cityIds.filter((cityId) => state.cities.has(cityId)),
      villageIds: [],
    });
  }

  for (const factionId of keepFactions) {
    state = initializeFogForFaction(state, factionId as never);
  }

  return state;
}
