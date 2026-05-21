// Batch A — movement/vision wiring consumption tests.
// Each test observes a gameplay delta (move cost, fog visibility, movement
// penalty), not just that a doctrine flag was set.
import { describe, it, expect } from 'vitest';
import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { previewMove } from '../src/systems/movementSystem';
import { createResearchState } from '../src/systems/researchSystem';
import {
  updateFogState,
  getVisibleEnemyUnits,
  isUnitVisibleTo,
  getHexVisibility,
  applyStealthRevealPenalty,
} from '../src/systems/fogSystem';
import { refreshFactionUnits } from '../src/systems/simulation/unitRefresh';
import { hexToKey, getNeighbors } from '../src/core/grid';
import type { GameState } from '../src/game/types';

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

function setNative(state: GameState, factionId: string, domain: string) {
  const f = state.factions.get(factionId as never)!;
  state.factions.set(factionId as never, {
    ...f,
    nativeDomain: domain as never,
    nativeDomains: [domain as never],
    learnedDomains: [...new Set([...f.learnedDomains, domain as never])],
  });
}

function setTerrain(state: GameState, pos: { q: number; r: number }, terrain: string) {
  state.map!.tiles.set(hexToKey(pos), { position: pos, terrain: terrain as never });
}

// Isolate a single living unit for a faction, optionally stripping movement tags.
function soloUnit(state: GameState, factionId: string, stripMoveTags = false) {
  const faction = state.factions.get(factionId as never)!;
  const unitId = faction.unitIds[0];
  const unit = state.units.get(unitId)!;
  if (stripMoveTags) {
    const proto = state.prototypes.get(unit.prototypeId)!;
    state.prototypes.set(unit.prototypeId, {
      ...proto,
      tags: (proto.tags ?? []).filter((t) => t !== 'camel' && t !== 'ignore_terrain'),
    });
  }
  return { unitId, unit };
}

describe('Batch A — Row 6: nomadicTerrainImmunity (native camel T1)', () => {
  it('native camel T1 reduces ALL passable terrain to cost 1; foreign T1 does not', () => {
    // Native: jungle_clan reassigned to native camel_adaptation.
    const stateNative = buildMvpScenario(7, { registry, mapMode: 'fixed' });
    setNative(stateNative, 'jungle_clan', 'camel_adaptation');
    addNodes(stateNative, 'jungle_clan', ['camel_adaptation_t1']);
    const { unitId, unit } = soloUnit(stateNative, 'jungle_clan', true);
    stateNative.units = new Map([[unitId, { ...unit, status: 'ready', movesRemaining: 2, maxMoves: 2 }]]);
    stateNative.cities = new Map();
    // Use hill (cost 2): jungle_stalkers passive reduces forest/jungle/swamp but not hill.
    const hillHex = getNeighbors(unit.position)[0];
    setTerrain(stateNative, hillHex, 'hill');

    const nativePreview = previewMove(stateNative, unitId, hillHex, stateNative.map!, registry);
    expect(nativePreview?.totalCost).toBe(1);

    // Foreign control: same research, but native domain stays venom.
    const stateForeign = buildMvpScenario(7, { registry, mapMode: 'fixed' });
    addNodes(stateForeign, 'jungle_clan', ['camel_adaptation_t1']);
    const fo = soloUnit(stateForeign, 'jungle_clan', true);
    stateForeign.units = new Map([[fo.unitId, { ...fo.unit, status: 'ready', movesRemaining: 2, maxMoves: 2 }]]);
    stateForeign.cities = new Map();
    const hillHex2 = getNeighbors(fo.unit.position)[0];
    setTerrain(stateForeign, hillHex2, 'hill');

    const foreignPreview = previewMove(stateForeign, fo.unitId, hillHex2, stateForeign.map!, registry);
    expect(foreignPreview?.totalCost).toBe(2);
  });
});

describe('Batch A — Row 13: pirateNavalVision (native tidal_warfare T1)', () => {
  it('native Pirate Lords gain +1 vision from a coast hex; foreign do not', () => {
    function visibilityAtDistance4(setupNative: boolean): string {
      const state = buildMvpScenario(11, { registry, mapMode: 'fixed' });
      // coral_people is already native tidal_warfare; foreign control re-homes it.
      if (!setupNative) setNative(state, 'coral_people', 'venom');
      addNodes(state, 'coral_people', ['tidal_warfare_t1']);

      const faction = state.factions.get('coral_people' as never)!;
      const unitId = faction.unitIds[0];
      const unit = state.units.get(unitId)!;
      const pos = unit.position;
      state.units = new Map([[unitId, { ...unit, hp: unit.maxHp }]]);
      state.factions.set('coral_people' as never, { ...faction, unitIds: [unitId], cityIds: [] });
      state.cities = new Map();

      setTerrain(state, pos, 'coast');
      const farHex = { q: pos.q + 4, r: pos.r };
      setTerrain(state, farHex, 'plains');

      const fogged = updateFogState(state, 'coral_people' as never);
      return getHexVisibility(fogged, 'coral_people' as never, farHex);
    }

    expect(visibilityAtDistance4(true)).toBe('visible');
    expect(visibilityAtDistance4(false)).toBe('hidden');
  });
});

