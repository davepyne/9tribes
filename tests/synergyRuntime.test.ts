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
    emergentSustainHealPercent: 0,
    emergentSustainMinHp: 0,
    emergentPermanentStealthTerrains: [],
    emergentCaptureBonus: 0,
    emergentDesertCaptureBonus: 0,
    multiplierStackValue: 0,
    dugInDefense: 0,
    auraOverlapDefense: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// calculateSynergyAttackBonus
// ---------------------------------------------------------------------------

describe('calculateSynergyAttackBonus', () => {
  it('returns 0 when multiplierStackValue is 0', () => {
    const result = makeResult();
    expect(calculateSynergyAttackBonus(result)).toBe(0);
  });

  it('returns 0 when multiplierStackValue is absent (default)', () => {
    const result = makeResult();
    expect(calculateSynergyAttackBonus(result)).toBe(0);
  });

  it('extracts bonus from multiplierStackValue 2.0', () => {
    const result = makeResult({ multiplierStackValue: 2.0 });
    expect(calculateSynergyAttackBonus(result)).toBe(1.0);
  });

  it('extracts bonus from multiplierStackValue 1.5', () => {
    const result = makeResult({ multiplierStackValue: 1.5 });
    expect(calculateSynergyAttackBonus(result)).toBe(0.5);
  });

  it('extracts bonus from multiplierStackValue 3', () => {
    const result = makeResult({ multiplierStackValue: 3 });
    expect(calculateSynergyAttackBonus(result)).toBe(2);
  });

  it('extracts bonus from multiplierStackValue 2.5', () => {
    const result = makeResult({ multiplierStackValue: 2.5 });
    expect(calculateSynergyAttackBonus(result)).toBe(1.5);
  });
});

// ---------------------------------------------------------------------------
// calculateSynergyDefenseBonus
// ---------------------------------------------------------------------------

describe('calculateSynergyDefenseBonus', () => {
  it('returns 0 when no structured defense bonuses present', () => {
    const result = makeResult();
    expect(calculateSynergyDefenseBonus(result)).toBe(0);
  });

  it('returns 0 when only unrelated fields are set', () => {
    const result = makeResult({
      additionalEffects: ['charge_shield', 'lethal_ambush', 'heavy_poison'],
    });
    expect(calculateSynergyDefenseBonus(result)).toBe(0);
  });

  it('returns dugInDefense value', () => {
    const result = makeResult({ dugInDefense: 0.75 });
    expect(calculateSynergyDefenseBonus(result)).toBe(0.75);
  });

  it('returns auraOverlapDefense value', () => {
    const result = makeResult({ auraOverlapDefense: 0.5 });
    expect(calculateSynergyDefenseBonus(result)).toBe(0.5);
  });

  it('returns sum when both dugInDefense and auraOverlapDefense are set', () => {
    const result = makeResult({ dugInDefense: 0.75, auraOverlapDefense: 0.5 });
    expect(calculateSynergyDefenseBonus(result)).toBe(1.25);
  });

  it('returns sum when both defense bonuses present with unrelated effects', () => {
    const result = makeResult({
      dugInDefense: 0.75,
      auraOverlapDefense: 0.5,
      additionalEffects: ['dug_in', 'lethal_ambush', 'heavy_poison', 'aura_overlap'],
    });
    expect(calculateSynergyDefenseBonus(result)).toBe(1.25);
  });

  it('reads defense values directly from structured fields', () => {
    const result = makeResult({ dugInDefense: 0.75 });
    expect(calculateSynergyDefenseBonus(result)).toBe(0.75);
  });
});
