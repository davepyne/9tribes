import { describe, it, expect } from 'vitest';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { declareMaelstrom } from '../src/systems/maelstromSystem';
import { tickZoneEffectLifetimes, addZoneEffect, getZoneEffectMovementPenalty, getZoneEffectsAtHex, getZoneEffectDamageOnHex } from '../src/systems/zoneEffectSystem';
import { applyEnvironmentalDamage } from '../src/systems/simulation/environmentalEffects';
import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { createResearchState } from '../src/systems/researchSystem';
import { resolveResearchDoctrine } from '../src/systems/capabilityDoctrine';
import { previewMove } from '../src/systems/movementSystem';
import type { GameState, Unit, ZoneEffect } from '../src/game/types';
import type { FactionId, UnitId } from '../src/types';
import { hexToKey } from '../src/core/grid';
import { createUnitId, createZoneEffectId } from '../src/core/ids';

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

const PIRATE = 'coral_people' as FactionId; // nativeDomain = tidal_warfare

describe('maelstrom — doctrine flags', () => {
  it('sets canDeclareMaelstrom when tidal_warfare_t3 is completed', () => {
    const state = buildMvpScenario(42);
    addResearchNodes(state, PIRATE, ['tidal_warfare_t1', 'tidal_warfare_t2', 'tidal_warfare_t3']);
    const faction = state.factions.get(PIRATE)!;
    const research = state.research.get(PIRATE)!;
    const doctrine = resolveResearchDoctrine(research, faction);
    expect(doctrine.canDeclareMaelstrom).toBe(true);
  });

  it('sets native radius=5 and duration=5 for Pirate Lords (dual native domain)', () => {
    const state = buildMvpScenario(42);
    addResearchNodes(state, PIRATE, ['tidal_warfare_t1', 'tidal_warfare_t2', 'tidal_warfare_t3']);
    const faction = state.factions.get(PIRATE)!;
    const research = state.research.get(PIRATE)!;
    const doctrine = resolveResearchDoctrine(research, faction);
    // Pirate Lords have nativeDomains: ['slaving', 'tidal_warfare'],
    // so tidal_warfare T3 is native for them.
    expect(doctrine.maelstromRadius).toBe(5);
    expect(doctrine.maelstromDuration).toBe(5);
    expect(doctrine.maelstromAutoCaptureEnabled).toBe(true);
  });

  it('sets foreign radius=3, duration=3, no auto-capture', () => {
    const state = buildMvpScenario(42);
    // Use a non-native faction with tidal_warfare learned
    const hillFaction = state.factions.get('hill_clan' as FactionId)!;
    addResearchNodes(state, 'hill_clan', ['tidal_warfare_t1', 'tidal_warfare_t2', 'tidal_warfare_t3']);
    const research = state.research.get('hill_clan')!;
    const doctrine = resolveResearchDoctrine(research, hillFaction);
    expect(doctrine.canDeclareMaelstrom).toBe(true);
    expect(doctrine.maelstromRadius).toBe(3);
    expect(doctrine.maelstromDuration).toBe(3);
    expect(doctrine.maelstromAutoCaptureEnabled).toBe(false);
  });

  it('disables canDeclareMaelstrom when already declared', () => {
    const state = buildMvpScenario(42);
    addResearchNodes(state, PIRATE, ['tidal_warfare_t1', 'tidal_warfare_t2', 'tidal_warfare_t3']);
    const faction = state.factions.get(PIRATE)!;
    faction.maelstromsDeclared = 1;
    const research = state.research.get(PIRATE)!;
    const doctrine = resolveResearchDoctrine(research, faction);
    expect(doctrine.canDeclareMaelstrom).toBe(false);
  });
});

