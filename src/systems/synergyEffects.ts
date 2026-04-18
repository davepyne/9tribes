// Apply synergy effects to combat, movement, healing
// This is where the mechanical effects are implemented

import type { ActiveSynergy, ActiveTripleStack, SynergyEffect } from './synergyEngine';

export interface CombatContext {
  attackerId: string;
  defenderId: string;
  attackerTags: string[];
  defenderTags: string[];
  attackerHp: number;
  defenderHp: number;
  terrain: string;
  isCharge: boolean;
  isStealthAttack: boolean;
  isRetreat: boolean;
  isStealthed: boolean;
  position: { x: number; y: number };
  attackerPosition: { x: number; y: number };
  defenderPosition: { x: number; y: number };
}

export interface CombatResult {
  damage: number;
  defense: number;
  knockbackDistance: number;
  strikeFirst: boolean;
  noRetaliation: boolean;
  poisonStacks: number;
  frostbiteStacks: number;
  slowDuration: number;
  poisonTrapPositions: { x: number; y: number }[];
  routTriggered: boolean;
  additionalEffects: string[];
  // Phase 3: real game-mechanic fields
  chargeShield: boolean;
  antiDisplacement: boolean;
  healOnRetreatAmount: number;
  swarmSpeedBonus: number;
  sandstormDamage: number;
  sandstormAccuracyDebuff: number;
  witheringReduction: number;
  poisonTrapDamage: number;
  poisonTrapSlow: number;
  contaminateActive: boolean;
  frostbiteColdDoT: number;
  frostbiteSlow: number;
  stealthChargeMultiplier: number;
  routThresholdOverride: number | null;
  aoeDamage: number;
  damageReflection: number;
  // Phase 3A: synergy effect fields
  instantKill: boolean;
  lethalAmbushPoison: number;
  chargeCooldownWaived: boolean;
  formationCrushStacks: number;
  stunDuration: number;
  armorPiercing: number;
  // Phase 3B: capture synergy fields
  capturePoisonDamage: number;
  capturePoisonStacks: number;
  slaveDamageBonus: number;
  slaveHealPenalty: number;
  chargeCaptureChance: number;
  retreatCaptureChance: number;
  navalCaptureBonus: number;
  stealthCaptureBonus: number;
  // Phase 3C: lower-value synergy fields
  captureEscapePrevented: boolean;
  heavyRetreatDamageReduction: number;
  coastalNomadDefense: number;
  coastalNomadSpeed: number;
  heavyNavalRamDamage: number;
  slaveHealAmount: number;
  heavyRegenPercent: number;
  terrainSlaveSpeed: number;
  sandstormAuraRadius: number;
  sandstormAuraDebuff: number;
  slaveArmyDamageBonus: number;
  slaveArmyDefensePenalty: number;
  slaveCoercionDamageBonus: number;
  heavyMassStacks: number;
  // Phase 4: emergent rule fields
  emergentSustainHealPercent: number;
  emergentSustainMinHp: number;
  emergentPermanentStealthTerrains: string[];
  emergentCaptureBonus: number;
  emergentDesertCaptureBonus: number;
}

export interface HealingContext {
  unitId: string;
  unitTags: string[];
  baseHeal: number;
  position: { x: number; y: number };
  adjacentAllies: string[];
  isStealthed: boolean;
}

export function applyCombatSynergies(
  context: CombatContext,
  synergies: ActiveSynergy[],
  tripleStack: ActiveTripleStack | null,
): CombatResult {
  const result: CombatResult = {
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
    // Phase 3: real game-mechanic fields
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
    // Phase 3A: synergy effect fields
    instantKill: false,
    lethalAmbushPoison: 0,
    chargeCooldownWaived: false,
    formationCrushStacks: 0,
    stunDuration: 0,
    armorPiercing: 0,
    // Phase 3B: capture synergy fields
    capturePoisonDamage: 0,
    capturePoisonStacks: 0,
    slaveDamageBonus: 0,
    slaveHealPenalty: 0,
    chargeCaptureChance: 0,
    retreatCaptureChance: 0,
    navalCaptureBonus: 0,
    stealthCaptureBonus: 0,
    // Phase 3C: lower-value synergy fields
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
  };

  // Apply each active synergy effect
  for (const synergy of synergies) {
    applySynergyEffect(synergy.effect, context, result);
  }

  // Apply triple stack emergent effects
  if (tripleStack) {
    applyEmergentCombatEffects(tripleStack.emergentRule, context, result);
  }

  // Apply stealth ambush bonus
  if (context.isStealthAttack && context.attackerTags.includes('stealth')) {
    result.damage = Math.floor(result.damage * 1.5);
    result.additionalEffects.push('ambush_damage');
  }

  return result;
}

