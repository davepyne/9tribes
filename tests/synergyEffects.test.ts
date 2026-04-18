import { applyCombatSynergies, applyHealingSynergies, type CombatContext, type HealingContext } from '../src/systems/synergyEffects';
import type { ActiveSynergy } from '../src/systems/synergyEngine';

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

function makeSynergy(effect: Record<string, unknown>): ActiveSynergy {
  return {
    pairId: 'test-synergy',
    name: 'Test Synergy',
    domains: ['test', 'test'],
    effect: effect as ActiveSynergy['effect'],
  };
}

describe('Phase 3A synergy effects', () => {
  describe('lethal_ambush', () => {
    const synergy = makeSynergy({ type: 'lethal_ambush', poisonStacks: 2, actionPointCost: 1 });

    it('triggers instant kill on stealth attack', () => {
      const ctx = makeContext({ isStealthAttack: true });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.instantKill).toBe(true);
      expect(result.lethalAmbushPoison).toBe(2);
      expect(result.poisonStacks).toBe(2);
      expect(result.additionalEffects).toContain('lethal_ambush');
    });

    it('does NOT trigger when not a stealth attack', () => {
      const ctx = makeContext({ isStealthAttack: false });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.instantKill).toBe(false);
      expect(result.lethalAmbushPoison).toBe(0);
      expect(result.additionalEffects).not.toContain('lethal_ambush');
    });
  });

  describe('ambush_charge', () => {
    const synergy = makeSynergy({ type: 'ambush_charge', damageBonus: 0.50, revealUntilNextTurn: true });

    it('waives cooldown on stealth charge', () => {
      const ctx = makeContext({ isCharge: true, isStealthAttack: true });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.chargeCooldownWaived).toBe(true);
      expect(result.additionalEffects).toContain('ambush_charge');
    });

    it('does NOT trigger without stealth', () => {
      const ctx = makeContext({ isCharge: true, isStealthAttack: false });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.chargeCooldownWaived).toBe(false);
    });

    it('does NOT trigger without charge', () => {
      const ctx = makeContext({ isCharge: false, isStealthAttack: true });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.chargeCooldownWaived).toBe(false);
    });
  });

  describe('formation_crush', () => {
    const synergy = makeSynergy({ type: 'formation_crush', knockbackDistance: 2, stunDuration: 1 });

    it('applies knockback and stun', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.knockbackDistance).toBe(2);
      expect(result.stunDuration).toBe(1);
      expect(result.formationCrushStacks).toBe(1);
      expect(result.additionalEffects).toContain('formation_crush_stacks_1');
    });

    it('stacks with multiple charge units', () => {
      const result = applyCombatSynergies(makeContext(), [synergy, synergy], null);
      expect(result.formationCrushStacks).toBe(2);
    });
  });

  describe('armor_shred', () => {
    const synergy = makeSynergy({ type: 'armor_shred', armorPiercing: 1.0, permanent: true });

    it('sets armor piercing on stealth attack', () => {
      const ctx = makeContext({ isStealthAttack: true });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.armorPiercing).toBe(1.0);
      expect(result.additionalEffects).toContain('armor_shred_1');
    });

    it('does NOT trigger without stealth', () => {
      const ctx = makeContext({ isStealthAttack: false });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.armorPiercing).toBe(0);
    });
  });

  describe('Phase 3A defaults', () => {
    it('returns zero/false defaults when no synergies active', () => {
      const result = applyCombatSynergies(makeContext(), [], null);
      expect(result.instantKill).toBe(false);
      expect(result.lethalAmbushPoison).toBe(0);
      expect(result.chargeCooldownWaived).toBe(false);
      expect(result.formationCrushStacks).toBe(0);
      expect(result.stunDuration).toBe(0);
      expect(result.armorPiercing).toBe(0);
    });
  });
});

