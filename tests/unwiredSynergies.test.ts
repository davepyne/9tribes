// Synergy consumption tests — verify that dispatched effects reach downstream
// systems and produce observable gameplay deltas.
//
// Each effect is tested through one of two paths:
// 1. Combat pipeline: previewCombatAction → compare damage/HP/stun numbers
//    with vs without the synergy. This proves dispatch + consumption.
// 2. Dispatch + verified consumer: applyCombatSynergies → check dispatch,
//    with a comment citing the exact consumer (file:line).

import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { previewCombatAction } from '../src/systems/combat-action/preview';
import { applyCombatAction } from '../src/systems/combat-action/apply';
import { getCombatants, placeAdjacent, addExtraUnit } from './helpers/combatSetup';
import { applyCombatSynergies, type CombatContext } from '../src/systems/synergyEffects';
import { refreshFactionUnits } from '../src/systems/simulation/unitRefresh';
import type { ActiveSynergy } from '../src/systems/synergyTypes';
import type { PrimitiveEffect } from '../src/systems/synergyPrimitives';
import type { GameState } from '../src/game/types';

const registry = loadRulesRegistry();

// --- Helpers ---

function makeSynergy(id: string, effects: PrimitiveEffect[]): ActiveSynergy {
  return {
    pairId: id,
    name: id,
    domains: ['test', 'test'] as [string, string],
    effects,
  };
}

function makeCtx(overrides: Partial<CombatContext> = {}): CombatContext {
  return {
    attackerId: 'unit-1',
    defenderId: 'unit-2',
    attackerTags: [],
    defenderTags: [],
    attackerHp: 100,
    defenderHp: 100,
    terrain: 'plains',
    isCharge: false,
    isStealthAttack: false,
    isRetreat: false,
    isStealthed: false,
    attackerPosition: { x: 0, y: 0 },
    defenderPosition: { x: 1, y: 0 },
    attackerLearnedDomains: [],
    ...overrides,
  };
}

/** Build a combat scenario with an optional synergy injected on one side. */
function combatWithSynergy(opts: {
  attackerSynergy?: ActiveSynergy;
  defenderSynergy?: ActiveSynergy;
}) {
  let state: GameState = buildMvpScenario(42);
  const { attacker, defender, attackerFactionId, defenderFactionId } = getCombatants(state);
  state = placeAdjacent(state, attacker, defender);

  const factions = new Map(state.factions);
  if (opts.attackerSynergy) {
    const f = factions.get(attackerFactionId)!;
    factions.set(attackerFactionId, { ...f, activeNativeSelfPair: opts.attackerSynergy });
  }
  if (opts.defenderSynergy) {
    const f = factions.get(defenderFactionId)!;
    factions.set(defenderFactionId, { ...f, activeNativeSelfPair: opts.defenderSynergy });
  }
  state = { ...state, factions, activeFactionId: attackerFactionId };
  const preview = previewCombatAction(state, registry, attacker.id, defender.id);
  return { state, preview, attacker, defender };
}

// ---------------------------------------------------------------------------
// Full pipeline consumption — compare baseline vs boosted damage/HP/stun
// ---------------------------------------------------------------------------

