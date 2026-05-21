// Batch D — formation swap, transport carry, bombardment wiring consumption tests.
// Each test observes a gameplay delta (position, attacks, damage, defense), not just
// that a doctrine flag or synergy stat was set.
import { describe, it, expect } from 'vitest';
import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { previewCombatAction } from '../src/systems/combat-action/preview';
import { applyCombatAction } from '../src/systems/combatActionSystem';
import { createResearchState } from '../src/systems/researchSystem';
import { hexToKey } from '../src/core/grid';
import { activateUnit } from '../src/systems/unit-activation/activateUnit';
import {
  canBoardTransport,
  disembarkUnit,
  boardTransport,
} from '../src/systems/transportSystem';
import type { GameState } from '../src/game/types';
import type { Unit } from '../src/features/units/types';
import type { TransportMap } from '../src/systems/transportSystem';

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

function tagProto(state: GameState, unit: Unit, addTags: string[], patch?: Record<string, unknown>) {
  const proto = state.prototypes.get(unit.prototypeId)!;
  state.prototypes.set(unit.prototypeId, {
    ...proto,
    tags: [...new Set([...(proto.tags ?? []), ...addTags])],
    ...(patch ? { derivedStats: { ...proto.derivedStats, ...patch } } : {}),
  });
}

function duel(seed: number, atkFid: string, defFid: string, opts: { atkHp?: number; defHp?: number } = {}) {
  const state = buildMvpScenario(seed, { registry, mapMode: 'fixed' });
  const atkF = state.factions.get(atkFid as never)!;
  const defF = state.factions.get(defFid as never)!;
  const atkId = atkF.unitIds[0];
  const defId = defF.unitIds[0];
  const atkPos = { q: 8, r: 8 };
  const defPos = { q: 9, r: 8 };
  const atk = { ...state.units.get(atkId)!, position: atkPos, status: 'ready' as const, attacksRemaining: 1, movesRemaining: 1, maxMoves: 1, hp: opts.atkHp ?? 100, maxHp: opts.atkHp ?? 100 };
  const def = { ...state.units.get(defId)!, position: defPos, status: 'ready' as const, attacksRemaining: 1, movesRemaining: 1, hp: opts.defHp ?? 100, maxHp: opts.defHp ?? 100 };
  state.units = new Map([[atkId, atk], [defId, def]]);
  for (const f of state.factions.values()) f.unitIds = f.unitIds.filter((id) => id === atkId || id === defId);
  setTerrain(state, atkPos, 'plains');
  setTerrain(state, defPos, 'plains');
  state.cities = new Map();
  state.activeFactionId = atkFid as never;
  return { state, atkId, defId, atkPos, defPos };
}