function applySynergyEffect(effect: SynergyEffect, context: CombatContext, result: CombatResult): void {
  switch (effect.type) {
    case 'poison_aura':
      result.poisonStacks += effect.damagePerTurn;
      result.additionalEffects.push(`poison_aura_radius_${effect.radius}`);
      break;

    case 'charge_shield':
      result.chargeShield = true;
      result.additionalEffects.push('charge_shield');
      break;

    case 'dug_in':
      result.defense += effect.defenseBonus;
      result.additionalEffects.push('dug_in');
      break;

    case 'land_aura':
      result.defense += effect.defenseBonus;
      result.additionalEffects.push(`land_aura_radius_${effect.radius}`);
      break;

    case 'extended_healing':
      result.additionalEffects.push(`extended_healing_radius_${effect.radius}`);
      break;

    case 'stealth_aura':
      result.additionalEffects.push(`stealth_aura_reveal_${effect.revealRadius}`);
      break;

    case 'terrain_fortress':
      result.defense += effect.defenseBonus;
      result.additionalEffects.push('terrain_fortress');
      break;

    case 'ram_attack':
      result.knockbackDistance = Math.max(result.knockbackDistance, effect.knockbackDistance);
      result.additionalEffects.push('ram_attack');
      break;

    case 'combat_healing':
      result.additionalEffects.push(`combat_healing_${effect.healPercent * 100}%`);
      break;

    case 'sandstorm':
      result.sandstormDamage = effect.aoeDamage;
      result.sandstormAccuracyDebuff = effect.accuracyDebuff;
      result.aoeDamage = effect.aoeDamage;
      result.knockbackDistance = Math.max(result.knockbackDistance, 1);
      result.additionalEffects.push(`sandstorm_damage_${effect.aoeDamage}_accuracy_debuff_${effect.accuracyDebuff}`);
      break;

    case 'double_charge':
      result.additionalEffects.push('double_charge');
      break;

    case 'poison_trap':
      if (context.isRetreat) {
        result.poisonTrapPositions.push(context.attackerPosition);
        result.additionalEffects.push('poison_trap');
      }
      result.poisonTrapDamage = effect.damagePerTurn;
      result.poisonTrapSlow = effect.slowAmount;
      break;

    case 'contaminate':
      result.contaminateActive = true;
      result.additionalEffects.push('contaminate_coastal');
      break;

    case 'withering':
      result.witheringReduction = effect.healingReduction;
      result.additionalEffects.push(`withering_healing_reduction_${effect.healingReduction * 100}%`);
      break;

    case 'stealth_healing':
      if (context.isStealthed) {
        result.additionalEffects.push('stealth_healing');
      }
      break;

    case 'terrain_poison':
      result.poisonStacks += effect.damagePerTurn;
      result.additionalEffects.push('terrain_poison');
      break;

    case 'multiplier_stack':
      result.damage = Math.floor(result.damage * effect.multiplier);
      result.additionalEffects.push(`poison_multiplier_${effect.multiplier}x`);
      break;

    case 'aura_overlap':
      result.defense += effect.stackingBonus;
      result.additionalEffects.push('aura_overlap');
      break;

    case 'stealth_recharge':
      result.additionalEffects.push('stealth_recharge');
      break;

    case 'oasis':
      result.additionalEffects.push('oasis_neutral_terrain');
      break;

    case 'permanent_stealth_terrain':
      result.additionalEffects.push('permanent_stealth_terrain');
      break;

    case 'shadow_network':
      result.additionalEffects.push('shadow_network');
      break;

    case 'nomad_network':
      result.additionalEffects.push('nomad_network');
      break;

    case 'heal_on_retreat':
      result.healOnRetreatAmount = effect.healAmount;
      if (context.isRetreat) {
        result.additionalEffects.push(`heal_on_retreat_${effect.healAmount}`);
      }
      break;

    case 'impassable_retreat':
      result.additionalEffects.push('impassable_retreat');
      break;

    case 'swarm_speed':
      result.swarmSpeedBonus = effect.speedBonus;
      result.additionalEffects.push(`swarm_speed_${effect.speedBonus}`);
      break;

    // Phase 3A: high-value dead synergies
    case 'lethal_ambush':
      if (context.isStealthAttack) {
        result.instantKill = true;
        result.lethalAmbushPoison = effect.poisonStacks;
        result.poisonStacks += effect.poisonStacks;
        result.additionalEffects.push('lethal_ambush');
      }
      break;

    case 'ambush_charge':
      if (context.isCharge && context.isStealthAttack) {
        result.damage = Math.floor(result.damage * (1 + effect.damageBonus));
        result.chargeCooldownWaived = true;
        result.additionalEffects.push('ambush_charge');
      }
      break;

    case 'formation_crush':
      result.knockbackDistance = Math.max(result.knockbackDistance, effect.knockbackDistance);
      result.stunDuration = Math.max(result.stunDuration, effect.stunDuration);
      result.formationCrushStacks += 1;
      result.additionalEffects.push(`formation_crush_stacks_${result.formationCrushStacks}`);
      break;

    case 'armor_shred':
      if (context.isStealthAttack) {
        result.armorPiercing = effect.armorPiercing;
        result.additionalEffects.push(`armor_shred_${effect.armorPiercing}`);
      }
      break;

    // Phase 3B: medium-value capture synergies
    case 'poison_capture':
      result.capturePoisonDamage = effect.damagePerTurn;
      result.capturePoisonStacks = effect.damagePerTurn;
      result.slaveDamageBonus = effect.slaveDamageBonus;
      result.slaveHealPenalty = effect.slaveHealPenalty;
      result.additionalEffects.push('poison_capture');
      break;

    case 'capture_charge':
      if (context.isCharge) {
        result.chargeCaptureChance = 0.50;
        result.knockbackDistance = Math.max(result.knockbackDistance, effect.knockbackDistance);
        result.additionalEffects.push('capture_charge');
      }
      break;

    case 'capture_retreat':
      if (context.isRetreat) {
        result.retreatCaptureChance = effect.captureChance;
        result.additionalEffects.push('capture_retreat');
      }
      break;

    case 'naval_capture':
      if (context.terrain === 'water' || context.terrain === 'river') {
        result.navalCaptureBonus = effect.coastalCaptureBonus;
        result.additionalEffects.push('naval_capture');
      }
      break;

    case 'stealth_capture':
      if (context.isStealthAttack) {
        result.stealthCaptureBonus = effect.captureChance;
        result.additionalEffects.push('stealth_capture');
      }
      break;

    // Phase 3C: lower-value dead synergies
    case 'heavy_poison':
      result.poisonStacks += 1;
      result.armorPiercing += effect.armorPiercing;
      result.additionalEffects.push('heavy_poison');
      break;

    case 'prison_fortress':
      result.defense += effect.defenseBonus;
      result.captureEscapePrevented = true;
      result.additionalEffects.push('prison_fortress');
      break;

    case 'heavy_fortress':
      result.damageReflection += effect.damageReflection;
      result.antiDisplacement = true;
      result.additionalEffects.push('heavy_fortress');
      break;

    case 'heavy_charge':
      result.stunDuration = Math.max(result.stunDuration, effect.stunDuration);
      if (context.isCharge && result.knockbackDistance > 0) {
        result.knockbackDistance = Math.ceil(result.knockbackDistance * 1.5);
      }
      result.additionalEffects.push('heavy_charge');
      break;

    case 'heavy_retreat':
      if (context.isRetreat) {
        result.heavyRetreatDamageReduction = effect.damageReduction;
        result.additionalEffects.push('heavy_retreat');
      }
      break;

    case 'coastal_nomad':
      if (context.terrain === 'coast' || context.terrain === 'water') {
        result.coastalNomadDefense = effect.defenseBonus;
        result.coastalNomadSpeed = effect.speedBonus;
        result.defense += effect.defenseBonus;
        result.additionalEffects.push('coastal_nomad');
      }
      break;

    case 'heavy_naval':
      if (context.terrain === 'water' || context.terrain === 'coast') {
        result.heavyNavalRamDamage = effect.ramDamage;
        result.additionalEffects.push('heavy_naval');
      }
      break;

    case 'slave_healing':
      result.slaveHealAmount = effect.slaveHeal;
      result.additionalEffects.push('slave_healing');
      break;

    case 'heavy_regen':
      result.heavyRegenPercent = effect.regenPercent;
      result.additionalEffects.push('heavy_regen');
      break;

    case 'terrain_slave':
      if (context.terrain === 'desert') {
        result.terrainSlaveSpeed = effect.speedBonus;
        result.additionalEffects.push('terrain_slave');
      }
      break;

    case 'sandstorm_aura':
      if (context.terrain === 'desert') {
        result.sandstormAuraRadius = effect.auraRadius;
        result.sandstormAuraDebuff = effect.enemyAccuracyDebuff;
        result.sandstormAccuracyDebuff += effect.enemyAccuracyDebuff;
        result.additionalEffects.push('sandstorm_aura');
      }
      break;

    case 'slave_army':
      result.slaveArmyDamageBonus = effect.slaveDamageBonus;
      result.slaveArmyDefensePenalty = effect.slaveDefensePenalty;
      result.additionalEffects.push('slave_army');
      break;

    case 'slave_coercion':
      result.slaveCoercionDamageBonus = effect.damageBonus;
      result.additionalEffects.push('slave_coercion');
      break;

    case 'heavy_mass':
      result.knockbackDistance = Math.max(result.knockbackDistance, effect.knockbackDistance);
      result.heavyMassStacks += 1;
      result.additionalEffects.push(`heavy_mass_stacks_${result.heavyMassStacks}`);
      break;
  }
}