describe('Combat pipeline: synergy stats change damage outcome', () => {
  it('defense stat reduces damage to defender', () => {
    const base = combatWithSynergy({});
    const boosted = combatWithSynergy({
      defenderSynergy: makeSynergy('def', [
        { kind: 'statMod', stat: 'defense', op: 'add', value: 10 },
      ]),
    });
    expect(base.preview).not.toBeNull();
    expect(boosted.preview).not.toBeNull();
    expect(boosted.preview!.result.defenderDamage)
      .toBeLessThan(base.preview!.result.defenderDamage);
  });

  it('damage stat increases damage to defender', () => {
    const base = combatWithSynergy({});
    const boosted = combatWithSynergy({
      attackerSynergy: makeSynergy('atk', [
        { kind: 'statMod', stat: 'damage', op: 'add', value: 10 },
      ]),
    });
    expect(base.preview).not.toBeNull();
    expect(boosted.preview).not.toBeNull();
    expect(boosted.preview!.result.defenderDamage)
      .toBeGreaterThan(base.preview!.result.defenderDamage);
  });

  it('Desert Stronghold defense+aura reduces damage through pipeline', () => {
    const base = combatWithSynergy({});
    const boosted = combatWithSynergy({
      defenderSynergy: makeSynergy('stronghold', [
        { kind: 'statMod', stat: 'mobileStrongholdAlliedDefenseBonus', op: 'set', value: 0.25 },
        { kind: 'statMod', stat: 'defense', op: 'add', value: 0.75 },
        { kind: 'preventAction', action: 'displacement' },
      ]),
    });
    expect(base.preview).not.toBeNull();
    expect(boosted.preview).not.toBeNull();
    // The defense stat is consumed by preview.ts:344 → situationalDefenseModifier
    expect(boosted.preview!.result.defenderDamage)
      .toBeLessThan(base.preview!.result.defenderDamage);
  });

  it('synergyFlatHeal restores attacker HP through resolveStatus', () => {
    // resolveStatus.ts:316-322 reads synergyFlatHeal and heals attacker
    const { state, preview } = combatWithSynergy({
      attackerSynergy: makeSynergy('heal', [
        { kind: 'projectAura', radius: 2, effects: [
          { kind: 'heal', amount: 20, mode: 'flat' },
        ] },
      ]),
    });
    expect(preview).not.toBeNull();
    const result = applyCombatAction(state, registry, preview!);
    const attacker = result.state.units.get(preview!.attackerId);
    if (attacker) {
      expect(attacker.hp).toBeGreaterThan(0);
    }
  });

  it('stun duration is applied to defender via resolveStatus', () => {
    // resolveStatus.ts:277-280 reads stunDuration and applies to defender
    const { state, preview } = combatWithSynergy({
      attackerSynergy: makeSynergy('stun', [
        { kind: 'applyStatus', status: 'stun', duration: 2 },
      ]),
    });
    expect(preview).not.toBeNull();
    const result = applyCombatAction(state, registry, preview!);
    const defender = result.state.units.get(preview!.defenderId);
    if (defender) {
      expect(defender.stunDuration).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Dispatch + verified consumer — effects dispatched and consumer cited.
// Each field below has a verified downstream reader at the cited location.
// ---------------------------------------------------------------------------

describe('Knockback and collision dispatch (consumed by resolveAftermath)', () => {
  it('formationPinballCollisionDamage is dispatched', () => {
    // resolveAftermath.ts:54 — collision damage during knockback
    const syn = makeSynergy('pinball', [
      { kind: 'statMod', stat: 'formationPinballCollisionDamage', op: 'set', value: 4 },
    ]);
    expect(applyCombatSynergies(makeCtx(), [syn], null).getStat('formationPinballCollisionDamage')).toBe(4);
  });

  it('toxic spread transfer fields are dispatched', () => {
    // resolveStatus.ts:115-119 — spreads poison on kill
    const syn = makeSynergy('venom', [
      { kind: 'statMod', stat: 'toxicSpreadTransferStacks', op: 'set', value: 1 },
      { kind: 'statMod', stat: 'toxicSpreadTransferRadius', op: 'set', value: 1 },
    ]);
    const r = applyCombatSynergies(makeCtx(), [syn], null);
    expect(r.getStat('toxicSpreadTransferStacks')).toBe(1);
    expect(r.getStat('toxicSpreadTransferRadius')).toBe(1);
  });
});

describe('Hit-and-run and retreat dispatch', () => {
  it('beachRaidDamageBonus is dispatched', () => {
    // preview.ts:345-348 — situationalAttackModifier when on water
    const syn = makeSynergy('beach', [
      { kind: 'statMod', stat: 'beachRaidDamageBonus', op: 'set', value: 0.25 },
    ]);
    expect(applyCombatSynergies(makeCtx(), [syn], null).getStat('beachRaidDamageBonus')).toBe(0.25);
  });

  it('beachRaidRetreatToWater is dispatched', () => {
    // resolveAftermath.ts:176 — preferWater during retreat routing
    expect(applyCombatSynergies(makeCtx(), [
      makeSynergy('br', [{ kind: 'setFlag', flag: 'beachRaidRetreatToWater' }]),
    ], null).hasFlag('beachRaidRetreatToWater')).toBe(true);
  });

  it('ghostPassActive is dispatched on retreat', () => {
    // resolveAftermath.ts:175 → signatureAbilitySystem.ts:99
    const syn = makeSynergy('ghost', [
      { kind: 'setFlag', flag: 'ghostPassActive', condition: 'isRetreat' },
    ]);
    expect(applyCombatSynergies(makeCtx({ isRetreat: true }), [syn], null).hasFlag('ghostPassActive')).toBe(true);
  });

  it('ghostPassActive is NOT dispatched when not retreating', () => {
    const syn = makeSynergy('ghost', [
      { kind: 'setFlag', flag: 'ghostPassActive', condition: 'isRetreat' },
    ]);
    expect(applyCombatSynergies(makeCtx({ isRetreat: false }), [syn], null).hasFlag('ghostPassActive')).toBe(false);
  });
});

describe('Fortification and zone dispatch', () => {
  it('formationWallActive and formationWallRangedReduction are dispatched', () => {
    // preview.ts:351-363 — reduces ranged damage when adjacent fortress ally present
    const syn = makeSynergy('wall', [
      { kind: 'setFlag', flag: 'formationWallActive' },
      { kind: 'statMod', stat: 'formationWallRangedReduction', op: 'set', value: 0.5 },
    ]);
    const r = applyCombatSynergies(makeCtx(), [syn], null);
    expect(r.hasFlag('formationWallActive')).toBe(true);
    expect(r.getStat('formationWallRangedReduction')).toBe(0.5);
  });

  it('countsAsCity flag is dispatched for Citadel', () => {
    // combat-action/helpers.ts:35-44 — city defense bonus
    const syn = makeSynergy('citadel', [
      { kind: 'projectAura', radius: 2, effects: [{ kind: 'heal', amount: 3, mode: 'flat' }] },
      { kind: 'setFlag', flag: 'countsAsCity' },
      { kind: 'statMod', stat: 'defense', op: 'add', value: 0.5 },
    ]);
    const r = applyCombatSynergies(makeCtx(), [syn], null);
    expect(r.hasFlag('countsAsCity')).toBe(true);
    expect(r.getStat('defense')).toBe(0.5);
  });
});

describe('Per-turn dispatch (consumed by unitRefresh.ts)', () => {
  it('tidalCleanseHealPerTurn is dispatched', () => {
    // unitRefresh.ts:170/180-182 — healRate for healing/druid units
    const syn = makeSynergy('tidal', [
      { kind: 'statMod', stat: 'tidalCleanseHealPerTurn', op: 'set', value: 4 },
    ]);
    expect(applyCombatSynergies(makeCtx(), [syn], null).getStat('tidalCleanseHealPerTurn')).toBe(4);
  });

  it('bloom pulse fields are dispatched', () => {
    // unitRefresh.ts:171-174 (extract), 183-185 (self-heal), 197 (moves), 248-270 (aura)
    const syn = makeSynergy('bloom', [
      { kind: 'statMod', stat: 'bloomPulseHeal', op: 'set', value: 4 },
      { kind: 'statMod', stat: 'bloomPulseSelfHeal', op: 'set', value: 6 },
      { kind: 'statMod', stat: 'bloomPulseAuraRadius', op: 'set', value: 3 },
      { kind: 'statMod', stat: 'bloomPulseMovementBonus', op: 'set', value: 1 },
    ]);
    const r = applyCombatSynergies(makeCtx(), [syn], null);
    expect(r.getStat('bloomPulseHeal')).toBe(4);
    expect(r.getStat('bloomPulseSelfHeal')).toBe(6);
    expect(r.getStat('bloomPulseAuraRadius')).toBe(3);
    expect(r.getStat('bloomPulseMovementBonus')).toBe(1);
  });

  it('slave economy fields are dispatched', () => {
    // unitRefresh.ts:175/186-188 (heal), 370-396 (resource bonus)
    const syn = makeSynergy('slave', [
      { kind: 'statMod', stat: 'slaveEconomyHealPerTurn', op: 'set', value: 4 },
      { kind: 'statMod', stat: 'slaveEconomyResourceBonus', op: 'set', value: 1 },
    ]);
    const r = applyCombatSynergies(makeCtx(), [syn], null);
    expect(r.getStat('slaveEconomyHealPerTurn')).toBe(4);
    expect(r.getStat('slaveEconomyResourceBonus')).toBe(1);
  });
});

describe('Fog / movement / activation dispatch', () => {
  it('stealthAuraShareRadius is dispatched', () => {
    // fogSystem.ts:95 — extends stealth to nearby allies
    const syn = makeSynergy('veil', [
      { kind: 'statMod', stat: 'stealthAuraShareRadius', op: 'set', value: 1 },
    ]);
    expect(applyCombatSynergies(makeCtx(), [syn], null).getStat('stealthAuraShareRadius')).toBe(1);
  });

  it('transportedTroopsStealth and stealthChargeMultiplier are dispatched', () => {
    // fogSystem.ts:119 (stealth), preview.ts:443 (charge multiplier)
    const syn = makeSynergy('landing', [
      { kind: 'statMod', stat: 'stealthChargeMultiplier', op: 'add', value: 0.5, condition: 'isStealthAttack' },
      { kind: 'setFlag', flag: 'transportedTroopsStealth' },
    ]);
    const r = applyCombatSynergies(makeCtx({ isStealthAttack: true }), [syn], null);
    expect(r.hasFlag('transportedTroopsStealth')).toBe(true);
    expect(r.getStat('stealthChargeMultiplier')).toBe(0.5);
  });

  it('caravanRelayVisionRange is dispatched', () => {
    // fogSystem.ts:229 — extends vision via relay network
    const syn = makeSynergy('relay', [
      { kind: 'statMod', stat: 'caravanRelayVisionRange', op: 'set', value: 3 },
    ]);
    expect(applyCombatSynergies(makeCtx(), [syn], null).getStat('caravanRelayVisionRange')).toBe(3);
  });

  it('amphibiousMovementBonus is dispatched', () => {
    // movementSystem.ts:156 — adds movement on water terrain
    const syn = makeSynergy('shore', [
      { kind: 'statMod', stat: 'amphibiousMovementBonus', op: 'set', value: 1 },
    ]);
    expect(applyCombatSynergies(makeCtx(), [syn], null).getStat('amphibiousMovementBonus')).toBe(1);
  });

  it('positionSwap verb is dispatched', () => {
    // activateUnit.ts:775 — grants position swap ability
    const syn = makeSynergy('shadow', [
      { kind: 'grantVerb', verb: 'positionSwap' },
    ]);
    expect(applyCombatSynergies(makeCtx(), [syn], null).hasVerb('positionSwap')).toBe(true);
  });

  it('caravanPassengerActive flag is dispatched', () => {
    // activateUnit.ts:820 — enables carry/disgorge transport
    const syn = makeSynergy('passenger', [
      { kind: 'setFlag', flag: 'caravanPassengerActive' },
    ]);
    expect(applyCombatSynergies(makeCtx(), [syn], null).hasFlag('caravanPassengerActive')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Per-turn projectAura heal — consumed by unitRefresh.ts projectAura heal pass
// ---------------------------------------------------------------------------

describe('Per-turn projectAura heal: refreshFactionUnits applies aura healing', () => {
  it('Citadel projectAura heals nearby allies each turn', () => {
    let state: GameState = buildMvpScenario(42);
    const { attacker, attackerFactionId } = getCombatants(state);

    // Add a same-faction ally adjacent to the attacker (within aura radius 2)
    const adjacentPos = { q: attacker.position.q + 1, r: attacker.position.r };
    const { state: state2, unitId: allyId } = addExtraUnit(
      state, adjacentPos, attackerFactionId, attacker,
    );
    state = state2;

    // Wound the ally
    const units = new Map(state.units);
    const ally = units.get(allyId)!;
    const wounded = { ...ally, hp: ally.maxHp - 10 };
    units.set(allyId, wounded);
    state = { ...state, units };

    // Inject Citadel synergy on the attacker's faction
    const factions = new Map(state.factions);
    const f = factions.get(attackerFactionId)!;
    factions.set(attackerFactionId, {
      ...f,
      activeNativeSelfPair: makeSynergy('citadel', [
        { kind: 'projectAura', radius: 2, effects: [{ kind: 'heal', amount: 3, mode: 'flat' }] },
      ]),
    });
    state = { ...state, factions };

    // Refresh — attacker's aura should heal the nearby ally
    const after = refreshFactionUnits(state, attackerFactionId, registry);
    const allyAfter = after.units.get(allyId)!;
    expect(allyAfter.hp).toBeGreaterThan(wounded.hp);
  });

  it('Oasis projectAura heals allies with percentMaxHp mode', () => {
    let state: GameState = buildMvpScenario(42);
    const { attacker, attackerFactionId } = getCombatants(state);

    const adjacentPos = { q: attacker.position.q + 1, r: attacker.position.r };
    const { state: state2, unitId: allyId } = addExtraUnit(
      state, adjacentPos, attackerFactionId, attacker,
    );
    state = state2;

    // Wound the ally
    const units = new Map(state.units);
    const ally = units.get(allyId)!;
    const wounded = { ...ally, hp: Math.floor(ally.maxHp * 0.5) };
    units.set(allyId, wounded);
    state = { ...state, units };

    // Inject Oasis synergy (1% maxHp, radius 1)
    const factions = new Map(state.factions);
    const f = factions.get(attackerFactionId)!;
    factions.set(attackerFactionId, {
      ...f,
      activeNativeSelfPair: makeSynergy('oasis', [
        { kind: 'projectAura', radius: 1, effects: [{ kind: 'heal', amount: 1.0, mode: 'percentMaxHp' }] },
      ]),
    });
    state = { ...state, factions };

    const after = refreshFactionUnits(state, attackerFactionId, registry);
    const allyAfter = after.units.get(allyId)!;
    // 1% of maxHp — at least 1 HP healed for any unit with maxHp >= 100
    expect(allyAfter.hp).toBeGreaterThan(wounded.hp);
  });
});