describe('Phase 3B capture synergy effects', () => {
  describe('poison_capture (S2)', () => {
    const synergy = makeSynergy({ type: 'poison_capture', damagePerTurn: 3, slaveDamageBonus: 0.25, slaveHealPenalty: 0.50 });

    it('applies capture poison and slave modifiers', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.capturePoisonDamage).toBe(3);
      expect(result.capturePoisonStacks).toBe(3);
      expect(result.slaveDamageBonus).toBe(0.25);
      expect(result.slaveHealPenalty).toBe(0.50);
      expect(result.additionalEffects).toContain('poison_capture');
    });

    it('does NOT affect results when synergy inactive', () => {
      const result = applyCombatSynergies(makeContext(), [], null);
      expect(result.capturePoisonDamage).toBe(0);
      expect(result.capturePoisonStacks).toBe(0);
      expect(result.slaveDamageBonus).toBe(0);
      expect(result.slaveHealPenalty).toBe(0);
    });
  });

  describe('capture_charge (S7)', () => {
    const synergy = makeSynergy({ type: 'capture_charge', knockbackDistance: 2 });

    it('sets charge capture chance and knockback on charge', () => {
      const ctx = makeContext({ isCharge: true });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.chargeCaptureChance).toBe(0.50);
      expect(result.knockbackDistance).toBe(2);
      expect(result.additionalEffects).toContain('capture_charge');
    });

    it('does NOT trigger without charge', () => {
      const ctx = makeContext({ isCharge: false });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.chargeCaptureChance).toBe(0);
      expect(result.additionalEffects).not.toContain('capture_charge');
    });
  });

  describe('capture_retreat (S10)', () => {
    const synergy = makeSynergy({ type: 'capture_retreat', captureChance: 0.15 });

    it('sets retreat capture chance on retreat', () => {
      const ctx = makeContext({ isRetreat: true });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.retreatCaptureChance).toBe(0.15);
      expect(result.additionalEffects).toContain('capture_retreat');
    });

    it('does NOT trigger without retreat', () => {
      const ctx = makeContext({ isRetreat: false });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.retreatCaptureChance).toBe(0);
      expect(result.additionalEffects).not.toContain('capture_retreat');
    });
  });

  describe('naval_capture (S13)', () => {
    const synergy = makeSynergy({ type: 'naval_capture', coastalCaptureBonus: 0.30 });

    it('sets naval capture bonus on water terrain', () => {
      const ctx = makeContext({ terrain: 'water' });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.navalCaptureBonus).toBe(0.30);
      expect(result.additionalEffects).toContain('naval_capture');
    });

    it('sets naval capture bonus on river terrain', () => {
      const ctx = makeContext({ terrain: 'river' });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.navalCaptureBonus).toBe(0.30);
    });

    it('does NOT trigger on non-water terrain', () => {
      const ctx = makeContext({ terrain: 'plains' });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.navalCaptureBonus).toBe(0);
      expect(result.additionalEffects).not.toContain('naval_capture');
    });
  });

  describe('stealth_capture (S17)', () => {
    const synergy = makeSynergy({ type: 'stealth_capture', captureChance: 0.40 });

    it('sets stealth capture bonus on stealth attack', () => {
      const ctx = makeContext({ isStealthAttack: true });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.stealthCaptureBonus).toBe(0.40);
      expect(result.additionalEffects).toContain('stealth_capture');
    });

    it('does NOT trigger without stealth attack', () => {
      const ctx = makeContext({ isStealthAttack: false });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.stealthCaptureBonus).toBe(0);
      expect(result.additionalEffects).not.toContain('stealth_capture');
    });
  });

  describe('Phase 3B defaults', () => {
    it('returns zero defaults when no synergies active', () => {
      const result = applyCombatSynergies(makeContext(), [], null);
      expect(result.capturePoisonDamage).toBe(0);
      expect(result.capturePoisonStacks).toBe(0);
      expect(result.slaveDamageBonus).toBe(0);
      expect(result.slaveHealPenalty).toBe(0);
      expect(result.chargeCaptureChance).toBe(0);
      expect(result.retreatCaptureChance).toBe(0);
      expect(result.navalCaptureBonus).toBe(0);
      expect(result.stealthCaptureBonus).toBe(0);
    });
  });
});

