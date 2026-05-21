// ---------------------------------------------------------------------------
// 9 Tribes — Synergy Behavioral Tests (Phase 7)
// ---------------------------------------------------------------------------
//
// One test per pair synergy + one test per emergent rule.
// Each test loads the synergy from the live content catalog, resolves its
// primitive effects through the dispatcher, and asserts a MECHANICAL outcome
// by comparing against a baseline (effects with mismatched context or no
// effects). This proves the synergy's declaration is correct, the dispatcher
// processes it, and conditions gate it properly.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { resolvePrimitives } from '../src/systems/primitiveDispatcher.js';
import { SynergyCombatResult } from '../src/systems/synergyTypes.js';
import type { CombatContext } from '../src/systems/synergyTypes.js';
import type { PrimitiveEffect } from '../src/systems/synergyPrimitives.js';
import {
  getAllPairSynergies,
  getAllEmergentRules,
  getPairSynergyById,
  getEmergentRuleById,
} from '../src/content/synergies/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides: Partial<CombatContext> = {}): CombatContext {
  return {
    attackerId: 'atk',
    defenderId: 'def',
    attackerTags: [],
    defenderTags: [],
    attackerHp: 100,
    defenderHp: 100,
    terrain: 'plains',
    isCharge: false,
    isStealthAttack: false,
    isRetreat: false,
    isStealthed: false,
    position: { x: 0, y: 0 },
    attackerPosition: { x: 0, y: 0 },
    defenderPosition: { x: 1, y: 1 },
    attackerLearnedDomains: [],
    ...overrides,
  };
}

function resolve(
  effects: readonly PrimitiveEffect[],
  ctx: Partial<CombatContext> = {},
): SynergyCombatResult {
  const result = new SynergyCombatResult();
  resolvePrimitives(effects as PrimitiveEffect[], makeContext(ctx), result);
  return result;
}

// Counter for CI guard
let testCounter = 0;
function countTest(): void {
  testCounter++;
}

// ---------------------------------------------------------------------------
// Pair Synergy Tests
// ---------------------------------------------------------------------------

