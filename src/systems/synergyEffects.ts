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
    // Phase 4-6 pair result fields
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
      result.chargeCaptureChance = 0.30;
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

  // Phase 4-6 new pair synergy handlers
  ['toxic_spread', (effect, _ctx, result) => {
    const e = effect as { transferStacksOnDeath: number; transferRadius: number };
    result.toxicSpreadTransferStacks = e.transferStacksOnDeath;
    result.toxicSpreadTransferRadius = e.transferRadius;
    result.additionalEffects.push(`toxic_spread_stacks_${e.transferStacksOnDeath}_radius_${e.transferRadius}`);
  }],

  ['formation_wall', (effect, _ctx, result) => {
    const e = effect as { blocksEnemyMovement: boolean; rangedRangeReduction: number };
    result.formationWallActive = e.blocksEnemyMovement;
    result.formationWallRangedReduction = e.rangedRangeReduction;
    result.additionalEffects.push('formation_wall');
  }],

  ['formation_pinball', (effect, _ctx, result) => {
    const e = effect as { collisionDamage: number; stunDuration: number; collisionTriggers?: string[] };
    result.formationPinballCollisionDamage = e.collisionDamage;
    result.stunDuration = Math.max(result.stunDuration, e.stunDuration);
    result.additionalEffects.push(`formation_pinball_damage_${e.collisionDamage}`);
  }],

  ['formation_focus', (effect, _ctx, result) => {
    const e = effect as { perAttackerDamageBonus: number; ignoresDefenseBonuses: boolean };
    result.formationFocusBonus = e.perAttackerDamageBonus;
    result.formationFocusIgnoresDefense = e.ignoresDefenseBonuses;
    result.damage = Math.floor(result.damage * (1 + e.perAttackerDamageBonus));
    result.additionalEffects.push(`formation_focus_${e.perAttackerDamageBonus}`);
  }],

  ['formation_chain', (effect, _ctx, result) => {
    const e = effect as { chainRange: number; perChainShipBonus: number; maxChainBonus: number };
    result.formationChainBonus = e.perChainShipBonus;
    result.additionalEffects.push(`formation_chain_${e.perChainShipBonus}_cap_${e.maxChainBonus}`);
  }],

  ['bloom_pulse', (effect, _ctx, result) => {
    const e = effect as { passiveAllyHeal: number; passiveSelfHeal: number; auraRadius: number; pulseTurnInterval: number; pulseInstantHeal: number; pulseMovementBonus: number };
    result.bloomPulseHeal = e.passiveAllyHeal;
    result.bloomPulseSelfHeal = e.passiveSelfHeal;
    result.bloomPulseAuraRadius = e.auraRadius;
    result.bloomPulseMovementBonus = e.pulseMovementBonus;
    result.additionalEffects.push(`bloom_pulse_heal_${e.passiveAllyHeal}_radius_${e.auraRadius}`);
  }],

  ['position_swap', (effect, _ctx, result) => {
    const e = effect as { swapRange: number; swapsPerTurn: number; killDoesNotRevealOthers: boolean };
    result.positionSwapAvailable = true;
    result.additionalEffects.push(`position_swap_range_${e.swapRange}`);
  }],

  ['caravan_relay', (effect, _ctx, result) => {
    const e = effect as { shareVisionRange: number; relayMarchEnabled: boolean; relayFreeMovementHexes: number };
    result.caravanRelayVisionRange = e.shareVisionRange;
    result.additionalEffects.push(`caravan_relay_vision_${e.shareVisionRange}`);
  }],

  ['slave_horde', (effect, _ctx, result) => {
    const e = effect as { damageBonus: number; defensePenalty: number; ignoreZocAtGroupSize: number; rageOnAdjacentSlaveDeath: { movementBonus: number; duration: number } };
    result.slaveHordeDamageBonus = e.damageBonus;
    result.slaveHordeDefensePenalty = e.defensePenalty;
    result.damage = Math.floor(result.damage * (1 + e.damageBonus));
    result.defense = Math.max(0, result.defense - e.defensePenalty);
    result.additionalEffects.push(`slave_horde_damage_${e.damageBonus}`);
  }],

  ['caravan_passenger', (effect, _ctx, result) => {
    const e = effect as { carryCapturedUnits: boolean; releaseAnywhereOnPath: boolean; instantSlaveOnHomeDelivery: boolean };
    result.caravanPassengerActive = e.carryCapturedUnits;
    result.additionalEffects.push('caravan_passenger');
  }],

  ['bombardment', (effect, _ctx, result) => {
    const e = effect as { bombardmentRange: number; bombardmentDamageMultiplier: number; landAuraRadius: number; landAuraDefenseBonus: number };
    result.bombardmentRange = e.bombardmentRange;
    result.bombardmentDamageMultiplier = e.bombardmentDamageMultiplier;
    result.bombardmentLandAuraDefense = e.landAuraDefenseBonus;
    result.defense += e.landAuraDefenseBonus;
    result.additionalEffects.push(`bombardment_range_${e.bombardmentRange}`);
  }],

  ['mobile_stronghold', (effect, _ctx, result) => {
    const e = effect as { fortUpAvailable: boolean; fortUpDefenseBonus: number; fortUpAuraRadius: number; fortUpAlliedDefenseBonus: number; decampFreeAction: boolean };
    result.mobileStrongholdFortUp = e.fortUpAvailable;
    result.mobileStrongholdDefenseBonus = e.fortUpDefenseBonus;
    result.mobileStrongholdAlliedDefenseBonus = e.fortUpAlliedDefenseBonus;
    result.defense += e.fortUpDefenseBonus;
    result.antiDisplacement = true;
    result.additionalEffects.push(`mobile_stronghold_def_${e.fortUpDefenseBonus}`);
  }],

  ['beach_raid', (effect, _ctx, result) => {
    const e = effect as { retreatToWaterRange: number; landCannotPursue: boolean; attackDamageBonus: number };
    result.beachRaidDamageBonus = e.attackDamageBonus;
    result.beachRaidRetreatToWater = e.retreatToWaterRange > 0;
    result.damage = Math.floor(result.damage * (1 + e.attackDamageBonus));
    result.additionalEffects.push(`beach_raid_damage_${e.attackDamageBonus}`);
  }],

  ['vampiric_strike', (effect, context, result) => {
    const e = effect as { healPercentOfDamage: number; triggerOnHitRunOnly: boolean };
    result.vampiricStrikeHealPercent = e.healPercentOfDamage;
    if (context.isRetreat || !e.triggerOnHitRunOnly) {
      result.additionalEffects.push(`vampiric_strike_heal_${e.healPercentOfDamage}`);
    }
  }],

  ['ghost_pass', (effect, context, result) => {
    const e = effect as { retreatThroughImpassable: boolean; movementBonusAfterImpassable: number; stealthAfterImpassable: boolean };
    if (context.isRetreat) {
      result.ghostPassActive = true;
      result.additionalEffects.push('ghost_pass');
    }
  }],

  ['fighting_retreat', (effect, context, result) => {
    const e = effect as { freeOpportunityStrikeOnDisengage: boolean; strikeDamageMultiplier: number };
    if (context.isRetreat) {
      result.fightingRetreatFreeStrike = e.freeOpportunityStrikeOnDisengage;
      result.fightingRetreatDamageMultiplier = e.strikeDamageMultiplier;
      result.additionalEffects.push('fighting_retreat');
    }
  }],

  ['tidal_cleanse', (effect, _ctx, result) => {
    const e = effect as { auraRadius: number; healPerTurn: number; clearedDebuffs: string[] };
    result.tidalCleanseHealPerTurn = e.healPerTurn;
    result.tidalCleanseClearedDebuffs = e.clearedDebuffs;
    result.additionalEffects.push(`tidal_cleanse_heal_${e.healPerTurn}`);
  }],

  ['amphibious', (effect, _ctx, result) => {
    const e = effect as { fullMovementTerrains: string[]; movementBonus: number };
    result.amphibiousMovementBonus = e.movementBonus;
    result.additionalEffects.push(`amphibious_bonus_${e.movementBonus}`);
  }],

  ['stealth_aura_share', (effect, _ctx, result) => {
    const e = effect as { shareStealthRadius: number };
    result.stealthAuraShareRadius = e.shareStealthRadius;
    result.additionalEffects.push(`stealth_aura_share_${e.shareStealthRadius}`);
  }],

  ['slave_economy', (effect, _ctx, result) => {
    const e = effect as { slaveHealPerTurn: number; fullHpResourceBonus: number; requiresAdjacentHealer: boolean };
    result.slaveEconomyHealPerTurn = e.slaveHealPerTurn;
    result.slaveEconomyResourceBonus = e.fullHpResourceBonus;
    result.additionalEffects.push(`slave_economy_heal_${e.slaveHealPerTurn}`);
  }],
]);

