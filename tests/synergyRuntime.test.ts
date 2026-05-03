import {
  calculateSynergyAttackBonus,
  calculateSynergyDefenseBonus,
} from '../src/systems/synergyRuntime';
import type { CombatResult } from '../src/systems/synergyEffects';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResult(overrides: Partial<CombatResult> = {}): CombatResult {
  return {
    damage: 0,
    defense: 0,
    knockbackDistance: 0,
    strikeFirst: false,
    noRetaliation: false,
    poisonStacks: 0,
    frostbiteStacks: 0,
    slowDuration: 0,
    poisonTrapPositions: [],
    routTriggered: false,
    additionalEffects: [],
    chargeShield: false,
    antiDisplacement: false,
    healOnRetreatAmount: 0,
    swarmSpeedBonus: 0,
    sandstormDamage: 0,
    sandstormAccuracyDebuff: 0,
    witheringReduction: 0,
    poisonTrapDamage: 0,
    poisonTrapSlow: 0,
    contaminateActive: false,
    frostbiteColdDoT: 0,
    frostbiteSlow: 0,
    stealthChargeMultiplier: 0,
    routThresholdOverride: null,
    aoeDamage: 0,
    damageReflection: 0,
    instantKill: false,
    lethalAmbushPoison: 0,
    chargeCooldownWaived: false,
    formationCrushStacks: 0,
    stunDuration: 0,
    armorPiercing: 0,
    capturePoisonDamage: 0,
    capturePoisonStacks: 0,
    slaveDamageBonus: 0,
    slaveHealPenalty: 0,
    chargeCaptureChance: 0,
    retreatCaptureChance: 0,
    navalCaptureBonus: 0,
    stealthCaptureBonus: 0,
    captureEscapePrevented: false,
    heavyRetreatDamageReduction: 0,
    coastalNomadDefense: 0,
    coastalNomadSpeed: 0,
    heavyNavalRamDamage: 0,
    slaveHealAmount: 0,
    heavyRegenPercent: 0,
    terrainSlaveSpeed: 0,
    sandstormAuraRadius: 0,
    sandstormAuraDebuff: 0,
    slaveArmyDamageBonus: 0,
    slaveArmyDefensePenalty: 0,
    slaveCoercionDamageBonus: 0,
    heavyMassStacks: 0,
    // Phase 4: emergent rule fields
    emergentSustainHealPercent: 0,
    emergentSustainMinHp: 0,
    emergentPermanentStealthTerrains: [],
    emergentCaptureBonus: 0,
    emergentDesertCaptureBonus: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// calculateSynergyAttackBonus
// ---------------------------------------------------------------------------

describe('calculateSynergyAttackBonus', () => {
  it('returns 0 when additionalEffects is empty', () => {
    const result = makeResult();
    expect(calculateSynergyAttackBonus(result)).toBe(0);
  });

  it('returns 0 when no poison_multiplier effect present', () => {
    const result = makeResult({
      additionalEffects: ['dug_in', 'aura_overlap', 'charge_shield'],
    });
    expect(calculateSynergyAttackBonus(result)).toBe(0);
  });

  it('returns 0 when multiplier effect present but no valid pattern', () => {
    // Effect contains "poison_multiplier" but no "N.xx" pattern
    const result = makeResult({
      additionalEffects: ['poison_multiplier_invalid'],
    });
    expect(calculateSynergyAttackBonus(result)).toBe(0);
  });

  it('extracts bonus from poison_multiplier_2.0x', () => {
    // bonus = 2.0 - 1 = 1.0
    const result = makeResult({
      additionalEffects: ['dug_in', 'poison_multiplier_2.0x'],
    });
    expect(calculateSynergyAttackBonus(result)).toBe(1.0);
  });

  it('extracts bonus from poison_multiplier_1.5x', () => {
    const result = makeResult({
      additionalEffects: ['poison_multiplier_1.5x'],
    });
    expect(calculateSynergyAttackBonus(result)).toBe(0.5);
  });

  it('extracts bonus from poison_multiplier_3x', () => {
    const result = makeResult({
      additionalEffects: ['poison_multiplier_3x'],
    });
    expect(calculateSynergyAttackBonus(result)).toBe(2);
  });

  it('only uses the first multiplier match', () => {
    const result = makeResult({
      additionalEffects: ['poison_multiplier_2.5x', 'poison_multiplier_1.2x'],
    });
    expect(calculateSynergyAttackBonus(result)).toBe(1.5);
  });
});

// ---------------------------------------------------------------------------
// calculateSynergyDefenseBonus
// ---------------------------------------------------------------------------

describe('calculateSynergyDefenseBonus', () => {
  it('returns 0 when additionalEffects is empty', () => {
    const result = makeResult();
    expect(calculateSynergyDefenseBonus(result)).toBe(0);
  });

  it('returns 0 when no relevant effects present', () => {
    const result = makeResult({
      additionalEffects: ['charge_shield', 'lethal_ambush', 'heavy_poison'],
    });
    expect(calculateSynergyDefenseBonus(result)).toBe(0);
  });

  it('returns 0.75 when dug_in is present', () => {
    const result = makeResult({
      additionalEffects: ['dug_in'],
    });
    expect(calculateSynergyDefenseBonus(result)).toBe(0.75);
  });

  it('returns 0.5 when aura_overlap is present', () => {
    const result = makeResult({
      additionalEffects: ['aura_overlap'],
    });
    expect(calculateSynergyDefenseBonus(result)).toBe(0.5);
  });

  it('returns 1.25 when both dug_in and aura_overlap are present', () => {
    const result = makeResult({
      additionalEffects: ['dug_in', 'aura_overlap'],
    });
    expect(calculateSynergyDefenseBonus(result)).toBe(1.25);
  });

  it('additional unrelated effects do not affect the bonus', () => {
    const result = makeResult({
      additionalEffects: ['dug_in', 'lethal_ambush', 'heavy_poison', 'aura_overlap'],
    });
    expect(calculateSynergyDefenseBonus(result)).toBe(1.25);
  });

  it('is case-sensitive: "Dug_In" or "DUG_IN" does not match', () => {
    const result = makeResult({
      additionalEffects: ['DUG_IN', 'dug_in'],
    });
    // Only the lowercase 'dug_in' matches
    expect(calculateSynergyDefenseBonus(result)).toBe(0.75);
  });
});
