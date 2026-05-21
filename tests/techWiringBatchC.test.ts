// Batch C — per-turn / activation / fog wiring consumption tests.
// Each test observes a gameplay delta (HP regen, movement cost, fog, ZoC).
import { describe, it, expect } from 'vitest';
import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { createResearchState } from '../src/systems/researchSystem';
import { refreshFactionUnits } from '../src/systems/simulation/unitRefresh';
import { previewMove } from '../src/systems/movementSystem';
import { previewCombatAction } from '../src/systems/combat-action/preview';
import { applyCombatAction } from '../src/systems/combatActionSystem';
import { getZoneEffectMovementPenalty, findZoneEffectByTypeAndOwner } from '../src/systems/zoneEffectSystem';
import { tickZoneEffectLifetimes } from '../src/systems/zoneEffectSystem';
import { isUnitVisibleTo, updateFogState } from '../src/systems/fogSystem';
import { hexToKey, getNeighbors } from '../src/core/grid';
import type { GameState } from '../src/game/types';
import type { ActiveSynergy } from '../src/systems/synergyTypes';

const registry = loadRulesRegistry();

function addNodes(state: GameState, factionId: string, nodes: string[]) {
  let research = state.research.get(factionId as never);
  if (!research) {
    research = createResearchState(factionId as never);
    state.research.set(factionId as never, research);
  }
  const newNodes = nodes.filter((n) => !research!.completedNodes.includes(n as never));
  if (newNodes.length > 0) {
    research.completedNodes = [...research.completedNodes, ...(newNodes as never[])];
  }
}

function setDomains(state: GameState, factionId: string, nativeDomain: string, learned: string[]) {
  const f = state.factions.get(factionId as never)!;
  state.factions.set(factionId as never, {
    ...f,
    nativeDomain: nativeDomain as never,
    nativeDomains: [nativeDomain as never],
    learnedDomains: learned as never,
  });
}

function setTerrain(state: GameState, pos: { q: number; r: number }, terrain: string) {
  state.map!.tiles.set(hexToKey(pos), { position: pos, terrain: terrain as never });
}

function addTag(state: GameState, prototypeId: string, tags: string[]) {
  const proto = state.prototypes.get(prototypeId as never)!;
  state.prototypes.set(prototypeId as never, { ...proto, tags: [...new Set([...(proto.tags ?? []), ...tags])] });
}

describe('Batch C — Row 1: worldrootShareFraction (foreign nature_healing T3)', () => {
  it('wounded units near forest heal an extra 10% maxHp per turn', () => {
    function healDelta(withT3: boolean): number {
      const state = buildMvpScenario(7, { registry, mapMode: 'fixed' });
      setDomains(state, 'savannah_lions', 'charge', ['charge', 'nature_healing']);
      addNodes(state, 'savannah_lions', withT3 ? ['nature_healing_t1', 'nature_healing_t2', 'nature_healing_t3'] : ['nature_healing_t1', 'nature_healing_t2']);
      const faction = state.factions.get('savannah_lions' as never)!;
      const unitId = faction.unitIds[0];
      const pos = { q: 8, r: 8 };
      setTerrain(state, pos, 'plains');
      setTerrain(state, { q: pos.q + 2, r: pos.r }, 'forest'); // within 3 hexes
      state.units = new Map([[unitId, { ...state.units.get(unitId)!, position: pos, hp: 50, maxHp: 100 }]]);
      state.factions.set('savannah_lions' as never, { ...faction, unitIds: [unitId], cityIds: [] });
      state.cities = new Map();
      const refreshed = refreshFactionUnits(state, 'savannah_lions' as never, registry);
      return refreshed.units.get(unitId)!.hp - 50;
    }
    const withT3 = healDelta(true);
    const control = healDelta(false);
    expect(withT3 - control).toBe(10); // ceil(100 * 0.1)
  });
});

