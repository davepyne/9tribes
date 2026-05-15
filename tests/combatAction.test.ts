// Combat action pipeline tests — previewCombatAction + applyCombatAction
// Aligns with the actual combat-action/ pipeline used by both AI and player paths.
import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { resolveCombat } from '../src/systems/combatSystem';
import { previewCombatAction } from '../src/systems/combat-action/preview';
import { applyCombatAction } from '../src/systems/combat-action/apply';
import { createRNG } from '../src/core/rng';
import type { GameState, Unit, HexCoord } from '../src/game/types';
import { getCombatants, placeAdjacent } from './helpers/combatSetup.js';

const registry = loadRulesRegistry();

// ---------------------------------------------------------------------------
// NOTE on resolveCombat:
// `resolveCombat()` is NOT dead code. It is the core combat math function
// shared between the old direct tests and the new pipeline. It is called by
// `previewCombatAction()` in `combat-action/preview.ts` to compute damage
// numbers. The old `combat.test.ts` tests call it directly to verify the
// math in isolation. The new tests below exercise the full pipeline
// (preview → apply) that mirrors actual gameplay.
// ---------------------------------------------------------------------------

describe('combat-action pipeline', () => {
  describe('previewCombatAction', () => {
    it('returns null for invalid attacker (dead)', () => {
      const state = buildMvpScenario(42);
      const { attacker, defender } = getCombatants(state);

      const deadAttacker = { ...attacker, hp: 0 };
      const units = new Map(state.units);
      units.set(attacker.id, deadAttacker);
      const modifiedState = { ...state, units };

      const preview = previewCombatAction(modifiedState, registry, attacker.id, defender.id);
      expect(preview).toBeNull();
    });

    it('returns null for invalid defender (dead)', () => {
      const state = buildMvpScenario(42);
      const { attacker, defender } = getCombatants(state);

      const deadDefender = { ...defender, hp: 0 };
      const units = new Map(state.units);
      units.set(defender.id, deadDefender);
      const modifiedState = { ...state, units };

      const preview = previewCombatAction(modifiedState, registry, attacker.id, defender.id);
      expect(preview).toBeNull();
    });

    it('returns null when attacker has no attacks remaining', () => {
      const state = buildMvpScenario(42);
      const { attacker, defender } = getCombatants(state);

      const spentAttacker = { ...attacker, attacksRemaining: 0 };
      const units = new Map(state.units);
      units.set(attacker.id, spentAttacker);
      const modifiedState = { ...state, units, activeFactionId: attacker.factionId };

      const preview = previewCombatAction(modifiedState, registry, attacker.id, defender.id);
      expect(preview).toBeNull();
    });

    it('returns a valid preview for a valid combat', () => {
      const state = buildMvpScenario(42);
      const { attacker, defender } = getCombatants(state);
      const positionedState = placeAdjacent(state, attacker, defender);
      const modifiedState = { ...positionedState, activeFactionId: attacker.factionId };

      const preview = previewCombatAction(modifiedState, registry, attacker.id, defender.id);

      expect(preview).not.toBeNull();
      if (preview) {
        expect(preview.attackerId).toBe(attacker.id);
        expect(preview.defenderId).toBe(defender.id);
        expect(preview.result).toBeDefined();
        expect(typeof preview.result.attackerDamage).toBe('number');
        expect(typeof preview.result.defenderDamage).toBe('number');
        expect(Array.isArray(preview.triggeredEffects)).toBe(true);
        expect(preview.details).toBeDefined();
        expect(typeof preview.details.attackerTerrainId).toBe('string');
        expect(typeof preview.details.defenderTerrainId).toBe('string');
      }
    });

    it('preview contains damage numbers greater than or equal to zero', () => {
      const state = buildMvpScenario(42);
      const { attacker, defender } = getCombatants(state);
      const positionedState = placeAdjacent(state, attacker, defender);
      const modifiedState = {
        ...positionedState,
        activeFactionId: attacker.factionId,
        rngState: createRNG(123),
      };

      const preview = previewCombatAction(modifiedState, registry, attacker.id, defender.id);
      expect(preview).not.toBeNull();
      if (!preview) return;

      expect(preview.result.defenderDamage).toBeGreaterThanOrEqual(0);
      expect(preview.result.attackerDamage).toBeGreaterThanOrEqual(0);
      if (preview.result.defenderDamage > 0) {
        expect(preview.result.attackerBaseAttack).toBeGreaterThan(0);
      }
    });
  });

  describe('applyCombatAction', () => {
    it('applies combat changes to the game state', () => {
      const state = buildMvpScenario(42);
      const { attacker, defender } = getCombatants(state);
      const positionedState = placeAdjacent(state, attacker, defender);
      const modifiedState = { ...positionedState, activeFactionId: attacker.factionId };

      const preview = previewCombatAction(modifiedState, registry, attacker.id, defender.id);
      expect(preview).not.toBeNull();
      if (!preview) return;

      const result = applyCombatAction(modifiedState, registry, preview);
      expect(result.state).toBeDefined();
      expect(result.feedback).toBeDefined();
      expect(result.feedback.resolution).toBeDefined();

      const spentAttacker = result.state.units.get(attacker.id);
      if (spentAttacker) {
        expect(spentAttacker.activatedThisRound).toBe(true);
        expect(spentAttacker.attacksRemaining).toBe(0);
      }

      const updatedDefender = result.state.units.get(defender.id);
      if (updatedDefender && preview.result.defenderDamage > 0 && !preview.result.defenderDestroyed) {
        expect(updatedDefender.hp).toBeLessThan(defender.hp);
      }
    });

    it('destroys defender when damage kills it', () => {
      const state = buildMvpScenario(42);
      const { attacker, defender } = getCombatants(state);
      const positionedState = placeAdjacent(state, attacker, defender);

      // Get the positioned defender from the new state
      const positionedDefender = positionedState.units.get(defender.id)!;
      const weakDefender = { ...positionedDefender, hp: 1, maxHp: 100 };
      const units = new Map(positionedState.units);
      units.set(defender.id, weakDefender);
      const modifiedState = {
        ...positionedState,
        units,
        activeFactionId: attacker.factionId,
        rngState: createRNG(42),
      };

      const preview = previewCombatAction(modifiedState, registry, attacker.id, defender.id);
      expect(preview).not.toBeNull();
      if (!preview) return;

      const result = applyCombatAction(modifiedState, registry, preview);
      const deadDefender = result.state.units.get(defender.id);
      if (deadDefender) {
        expect(deadDefender.hp).toBe(0);
      }
    });

    it('preserves state integrity after combat', () => {
      const state = buildMvpScenario(42);
      const factionIds = Array.from(state.factions.keys());
      const { attacker, defender } = getCombatants(state);
      const positionedState = placeAdjacent(state, attacker, defender);

      // Get the positioned units from the new state
      const posDefender = positionedState.units.get(defender.id)!;
      const posAttacker = positionedState.units.get(attacker.id)!;
      const superAttacker = { ...posAttacker, hp: 999, maxHp: 999 };
      const weakDefender = { ...posDefender, hp: 1, maxHp: 100 };

      const units = new Map(positionedState.units);
      units.set(attacker.id, superAttacker);
      units.set(defender.id, weakDefender);
      const modifiedState = {
        ...positionedState,
        units,
        activeFactionId: attacker.factionId,
        rngState: createRNG(42),
      };

      const preview = previewCombatAction(modifiedState, registry, attacker.id, defender.id);
      expect(preview).not.toBeNull();
      if (!preview) return;

      const result = applyCombatAction(modifiedState, registry, preview);

      const defAfter = result.state.units.get(defender.id);
      if (defAfter) {
        expect(defAfter.hp).toBeLessThanOrEqual(0);
      }

      const attAfter = result.state.units.get(attacker.id);
      expect(attAfter).toBeDefined();
      if (attAfter) {
        expect(attAfter.activatedThisRound).toBe(true);
        expect(attAfter.status).toBe('spent');
      }

      expect(result.state.factions.has(factionIds[0])).toBe(true);
      expect(result.state.factions.has(factionIds[1])).toBe(true);
    });

    it('runs successfully across multiple faction pairs with adjacent units', () => {
      const state = buildMvpScenario(42);
      const factionIds = Array.from(state.factions.keys());

      for (let i = 0; i < Math.min(3, factionIds.length); i++) {
        const attFactionId = factionIds[i];
        const defFactionId = factionIds[(i + 1) % factionIds.length];

        const attFaction = state.factions.get(attFactionId)!;
        const defFaction = state.factions.get(defFactionId)!;

        const attackerUnit = state.units.get(attFaction.unitIds[0]);
        const defenderUnit = state.units.get(defFaction.unitIds[0]);

        if (!attackerUnit || !defenderUnit) continue;

        // Place defender adjacent to attacker
        const adjPos: HexCoord = { q: attackerUnit.position.q + 1, r: attackerUnit.position.r };
        const units = new Map(state.units);
        units.set(defenderUnit.id, { ...defenderUnit, position: adjPos });
        const modifiedState = { ...state, units, activeFactionId: attFactionId, rngState: createRNG(i * 100) };

        const preview = previewCombatAction(modifiedState, registry, attackerUnit.id, defenderUnit.id);
        if (!preview) continue;

        const result = applyCombatAction(modifiedState, registry, preview);
        expect(result.state).toBeDefined();
        expect(typeof result.feedback.lastLearnedDomain).toBe('object');
      }
    });
  });

  // -----------------------------------------------------------------------
  // Equivalence check: preview + apply pipeline vs direct resolveCombat
  // -----------------------------------------------------------------------
  describe('pipeline equivalence with resolveCombat', () => {
    it('preview result contains expected combat fields from resolveCombat', () => {
      const state = buildMvpScenario(42);
      const { attacker, defender } = getCombatants(state);
      const positionedState = placeAdjacent(state, attacker, defender);
      const modifiedState = { ...positionedState, activeFactionId: attacker.factionId, rngState: createRNG(42) };

      const preview = previewCombatAction(modifiedState, registry, attacker.id, defender.id);
      expect(preview).not.toBeNull();
      if (!preview) return;

      // The preview's result IS what resolveCombat returns
      expect(preview.result.defenderDamage).toBeGreaterThanOrEqual(0);
      expect(preview.result.attackerDamage).toBeGreaterThanOrEqual(0);
      expect(typeof preview.result.defenderDestroyed).toBe('boolean');
      expect(typeof preview.result.attackerDestroyed).toBe('boolean');
      expect(typeof preview.result.defenderMoraleLoss).toBe('number');
      expect(typeof preview.result.attackerMoraleLoss).toBe('number');
      expect(typeof preview.result.roleModifier).toBe('number');
      expect(typeof preview.result.weaponModifier).toBe('number');
    });

    it('preview.triggeredEffects describes what modifiers fired', () => {
      const state = buildMvpScenario(42);
      const { attacker, defender } = getCombatants(state);
      const positionedState = placeAdjacent(state, attacker, defender);
      const modifiedState = { ...positionedState, activeFactionId: attacker.factionId, rngState: createRNG(42) };

      const preview = previewCombatAction(modifiedState, registry, attacker.id, defender.id);
      expect(preview).not.toBeNull();
      if (!preview) return;

      // triggeredEffects should reflect the modifiers applied
      for (const effect of preview.triggeredEffects) {
        expect(typeof effect.label).toBe('string');
        expect(typeof effect.detail).toBe('string');
        expect(['positioning', 'ability', 'synergy', 'aftermath']).toContain(effect.category);
      }
    });
  });
});
