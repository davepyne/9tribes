// Tests for the 17 previously unwired pair synergies.
// These verify that synergy primitive fields are correctly dispatched AND consumed
// by downstream systems.

import { applyCombatSynergies, type CombatContext } from '../src/systems/synergyEffects';
import type { ActiveSynergy } from '../src/systems/synergyEngine';
import type { PrimitiveEffect } from '../src/systems/synergyPrimitives';
import { makeEmptyResult } from '../src/systems/synergyEffects';

function makeContext(overrides: Partial<CombatContext> = {}): CombatContext {
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
    position: { x: 0, y: 0 },
    attackerPosition: { x: 0, y: 0 },
    defenderPosition: { x: 1, y: 0 },
    attackerLearnedDomains: [],
    ...overrides,
  };
}

function makeSynergy(id: string, effects: PrimitiveEffect[]): ActiveSynergy {
  return {
    pairId: id,
    name: id,
    domains: ['test', 'test'],
    effects,
  };
}

describe('Unwired synergy dispatch verification', () => {
  describe('Group 1: Knockback collision', () => {
    it('venom+venom (Concentrated Venom) sets toxicSpread fields', () => {
      const syn = makeSynergy('venom+venom', [
        { kind: 'statMod', stat: 'toxicSpreadTransferStacks', op: 'set', value: 1 },
        { kind: 'statMod', stat: 'toxicSpreadTransferRadius', op: 'set', value: 1 },
      ] as PrimitiveEffect[]);
      const result = applyCombatSynergies(makeContext(), [syn], null);
      expect(result.getStat('toxicSpreadTransferStacks')).toBe(1);
      expect(result.getStat('toxicSpreadTransferRadius')).toBe(1);
    });

    it('charge+charge (Stampede Horde) sets formationPinballCollisionDamage', () => {
      const syn = makeSynergy('charge+charge', [
        { kind: 'statMod', stat: 'formationPinballCollisionDamage', op: 'set', value: 4 },
        { kind: 'applyStatus', status: 'stun', duration: 1 },
      ] as PrimitiveEffect[]);
      const result = applyCombatSynergies(makeContext(), [syn], null);
      expect(result.getStat('formationPinballCollisionDamage')).toBe(4);
      expect(result.getStat('stunDuration')).toBe(1);
    });

    it('heavy_hitter+heavy_hitter (Crushing Weight) sets formationPinballCollisionDamage', () => {
      const syn = makeSynergy('heavy_hitter+heavy_hitter', [
        { kind: 'statMod', stat: 'formationPinballCollisionDamage', op: 'set', value: 4 },
        { kind: 'applyStatus', status: 'stun', duration: 1 },
      ] as PrimitiveEffect[]);
      const result = applyCombatSynergies(makeContext(), [syn], null);
      expect(result.getStat('formationPinballCollisionDamage')).toBe(4);
      expect(result.getStat('stunDuration')).toBe(1);
    });
  });

  describe('Group 2: Hit-and-run / movement', () => {
    it('hitrun+tidal_warfare (Coastal Raid) sets beachRaid fields', () => {
      const syn = makeSynergy('hitrun+tidal_warfare', [
        { kind: 'statMod', stat: 'beachRaidDamageBonus', op: 'set', value: 0.25 },
        { kind: 'grantVerb', verb: 'retreatToWater' },
        { kind: 'statMod', stat: 'damage', op: 'set', value: 0.25 },
      ] as PrimitiveEffect[]);
      const result = applyCombatSynergies(makeContext(), [syn], null);
      expect(result.getStat('beachRaidDamageBonus')).toBe(0.25);
      expect(result.hasFlag('beachRaidRetreatToWater')).toBe(true);
      expect(result.getStat('damage')).toBe(0.25);
    });

    it('hitrun+camel_adaptation (Desert Ghost) sets ghostPassActive on retreat', () => {
      const syn = makeSynergy('hitrun+camel_adaptation', [
        { kind: 'setFlag', flag: 'ghostPassActive', condition: 'isRetreat' },
      ] as PrimitiveEffect[]);
      const result = applyCombatSynergies(makeContext({ isRetreat: true }), [syn], null);
      expect(result.hasFlag('ghostPassActive')).toBe(true);
    });

    it('Desert Ghost does NOT set ghostPassActive when not retreating', () => {
      const syn = makeSynergy('hitrun+camel_adaptation', [
        { kind: 'setFlag', flag: 'ghostPassActive', condition: 'isRetreat' },
      ] as PrimitiveEffect[]);
      const result = applyCombatSynergies(makeContext({ isRetreat: false }), [syn], null);
      expect(result.hasFlag('ghostPassActive')).toBe(false);
    });
  });

  describe('Group 3: Fortification / zone defense', () => {
    it('fortress+fortress (Layered Defense) sets formationWall fields', () => {
      const syn = makeSynergy('fortress+fortress', [
        { kind: 'setFlag', flag: 'formationWallActive' },
        { kind: 'statMod', stat: 'formationWallRangedReduction', op: 'set', value: 0.5 },
      ] as PrimitiveEffect[]);
      const result = applyCombatSynergies(makeContext(), [syn], null);
      expect(result.hasFlag('formationWallActive')).toBe(true);
      expect(result.getStat('formationWallRangedReduction')).toBe(0.5);
    });

    it('fortress+camel_adaptation (Desert Stronghold) sets mobileStronghold fields', () => {
      const syn = makeSynergy('fortress+camel_adaptation', [
        { kind: 'setFlag', flag: 'mobileStrongholdFortUp' },
        { kind: 'statMod', stat: 'mobileStrongholdDefenseBonus', op: 'set', value: 0.75 },
        { kind: 'statMod', stat: 'mobileStrongholdAlliedDefenseBonus', op: 'set', value: 0.25 },
        { kind: 'statMod', stat: 'defense', op: 'add', value: 0.75 },
        { kind: 'preventAction', action: 'displacement' },
      ] as PrimitiveEffect[]);
      const result = applyCombatSynergies(makeContext(), [syn], null);
      expect(result.hasFlag('mobileStrongholdFortUp')).toBe(true);
      expect(result.getStat('mobileStrongholdDefenseBonus')).toBe(0.75);
      expect(result.getStat('mobileStrongholdAlliedDefenseBonus')).toBe(0.25);
      expect(result.getStat('defense')).toBe(0.75);
      expect(result.hasFlag('antiDisplacement')).toBe(true);
    });

    it('fortress+nature_healing (Citadel) sets countsAsCity and heals', () => {
      const syn = makeSynergy('fortress+nature_healing', [
        { kind: 'projectAura', radius: 2, effects: [
          { kind: 'heal', amount: 3, mode: 'flat' },
        ] },
        { kind: 'setFlag', flag: 'countsAsCity' },
        { kind: 'statMod', stat: 'defense', op: 'add', value: 0.5 },
      ] as PrimitiveEffect[]);
      const result = applyCombatSynergies(makeContext(), [syn], null);
      expect(result.hasFlag('countsAsCity')).toBe(true);
      expect(result.getStat('defense')).toBe(0.5);
      expect(result.getStat('synergyFlatHeal')).toBe(3);
    });
  });

  describe('Group 4: Turn effects / healing', () => {
    it('tidal_warfare+nature_healing (Tidal Restoration) sets tidalCleanseHealPerTurn', () => {
      const syn = makeSynergy('tidal_warfare+nature_healing', [
        { kind: 'statMod', stat: 'tidalCleanseHealPerTurn', op: 'set', value: 4 },
      ] as PrimitiveEffect[]);
      const result = applyCombatSynergies(makeContext(), [syn], null);
      expect(result.getStat('tidalCleanseHealPerTurn')).toBe(4);
    });

    it('nature_healing+nature_healing (Life Bloom) sets bloom pulse fields', () => {
      const syn = makeSynergy('nature_healing+nature_healing', [
        { kind: 'statMod', stat: 'bloomPulseHeal', op: 'set', value: 4 },
        { kind: 'statMod', stat: 'bloomPulseSelfHeal', op: 'set', value: 6 },
        { kind: 'statMod', stat: 'bloomPulseAuraRadius', op: 'set', value: 3 },
        { kind: 'statMod', stat: 'bloomPulseMovementBonus', op: 'set', value: 1 },
      ] as PrimitiveEffect[]);
      const result = applyCombatSynergies(makeContext(), [syn], null);
      expect(result.getStat('bloomPulseHeal')).toBe(4);
      expect(result.getStat('bloomPulseSelfHeal')).toBe(6);
      expect(result.getStat('bloomPulseAuraRadius')).toBe(3);
      expect(result.getStat('bloomPulseMovementBonus')).toBe(1);
    });

    it('nature_healing+slaving (Forced Labor) sets slaveEconomy fields', () => {
      const syn = makeSynergy('nature_healing+slaving', [
        { kind: 'statMod', stat: 'slaveEconomyHealPerTurn', op: 'set', value: 4 },
        { kind: 'statMod', stat: 'slaveEconomyResourceBonus', op: 'set', value: 1 },
      ] as PrimitiveEffect[]);
      const result = applyCombatSynergies(makeContext(), [syn], null);
      expect(result.getStat('slaveEconomyHealPerTurn')).toBe(4);
      expect(result.getStat('slaveEconomyResourceBonus')).toBe(1);
    });
  });

  describe('Group 5: Fog / stealth / vision', () => {
    it('nature_healing+river_stealth (Nature\'s Veil) sets stealthAuraShareRadius', () => {
      const syn = makeSynergy('nature_healing+river_stealth', [
        { kind: 'statMod', stat: 'stealthAuraShareRadius', op: 'set', value: 1 },
      ] as PrimitiveEffect[]);
      const result = applyCombatSynergies(makeContext(), [syn], null);
      expect(result.getStat('stealthAuraShareRadius')).toBe(1);
    });

    it('tidal_warfare+river_stealth (Silent Landing) sets transportedTroopsStealth', () => {
      const syn = makeSynergy('tidal_warfare+river_stealth', [
        { kind: 'statMod', stat: 'stealthChargeMultiplier', op: 'add', value: 0.5, condition: 'isStealthAttack' },
        { kind: 'setFlag', flag: 'transportedTroopsStealth' },
      ] as PrimitiveEffect[]);
      const result = applyCombatSynergies(makeContext({ isStealthAttack: true }), [syn], null);
      expect(result.hasFlag('transportedTroopsStealth')).toBe(true);
      expect(result.getStat('stealthChargeMultiplier')).toBe(0.5);
    });

    it('camel_adaptation+camel_adaptation (Nomad Network) sets caravanRelayVisionRange', () => {
      const syn = makeSynergy('camel_adaptation+camel_adaptation', [
        { kind: 'statMod', stat: 'caravanRelayVisionRange', op: 'set', value: 3 },
      ] as PrimitiveEffect[]);
      const result = applyCombatSynergies(makeContext(), [syn], null);
      expect(result.getStat('caravanRelayVisionRange')).toBe(3);
    });
  });

  describe('Group 6: Movement bonus', () => {
    it('tidal_warfare+camel_adaptation (Shoreline Nomads) sets amphibiousMovementBonus', () => {
      const syn = makeSynergy('tidal_warfare+camel_adaptation', [
        { kind: 'statMod', stat: 'amphibiousMovementBonus', op: 'set', value: 1 },
      ] as PrimitiveEffect[]);
      const result = applyCombatSynergies(makeContext(), [syn], null);
      expect(result.getStat('amphibiousMovementBonus')).toBe(1);
    });
  });

  describe('Group 7: Unit abilities', () => {
    it('river_stealth+river_stealth (Shadow Network) sets positionSwapAvailable', () => {
      const syn = makeSynergy('river_stealth+river_stealth', [
        { kind: 'grantVerb', verb: 'positionSwap' },
      ] as PrimitiveEffect[]);
      const result = applyCombatSynergies(makeContext(), [syn], null);
      expect(result.hasFlag('positionSwapAvailable')).toBe(true);
    });

    it('camel_adaptation+slaving (Desert Slave Train) sets caravanPassengerActive', () => {
      const syn = makeSynergy('camel_adaptation+slaving', [
        { kind: 'grantVerb', verb: 'carryCaptured' },
      ] as PrimitiveEffect[]);
      const result = applyCombatSynergies(makeContext(), [syn], null);
      expect(result.hasFlag('caravanPassengerActive')).toBe(true);
    });
  });
});

