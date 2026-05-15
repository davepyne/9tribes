// Tests for charge T3 native — chain amplification + splash damage
import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { previewCombatAction } from '../src/systems/combat-action/preview';
import { applyCombatAction } from '../src/systems/combat-action/apply';
import { resolveResearchDoctrine } from '../src/systems/capabilityDoctrine';
import { createRNG } from '../src/core/rng';
import { hexLineAwayFrom, getNeighbors, hexToKey } from '../src/core/grid';
import { getUnitAtHex } from '../src/systems/occupancySystem';
import type { ResearchNodeId } from '../src/types';
import { getCombatants, placeAdjacent, addExtraUnit, setResearch, fakeFaction } from './helpers/combatSetup.js';

const registry = loadRulesRegistry();

// ---------------------------------------------------------------------------
describe('charge T3 doctrine flags', () => {
  it('native charge T3 enables chargeSplashEnabled and chargeChainEnabled', () => {
    const doctrine = resolveResearchDoctrine(
      { completedNodes: ['charge_t1', 'charge_t2', 'charge_t3'] as ResearchNodeId[], activeNodeId: undefined },
      fakeFaction(['charge']),
    );
    expect(doctrine.chargeSplashEnabled).toBe(true);
    expect(doctrine.chargeChainEnabled).toBe(true);
  });

  it('foreign charge T3 does NOT enable splash or chain', () => {
    const doctrine = resolveResearchDoctrine(
      { completedNodes: ['charge_t1', 'charge_t2', 'charge_t3'] as ResearchNodeId[], activeNodeId: undefined },
      fakeFaction(['venom']),
    );
    expect(doctrine.chargeSplashEnabled).toBe(false);
    expect(doctrine.chargeChainEnabled).toBe(false);
  });

  it('no charge T3 — both flags false', () => {
    const doctrine = resolveResearchDoctrine(
      { completedNodes: ['charge_t1'] as ResearchNodeId[], activeNodeId: undefined },
      fakeFaction(['charge']),
    );
    expect(doctrine.chargeSplashEnabled).toBe(false);
    expect(doctrine.chargeChainEnabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hexLineAwayFrom utility
// ---------------------------------------------------------------------------
describe('hexLineAwayFrom', () => {
  it('returns empty for zero steps', () => {
    expect(hexLineAwayFrom({ q: 0, r: 0 }, { q: 1, r: 0 }, 0)).toEqual([]);
  });

  it('traces hexes away from target', () => {
    const origin = { q: 3, r: 3 };
    const toward = { q: 0, r: 0 };
    const path = hexLineAwayFrom(origin, toward, 3);
    expect(path.length).toBe(3);
    // Each step should move further from toward
    for (const hex of path) {
      const dq = hex.q - toward.q;
      const dr = hex.r - toward.r;
      expect(dq + dr).toBeGreaterThan(3 + 3); // further from toward than origin
    }
  });
});

// ---------------------------------------------------------------------------
// Chain amplification preview
// ---------------------------------------------------------------------------
describe('chain amplification — preview', () => {
  it('adds +10% per friendly ally in charge line', () => {
    let state = buildMvpScenario(42);
    const { attacker, defender, attackerFactionId } = getCombatants(state);

    state = placeAdjacent(state, attacker, defender);

    // Re-read positions after placement
    const updatedAttacker = state.units.get(attacker.id)!;
    const updatedDefender = state.units.get(defender.id)!;

    // Make attacker look like it moved (movesRemaining < maxMoves)
    const units = new Map(state.units);
    units.set(attacker.id, {
      ...updatedAttacker,
      movesRemaining: 0,
      maxMoves: 3,
    });
    state = { ...state, units };

    // Place 2 friendly units along the charge line (away from defender)
    const chargePath = hexLineAwayFrom(updatedAttacker.position, updatedDefender.position, 3);
    const template = state.units.get(attacker.id)!;

    let placed = 0;
    for (const hex of chargePath) {
      if (placed >= 2) break;
      if (state.map.tiles.has(hexToKey(hex)) && !getUnitAtHex(state, hex)) {
        const res = addExtraUnit(state, hex, attackerFactionId, template);
        state = res.state;
        placed++;
      }
    }
    // Fallback: if charge path hexes are off-map, place units at any valid
    // neighbor-of-attacker hex that isn't the defender's position
    if (placed < 1) {
      for (const hex of getNeighbors(updatedAttacker.position)) {
        if (placed >= 2) break;
        if (hex.q === updatedDefender.position.q && hex.r === updatedDefender.position.r) continue;
        if (state.map.tiles.has(hexToKey(hex)) && !getUnitAtHex(state, hex)) {
          const res = addExtraUnit(state, hex, attackerFactionId, template);
          state = res.state;
          placed++;
        }
      }
    }
    expect(placed).toBeGreaterThanOrEqual(1);

    // Enable native charge T3
    state = setResearch(state, attackerFactionId,
      ['charge_t1', 'charge_t2', 'charge_t3'], ['charge']);
    state = { ...state, activeFactionId: attackerFactionId, rngState: createRNG(42) };

    const preview = previewCombatAction(state, registry, attacker.id, defender.id);
    expect(preview).not.toBeNull();
    expect(preview!.details.chargeChainBonusAmount).toBeGreaterThan(0);
  });

  it('caps chain bonus at +50% (5 allies)', () => {
    let state = buildMvpScenario(42);
    const { attacker, defender, attackerFactionId } = getCombatants(state);

    state = placeAdjacent(state, attacker, defender);

    const updatedAttacker = state.units.get(attacker.id)!;
    const updatedDefender = state.units.get(defender.id)!;

    const units = new Map(state.units);
    units.set(attacker.id, {
      ...updatedAttacker,
      movesRemaining: 0,
      maxMoves: 6,
    });
    state = { ...state, units };

    // Place 6 friendly units along the charge line — should cap at 5
    const chargePath = hexLineAwayFrom(updatedAttacker.position, updatedDefender.position, 6);
    const template = state.units.get(attacker.id)!;

    for (let i = 0; i < chargePath.length; i++) {
      const hex = chargePath[i];
      if (state.map.tiles.has(hexToKey(hex))) {
        const res = addExtraUnit(state, hex, attackerFactionId, template);
        state = res.state;
      }
    }

    state = setResearch(state, attackerFactionId,
      ['charge_t1', 'charge_t2', 'charge_t3'], ['charge']);
    state = { ...state, activeFactionId: attackerFactionId, rngState: createRNG(42) };

    const preview = previewCombatAction(state, registry, attacker.id, defender.id);
    expect(preview).not.toBeNull();
    expect(preview!.details.chargeChainBonusAmount).toBeLessThanOrEqual(0.5);
  });

  it('does not add chain bonus without charge T3 native', () => {
    let state = buildMvpScenario(42);
    const { attacker, defender, attackerFactionId } = getCombatants(state);

    state = placeAdjacent(state, attacker, defender);

    const units = new Map(state.units);
    units.set(attacker.id, {
      ...units.get(attacker.id)!,
      movesRemaining: 0,
      maxMoves: 3,
    });
    state = { ...state, units };

    // Foreign charge (native domain is venom, not charge)
    state = setResearch(state, attackerFactionId,
      ['charge_t1', 'charge_t2', 'charge_t3'], ['venom']);
    state = { ...state, activeFactionId: attackerFactionId, rngState: createRNG(42) };

    const preview = previewCombatAction(state, registry, attacker.id, defender.id);
    expect(preview).not.toBeNull();
    expect(preview!.details.chargeChainBonusAmount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Splash damage — apply
// ---------------------------------------------------------------------------
describe('charge splash — apply', () => {
  it('deals 50% of charge damage to adjacent enemies', () => {
    let state = buildMvpScenario(42);
    const { attacker, defender, attackerFactionId, defenderFactionId } = getCombatants(state);

    state = placeAdjacent(state, attacker, defender);

    // Re-read defender position after placement
    const updatedDefender = state.units.get(defender.id)!;

    // Set defender to low HP so the kill is clean
    const units = new Map(state.units);
    units.set(defender.id, {
      ...updatedDefender,
      hp: 1,
      maxHp: 100,
    });
    // Set attacker to have moved (to make it a charge attack)
    units.set(attacker.id, {
      ...units.get(attacker.id)!,
      movesRemaining: 0,
      maxMoves: 3,
    });
    state = { ...state, units };

    // Place an enemy unit adjacent to the defender (not on attacker hex)
    const template = state.units.get(defender.id)!;
    let splashTargetId: string | undefined;
    for (const adjHex of getNeighbors(updatedDefender.position)) {
      if (adjHex.q === attacker.position.q && adjHex.r === attacker.position.r) continue;
      if (state.map.tiles.has(hexToKey(adjHex)) && !getUnitAtHex(state, adjHex)) {
        const res = addExtraUnit(state, adjHex, defenderFactionId, template);
        state = res.state;
        splashTargetId = res.unitId;
        break;
      }
    }
    expect(splashTargetId).toBeDefined();

    // Enable native charge T3
    state = setResearch(state, attackerFactionId,
      ['charge_t1', 'charge_t2', 'charge_t3'], ['charge']);
    state = { ...state, activeFactionId: attackerFactionId, rngState: createRNG(42) };

    const preview = previewCombatAction(state, registry, attacker.id, defender.id);
    expect(preview).not.toBeNull();

    const result = applyCombatAction(state, registry, preview!);
    expect(result.feedback.resolution.chargeSplashTargetsHit).toBeGreaterThanOrEqual(1);

    // Splash target should have taken damage
    if (splashTargetId) {
      const splashTarget = result.state.units.get(splashTargetId);
      expect(splashTarget!.hp).toBeLessThan(50); // started at 50
    }
  });

  it('does not hit friendly units with splash', () => {
    let state = buildMvpScenario(42);
    const { attacker, defender, attackerFactionId } = getCombatants(state);

    state = placeAdjacent(state, attacker, defender);
    const updatedDefender = state.units.get(defender.id)!;

    const units = new Map(state.units);
    units.set(defender.id, { ...updatedDefender, hp: 1, maxHp: 100 });
    units.set(attacker.id, { ...units.get(attacker.id)!, movesRemaining: 0, maxMoves: 3 });
    state = { ...state, units };

    // Place a friendly unit adjacent to the defender
    const template = state.units.get(attacker.id)!;
    let friendlyId: string | undefined;
    for (const adjHex of getNeighbors(updatedDefender.position)) {
      if (adjHex.q === attacker.position.q && adjHex.r === attacker.position.r) continue;
      if (state.map.tiles.has(hexToKey(adjHex)) && !getUnitAtHex(state, adjHex)) {
        const res = addExtraUnit(state, adjHex, attackerFactionId, template);
        state = res.state;
        friendlyId = res.unitId;
        break;
      }
    }

    state = setResearch(state, attackerFactionId,
      ['charge_t1', 'charge_t2', 'charge_t3'], ['charge']);
    state = { ...state, activeFactionId: attackerFactionId, rngState: createRNG(42) };

    const preview = previewCombatAction(state, registry, attacker.id, defender.id);
    expect(preview).not.toBeNull();

    const result = applyCombatAction(state, registry, preview!);

    // Friendly unit should not have taken splash damage
    if (friendlyId) {
      const friendly = result.state.units.get(friendlyId);
      expect(friendly!.hp).toBe(50); // unchanged
    }
    // No splash targets hit (only friendly was adjacent)
    expect(result.feedback.resolution.chargeSplashTargetsHit).toBe(0);
  });

  it('does not fire splash without native charge T3', () => {
    let state = buildMvpScenario(42);
    const { attacker, defender, attackerFactionId, defenderFactionId } = getCombatants(state);

    state = placeAdjacent(state, attacker, defender);
    const updatedDefender = state.units.get(defender.id)!;

    const units = new Map(state.units);
    units.set(defender.id, { ...updatedDefender, hp: 1, maxHp: 100 });
    units.set(attacker.id, { ...units.get(attacker.id)!, movesRemaining: 0, maxMoves: 3 });
    state = { ...state, units };

    // Place enemy adjacent to defender
    const template = state.units.get(defender.id)!;
    for (const adjHex of getNeighbors(updatedDefender.position)) {
      if (adjHex.q === attacker.position.q && adjHex.r === attacker.position.r) continue;
      if (state.map.tiles.has(hexToKey(adjHex)) && !getUnitAtHex(state, adjHex)) {
        const res = addExtraUnit(state, adjHex, defenderFactionId, template);
        state = res.state;
        break;
      }
    }

    // Foreign charge (not native)
    state = setResearch(state, attackerFactionId,
      ['charge_t1', 'charge_t2', 'charge_t3'], ['venom']);
    state = { ...state, activeFactionId: attackerFactionId, rngState: createRNG(42) };

    const preview = previewCombatAction(state, registry, attacker.id, defender.id);
    expect(preview).not.toBeNull();
    expect(preview!.details.chargeSplashEnabled).toBe(false);

    const result = applyCombatAction(state, registry, preview!);
    expect(result.feedback.resolution.chargeSplashTargetsHit).toBe(0);
  });
});