describe('maelstrom — declaration', () => {
  it('creates a Maelstrom zone effect on a water hex', () => {
    const state = buildMvpScenario(42);
    addResearchNodes(state, PIRATE, ['tidal_warfare_t1', 'tidal_warfare_t2', 'tidal_warfare_t3']);
    setTerrain(state, { q: 0, r: 0 }, 'coast');

    const result = declareMaelstrom(state, PIRATE, { q: 0, r: 0 });
    expect(result.declared).toBe(true);

    const effects = [...result.state.zoneEffects.values()].filter((e) => e.type === 'maelstrom');
    expect(effects).toHaveLength(1);
    const m = effects[0];
    expect(m.radius).toBe(5); // native (Pirate Lords have dual native domain)
    expect(m.damagePerTurn).toBe(2);
    expect(m.movementPenalty).toBe(1);
    expect(m.turnsRemaining).toBe(5); // native
    expect(m.ownerFactionId).toBe(PIRATE);

    const faction = result.state.factions.get(PIRATE)!;
    expect(faction.maelstromsDeclared).toBe(1);
  });

  it('rejects declaration on non-water terrain', () => {
    const state = buildMvpScenario(42);
    addResearchNodes(state, PIRATE, ['tidal_warfare_t1', 'tidal_warfare_t2', 'tidal_warfare_t3']);
    setTerrain(state, { q: 0, r: 0 }, 'plains');

    const result = declareMaelstrom(state, PIRATE, { q: 0, r: 0 });
    expect(result.declared).toBe(false);
    expect(result.reason).toBe('center hex must be water terrain');
  });

  it('rejects second declaration (once per game)', () => {
    let state = buildMvpScenario(42);
    addResearchNodes(state, PIRATE, ['tidal_warfare_t1', 'tidal_warfare_t2', 'tidal_warfare_t3']);
    setTerrain(state, { q: 0, r: 0 }, 'coast');

    const first = declareMaelstrom(state, PIRATE, { q: 0, r: 0 });
    expect(first.declared).toBe(true);

    setTerrain(first.state, { q: 1, r: 0 }, 'river');
    const second = declareMaelstrom(first.state, PIRATE, { q: 1, r: 0 });
    expect(second.declared).toBe(false);
    expect(second.reason).toBe('doctrine not met or already declared');
  });

  it('rejects declaration without T3 research', () => {
    const state = buildMvpScenario(42);
    addResearchNodes(state, PIRATE, ['tidal_warfare_t1']); // only T1
    setTerrain(state, { q: 0, r: 0 }, 'coast');

    const result = declareMaelstrom(state, PIRATE, { q: 0, r: 0 });
    expect(result.declared).toBe(false);
    expect(result.reason).toBe('doctrine not met or already declared');
  });
});

describe('maelstrom — damage and movement', () => {
  it('deals 2 damage/turn to enemy units via environmental effects', () => {
    let state = buildMvpScenario(42);
    state = clearUnits(state);
    addResearchNodes(state, PIRATE, ['tidal_warfare_t1', 'tidal_warfare_t2', 'tidal_warfare_t3']);

    // Place Maelstrom manually (no water-terrain gate in this test)
    const effect: ZoneEffect = {
      id: createZoneEffectId(),
      type: 'maelstrom',
      center: { q: 0, r: 0 },
      radius: 3,
      ownerFactionId: PIRATE,
      damagePerTurn: 2,
      movementPenalty: 1,
      turnsRemaining: 3,
      createdRound: 1,
    };
    state = addZoneEffect(state, effect);

    // Place enemy unit inside the zone
    setTerrain(state, { q: 1, r: 0 }, 'plains');
    const enemyId = placeUnit(state, 'hill_clan' as FactionId, { q: 1, r: 0 });
    const enemyBefore = state.units.get(enemyId)!;
    expect(enemyBefore.hp).toBe(10);

    // Apply environmental damage
    state = applyEnvironmentalDamage(state, 'hill_clan' as FactionId, registry);

    const enemyAfter = state.units.get(enemyId)!;
    expect(enemyAfter.hp).toBe(8); // 10 - 2 = 8
  });

  it('does NOT damage owner-faction units', () => {
    let state = buildMvpScenario(42);
    state = clearUnits(state);

    const effect: ZoneEffect = {
      id: createZoneEffectId(),
      type: 'maelstrom',
      center: { q: 0, r: 0 },
      radius: 3,
      ownerFactionId: PIRATE,
      damagePerTurn: 2,
      movementPenalty: 1,
      turnsRemaining: 3,
      createdRound: 1,
    };
    state = addZoneEffect(state, effect);

    setTerrain(state, { q: 1, r: 0 }, 'plains');
    const friendlyId = placeUnit(state, PIRATE, { q: 1, r: 0 });

    state = applyEnvironmentalDamage(state, PIRATE, registry);

    const friendly = state.units.get(friendlyId)!;
    expect(friendly.hp).toBe(10); // no damage
  });

  it('imposes movement penalty on non-owner units', () => {
    let state = buildMvpScenario(42);
    state = clearUnits(state);

    const effect: ZoneEffect = {
      id: createZoneEffectId(),
      type: 'maelstrom',
      center: { q: 0, r: 0 },
      radius: 3,
      ownerFactionId: PIRATE,
      damagePerTurn: 2,
      movementPenalty: 1,
      turnsRemaining: 3,
      createdRound: 1,
    };
    state = addZoneEffect(state, effect);

    // Place enemy unit adjacent to the zone, moving into it
    setTerrain(state, { q: 4, r: 0 }, 'plains'); // outside
    setTerrain(state, { q: 2, r: 0 }, 'plains'); // inside (distance 2 from center)
    const enemyId = placeUnit(state, 'hill_clan' as FactionId, { q: 4, r: 0 });

    const penalty = getZoneEffectMovementPenalty(state, { q: 2, r: 0 }, 'hill_clan' as FactionId);
    expect(penalty).toBe(1);

    // No penalty for owner faction
    const noPenalty = getZoneEffectMovementPenalty(state, { q: 2, r: 0 }, PIRATE);
    expect(noPenalty).toBe(0);
  });
});