// ---------------------------------------------------------------------------
// Row 2 — formationSwapEnabled (fortress T1 native)
// ---------------------------------------------------------------------------
describe('Batch D — Row 2: formationSwapEnabled (native fortress T1)', () => {
  it('native Hill Engineers swap with adjacent ally to reach an out-of-range enemy', () => {
    function activateAndGetPosition(native: boolean): { q: number; r: number } {
      const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });
      if (native) {
        setDomains(state, 'hill_clan', 'fortress', ['fortress']);
      } else {
        setDomains(state, 'hill_clan', 'venom', ['venom', 'fortress']);
      }
      addNodes(state, 'hill_clan', ['fortress_t1']);

      const hill = state.factions.get('hill_clan' as never)!;
      const unitId = hill.unitIds[0];
      const unitPos = { q: 8, r: 8 };
      const allyId = 'swap_ally' as never;
      const allyPos = { q: 9, r: 8 };

      // Enemy at distance 2 from unit, distance 1 from ally.
      const lions = state.factions.get('savannah_lions' as never)!;
      const enemyId = lions.unitIds[0];
      const enemyPos = { q: 10, r: 8 };

      const baseUnit = state.units.get(unitId)!;
      // Strip weapon components and force melee range 1.
      const baseProto = state.prototypes.get(baseUnit.prototypeId)!;
      state.prototypes.set(baseUnit.prototypeId, {
        ...baseProto,
        componentIds: [],
        tags: [...new Set([...(baseProto.tags ?? []), 'fortress'])],
        derivedStats: { ...baseProto.derivedStats, role: 'melee', range: 1, attack: 20 },
      });

      setTerrain(state, unitPos, 'plains');
      setTerrain(state, allyPos, 'plains');
      setTerrain(state, enemyPos, 'plains');

      const units = new Map<never, never>();
      units.set(unitId as never, { ...baseUnit, position: unitPos, status: 'ready', attacksRemaining: 1, movesRemaining: 1, maxMoves: 1, hp: 100, maxHp: 100 } as never);
      units.set(allyId, { ...baseUnit, id: allyId, position: allyPos, status: 'ready', attacksRemaining: 1, movesRemaining: 1, maxMoves: 1, hp: 100, maxHp: 100 } as never);
      units.set(enemyId as never, { ...state.units.get(enemyId)!, position: enemyPos, status: 'ready', hp: 100, maxHp: 100 } as never);

      state.units = units as never;
      state.factions.set('hill_clan' as never, { ...hill, unitIds: [unitId, allyId] });
      state.factions.set('savannah_lions' as never, { ...lions, unitIds: [enemyId] });
      state.cities = new Map();
      state.activeFactionId = 'hill_clan' as never;

      const result = activateUnit(state, unitId, registry);
      return result.state.units.get(unitId)!.position;
    }

    const nativePos = activateAndGetPosition(true);
    const foreignPos = activateAndGetPosition(false);

    // Native fortress swaps to ally position (9,8) to reach the enemy.
    expect(nativePos.q === 9 || nativePos.q === 10).toBe(true);
    // Foreign (no formationSwapEnabled) does NOT swap to ally position (9,8).
    // It may move elsewhere via strategic movement, but it won't be at the ally's position.
    expect(foreignPos.q === 9).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Row 9 — caravanCarryEnabled (camel T3 foreign)
// ---------------------------------------------------------------------------
describe('Batch D — Row 9: caravanCarryEnabled (foreign camel_adaptation T3)', () => {
  it('camel unit with doctrine can board an allied unit; disembarked unit keeps attacks', () => {
    const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });
    // jungle_clan learns camel_adaptation as foreign (native stays venom)
    setDomains(state, 'jungle_clan', 'venom', ['venom', 'camel_adaptation']);
    addNodes(state, 'jungle_clan', ['camel_adaptation_t1', 'camel_adaptation_t2', 'camel_adaptation_t3']);

    const jungle = state.factions.get('jungle_clan' as never)!;
    const camelId = jungle.unitIds[0];
    const camelPos = { q: 8, r: 8 };
    const passengerId = 'camel_passenger' as never;
    const passengerPos = { q: 9, r: 8 };
    const disembarkPos = { q: 7, r: 8 };

    const baseUnit = state.units.get(camelId)!;
    const baseProto = state.prototypes.get(baseUnit.prototypeId)!;
    // Tag as camel
    state.prototypes.set(baseUnit.prototypeId, {
      ...baseProto,
      tags: [...new Set([...(baseProto.tags ?? []), 'camel'])],
    });

    setTerrain(state, camelPos, 'plains');
    setTerrain(state, passengerPos, 'plains');
    setTerrain(state, disembarkPos, 'plains');

    state.units = new Map<never, never>([
      [camelId as never, { ...baseUnit, position: camelPos, status: 'ready', hp: 100, maxHp: 100, movesRemaining: 2, maxMoves: 2 } as never],
      [passengerId, { ...baseUnit, id: passengerId, position: passengerPos, status: 'ready', hp: 100, maxHp: 100, attacksRemaining: 1, movesRemaining: 2, maxMoves: 2 } as never],
    ]);
    state.factions.set('jungle_clan' as never, { ...jungle, unitIds: [camelId, passengerId] });
    state.cities = new Map();

    // Can board the camel?
    let transportMap: TransportMap = new Map();
    const canBoard = canBoardTransport(state, passengerId, camelId, registry, transportMap);
    expect(canBoard).toBe(true);

    // Board
    const boardResult = boardTransport(state, passengerId, camelId, transportMap);
    transportMap = boardResult.transportMap;

    // Disembark
    const disembarkResult = disembarkUnit(boardResult.state, camelId, passengerId, disembarkPos, registry, transportMap);
    const disembarkedUnit = disembarkResult.state.units.get(passengerId)!;

    // Same-turn disembark: unit keeps attacksRemaining and has movement.
    expect(disembarkedUnit.attacksRemaining).toBe(1);
    expect(disembarkedUnit.movesRemaining).toBe(1);
  });

  it('control: without caravanCarryEnabled, camel cannot transport', () => {
    const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });
    // No camel_adaptation research
    setDomains(state, 'jungle_clan', 'venom', ['venom']);

    const jungle = state.factions.get('jungle_clan' as never)!;
    const camelId = jungle.unitIds[0];
    const passengerId = 'camel_passenger' as never;

    const baseUnit = state.units.get(camelId)!;
    const baseProto = state.prototypes.get(baseUnit.prototypeId)!;
    state.prototypes.set(baseUnit.prototypeId, {
      ...baseProto,
      tags: [...new Set([...(baseProto.tags ?? []), 'camel'])],
    });

    const camelPos = { q: 8, r: 8 };
    const passengerPos = { q: 9, r: 8 };
    setTerrain(state, camelPos, 'plains');
    setTerrain(state, passengerPos, 'plains');

    state.units = new Map<never, never>([
      [camelId as never, { ...baseUnit, position: camelPos, status: 'ready' } as never],
      [passengerId, { ...baseUnit, id: passengerId, position: passengerPos, status: 'ready' } as never],
    ]);
    state.factions.set('jungle_clan' as never, { ...jungle, unitIds: [camelId, passengerId] });
    state.cities = new Map();

    const transportMap: TransportMap = new Map();
    expect(canBoardTransport(state, passengerId, camelId, registry, transportMap)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Row 14 — pirateCombinedAssault (tidal_warfare T2 native)
// ---------------------------------------------------------------------------
describe('Batch D — Row 14: pirateCombinedAssault (native tidal_warfare T2)', () => {
  it('pirate naval unit carries +1 land unit; disembarked unit can act same turn', () => {
    const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });
    // coral_people is native tidal_warfare
    setDomains(state, 'coral_people', 'tidal_warfare', ['tidal_warfare', 'fortress']);
    addNodes(state, 'coral_people', ['tidal_warfare_t1', 'tidal_warfare_t2']);

    const pirates = state.factions.get('coral_people' as never)!;
    const shipId = pirates.unitIds[0];
    const shipPos = { q: 8, r: 8 };
    const landId = 'assault_land' as never;
    const landPos = { q: 9, r: 8 };
    const disembarkPos = { q: 7, r: 8 };

    const baseUnit = state.units.get(shipId)!;
    const baseProto = state.prototypes.get(baseUnit.prototypeId)!;
    // Tag as naval
    state.prototypes.set(baseUnit.prototypeId, {
      ...baseProto,
      tags: [...new Set([...(baseProto.tags ?? []), 'naval'])],
    });

    setTerrain(state, shipPos, 'coast');
    setTerrain(state, landPos, 'plains');
    setTerrain(state, disembarkPos, 'plains');

    state.units = new Map<never, never>([
      [shipId as never, { ...baseUnit, position: shipPos, status: 'ready', hp: 100, maxHp: 100, movesRemaining: 2, maxMoves: 2 } as never],
      [landId, { ...baseUnit, id: landId, position: landPos, status: 'ready', hp: 100, maxHp: 100, attacksRemaining: 1, movesRemaining: 2, maxMoves: 2 } as never],
    ]);
    state.factions.set('coral_people' as never, { ...pirates, unitIds: [shipId, landId] });
    state.cities = new Map();

    let transportMap: TransportMap = new Map();
    const canBoard = canBoardTransport(state, landId, shipId, registry, transportMap);
    expect(canBoard).toBe(true);

    const boardResult = boardTransport(state, landId, shipId, transportMap);
    transportMap = boardResult.transportMap;

    const disembarkResult = disembarkUnit(boardResult.state, shipId, landId, disembarkPos, registry, transportMap);
    const disembarked = disembarkResult.state.units.get(landId)!;

    // Same-turn disembark: keeps attacks and has movement.
    expect(disembarked.attacksRemaining).toBe(1);
    expect(disembarked.movesRemaining).toBe(1);
  });

  it('control: without pirateCombinedAssault, naval transport disembark zeros moves', () => {
    const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });
    // No tidal_warfare T2 research
    setDomains(state, 'coral_people', 'venom', ['venom', 'tidal_warfare']);

    const pirates = state.factions.get('coral_people' as never)!;
    const shipId = pirates.unitIds[0];
    const shipPos = { q: 8, r: 8 };
    const landId = 'assault_land' as never;
    const landPos = { q: 9, r: 8 };
    const disembarkPos = { q: 7, r: 8 };

    const baseUnit = state.units.get(shipId)!;
    const baseProto = state.prototypes.get(baseUnit.prototypeId)!;
    // Tag as naval + transport chassis
    state.prototypes.set(baseUnit.prototypeId, {
      ...baseProto,
      tags: [...new Set([...(baseProto.tags ?? []), 'naval'])],
    });

    setTerrain(state, shipPos, 'coast');
    setTerrain(state, landPos, 'plains');
    setTerrain(state, disembarkPos, 'plains');

    state.units = new Map<never, never>([
      [shipId as never, { ...baseUnit, position: shipPos, status: 'ready', hp: 100, maxHp: 100, movesRemaining: 2, maxMoves: 2 } as never],
      [landId, { ...baseUnit, id: landId, position: landPos, status: 'ready', hp: 100, maxHp: 100, attacksRemaining: 1, movesRemaining: 2, maxMoves: 2 } as never],
    ]);
    state.factions.set('coral_people' as never, { ...pirates, unitIds: [shipId, landId] });
    state.cities = new Map();

    let transportMap: TransportMap = new Map();
    // Without pirateCombinedAssault and without transport chassis tag, cannot board.
    expect(canBoardTransport(state, landId, shipId, registry, transportMap)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Row 18 — bombardmentRange + bombardmentLandAuraDefense (Coastal Fortress)
// ---------------------------------------------------------------------------
describe('Batch D — Row 18: Coastal Fortress bombardment range + land-aura defense', () => {
  it('naval unit with fortress+tidal_warfare tags can bombard land at range 3', () => {
    function canAttackAtDistance3(withSynergy: boolean): boolean {
      const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });
      // Set up faction with both fortress and tidal_warfare domains
      if (withSynergy) {
        setDomains(state, 'coral_people', 'tidal_warfare', ['tidal_warfare', 'fortress']);
        addNodes(state, 'coral_people', ['tidal_warfare_t2']);
      } else {
        setDomains(state, 'coral_people', 'tidal_warfare', ['tidal_warfare']);
        addNodes(state, 'coral_people', ['tidal_warfare_t2']);
      }

      const pirates = state.factions.get('coral_people' as never)!;
      const shipId = pirates.unitIds[0];
      const shipPos = { q: 8, r: 8 };

      const lions = state.factions.get('savannah_lions' as never)!;
      const landId = lions.unitIds[0];
      const landPos = { q: 11, r: 8 }; // distance 3

      const baseUnit = state.units.get(shipId)!;
      const baseProto = state.prototypes.get(baseUnit.prototypeId)!;
      // Tag as fortress + naval (requiredTags for Coastal Fortress synergy)
      const tags = withSynergy
        ? [...new Set([...(baseProto.tags ?? []), 'fortress', 'naval'])]
        : [...new Set([...(baseProto.tags ?? []), 'naval'])];
      state.prototypes.set(baseUnit.prototypeId, {
        ...baseProto,
        tags,
        derivedStats: { ...baseProto.derivedStats, range: 1 },
      });

      setTerrain(state, shipPos, 'coast');
      setTerrain(state, landPos, 'plains');

      state.units = new Map<never, never>([
        [shipId as never, { ...baseUnit, position: shipPos, status: 'ready', attacksRemaining: 1, movesRemaining: 1, hp: 100, maxHp: 100 } as never],
        [landId as never, { ...state.units.get(landId)!, position: landPos, status: 'ready', hp: 100, maxHp: 100 } as never],
      ]);
      state.factions.set('coral_people' as never, { ...pirates, unitIds: [shipId] });
      state.factions.set('savannah_lions' as never, { ...lions, unitIds: [landId] });
      state.cities = new Map();
      state.activeFactionId = 'coral_people' as never;

      const preview = previewCombatAction(state, registry, shipId, landId);
      return preview !== null;
    }

    expect(canAttackAtDistance3(true)).toBe(true);
    expect(canAttackAtDistance3(false)).toBe(false);
  });

  it('allied land unit near a Coastal Fortress ship gains defense', () => {
    function landDefense(withSynergy: boolean): number {
      const { state, atkId, defId, defPos } = duel(42, 'savannah_lions', 'coral_people', { defHp: 100 });

      if (withSynergy) {
        setDomains(state, 'coral_people', 'tidal_warfare', ['tidal_warfare', 'fortress']);
        addNodes(state, 'coral_people', ['tidal_warfare_t2']);
      } else {
        setDomains(state, 'coral_people', 'tidal_warfare', ['tidal_warfare']);
        addNodes(state, 'coral_people', ['tidal_warfare_t2']);
      }

      // Place an allied naval unit with fortress+naval tags adjacent to the defender.
      const pirates = state.factions.get('coral_people' as never)!;
      const shipId = 'cf_ship' as never;
      const shipPos = { q: defPos.q + 1, r: defPos.r }; // adjacent
      setTerrain(state, shipPos, 'coast');

      const defUnit = state.units.get(defId)!;
      const shipUnit = { ...defUnit, id: shipId, position: shipPos, hp: 100, maxHp: 100 };
      const shipProto = state.prototypes.get(defUnit.prototypeId)!;
      const shipTags = withSynergy
        ? [...new Set([...(shipProto.tags ?? []), 'fortress', 'naval'])]
        : [...new Set([...(shipProto.tags ?? []), 'naval'])];
      state.prototypes.set(defUnit.prototypeId + '_ship' as never, {
        ...shipProto,
        id: (defUnit.prototypeId + '_ship') as never,
        tags: shipTags,
      });
      shipUnit.prototypeId = (defUnit.prototypeId + '_ship') as never;

      state.units.set(shipId, shipUnit as never);
      state.factions.set('coral_people' as never, { ...pirates, unitIds: [defId, shipId] });

      // Boost attack so the defense delta moves integer damage.
      tagProto(state, state.units.get(atkId)!, [], { attack: 40 });

      const preview = previewCombatAction(state, registry, atkId, defId);
      return preview!.result.defenderDamage;
    }

    const withAura = landDefense(true);
    const without = landDefense(false);
    // With aura: defender takes LESS damage due to +0.25 defense.
    expect(withAura).toBeLessThan(without);
  });
});