function applyEmergentCombatEffects(
  emergentRule: { effect: { type: string; [key: string]: unknown } },
  context: CombatContext,
  result: CombatResult,
): void {
  switch (emergentRule.effect.type) {
    case 'sustain':
      result.emergentSustainHealPercent = emergentRule.effect.healPercentOfDamage as number;
      result.emergentSustainMinHp = emergentRule.effect.minHp as number;
      result.additionalEffects.push('paladin_sustain');
      break;

    case 'terrain_charge':
      if (context.isCharge) {
        result.damage = Math.floor(result.damage * (1 + (emergentRule.effect.nativeTerrainDamageBonus as number)));
        result.additionalEffects.push('terrain_charge_penetration');
      }
      break;

    case 'permanent_stealth':
      result.emergentPermanentStealthTerrains = (emergentRule.effect.terrainTypes ?? []) as string[];
      result.additionalEffects.push('permanent_stealth');
      break;

    case 'zone_of_control':
      result.defense += emergentRule.effect.defenseBonus as number;
      result.antiDisplacement = true;
      result.additionalEffects.push(`zone_of_control_radius_${emergentRule.effect.radius}`);
      break;

    case 'mobility_unit':
      result.additionalEffects.push('mobility_unit_ignore_terrain');
      break;

    case 'combat_unit':
      if (emergentRule.effect.doubleCombatBonuses) {
        result.damage = Math.floor(result.damage * 2);
        result.defense *= 2;
        result.additionalEffects.push('combat_unit_doubled');
      }
      break;

    case 'slave_empire':
      result.emergentCaptureBonus = emergentRule.effect.captureChanceBonus as number;
      result.additionalEffects.push(`slave_empire_capture_aura_${emergentRule.effect.captureAuraRadius}`);
      break;

    case 'desert_raider':
      result.emergentDesertCaptureBonus = emergentRule.effect.desertCaptureBonus as number;
      result.additionalEffects.push('desert_raider_capture_bonus');
      break;

    case 'poison_shadow':
      if (context.isStealthAttack) {
        result.poisonStacks += emergentRule.effect.stealthPoisonStacks as number;
        result.additionalEffects.push('poison_shadow_stealth_attack');
      }
      if (context.isRetreat && emergentRule.effect.retreatPoisonCloud) {
        result.poisonTrapPositions.push(context.attackerPosition);
        result.poisonTrapDamage = emergentRule.effect.poisonCloudDamage as number;
        result.additionalEffects.push('poison_shadow_retreat_cloud');
      }
      break;

    case 'iron_turtle':
      result.damageReflection = emergentRule.effect.damageReflection as number;
      result.additionalEffects.push(`iron_turtle_crushing_zone_${emergentRule.effect.crushingZoneDamage}`);
      break;

    case 'multiplier': {
      const multiplier = emergentRule.effect.pairSynergyMultiplier as number;
      result.damage = Math.floor(result.damage * multiplier);
      result.additionalEffects.push(`adaptive_multiplier_${multiplier}x`);
      break;
    }
  }
}

export function applyHealingSynergies(
  context: HealingContext,
  synergies: ActiveSynergy[],
): number {
  let healAmount = context.baseHeal;

  for (const synergy of synergies) {
    const effect = synergy.effect;

    // Stealth healing - doesn't break stealth
    if (effect.type === 'stealth_healing' && context.isStealthed) {
      healAmount = context.baseHeal;
    }

    // Extended healing aura
    if (effect.type === 'extended_healing') {
      const ext = effect as { radius: number; selfHeal: number; allyHeal: number };
      healAmount = Math.max(healAmount, ext.selfHeal);
    }

    // Oasis effect
    if (effect.type === 'oasis') {
      // Oasis neutralizes terrain penalties for allies
      healAmount += 1;
    }

    // Phase 3C: slave healing — slaves heal nearby friendly units
    if (effect.type === 'slave_healing') {
      healAmount += (effect as { slaveHeal: number }).slaveHeal;
    }

    // Phase 3C: heavy regen — heavy units regenerate
    if (effect.type === 'heavy_regen') {
      healAmount += 3;
    }
  }

  return healAmount;
}
