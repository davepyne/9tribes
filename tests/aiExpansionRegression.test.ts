import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { choosePrimaryEnemyFaction } from '../src/systems/strategic-ai/objectives';
import { getAiDifficultyProfile } from '../src/systems/aiDifficulty';
import { computeFactionStrategy } from '../src/systems/strategicAi';
import type { FactionId, UnitId } from '../src/types';

const registry = loadRulesRegistry();

function trimState(state: ReturnType<typeof buildMvpScenario>, factionIds: string[]) {
  const keep = new Set(factionIds);
  for (const [id, u] of state.units) {
    if (!keep.has(u.factionId)) state.units.delete(id);
  }
  for (const [id, c] of state.cities) {
    if (!keep.has(c.factionId)) state.cities.delete(id);
  }
  for (const [id, v] of state.villages) {
    if (!keep.has(v.factionId)) state.villages.delete(id);
  }
  for (const [fid, f] of state.factions) {
    if (!keep.has(fid)) {
      state.factions.delete(fid);
    } else {
      f.unitIds = f.unitIds.filter((uid: UnitId) => state.units.has(uid));
      f.cityIds = f.cityIds.filter((cid: any) => state.cities.has(cid));
      f.villageIds = f.villageIds.filter((vid: any) => state.villages.has(vid));
    }
  }
  for (const [fid] of state.economy) {
    if (!keep.has(fid)) state.economy.delete(fid);
  }
  for (const [fid] of state.research) {
    if (!keep.has(fid)) state.research.delete(fid);
  }
  for (const [fid] of state.warExhaustion) {
    if (!keep.has(fid)) state.warExhaustion.delete(fid);
  }
  for (const [fid] of state.factionStrategies) {
    if (!keep.has(fid)) state.factionStrategies.delete(fid);
  }
}

// ---------------------------------------------------------------------------
// 1. Runaway detection
// ---------------------------------------------------------------------------
describe('runaway expansion detection', () => {
  it('returns undefined when no faction has >= 3 cities', () => {
    const state = buildMvpScenario(42, { registry });
    const result = choosePrimaryEnemyFaction([], [], state, 'hill_clan' as FactionId);
    expect(result).toBeUndefined();
  });

  it('targets faction with >= 3 cities and >= 2 lead', () => {
    const state = buildMvpScenario(42, { registry });
    trimState(state, ['hill_clan', 'frost_wardens', 'steppe_clan']);

    const hillFaction = state.factions.get('hill_clan' as FactionId)!;
    for (let i = 0; i < 3; i++) {
      const cityId = `runaway_city_${i}` as any;
      state.cities.set(cityId, {
        id: cityId,
        factionId: 'hill_clan' as FactionId,
        position: { q: 10 + i, r: 10 },
        foundedRound: 20,
        territoryHexes: [],
        villageIds: [],
        improvements: [],
      } as any);
      hillFaction.cityIds.push(cityId);
    }

    const result = choosePrimaryEnemyFaction([], [], state, 'frost_wardens' as FactionId);
    expect(result).toBe('hill_clan');
  });

  it('does NOT target faction with 3 cities but only 1 lead', () => {
    const state = buildMvpScenario(42, { registry });
    trimState(state, ['hill_clan', 'frost_wardens', 'steppe_clan']);

    const hillFaction = state.factions.get('hill_clan' as FactionId)!;
    const frostFaction = state.factions.get('frost_wardens' as FactionId)!;

    for (let i = 0; i < 2; i++) {
      const cid = `hill_extra_${i}` as any;
      state.cities.set(cid, { id: cid, factionId: 'hill_clan' as FactionId, position: { q: 10 + i, r: 10 }, foundedRound: 20, territoryHexes: [], villageIds: [], improvements: [] } as any);
      hillFaction.cityIds.push(cid);
    }
    const fcid = 'frost_extra' as any;
    state.cities.set(fcid, { id: fcid, factionId: 'frost_wardens' as FactionId, position: { q: 5, r: 5 }, foundedRound: 20, territoryHexes: [], villageIds: [], improvements: [] } as any);
    frostFaction.cityIds.push(fcid);

    const result = choosePrimaryEnemyFaction([], [], state, 'steppe_clan' as FactionId);
    expect(result).toBeUndefined();
  });

  it('excludes own faction from runaway counting', () => {
    const state = buildMvpScenario(42, { registry });
    trimState(state, ['hill_clan', 'frost_wardens']);

    const hillFaction = state.factions.get('hill_clan' as FactionId)!;
    for (let i = 0; i < 3; i++) {
      const cid = `hill_extra_${i}` as any;
      state.cities.set(cid, { id: cid, factionId: 'hill_clan' as FactionId, position: { q: 10 + i, r: 10 }, foundedRound: 20, territoryHexes: [], villageIds: [], improvements: [] } as any);
      hillFaction.cityIds.push(cid);
    }

    const result = choosePrimaryEnemyFaction([], [], state, 'hill_clan' as FactionId);
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2. AI-only settler village cost
// ---------------------------------------------------------------------------
describe('AI-only settler village cost', () => {
  it('Normal profile uses cost 4', () => {
    const profile = getAiDifficultyProfile('normal');
    expect(profile.production.settlerVillageCost).toBe(4);
  });

  it('Hard profile uses cost 3', () => {
    const profile = getAiDifficultyProfile('hard');
    expect(profile.production.settlerVillageCost).toBe(3);
  });

  it('Easy profile uses full cost 6', () => {
    const profile = getAiDifficultyProfile('easy');
    expect(profile.production.settlerVillageCost).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// 3. Anti-expansion config
// ---------------------------------------------------------------------------
describe('anti-expansion difficulty config', () => {
  it('Normal interception radius >= 14', () => {
    const profile = getAiDifficultyProfile('normal');
    expect(profile.strategy.settlerInterceptionRadius).toBeGreaterThanOrEqual(14);
  });

  it('Normal economic denial weight >= 4', () => {
    const profile = getAiDifficultyProfile('normal');
    expect(profile.strategy.economicDenialWeight).toBeGreaterThanOrEqual(4);
  });

  it('Normal fresh village denial turns >= 5', () => {
    const profile = getAiDifficultyProfile('normal');
    expect(profile.strategy.freshVillageDenialTurns).toBeGreaterThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// 4. Strategy-level runaway detection
// ---------------------------------------------------------------------------
describe('strategy runaway detection', () => {
  it('computeFactionStrategy sets primaryEnemyFactionId for runaway', () => {
    const state = buildMvpScenario(42, { registry });
    trimState(state, ['hill_clan', 'frost_wardens', 'steppe_clan']);

    const hillFaction = state.factions.get('hill_clan' as FactionId)!;
    for (let i = 0; i < 3; i++) {
      const cid = `hill_extra_${i}` as any;
      state.cities.set(cid, { id: cid, factionId: 'hill_clan' as FactionId, position: { q: 10 + i, r: 10 }, foundedRound: 20, territoryHexes: [], villageIds: [], improvements: [] } as any);
      hillFaction.cityIds.push(cid);
    }

    state.round = 25;
    const strategy = computeFactionStrategy(state, 'frost_wardens' as FactionId, registry, 'normal');
    expect(strategy.primaryEnemyFactionId).toBe('hill_clan');
  });

  it('no runaway when all factions have 1 city', () => {
    const state = buildMvpScenario(42, { registry });
    trimState(state, ['hill_clan', 'steppe_clan']);
    state.round = 20;

    const strategy = computeFactionStrategy(state, 'hill_clan' as FactionId, registry, 'normal');
    expect(strategy.primaryEnemyFactionId).toBeUndefined();
  });
});
