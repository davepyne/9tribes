import {
  applyCombatSynergies,
  type CombatContext,
} from '../src/systems/synergyEffects';
import type { ActiveSynergy, ActiveTripleStack, EmergentRuleConfig } from '../src/systems/synergyEngine';

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

function makeEmergentTriple(effectType: string, effectFields: Record<string, unknown> = {}): ActiveTripleStack {
  const rule: EmergentRuleConfig = {
    id: `test_${effectType}`,
    name: `Test ${effectType}`,
    condition: 'default',
    effect: { type: effectType, description: 'test', ...effectFields } as never,
  };
  return {
    domains: ['domain-a', 'domain-b', 'domain-c'],
    pairs: [],
    emergentRule: rule,
    name: `Test ${effectType}`,
  };
}

describe('Phase 4: Emergent rule wiring', () => {
  describe('E5 — Paladin (sustain)', () => {
    it('stores healPercentOfDamage and minHp from emergent rule', () => {
      const triple = makeEmergentTriple('sustain', {
        healPercentOfDamage: 0.50,
        minHp: 1,
      });
      const ctx = makeContext();
      const result = applyCombatSynergies(ctx, [], triple);

      expect(result.emergentSustainHealPercent).toBe(0.50);
      expect(result.emergentSustainMinHp).toBe(1);
      expect(result.additionalEffects).toContain('paladin_sustain');
    });

    it('defaults to zero when no sustain emergent is active', () => {
      const ctx = makeContext();
      const result = applyCombatSynergies(ctx, [], null);
      expect(result.emergentSustainHealPercent).toBe(0);
      expect(result.emergentSustainMinHp).toBe(0);
    });
  });

  describe('E2 — Terrain Assassin (permanent_stealth)', () => {
    it('stores terrain types where stealth is permanent', () => {
      const triple = makeEmergentTriple('permanent_stealth', {
        terrainTypes: ['desert', 'coast', 'hill'],
      });
      const ctx = makeContext();
      const result = applyCombatSynergies(ctx, [], triple);

      expect(result.emergentPermanentStealthTerrains).toEqual(['desert', 'coast', 'hill']);
      expect(result.additionalEffects).toContain('permanent_stealth');
    });

    it('defaults to empty array when no permanent_stealth emergent is active', () => {
      const ctx = makeContext();
      const result = applyCombatSynergies(ctx, [], null);
      expect(result.emergentPermanentStealthTerrains).toEqual([]);
    });
  });

  describe('E1 — Anchor (zone_of_control)', () => {
    it('adds defense bonus and sets antiDisplacement', () => {
      const triple = makeEmergentTriple('zone_of_control', {
        radius: 3,
        defenseBonus: 0.30,
        healPerTurn: 3,
        immovable: true,
        selfRegen: 5,
      });
      const ctx = makeContext();
      const result = applyCombatSynergies(ctx, [], triple);

      expect(result.defense).toBe(0.30);
      expect(result.antiDisplacement).toBe(true);
      expect(result.additionalEffects).toContain('zone_of_control_radius_3');
    });

    it('defaults: no defense bonus, no antiDisplacement', () => {
      const ctx = makeContext();
      const result = applyCombatSynergies(ctx, [], null);
      expect(result.defense).toBe(0);
      expect(result.antiDisplacement).toBe(false);
    });
  });

  describe('E3 — Slave Empire (slave_empire)', () => {
    it('stores capture chance bonus', () => {
      const triple = makeEmergentTriple('slave_empire', {
        captureAuraRadius: 2,
        captureChanceBonus: 0.20,
        slaveProductionBonus: 0.50,
      });
      const ctx = makeContext();
      const result = applyCombatSynergies(ctx, [], triple);

      expect(result.emergentCaptureBonus).toBe(0.20);
      expect(result.additionalEffects).toContain('slave_empire_capture_aura_2');
    });
  });

  describe('E4 — Desert Raider (desert_raider)', () => {
    it('stores desert capture bonus', () => {
      const triple = makeEmergentTriple('desert_raider', {
        desertCaptureBonus: 0.30,
        alliedDesertMovement: true,
      });
      const ctx = makeContext();
      const result = applyCombatSynergies(ctx, [], triple);

      expect(result.emergentDesertCaptureBonus).toBe(0.30);
      expect(result.additionalEffects).toContain('desert_raider_capture_bonus');
    });

    it('defaults to zero when no desert_raider emergent is active', () => {
      const ctx = makeContext();
      const result = applyCombatSynergies(ctx, [], null);
      expect(result.emergentDesertCaptureBonus).toBe(0);
    });
  });

  describe('Emergent effects stack with pair synergies', () => {
    it('Anchor antiDisplacement does not override heavy_fortress reflection', () => {
      const anchor = makeEmergentTriple('zone_of_control', {
        radius: 3,
        defenseBonus: 0.30,
        healPerTurn: 3,
        immovable: true,
        selfRegen: 5,
      });
      const pairSynergy: ActiveSynergy = {
        pairId: 'heavy_fortress_test',
        name: 'Heavy Fortress',
        domains: ['fortress', 'heavy_hitter'],
        effect: { type: 'heavy_fortress', damageReflection: 0.25 },
      };
      const ctx = makeContext();
      const result = applyCombatSynergies(ctx, [pairSynergy], anchor);

      expect(result.antiDisplacement).toBe(true);
      expect(result.damageReflection).toBe(0.25);
      expect(result.defense).toBe(0.30);
    });
  });
});