describe('synergy behavioral tests — pair synergies', () => {
  // --- venom+X ---

  it('Toxic Bulwark (venom+fortress)', () => {
    countTest();
    const s = getPairSynergyById('venom+fortress')!;
    const withCtx = resolve(s.effects);
    const without = resolve([]);
    expect(withCtx.getStat('poisonStacks')).toBeGreaterThan(without.getStat('poisonStacks'));
    expect(withCtx.findStatus('poison')).toBeDefined();
  });

  it('Stampeding Death (venom+charge)', () => {
    countTest();
    const s = getPairSynergyById('venom+charge')!;
    const withCtx = resolve(s.effects);
    const without = resolve([]);
    expect(withCtx.getStat('multiplierStackValue')).toBeGreaterThan(without.getStat('multiplierStackValue'));
  });

  it('Poisoned Skirmish (venom+hitrun) — trap spawns on retreat', () => {
    countTest();
    const s = getPairSynergyById('venom+hitrun')!;
    // Trap only spawns when isRetreat
    const noRetreat = resolve(s.effects);
    expect(noRetreat.getStat('poisonTrapDamage')).toBe(2);
    expect(noRetreat.spawns).toHaveLength(0); // condition blocks spawn

    const withRetreat = resolve(s.effects, { isRetreat: true });
    expect(withRetreat.spawns.length).toBeGreaterThan(0);
    expect(withRetreat.spawns[0].effectType).toBe('poisonTrap');
  });

  it('Venomous Tide (venom+tidal_warfare)', () => {
    countTest();
    const s = getPairSynergyById('venom+tidal_warfare')!;
    const withCtx = resolve(s.effects);
    expect(withCtx.hasFlag('contaminateActive')).toBe(true);
  });

  it('Regenerative Venom (venom+nature_healing)', () => {
    countTest();
    const s = getPairSynergyById('venom+nature_healing')!;
    const withCtx = resolve(s.effects);
    const without = resolve([]);
    expect(withCtx.getStat('witheringReduction')).toBeGreaterThan(without.getStat('witheringReduction'));
  });

  it('Death from the Shadows (venom+river_stealth) — instant kill from stealth', () => {
    countTest();
    const s = getPairSynergyById('venom+river_stealth')!;
    const withoutStealth = resolve(s.effects);
    expect(withoutStealth.hasFlag('instantKill')).toBe(false);

    const withStealth = resolve(s.effects, { isStealthAttack: true });
    expect(withStealth.hasFlag('instantKill')).toBe(true);
    expect(withStealth.getStat('poisonStacks')).toBeGreaterThan(0);
  });

  it('Desert Viper (venom+camel_adaptation)', () => {
    countTest();
    const s = getPairSynergyById('venom+camel_adaptation')!;
    const withCtx = resolve(s.effects);
    expect(withCtx.getStat('poisonStacks')).toBeGreaterThan(0);
    expect(withCtx.findStatus('poison')).toBeDefined();
  });

  it('Envenomed Captors (venom+slaving)', () => {
    countTest();
    const s = getPairSynergyById('venom+slaving')!;
    const withCtx = resolve(s.effects);
    expect(withCtx.getStat('capturePoisonDamage')).toBe(3);
    expect(withCtx.getStat('capturePoisonStacks')).toBe(3);
    expect(withCtx.getStat('slaveDamageBonus')).toBeGreaterThan(0);
  });

  it('Venomous Smash (venom+heavy_hitter)', () => {
    countTest();
    const s = getPairSynergyById('venom+heavy_hitter')!;
    const withCtx = resolve(s.effects);
    expect(withCtx.getStat('poisonStacks')).toBeGreaterThan(0);
    expect(withCtx.getStat('armorPiercing')).toBeGreaterThan(0);
  });

  it('Concentrated Venom (venom+venom)', () => {
    countTest();
    const s = getPairSynergyById('venom+venom')!;
    const withCtx = resolve(s.effects);
    expect(withCtx.getStat('toxicSpreadTransferStacks')).toBe(1);
    expect(withCtx.getStat('toxicSpreadTransferRadius')).toBe(1);
  });

  // --- fortress+X ---

  it('Fortress Charge (fortress+charge)', () => {
    countTest();
    const s = getPairSynergyById('fortress+charge')!;
    const withCtx = resolve(s.effects);
    expect(withCtx.hasFlag('chargeShield')).toBe(true);
  });

  it('Fortress Skirmish (fortress+hitrun)', () => {
    countTest();
    const s = getPairSynergyById('fortress+hitrun')!;
    const withCtx = resolve(s.effects);
    const without = resolve([]);
    expect(withCtx.getStat('defense')).toBeGreaterThan(without.getStat('defense'));
    expect(withCtx.getStat('dugInDefense')).toBeGreaterThan(without.getStat('dugInDefense'));
  });

  it('Coastal Fortress (fortress+tidal_warfare)', () => {
    countTest();
    const s = getPairSynergyById('fortress+tidal_warfare')!;
    const withCtx = resolve(s.effects);
    expect(withCtx.getStat('bombardmentRange')).toBe(3);
    expect(withCtx.getStat('bombardmentDamageMultiplier')).toBeGreaterThan(0);
    expect(withCtx.getStat('defense')).toBeGreaterThan(0);
  });

  it('Citadel (fortress+nature_healing)', () => {
    countTest();
    const s = getPairSynergyById('fortress+nature_healing')!;
    const withCtx = resolve(s.effects);
    expect(withCtx.hasFlag('countsAsCity')).toBe(true);
    expect(withCtx.getStat('synergyFlatHeal')).toBeGreaterThan(0);
    expect(withCtx.getStat('defense')).toBeGreaterThan(0);
  });

  it('Hidden Fortress (fortress+river_stealth) — stealth charge multiplier', () => {
    countTest();
    const s = getPairSynergyById('fortress+river_stealth')!;
    const withoutStealth = resolve(s.effects);
    expect(withoutStealth.getStat('stealthChargeMultiplier')).toBe(0);

    const withStealth = resolve(s.effects, { isStealthAttack: true });
    expect(withStealth.getStat('stealthChargeMultiplier')).toBe(2.0);
  });

  it('Desert Stronghold (fortress+camel_adaptation)', () => {
    countTest();
    const s = getPairSynergyById('fortress+camel_adaptation')!;
    const withCtx = resolve(s.effects);
    expect(withCtx.hasFlag('antiDisplacement')).toBe(true);
    expect(withCtx.getStat('defense')).toBeGreaterThan(0);
    expect(withCtx.getStat('mobileStrongholdAlliedDefenseBonus')).toBeGreaterThan(0);
  });

  it('Chained Prisoners (fortress+slaving)', () => {
    countTest();
    const s = getPairSynergyById('fortress+slaving')!;
    const withCtx = resolve(s.effects);
    expect(withCtx.getStat('defense')).toBeGreaterThan(0);
    expect(withCtx.hasFlag('captureEscapePrevented')).toBe(true);
  });

  it('Immovable Object (fortress+heavy_hitter)', () => {
    countTest();
    const s = getPairSynergyById('fortress+heavy_hitter')!;
    const withCtx = resolve(s.effects);
    expect(withCtx.getStat('damageReflection')).toBeGreaterThan(0);
    expect(withCtx.hasFlag('antiDisplacement')).toBe(true);
  });

  it('Layered Defense (fortress+fortress)', () => {
    countTest();
    const s = getPairSynergyById('fortress+fortress')!;
    const withCtx = resolve(s.effects);
    expect(withCtx.hasFlag('formationWallActive')).toBe(true);
    expect(withCtx.getStat('formationWallRangedReduction')).toBe(0.5);
  });

  // --- charge+X ---

  it('Endless Charge (charge+hitrun)', () => {
    countTest();
    const s = getPairSynergyById('charge+hitrun')!;
    const withCtx = resolve(s.effects);
    expect(withCtx.hasFlag('chargeCooldownWaived')).toBe(true);
  });

  it('Tsunami Charge (charge+tidal_warfare)', () => {
    countTest();
    const s = getPairSynergyById('charge+tidal_warfare')!;
    const withCtx = resolve(s.effects);
    expect(withCtx.getStat('knockbackDistance')).toBeGreaterThan(0);
  });

  it('Charging Growth (charge+nature_healing) — heal on charge', () => {
    countTest();
    const s = getPairSynergyById('charge+nature_healing')!;
    const noCharge = resolve(s.effects);
    expect(noCharge.getStat('synergyPercentHealMaxHp')).toBe(0);

    const withCharge = resolve(s.effects, { isCharge: true });
    expect(withCharge.getStat('synergyPercentHealMaxHp')).toBeGreaterThan(0);
  });

  it('Stealth Charge (charge+river_stealth) — combined charge+stealth condition', () => {
    countTest();
    const s = getPairSynergyById('charge+river_stealth')!;
    const neither = resolve(s.effects);
    expect(neither.getStat('damage')).toBe(0);
    expect(neither.hasFlag('chargeCooldownWaived')).toBe(false);

    const both = resolve(s.effects, { isCharge: true, isStealthAttack: true });
    expect(both.getStat('damage')).toBeGreaterThan(0);
    expect(both.hasFlag('chargeCooldownWaived')).toBe(true);
  });

  it('Sandstorm Charge (charge+camel_adaptation)', () => {
    countTest();
    const s = getPairSynergyById('charge+camel_adaptation')!;
    const withCtx = resolve(s.effects);
    expect(withCtx.getStat('sandstormDamage')).toBe(2);
    expect(withCtx.getStat('aoeDamage')).toBeGreaterThan(0);
    expect(withCtx.getStat('knockbackDistance')).toBeGreaterThan(0);
  });

  it('Press-Ganged Cavalry (charge+slaving) — capture on charge', () => {
    countTest();
    const s = getPairSynergyById('charge+slaving')!;
    const noCharge = resolve(s.effects);
    expect(noCharge.getStat('chargeCaptureChance')).toBe(0);

    const withCharge = resolve(s.effects, { isCharge: true });
    expect(withCharge.getStat('chargeCaptureChance')).toBe(0.3);
    expect(withCharge.getStat('knockbackDistance')).toBeGreaterThan(0);
  });

  it('Unstoppable Momentum (charge+heavy_hitter)', () => {
    countTest();
    const s = getPairSynergyById('charge+heavy_hitter')!;
    const withCtx = resolve(s.effects);
    expect(withCtx.getStat('stunDuration')).toBeGreaterThan(0);
    expect(withCtx.findStatus('stun')).toBeDefined();
  });

  it('Stampede Horde (charge+charge)', () => {
    countTest();
    const s = getPairSynergyById('charge+charge')!;
    const withCtx = resolve(s.effects);
    expect(withCtx.getStat('formationPinballCollisionDamage')).toBe(4);
    expect(withCtx.getStat('stunDuration')).toBeGreaterThan(0);
  });

  // --- hitrun+X ---

  it('Coastal Raid (hitrun+tidal_warfare)', () => {
    countTest();
    const s = getPairSynergyById('hitrun+tidal_warfare')!;
    const withCtx = resolve(s.effects);
    expect(withCtx.hasFlag('beachRaidRetreatToWater')).toBe(true);
    expect(withCtx.getStat('beachRaidDamageBonus')).toBeGreaterThan(0);
  });

  it('Healing Retreat (hitrun+nature_healing)', () => {
    countTest();
    const s = getPairSynergyById('hitrun+nature_healing')!;
    const withCtx = resolve(s.effects);
    expect(withCtx.getStat('vampiricStrikeHealPercent')).toBe(1.0);
  });

  it('Shadow Step (hitrun+river_stealth) — re-stealth on retreat', () => {
    countTest();
    const s = getPairSynergyById('hitrun+river_stealth')!;
    const noRetreat = resolve(s.effects);
    expect(noRetreat.hasFlag('reEnterStealthAfterCombat')).toBe(false);

    const withRetreat = resolve(s.effects, { isRetreat: true });
    expect(withRetreat.hasFlag('reEnterStealthAfterCombat')).toBe(true);
  });

  it('Desert Ghost (hitrun+camel_adaptation) — ghost pass on retreat', () => {
    countTest();
    const s = getPairSynergyById('hitrun+camel_adaptation')!;
    const noRetreat = resolve(s.effects);
    expect(noRetreat.hasFlag('ghostPassActive')).toBe(false);

    const withRetreat = resolve(s.effects, { isRetreat: true });
    expect(withRetreat.hasFlag('ghostPassActive')).toBe(true);
  });

  it('Raid Retreat (hitrun+slaving)', () => {
    countTest();
    const s = getPairSynergyById('hitrun+slaving')!;
    const withCtx = resolve(s.effects);
    expect(withCtx.getStat('navalCaptureBonus')).toBeGreaterThan(0);
  });

  it('Heavy Skirmish (hitrun+heavy_hitter)', () => {
    countTest();
    const s = getPairSynergyById('hitrun+heavy_hitter')!;
    const withCtx = resolve(s.effects);
    expect(withCtx.hasFlag('fightingRetreatFreeStrike')).toBe(true);
    expect(withCtx.getStat('fightingRetreatDamageMultiplier')).toBeGreaterThan(0);
  });

  it('Swarm Tactics (hitrun+hitrun)', () => {
    countTest();
    const s = getPairSynergyById('hitrun+hitrun')!;
    const withCtx = resolve(s.effects);
    expect(withCtx.getStat('formationFocusBonus')).toBeGreaterThan(0);
    expect(withCtx.hasFlag('formationFocusIgnoresDefense')).toBe(true);
  });

  // --- tidal_warfare+X ---

  it('Tidal Restoration (tidal_warfare+nature_healing)', () => {
    countTest();
    const s = getPairSynergyById('tidal_warfare+nature_healing')!;
    const withCtx = resolve(s.effects);
    expect(withCtx.getStat('tidalCleanseHealPerTurn')).toBe(4);
  });

  it('Silent Landing (tidal_warfare+river_stealth)', () => {
    countTest();
    const s = getPairSynergyById('tidal_warfare+river_stealth')!;
    const noStealth = resolve(s.effects);
    expect(noStealth.getStat('stealthChargeMultiplier')).toBe(0);

    const withStealth = resolve(s.effects, { isStealthAttack: true });
    expect(withStealth.getStat('stealthChargeMultiplier')).toBeGreaterThan(0);
    expect(withStealth.hasFlag('transportedTroopsStealth')).toBe(true);
  });

  it('Shoreline Nomads (tidal_warfare+camel_adaptation)', () => {
    countTest();
    const s = getPairSynergyById('tidal_warfare+camel_adaptation')!;
    const withCtx = resolve(s.effects);
    expect(withCtx.getStat('amphibiousMovementBonus')).toBeGreaterThan(0);
  });

  it('Naval Slave Raid (tidal_warfare+slaving) — capture on water', () => {
    countTest();
    const s = getPairSynergyById('tidal_warfare+slaving')!;
    const noWater = resolve(s.effects);
    expect(noWater.getStat('navalCaptureBonus')).toBe(0);

    const withWater = resolve(s.effects, { terrain: 'coast' });
    expect(withWater.getStat('navalCaptureBonus')).toBe(0.3);
  });

  it('Ironclad Tide (tidal_warfare+heavy_hitter) — ram damage on water', () => {
    countTest();
    const s = getPairSynergyById('tidal_warfare+heavy_hitter')!;
    const noWater = resolve(s.effects);
    expect(noWater.getStat('heavyNavalRamDamage')).toBe(0);

    const withWater = resolve(s.effects, { terrain: 'coast' });
    expect(withWater.getStat('heavyNavalRamDamage')).toBe(2);
  });

  it('Armada (tidal_warfare+tidal_warfare)', () => {
    countTest();
    const s = getPairSynergyById('tidal_warfare+tidal_warfare')!;
    const withCtx = resolve(s.effects);
    expect(withCtx.getStat('formationChainBonus')).toBe(1);
  });

  // --- nature_healing+X ---

  it("Nature's Veil (nature_healing+river_stealth)", () => {
    countTest();
    const s = getPairSynergyById('nature_healing+river_stealth')!;
    const withCtx = resolve(s.effects);
    expect(withCtx.getStat('stealthAuraShareRadius')).toBeGreaterThan(0);
  });

  it('Oasis (nature_healing+camel_adaptation) — heal aura', () => {
    countTest();
    const s = getPairSynergyById('nature_healing+camel_adaptation')!;
    const withCtx = resolve(s.effects);
    expect(withCtx.getStat('synergyPercentHealMaxHp')).toBeGreaterThan(0);
  });

  it('Forced Labor (nature_healing+slaving)', () => {
    countTest();
    const s = getPairSynergyById('nature_healing+slaving')!;
    const withCtx = resolve(s.effects);
    expect(withCtx.getStat('slaveEconomyHealPerTurn')).toBe(4);
    expect(withCtx.getStat('slaveEconomyResourceBonus')).toBe(1);
  });

  it('Berserker Regen (nature_healing+heavy_hitter)', () => {
    countTest();
    const s = getPairSynergyById('nature_healing+heavy_hitter')!;
    const withCtx = resolve(s.effects);
    expect(withCtx.getStat('heavyRegenPercent')).toBeGreaterThan(0);
  });

  it('Life Bloom (nature_healing+nature_healing)', () => {
    countTest();
    const s = getPairSynergyById('nature_healing+nature_healing')!;
    const withCtx = resolve(s.effects);
    expect(withCtx.getStat('bloomPulseHeal')).toBe(4);
    expect(withCtx.getStat('bloomPulseSelfHeal')).toBe(6);
    expect(withCtx.getStat('bloomPulseAuraRadius')).toBe(3);
    expect(withCtx.getStat('bloomPulseMovementBonus')).toBe(1);
  });

  // --- river_stealth+X ---

  it('Mirage (river_stealth+camel_adaptation) — permanent stealth in desert', () => {
    countTest();
    const s = getPairSynergyById('river_stealth+camel_adaptation')!;
    const noDesert = resolve(s.effects);
    const desertList = noDesert.getList('emergentPermanentStealthTerrains');
    expect(desertList).toHaveLength(0);

    const withDesert = resolve(s.effects, { terrain: 'desert' });
    const terrains = withDesert.getList('emergentPermanentStealthTerrains');
    expect(terrains.length).toBeGreaterThan(0);
    expect(withDesert.spawns.length).toBeGreaterThan(0);
    expect(withDesert.spawns[0].effectType).toBe('decoy');
  });

  it('Ambush Captors (river_stealth+slaving) — capture from stealth', () => {
    countTest();
    const s = getPairSynergyById('river_stealth+slaving')!;
    const noStealth = resolve(s.effects);
    expect(noStealth.getStat('stealthCaptureBonus')).toBe(0);

    const withStealth = resolve(s.effects, { isStealthAttack: true });
    expect(withStealth.getStat('stealthCaptureBonus')).toBe(0.4);
  });

  it("Assassin's Blow (river_stealth+heavy_hitter) — armor pierce from stealth", () => {
    countTest();
    const s = getPairSynergyById('river_stealth+heavy_hitter')!;
    const noStealth = resolve(s.effects);
    expect(noStealth.getStat('armorPiercing')).toBe(0);

    const withStealth = resolve(s.effects, { isStealthAttack: true });
    expect(withStealth.getStat('armorPiercing')).toBe(1.0);
  });

  it('Shadow Network (river_stealth+river_stealth)', () => {
    countTest();
    const s = getPairSynergyById('river_stealth+river_stealth')!;
    const withCtx = resolve(s.effects);
    expect(withCtx.hasVerb('positionSwap')).toBe(true);
  });

  // --- camel_adaptation+X ---

  it('Desert Slave Train (camel_adaptation+slaving)', () => {
    countTest();
    const s = getPairSynergyById('camel_adaptation+slaving')!;
    const withCtx = resolve(s.effects);
    expect(withCtx.hasFlag('caravanPassengerActive')).toBe(true);
  });

  it('Sand Titan (camel_adaptation+heavy_hitter) — sandstorm aura in desert', () => {
    countTest();
    const s = getPairSynergyById('camel_adaptation+heavy_hitter')!;
    const noDesert = resolve(s.effects);
    expect(noDesert.getStat('sandstormAuraRadius')).toBe(0);

    const withDesert = resolve(s.effects, { terrain: 'desert' });
    expect(withDesert.getStat('sandstormAuraRadius')).toBe(2);
    expect(withDesert.getStat('sandstormAuraDebuff')).toBeGreaterThan(0);
  });

  it('Nomad Network (camel_adaptation+camel_adaptation)', () => {
    countTest();
    const s = getPairSynergyById('camel_adaptation+camel_adaptation')!;
    const withCtx = resolve(s.effects);
    expect(withCtx.getStat('caravanRelayVisionRange')).toBe(3);
  });

  // --- slaving+X ---

  it('Slave Army (slaving+slaving)', () => {
    countTest();
    const s = getPairSynergyById('slaving+slaving')!;
    const withCtx = resolve(s.effects);
    expect(withCtx.getStat('slaveHordeDamageBonus')).toBeGreaterThan(0);
    expect(withCtx.getStat('damage')).toBeGreaterThan(0);
  });

  it("Overseer's Rule (slaving+heavy_hitter)", () => {
    countTest();
    const s = getPairSynergyById('slaving+heavy_hitter')!;
    const withCtx = resolve(s.effects);
    expect(withCtx.getStat('slaveCoercionDamageBonus')).toBe(0.5);
  });

  // --- heavy_hitter+X ---

  it('Crushing Weight (heavy_hitter+heavy_hitter)', () => {
    countTest();
    const s = getPairSynergyById('heavy_hitter+heavy_hitter')!;
    const withCtx = resolve(s.effects);
    expect(withCtx.getStat('formationPinballCollisionDamage')).toBe(4);
    expect(withCtx.getStat('stunDuration')).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Emergent Rule Tests
// ---------------------------------------------------------------------------

describe('synergy behavioral tests — emergent rules', () => {
  it('Terrain Lord', () => {
    countTest();
    const rule = getEmergentRuleById('terrain_lord')!;
    // multiply on 0 base = 0; verify the condition gates correctly
    const noCharge = new SynergyCombatResult();
    noCharge.stats.set('damage', 10);
    resolvePrimitives(rule.effects as PrimitiveEffect[], makeContext(), noCharge);
    expect(noCharge.getStat('damage')).toBe(10); // condition blocked

    const withCharge = new SynergyCombatResult();
    withCharge.stats.set('damage', 10);
    resolvePrimitives(rule.effects as PrimitiveEffect[], makeContext({ isCharge: true }), withCharge);
    expect(withCharge.getStat('damage')).toBeGreaterThan(10); // multiplied by 1.5
  });

  it('Paladin', () => {
    countTest();
    const rule = getEmergentRuleById('paladin')!;
    const withCtx = resolve(rule.effects);
    expect(withCtx.getStat('emergentSustainHealPercent')).toBe(0.5);
    expect(withCtx.getStat('emergentSustainMinHp')).toBe(1);
    expect(withCtx.getStat('emergentSmiteBonus')).toBeGreaterThan(0);
  });

  it('Terrain Assassin', () => {
    countTest();
    const rule = getEmergentRuleById('terrain_assassin')!;
    const noStealth = resolve(rule.effects);
    expect(noStealth.getList('emergentPermanentStealthTerrains')).toHaveLength(0);

    const withStealth = resolve(rule.effects, { isStealthAttack: true });
    const terrains = withStealth.getList('emergentPermanentStealthTerrains');
    expect(terrains.length).toBeGreaterThan(0);
  });

  it('Standing Stone', () => {
    countTest();
    const rule = getEmergentRuleById('standing_stone')!;
    const withCtx = resolve(rule.effects);
    expect(withCtx.getStat('defense')).toBeGreaterThan(0);
    expect(withCtx.hasFlag('antiDisplacement')).toBe(true);
  });

  it('Ghost Army', () => {
    countTest();
    const rule = getEmergentRuleById('ghost_army')!;
    // Ghost Army has empty effects array — all behavior is in EMERGENT_PARAMS
    const withCtx = resolve(rule.effects);
    expect(rule.effects).toHaveLength(0);
    // The test verifies the rule exists and its effects are properly empty
    expect(rule.id).toBe('ghost_army');
  });

  it('Juggernaut — undying + ZoC ignore + domain signatures', () => {
    countTest();
    const rule = getEmergentRuleById('juggernaut')!;
    const withCtx = resolve(rule.effects);
    expect(withCtx.hasFlag('emergentUndying')).toBe(true);
    expect(withCtx.hasFlag('emergentIgnoreZoc')).toBe(true);
    // Domain-signature effects have condition: 'domain:X' — gated at runtime
    expect(rule.effects.length).toBeGreaterThan(2);
  });

  it('Slave Empire', () => {
    countTest();
    const rule = getEmergentRuleById('slave_empire')!;
    const withCtx = resolve(rule.effects);
    expect(withCtx.getStat('emergentCaptureBonus')).toBe(0.2);
  });

  it('Raid Camp', () => {
    countTest();
    const rule = getEmergentRuleById('raid_camp')!;
    const withCtx = resolve(rule.effects);
    expect(withCtx.getStat('emergentCaptureBonus')).toBe(0.3);
  });

  it('Poison Shadow — poison on stealth, cloud on retreat', () => {
    countTest();
    const rule = getEmergentRuleById('poison_shadow')!;
    const noStealthNoRetreat = resolve(rule.effects);
    expect(noStealthNoRetreat.getStat('poisonStacks')).toBe(0);
    expect(noStealthNoRetreat.spawns).toHaveLength(0);

    const withStealth = resolve(rule.effects, { isStealthAttack: true });
    expect(withStealth.getStat('poisonStacks')).toBeGreaterThan(0);

    const withRetreat = resolve(rule.effects, { isRetreat: true });
    expect(withRetreat.spawns.length).toBeGreaterThan(0);
    expect(withRetreat.spawns[0].effectType).toBe('poisonCloud');
  });

  it('Iron Turtle — reflection + displacement immune + ZoC ignore', () => {
    countTest();
    const rule = getEmergentRuleById('iron_turtle')!;
    const withCtx = resolve(rule.effects);
    expect(withCtx.getStat('damageReflection')).toBe(0.5);
    expect(withCtx.hasFlag('antiDisplacement')).toBe(true);
    expect(withCtx.hasFlag('emergentIgnoreZoc')).toBe(true);
  });

  it('Many-Faced — mode select picks a stance', () => {
    countTest();
    const rule = getEmergentRuleById('many_faced')!;
    // Default context → phantom mode (ZoC ignore)
    const phantom = resolve(rule.effects);
    expect(phantom.hasFlag('emergentIgnoreZoc')).toBe(true);

    // Charge context → predator mode (damage multiply)
    const predator = new SynergyCombatResult();
    predator.stats.set('damage', 10);
    resolvePrimitives(rule.effects as PrimitiveEffect[], makeContext({ isCharge: true }), predator);
    expect(predator.getStat('damage')).toBeGreaterThan(10);

    // Retreat context → bulwark mode (defense + reflection)
    const bulwark = resolve(rule.effects, { isRetreat: true });
    expect(bulwark.getStat('defense')).toBeGreaterThan(0);
    expect(bulwark.getStat('damageReflection')).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// CI Guard
// ---------------------------------------------------------------------------

describe('synergy behavioral tests — CI guard', () => {
  it('synergy behavioral test count matches content catalog', () => {
    const pairCount = getAllPairSynergies().length;
    const emergentCount = getAllEmergentRules().length;
    const expectedTotal = pairCount + emergentCount;
    expect(testCounter).toBe(expectedTotal);
  });
});