describe('maelstrom — lifetime', () => {
  it('expires after N turns via tickZoneEffectLifetimes', () => {
    let state = buildMvpScenario(42);

    const effect: ZoneEffect = {
      id: createZoneEffectId(),
      type: 'maelstrom',
      center: { q: 0, r: 0 },
      radius: 3,
      ownerFactionId: PIRATE,
      damagePerTurn: 2,
      movementPenalty: 1,
      turnsRemaining: 3,
      createdRound: 1,
    };
    state = addZoneEffect(state, effect);

    // Tick 3 times
    state = tickZoneEffectLifetimes(state);
    expect([...state.zoneEffects.values()].filter((e) => e.type === 'maelstrom')).toHaveLength(1);
    state = tickZoneEffectLifetimes(state);
    expect([...state.zoneEffects.values()].filter((e) => e.type === 'maelstrom')).toHaveLength(1);
    state = tickZoneEffectLifetimes(state);
    // After 3 ticks, the effect should be expired and removed
    expect([...state.zoneEffects.values()].filter((e) => e.type === 'maelstrom')).toHaveLength(0);
  });
});

describe('maelstrom — AI heuristic', () => {
  it('scores opportunity when enemies are in radius', async () => {
    const { getMaelstromOpportunity } = await import('../src/systems/unit-activation/maelstrom');
    let state = buildMvpScenario(42);
    state = clearUnits(state);
    addResearchNodes(state, PIRATE, ['tidal_warfare_t1', 'tidal_warfare_t2', 'tidal_warfare_t3']);
    setTerrain(state, { q: 0, r: 0 }, 'coast');

    // Place Pirate unit on coast
    const pirateUnitId = placeUnit(state, PIRATE, { q: 0, r: 0 });

    // Place 4 enemy units within radius 3 (distance <= 3 from center)
    for (const pos of [{ q: 1, r: 0 }, { q: 2, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 }]) {
      setTerrain(state, pos, 'plains');
      placeUnit(state, 'hill_clan' as FactionId, pos);
    }

    const opportunity = getMaelstromOpportunity(state, PIRATE, pirateUnitId, registry);
    expect(opportunity).not.toBeNull();
    expect(opportunity!.score).toBeGreaterThan(0);
    expect(opportunity!.reason).toContain('enemies=4');
  });

  it('returns null when no enemies are nearby', async () => {
    const { getMaelstromOpportunity } = await import('../src/systems/unit-activation/maelstrom');
    let state = buildMvpScenario(42);
    state = clearUnits(state);
    addResearchNodes(state, PIRATE, ['tidal_warfare_t1', 'tidal_warfare_t2', 'tidal_warfare_t3']);
    setTerrain(state, { q: 0, r: 0 }, 'coast');

    const pirateUnitId = placeUnit(state, PIRATE, { q: 0, r: 0 });
    const opportunity = getMaelstromOpportunity(state, PIRATE, pirateUnitId, registry);
    expect(opportunity).toBeNull();
  });
});