describe('Batch C — Rows 3a/4: spike-line movement penalty (fortress T2)', () => {
  it('foreign bracing fortress unit makes adjacent hexes cost +1 to enemies (live)', () => {
    const state = buildMvpScenario(7, { registry, mapMode: 'fixed' });
    setDomains(state, 'hill_clan', 'venom', ['venom', 'fortress']); // foreign fortress
    addNodes(state, 'hill_clan', ['fortress_t2']);
    const hill = state.factions.get('hill_clan' as never)!;
    const fortId = hill.unitIds[0];
    const fortPos = { q: 8, r: 8 };
    addTag(state, state.units.get(fortId)!.prototypeId, ['fortress']);
    // Enemy mover next to a hex adjacent to the bracing fortress.
    const lions = state.factions.get('savannah_lions' as never)!;
    const moverId = lions.unitIds[0];
    const moverPos = { q: 6, r: 8 };
    const targetPos = { q: 7, r: 8 }; // adjacent to fortPos
    state.units = new Map([
      [fortId, { ...state.units.get(fortId)!, position: fortPos, preparedAbility: 'brace' }],
      [moverId, { ...state.units.get(moverId)!, position: moverPos, status: 'ready', movesRemaining: 5, maxMoves: 5 }],
    ]);
    state.factions.set('hill_clan' as never, { ...hill, unitIds: [fortId] });
    state.factions.set('savannah_lions' as never, { ...lions, unitIds: [moverId] });
    state.cities = new Map();
    setTerrain(state, fortPos, 'plains');
    setTerrain(state, moverPos, 'plains');
    setTerrain(state, targetPos, 'plains');

    const withSpike = previewMove(state, moverId, targetPos, state.map!, registry)!.totalCost;
    // Remove the brace -> no spike penalty.
    state.units.set(fortId, { ...state.units.get(fortId)!, preparedAbility: undefined });
    const without = previewMove(state, moverId, targetPos, state.map!, registry)!.totalCost;
    expect(withSpike - without).toBe(1);
  });

  it('native bracing fortress unit leaves a spike_line zone that persists', () => {
    const state = buildMvpScenario(7, { registry, mapMode: 'fixed' });
    setDomains(state, 'hill_clan', 'fortress', ['fortress']); // native fortress
    addNodes(state, 'hill_clan', ['fortress_t2']);
    const hill = state.factions.get('hill_clan' as never)!;
    const fortId = hill.unitIds[0];
    const fortPos = { q: 8, r: 8 };
    addTag(state, state.units.get(fortId)!.prototypeId, ['fortress']);
    state.units = new Map([[fortId, { ...state.units.get(fortId)!, position: fortPos, preparedAbility: 'brace' }]]);
    state.factions.set('hill_clan' as never, { ...hill, unitIds: [fortId] });
    state.cities = new Map();
    setTerrain(state, fortPos, 'plains');

    const refreshed = refreshFactionUnits(state, 'hill_clan' as never, registry);
    const zone = findZoneEffectByTypeAndOwner(refreshed, 'spike_line', 'hill_clan' as never);
    expect(zone).toBeDefined();
    // Enemy entering a hex covered by the zone pays +1.
    const adj = getNeighbors(fortPos)[0];
    expect(getZoneEffectMovementPenalty(refreshed, adj, 'savannah_lions' as never)).toBe(1);
    // Persists after the unit leaves and a round ticks.
    const ticked = tickZoneEffectLifetimes(refreshed);
    expect(getZoneEffectMovementPenalty(ticked, adj, 'savannah_lions' as never)).toBe(1);
  });
});

describe('Batch C — Row 11: coverProjection (native river_stealth T1)', () => {
  it('an ally adjacent to a stealthed River unit is concealed from enemy fog', () => {
    function allyVisible(native: boolean): boolean {
      const state = buildMvpScenario(7, { registry, mapMode: 'fixed' });
      if (native) setDomains(state, 'river_people', 'river_stealth', ['river_stealth']);
      else setDomains(state, 'river_people', 'venom', ['venom', 'river_stealth']);
      addNodes(state, 'river_people', ['river_stealth_t1']);
      const river = state.factions.get('river_people' as never)!;
      const sourceId = river.unitIds[0];
      const sourcePos = { q: 8, r: 8 };
      const allyId = 'cover_ally' as never;
      const allyPos = { q: 9, r: 8 };
      addTag(state, state.units.get(sourceId)!.prototypeId, ['stealth']);
      // Plains tiles so river_people's terrain stealth passive doesn't auto-hide the ally.
      setTerrain(state, sourcePos, 'plains');
      setTerrain(state, allyPos, 'plains');
      const baseRiver = state.units.get(sourceId)!;
      // Capture the enemy scout BEFORE rebuilding the units map, then rebuild.
      const lions = state.factions.get('savannah_lions' as never)!;
      const scoutId = lions.unitIds[0];
      const scoutBase = state.units.get(scoutId)!;
      state.units = new Map([
        [sourceId, { ...baseRiver, position: sourcePos, isStealthed: true, turnsSinceStealthBreak: 0 }],
        [allyId, { ...baseRiver, id: allyId, position: allyPos, isStealthed: false }],
        [scoutId, { ...scoutBase, position: { q: 11, r: 8 }, hp: scoutBase.maxHp }],
      ]);
      state.factions.set('river_people' as never, { ...river, unitIds: [sourceId, allyId] });
      state.factions.set('savannah_lions' as never, { ...lions, unitIds: [scoutId] });
      state.cities = new Map();

      const fogged = updateFogState(state, 'savannah_lions' as never);
      return isUnitVisibleTo(fogged, 'savannah_lions' as never, fogged.units.get(allyId)!);
    }
    expect(allyVisible(true)).toBe(false); // concealed by cover projection
    expect(allyVisible(false)).toBe(true); // foreign: no cover projection
  });
});

