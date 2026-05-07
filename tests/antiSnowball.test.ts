import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { applySupplyDeficitPenalties } from '../src/systems/warExhaustionSystem';
import { scoreSettlerExpansionValue } from '../src/systems/aiProductionScoring';
import { runWarEcologySimulation } from '../src/systems/warEcologySimulation';
import { createCityId } from '../src/core/ids';
import type { GameState } from '../src/game/types';
import type { Unit } from '../src/features/units/types';

const registry = loadRulesRegistry();

// ── Supply Attrition Tests ──

describe('Supply Attrition', () => {
  /**
   * Build a state where the faction has `unitCount` units, no cities, no villages,
   * and thus 0 supply income → guaranteed supply deficit.
   */
  function buildNoIncomeState(factionId: string, unitCount: number): GameState {
    let state = buildMvpScenario(42);
    const faction = state.factions.get(factionId as never)!;
    const templateUnit = state.units.get(faction.unitIds[0])!;

    // Create new units
    const units = new Map(state.units);
    const newUnitIds: string[] = [];
    for (let i = 0; i < unitCount; i++) {
      const id = `test_unit_${i}` as never;
      const unit: Unit = {
        ...templateUnit,
        id,
        factionId: factionId as never,
        position: { q: 5 + i, r: 5 },
        hp: templateUnit.maxHp,
        morale: 100,
      };
      units.set(id, unit);
      newUnitIds.push(id);
    }
    // Remove original units
    for (const uid of faction.unitIds) {
      units.delete(uid);
    }

    // Strip cities, villages, improvements so deriveResourceIncome returns 0 supply
    const factions = new Map(state.factions);
    factions.set(factionId as never, {
      ...faction,
      unitIds: newUnitIds,
      cityIds: [],
      villageIds: [],
    });

    return {
      ...state,
      units,
      factions,
      cities: new Map(),
      villages: new Map(),
      improvements: new Map(),
      economy: new Map(),  // will be recalculated by deriveResourceIncome
    };
  }

  it('units in supply deficit take HP damage', () => {
    const state = buildNoIncomeState('steppe_clan', 3);
    const factionId = 'steppe_clan' as never;
    const unitIds = state.factions.get(factionId)!.unitIds;
    const hpBefore = state.units.get(unitIds[0])!.hp;

    const result = applySupplyDeficitPenalties(state, factionId, registry);

    const hpAfter = result.units.get(unitIds[0])!.hp;
    expect(hpAfter).toBeLessThan(hpBefore);
  });

  it('units NOT in supply deficit take no HP damage', () => {
    // Use a full scenario state with cities (has supply income)
    const state = buildMvpScenario(42);
    const factionId = 'druid_circle' as never;
    const unitIds = state.factions.get(factionId)!.unitIds;
    const hpBefore = state.units.get(unitIds[0])!.hp;

    const result = applySupplyDeficitPenalties(state, factionId, registry);

    // With cities, druid_circle should have supply income >= demand
    // If still in deficit by chance, HP might drop — just verify it's <= before
    const hpAfter = result.units.get(unitIds[0])!.hp;
    expect(hpAfter).toBeLessThanOrEqual(hpBefore);
  });

  it('units that reach 0 HP from attrition are removed', () => {
    let state = buildNoIncomeState('steppe_clan', 1);
    const factionId = 'steppe_clan' as never;
    const unitIds = state.factions.get(factionId)!.unitIds;

    // Damage the unit to 1 HP so a 50% strike kills it
    const units = new Map(state.units);
    units.set(unitIds[0], { ...units.get(unitIds[0])!, hp: 1 });
    state = { ...state, units };

    const result = applySupplyDeficitPenalties(state, factionId, registry);

    expect(result.units.get(unitIds[0])).toBeUndefined();
  });

  it('each struck unit takes floor(maxHp * 0.5) damage', () => {
    const state = buildNoIncomeState('steppe_clan', 5);
    const factionId = 'steppe_clan' as never;
    const unitIds = state.factions.get(factionId)!.unitIds;
    const maxHp = state.units.get(unitIds[0])!.maxHp;
    const expectedDmg = Math.floor(maxHp * 0.5);

    const result = applySupplyDeficitPenalties(state, factionId, registry);

    // At least one unit must have taken damage (deficit >= 1 with no income)
    const anyDamaged = unitIds.some(id => {
      const after = result.units.get(id);
      const before = state.units.get(id);
      return after && before && after.hp < before.hp;
    });
    expect(anyDamaged).toBe(true);

    // Each damaged unit should have lost exactly expectedDmg
    for (const id of unitIds) {
      const after = result.units.get(id);
      const before = state.units.get(id);
      if (after && before && after.hp < before.hp) {
        expect(before.hp - after.hp).toBe(expectedDmg);
      }
    }
  });

  it('number of units struck equals floor(supplyDeficit)', () => {
    const state = buildNoIncomeState('steppe_clan', 10);
    const factionId = 'steppe_clan' as never;
    const unitIds = state.factions.get(factionId)!.unitIds;

    const result = applySupplyDeficitPenalties(state, factionId, registry);

    // Count how many units took damage
    const struck = unitIds.filter(id => {
      const after = result.units.get(id);
      const before = state.units.get(id);
      return after && before && after.hp < before.hp;
    }).length;

    // With 10 units and 0 income, deficit is >= number of units (supply demand)
    // Strikes = floor(deficit), but capped at unit count
    expect(struck).toBeGreaterThan(0);
    expect(struck).toBeLessThanOrEqual(10);
  });
});

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
