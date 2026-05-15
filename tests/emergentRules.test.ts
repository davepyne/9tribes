import {
  applyCombatSynergies,
  type CombatContext,
} from '../src/systems/synergyEffects';
import type { ActiveSynergy, ActiveTripleStack, EmergentRuleConfig } from '../src/systems/synergyEngine';
import type { PrimitiveEffect } from '../src/systems/synergyPrimitives';

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
    ...overrides,
  };
}

function makeEmergentTriple(
  effectType: string,
  effectFields: Record<string, unknown> = {},
  effects: PrimitiveEffect[] = [],
): ActiveTripleStack {
  const rule: EmergentRuleConfig = {
    id: `test_${effectType}`,
    name: `Test ${effectType}`,
    condition: 'default',
    effect: { type: effectType, description: 'test', ...effectFields } as never,
    effects,
    friendlyFlavor: 'test flavor',
    enemyFlavor: 'test flavor',
  };
  return {
    domains: ['domain-a', 'domain-b', 'domain-c'],
    pairs: [],
    emergentRule: rule,
    name: `Test ${effectType}`,
  };
}

describe('Phase 4: Emergent rule wiring', () => {
  describe('E5 — Paladin', () => {
    it('stores healPercentOfDamage and minHp from emergent rule primitives', () => {
      const triple = makeEmergentTriple('paladin', {
        healPercentOfDamage: 0.50,
        minHp: 1,
        smiteBonusAtFullHp: 1.0,
      }, [
        { kind: 'statMod', stat: 'emergentSustainHealPercent', op: 'set', value: 0.50 },
        { kind: 'statMod', stat: 'emergentSustainMinHp', op: 'set', value: 1 },
        { kind: 'statMod', stat: 'emergentSmiteBonus', op: 'set', value: 1.0 },
      ] as PrimitiveEffect[]);
      const ctx = makeContext();
      const result = applyCombatSynergies(ctx, [], triple);

      expect(result.emergentSustainHealPercent).toBe(0.50);
      expect(result.emergentSustainMinHp).toBe(1);
      expect(result.additionalEffects).toContain('statMod_emergentSustainHealPercent_set_0.5');
    });

    it('defaults to zero when no sustain emergent is active', () => {
      const ctx = makeContext();
      const result = applyCombatSynergies(ctx, [], null);
      expect(result.emergentSustainHealPercent).toBe(0);
      expect(result.emergentSustainMinHp).toBe(0);
    });
  });

  describe('E2 — Terrain Assassin (permanent_stealth)', () => {
    it('permanent stealth terrains not settable via primitives — handled at zone level', () => {
      // permanent_stealth uses empty effects array; terrain list is read from
      // EMERGENT_PARAMS.terrain_assassin.terrainTypes by the zone-effect system, not by
      // applyCombatSynergies. The combat path does not populate
      // emergentPermanentStealthTerrains.
      const triple = makeEmergentTriple('permanent_stealth', {
        terrainTypes: ['desert', 'coast', 'hill'],
      });
      const ctx = makeContext();
      const result = applyCombatSynergies(ctx, [], triple);

      // With empty effects, no combat-level changes are applied.
      // The terrain list is consumed by zone-level code.
      expect(result.emergentPermanentStealthTerrains).toEqual([]);
    });

    it('defaults to empty array when no permanent_stealth emergent is active', () => {
      const ctx = makeContext();
      const result = applyCombatSynergies(ctx, [], null);
      expect(result.emergentPermanentStealthTerrains).toEqual([]);
    });
  });

  describe('E1 — Standing Stone (standing_stone)', () => {
    it('adds defense bonus and sets antiDisplacement via primitives', () => {
      const triple = makeEmergentTriple('standing_stone', {
        anchoredDefenseBonus: 0.30,
        anchoredAuraRadius: 3,
        damageSharePercent: 0.50,
        tarPitMovementPenalty: 1,
        anchoredAdjacentDamage: 2,
      }, [
        { kind: 'statMod', stat: 'defense', op: 'add', value: 0.30 },
        { kind: 'preventAction', action: 'displacement' },
      ] as PrimitiveEffect[]);
      const ctx = makeContext();
      const result = applyCombatSynergies(ctx, [], triple);

      expect(result.defense).toBe(0.30);
      expect(result.antiDisplacement).toBe(true);
      expect(result.additionalEffects).toContain('statMod_defense_add_0.3');
    });

    it('defaults: no defense bonus, no antiDisplacement', () => {
      const ctx = makeContext();
      const result = applyCombatSynergies(ctx, [], null);
      expect(result.defense).toBe(0);
      expect(result.antiDisplacement).toBe(false);
    });
  });

  describe('E3 — Slave Empire (slave_empire)', () => {
    it('stores capture chance bonus via primitive', () => {
      const triple = makeEmergentTriple('slave_empire', {
        captureAuraRadius: 2,
        captureChanceBonus: 0.20,
        slaveProductionBonus: 0.50,
      }, [
        { kind: 'statMod', stat: 'emergentCaptureBonus', op: 'set', value: 0.20 },
      ] as PrimitiveEffect[]);
      const ctx = makeContext();
      const result = applyCombatSynergies(ctx, [], triple);

      expect(result.emergentCaptureBonus).toBe(0.20);
      expect(result.additionalEffects).toContain('statMod_emergentCaptureBonus_set_0.2');
    });
  });

  describe('E4 — Raid Camp (raid_camp)', () => {
    it('stores capture bonus via primitive', () => {
      const triple = makeEmergentTriple('raid_camp', {
        captureBonus: 0.30,
        campEnemyDefensePenalty: 0.20,
        campMovementBonus: 1,
      }, [
        { kind: 'statMod', stat: 'emergentCaptureBonus', op: 'set', value: 0.30 },
      ] as PrimitiveEffect[]);
      const ctx = makeContext();
      const result = applyCombatSynergies(ctx, [], triple);

      expect(result.emergentCaptureBonus).toBe(0.30);
      expect(result.additionalEffects).toContain('statMod_emergentCaptureBonus_set_0.3');
    });

    it('defaults to zero when no raid_camp emergent is active', () => {
      const ctx = makeContext();
      const result = applyCombatSynergies(ctx, [], null);
      expect(result.emergentCaptureBonus).toBe(0);
    });
  });

  describe('Emergent effects stack with pair synergies', () => {
    it('Standing Stone antiDisplacement does not override heavy_fortress reflection', () => {
      const standingStone = makeEmergentTriple('standing_stone', {
        anchoredDefenseBonus: 0.30,
        anchoredAuraRadius: 3,
        damageSharePercent: 0.50,
        tarPitMovementPenalty: 1,
        anchoredAdjacentDamage: 2,
      }, [
        { kind: 'statMod', stat: 'defense', op: 'add', value: 0.30 },
        { kind: 'preventAction', action: 'displacement' },
      ] as PrimitiveEffect[]);
      const pairSynergy: ActiveSynergy = {
        pairId: 'heavy_fortress_test',
        name: 'Heavy Fortress',
        domains: ['fortress', 'heavy_hitter'],
        effects: [
          { kind: 'statMod', stat: 'damageReflection', op: 'set', value: 0.25 },
          { kind: 'setFlag', flag: 'antiDisplacement' },
        ] as PrimitiveEffect[],
      };
      const ctx = makeContext();
      const result = applyCombatSynergies(ctx, [pairSynergy], standingStone);

      expect(result.antiDisplacement).toBe(true);
      expect(result.damageReflection).toBe(0.25);
      expect(result.defense).toBe(0.30);
    });
  });
});
