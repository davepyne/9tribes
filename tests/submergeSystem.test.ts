import { describe, it, expect } from 'vitest';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { canSubmerge, executeSubmerge, getConnectedWaterway } from '../src/systems/submergeSystem';
import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { createResearchState } from '../src/systems/researchSystem';
import { resolveResearchDoctrine } from '../src/systems/capabilityDoctrine';
import type { GameState, Unit } from '../src/game/types';
import type { FactionId, UnitId } from '../src/types';
import { hexToKey } from '../src/core/grid';
import { createUnitId } from '../src/core/ids';

const registry = loadRulesRegistry();

function addResearchNodes(state: GameState, factionId: string, nodes: string[]) {
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

function clearUnits(state: GameState): GameState {
  for (const faction of state.factions.values()) {
    faction.unitIds = [];
  }
  state.units = new Map();
  return state;
}

function placeUnit(
  state: GameState,
  factionId: FactionId,
  position: { q: number; r: number },
  overrides?: Partial<Unit>,
): UnitId {
  const faction = state.factions.get(factionId)!;
  const protoId = faction.prototypeIds[0];
  const unitId = createUnitId();
  const unit: Unit = {
    id: unitId,
    factionId,
    position,
    facing: 0,
    hp: 10,
    maxHp: 10,
    movesRemaining: 2,
    maxMoves: 2,
    attacksRemaining: 1,
    xp: 0,
    veteranLevel: 'green',
    status: 'ready',
    prototypeId: protoId,
    history: [],
    morale: 100,
    routed: false,
    poisoned: false,
    poisonStacks: 0,
    poisonTurnsRemaining: 0,
    enteredZoCThisActivation: false,
    isStealthed: false,
    turnsSinceStealthBreak: 0,
    learnedAbilities: [],
    ...overrides,
  };
  state.units.set(unitId, unit);
  faction.unitIds = [...faction.unitIds, unitId];
  return unitId;
}

function setTerrain(state: GameState, position: { q: number; r: number }, terrain: string) {
  if (state.map) {
    state.map.tiles.set(hexToKey(position), { position, terrain });
  }
}

const RIVER_PEOPLE = 'river_people' as FactionId; // nativeDomain = river_stealth
const HILL_CLAN = 'hill_clan' as FactionId; // nativeDomain = fortress (not river_stealth)

describe('submerge — doctrine flags', () => {
  it('sets submergeEnabled when river_stealth T3 is native', () => {
    const state = buildMvpScenario(42);
    addResearchNodes(state, RIVER_PEOPLE, [
      'river_stealth_t1', 'river_stealth_t2', 'river_stealth_t3',
    ]);
    const faction = state.factions.get(RIVER_PEOPLE)!;
    const research = state.research.get(RIVER_PEOPLE)!;
    const doctrine = resolveResearchDoctrine(research, faction);
    expect(doctrine.submergeEnabled).toBe(true);
  });

  it('disables submergeEnabled for non-native factions', () => {
    const state = buildMvpScenario(42);
    addResearchNodes(state, HILL_CLAN, [
      'river_stealth_t1', 'river_stealth_t2', 'river_stealth_t3',
    ]);
    const faction = state.factions.get(HILL_CLAN)!;
    const research = state.research.get(HILL_CLAN)!;
    const doctrine = resolveResearchDoctrine(research, faction);
    expect(doctrine.submergeEnabled).toBe(false);
  });

  it('disables submergeEnabled without T3', () => {
    const state = buildMvpScenario(42);
    addResearchNodes(state, RIVER_PEOPLE, ['river_stealth_t1', 'river_stealth_t2']);
    const faction = state.factions.get(RIVER_PEOPLE)!;
    const research = state.research.get(RIVER_PEOPLE)!;
    const doctrine = resolveResearchDoctrine(research, faction);
    expect(doctrine.submergeEnabled).toBe(false);
  });
});

describe('submerge — canSubmerge validation', () => {
  it('allows submerge on water hex with doctrine enabled', () => {
    let state = buildMvpScenario(42);
    state = clearUnits(state);
    addResearchNodes(state, RIVER_PEOPLE, [
      'river_stealth_t1', 'river_stealth_t2', 'river_stealth_t3',
    ]);
    setTerrain(state, { q: 0, r: 0 }, 'river');
    setTerrain(state, { q: 1, r: 0 }, 'river');
    const unitId = placeUnit(state, RIVER_PEOPLE, { q: 0, r: 0 });

    const result = canSubmerge(state, RIVER_PEOPLE, unitId);
    expect(result.canSubmerge).toBe(true);
  });

  it('rejects submerge on land terrain', () => {
    let state = buildMvpScenario(42);
    state = clearUnits(state);
    addResearchNodes(state, RIVER_PEOPLE, [
      'river_stealth_t1', 'river_stealth_t2', 'river_stealth_t3',
    ]);
    setTerrain(state, { q: 0, r: 0 }, 'plains');
    const unitId = placeUnit(state, RIVER_PEOPLE, { q: 0, r: 0 });

    const result = canSubmerge(state, RIVER_PEOPLE, unitId);
    expect(result.canSubmerge).toBe(false);
    expect(result.reason).toBe('not on water terrain');
  });

  it('rejects submerge when unit is spent', () => {
    let state = buildMvpScenario(42);
    state = clearUnits(state);
    addResearchNodes(state, RIVER_PEOPLE, [
      'river_stealth_t1', 'river_stealth_t2', 'river_stealth_t3',
    ]);
    setTerrain(state, { q: 0, r: 0 }, 'river');
    const unitId = placeUnit(state, RIVER_PEOPLE, { q: 0, r: 0 }, { status: 'spent' });

    const result = canSubmerge(state, RIVER_PEOPLE, unitId);
    expect(result.canSubmerge).toBe(false);
    expect(result.reason).toBe('unit not ready');
  });

  it('rejects submerge without doctrine', () => {
    let state = buildMvpScenario(42);
    state = clearUnits(state);
    addResearchNodes(state, RIVER_PEOPLE, ['river_stealth_t1']);
    setTerrain(state, { q: 0, r: 0 }, 'river');
    const unitId = placeUnit(state, RIVER_PEOPLE, { q: 0, r: 0 });

    const result = canSubmerge(state, RIVER_PEOPLE, unitId);
    expect(result.canSubmerge).toBe(false);
    expect(result.reason).toBe('doctrine not met');
  });
});

// Use negative coordinates (outside the 40x30 generated map) so only explicitly-set tiles exist.
const BX = -50; // base X offset to avoid map terrain interference
const BY = -50; // base Y offset

describe('submerge — connected waterway BFS', () => {
  it('returns connected water hexes along a river chain', () => {
    const state = buildMvpScenario(42);
    // Chain: river - river - river - plains(break) - river(isolated)
    setTerrain(state, { q: BX, r: BY }, 'river');
    setTerrain(state, { q: BX+1, r: BY }, 'river');
    setTerrain(state, { q: BX+2, r: BY }, 'river');
    setTerrain(state, { q: BX+3, r: BY }, 'plains'); // break
    setTerrain(state, { q: BX+4, r: BY }, 'river');  // isolated

    const waterway = getConnectedWaterway(state, { q: BX, r: BY });
    const keys = waterway.map(h => hexToKey(h));
    expect(keys).toContain(`${BX+1},${BY}`);
    expect(keys).toContain(`${BX+2},${BY}`);
    expect(keys).not.toContain(`${BX+4},${BY}`); // isolated by plains
    expect(keys).not.toContain(`${BX},${BY}`);    // origin excluded
  });

  it('excludes occupied hexes from destinations but maintains connectivity', () => {
    let state = buildMvpScenario(42);
    state = clearUnits(state);
    setTerrain(state, { q: BX, r: BY }, 'river');
    setTerrain(state, { q: BX+1, r: BY }, 'river');
    setTerrain(state, { q: BX+2, r: BY }, 'river');
    setTerrain(state, { q: BX+3, r: BY }, 'river');

    // Block hex (BX+2,BY) with a unit
    addResearchNodes(state, RIVER_PEOPLE, ['river_stealth_t1']);
    placeUnit(state, RIVER_PEOPLE, { q: BX+2, r: BY });

    const waterway = getConnectedWaterway(state, { q: BX, r: BY });
    const keys = waterway.map(h => hexToKey(h));

    // Hexes before and after the occupied one should be valid
    expect(keys).toContain(`${BX+1},${BY}`);
    expect(keys).toContain(`${BX+3},${BY}`);
    expect(keys).not.toContain(`${BX+2},${BY}`); // occupied
  });

  it('returns empty when origin has no adjacent water', () => {
    const state = buildMvpScenario(42);
    setTerrain(state, { q: BX, r: BY }, 'river');
    // No other tiles exist at these negative coords — BFS finds nothing

    const waterway = getConnectedWaterway(state, { q: BX, r: BY });
    expect(waterway).toHaveLength(0);
  });

  it('allows coast-to-coast through ocean', () => {
    const state = buildMvpScenario(42);
    setTerrain(state, { q: BX, r: BY }, 'coast');
    setTerrain(state, { q: BX+1, r: BY }, 'ocean');
    setTerrain(state, { q: BX+2, r: BY }, 'ocean');
    setTerrain(state, { q: BX+3, r: BY }, 'coast');

    const waterway = getConnectedWaterway(state, { q: BX, r: BY });
    const keys = waterway.map(h => hexToKey(h));
    expect(keys).toContain(`${BX+1},${BY}`);
    expect(keys).toContain(`${BX+2},${BY}`);
    expect(keys).toContain(`${BX+3},${BY}`);
  });

  it('respects maxRange parameter', () => {
    const state = buildMvpScenario(42);
    // Create a long chain of river tiles
    for (let i = 0; i <= 15; i++) {
      setTerrain(state, { q: BX+i, r: BY }, 'river');
    }

    const waterway = getConnectedWaterway(state, { q: BX, r: BY }, 3);
    const keys = waterway.map(h => hexToKey(h));
    // Should include hexes within 3 steps but not beyond
    expect(keys).toContain(`${BX+1},${BY}`);
    expect(keys).toContain(`${BX+3},${BY}`);
    expect(keys).not.toContain(`${BX+4},${BY}`);
  });
});

describe('submerge — execution', () => {
  it('teleports unit to destination and enters stealth', () => {
    let state = buildMvpScenario(42);
    state = clearUnits(state);
    addResearchNodes(state, RIVER_PEOPLE, [
      'river_stealth_t1', 'river_stealth_t2', 'river_stealth_t3',
    ]);
    setTerrain(state, { q: BX, r: BY }, 'river');
    setTerrain(state, { q: BX+1, r: BY }, 'river');
    setTerrain(state, { q: BX+2, r: BY }, 'river');
    const unitId = placeUnit(state, RIVER_PEOPLE, { q: BX, r: BY });

    const result = executeSubmerge(state, RIVER_PEOPLE, unitId, { q: BX+2, r: BY });
    expect(result.submerged).toBe(true);
    expect(result.destination).toEqual({ q: BX+2, r: BY });

    const unit = result.state.units.get(unitId)!;
    expect(unit.position).toEqual({ q: BX+2, r: BY });
    expect(unit.isStealthed).toBe(true);
    expect(unit.turnsSinceStealthBreak).toBe(0);
    expect(unit.movesRemaining).toBe(0);
    expect(unit.attacksRemaining).toBe(0);
    expect(unit.status).toBe('spent');
  });

  it('rejects destination not in connected waterway', () => {
    let state = buildMvpScenario(42);
    state = clearUnits(state);
    addResearchNodes(state, RIVER_PEOPLE, [
      'river_stealth_t1', 'river_stealth_t2', 'river_stealth_t3',
    ]);
    setTerrain(state, { q: BX, r: BY }, 'river');
    setTerrain(state, { q: BX+1, r: BY }, 'plains'); // break
    setTerrain(state, { q: BX+2, r: BY }, 'river');  // disconnected
    const unitId = placeUnit(state, RIVER_PEOPLE, { q: BX, r: BY });

    const result = executeSubmerge(state, RIVER_PEOPLE, unitId, { q: BX+2, r: BY });
    expect(result.submerged).toBe(false);
    expect(result.reason).toContain('destination not in connected waterway');
  });

  it('rejects occupied destination', () => {
    let state = buildMvpScenario(42);
    state = clearUnits(state);
    addResearchNodes(state, RIVER_PEOPLE, [
      'river_stealth_t1', 'river_stealth_t2', 'river_stealth_t3',
    ]);
    setTerrain(state, { q: BX, r: BY }, 'river');
    setTerrain(state, { q: BX+1, r: BY }, 'river');
    const unitId = placeUnit(state, RIVER_PEOPLE, { q: BX, r: BY });
    // Block destination
    addResearchNodes(state, HILL_CLAN, ['fortress_t1']);
    placeUnit(state, HILL_CLAN, { q: BX+1, r: BY });

    const result = executeSubmerge(state, RIVER_PEOPLE, unitId, { q: BX+1, r: BY });
    expect(result.submerged).toBe(false);
  });
});
