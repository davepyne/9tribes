// Tests for hitrun T2 bloodtrail momentum mechanic
import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { previewCombatAction } from '../src/systems/combat-action/preview';
import { applyCombatAction } from '../src/systems/combat-action/apply';
import { resolveResearchDoctrine } from '../src/systems/capabilityDoctrine';
import { processFactionPhases } from '../src/systems/simulation/factionTurnEffects';
import { createRNG } from '../src/core/rng';
import type { FactionId } from '../src/game/types';
import type { ResearchNodeId } from '../src/types';
import { getCombatants, placeAdjacent, setResearch } from './helpers/combatSetup.js';

const registry = loadRulesRegistry();

// ---------------------------------------------------------------------------
// Doctrine resolution
// ---------------------------------------------------------------------------
describe('bloodtrail momentum doctrine flag', () => {
  it('hitrun_t2 enables bloodtrailMomentumEnabled', () => {
    const doctrine = resolveResearchDoctrine(
      { completedNodes: ['hitrun_t1', 'hitrun_t2'] as ResearchNodeId[], activeNodeId: undefined },
      { nativeDomain: 'hitrun', nativeDomains: ['hitrun'], learnedDomains: ['hitrun'], id: 'test' as FactionId, bastionsBuilt: 0, maelstromsDeclared: 0, slaveCaptureCount: 0 },
    );
    expect(doctrine.bloodtrailMomentumEnabled).toBe(true);
  });

  it('no hitrun_t2 — bloodtrailMomentumEnabled is false', () => {
    const doctrine = resolveResearchDoctrine(
      { completedNodes: ['hitrun_t1'] as ResearchNodeId[], activeNodeId: undefined },
      { nativeDomain: 'hitrun', nativeDomains: ['hitrun'], learnedDomains: ['hitrun'], id: 'test' as FactionId, bastionsBuilt: 0, maelstromsDeclared: 0, slaveCaptureCount: 0 },
    );
    expect(doctrine.bloodtrailMomentumEnabled).toBe(false);
  });

  it('no research at all — bloodtrailMomentumEnabled is false', () => {
    const doctrine = resolveResearchDoctrine(undefined, undefined);
    expect(doctrine.bloodtrailMomentumEnabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Wound tracking in combat
// ---------------------------------------------------------------------------
describe('wound tracking in applyCombatAction', () => {
  it('increments woundsReceivedThisTurn on defender when defender takes damage', () => {
    let state = buildMvpScenario(42);
    const { attacker, defender, attackerFactionId } = getCombatants(state);

    state = placeAdjacent(state, attacker, defender);
    // Give defender enough HP to survive
    const units = new Map(state.units);
    units.set(defender.id, { ...units.get(defender.id)!, hp: 100, maxHp: 100 });
    state = { ...state, units };

    state = { ...state, activeFactionId: attackerFactionId, rngState: createRNG(42) };

    const preview = previewCombatAction(state, registry, attacker.id, defender.id);
    expect(preview).not.toBeNull();
    expect(preview!.result.defenderDamage).toBeGreaterThan(0);

    const result = applyCombatAction(state, registry, preview!);
    const updatedDefender = result.state.units.get(defender.id);
    expect(updatedDefender).toBeDefined();
    expect(updatedDefender!.woundsReceivedThisTurn).toBe(1);
  });

  it('increments woundsReceivedThisTurn on attacker when attacker takes damage', () => {
    let state = buildMvpScenario(42);
    const { attacker, defender, attackerFactionId } = getCombatants(state);

    state = placeAdjacent(state, attacker, defender);
    // Give both enough HP to survive
    const units = new Map(state.units);
    units.set(attacker.id, { ...units.get(attacker.id)!, hp: 100, maxHp: 100 });
    units.set(defender.id, { ...units.get(defender.id)!, hp: 100, maxHp: 100 });
    state = { ...state, units };

    state = { ...state, activeFactionId: attackerFactionId, rngState: createRNG(42) };

    const preview = previewCombatAction(state, registry, attacker.id, defender.id);
    expect(preview).not.toBeNull();

    const result = applyCombatAction(state, registry, preview!);

    if (preview!.result.attackerDamage > 0) {
      const updatedAttacker = result.state.units.get(attacker.id);
      expect(updatedAttacker).toBeDefined();
      expect(updatedAttacker!.woundsReceivedThisTurn).toBe(1);
    }
  });

  it('does not increment wounds when unit takes no damage', () => {
    let state = buildMvpScenario(42);
    const { attacker, defender, attackerFactionId } = getCombatants(state);

    state = placeAdjacent(state, attacker, defender);
    // If attacker takes 0 damage (range advantage etc.), wounds should not increment
    const units = new Map(state.units);
    units.set(defender.id, { ...units.get(defender.id)!, hp: 1, maxHp: 1, attacksRemaining: 0 });
    state = { ...state, units };

    state = { ...state, activeFactionId: attackerFactionId, rngState: createRNG(42) };

    const preview = previewCombatAction(state, registry, attacker.id, defender.id);
    expect(preview).not.toBeNull();

    if (preview!.result.attackerDamage === 0) {
      const result = applyCombatAction(state, registry, preview!);
      const updatedAttacker = result.state.units.get(attacker.id);
      if (updatedAttacker) {
        expect(updatedAttacker.woundsReceivedThisTurn).toBeFalsy();
      }
    }
  });

  it('accumulates wounds across multiple combats in one turn', () => {
    let state = buildMvpScenario(42);
    const { attacker, defender, attackerFactionId } = getCombatants(state);

    state = placeAdjacent(state, attacker, defender);

    // Pre-set a wound count on the defender
    const units = new Map(state.units);
    units.set(defender.id, { ...units.get(defender.id)!, hp: 100, maxHp: 100, woundsReceivedThisTurn: 2 });
    state = { ...state, units };

    state = { ...state, activeFactionId: attackerFactionId, rngState: createRNG(42) };

    const preview = previewCombatAction(state, registry, attacker.id, defender.id);
    expect(preview).not.toBeNull();
    expect(preview!.result.defenderDamage).toBeGreaterThan(0);

    const result = applyCombatAction(state, registry, preview!);
    const updatedDefender = result.state.units.get(defender.id);
    expect(updatedDefender).toBeDefined();
    expect(updatedDefender!.woundsReceivedThisTurn).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Movement bonus at turn start
// ---------------------------------------------------------------------------
describe('bloodtrail momentum movement bonus', () => {
  it('grants +1 movement per wound received, capped at maxMoves+3', () => {
    let state = buildMvpScenario(42);
    const { attacker, defender, attackerFactionId } = getCombatants(state);

    state = placeAdjacent(state, attacker, defender);

    // Enable foreign hitrun_t2 (next-turn bloodtrail; native variant is same-turn).
    state = setResearch(state, defender.factionId, ['hitrun_t1', 'hitrun_t2'], ['charge']);

    // Give defender wounds from previous combat
    const wounds = 5;
    const units = new Map(state.units);
    const defenderUnit = units.get(defender.id)!;
    units.set(defender.id, { ...defenderUnit, hp: 50, maxHp: 100, woundsReceivedThisTurn: wounds });
    state = { ...state, units };

    const maxMoves = defenderUnit.maxMoves;
    const expectedMoves = Math.min(maxMoves + wounds, maxMoves + 3);

    state = processFactionPhases(state, defender.factionId, registry);
    const refreshedDefender = state.units.get(defender.id);
    expect(refreshedDefender).toBeDefined();
    expect(refreshedDefender!.movesRemaining).toBe(expectedMoves);
  });

  it('resets woundsReceivedThisTurn after granting the bonus', () => {
    let state = buildMvpScenario(42);
    const { attacker, defender, attackerFactionId } = getCombatants(state);

    state = placeAdjacent(state, attacker, defender);

    state = setResearch(state, defender.factionId, ['hitrun_t1', 'hitrun_t2'], ['hitrun']);

    const units = new Map(state.units);
    units.set(defender.id, { ...units.get(defender.id)!, hp: 50, maxHp: 100, woundsReceivedThisTurn: 3 });
    state = { ...state, units };

    state = processFactionPhases(state, defender.factionId, registry);
    const refreshedDefender = state.units.get(defender.id);
    expect(refreshedDefender!.woundsReceivedThisTurn).toBeUndefined();
  });

  it('does not grant movement bonus without hitrun_t2', () => {
    let state = buildMvpScenario(42);
    const { attacker, defender, attackerFactionId } = getCombatants(state);

    state = placeAdjacent(state, attacker, defender);

    // No hitrun research at all
    const units = new Map(state.units);
    const defenderUnit = units.get(defender.id)!;
    const normalMaxMoves = defenderUnit.maxMoves;
    units.set(defender.id, { ...defenderUnit, hp: 50, maxHp: 100, woundsReceivedThisTurn: 3 });
    state = { ...state, units };

    state = processFactionPhases(state, defender.factionId, registry);
    const refreshedDefender = state.units.get(defender.id);
    expect(refreshedDefender!.movesRemaining).toBeLessThanOrEqual(normalMaxMoves + 1);
  });

  it('1 wound grants +1 movement', () => {
    let state = buildMvpScenario(42);
    const { attacker, defender, attackerFactionId } = getCombatants(state);

    state = placeAdjacent(state, attacker, defender);
    // Foreign hitrun_t2: +1 next-turn move per wound (native variant is same-turn).
    state = setResearch(state, defender.factionId, ['hitrun_t1', 'hitrun_t2'], ['charge']);

    const units = new Map(state.units);
    const defenderUnit = units.get(defender.id)!;
    units.set(defender.id, { ...defenderUnit, hp: 50, maxHp: 100, woundsReceivedThisTurn: 1 });
    state = { ...state, units };

    state = processFactionPhases(state, defender.factionId, registry);
    const refreshedDefender = state.units.get(defender.id);
    expect(refreshedDefender!.movesRemaining).toBe(defenderUnit.maxMoves + 1);
  });

  it('works for foreign hitrun_t2 (not native domain)', () => {
    let state = buildMvpScenario(42);
    const { attacker, defender, attackerFactionId } = getCombatants(state);

    state = placeAdjacent(state, attacker, defender);

    // hitrun is a learned/foreign domain, not native
    state = setResearch(state, defender.factionId, ['hitrun_t1', 'hitrun_t2'], ['charge']);

    const units = new Map(state.units);
    const defenderUnit = units.get(defender.id)!;
    units.set(defender.id, { ...defenderUnit, hp: 50, maxHp: 100, woundsReceivedThisTurn: 2 });
    state = { ...state, units };

    state = processFactionPhases(state, defender.factionId, registry);
    const refreshedDefender = state.units.get(defender.id);
    // +2 wounds = +2 moves, capped at maxMoves+3
    expect(refreshedDefender!.movesRemaining).toBe(Math.min(defenderUnit.maxMoves + 2, defenderUnit.maxMoves + 3));
  });
});
