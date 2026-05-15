// Apply synergy effects to combat and healing via primitive dispatch.

import type {
  ActiveSynergy,
  ActiveTripleStack,
  CombatContext,
  SynergyCombatResult,
  HealingContext,
} from './synergyTypes.js';
import { resolvePrimitives } from './primitiveDispatcher.js';

export type {
  CombatContext,
  SynergyCombatResult,
  HealingContext,
} from './synergyTypes.js';
export type CombatResult = SynergyCombatResult;

export function makeEmptyResult(): SynergyCombatResult {
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
    emergentSmiteBonus: 0,
    emergentPermanentStealthTerrains: [],
    emergentCaptureBonus: 0,
    emergentDesertCaptureBonus: 0,
    emergentPoisonPerHit: 0,
    emergentDamageReflection: 0,
    emergentKnockbackOnKill: 0,
    emergentDamageBehindPercent: 0,
    emergentFreeReposition: 0,
    emergentArmorPierce: 0,
    emergentCaptureBelowHpPercent: 0,
    emergentBonusDamageAdjacentWater: 0,
    emergentUndying: false,
    emergentIgnoreZoc: false,
    emergentCrushZoneRadius: 0,
    emergentCrushZoneMovementPenalty: 0,
    emergentManyFacedStance: '',
    emergentManyFacedDefense: 0,
    emergentManyFacedReflection: 0,
    emergentManyFacedDamage: 0,
    emergentManyFacedRangeBonus: 0,
    emergentManyFacedMovementBonus: 0,
    multiplierStackValue: 0,
    dugInDefense: 0,
    auraOverlapDefense: 0,
    toxicSpreadTransferRadius: 0,
    toxicSpreadTransferStacks: 0,
    formationWallActive: false,
    formationWallRangedReduction: 0,
    formationPinballCollisionDamage: 0,
    formationFocusBonus: 0,
    formationFocusIgnoresDefense: false,
    formationChainBonus: 0,
    bloomPulseHeal: 0,
    bloomPulseSelfHeal: 0,
    bloomPulseAuraRadius: 0,
    bloomPulseMovementBonus: 0,
    positionSwapAvailable: false,
    caravanRelayVisionRange: 0,
    slaveHordeDamageBonus: 0,
    slaveHordeDefensePenalty: 0,
    slaveHordeRageTriggered: false,
    bombardmentRange: 0,
    bombardmentDamageMultiplier: 0,
    bombardmentLandAuraDefense: 0,
    mobileStrongholdFortUp: false,
    mobileStrongholdDefenseBonus: 0,
    mobileStrongholdAlliedDefenseBonus: 0,
    beachRaidDamageBonus: 0,
    beachRaidRetreatToWater: false,
    vampiricStrikeHealPercent: 0,
    ghostPassActive: false,
    fightingRetreatFreeStrike: false,
    fightingRetreatDamageMultiplier: 0,
    tidalCleanseHealPerTurn: 0,
    tidalCleanseClearedDebuffs: [],
    amphibiousMovementBonus: 0,
    stealthAuraShareRadius: 0,
    slaveEconomyHealPerTurn: 0,
    slaveEconomyResourceBonus: 0,
    caravanPassengerActive: false,
    countsAsCity: false,
    transportedTroopsStealth: false,
    synergyFlatHeal: 0,
    synergyPercentHealMaxHp: 0,
    reEnterStealthAfterCombat: false,
    // New emergent wiring fields
    emergentPermanentStealth: false,
    emergentTerraformCharges: 0,
    emergentPhaseDistance: 0,
    emergentKillChainRedeployRange: 0,
    emergentPoisonCloudPreventsHealing: false,
  };
}

// --- Public API ---

export function applyCombatSynergies(
  context: CombatContext,
  synergies: ActiveSynergy[],
  tripleStack: ActiveTripleStack | null,
): SynergyCombatResult {
  const result = makeEmptyResult();

  for (const synergy of synergies) {
    resolvePrimitives(synergy.effects, context, result);
  }

  if (tripleStack) {
    resolvePrimitives(tripleStack.emergentRule.effects, context, result);
  }

  if (context.isStealthAttack && context.attackerTags.includes('stealth')) {
    result.damage = Math.floor(result.damage * 1.5);
    result.additionalEffects.push('ambush_damage');
  }

  return result;
}

export function applyHealingSynergies(
  context: HealingContext,
  synergies: ActiveSynergy[],
): number {
  let healAmount = context.baseHeal;

  for (const synergy of synergies) {
    for (const p of synergy.effects) {
      if (p.kind === 'heal') {
        switch (p.mode) {
          case 'flat':
            healAmount += p.amount;
            break;
          case 'percentMaxHp':
          case 'percentDamage':
            healAmount += Math.floor(context.baseHeal * p.amount);
            break;
        }
      }
      if (p.kind === 'statMod' && p.stat === 'heavyRegenPercent') {
        healAmount += Math.max(1, Math.floor(context.baseHeal * p.value));
      }
    }
  }

  return healAmount;
}
