import { describe, it, expect } from 'vitest';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { declareOasis } from '../src/systems/oasisSystem';
import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { createResearchState } from '../src/systems/researchSystem';
import { resolveResearchDoctrine } from '../src/systems/capabilityDoctrine';
import { getOasisOpportunity } from '../src/systems/unit-activation/oasis';
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

function getTerrain(state: GameState, position: { q: number; r: number }): string | undefined {
  return state.map?.tiles.get(hexToKey(position))?.terrain;
}

const DESERT_NOMADS = 'desert_nomads' as FactionId; // nativeDomain = camel_adaptation
const HILL_CLAN = 'hill_clan' as FactionId; // nativeDomain = fortress (not camel)

describe('oasis — doctrine flags', () => {
  it('sets canDeclareOasis when camel_adaptation_t3 is native', () => {
    const state = buildMvpScenario(42);
    addResearchNodes(state, DESERT_NOMADS, [
      'camel_adaptation_t1', 'camel_adaptation_t2', 'camel_adaptation_t3',
    ]);
    const faction = state.factions.get(DESERT_NOMADS)!;
    const research = state.research.get(DESERT_NOMADS)!;
    const doctrine = resolveResearchDoctrine(research, faction);
    expect(doctrine.canDeclareOasis).toBe(true);
  });

  it('disables canDeclareOasis for non-native factions', () => {
    const state = buildMvpScenario(42);
    addResearchNodes(state, HILL_CLAN, [
      'camel_adaptation_t1', 'camel_adaptation_t2', 'camel_adaptation_t3',
    ]);
    const faction = state.factions.get(HILL_CLAN)!;
    const research = state.research.get(HILL_CLAN)!;
    const doctrine = resolveResearchDoctrine(research, faction);
    expect(doctrine.canDeclareOasis).toBe(false);
  });

  it('disables canDeclareOasis when already declared', () => {
    const state = buildMvpScenario(42);
    addResearchNodes(state, DESERT_NOMADS, [
      'camel_adaptation_t1', 'camel_adaptation_t2', 'camel_adaptation_t3',
    ]);
    const faction = state.factions.get(DESERT_NOMADS)!;
    faction.oasisDeclared = 1;
    const research = state.research.get(DESERT_NOMADS)!;
    const doctrine = resolveResearchDoctrine(research, faction);
    expect(doctrine.canDeclareOasis).toBe(false);
  });

  it('cache invalidates after oasisDeclared changes', () => {
    const state = buildMvpScenario(42);
    addResearchNodes(state, DESERT_NOMADS, [
      'camel_adaptation_t1', 'camel_adaptation_t2', 'camel_adaptation_t3',
    ]);
    const faction = state.factions.get(DESERT_NOMADS)!;
    const research = state.research.get(DESERT_NOMADS)!;

    const before = resolveResearchDoctrine(research, faction);
    expect(before.canDeclareOasis).toBe(true);

    faction.oasisDeclared = 1;
    const after = resolveResearchDoctrine(research, faction);
    expect(after.canDeclareOasis).toBe(false);
  });
});