describe('Batch C — Row 19: Slave Army (slaving+slaving)', () => {
  const slaveArmy: ActiveSynergy = {
    pairId: 'slaving+slaving',
    name: 'Slave Army',
    domains: ['slaving', 'slaving'],
    effects: [
      { kind: 'statMod', stat: 'damage', op: 'set', value: 0.5 },
      { kind: 'setFlag', flag: 'slaveHordeIgnoresZoc' },
      { kind: 'setFlag', flag: 'slaveHordeDeathRally' },
    ],
  };

  it('a group of 3+ ignores enemy ZoC', () => {
    function entersZoc(withHorde: boolean): boolean {
      const state = buildMvpScenario(7, { registry, mapMode: 'fixed' });
      const pirates = state.factions.get('coral_people' as never)!;
      state.factions.set('coral_people' as never, { ...pirates, activeNativeSelfPair: slaveArmy });
      const moverId = pirates.unitIds[0];
      const moverPos = { q: 8, r: 8 };
      const targetPos = { q: 9, r: 8 };
      // Enemy ZoC source adjacent to the target hex.
      const lions = state.factions.get('savannah_lions' as never)!;
      const zocId = lions.unitIds[0];
      const zocPos = { q: 10, r: 8 }; // adjacent to targetPos
      const units = new Map<never, never>();
      units.set(moverId as never, { ...state.units.get(moverId)!, position: moverPos, status: 'ready', movesRemaining: 5, maxMoves: 5 } as never);
      units.set(zocId as never, { ...state.units.get(zocId)!, position: zocPos } as never);
      const allyIds: string[] = [];
      if (withHorde) {
        // Two same-faction allies adjacent to the mover.
        [{ q: 7, r: 8 }, { q: 8, r: 7 }].forEach((hex, i) => {
          const aid = `horde_ally_${i}`;
          units.set(aid as never, { ...state.units.get(moverId)!, id: aid, position: hex } as never);
          allyIds.push(aid);
          setTerrain(state, hex, 'plains');
        });
      }
      state.units = units as never;
      state.factions.set('coral_people' as never, { ...state.factions.get('coral_people' as never)!, unitIds: [moverId, ...(allyIds as never[])] });
      state.factions.set('savannah_lions' as never, { ...lions, unitIds: [zocId] });
      state.cities = new Map();
      setTerrain(state, moverPos, 'plains');
      setTerrain(state, targetPos, 'plains');
      setTerrain(state, zocPos, 'plains');
      return previewMove(state, moverId, targetPos, state.map!, registry)!.entersZoC;
    }
    expect(entersZoc(true)).toBe(false); // horde ignores ZoC
    expect(entersZoc(false)).toBe(true); // lone unit is pinned
  });

  it('a slave death rallies adjacent allies with +1 movement', () => {
    function allyMovesAfterKill(withSynergy: boolean): number {
      const state = buildMvpScenario(7, { registry, mapMode: 'fixed' });
      const lions = state.factions.get('savannah_lions' as never)!; // attacker
      const pirates = state.factions.get('coral_people' as never)!; // defender (slave army)
      if (withSynergy) state.factions.set('coral_people' as never, { ...pirates, activeNativeSelfPair: slaveArmy });
      const atkId = lions.unitIds[0];
      const defId = pirates.unitIds[0];
      const atkPos = { q: 8, r: 8 };
      const defPos = { q: 9, r: 8 };
      const allyId = 'rally_ally' as never;
      const allyPos = { q: 10, r: 8 }; // adjacent to defender
      const units = new Map<never, never>();
      units.set(atkId as never, { ...state.units.get(atkId)!, position: atkPos, status: 'ready', attacksRemaining: 1, movesRemaining: 1, hp: 100, maxHp: 100 } as never);
      units.set(defId as never, { ...state.units.get(defId)!, position: defPos, hp: 1, maxHp: 1 } as never);
      units.set(allyId, { ...state.units.get(defId)!, id: allyId, position: allyPos, hp: 50, maxHp: 50, movesRemaining: 2, maxMoves: 2 } as never);
      state.units = units as never;
      state.factions.set('savannah_lions' as never, { ...lions, unitIds: [atkId] });
      state.factions.set('coral_people' as never, { ...state.factions.get('coral_people' as never)!, unitIds: [defId, allyId] });
      state.cities = new Map();
      setTerrain(state, atkPos, 'plains');
      setTerrain(state, defPos, 'plains');
      setTerrain(state, allyPos, 'plains');
      state.activeFactionId = 'savannah_lions' as never;
      const preview = previewCombatAction(state, registry, atkId, defId);
      const result = applyCombatAction(state, registry, preview!);
      expect(result.state.units.has(defId)).toBe(false); // defender died
      return result.state.units.get(allyId)!.movesRemaining;
    }
    expect(allyMovesAfterKill(true)).toBe(3); // 2 + 1 rally
    expect(allyMovesAfterKill(false)).toBe(2); // no rally
  });
});
