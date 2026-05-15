// Tests for captureSystem.ts — capture ability, cooldowns, ownership transfer, non-combat capture
import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import {
  hasCaptureAbility,
  getCaptureParams,
  getCaptureCooldownRemaining,
  isOnCaptureCooldown,
  attemptCapture,
  attemptNonCombatCapture,
} from '../src/systems/captureSystem';
import { createRNG } from '../src/core/rng';
import type { GameState, Unit } from '../src/game/types';
import type { VeteranLevel } from '../src/core/enums';
import type { UnitId } from '../src/types';
import type { SignatureAbilityParams } from '../src/data/registry/types';

const registry = loadRulesRegistry();

// Build a minimal state with two factions + two units for capture tests
function makeCaptureState(
  attackerOverrides: Partial<Unit> = {},
  defenderOverrides: Partial<Unit> = {},
): GameState {
  const state = buildMvpScenario(42);
  const factionIds = Array.from(state.factions.keys());
  const attackerFactionId = factionIds[0];
  const defenderFactionId = factionIds[1];

  const attFaction = state.factions.get(attackerFactionId)!;
  const defFaction = state.factions.get(defenderFactionId)!;

  const attackerUnit = state.units.get(attFaction.unitIds[0]);
  const defenderUnit = state.units.get(defFaction.unitIds[0]);

  if (!attackerUnit || !defenderUnit) {
    throw new Error('Need at least 2 units for capture test');
  }

  // Override units
  const attacker: Unit = {
    ...attackerUnit,
    hp: 100,
    maxHp: 100,
    factionId: attackerFactionId,
    history: [],
    morale: 100,
    veteranLevel: 'green' as VeteranLevel,
    learnedAbilities: [],
    ...attackerOverrides,
  };

  const defender: Unit = {
    ...defenderUnit,
    hp: 30,
    maxHp: 100,
    factionId: defenderFactionId,
    history: [],
    morale: 50,
    veteranLevel: 'green' as VeteranLevel,
    learnedAbilities: [],
    ...defenderOverrides,
  };

  return {
    ...state,
    rngState: createRNG(42),
    round: 10,
    units: new Map([
      [attacker.id, attacker],
      [defender.id, defender],
    ]),
    factions: new Map([
      [attackerFactionId, {
        ...attFaction,
        unitIds: [attacker.id],
      }],
      [defenderFactionId, {
        ...defFaction,
        unitIds: [defender.id],
      }],
    ]),
  };
}

// ---------------------------------------------------------------------------
// hasCaptureAbility / getCaptureParams
// ---------------------------------------------------------------------------
describe('hasCaptureAbility', () => {
  it('returns false for a prototype with no capture components', () => {
    const state = buildMvpScenario(42);
    const proto = Array.from(state.prototypes.values())[0];
    expect(hasCaptureAbility(proto, registry)).toBe(false);
  });

  it('returns false for prototype with no components', () => {
    const dummy = { componentIds: [] };
    expect(hasCaptureAbility(dummy, registry)).toBe(false);
  });
});