describe('Phase 3C lower-value synergy effects', () => {
  describe('heavy_poison (S3)', () => {
    const synergy = makeSynergy({ type: 'heavy_poison', armorPiercing: 0.5 });

    it('applies +1 poison stack and armor piercing', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.poisonStacks).toBe(1);
      expect(result.armorPiercing).toBe(0.5);
      expect(result.additionalEffects).toContain('heavy_poison');
    });

    it('stacks poison with other poison sources', () => {
      const poisonAura = makeSynergy({ type: 'poison_aura', damagePerTurn: 2, radius: 1 });
      const result = applyCombatSynergies(makeContext(), [poisonAura, synergy], null);
      expect(result.poisonStacks).toBe(3);
    });
  });

  describe('prison_fortress (S4)', () => {
    const synergy = makeSynergy({ type: 'prison_fortress', defenseBonus: 0.50 });

    it('adds defense and prevents capture escape', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.defense).toBe(0.50);
      expect(result.captureEscapePrevented).toBe(true);
      expect(result.additionalEffects).toContain('prison_fortress');
    });

    it('does NOT trigger without synergy', () => {
      const result = applyCombatSynergies(makeContext(), [], null);
      expect(result.captureEscapePrevented).toBe(false);
    });
  });

  describe('heavy_fortress (S5)', () => {
    const synergy = makeSynergy({ type: 'heavy_fortress', damageReflection: 0.25 });

    it('reflects damage and prevents displacement', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.damageReflection).toBe(0.25);
      expect(result.antiDisplacement).toBe(true);
      expect(result.additionalEffects).toContain('heavy_fortress');
    });
  });

  describe('heavy_charge (S8)', () => {
    const synergy = makeSynergy({ type: 'heavy_charge', stunDuration: 1 });

    it('applies stun unconditionally', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.stunDuration).toBe(1);
      expect(result.additionalEffects).toContain('heavy_charge');
    });

    it('amplifies knockback by 50% on charge', () => {
      const ramAttack = makeSynergy({ type: 'ram_attack', knockbackDistance: 2 });
      const ctx = makeContext({ isCharge: true });
      const result = applyCombatSynergies(ctx, [ramAttack, synergy], null);
      expect(result.knockbackDistance).toBe(3); // ceil(2 * 1.5) = 3
    });

    it('does NOT amplify knockback without charge', () => {
      const ramAttack = makeSynergy({ type: 'ram_attack', knockbackDistance: 2 });
      const ctx = makeContext({ isCharge: false });
      const result = applyCombatSynergies(ctx, [ramAttack, synergy], null);
      expect(result.knockbackDistance).toBe(2);
    });
  });

  describe('heavy_retreat (S11)', () => {
    const synergy = makeSynergy({ type: 'heavy_retreat', damageReduction: 0.30 });

    it('applies damage reduction on retreat', () => {
      const ctx = makeContext({ isRetreat: true });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.heavyRetreatDamageReduction).toBe(0.30);
      expect(result.additionalEffects).toContain('heavy_retreat');
    });

    it('does NOT trigger without retreat', () => {
      const ctx = makeContext({ isRetreat: false });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.heavyRetreatDamageReduction).toBe(0);
      expect(result.additionalEffects).not.toContain('heavy_retreat');
    });
  });

  describe('coastal_nomad (S12)', () => {
    const synergy = makeSynergy({ type: 'coastal_nomad', defenseBonus: 0.25, speedBonus: 1 });

    it('grants defense and speed on coast terrain', () => {
      const ctx = makeContext({ terrain: 'coast' });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.coastalNomadDefense).toBe(0.25);
      expect(result.coastalNomadSpeed).toBe(1);
      expect(result.defense).toBe(0.25);
      expect(result.additionalEffects).toContain('coastal_nomad');
    });

    it('grants defense and speed on water terrain', () => {
      const ctx = makeContext({ terrain: 'water' });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.coastalNomadDefense).toBe(0.25);
    });

    it('does NOT trigger on plains', () => {
      const ctx = makeContext({ terrain: 'plains' });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.coastalNomadDefense).toBe(0);
      expect(result.additionalEffects).not.toContain('coastal_nomad');
    });
  });

  describe('heavy_naval (S14)', () => {
    const synergy = makeSynergy({ type: 'heavy_naval', ramDamage: 2 });

    it('applies ram damage on water terrain', () => {
      const ctx = makeContext({ terrain: 'water' });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.heavyNavalRamDamage).toBe(2);
      expect(result.additionalEffects).toContain('heavy_naval');
    });

    it('applies ram damage on coast terrain', () => {
      const ctx = makeContext({ terrain: 'coast' });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.heavyNavalRamDamage).toBe(2);
    });

    it('does NOT trigger on plains', () => {
      const ctx = makeContext({ terrain: 'plains' });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.heavyNavalRamDamage).toBe(0);
    });
  });

  describe('slave_healing (S15)', () => {
    const synergy = makeSynergy({ type: 'slave_healing', slaveHeal: 2 });

    it('stores slave heal amount in combat result', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.slaveHealAmount).toBe(2);
      expect(result.additionalEffects).toContain('slave_healing');
    });

    it('boosts healing via applyHealingSynergies', () => {
      const healCtx: HealingContext = {
        unitId: 'unit-1',
        unitTags: ['capture'],
        baseHeal: 1,
        position: { x: 0, y: 0 },
        adjacentAllies: [],
        isStealthed: false,
      };
      const heal = applyHealingSynergies(healCtx, [synergy]);
      expect(heal).toBe(3); // baseHeal 1 + slaveHeal 2
    });
  });

  describe('heavy_regen (S16)', () => {
    const synergy = makeSynergy({ type: 'heavy_regen', regenPercent: 0.30 });

    it('stores regen percent in combat result', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.heavyRegenPercent).toBe(0.30);
      expect(result.additionalEffects).toContain('heavy_regen');
    });

    it('boosts healing via applyHealingSynergies', () => {
      const healCtx: HealingContext = {
        unitId: 'unit-1',
        unitTags: ['heavy'],
        baseHeal: 0,
        position: { x: 0, y: 0 },
        adjacentAllies: [],
        isStealthed: false,
      };
      const heal = applyHealingSynergies(healCtx, [synergy]);
      expect(heal).toBe(3); // flat 3 from heavy_regen
    });
  });

  describe('terrain_slave (S19)', () => {
    const synergy = makeSynergy({ type: 'terrain_slave', speedBonus: 1 });

    it('applies speed bonus on desert terrain', () => {
      const ctx = makeContext({ terrain: 'desert' });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.terrainSlaveSpeed).toBe(1);
      expect(result.additionalEffects).toContain('terrain_slave');
    });

    it('does NOT trigger on non-desert terrain', () => {
      const ctx = makeContext({ terrain: 'plains' });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.terrainSlaveSpeed).toBe(0);
    });
  });

  describe('sandstorm_aura (S20)', () => {
    const synergy = makeSynergy({ type: 'sandstorm_aura', auraRadius: 2, enemyAccuracyDebuff: 0.30 });

    it('creates sandstorm aura on desert terrain', () => {
      const ctx = makeContext({ terrain: 'desert' });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.sandstormAuraRadius).toBe(2);
      expect(result.sandstormAuraDebuff).toBe(0.30);
      expect(result.sandstormAccuracyDebuff).toBe(0.30);
      expect(result.additionalEffects).toContain('sandstorm_aura');
    });

    it('does NOT trigger on non-desert terrain', () => {
      const ctx = makeContext({ terrain: 'plains' });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.sandstormAuraRadius).toBe(0);
    });
  });

  describe('slave_army (S21)', () => {
    const synergy = makeSynergy({ type: 'slave_army', slaveDamageBonus: 0.25, slaveDefensePenalty: 0.15 });

    it('stores slave army damage bonus and defense penalty', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.slaveArmyDamageBonus).toBe(0.25);
      expect(result.slaveArmyDefensePenalty).toBe(0.15);
      expect(result.additionalEffects).toContain('slave_army');
    });
  });

  describe('slave_coercion (S22)', () => {
    const synergy = makeSynergy({ type: 'slave_coercion', damageBonus: 0.50 });

    it('stores coercion damage bonus', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.slaveCoercionDamageBonus).toBe(0.50);
      expect(result.additionalEffects).toContain('slave_coercion');
    });
  });

  describe('heavy_mass (S23)', () => {
    const synergy = makeSynergy({ type: 'heavy_mass', knockbackDistance: 1 });

    it('applies knockback and increments stacks', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.knockbackDistance).toBe(1);
      expect(result.heavyMassStacks).toBe(1);
      expect(result.additionalEffects).toContain('heavy_mass_stacks_1');
    });

    it('stacks with multiple heavy units', () => {
      const result = applyCombatSynergies(makeContext(), [synergy, synergy], null);
      expect(result.heavyMassStacks).toBe(2);
      expect(result.knockbackDistance).toBe(1);
      expect(result.additionalEffects).toContain('heavy_mass_stacks_2');
    });
  });

  describe('Phase 3C defaults', () => {
    it('returns zero/false defaults when no synergies active', () => {
      const result = applyCombatSynergies(makeContext(), [], null);
      expect(result.captureEscapePrevented).toBe(false);
      expect(result.heavyRetreatDamageReduction).toBe(0);
      expect(result.coastalNomadDefense).toBe(0);
      expect(result.coastalNomadSpeed).toBe(0);
      expect(result.heavyNavalRamDamage).toBe(0);
      expect(result.slaveHealAmount).toBe(0);
      expect(result.heavyRegenPercent).toBe(0);
      expect(result.terrainSlaveSpeed).toBe(0);
      expect(result.sandstormAuraRadius).toBe(0);
      expect(result.sandstormAuraDebuff).toBe(0);
      expect(result.slaveArmyDamageBonus).toBe(0);
      expect(result.slaveArmyDefensePenalty).toBe(0);
      expect(result.slaveCoercionDamageBonus).toBe(0);
      expect(result.heavyMassStacks).toBe(0);
    });
  });
});
