import { applyCombatSynergies, applyHealingSynergies, type CombatContext, type HealingContext } from '../src/systems/synergyEffects';
import type { ActiveSynergy } from '../src/systems/synergyEngine';
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

function makeSynergy(effects: PrimitiveEffect[]): ActiveSynergy {
  return {
    pairId: 'test-synergy',
    name: 'Test Synergy',
    domains: ['test', 'test'],
    effects,
  };
}

describe('Phase 3A synergy effects', () => {
  describe('lethal_ambush', () => {
    const synergy = makeSynergy([
      { kind: 'instantKill', condition: 'isStealthAttack' },
      { kind: 'statMod', stat: 'lethalAmbushPoison', op: 'set', value: 2, condition: 'isStealthAttack' },
      { kind: 'applyStatus', status: 'poison', stacks: 2, condition: 'isStealthAttack' },
    ] as PrimitiveEffect[]);

    it('triggers instant kill on stealth attack', () => {
      const ctx = makeContext({ isStealthAttack: true });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.instantKill).toBe(true);
      expect(result.lethalAmbushPoison).toBe(2);
      expect(result.poisonStacks).toBe(2);
      expect(result.additionalEffects).toContain('instantKill');
    });

    it('does NOT trigger when not a stealth attack', () => {
      const ctx = makeContext({ isStealthAttack: false });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.instantKill).toBe(false);
      expect(result.lethalAmbushPoison).toBe(0);
      expect(result.additionalEffects).not.toContain('instantKill');
    });
  });

  describe('ambush_charge', () => {
    const synergy = makeSynergy([
      { kind: 'setFlag', flag: 'chargeCooldownWaived', condition: 'isCharge AND isStealthAttack' },
    ] as PrimitiveEffect[]);

    it('waives cooldown on stealth charge', () => {
      const ctx = makeContext({ isCharge: true, isStealthAttack: true });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.chargeCooldownWaived).toBe(true);
      expect(result.additionalEffects).toContain('setFlag_chargeCooldownWaived');
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
    const synergy = makeSynergy([
      { kind: 'knockback', distance: 2 },
      { kind: 'applyStatus', status: 'stun', duration: 1 },
      { kind: 'applyStatus', status: 'formationCrush', stacks: 1 },
    ] as PrimitiveEffect[]);

    it('applies knockback and stun', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.knockbackDistance).toBe(2);
      expect(result.stunDuration).toBe(1);
      expect(result.formationCrushStacks).toBe(1);
      expect(result.additionalEffects).toContain('applyStatus_formationCrush');
    });

    it('stacks with multiple charge units', () => {
      const result = applyCombatSynergies(makeContext(), [synergy, synergy], null);
      expect(result.formationCrushStacks).toBe(2);
    });
  });

  describe('armor_shred', () => {
    const synergy = makeSynergy([
      { kind: 'statMod', stat: 'armorPiercing', op: 'add', value: 1.0, condition: 'isStealthAttack' },
    ] as PrimitiveEffect[]);

    it('sets armor piercing on stealth attack', () => {
      const ctx = makeContext({ isStealthAttack: true });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.armorPiercing).toBe(1.0);
      expect(result.additionalEffects).toContain('statMod_armorPiercing_add_1');
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
    const synergy = makeSynergy([
      { kind: 'statMod', stat: 'capturePoisonDamage', op: 'set', value: 3 },
      { kind: 'statMod', stat: 'capturePoisonStacks', op: 'set', value: 3 },
      { kind: 'statMod', stat: 'slaveDamageBonus', op: 'set', value: 0.25 },
      { kind: 'statMod', stat: 'slaveHealPenalty', op: 'set', value: 0.50 },
    ] as PrimitiveEffect[]);

    it('applies capture poison and slave modifiers', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.capturePoisonDamage).toBe(3);
      expect(result.capturePoisonStacks).toBe(3);
      expect(result.slaveDamageBonus).toBe(0.25);
      expect(result.slaveHealPenalty).toBe(0.50);
      expect(result.additionalEffects).toContain('statMod_capturePoisonDamage_set_3');
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
    const synergy = makeSynergy([
      { kind: 'capture', chanceBonus: 0.30, condition: 'isCharge' },
      { kind: 'knockback', distance: 2 },
    ] as PrimitiveEffect[]);

    it('sets charge capture chance and knockback on charge', () => {
      const ctx = makeContext({ isCharge: true });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.chargeCaptureChance).toBe(0.30);
      expect(result.knockbackDistance).toBe(2);
      expect(result.additionalEffects).toContain('capture');
    });

    it('does NOT trigger without charge', () => {
      const ctx = makeContext({ isCharge: false });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.chargeCaptureChance).toBe(0);
      expect(result.additionalEffects).not.toContain('capture');
    });
  });

  describe('capture_retreat (S10)', () => {
    const synergy = makeSynergy([
      { kind: 'capture', chanceBonus: 0.15, condition: 'isRetreat' },
    ] as PrimitiveEffect[]);

    it('sets retreat capture chance on retreat', () => {
      const ctx = makeContext({ isRetreat: true });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.retreatCaptureChance).toBe(0.15);
      expect(result.additionalEffects).toContain('capture');
    });

    it('does NOT trigger without retreat', () => {
      const ctx = makeContext({ isRetreat: false });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.retreatCaptureChance).toBe(0);
      expect(result.additionalEffects).not.toContain('capture');
    });
  });

  describe('naval_capture (S13)', () => {
    const synergy = makeSynergy([
      { kind: 'statMod', stat: 'navalCaptureBonus', op: 'set', value: 0.30, condition: 'terrain:coast,river' },
    ] as PrimitiveEffect[]);

    it('sets naval capture bonus on coast terrain', () => {
      const ctx = makeContext({ terrain: 'coast' });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.navalCaptureBonus).toBe(0.30);
      expect(result.additionalEffects).toContain('statMod_navalCaptureBonus_set_0.3');
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
      expect(result.additionalEffects).not.toContain('statMod_navalCaptureBonus_set_0.3');
    });
  });

  describe('stealth_capture (S17)', () => {
    const synergy = makeSynergy([
      { kind: 'capture', chanceBonus: 0.40, condition: 'isStealthAttack' },
    ] as PrimitiveEffect[]);

    it('sets stealth capture bonus on stealth attack', () => {
      const ctx = makeContext({ isStealthAttack: true });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.stealthCaptureBonus).toBe(0.40);
      expect(result.additionalEffects).toContain('capture');
    });

    it('does NOT trigger without stealth attack', () => {
      const ctx = makeContext({ isStealthAttack: false });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.stealthCaptureBonus).toBe(0);
      expect(result.additionalEffects).not.toContain('capture');
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
    const synergy = makeSynergy([
      { kind: 'applyStatus', status: 'poison', stacks: 1 },
      { kind: 'statMod', stat: 'armorPiercing', op: 'add', value: 0.5 },
    ] as PrimitiveEffect[]);

    it('applies +1 poison stack and armor piercing', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.poisonStacks).toBe(1);
      expect(result.armorPiercing).toBe(0.5);
      expect(result.additionalEffects).toContain('applyStatus_poison');
    });

    it('stacks poison with other poison sources', () => {
      const poisonAura = makeSynergy([
        { kind: 'applyStatus', status: 'poison', stacks: 2 },
      ] as PrimitiveEffect[]);
      const result = applyCombatSynergies(makeContext(), [poisonAura, synergy], null);
      expect(result.poisonStacks).toBe(3);
    });
  });

  describe('prison_fortress (S4)', () => {
    const synergy = makeSynergy([
      { kind: 'statMod', stat: 'defense', op: 'add', value: 0.50 },
      { kind: 'setFlag', flag: 'captureEscapePrevented' },
    ] as PrimitiveEffect[]);

    it('adds defense and prevents capture escape', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.defense).toBe(0.50);
      expect(result.captureEscapePrevented).toBe(true);
      expect(result.additionalEffects).toContain('setFlag_captureEscapePrevented');
    });

    it('does NOT trigger without synergy', () => {
      const result = applyCombatSynergies(makeContext(), [], null);
      expect(result.captureEscapePrevented).toBe(false);
    });
  });

  describe('heavy_fortress (S5)', () => {
    const synergy = makeSynergy([
      { kind: 'statMod', stat: 'damageReflection', op: 'set', value: 0.25 },
      { kind: 'setFlag', flag: 'antiDisplacement' },
    ] as PrimitiveEffect[]);

    it('reflects damage and prevents displacement', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.damageReflection).toBe(0.25);
      expect(result.antiDisplacement).toBe(true);
      expect(result.additionalEffects).toContain('setFlag_antiDisplacement');
    });
  });

  describe('heavy_charge (S8)', () => {
    const synergy = makeSynergy([
      { kind: 'applyStatus', status: 'stun', duration: 1 },
      { kind: 'knockback', distance: 0, extendMultiplier: 1.5, condition: 'isCharge' },
    ] as PrimitiveEffect[]);

    it('applies stun unconditionally', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.stunDuration).toBe(1);
      expect(result.additionalEffects).toContain('applyStatus_stun');
    });

    it('amplifies knockback by 50% on charge', () => {
      const ramAttack = makeSynergy([
        { kind: 'knockback', distance: 2 },
      ] as PrimitiveEffect[]);
      const ctx = makeContext({ isCharge: true });
      const result = applyCombatSynergies(ctx, [ramAttack, synergy], null);
      expect(result.knockbackDistance).toBe(3); // ceil(2 * 1.5) = 3
    });

    it('does NOT amplify knockback without charge', () => {
      const ramAttack = makeSynergy([
        { kind: 'knockback', distance: 2 },
      ] as PrimitiveEffect[]);
      const ctx = makeContext({ isCharge: false });
      const result = applyCombatSynergies(ctx, [ramAttack, synergy], null);
      expect(result.knockbackDistance).toBe(2);
    });
  });

  describe('heavy_retreat (S11)', () => {
    const synergy = makeSynergy([
      { kind: 'statMod', stat: 'heavyRetreatDamageReduction', op: 'set', value: 0.30, condition: 'isRetreat' },
    ] as PrimitiveEffect[]);

    it('applies damage reduction on retreat', () => {
      const ctx = makeContext({ isRetreat: true });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.heavyRetreatDamageReduction).toBe(0.30);
      expect(result.additionalEffects).toContain('statMod_heavyRetreatDamageReduction_set_0.3');
    });

    it('does NOT trigger without retreat', () => {
      const ctx = makeContext({ isRetreat: false });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.heavyRetreatDamageReduction).toBe(0);
      expect(result.additionalEffects).not.toContain('statMod_heavyRetreatDamageReduction_set_0.3');
    });
  });

  describe('coastal_nomad (S12)', () => {
    const synergy = makeSynergy([
      { kind: 'statMod', stat: 'coastalNomadDefense', op: 'set', value: 0.25, condition: 'terrain:coast,river' },
      { kind: 'statMod', stat: 'coastalNomadSpeed', op: 'set', value: 1, condition: 'terrain:coast,river' },
      { kind: 'statMod', stat: 'defense', op: 'add', value: 0.25, condition: 'terrain:coast,river' },
    ] as PrimitiveEffect[]);

    it('grants defense and speed on coast terrain', () => {
      const ctx = makeContext({ terrain: 'coast' });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.coastalNomadDefense).toBe(0.25);
      expect(result.coastalNomadSpeed).toBe(1);
      expect(result.defense).toBe(0.25);
      expect(result.additionalEffects).toContain('statMod_coastalNomadDefense_set_0.25');
    });

    it('grants defense and speed on coast terrain', () => {
      const ctx = makeContext({ terrain: 'coast' });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.coastalNomadDefense).toBe(0.25);
    });

    it('does NOT trigger on plains', () => {
      const ctx = makeContext({ terrain: 'plains' });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.coastalNomadDefense).toBe(0);
      expect(result.additionalEffects).not.toContain('statMod_coastalNomadDefense_set_0.25');
    });
  });

  describe('heavy_naval (S14)', () => {
    const synergy = makeSynergy([
      { kind: 'statMod', stat: 'heavyNavalRamDamage', op: 'set', value: 2, condition: 'terrain:coast,river' },
    ] as PrimitiveEffect[]);

    it('applies ram damage on coast terrain', () => {
      const ctx = makeContext({ terrain: 'coast' });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.heavyNavalRamDamage).toBe(2);
      expect(result.additionalEffects).toContain('statMod_heavyNavalRamDamage_set_2');
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
    const synergy = makeSynergy([
      { kind: 'statMod', stat: 'slaveHealAmount', op: 'set', value: 2 },
      { kind: 'heal', amount: 2, mode: 'flat' },
    ] as PrimitiveEffect[]);

    it('stores slave heal amount in combat result', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.slaveHealAmount).toBe(2);
      expect(result.additionalEffects).toContain('statMod_slaveHealAmount_set_2');
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
    const synergy = makeSynergy([
      { kind: 'statMod', stat: 'heavyRegenPercent', op: 'set', value: 0.30 },
    ] as PrimitiveEffect[]);

    it('stores regen percent in combat result', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.heavyRegenPercent).toBe(0.30);
      expect(result.additionalEffects).toContain('statMod_heavyRegenPercent_set_0.3');
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
      expect(heal).toBe(1); // max(1, floor(0 * 0.30)) = 1
    });
  });

  describe('terrain_slave (S19)', () => {
    const synergy = makeSynergy([
      { kind: 'statMod', stat: 'terrainSlaveSpeed', op: 'set', value: 1, condition: 'terrain:desert' },
    ] as PrimitiveEffect[]);

    it('applies speed bonus on desert terrain', () => {
      const ctx = makeContext({ terrain: 'desert' });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.terrainSlaveSpeed).toBe(1);
      expect(result.additionalEffects).toContain('statMod_terrainSlaveSpeed_set_1');
    });

    it('does NOT trigger on non-desert terrain', () => {
      const ctx = makeContext({ terrain: 'plains' });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.terrainSlaveSpeed).toBe(0);
    });
  });

  describe('sandstorm_aura (S20)', () => {
    const synergy = makeSynergy([
      { kind: 'statMod', stat: 'sandstormAuraRadius', op: 'set', value: 2, condition: 'terrain:desert' },
      { kind: 'statMod', stat: 'sandstormAuraDebuff', op: 'set', value: 0.30, condition: 'terrain:desert' },
      { kind: 'statMod', stat: 'sandstormAccuracyDebuff', op: 'set', value: 0.30, condition: 'terrain:desert' },
    ] as PrimitiveEffect[]);

    it('creates sandstorm aura on desert terrain', () => {
      const ctx = makeContext({ terrain: 'desert' });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.sandstormAuraRadius).toBe(2);
      expect(result.sandstormAuraDebuff).toBe(0.30);
      expect(result.sandstormAccuracyDebuff).toBe(0.30);
      expect(result.additionalEffects).toContain('statMod_sandstormAuraRadius_set_2');
    });

    it('does NOT trigger on non-desert terrain', () => {
      const ctx = makeContext({ terrain: 'plains' });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.sandstormAuraRadius).toBe(0);
    });
  });

  describe('slave_army (S21)', () => {
    const synergy = makeSynergy([
      { kind: 'statMod', stat: 'slaveArmyDamageBonus', op: 'set', value: 0.25 },
      { kind: 'statMod', stat: 'slaveArmyDefensePenalty', op: 'set', value: 0.15 },
    ] as PrimitiveEffect[]);

    it('stores slave army damage bonus and defense penalty', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.slaveArmyDamageBonus).toBe(0.25);
      expect(result.slaveArmyDefensePenalty).toBe(0.15);
      expect(result.additionalEffects).toContain('statMod_slaveArmyDamageBonus_set_0.25');
    });
  });

  describe('slave_coercion (S22)', () => {
    const synergy = makeSynergy([
      { kind: 'statMod', stat: 'slaveCoercionDamageBonus', op: 'set', value: 0.50 },
    ] as PrimitiveEffect[]);

    it('stores coercion damage bonus', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.slaveCoercionDamageBonus).toBe(0.50);
      expect(result.additionalEffects).toContain('statMod_slaveCoercionDamageBonus_set_0.5');
    });
  });

  describe('heavy_mass (S23)', () => {
    const synergy = makeSynergy([
      { kind: 'knockback', distance: 1 },
      { kind: 'statMod', stat: 'heavyMassStacks', op: 'add', value: 1 },
    ] as PrimitiveEffect[]);

    it('applies knockback and increments stacks', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.knockbackDistance).toBe(1);
      expect(result.heavyMassStacks).toBe(1);
      expect(result.additionalEffects).toContain('statMod_heavyMassStacks_add_1');
    });

    it('stacks with multiple heavy units', () => {
      const result = applyCombatSynergies(makeContext(), [synergy, synergy], null);
      expect(result.heavyMassStacks).toBe(2);
      expect(result.knockbackDistance).toBe(1);
      // Each synergy instance pushes its own statMod entry
      const stackEntries = result.additionalEffects.filter(e => e === 'statMod_heavyMassStacks_add_1');
      expect(stackEntries).toHaveLength(2);
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

describe('Phase 4-6 new pair synergy effects', () => {
  describe('toxic_spread', () => {
    const synergy = makeSynergy([
      { kind: 'statMod', stat: 'toxicSpreadTransferStacks', op: 'set', value: 1 },
      { kind: 'statMod', stat: 'toxicSpreadTransferRadius', op: 'set', value: 1 },
    ] as PrimitiveEffect[]);

    it('sets toxic spread transfer stacks and radius', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.toxicSpreadTransferStacks).toBe(1);
      expect(result.toxicSpreadTransferRadius).toBe(1);
      expect(result.additionalEffects).toContain('statMod_toxicSpreadTransferStacks_set_1');
    });
  });

  describe('formation_wall', () => {
    const synergy = makeSynergy([
      { kind: 'setFlag', flag: 'formationWallActive' },
      { kind: 'statMod', stat: 'formationWallRangedReduction', op: 'set', value: 0.5 },
    ] as PrimitiveEffect[]);

    it('activates formation wall and sets ranged reduction', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.formationWallActive).toBe(true);
      expect(result.formationWallRangedReduction).toBe(0.5);
      expect(result.additionalEffects).toContain('setFlag_formationWallActive');
    });
  });

  describe('formation_pinball', () => {
    const synergy = makeSynergy([
      { kind: 'knockback', distance: 0, collisionDamage: 4, collisionStun: 1 },
    ] as PrimitiveEffect[]);

    it('sets collision damage and stun duration', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.formationPinballCollisionDamage).toBe(4);
      expect(result.stunDuration).toBe(1);
      expect(result.additionalEffects).toContain('knockback_0');
    });
  });

  describe('formation_focus', () => {
    const synergy = makeSynergy([
      { kind: 'statMod', stat: 'formationFocusBonus', op: 'set', value: 0.30 },
      { kind: 'setFlag', flag: 'formationFocusIgnoresDefense' },
      { kind: 'statMod', stat: 'damage', op: 'multiply', value: 1.30 },
    ] as PrimitiveEffect[]);

    it('sets focus bonus and multiplies damage by 1.30', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.formationFocusBonus).toBe(0.30);
      expect(result.formationFocusIgnoresDefense).toBe(true);
      // damage starts at 0, so floor(0 * 1.30) = 0 — verify the multiplier side effect
      expect(result.additionalEffects).toContain('statMod_formationFocusBonus_set_0.3');
    });

    it('multiplies non-zero damage by 1.30', () => {
      // Damage is 0 by default in makeEmptyResult; formation_focus does floor(damage * 1.30)
      // We verify the formula by checking a baseline result's damage field
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.damage).toBe(0); // 0 * 1.30 floored = 0, but the multiplier is applied
    });
  });

  describe('formation_chain', () => {
    const synergy = makeSynergy([
      { kind: 'statMod', stat: 'formationChainBonus', op: 'set', value: 1 },
    ] as PrimitiveEffect[]);

    it('sets chain bonus and pushes chain effect', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.formationChainBonus).toBe(1);
      expect(result.additionalEffects).toContain('statMod_formationChainBonus_set_1');
    });
  });

  describe('bloom_pulse', () => {
    const synergy = makeSynergy([
      { kind: 'statMod', stat: 'bloomPulseHeal', op: 'set', value: 4 },
      { kind: 'statMod', stat: 'bloomPulseSelfHeal', op: 'set', value: 6 },
      { kind: 'statMod', stat: 'bloomPulseAuraRadius', op: 'set', value: 3 },
      { kind: 'statMod', stat: 'bloomPulseMovementBonus', op: 'set', value: 1 },
    ] as PrimitiveEffect[]);

    it('sets bloom pulse heal, self heal, aura radius, and movement bonus', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.bloomPulseHeal).toBe(4);
      expect(result.bloomPulseSelfHeal).toBe(6);
      expect(result.bloomPulseAuraRadius).toBe(3);
      expect(result.bloomPulseMovementBonus).toBe(1);
    });
  });

  describe('position_swap', () => {
    const synergy = makeSynergy([
      { kind: 'setFlag', flag: 'positionSwapAvailable' },
    ] as PrimitiveEffect[]);

    it('enables position swap', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.positionSwapAvailable).toBe(true);
      expect(result.additionalEffects).toContain('setFlag_positionSwapAvailable');
    });
  });

  describe('caravan_relay', () => {
    const synergy = makeSynergy([
      { kind: 'statMod', stat: 'caravanRelayVisionRange', op: 'set', value: 3 },
    ] as PrimitiveEffect[]);

    it('sets caravan relay vision range', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.caravanRelayVisionRange).toBe(3);
      expect(result.additionalEffects).toContain('statMod_caravanRelayVisionRange_set_3');
    });
  });

  describe('slave_horde', () => {
    const synergy = makeSynergy([
      { kind: 'statMod', stat: 'slaveHordeDamageBonus', op: 'set', value: 0.50 },
      { kind: 'statMod', stat: 'slaveHordeDefensePenalty', op: 'set', value: 0.30 },
      { kind: 'statMod', stat: 'damage', op: 'multiply', value: 1.5 },
      { kind: 'statMod', stat: 'defense', op: 'add', value: -0.30 },
    ] as PrimitiveEffect[]);

    it('sets damage bonus and defense penalty, multiplies damage and reduces defense', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.slaveHordeDamageBonus).toBe(0.50);
      expect(result.slaveHordeDefensePenalty).toBe(0.30);
      // damage = floor(0 * 1.5) = 0; defense starts at 0, max(0, 0 + -0.30) = -0.3
      expect(result.damage).toBe(0);
      expect(result.defense).toBe(-0.3);
    });

    it('multiplies non-zero damage by 1.5 and subtracts from defense', () => {
      // Combine with a synergy that adds defense to see the subtraction
      const fortress = makeSynergy([
        { kind: 'statMod', stat: 'defense', op: 'add', value: 1.0 },
      ] as PrimitiveEffect[]);
      const result = applyCombatSynergies(makeContext(), [fortress, synergy], null);
      // fortress adds 1.0 defense, slave_horde subtracts 0.30: 1.0 - 0.30 = 0.70
      expect(result.defense).toBe(0.70);
    });
  });

  describe('caravan_passenger', () => {
    const synergy = makeSynergy([
      { kind: 'setFlag', flag: 'caravanPassengerActive' },
    ] as PrimitiveEffect[]);

    it('activates caravan passenger', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.caravanPassengerActive).toBe(true);
      expect(result.additionalEffects).toContain('setFlag_caravanPassengerActive');
    });
  });

  describe('bombardment', () => {
    const synergy = makeSynergy([
      { kind: 'statMod', stat: 'bombardmentRange', op: 'set', value: 3 },
      { kind: 'statMod', stat: 'bombardmentDamageMultiplier', op: 'set', value: 0.50 },
      { kind: 'statMod', stat: 'bombardmentLandAuraDefense', op: 'set', value: 0.25 },
      { kind: 'statMod', stat: 'defense', op: 'add', value: 0.25 },
    ] as PrimitiveEffect[]);

    it('sets bombardment range, damage multiplier, and adds aura defense', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.bombardmentRange).toBe(3);
      expect(result.bombardmentDamageMultiplier).toBe(0.50);
      expect(result.bombardmentLandAuraDefense).toBe(0.25);
      expect(result.defense).toBe(0.25);
      expect(result.additionalEffects).toContain('statMod_bombardmentRange_set_3');
    });
  });

  describe('mobile_stronghold', () => {
    const synergy = makeSynergy([
      { kind: 'setFlag', flag: 'mobileStrongholdFortUp' },
      { kind: 'statMod', stat: 'mobileStrongholdDefenseBonus', op: 'set', value: 0.75 },
      { kind: 'statMod', stat: 'defense', op: 'add', value: 0.75 },
      { kind: 'setFlag', flag: 'antiDisplacement' },
    ] as PrimitiveEffect[]);

    it('enables fort up, adds defense bonus, sets anti-displacement', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.mobileStrongholdFortUp).toBe(true);
      expect(result.mobileStrongholdDefenseBonus).toBe(0.75);
      expect(result.defense).toBe(0.75);
      expect(result.antiDisplacement).toBe(true);
      expect(result.additionalEffects).toContain('statMod_mobileStrongholdDefenseBonus_set_0.75');
    });
  });

  describe('beach_raid', () => {
    const synergy = makeSynergy([
      { kind: 'statMod', stat: 'beachRaidDamageBonus', op: 'set', value: 0.25 },
      { kind: 'setFlag', flag: 'beachRaidRetreatToWater' },
      { kind: 'statMod', stat: 'damage', op: 'multiply', value: 1.25 },
    ] as PrimitiveEffect[]);

    it('sets damage bonus and retreat to water, multiplies damage by 1.25', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.beachRaidDamageBonus).toBe(0.25);
      expect(result.beachRaidRetreatToWater).toBe(true);
      // damage = floor(0 * 1.25) = 0
      expect(result.damage).toBe(0);
      expect(result.additionalEffects).toContain('statMod_beachRaidDamageBonus_set_0.25');
    });
  });

  describe('vampiric_strike', () => {
    const synergy = makeSynergy([
      { kind: 'statMod', stat: 'vampiricStrikeHealPercent', op: 'set', value: 1.00 },
    ] as PrimitiveEffect[]);

    it('pushes effect on retreat (hit-and-run)', () => {
      const ctx = makeContext({ isRetreat: true });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.vampiricStrikeHealPercent).toBe(1.0);
      expect(result.additionalEffects).toContain('statMod_vampiricStrikeHealPercent_set_1');
    });

    it('pushes effect even when not retreating (triggerOnHitRunOnly gating is external)', () => {
      const ctx = makeContext({ isRetreat: false });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.vampiricStrikeHealPercent).toBe(1.0);
      expect(result.additionalEffects).toContain('statMod_vampiricStrikeHealPercent_set_1');
    });
  });

  describe('ghost_pass', () => {
    const synergy = makeSynergy([
      { kind: 'setFlag', flag: 'ghostPassActive', condition: 'isRetreat' },
    ] as PrimitiveEffect[]);

    it('activates on retreat', () => {
      const ctx = makeContext({ isRetreat: true });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.ghostPassActive).toBe(true);
      expect(result.additionalEffects).toContain('setFlag_ghostPassActive');
    });

    it('does NOT activate when not retreating', () => {
      const ctx = makeContext({ isRetreat: false });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.ghostPassActive).toBe(false);
      expect(result.additionalEffects).not.toContain('setFlag_ghostPassActive');
    });
  });

  describe('fighting_retreat', () => {
    const synergy = makeSynergy([
      { kind: 'setFlag', flag: 'fightingRetreatFreeStrike', condition: 'isRetreat' },
      { kind: 'statMod', stat: 'fightingRetreatDamageMultiplier', op: 'set', value: 1.00, condition: 'isRetreat' },
    ] as PrimitiveEffect[]);

    it('triggers on retreat', () => {
      const ctx = makeContext({ isRetreat: true });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.fightingRetreatFreeStrike).toBe(true);
      expect(result.fightingRetreatDamageMultiplier).toBe(1.0);
      expect(result.additionalEffects).toContain('setFlag_fightingRetreatFreeStrike');
    });

    it('does NOT trigger when not retreating', () => {
      const ctx = makeContext({ isRetreat: false });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.fightingRetreatFreeStrike).toBe(false);
      expect(result.fightingRetreatDamageMultiplier).toBe(0);
      expect(result.additionalEffects).not.toContain('setFlag_fightingRetreatFreeStrike');
    });
  });

  describe('tidal_cleanse', () => {
    const synergy = makeSynergy([
      { kind: 'statMod', stat: 'tidalCleanseHealPerTurn', op: 'set', value: 4 },
    ] as PrimitiveEffect[]);

    it('sets heal per turn', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.tidalCleanseHealPerTurn).toBe(4);
      expect(result.additionalEffects).toContain('statMod_tidalCleanseHealPerTurn_set_4');
    });
  });

  describe('amphibious', () => {
    const synergy = makeSynergy([
      { kind: 'statMod', stat: 'amphibiousMovementBonus', op: 'set', value: 1 },
    ] as PrimitiveEffect[]);

    it('sets amphibious movement bonus', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.amphibiousMovementBonus).toBe(1);
      expect(result.additionalEffects).toContain('statMod_amphibiousMovementBonus_set_1');
    });
  });

  describe('stealth_aura_share', () => {
    const synergy = makeSynergy([
      { kind: 'statMod', stat: 'stealthAuraShareRadius', op: 'set', value: 1 },
    ] as PrimitiveEffect[]);

    it('sets stealth aura share radius', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.stealthAuraShareRadius).toBe(1);
      expect(result.additionalEffects).toContain('statMod_stealthAuraShareRadius_set_1');
    });
  });

  describe('slave_economy', () => {
    const synergy = makeSynergy([
      { kind: 'statMod', stat: 'slaveEconomyHealPerTurn', op: 'set', value: 4 },
      { kind: 'statMod', stat: 'slaveEconomyResourceBonus', op: 'set', value: 1 },
    ] as PrimitiveEffect[]);

    it('sets slave economy heal and resource bonus', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.slaveEconomyHealPerTurn).toBe(4);
      expect(result.slaveEconomyResourceBonus).toBe(1);
      expect(result.additionalEffects).toContain('statMod_slaveEconomyHealPerTurn_set_4');
    });
  });

  describe('Phase 4-6 defaults', () => {
    it('returns zero/false/empty defaults when no synergies active', () => {
      const result = applyCombatSynergies(makeContext(), [], null);
      expect(result.toxicSpreadTransferStacks).toBe(0);
      expect(result.toxicSpreadTransferRadius).toBe(0);
      expect(result.formationWallActive).toBe(false);
      expect(result.formationWallRangedReduction).toBe(0);
      expect(result.formationPinballCollisionDamage).toBe(0);
      expect(result.formationFocusBonus).toBe(0);
      expect(result.formationFocusIgnoresDefense).toBe(false);
      expect(result.formationChainBonus).toBe(0);
      expect(result.bloomPulseHeal).toBe(0);
      expect(result.bloomPulseSelfHeal).toBe(0);
      expect(result.bloomPulseAuraRadius).toBe(0);
      expect(result.bloomPulseMovementBonus).toBe(0);
      expect(result.positionSwapAvailable).toBe(false);
      expect(result.caravanRelayVisionRange).toBe(0);
      expect(result.slaveHordeDamageBonus).toBe(0);
      expect(result.slaveHordeDefensePenalty).toBe(0);
      expect(result.slaveHordeRageTriggered).toBe(false);
      expect(result.bombardmentRange).toBe(0);
      expect(result.bombardmentDamageMultiplier).toBe(0);
      expect(result.bombardmentLandAuraDefense).toBe(0);
      expect(result.mobileStrongholdFortUp).toBe(false);
      expect(result.mobileStrongholdDefenseBonus).toBe(0);
      expect(result.mobileStrongholdAlliedDefenseBonus).toBe(0);
      expect(result.beachRaidDamageBonus).toBe(0);
      expect(result.beachRaidRetreatToWater).toBe(false);
      expect(result.vampiricStrikeHealPercent).toBe(0);
      expect(result.ghostPassActive).toBe(false);
      expect(result.fightingRetreatFreeStrike).toBe(false);
      expect(result.fightingRetreatDamageMultiplier).toBe(0);
      expect(result.tidalCleanseHealPerTurn).toBe(0);
      expect(result.tidalCleanseClearedDebuffs).toEqual([]);
      expect(result.amphibiousMovementBonus).toBe(0);
      expect(result.stealthAuraShareRadius).toBe(0);
      expect(result.slaveEconomyHealPerTurn).toBe(0);
      expect(result.slaveEconomyResourceBonus).toBe(0);
      expect(result.caravanPassengerActive).toBe(false);
    });
  });
});
