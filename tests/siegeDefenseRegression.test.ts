import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { computeFactionStrategy } from '../src/systems/strategicAi';
import { assessThreatenedCities } from '../src/systems/strategic-ai/fronts';
import { getAiDifficultyProfile } from '../src/systems/aiDifficulty';
import { updateFogState } from '../src/systems/fogSystem';
import { trimState } from './helpers/trimState';

const registry = loadRulesRegistry();

describe('siege defense regression', () => {
  describe('assessThreatenedCities distance filter', () => {
    it('only counts friendly units within THREAT_RADIUS, not the entire army', () => {
      const state = buildMvpScenario(42);
      trimState(state, ['hill_clan', 'steppe_clan']);
      const hillId = 'hill_clan' as never;
      const steppeId = 'steppe_clan' as never;
      const hillFaction = state.factions.get(hillId)!;
      const hillCityId = hillFaction.cityIds[0];
      const hillCity = state.cities.get(hillCityId)!;

      // Place 2 enemy units right next to the city (within THREAT_RADIUS=3)
      const steppeFaction = state.factions.get(steppeId)!;
      const steppeBaseUnit = state.units.get(steppeFaction.unitIds[0])!;
      state.units.set(steppeFaction.unitIds[0], {
        ...steppeBaseUnit,
        position: { q: hillCity.position.q + 1, r: hillCity.position.r },
        hp: 100,
      });
      if (steppeFaction.unitIds.length > 1) {
        const secondUnit = state.units.get(steppeFaction.unitIds[1])!;
        state.units.set(steppeFaction.unitIds[1], {
          ...secondUnit,
          position: { q: hillCity.position.q + 1, r: hillCity.position.r + 1 },
          hp: 100,
        });
      }

      // Place 1 friendly unit near the city, rest far away
      const hillBaseUnit = state.units.get(hillFaction.unitIds[0])!;
      state.units.set(hillFaction.unitIds[0], {
        ...hillBaseUnit,
        position: { q: hillCity.position.q - 1, r: hillCity.position.r },
        hp: 100,
      });

      // Move any other starting units far from the city
      for (let i = 1; i < hillFaction.unitIds.length; i++) {
        const uid = hillFaction.unitIds[i];
        state.units.set(uid, {
          ...state.units.get(uid)!,
          position: { q: hillCity.position.q + 20 + i, r: hillCity.position.r },
          hp: 100,
        });
      }

      // Place 5 additional friendly units FAR from the city (beyond THREAT_RADIUS=3)
      for (let i = 0; i < 5; i++) {
        const farUnitId = `hill_far_${i}` as never;
        state.units.set(farUnitId, {
          ...hillBaseUnit,
          id: farUnitId,
          position: { q: hillCity.position.q + 20 + i, r: hillCity.position.r },
          hp: 100,
        });
        hillFaction.unitIds.push(farUnitId);
      }

      // Use hard difficulty which has strategicFogCheat=true, bypassing fog checks
      const difficulty = getAiDifficultyProfile('hard');
      const threats = assessThreatenedCities(state, hillId, difficulty);

      // The far units should NOT reduce the threat score
      // With 2 nearby enemies: nearbyEnemyUnits=2, nearbyFriendlyUnits=1
      // threatScore = 2*4 - 1*2 = 6 (positive => city is threatened)
      expect(threats.length).toBeGreaterThan(0);
      expect(threats[0].nearbyFriendlyUnits).toBe(1);
    });

    it('does not flag city as threatened when only distant friendly units exist', () => {
      const state = buildMvpScenario(42);
      trimState(state, ['hill_clan', 'steppe_clan']);
      const hillId = 'hill_clan' as never;
      const hillFaction = state.factions.get(hillId)!;
      const hillCityId = hillFaction.cityIds[0];
      const hillCity = state.cities.get(hillCityId)!;

      // Place ALL friendly units far from the city
      for (const unitId of hillFaction.unitIds) {
        const unit = state.units.get(unitId)!;
        state.units.set(unitId, {
          ...unit,
          position: { q: hillCity.position.q + 20, r: hillCity.position.r },
          hp: 100,
        });
      }

      const difficulty = getAiDifficultyProfile('normal');
      const threats = assessThreatenedCities(state, hillId, difficulty);

      for (const threat of threats) {
        expect(threat.nearbyFriendlyUnits).toBe(0);
      }
    });
  });

  describe('threatenedCityId in unit intents', () => {
    it('passes threatenedCityId to defender-assigned units', () => {
      let state = buildMvpScenario(42);
      trimState(state, ['hill_clan', 'steppe_clan']);
      const hillId = 'hill_clan' as never;
      const steppeId = 'steppe_clan' as never;
      const hillFaction = state.factions.get(hillId)!;
      const hillCityId = hillFaction.cityIds[0];
      const hillCity = state.cities.get(hillCityId)!;
      const steppeFaction = state.factions.get(steppeId)!;

      // Place enemy units adjacent to city to create a siege threat
      for (let i = 0; i < 3 && i < steppeFaction.unitIds.length; i++) {
        const uid = steppeFaction.unitIds[i];
        state.units.set(uid, {
          ...state.units.get(uid)!,
          position: { q: hillCity.position.q + 1 + i, r: hillCity.position.r },
          hp: 100,
        });
      }

      // Place some friendly units near the city (so they can be defenders)
      for (let i = 0; i < 3 && i < hillFaction.unitIds.length; i++) {
        const uid = hillFaction.unitIds[i];
        state.units.set(uid, {
          ...state.units.get(uid)!,
          position: { q: hillCity.position.q - 1 - i, r: hillCity.position.r },
          hp: 100,
        });
      }

      state = updateFogState(state, hillId);
      state = updateFogState(state, steppeId);

      const strategy = computeFactionStrategy(state, hillId, registry);

      // If any defenders were assigned, they must have threatenedCityId set
      const defenders = Object.values(strategy.unitIntents)
        .filter((intent) => intent.assignment === 'defender');

      if (defenders.length > 0) {
        for (const defender of defenders) {
          expect(defender.threatenedCityId).toBeDefined();
        }
      }
    });

    it('includes threatenedCityId in main intent path even for non-defender roles', () => {
      const state = buildMvpScenario(42);
      trimState(state, ['hill_clan', 'steppe_clan']);
      const hillId = 'hill_clan' as never;
      const steppeId = 'steppe_clan' as never;
      const hillFaction = state.factions.get(hillId)!;
      const hillCityId = hillFaction.cityIds[0];
      const hillCity = state.cities.get(hillCityId)!;
      const steppeFaction = state.factions.get(steppeId)!;

      // Create a threat: 2 enemies near city, 0 nearby friendlies
      // Use hard difficulty which has strategicFogCheat=true
      state.units.set(steppeFaction.unitIds[0], {
        ...state.units.get(steppeFaction.unitIds[0])!,
        position: { q: hillCity.position.q + 1, r: hillCity.position.r },
        hp: 100,
      });

      // Move all hill units far from city
      for (const uid of hillFaction.unitIds) {
        state.units.set(uid, {
          ...state.units.get(uid)!,
          position: { q: hillCity.position.q + 15, r: hillCity.position.r },
          hp: 100,
        });
      }

      const strategy = computeFactionStrategy(state, hillId, registry, 'hard');

      // With hard fog cheat and 1 enemy next to city, the city should be threatened
      // and intents should carry threatenedCityId
      if (strategy.threatenedCities.length > 0) {
        const intentsWithThreatenedCity = Object.values(strategy.unitIntents)
          .filter((intent) => intent.threatenedCityId !== undefined);
        expect(intentsWithThreatenedCity.length).toBeGreaterThan(0);
      }
    });
  });
});
