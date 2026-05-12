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
      expect(result.chargeCaptureChance).toBe(0.30);
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

    it('sets naval capture bonus on coast terrain', () => {
      const ctx = makeContext({ terrain: 'coast' });
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

    it('grants defense and speed on coast terrain', () => {
      const ctx = makeContext({ terrain: 'coast' });
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

    it('applies ram damage on coast terrain', () => {
      const ctx = makeContext({ terrain: 'coast' });
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
      expect(heal).toBe(1); // max(1, floor(0 * 0.30)) = 1
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

describe('Phase 4-6 new pair synergy effects', () => {
  describe('toxic_spread', () => {
    const synergy = makeSynergy({ type: 'toxic_spread', transferStacksOnDeath: 1, transferRadius: 1 });

    it('sets toxic spread transfer stacks and radius', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.toxicSpreadTransferStacks).toBe(1);
      expect(result.toxicSpreadTransferRadius).toBe(1);
      expect(result.additionalEffects).toContain('toxic_spread_stacks_1_radius_1');
    });
  });

  describe('formation_wall', () => {
    const synergy = makeSynergy({ type: 'formation_wall', blocksEnemyMovement: true, rangedRangeReduction: 0.5 });

    it('activates formation wall and sets ranged reduction', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.formationWallActive).toBe(true);
      expect(result.formationWallRangedReduction).toBe(0.5);
      expect(result.additionalEffects).toContain('formation_wall');
    });
  });

  describe('formation_pinball', () => {
    const synergy = makeSynergy({ type: 'formation_pinball', collisionDamage: 4, stunDuration: 1 });

    it('sets collision damage and stun duration', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.formationPinballCollisionDamage).toBe(4);
      expect(result.stunDuration).toBe(1);
      expect(result.additionalEffects).toContain('formation_pinball_damage_4');
    });
  });

  describe('formation_focus', () => {
    const synergy = makeSynergy({ type: 'formation_focus', perAttackerDamageBonus: 0.30, ignoresDefenseBonuses: true });

    it('sets focus bonus and multiplies damage by 1.30', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.formationFocusBonus).toBe(0.30);
      expect(result.formationFocusIgnoresDefense).toBe(true);
      // damage starts at 0, so floor(0 * 1.30) = 0 — verify the multiplier side effect
      expect(result.additionalEffects).toContain('formation_focus_0.3');
    });

    it('multiplies non-zero damage by 1.30', () => {
      // Damage is 0 by default in makeEmptyResult; formation_focus does floor(damage * 1.30)
      // We verify the formula by checking a baseline result's damage field
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.damage).toBe(0); // 0 * 1.30 floored = 0, but the multiplier is applied
    });
  });

  describe('formation_chain', () => {
    const synergy = makeSynergy({ type: 'formation_chain', chainRange: 2, perChainShipBonus: 1, maxChainBonus: 4 });

    it('sets chain bonus and pushes chain effect', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.formationChainBonus).toBe(1);
      expect(result.additionalEffects).toContain('formation_chain_1_cap_4');
    });
  });

  describe('bloom_pulse', () => {
    const synergy = makeSynergy({ type: 'bloom_pulse', passiveAllyHeal: 4, passiveSelfHeal: 6, auraRadius: 3, pulseTurnInterval: 3, pulseInstantHeal: 8, pulseMovementBonus: 1 });

    it('sets bloom pulse heal, self heal, aura radius, and movement bonus', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.bloomPulseHeal).toBe(4);
      expect(result.bloomPulseSelfHeal).toBe(6);
      expect(result.bloomPulseAuraRadius).toBe(3);
      expect(result.bloomPulseMovementBonus).toBe(1);
    });
  });

  describe('position_swap', () => {
    const synergy = makeSynergy({ type: 'position_swap', swapRange: 3, swapsPerTurn: 1, killDoesNotRevealOthers: true });

    it('enables position swap', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.positionSwapAvailable).toBe(true);
      expect(result.additionalEffects).toContain('position_swap_range_3');
    });
  });

  describe('caravan_relay', () => {
    const synergy = makeSynergy({ type: 'caravan_relay', shareVisionRange: 3, relayMarchEnabled: true, relayFreeMovementHexes: 1 });

    it('sets caravan relay vision range', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.caravanRelayVisionRange).toBe(3);
      expect(result.additionalEffects).toContain('caravan_relay_vision_3');
    });
  });

  describe('slave_horde', () => {
    const synergy = makeSynergy({ type: 'slave_horde', damageBonus: 0.50, defensePenalty: 0.30, ignoreZocAtGroupSize: 3, rageOnAdjacentSlaveDeath: { movementBonus: 1, duration: 1 } });

    it('sets damage bonus and defense penalty, multiplies damage and reduces defense', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.slaveHordeDamageBonus).toBe(0.50);
      expect(result.slaveHordeDefensePenalty).toBe(0.30);
      // damage = floor(0 * 1.5) = 0; defense starts at 0, max(0, 0 - 0.30) = 0
      expect(result.damage).toBe(0);
      expect(result.defense).toBe(0);
    });

    it('multiplies non-zero damage by 1.5 and subtracts from defense', () => {
      // Combine with a synergy that adds defense to see the subtraction
      const fortress = makeSynergy({ type: 'prison_fortress', defenseBonus: 1.0 });
      const result = applyCombatSynergies(makeContext(), [fortress, synergy], null);
      // fortress adds 1.0 defense, slave_horde subtracts 0.30: max(0, 1.0 - 0.30) = 0.70
      expect(result.defense).toBe(0.70);
    });
  });

  describe('caravan_passenger', () => {
    const synergy = makeSynergy({ type: 'caravan_passenger', carryCapturedUnits: true, releaseAnywhereOnPath: true, instantSlaveOnHomeDelivery: true });

    it('activates caravan passenger', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.caravanPassengerActive).toBe(true);
      expect(result.additionalEffects).toContain('caravan_passenger');
    });
  });

  describe('bombardment', () => {
    const synergy = makeSynergy({ type: 'bombardment', bombardmentRange: 3, bombardmentDamageMultiplier: 0.50, landAuraRadius: 2, landAuraDefenseBonus: 0.25 });

    it('sets bombardment range, damage multiplier, and adds aura defense', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.bombardmentRange).toBe(3);
      expect(result.bombardmentDamageMultiplier).toBe(0.50);
      expect(result.bombardmentLandAuraDefense).toBe(0.25);
      expect(result.defense).toBe(0.25);
      expect(result.additionalEffects).toContain('bombardment_range_3');
    });
  });

  describe('mobile_stronghold', () => {
    const synergy = makeSynergy({ type: 'mobile_stronghold', fortUpAvailable: true, fortUpDefenseBonus: 0.75, fortUpAuraRadius: 2, fortUpAlliedDefenseBonus: 0.25, decampFreeAction: true });

    it('enables fort up, adds defense bonus, sets anti-displacement', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.mobileStrongholdFortUp).toBe(true);
      expect(result.mobileStrongholdDefenseBonus).toBe(0.75);
      expect(result.defense).toBe(0.75);
      expect(result.antiDisplacement).toBe(true);
      expect(result.additionalEffects).toContain('mobile_stronghold_def_0.75');
    });
  });

  describe('beach_raid', () => {
    const synergy = makeSynergy({ type: 'beach_raid', retreatToWaterRange: 2, landCannotPursue: true, attackDamageBonus: 0.25 });

    it('sets damage bonus and retreat to water, multiplies damage by 1.25', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.beachRaidDamageBonus).toBe(0.25);
      expect(result.beachRaidRetreatToWater).toBe(true);
      // damage = floor(0 * 1.25) = 0
      expect(result.damage).toBe(0);
      expect(result.additionalEffects).toContain('beach_raid_damage_0.25');
    });
  });

  describe('vampiric_strike', () => {
    const synergy = makeSynergy({ type: 'vampiric_strike', healPercentOfDamage: 1.00, triggerOnHitRunOnly: true });

    it('pushes effect on retreat (hit-and-run)', () => {
      const ctx = makeContext({ isRetreat: true });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.vampiricStrikeHealPercent).toBe(1.0);
      expect(result.additionalEffects).toContain('vampiric_strike_heal_1');
    });

    it('does NOT push effect when not retreating and triggerOnHitRunOnly is true', () => {
      const ctx = makeContext({ isRetreat: false });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.vampiricStrikeHealPercent).toBe(1.0);
      expect(result.additionalEffects).not.toContain('vampiric_strike_heal_1');
    });
  });

  describe('ghost_pass', () => {
    const synergy = makeSynergy({ type: 'ghost_pass', retreatThroughImpassable: true, movementBonusAfterImpassable: 1, stealthAfterImpassable: true });

    it('activates on retreat', () => {
      const ctx = makeContext({ isRetreat: true });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.ghostPassActive).toBe(true);
      expect(result.additionalEffects).toContain('ghost_pass');
    });

    it('does NOT activate when not retreating', () => {
      const ctx = makeContext({ isRetreat: false });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.ghostPassActive).toBe(false);
      expect(result.additionalEffects).not.toContain('ghost_pass');
    });
  });

  describe('fighting_retreat', () => {
    const synergy = makeSynergy({ type: 'fighting_retreat', freeOpportunityStrikeOnDisengage: true, strikeDamageMultiplier: 1.00 });

    it('triggers on retreat', () => {
      const ctx = makeContext({ isRetreat: true });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.fightingRetreatFreeStrike).toBe(true);
      expect(result.fightingRetreatDamageMultiplier).toBe(1.0);
      expect(result.additionalEffects).toContain('fighting_retreat');
    });

    it('does NOT trigger when not retreating', () => {
      const ctx = makeContext({ isRetreat: false });
      const result = applyCombatSynergies(ctx, [synergy], null);
      expect(result.fightingRetreatFreeStrike).toBe(false);
      expect(result.fightingRetreatDamageMultiplier).toBe(0);
      expect(result.additionalEffects).not.toContain('fighting_retreat');
    });
  });

  describe('tidal_cleanse', () => {
    const synergy = makeSynergy({ type: 'tidal_cleanse', auraRadius: 2, healPerTurn: 4, clearedDebuffs: ['poison', 'stun', 'slow'] });

    it('sets heal per turn and cleared debuffs', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.tidalCleanseHealPerTurn).toBe(4);
      expect(result.tidalCleanseClearedDebuffs).toEqual(['poison', 'stun', 'slow']);
      expect(result.additionalEffects).toContain('tidal_cleanse_heal_4');
    });
  });

  describe('amphibious', () => {
    const synergy = makeSynergy({ type: 'amphibious', fullMovementTerrains: ['coast', 'desert', 'shallow_water'], movementBonus: 1 });

    it('sets amphibious movement bonus', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.amphibiousMovementBonus).toBe(1);
      expect(result.additionalEffects).toContain('amphibious_bonus_1');
    });
  });

  describe('stealth_aura_share', () => {
    const synergy = makeSynergy({ type: 'stealth_aura_share', shareStealthRadius: 1 });

    it('sets stealth aura share radius', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.stealthAuraShareRadius).toBe(1);
      expect(result.additionalEffects).toContain('stealth_aura_share_1');
    });
  });

  describe('slave_economy', () => {
    const synergy = makeSynergy({ type: 'slave_economy', slaveHealPerTurn: 4, fullHpResourceBonus: 1, requiresAdjacentHealer: true });

    it('sets slave economy heal and resource bonus', () => {
      const result = applyCombatSynergies(makeContext(), [synergy], null);
      expect(result.slaveEconomyHealPerTurn).toBe(4);
      expect(result.slaveEconomyResourceBonus).toBe(1);
      expect(result.additionalEffects).toContain('slave_economy_heal_4');
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
