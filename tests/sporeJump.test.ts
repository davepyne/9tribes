// Tests for venom T2 spore-jump mechanic
import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { previewCombatAction } from '../src/systems/combat-action/preview';
import { applyCombatAction } from '../src/systems/combat-action/apply';
import { resolveResearchDoctrine } from '../src/systems/capabilityDoctrine';
import { createRNG } from '../src/core/rng';
import { hexDistance, hexToKey } from '../src/core/grid';
import { createUnitId } from '../src/core/ids';
import type { GameState, Unit, HexCoord, FactionId } from '../src/game/types';

const registry = loadRulesRegistry();

function getCombatants(state: GameState) {
  const factionIds = Array.from(state.factions.keys()) as FactionId[];
  const attackerFactionId = factionIds[0];
  const defenderFactionId = factionIds[1];
  const attFaction = state.factions.get(attackerFactionId)!;
  const defFaction = state.factions.get(defenderFactionId)!;
  const attacker = state.units.get(attFaction.unitIds[0])!;
  const defender = state.units.get(defFaction.unitIds[0])!;
  return { attacker, defender, attackerFactionId, defenderFactionId, attFaction, defFaction };
}

function placeAdjacent(state: GameState, attacker: Unit, defender: Unit): GameState {
  const adjacentPos: HexCoord = { q: attacker.position.q + 1, r: attacker.position.r };
  const units = new Map(state.units);
  units.set(defender.id, { ...defender, position: adjacentPos });
  return { ...state, units };
}

function addExtraUnit(
  state: GameState,
  position: HexCoord,
  factionId: FactionId,
  template: Unit,
): { state: GameState; unitId: Unit['id'] } {
  const uid = createUnitId(`spore-test-${Math.random().toString(36).slice(2, 8)}`);
  const extra: Unit = {
    ...template,
    id: uid,
    hp: 50,
    maxHp: 100,
    factionId,
    position,
    history: [],
    morale: 100,
    veteranLevel: 'green' as never,
    learnedAbilities: [],
  };
  const units = new Map(state.units);
  units.set(uid, extra);
  return { state: { ...state, units }, unitId: uid };
}

function setResearch(
  state: GameState,
  factionId: FactionId,
  completedNodes: string[],
  nativeDomains: string[],
): GameState {
  const factions = new Map(state.factions);
  const f = factions.get(factionId)!;
  factions.set(factionId, {
    ...f,
    nativeDomain: nativeDomains[0],
    nativeDomains,
    learnedDomains: nativeDomains,
    researchState: {
      completedNodes: completedNodes as never[],
      activeNodeId: undefined,
    },
  });

  // Also update state.research — combat pipeline reads doctrine from here
  const research = new Map(state.research);
  research.set(factionId, {
    completedNodes: completedNodes as never[],
    activeNodeId: undefined,
  });

  return { ...state, factions, research };
}