// --- Emergent effect handlers ---

type EmergentHandler = (rule: EmergentRuleConfig, context: CombatContext, result: SynergyCombatResult) => void;

const emergentEffectHandlers = new Map<string, EmergentHandler>([
  // Paladin: sustain + smite
  ['paladin', (rule, _ctx, result) => {
    const e = rule.effect as { healPercentOfDamage: number; minHp: number; smiteBonusAtFullHp: number };
    result.emergentSustainHealPercent = e.healPercentOfDamage;
    result.emergentSustainMinHp = e.minHp;
    result.emergentSmiteBonus = e.smiteBonusAtFullHp;
    result.additionalEffects.push('paladin_sustain');
  }],

  // Terrain Lord: terrain penetration + double charge range + terraform charges
  ['terrain_lord', (rule, context, result) => {
    const e = rule.effect as { nativeTerrainDamageBonus: number; doubleChargeRangeInNativeTerrain: boolean; terraformCharges: number };
    if (context.isCharge) {
      result.damage = Math.floor(result.damage * (1 + e.nativeTerrainDamageBonus));
      result.additionalEffects.push('terrain_lord_charge');
    }
    result.additionalEffects.push(`terrain_lord_terraform_${e.terraformCharges}`);
  }],

  // Terrain Assassin: permanent stealth (unchanged)
  ['permanent_stealth', (rule, _ctx, result) => {
    const e = rule.effect as { terrainTypes: string[] };
    result.emergentPermanentStealthTerrains = e.terrainTypes ?? [];
    result.additionalEffects.push('permanent_stealth');
  }],

  // Standing Stone: anchored/marching toggle with damage share + tar pit
  ['standing_stone', (rule, _ctx, result) => {
    const e = rule.effect as { anchoredDefenseBonus: number; anchoredAuraRadius: number; damageSharePercent: number; tarPitMovementPenalty: number; anchoredAdjacentDamage: number };
    result.defense += e.anchoredDefenseBonus;
    result.antiDisplacement = true;
    result.emergentCaptureBonus = 0; // no capture component
    result.additionalEffects.push(`standing_stone_anchored_radius_${e.anchoredAuraRadius}`);
    result.additionalEffects.push(`standing_stone_damage_share_${e.damageSharePercent}`);
    result.additionalEffects.push(`standing_stone_tar_pit_${e.tarPitMovementPenalty}`);
    result.additionalEffects.push(`standing_stone_adjacent_damage_${e.anchoredAdjacentDamage}`);
  }],

  // Ghost Army: phase teleport + kill-chain redeployment
  ['ghost_army', (rule, _ctx, result) => {
    const e = rule.effect as { phaseDistance: number; killChainRedeployRange: number; phaseAlliesMovementBonus: number };
    result.additionalEffects.push(`ghost_army_phase_${e.phaseDistance}`);
    result.additionalEffects.push(`ghost_army_kill_chain`);
    result.additionalEffects.push(`ghost_army_ally_movement_${e.phaseAlliesMovementBonus}`);
  }],

  // Juggernaut: per-domain signature kit
  ['juggernaut', (rule, _ctx, result) => {
    const e = rule.effect as { domainSignatures: Record<string, Record<string, number | boolean>>; undyingOncePerCombat: boolean; ignoreZoc: boolean };
    const sigs = e.domainSignatures;
    result.emergentUndying = e.undyingOncePerCombat;
    result.emergentIgnoreZoc = e.ignoreZoc;

    if (sigs.venom) {
      result.emergentPoisonPerHit = (sigs.venom.poisonPerHit as number) ?? 1;
      result.poisonStacks += result.emergentPoisonPerHit;
    }
    if (sigs.fortress) {
      result.emergentDamageReflection = (sigs.fortress.damageReflection as number) ?? 0.30;
      result.damageReflection += result.emergentDamageReflection;
    }
    if (sigs.charge) {
      result.emergentKnockbackOnKill = (sigs.charge.knockbackOnKill as number) ?? 1;
      result.emergentDamageBehindPercent = (sigs.charge.damageBehindPercent as number) ?? 0.50;
      result.knockbackDistance = Math.max(result.knockbackDistance, result.emergentKnockbackOnKill);
    }
    if (sigs.hitrun) {
      result.emergentFreeReposition = (sigs.hitrun.freeRepositionAfterKill as number) ?? 1;
    }
    if (sigs.heavy_hitter) {
      result.emergentArmorPierce = (sigs.heavy_hitter.armorPiercePercent as number) ?? 0.50;
      result.armorPiercing = Math.max(result.armorPiercing, result.emergentArmorPierce);
    }
    if (sigs.slaving) {
      result.emergentCaptureBelowHpPercent = (sigs.slaving.captureBelowHpPercent as number) ?? 0.25;
    }
    if (sigs.tidal_warfare) {
      result.emergentBonusDamageAdjacentWater = (sigs.tidal_warfare.bonusDamageAdjacentToWater as number) ?? 2;
    }

    if (e.ignoreZoc) {
      result.additionalEffects.push('juggernaut_ignore_zoc');
    }
    result.additionalEffects.push('juggernaut_signatures');
  }],

  // Slave Empire (unchanged)
  ['slave_empire', (rule, _ctx, result) => {
    const e = rule.effect as { captureChanceBonus: number; captureAuraRadius: number };
    result.emergentCaptureBonus = e.captureChanceBonus;
    result.additionalEffects.push(`slave_empire_capture_aura_${e.captureAuraRadius}`);
  }],

  // Raid Camp: deployable forward base
  ['raid_camp', (rule, _ctx, result) => {
    const e = rule.effect as { captureBonus: number; campEnemyDefensePenalty: number; campMovementBonus: number };
    result.emergentCaptureBonus = e.captureBonus;
    result.additionalEffects.push(`raid_camp_enemy_def_penalty_${e.campEnemyDefensePenalty}`);
    result.additionalEffects.push(`raid_camp_ally_movement_${e.campMovementBonus}`);
  }],

  // Poison Shadow (unchanged)
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

  // Iron Turtle: expanded 2-hex crush + movement penalty + 50% reflection + ignore ZoC
  ['iron_turtle', (rule, _ctx, result) => {
    const e = rule.effect as { damageReflection: number; crushingZoneDamage: number; crushingZoneRadius: number; crushingZoneMovementPenalty: number; ignoreZoc: boolean };
    result.damageReflection = e.damageReflection;
    result.emergentCrushZoneRadius = e.crushingZoneRadius;
    result.emergentCrushZoneMovementPenalty = e.crushingZoneMovementPenalty;
    result.antiDisplacement = true;
    if (e.ignoreZoc) {
      result.emergentIgnoreZoc = true;
      result.additionalEffects.push('iron_turtle_ignore_zoc');
    }
    result.additionalEffects.push(`iron_turtle_crushing_zone_${e.crushingZoneDamage}_radius_${e.crushingZoneRadius}`);
    result.additionalEffects.push(`iron_turtle_reflection_${e.damageReflection}`);
  }],

  // Many-Faced: stance cycling based on context
  ['many_faced', (rule, context, result) => {
    const e = rule.effect as { bulwarkDefense: number; bulwarkReflection: number; predatorDamage: number; predatorRangeBonus: number; phantomMovementBonus: number };

    // Determine stance from combat context
    if (context.isRetreat || context.defenderHp < context.attackerHp) {
      // Took damage or retreating → Bulwark
      result.emergentManyFacedStance = 'bulwark';
      result.emergentManyFacedDefense = e.bulwarkDefense;
      result.emergentManyFacedReflection = e.bulwarkReflection;
      result.defense += e.bulwarkDefense;
      result.damageReflection += e.bulwarkReflection;
      result.additionalEffects.push('many_faced_bulwark');
    } else if (context.isCharge || context.isStealthAttack) {
      // Dealing damage aggressively → Predator
      result.emergentManyFacedStance = 'predator';
      result.emergentManyFacedDamage = e.predatorDamage;
      result.emergentManyFacedRangeBonus = e.predatorRangeBonus;
      result.damage = Math.floor(result.damage * (1 + e.predatorDamage));
      result.additionalEffects.push('many_faced_predator');
    } else {
      // Moving or default → Phantom
      result.emergentManyFacedStance = 'phantom';
      result.emergentManyFacedMovementBonus = e.phantomMovementBonus;
      result.emergentIgnoreZoc = true;
      result.additionalEffects.push('many_faced_phantom');
    }
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
      const e = effect as { regenPercent: number };
      healAmount += Math.max(1, Math.floor(context.baseHeal * (e.regenPercent ?? 0.30)));
    }
  }

  return healAmount;
}