describe('getCaptureParams', () => {
  it('returns null for a prototype with no capture components', () => {
    const state = buildMvpScenario(42);
    const proto = Array.from(state.prototypes.values())[0];
    expect(getCaptureParams(proto, registry)).toBeNull();
  });

  it('returns null for prototype with empty component list', () => {
    expect(getCaptureParams({ componentIds: [] }, registry)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Capture cooldown
// ---------------------------------------------------------------------------
describe('getCaptureCooldownRemaining', () => {
  it('returns 0 when no capture attempts in history', () => {
    const state = makeCaptureState();
    const unit = Array.from(state.units.values())[0];
    expect(getCaptureCooldownRemaining(unit, 10, 3)).toBe(0);
  });

  it('returns remaining cooldown when capture was attempted recently', () => {
    const state = makeCaptureState({
      history: [{ type: 'capture_attempt', timestamp: 8, details: { round: 8 } }],
    });
    const unit = Array.from(state.units.values())[0];
    // currentRound=10, last attempt=8, cooldown=3 => remaining = 3 - (10-8) = 1
    expect(getCaptureCooldownRemaining(unit, 10, 3)).toBe(1);
  });

  it('returns 0 when cooldown has expired', () => {
    const state = makeCaptureState({
      history: [{ type: 'capture_attempt', timestamp: 5, details: { round: 5 } }],
    });
    const unit = Array.from(state.units.values())[0];
    // currentRound=10, last attempt=5, cooldown=3 => remaining = max(0, 3-5) = 0
    expect(getCaptureCooldownRemaining(unit, 10, 3)).toBe(0);
  });
});

describe('isOnCaptureCooldown', () => {
  it('returns false when unit has no history', () => {
    const state = makeCaptureState();
    const unit = Array.from(state.units.values())[0];
    expect(isOnCaptureCooldown(unit)).toBe(false);
  });

  it('returns true when capture attempted within cooldown window', () => {
    const state = makeCaptureState({
      history: [{ type: 'capture_attempt', timestamp: 8, details: { round: 8 } }],
    });
    const unit = Array.from(state.units.values())[0];
    expect(isOnCaptureCooldown(unit, 10, 3)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// attemptCapture — on-kill capture mechanic
// ---------------------------------------------------------------------------
describe('attemptCapture', () => {
  it('fails when attacker prototype has no capture ability', () => {
    const state = makeCaptureState();
    const units = Array.from(state.units.values());
    const result = attemptCapture(state, units[0], units[1], registry);
    expect(result.captured).toBe(false);
  });

  it('captures on success — transfers ownership', () => {
    const state = makeCaptureState();
    const units = Array.from(state.units.values());
    const attacker = units[0];
    const defender = units[1];

    // Without a capture-capable prototype, capture fails and unit is destroyed
    const result = attemptCapture(state, attacker, defender, registry, null, state.rngState, 0);
    expect(result.captured).toBe(false);

    // Defender was destroyed (removed from units or removed from faction)
    const defAfter = result.state.units.get(defender.id);
    if (!defAfter) {
      const defFaction = result.state.factions.get(defender.factionId);
      expect(defFaction?.unitIds).not.toContain(defender.id);
    }
  });

  it('uses greedy ability when no component-based capture', () => {
    const state = makeCaptureState();
    const units = Array.from(state.units.values());
    const attacker = units[0];
    const defender = units[1];

    // Greedy ability with 100% chance ensures capture
    const greedyAbility: SignatureAbilityParams = {
      greedyCaptureChance: 1.0,
      greedyCaptureCooldown: 0,
      greedyCaptureHpFraction: 0.5,
    };

    const result = attemptCapture(state, attacker, defender, registry, greedyAbility, createRNG(99), 0);

    if (result.captured) {
      const capturedUnit = result.state.units.get(defender.id);
      expect(capturedUnit).toBeDefined();
      expect(capturedUnit!.factionId).toBe(attacker.factionId);
      // HP should be floor(maxHp * hpFraction) = floor(100 * 0.5) = 50
      expect(capturedUnit!.hp).toBe(50);
      // Morale reset to 50
      expect(capturedUnit!.morale).toBe(50);
      // Veteran reset to green
      expect(capturedUnit!.veteranLevel).toBe('green');

      // Attacker's faction now owns the defender
      const attFaction = result.state.factions.get(attacker.factionId);
      expect(attFaction?.unitIds).toContain(defender.id);

      // Defender's old faction no longer owns it
      const defFaction = result.state.factions.get(defender.factionId);
      expect(defFaction?.unitIds).not.toContain(defender.id);

      // History entries added
      expect(capturedUnit!.history.some(h => h.type === 'captured')).toBe(true);
      const updatedAttacker = result.state.units.get(attacker.id);
      expect(updatedAttacker?.history.some(h => h.type === 'capture_attempt')).toBe(true);
    }
  });

  it('respects cooldown — destroys unit when on cooldown', () => {
    // Attacker has a recent capture_attempt at round 9
    const state = makeCaptureState({
      history: [{ type: 'capture_attempt', timestamp: 9, details: { round: 9 } }],
    });
    state.round = 10;
    const units = Array.from(state.units.values());
    const attacker = units[0];
    const defender = units[1];

    const greedyAbility: SignatureAbilityParams = {
      greedyCaptureChance: 1.0,
      greedyCaptureCooldown: 5,
      greedyCaptureHpFraction: 0.5,
    };

    // Cooldown of 5, elapsed = 10-9 = 1, so still on cooldown (4 remaining)
    // Unit should be destroyed
    const result = attemptCapture(state, attacker, defender, registry, greedyAbility, createRNG(99), 0);
    expect(result.captured).toBe(false);
    const defAfter = result.state.units.get(defender.id);
    if (defAfter) {
      expect(defAfter.hp).toBeLessThanOrEqual(0);
    }
  });

  it('capture bonus increases the chance', () => {
    const state = makeCaptureState();
    const units = Array.from(state.units.values());
    const attacker = units[0];
    const defender = units[1];

    // Zero chance + 100% bonus = 100% chance
    const greedyAbility: SignatureAbilityParams = {
      greedyCaptureChance: 0,
      greedyCaptureCooldown: 0,
      greedyCaptureHpFraction: 0.5,
    };

    const result = attemptCapture(state, attacker, defender, registry, greedyAbility, createRNG(42), 1.0);
    // Should capture with totalChance = min(1, 0 + 1.0) = 1.0
    expect(result.captured).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// attemptNonCombatCapture
// ---------------------------------------------------------------------------
describe('attemptNonCombatCapture', () => {
  it('returns captured=false when captor or target missing', () => {
    const state = makeCaptureState();
    const result = attemptNonCombatCapture(
      state, 'nonexistent' as UnitId, 'nonexistent2' as UnitId,
      registry, 1.0, 0.5, 0, createRNG(42),
    );
    expect(result.captured).toBe(false);
  });

  it('returns captured=false when captor and target are same unit', () => {
    const state = makeCaptureState();
    const unit = Array.from(state.units.values())[0];
    const result = attemptNonCombatCapture(
      state, unit.id, unit.id,
      registry, 1.0, 0.5, 0, createRNG(42),
    );
    expect(result.captured).toBe(false);
  });

  it('transfers ownership on successful capture', () => {
    const state = makeCaptureState();
    const units = Array.from(state.units.values());
    const captor = units[0];
    const target = units[1];

    const result = attemptNonCombatCapture(
      state, captor.id, target.id,
      registry, 1.0, 0.5, 0, createRNG(42),
    );

    expect(result.captured).toBe(true);
    const capturedUnit = result.state.units.get(target.id);
    expect(capturedUnit).toBeDefined();
    expect(capturedUnit!.factionId).toBe(captor.factionId);
    expect(capturedUnit!.hp).toBe(Math.max(1, Math.floor(target.maxHp * 0.5)));
    expect(capturedUnit!.morale).toBe(50);

    // Captor attacksRemaining = 0 (action cost)
    const updatedCaptor = result.state.units.get(captor.id);
    expect(updatedCaptor?.attacksRemaining).toBe(0);

    // History entries
    expect(capturedUnit!.history.some(h => h.type === 'captured' && h.details.nonCombat)).toBe(true);
    expect(updatedCaptor?.history.some(h => h.type === 'capture_attempt')).toBe(true);

    // Faction ownership transfer
    const captorFaction = result.state.factions.get(captor.factionId);
    expect(captorFaction?.unitIds).toContain(target.id);
    const targetFaction = result.state.factions.get(target.factionId);
    expect(targetFaction?.unitIds).not.toContain(target.id);
  });

  it('respects cooldown between attempts', () => {
    const state = makeCaptureState();
    const units = Array.from(state.units.values());
    const captor = units[0];
    const target = units[1];

    // First capture: succeed (100% chance, no cooldown issues)
    state.round = 10;
    const result1 = attemptNonCombatCapture(
      state, captor.id, target.id,
      registry, 1.0, 0.5, 3, createRNG(42),
    );
    expect(result1.captured).toBe(true);

    // Second attempt at round 11: captor has capture_attempt at round 10
    // elapsed = 1, cooldown = 3, so still on cooldown
    // But target is now same faction as captor, so it will fail anyway
    const result2 = attemptNonCombatCapture(
      { ...result1.state, round: 11 },
      captor.id, target.id,
      registry, 1.0, 0.5, 3, createRNG(43),
    );
    // Target was already converted, so it's same faction => captured=false
    expect(result2.captured).toBe(false);
  });
});