describe('oasis — declaration', () => {
  it('converts a 2-hex radius to desert on a land hex', () => {
    const state = buildMvpScenario(42);
    addResearchNodes(state, DESERT_NOMADS, [
      'camel_adaptation_t1', 'camel_adaptation_t2', 'camel_adaptation_t3',
    ]);

    // Set center and surrounding hexes to plains
    setTerrain(state, { q: 0, r: 0 }, 'plains');
    setTerrain(state, { q: 1, r: 0 }, 'plains');
    setTerrain(state, { q: 0, r: 1 }, 'plains');
    setTerrain(state, { q: 2, r: 0 }, 'plains');

    const result = declareOasis(state, DESERT_NOMADS, { q: 0, r: 0 });
    expect(result.declared).toBe(true);

    expect(getTerrain(result.state, { q: 0, r: 0 })).toBe('desert');
    expect(getTerrain(result.state, { q: 1, r: 0 })).toBe('desert');
    expect(getTerrain(result.state, { q: 0, r: 1 })).toBe('desert');

    const faction = result.state.factions.get(DESERT_NOMADS)!;
    expect(faction.oasisDeclared).toBe(1);
  });

  it('rejects declaration on water terrain', () => {
    const state = buildMvpScenario(42);
    addResearchNodes(state, DESERT_NOMADS, [
      'camel_adaptation_t1', 'camel_adaptation_t2', 'camel_adaptation_t3',
    ]);
    setTerrain(state, { q: 0, r: 0 }, 'ocean');

    const result = declareOasis(state, DESERT_NOMADS, { q: 0, r: 0 });
    expect(result.declared).toBe(false);
    expect(result.reason).toBe('center hex must be land terrain');
  });

  it('rejects second declaration (once per game)', () => {
    let state = buildMvpScenario(42);
    addResearchNodes(state, DESERT_NOMADS, [
      'camel_adaptation_t1', 'camel_adaptation_t2', 'camel_adaptation_t3',
    ]);
    setTerrain(state, { q: 0, r: 0 }, 'plains');

    const first = declareOasis(state, DESERT_NOMADS, { q: 0, r: 0 });
    expect(first.declared).toBe(true);

    setTerrain(first.state, { q: 5, r: 0 }, 'plains');
    const second = declareOasis(first.state, DESERT_NOMADS, { q: 5, r: 0 });
    expect(second.declared).toBe(false);
    expect(second.reason).toBe('doctrine not met or already declared');
  });

  it('rejects declaration without T3 research', () => {
    const state = buildMvpScenario(42);
    addResearchNodes(state, DESERT_NOMADS, ['camel_adaptation_t1']);
    setTerrain(state, { q: 0, r: 0 }, 'plains');

    const result = declareOasis(state, DESERT_NOMADS, { q: 0, r: 0 });
    expect(result.declared).toBe(false);
    expect(result.reason).toBe('doctrine not met or already declared');
  });

  it('rejects declaration by wrong faction', () => {
    const state = buildMvpScenario(42);
    addResearchNodes(state, HILL_CLAN, [
      'camel_adaptation_t1', 'camel_adaptation_t2', 'camel_adaptation_t3',
    ]);
    setTerrain(state, { q: 0, r: 0 }, 'plains');

    const result = declareOasis(state, HILL_CLAN, { q: 0, r: 0 });
    expect(result.declared).toBe(false);
    expect(result.reason).toBe('doctrine not met or already declared');
  });

  it('is a no-op when all hexes in radius are already desert', () => {
    const state = buildMvpScenario(42);
    addResearchNodes(state, DESERT_NOMADS, [
      'camel_adaptation_t1', 'camel_adaptation_t2', 'camel_adaptation_t3',
    ]);
    setTerrain(state, { q: 0, r: 0 }, 'desert');
    setTerrain(state, { q: 1, r: 0 }, 'desert');
    setTerrain(state, { q: 0, r: 1 }, 'desert');

    const result = declareOasis(state, DESERT_NOMADS, { q: 0, r: 0 });
    // setTerrainInRadius returns original state when nothing changes,
    // but declareOasis still increments the counter.
    expect(result.declared).toBe(true);
    const faction = result.state.factions.get(DESERT_NOMADS)!;
    expect(faction.oasisDeclared).toBe(1);
  });
});

describe('oasis — AI heuristic', () => {
  it('scores opportunity when friendly units are in radius', () => {
    let state = buildMvpScenario(42);
    state = clearUnits(state);
    addResearchNodes(state, DESERT_NOMADS, [
      'camel_adaptation_t1', 'camel_adaptation_t2', 'camel_adaptation_t3',
    ]);
    setTerrain(state, { q: 0, r: 0 }, 'plains');

    const nomadUnitId = placeUnit(state, DESERT_NOMADS, { q: 0, r: 0 });

    // Place 3 friendly units within radius 2
    for (const pos of [{ q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 }]) {
      setTerrain(state, pos, 'plains');
      placeUnit(state, DESERT_NOMADS, pos);
    }

    const opportunity = getOasisOpportunity(state, DESERT_NOMADS, nomadUnitId, registry);
    expect(opportunity).not.toBeNull();
    expect(opportunity!.score).toBeGreaterThan(0);
    expect(opportunity!.reason).toContain('friendlies=3');
  });

  it('returns null when too few friendly units are nearby', () => {
    let state = buildMvpScenario(42);
    state = clearUnits(state);
    addResearchNodes(state, DESERT_NOMADS, [
      'camel_adaptation_t1', 'camel_adaptation_t2', 'camel_adaptation_t3',
    ]);
    setTerrain(state, { q: 0, r: 0 }, 'plains');

    const nomadUnitId = placeUnit(state, DESERT_NOMADS, { q: 0, r: 0 });
    // Only 1 friendly in radius (threshold is 2+)
    setTerrain(state, { q: 1, r: 0 }, 'plains');
    placeUnit(state, DESERT_NOMADS, { q: 1, r: 0 });

    const opportunity = getOasisOpportunity(state, DESERT_NOMADS, nomadUnitId, registry);
    expect(opportunity).toBeNull();
  });

  it('returns null on water terrain', () => {
    let state = buildMvpScenario(42);
    state = clearUnits(state);
    addResearchNodes(state, DESERT_NOMADS, [
      'camel_adaptation_t1', 'camel_adaptation_t2', 'camel_adaptation_t3',
    ]);
    setTerrain(state, { q: 0, r: 0 }, 'coast');

    const nomadUnitId = placeUnit(state, DESERT_NOMADS, { q: 0, r: 0 });
    for (const pos of [{ q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 }]) {
      setTerrain(state, pos, 'plains');
      placeUnit(state, DESERT_NOMADS, pos);
    }

    const opportunity = getOasisOpportunity(state, DESERT_NOMADS, nomadUnitId, registry);
    expect(opportunity).toBeNull();
  });
});