describe('Batch A — Row 7: mirageRange (foreign camel T2)', () => {
  it('hides a desert unit from enemies beyond mirageRange, reveals within', () => {
    function buildScene(scoutDistance: number) {
      const state = buildMvpScenario(13, { registry, mapMode: 'fixed' });
      // jungle_clan = foreign camel (nativeDomain venom) with camel_adaptation_t2.
      addNodes(state, 'jungle_clan', ['camel_adaptation_t1', 'camel_adaptation_t2']);

      const jungle = state.factions.get('jungle_clan' as never)!;
      const hideId = jungle.unitIds[0];
      const hideUnit = state.units.get(hideId)!;
      const hidePos = { q: 8, r: 8 };

      const lions = state.factions.get('savannah_lions' as never)!;
      const scoutId = lions.unitIds[0];
      const scoutUnit = state.units.get(scoutId)!;
      const scoutPos = { q: 8 + scoutDistance, r: 8 };

      state.units = new Map([
        [hideId, { ...hideUnit, position: hidePos, hp: hideUnit.maxHp }],
        [scoutId, { ...scoutUnit, position: scoutPos, hp: scoutUnit.maxHp }],
      ]);
      state.factions.set('jungle_clan' as never, { ...jungle, unitIds: [hideId], cityIds: [] });
      state.factions.set('savannah_lions' as never, { ...lions, unitIds: [scoutId], cityIds: [] });
      state.cities = new Map();

      setTerrain(state, hidePos, 'desert');
      setTerrain(state, scoutPos, 'plains');

      const fogged = updateFogState(state, 'savannah_lions' as never);
      return { state: fogged, hideId, scoutId };
    }

    // Scout 3 hexes away (> mirageRange 2): hidden.
    const far = buildScene(3);
    const farHidden = far.state.units.get(far.hideId)!;
    expect(isUnitVisibleTo(far.state, 'savannah_lions' as never, farHidden)).toBe(false);
    expect(getVisibleEnemyUnits(far.state, 'savannah_lions' as never).some((e) => e.unit.id === far.hideId)).toBe(false);

    // Scout 2 hexes away (within mirageRange): visible.
    const near = buildScene(2);
    const nearHidden = near.state.units.get(near.hideId)!;
    expect(isUnitVisibleTo(near.state, 'savannah_lions' as never, nearHidden)).toBe(true);
    expect(getVisibleEnemyUnits(near.state, 'savannah_lions' as never).some((e) => e.unit.id === near.hideId)).toBe(true);
  });
});

describe('Batch A — Row 8: mirageAllRough (native camel T2)', () => {
  it('native camel hides on forest (rough); foreign camel does not', () => {
    function buildScene(native: boolean) {
      const state = buildMvpScenario(17, { registry, mapMode: 'fixed' });
      if (native) setNative(state, 'jungle_clan', 'camel_adaptation');
      addNodes(state, 'jungle_clan', ['camel_adaptation_t1', 'camel_adaptation_t2']);

      const jungle = state.factions.get('jungle_clan' as never)!;
      const hideId = jungle.unitIds[0];
      const hideUnit = state.units.get(hideId)!;
      const hidePos = { q: 8, r: 8 };

      const lions = state.factions.get('savannah_lions' as never)!;
      const scoutId = lions.unitIds[0];
      const scoutUnit = state.units.get(scoutId)!;
      const scoutPos = { q: 11, r: 8 }; // distance 3

      state.units = new Map([
        [hideId, { ...hideUnit, position: hidePos, hp: hideUnit.maxHp }],
        [scoutId, { ...scoutUnit, position: scoutPos, hp: scoutUnit.maxHp }],
      ]);
      state.factions.set('jungle_clan' as never, { ...jungle, unitIds: [hideId], cityIds: [] });
      state.factions.set('savannah_lions' as never, { ...lions, unitIds: [scoutId], cityIds: [] });
      state.cities = new Map();

      setTerrain(state, hidePos, 'forest');
      setTerrain(state, scoutPos, 'plains');

      const fogged = updateFogState(state, 'savannah_lions' as never);
      return { state: fogged, hideId };
    }

    const nativeScene = buildScene(true);
    const nativeHidden = nativeScene.state.units.get(nativeScene.hideId)!;
    expect(isUnitVisibleTo(nativeScene.state, 'savannah_lions' as never, nativeHidden)).toBe(false);

    const foreignScene = buildScene(false);
    const foreignHidden = foreignScene.state.units.get(foreignScene.hideId)!;
    expect(isUnitVisibleTo(foreignScene.state, 'savannah_lions' as never, foreignHidden)).toBe(true);
  });
});