describe('makeEmptyResult defaults', () => {
  it('all unwired stat/flag entries default to zero/false', () => {
    const result = makeEmptyResult();
    expect(result.getStat('toxicSpreadTransferRadius')).toBe(0);
    expect(result.getStat('toxicSpreadTransferStacks')).toBe(0);
    expect(result.getStat('formationPinballCollisionDamage')).toBe(0);
    expect(result.getStat('beachRaidDamageBonus')).toBe(0);
    expect(result.hasFlag('beachRaidRetreatToWater')).toBe(false);
    expect(result.hasFlag('ghostPassActive')).toBe(false);
    expect(result.hasFlag('formationWallActive')).toBe(false);
    expect(result.getStat('formationWallRangedReduction')).toBe(0);
    expect(result.hasFlag('mobileStrongholdFortUp')).toBe(false);
    expect(result.getStat('mobileStrongholdDefenseBonus')).toBe(0);
    expect(result.getStat('mobileStrongholdAlliedDefenseBonus')).toBe(0);
    expect(result.hasFlag('countsAsCity')).toBe(false);
    expect(result.getStat('tidalCleanseHealPerTurn')).toBe(0);
    expect(result.getStat('bloomPulseHeal')).toBe(0);
    expect(result.getStat('bloomPulseSelfHeal')).toBe(0);
    expect(result.getStat('bloomPulseAuraRadius')).toBe(0);
    expect(result.getStat('bloomPulseMovementBonus')).toBe(0);
    expect(result.getStat('slaveEconomyHealPerTurn')).toBe(0);
    expect(result.getStat('slaveEconomyResourceBonus')).toBe(0);
    expect(result.getStat('stealthAuraShareRadius')).toBe(0);
    expect(result.hasFlag('transportedTroopsStealth')).toBe(false);
    expect(result.getStat('caravanRelayVisionRange')).toBe(0);
    expect(result.getStat('amphibiousMovementBonus')).toBe(0);
    expect(result.hasFlag('positionSwapAvailable')).toBe(false);
    expect(result.hasFlag('caravanPassengerActive')).toBe(false);
  });
});
