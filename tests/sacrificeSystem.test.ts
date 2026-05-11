import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { performSacrifice } from '../src/systems/sacrificeSystem';

describe('sacrifice progression', () => {
  it('sacrifice grants synergy eligibility only — not technology or research', () => {
    const registry = loadRulesRegistry();
    const state = buildMvpScenario(42, { registry });
    const faction = Array.from(state.factions.values())[0]!;
    const unitId = faction.unitIds[0]!;
    const unit = state.units.get(unitId)!;
    const homeCity = state.cities.get(faction.homeCityId)!;

    unit.learnedAbilities = [
      {
        domainId: 'fortress',
        fromFactionId: 'hill_clan' as never,
        learnedOnRound: state.round,
      },
    ];
    unit.position = { ...homeCity.position };

    expect(faction.learnedDomains.includes('fortress')).toBe(false);
    expect(faction.synergyEligibleDomains.includes('fortress')).toBe(false);

    const next = performSacrifice(unitId, faction.id, state, registry);
    const updatedFaction = next.factions.get(faction.id)!;
    const updatedResearch = next.research.get(faction.id)!;

    // Sacrifice does NOT grant tech/research
    expect(updatedFaction.learnedDomains.includes('fortress')).toBe(false);
    expect(updatedResearch.completedNodes.includes('fortress_t1' as never)).toBe(false);
    // Sacrifice DOES grant synergy eligibility
    expect(updatedFaction.synergyEligibleDomains.includes('fortress')).toBe(true);

    // Non-destructive sacrifice: unit survives with abilities stripped
    const survivingUnit = next.units.get(unitId);
    expect(survivingUnit).toBeDefined();
    expect(survivingUnit!.learnedAbilities).toEqual([]);
    expect(survivingUnit!.hp).toBeGreaterThan(0);
  });
});