describe('Batch A — Row 12: revealMovementPenalty (foreign river_stealth T3)', () => {
  it('revealed stealthed enemies lose 1 movement on their next turn', () => {
    const state = buildMvpScenario(19, { registry, mapMode: 'fixed' });
    // jungle_clan takes river_stealth to T3 as a FOREIGN domain (native stays venom).
    setNative(state, 'jungle_clan', 'venom');
    state.factions.set('jungle_clan' as never, {
      ...state.factions.get('jungle_clan' as never)!,
      learnedDomains: ['venom' as never, 'river_stealth' as never],
    });
    addNodes(state, 'jungle_clan', ['river_stealth_t1', 'river_stealth_t2', 'river_stealth_t3']);

    const jungle = state.factions.get('jungle_clan' as never)!;
    const scoutId = jungle.unitIds[0];
    const scoutUnit = state.units.get(scoutId)!;
    const scoutProto = state.prototypes.get(scoutUnit.prototypeId)!;
    state.prototypes.set(scoutUnit.prototypeId, {
      ...scoutProto,
      tags: [...new Set([...(scoutProto.tags ?? []), 'stealth'])],
    });
    const scoutPos = { q: 8, r: 8 };

    // Enemy stealthed unit within reveal range (2).
    const lions = state.factions.get('savannah_lions' as never)!;
    const enemyId = lions.unitIds[0];
    const enemyUnit = state.units.get(enemyId)!;
    const enemyPos = { q: 9, r: 8 }; // distance 1

    state.units = new Map([
      [scoutId, { ...scoutUnit, position: scoutPos, isStealthed: true, turnsSinceStealthBreak: 0, hp: scoutUnit.maxHp }],
      [enemyId, { ...enemyUnit, position: enemyPos, isStealthed: true, hp: enemyUnit.maxHp, maxMoves: 3, movesRemaining: 3, nextTurnMovePenalty: undefined }],
    ]);
    state.factions.set('jungle_clan' as never, { ...jungle, unitIds: [scoutId] });
    state.factions.set('savannah_lions' as never, { ...lions, unitIds: [enemyId] });
    setTerrain(state, scoutPos, 'plains');
    setTerrain(state, enemyPos, 'plains');

    const penalized = applyStealthRevealPenalty(state, 'jungle_clan' as never);
    expect(penalized.units.get(enemyId)!.nextTurnMovePenalty).toBe(1);

    // Observe the gameplay delta: the enemy refreshes with 1 fewer move.
    const refreshed = refreshFactionUnits(penalized, 'savannah_lions' as never, registry);
    expect(refreshed.units.get(enemyId)!.movesRemaining).toBe(2); // maxMoves 3 - 1

    // Control: without river_stealth_t3 there is no reveal penalty.
    const control = buildMvpScenario(19, { registry, mapMode: 'fixed' });
    const cj = control.factions.get('jungle_clan' as never)!;
    const cScoutId = cj.unitIds[0];
    const cScout = control.units.get(cScoutId)!;
    const cProto = control.prototypes.get(cScout.prototypeId)!;
    control.prototypes.set(cScout.prototypeId, { ...cProto, tags: [...new Set([...(cProto.tags ?? []), 'stealth'])] });
    const cl = control.factions.get('savannah_lions' as never)!;
    const cEnemyId = cl.unitIds[0];
    const cEnemy = control.units.get(cEnemyId)!;
    control.units = new Map([
      [cScoutId, { ...cScout, position: { q: 8, r: 8 }, isStealthed: true, turnsSinceStealthBreak: 0 }],
      [cEnemyId, { ...cEnemy, position: { q: 9, r: 8 }, isStealthed: true }],
    ]);
    control.factions.set('jungle_clan' as never, { ...cj, unitIds: [cScoutId] });
    control.factions.set('savannah_lions' as never, { ...cl, unitIds: [cEnemyId] });
    const noPenalty = applyStealthRevealPenalty(control, 'jungle_clan' as never);
    expect(noPenalty.units.get(cEnemyId)!.nextTurnMovePenalty ?? 0).toBe(0);
  });
});