// ---------------------------------------------------------------------------
// Doctrine resolution
// ---------------------------------------------------------------------------
describe('spore-jump doctrine flags', () => {
  it('venom_t2 enables sporeJumpEnabled', () => {
    const doctrine = resolveResearchDoctrine(
      { completedNodes: ['venom_t1', 'venom_t2'] as never[], activeNodeId: undefined },
      { nativeDomain: 'charge', nativeDomains: ['charge'], learnedDomains: ['charge'], id: 'test' as never, bastionsBuilt: 0, maelstromsDeclared: 0, slaveCaptureCount: 0 },
    );
    expect(doctrine.sporeJumpEnabled).toBe(true);
    expect(doctrine.sporeJumpAllEnemies).toBe(false);
  });

  it('venom_t2 native enables sporeJumpAllEnemies', () => {
    const doctrine = resolveResearchDoctrine(
      { completedNodes: ['venom_t1', 'venom_t2'] as never[], activeNodeId: undefined },
      { nativeDomain: 'venom', nativeDomains: ['venom'], learnedDomains: ['venom'], id: 'test' as never, bastionsBuilt: 0, maelstromsDeclared: 0, slaveCaptureCount: 0 },
    );
    expect(doctrine.sporeJumpEnabled).toBe(true);
    expect(doctrine.sporeJumpAllEnemies).toBe(true);
  });

  it('no venom_t2 — sporeJumpEnabled is false', () => {
    const doctrine = resolveResearchDoctrine(
      { completedNodes: [] as never[], activeNodeId: undefined },
      { nativeDomain: 'venom', nativeDomains: ['venom'], learnedDomains: ['venom'], id: 'test' as never, bastionsBuilt: 0, maelstromsDeclared: 0, slaveCaptureCount: 0 },
    );
    expect(doctrine.sporeJumpEnabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Combat integration — foreign spore-jump (nearest enemy)
// ---------------------------------------------------------------------------
describe('foreign spore-jump (nearest enemy within 2 hexes)', () => {
  it('jumps 1 poison stack to the nearest enemy when a poisoned defender dies', () => {
    let state = buildMvpScenario(42);
    const { attacker, defender, attackerFactionId, defenderFactionId } = getCombatants(state);

    // Place defender adjacent to attacker
    state = placeAdjacent(state, attacker, defender);
    const defenderPos = { q: attacker.position.q + 1, r: attacker.position.r };

    // Set defender to 1 HP and poisoned
    const units = new Map(state.units);
    units.set(defender.id, {
      ...units.get(defender.id)!,
      hp: 1,
      maxHp: 100,
      poisonStacks: 1,
      poisonTurnsRemaining: 3,
      poisoned: true,
      poisonedBy: attackerFactionId,
    });
    state = { ...state, units };

    // Add two enemy units near the defender: distance 1 and distance 2
    const nearPos: HexCoord = { q: defenderPos.q + 1, r: defenderPos.r }; // dist 1 from defender
    const farPos: HexCoord = { q: defenderPos.q + 1, r: defenderPos.r - 1 }; // dist ~1.5, closer to 1

    // Verify positions are on the map
    if (!state.map.tiles.has(hexToKey(nearPos)) || !state.map.tiles.has(hexToKey(farPos))) {
      // Skip if hexes don't exist — use only nearby guaranteed hexes
      return;
    }

    let res1 = addExtraUnit(state, nearPos, defenderFactionId, attacker);
    state = res1.state;
    const nearId = res1.unitId;

    let res2 = addExtraUnit(state, farPos, defenderFactionId, attacker);
    state = res2.state;

    // Enable venom T2 as foreign (attacker native domain = charge, not venom)
    state = setResearch(state, attackerFactionId, ['venom_t1', 'venom_t2'], ['charge']);
    state = { ...state, activeFactionId: attackerFactionId, rngState: createRNG(42) };

    const preview = previewCombatAction(state, registry, attacker.id, defender.id);
    expect(preview).not.toBeNull();
    expect(preview!.result.defenderDestroyed).toBe(true);

    const result = applyCombatAction(state, registry, preview!);

    // The nearest enemy (nearPos) should have gained poison
    const nearEnemy = result.state.units.get(nearId);
    expect(nearEnemy!.poisonStacks).toBeGreaterThanOrEqual(1);
  });

  it('does not trigger when defender is not poisoned', () => {
    let state = buildMvpScenario(42);
    const { attacker, defender, attackerFactionId, defenderFactionId } = getCombatants(state);

    state = placeAdjacent(state, attacker, defender);
    const defenderPos = { q: attacker.position.q + 1, r: attacker.position.r };

    // Defender at 1 HP but NOT poisoned
    const units = new Map(state.units);
    units.set(defender.id, {
      ...units.get(defender.id)!,
      hp: 1,
      maxHp: 100,
      poisonStacks: 0,
    });
    state = { ...state, units };

    // Add one enemy nearby
    const nearPos: HexCoord = { q: defenderPos.q + 1, r: defenderPos.r };
    if (!state.map.tiles.has(hexToKey(nearPos))) return;

    let res = addExtraUnit(state, nearPos, defenderFactionId, attacker);
    state = res.state;
    const nearId = res.unitId;

    state = setResearch(state, attackerFactionId, ['venom_t1', 'venom_t2'], ['charge']);
    state = { ...state, activeFactionId: attackerFactionId, rngState: createRNG(42) };

    const preview = previewCombatAction(state, registry, attacker.id, defender.id);
    expect(preview).not.toBeNull();

    const result = applyCombatAction(state, registry, preview!);
    const nearEnemy = result.state.units.get(nearId);
    expect(nearEnemy!.poisonStacks).toBe(0);
  });

  it('does not crash when no enemies are in range', () => {
    let state = buildMvpScenario(42);
    const { attacker, defender, attackerFactionId } = getCombatants(state);

    state = placeAdjacent(state, attacker, defender);

    // Defender at 1 HP and poisoned, but no extra enemies nearby
    const units = new Map(state.units);
    units.set(defender.id, {
      ...units.get(defender.id)!,
      hp: 1,
      maxHp: 100,
      poisonStacks: 1,
      poisonTurnsRemaining: 3,
      poisoned: true,
      poisonedBy: attackerFactionId,
    });
    state = { ...state, units };

    state = setResearch(state, attackerFactionId, ['venom_t1', 'venom_t2'], ['charge']);
    state = { ...state, activeFactionId: attackerFactionId, rngState: createRNG(42) };

    const preview = previewCombatAction(state, registry, attacker.id, defender.id);
    expect(preview).not.toBeNull();

    const result = applyCombatAction(state, registry, preview!);
    expect(result.state).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Combat integration — native spore-jump (all enemies within 2 hexes)
// ---------------------------------------------------------------------------
describe('native spore-jump (all enemies within 2 hexes)', () => {
  it('jumps poison to ALL enemies within 2 hexes', () => {
    let state = buildMvpScenario(42);
    const { attacker, defender, attackerFactionId, defenderFactionId } = getCombatants(state);

    state = placeAdjacent(state, attacker, defender);
    const defenderPos = { q: attacker.position.q + 1, r: attacker.position.r };

    // Defender at 1 HP and poisoned
    const units = new Map(state.units);
    units.set(defender.id, {
      ...units.get(defender.id)!,
      hp: 1,
      maxHp: 100,
      poisonStacks: 1,
      poisonTurnsRemaining: 3,
      poisoned: true,
      poisonedBy: attackerFactionId,
    });
    state = { ...state, units };

    // Add two enemy units within 2 hexes of the defender
    const pos1: HexCoord = { q: defenderPos.q + 1, r: defenderPos.r };
    const pos2: HexCoord = { q: defenderPos.q - 1, r: defenderPos.r + 1 };

    if (!state.map.tiles.has(hexToKey(pos1)) || !state.map.tiles.has(hexToKey(pos2))) return;

    let res1 = addExtraUnit(state, pos1, defenderFactionId, attacker);
    state = res1.state;
    const enemy1Id = res1.unitId;

    let res2 = addExtraUnit(state, pos2, defenderFactionId, attacker);
    state = res2.state;
    const enemy2Id = res2.unitId;

    // Enable venom T2 as NATIVE (attacker native domain = venom)
    state = setResearch(state, attackerFactionId, ['venom_t1', 'venom_t2'], ['venom']);
    state = { ...state, activeFactionId: attackerFactionId, rngState: createRNG(42) };

    const preview = previewCombatAction(state, registry, attacker.id, defender.id);
    expect(preview).not.toBeNull();
    expect(preview!.result.defenderDestroyed).toBe(true);

    const result = applyCombatAction(state, registry, preview!);

    // Both extra enemies should have poison
    const enemy1 = result.state.units.get(enemy1Id);
    const enemy2 = result.state.units.get(enemy2Id);
    expect(enemy1!.poisonStacks).toBeGreaterThanOrEqual(1);
    expect(enemy2!.poisonStacks).toBeGreaterThanOrEqual(1);
  });

  it('does not jump to friendly units', () => {
    let state = buildMvpScenario(42);
    const { attacker, defender, attackerFactionId, defenderFactionId } = getCombatants(state);

    state = placeAdjacent(state, attacker, defender);
    const defenderPos = { q: attacker.position.q + 1, r: attacker.position.r };

    // Defender at 1 HP and poisoned
    const units = new Map(state.units);
    units.set(defender.id, {
      ...units.get(defender.id)!,
      hp: 1,
      maxHp: 100,
      poisonStacks: 1,
      poisonTurnsRemaining: 3,
      poisoned: true,
      poisonedBy: attackerFactionId,
    });
    state = { ...state, units };

    // Add one friendly unit near the defender
    const friendlyPos: HexCoord = { q: defenderPos.q + 1, r: defenderPos.r };
    if (!state.map.tiles.has(hexToKey(friendlyPos))) return;

    let res = addExtraUnit(state, friendlyPos, attackerFactionId, attacker);
    state = res.state;
    const friendlyId = res.unitId;

    // Enable venom T2 as NATIVE
    state = setResearch(state, attackerFactionId, ['venom_t1', 'venom_t2'], ['venom']);
    state = { ...state, activeFactionId: attackerFactionId, rngState: createRNG(42) };

    const preview = previewCombatAction(state, registry, attacker.id, defender.id);
    expect(preview).not.toBeNull();

    const result = applyCombatAction(state, registry, preview!);

    // Friendly unit should NOT have gained poison
    const friendlyUnit = result.state.units.get(friendlyId);
    expect(friendlyUnit!.poisonStacks).toBe(0);
  });
});
