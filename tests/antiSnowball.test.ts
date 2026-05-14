import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { scoreSettlerExpansionValue } from '../src/systems/aiProductionScoring';
import { runWarEcologySimulation } from '../src/systems/warEcologySimulation';
import { createCityId } from '../src/core/ids';
import type { GameState } from '../src/game/types';

const registry = loadRulesRegistry();

// ── City Cap Tests ──

describe('City Cap (max 3)', () => {
  it('settler scoring returns -Infinity when faction has 3 cities', () => {
    const state = buildMvpScenario(42);
    const factionId = 'druid_circle' as never;
    const faction = state.factions.get(factionId)!;
    const strategy = state.factionStrategies.get(factionId)!;

    // Add cities to reach cap of 3
    const cities = new Map(state.cities);
    const existingCityIds = [...faction.cityIds];
    while (existingCityIds.length < 3) {
      const cityId = createCityId();
      cities.set(cityId, {
        id: cityId,
        factionId,
        position: { q: 20 + existingCityIds.length, r: 20 },
        name: `Test City ${existingCityIds.length}`,
        productionQueue: [],
        productionProgress: 0,
        territoryRadius: 2,
        wallHP: 100,
        maxWallHP: 100,
        besieged: false,
        turnsUnderSiege: 0,
        isCapital: false,
        siteBonuses: { productionBonus: 0, supplyBonus: 0 },
      });
      existingCityIds.push(cityId);
    }
    const state3Cities = {
      ...state,
      cities,
      factions: new Map(state.factions).set(factionId, {
        ...faction,
        cityIds: existingCityIds,
      }),
    };

    const settlerProto = Array.from(state3Cities.prototypes.values())
      .find(p => p.sourceRecipeId === 'settler');
    if (!settlerProto) return;

    const score = scoreSettlerExpansionValue(
      state3Cities, factionId, strategy, settlerProto, { production: {} } as never, 'normal',
    );

    expect(score).toBe(Number.NEGATIVE_INFINITY);
  });

  it('settler scoring returns finite score when faction has 1 city', () => {
    // Run 1 turn to populate factionStrategies
    const state = runWarEcologySimulation(buildMvpScenario(42), registry, 1);

    // Find a faction with a strategy and < 3 cities
    let testFactionId: string | null = null;
    let testStrategy: any = null;
    for (const [fid, faction] of state.factions) {
      const strat = state.factionStrategies.get(fid as never);
      if (strat && faction.cityIds.length < 3) {
        testFactionId = fid;
        testStrategy = strat;
        break;
      }
    }
    if (!testFactionId || !testStrategy) return;

    const settlerProto = Array.from(state.prototypes.values())
      .find(p => p.sourceRecipeId === 'settler');
    if (!settlerProto) return;

    const score = scoreSettlerExpansionValue(
      state, testFactionId as never, testStrategy, settlerProto, { production: {} } as never, 'normal',
    );

    // With < 3 cities, should NOT be blocked by the city cap
    expect(score).not.toBe(Number.NEGATIVE_INFINITY);
  });

  it('factions do not exceed 3 cities in a 50-turn simulation', () => {
    const state = buildMvpScenario(42);
    const result = runWarEcologySimulation(state, registry, 50);

    for (const [factionId, faction] of result.factions) {
      expect(faction.cityIds.length).toBeLessThanOrEqual(3);
    }
  });
});
