// Apply synergy effects to combat, movement, healing
// This is where the mechanical effects are implemented

import type {
  ActiveSynergy,
  ActiveTripleStack,
  SynergyEffect,
  CombatContext,
  SynergyCombatResult,
  HealingContext,
  EmergentRuleConfig,
} from './synergyTypes.js';

export type {
  CombatContext,
  SynergyCombatResult,
  HealingContext,
} from './synergyTypes.js';
export type CombatResult = SynergyCombatResult;

function makeEmptyResult(): SynergyCombatResult {
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
  };
}

// --- Handler registries ---

type EffectHandler = (effect: SynergyEffect, context: CombatContext, result: SynergyCombatResult) => void;

const synergyEffectHandlers = new Map<string, EffectHandler>([
  ['poison_aura', (effect, _ctx, result) => {
    const e = effect as { damagePerTurn: number; radius: number };
    result.poisonStacks += e.damagePerTurn;
    result.additionalEffects.push(`poison_aura_radius_${e.radius}`);
  }],

  ['charge_shield', (_effect, _ctx, result) => {
    result.chargeShield = true;
    result.additionalEffects.push('charge_shield');
  }],

  ['dug_in', (effect, _ctx, result) => {
    const e = effect as { defenseBonus: number };
    result.defense += e.defenseBonus;
    result.dugInDefense += e.defenseBonus;
    result.additionalEffects.push('dug_in');
  }],

  ['land_aura', (effect, _ctx, result) => {
    const e = effect as { defenseBonus: number; radius: number };
    result.defense += e.defenseBonus;
    result.additionalEffects.push(`land_aura_radius_${e.radius}`);
  }],

  ['extended_healing', (effect, _ctx, result) => {
    const e = effect as { radius: number };
    result.additionalEffects.push(`extended_healing_radius_${e.radius}`);
  }],

  ['stealth_aura', (effect, _ctx, result) => {
    const e = effect as { revealRadius: number };
    result.additionalEffects.push(`stealth_aura_reveal_${e.revealRadius}`);
  }],

  ['terrain_fortress', (effect, _ctx, result) => {
    const e = effect as { defenseBonus: number };
    result.defense += e.defenseBonus;
    result.additionalEffects.push('terrain_fortress');
  }],

  ['ram_attack', (effect, _ctx, result) => {
    const e = effect as { knockbackDistance: number };
    result.knockbackDistance = Math.max(result.knockbackDistance, e.knockbackDistance);
    result.additionalEffects.push('ram_attack');
  }],

  ['combat_healing', (effect, _ctx, result) => {
    const e = effect as { healPercent: number };
    result.additionalEffects.push(`combat_healing_${e.healPercent * 100}%`);
  }],

  ['sandstorm', (effect, _ctx, result) => {
    const e = effect as { aoeDamage: number; accuracyDebuff: number };
    result.sandstormDamage = e.aoeDamage;
    result.sandstormAccuracyDebuff = e.accuracyDebuff;
    result.aoeDamage = e.aoeDamage;
    result.knockbackDistance = Math.max(result.knockbackDistance, 1);
    result.additionalEffects.push(`sandstorm_damage_${e.aoeDamage}_accuracy_debuff_${e.accuracyDebuff}`);
  }],

  ['double_charge', (_effect, _ctx, result) => {
    result.additionalEffects.push('double_charge');
  }],

  ['poison_trap', (effect, context, result) => {
    const e = effect as { damagePerTurn: number; slowAmount: number };
    if (context.isRetreat) {
      result.poisonTrapPositions.push(context.attackerPosition);
      result.additionalEffects.push('poison_trap');
    }
    result.poisonTrapDamage = e.damagePerTurn;
    result.poisonTrapSlow = e.slowAmount;
  }],

  ['contaminate', (_effect, _ctx, result) => {
    result.contaminateActive = true;
    result.additionalEffects.push('contaminate_coastal');
  }],

  ['withering', (effect, _ctx, result) => {
    const e = effect as { healingReduction: number };
    result.witheringReduction = e.healingReduction;
    result.additionalEffects.push(`withering_healing_reduction_${e.healingReduction * 100}%`);
  }],

  ['stealth_healing', (_effect, context, result) => {
    if (context.isStealthed) {
      result.additionalEffects.push('stealth_healing');
    }
  }],

  ['terrain_poison', (effect, _ctx, result) => {
    const e = effect as { damagePerTurn: number };
    result.poisonStacks += e.damagePerTurn;
    result.additionalEffects.push('terrain_poison');
  }],

  ['multiplier_stack', (effect, _ctx, result) => {
    const e = effect as { multiplier: number };
    result.damage = Math.floor(result.damage * e.multiplier);
    result.multiplierStackValue = e.multiplier;
    result.additionalEffects.push(`poison_multiplier_${e.multiplier}x`);
  }],

  ['aura_overlap', (effect, _ctx, result) => {
    const e = effect as { stackingBonus: number };
    result.defense += e.stackingBonus;
    result.auraOverlapDefense += e.stackingBonus;
    result.additionalEffects.push('aura_overlap');
  }],

  ['stealth_recharge', (_effect, _ctx, result) => {
    result.additionalEffects.push('stealth_recharge');
  }],

  ['oasis', (_effect, _ctx, result) => {
    result.additionalEffects.push('oasis_neutral_terrain');
  }],

  ['permanent_stealth_terrain', (_effect, _ctx, result) => {
    result.additionalEffects.push('permanent_stealth_terrain');
  }],

  ['shadow_network', (_effect, _ctx, result) => {
    result.additionalEffects.push('shadow_network');
  }],

  ['nomad_network', (_effect, _ctx, result) => {
    result.additionalEffects.push('nomad_network');
  }],

  ['heal_on_retreat', (effect, context, result) => {
    const e = effect as { healAmount: number };
    result.healOnRetreatAmount = e.healAmount;
    if (context.isRetreat) {
      result.additionalEffects.push(`heal_on_retreat_${e.healAmount}`);
    }
  }],

  ['impassable_retreat', (_effect, _ctx, result) => {
    result.additionalEffects.push('impassable_retreat');
  }],

  ['swarm_speed', (effect, _ctx, result) => {
    const e = effect as { speedBonus: number };
    result.swarmSpeedBonus = e.speedBonus;
    result.additionalEffects.push(`swarm_speed_${e.speedBonus}`);
  }],

  // Phase 3A: high-value dead synergies
  ['lethal_ambush', (effect, context, result) => {
    const e = effect as { poisonStacks: number };
    if (context.isStealthAttack) {
      result.instantKill = true;
      result.lethalAmbushPoison = e.poisonStacks;
      result.poisonStacks += e.poisonStacks;
      result.additionalEffects.push('lethal_ambush');
    }
  }],

  ['ambush_charge', (effect, context, result) => {
    const e = effect as { damageBonus: number };
    if (context.isCharge && context.isStealthAttack) {
      result.damage = Math.floor(result.damage * (1 + e.damageBonus));
      result.chargeCooldownWaived = true;
      result.additionalEffects.push('ambush_charge');
    }
  }],

  ['formation_crush', (effect, _ctx, result) => {
    const e = effect as { knockbackDistance: number; stunDuration: number };
    result.knockbackDistance = Math.max(result.knockbackDistance, e.knockbackDistance);
    result.stunDuration = Math.max(result.stunDuration, e.stunDuration);
    result.formationCrushStacks += 1;
    result.additionalEffects.push(`formation_crush_stacks_${result.formationCrushStacks}`);
  }],

  ['armor_shred', (effect, context, result) => {
    const e = effect as { armorPiercing: number };
    if (context.isStealthAttack) {
      result.armorPiercing = e.armorPiercing;
      result.additionalEffects.push(`armor_shred_${e.armorPiercing}`);
    }
  }],

  // Phase 3B: medium-value capture synergies
  ['poison_capture', (effect, _ctx, result) => {
    const e = effect as { damagePerTurn: number; slaveDamageBonus: number; slaveHealPenalty: number };
    result.capturePoisonDamage = e.damagePerTurn;
    result.capturePoisonStacks = e.damagePerTurn;
    result.slaveDamageBonus = e.slaveDamageBonus;
    result.slaveHealPenalty = e.slaveHealPenalty;
    result.additionalEffects.push('poison_capture');
  }],

  ['capture_charge', (effect, context, result) => {
    const e = effect as { knockbackDistance: number };
    if (context.isCharge) {
      result.chargeCaptureChance = 0.50;
      result.knockbackDistance = Math.max(result.knockbackDistance, e.knockbackDistance);
      result.additionalEffects.push('capture_charge');
    }
  }],

  ['capture_retreat', (effect, context, result) => {
    const e = effect as { captureChance: number };
    if (context.isRetreat) {
      result.retreatCaptureChance = e.captureChance;
      result.additionalEffects.push('capture_retreat');
    }
  }],

  ['naval_capture', (effect, context, result) => {
    const e = effect as { coastalCaptureBonus: number };
    if (context.terrain === 'water' || context.terrain === 'river') {
      result.navalCaptureBonus = e.coastalCaptureBonus;
      result.additionalEffects.push('naval_capture');
    }
  }],

  ['stealth_capture', (effect, context, result) => {
    const e = effect as { captureChance: number };
    if (context.isStealthAttack) {
      result.stealthCaptureBonus = e.captureChance;
      result.additionalEffects.push('stealth_capture');
    }
  }],

  // Phase 3C: lower-value dead synergies
  ['heavy_poison', (effect, _ctx, result) => {
    const e = effect as { armorPiercing: number };
    result.poisonStacks += 1;
    result.armorPiercing += e.armorPiercing;
    result.additionalEffects.push('heavy_poison');
  }],

  ['prison_fortress', (effect, _ctx, result) => {
    const e = effect as { defenseBonus: number };
    result.defense += e.defenseBonus;
    result.captureEscapePrevented = true;
    result.additionalEffects.push('prison_fortress');
  }],

  ['heavy_fortress', (effect, _ctx, result) => {
    const e = effect as { damageReflection: number };
    result.damageReflection += e.damageReflection;
    result.antiDisplacement = true;
    result.additionalEffects.push('heavy_fortress');
  }],

  ['heavy_charge', (effect, context, result) => {
    const e = effect as { stunDuration: number };
    result.stunDuration = Math.max(result.stunDuration, e.stunDuration);
    if (context.isCharge && result.knockbackDistance > 0) {
      result.knockbackDistance = Math.ceil(result.knockbackDistance * 1.5);
    }
    result.additionalEffects.push('heavy_charge');
  }],

  ['heavy_retreat', (effect, context, result) => {
    const e = effect as { damageReduction: number };
    if (context.isRetreat) {
      result.heavyRetreatDamageReduction = e.damageReduction;
      result.additionalEffects.push('heavy_retreat');
    }
  }],

  ['coastal_nomad', (effect, context, result) => {
    const e = effect as { defenseBonus: number; speedBonus: number };
    if (context.terrain === 'coast' || context.terrain === 'water') {
      result.coastalNomadDefense = e.defenseBonus;
      result.coastalNomadSpeed = e.speedBonus;
      result.defense += e.defenseBonus;
      result.additionalEffects.push('coastal_nomad');
    }
  }],

  ['heavy_naval', (effect, context, result) => {
    const e = effect as { ramDamage: number };
    if (context.terrain === 'water' || context.terrain === 'coast') {
      result.heavyNavalRamDamage = e.ramDamage;
      result.additionalEffects.push('heavy_naval');
    }
  }],

  ['slave_healing', (effect, _ctx, result) => {
    const e = effect as { slaveHeal: number };
    result.slaveHealAmount = e.slaveHeal;
    result.additionalEffects.push('slave_healing');
  }],

  ['heavy_regen', (effect, _ctx, result) => {
    const e = effect as { regenPercent: number };
    result.heavyRegenPercent = e.regenPercent;
    result.additionalEffects.push('heavy_regen');
  }],

  ['terrain_slave', (effect, context, result) => {
    const e = effect as { speedBonus: number };
    if (context.terrain === 'desert') {
      result.terrainSlaveSpeed = e.speedBonus;
      result.additionalEffects.push('terrain_slave');
    }
  }],

  ['sandstorm_aura', (effect, context, result) => {
    const e = effect as { auraRadius: number; enemyAccuracyDebuff: number };
    if (context.terrain === 'desert') {
      result.sandstormAuraRadius = e.auraRadius;
      result.sandstormAuraDebuff = e.enemyAccuracyDebuff;
      result.sandstormAccuracyDebuff += e.enemyAccuracyDebuff;
      result.additionalEffects.push('sandstorm_aura');
    }
  }],

  ['slave_army', (effect, _ctx, result) => {
    const e = effect as { slaveDamageBonus: number; slaveDefensePenalty: number };
    result.slaveArmyDamageBonus = e.slaveDamageBonus;
    result.slaveArmyDefensePenalty = e.slaveDefensePenalty;
    result.additionalEffects.push('slave_army');
  }],

  ['slave_coercion', (effect, _ctx, result) => {
    const e = effect as { damageBonus: number };
    result.slaveCoercionDamageBonus = e.damageBonus;
    result.additionalEffects.push('slave_coercion');
  }],

  ['heavy_mass', (effect, _ctx, result) => {
    const e = effect as { knockbackDistance: number };
    result.knockbackDistance = Math.max(result.knockbackDistance, e.knockbackDistance);
    result.heavyMassStacks += 1;
    result.additionalEffects.push(`heavy_mass_stacks_${result.heavyMassStacks}`);
  }],
]);

