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
    attackerLearnedDomains: [],
    ...overrides,
  };
}

function makeEmergentTriple(
  id: string,
  effects: PrimitiveEffect[] = [],
): ActiveTripleStack {
  const rule: EmergentRuleConfig = {
    id: `test_${id}`,
    name: `Test ${id}`,
    condition: 'default',
    effects,
    description: 'test',
    friendlyFlavor: 'test flavor',
    enemyFlavor: 'test flavor',
  };
  return {
    domains: ['domain-a', 'domain-b', 'domain-c'],
    pairs: [],
    emergentRule: rule,
    name: `Test ${id}`,
  };
}

describe('Phase 4: Emergent rule wiring', () => {
  describe('E5 — Paladin', () => {
    it('stores healPercentOfDamage and minHp from emergent rule primitives', () => {
      const triple = makeEmergentTriple('paladin', [
        { kind: 'statMod', stat: 'emergentSustainHealPercent', op: 'set', value: 0.50 },
        { kind: 'statMod', stat: 'emergentSustainMinHp', op: 'set', value: 1 },
        { kind: 'statMod', stat: 'emergentSmiteBonus', op: 'set', value: 1.0 },
      ] as PrimitiveEffect[]);
      const ctx = makeContext();
      const result = applyCombatSynergies(ctx, [], triple);

      expect(result.getStat('emergentSustainHealPercent')).toBe(0.50);
      expect(result.getStat('emergentSustainMinHp')).toBe(1);
      expect(result.additionalEffects).toContain('statMod_emergentSustainHealPercent_set_0.5');
    });

    it('defaults to zero when no sustain emergent is active', () => {
      const ctx = makeContext();
      const result = applyCombatSynergies(ctx, [], null);
      expect(result.getStat('emergentSustainHealPercent')).toBe(0);
      expect(result.getStat('emergentSustainMinHp')).toBe(0);
    });
  });

  describe('E2 — Terrain Assassin (permanent_stealth)', () => {
    it('permanent stealth terrains not settable via primitives — handled at zone level', () => {
      // permanent_stealth uses empty effects array; terrain list is read from
      // EMERGENT_PARAMS.terrain_assassin.terrainTypes by the zone-effect system, not by
      // applyCombatSynergies. The combat path does not populate the data list.
      const triple = makeEmergentTriple('permanent_stealth');
      const ctx = makeContext();
      const result = applyCombatSynergies(ctx, [], triple);

      expect(result.getList('emergentPermanentStealthTerrains')).toEqual([]);
    });

    it('defaults to empty array when no permanent_stealth emergent is active', () => {
      const ctx = makeContext();
      const result = applyCombatSynergies(ctx, [], null);
      expect(result.getList('emergentPermanentStealthTerrains')).toEqual([]);
    });
  });

  describe('E1 — Standing Stone (standing_stone)', () => {
    it('adds defense bonus and sets antiDisplacement via primitives', () => {
      const triple = makeEmergentTriple('standing_stone', [
        { kind: 'statMod', stat: 'defense', op: 'add', value: 0.30 },
        { kind: 'preventAction', action: 'displacement' },
      ] as PrimitiveEffect[]);
      const ctx = makeContext();
      const result = applyCombatSynergies(ctx, [], triple);

      expect(result.getStat('defense')).toBe(0.30);
      expect(result.hasFlag('antiDisplacement')).toBe(true);
      expect(result.additionalEffects).toContain('statMod_defense_add_0.3');
    });

    it('defaults: no defense bonus, no antiDisplacement', () => {
      const ctx = makeContext();
      const result = applyCombatSynergies(ctx, [], null);
      expect(result.getStat('defense')).toBe(0);
      expect(result.hasFlag('antiDisplacement')).toBe(false);
    });
  });

  describe('E3 — Slave Empire (slave_empire)', () => {
    it('stores capture chance bonus via primitive', () => {
      const triple = makeEmergentTriple('slave_empire', [
        { kind: 'statMod', stat: 'emergentCaptureBonus', op: 'set', value: 0.20 },
      ] as PrimitiveEffect[]);
      const ctx = makeContext();
      const result = applyCombatSynergies(ctx, [], triple);

      expect(result.getStat('emergentCaptureBonus')).toBe(0.20);
      expect(result.additionalEffects).toContain('statMod_emergentCaptureBonus_set_0.2');
    });
  });

  describe('E4 — Raid Camp (raid_camp)', () => {
    it('stores capture bonus via primitive', () => {
      const triple = makeEmergentTriple('raid_camp', [
        { kind: 'statMod', stat: 'emergentCaptureBonus', op: 'set', value: 0.30 },
      ] as PrimitiveEffect[]);
      const ctx = makeContext();
      const result = applyCombatSynergies(ctx, [], triple);

      expect(result.getStat('emergentCaptureBonus')).toBe(0.30);
      expect(result.additionalEffects).toContain('statMod_emergentCaptureBonus_set_0.3');
    });

    it('defaults to zero when no raid_camp emergent is active', () => {
      const ctx = makeContext();
      const result = applyCombatSynergies(ctx, [], null);
      expect(result.getStat('emergentCaptureBonus')).toBe(0);
    });
  });

  describe('Emergent effects stack with pair synergies', () => {
    it('Standing Stone antiDisplacement does not override heavy_fortress reflection', () => {
      const standingStone = makeEmergentTriple('standing_stone', [
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

      expect(result.hasFlag('antiDisplacement')).toBe(true);
      expect(result.getStat('damageReflection')).toBe(0.25);
      expect(result.getStat('defense')).toBe(0.30);
    });
  });
});