// --- Emergent effect handlers ---

type EmergentHandler = (rule: EmergentRuleConfig, context: CombatContext, result: SynergyCombatResult) => void;

const emergentEffectHandlers = new Map<string, EmergentHandler>([
  ['sustain', (rule, _ctx, result) => {
    const e = rule.effect as { healPercentOfDamage: number; minHp: number };
    result.emergentSustainHealPercent = e.healPercentOfDamage;
    result.emergentSustainMinHp = e.minHp;
    result.additionalEffects.push('paladin_sustain');
  }],

  ['terrain_charge', (rule, context, result) => {
    const e = rule.effect as { nativeTerrainDamageBonus: number };
    if (context.isCharge) {
      result.damage = Math.floor(result.damage * (1 + e.nativeTerrainDamageBonus));
      result.additionalEffects.push('terrain_charge_penetration');
    }
  }],

  ['permanent_stealth', (rule, _ctx, result) => {
    const e = rule.effect as { terrainTypes: string[] };
    result.emergentPermanentStealthTerrains = e.terrainTypes ?? [];
    result.additionalEffects.push('permanent_stealth');
  }],

  ['zone_of_control', (rule, _ctx, result) => {
    const e = rule.effect as { defenseBonus: number; radius: number };
    result.defense += e.defenseBonus;
    result.antiDisplacement = true;
    result.additionalEffects.push(`zone_of_control_radius_${e.radius}`);
  }],

  ['mobility_unit', (_rule, _ctx, result) => {
    result.additionalEffects.push('mobility_unit_ignore_terrain');
  }],

  ['combat_unit', (rule, _ctx, result) => {
    const e = rule.effect as { doubleCombatBonuses: boolean };
    if (e.doubleCombatBonuses) {
      result.damage = Math.floor(result.damage * 2);
      result.defense *= 2;
      result.additionalEffects.push('combat_unit_doubled');
    }
  }],

  ['slave_empire', (rule, _ctx, result) => {
    const e = rule.effect as { captureChanceBonus: number; captureAuraRadius: number };
    result.emergentCaptureBonus = e.captureChanceBonus;
    result.additionalEffects.push(`slave_empire_capture_aura_${e.captureAuraRadius}`);
  }],

  ['desert_raider', (rule, _ctx, result) => {
    const e = rule.effect as { desertCaptureBonus: number };
    result.emergentDesertCaptureBonus = e.desertCaptureBonus;
    result.additionalEffects.push('desert_raider_capture_bonus');
  }],

  ['poison_shadow', (rule, context, result) => {
    const e = rule.effect as { stealthPoisonStacks: number; retreatPoisonCloud: boolean; poisonCloudDamage: number };
    if (context.isStealthAttack) {
      result.poisonStacks += e.stealthPoisonStacks;
      result.additionalEffects.push('poison_shadow_stealth_attack');
    }
    if (context.isRetreat && e.retreatPoisonCloud) {
      result.poisonTrapPositions.push(context.attackerPosition);
      result.poisonTrapDamage = e.poisonCloudDamage;
      result.additionalEffects.push('poison_shadow_retreat_cloud');
    }
  }],

  ['iron_turtle', (rule, _ctx, result) => {
    const e = rule.effect as { damageReflection: number; crushingZoneDamage: number };
    result.damageReflection = e.damageReflection;
    result.additionalEffects.push(`iron_turtle_crushing_zone_${e.crushingZoneDamage}`);
  }],

  ['multiplier', (rule, _ctx, result) => {
    const e = rule.effect as { pairSynergyMultiplier: number };
    const multiplier = e.pairSynergyMultiplier;
    result.damage = Math.floor(result.damage * multiplier);
    result.additionalEffects.push(`adaptive_multiplier_${multiplier}x`);
  }],
]);

// --- Public API ---

export function applyCombatSynergies(
  context: CombatContext,
  synergies: ActiveSynergy[],
  tripleStack: ActiveTripleStack | null,
): SynergyCombatResult {
  const result = makeEmptyResult();

  for (const synergy of synergies) {
    const handler = synergyEffectHandlers.get(synergy.effect.type);
    if (handler) handler(synergy.effect, context, result);
  }

  if (tripleStack) {
    const emergentHandler = emergentEffectHandlers.get(tripleStack.emergentRule.effect.type);
    if (emergentHandler) emergentHandler(tripleStack.emergentRule, context, result);
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
    const effect = synergy.effect;

    if (effect.type === 'stealth_healing' && context.isStealthed) {
      healAmount = context.baseHeal;
    }

    if (effect.type === 'extended_healing') {
      const ext = effect as { radius: number; selfHeal: number; allyHeal: number };
      healAmount = Math.max(healAmount, ext.selfHeal);
    }

    if (effect.type === 'oasis') {
      healAmount += 1;
    }

    if (effect.type === 'slave_healing') {
      healAmount += (effect as { slaveHeal: number }).slaveHeal;
    }

    if (effect.type === 'heavy_regen') {
      healAmount += 3;
    }
  }

  return healAmount;
}
