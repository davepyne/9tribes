// Shared types for the synergy system.
// Extracted from synergyEngine.ts and synergyEffects.ts to break circular deps
// and provide a single import site for all synergy-related types.

import type { PrimitiveEffect } from './synergyPrimitives.js';

// --- From synergyEngine.ts ---

export interface DomainConfig {
  id: string;
  name: string;
  nativeFaction: string;
  tags: string[];
  baseEffect: unknown;
}

export interface PairSynergyConfig {
  id: string;
  name: string;
  domains: [string, string];
  requiredTags: string[];
  effects: PrimitiveEffect[];
  description: string;
  friendlyFlavor: string;
  enemyFlavor: string;
}

export interface EmergentRuleConfig {
  id: string;
  name: string;
  condition: string;
  domainSets?: Record<string, string[]>;
  mobilityDomains?: string[];
  combatDomains?: string[];
  effect: EmergentEffect;
  effects: PrimitiveEffect[];
  friendlyFlavor: string;
  enemyFlavor: string;
}

export type EmergentEffect =
  // Terrain Lord (was terrain_rider/terrain_charge)
  | { type: 'terrain_lord'; nativeTerrainDamageBonus: number; doubleChargeRangeInNativeTerrain: boolean; terraformCharges: number; description: string }
  // Paladin (was sustain — added smite)
  | { type: 'paladin'; healPercentOfDamage: number; minHp: number; smiteBonusAtFullHp: number; description: string }
  // Terrain Assassin (unchanged)
  | { type: 'permanent_stealth'; terrainTypes: string[]; description: string }
  // Standing Stone (was zone_of_control/anchor)
  | { type: 'standing_stone'; anchoredAuraRadius: number; anchoredDefenseBonus: number; anchoredHealPerTurn: number; anchoredSelfRegen: number; anchoredAdjacentDamage: number; damageSharePercent: number; tarPitMovementPenalty: number; marchAuraRadius: number; marchDefenseBonus: number; marchHealPerTurn: number; description: string }
  // Ghost Army (was mobility_unit)
  | { type: 'ghost_army'; phaseDistance: number; killChainRedeployRange: number; phaseAlliesMovementBonus: number; description: string }
  // Juggernaut (was combat_unit — per-domain signatures)
  | { type: 'juggernaut'; domainSignatures: Record<string, Record<string, number | boolean>>; undyingOncePerCombat: boolean; ignoreZoc: boolean; description: string }
  // Slave Empire (unchanged)
  | { type: 'slave_empire'; captureAuraRadius: number; captureChanceBonus: number; slaveProductionBonus: number; description: string }
  // Raid Camp (was desert_raider)
  | { type: 'raid_camp'; campPlacementRange: number; campDuration: number; campStealthDuration: number; campMovementBonus: number; campEnemyRadius: number; campEnemyDefensePenalty: number; captureBonus: number; description: string }
  // Poison Shadow (unchanged)
  | { type: 'poison_shadow'; stealthPoisonStacks: number; retreatPoisonCloud: boolean; poisonCloudDamage: number; description: string }
  // Iron Turtle (expanded)
  | { type: 'iron_turtle'; crushingZoneRadius: number; crushingZoneDamage: number; crushingZoneMovementPenalty: number; damageReflection: number; ignoreZoc: boolean; description: string }
  // Many-Faced (was adaptive/multiplier)
  | { type: 'many_faced'; bulwarkDefense: number; bulwarkReflection: number; predatorDamage: number; predatorRangeBonus: number; phantomMovementBonus: number; description: string };

export interface ActiveSynergy {
  pairId: string;
  name: string;
  domains: [string, string];
  effects: PrimitiveEffect[];
}

export interface ActiveDoubleStack {
  domains: [string, string];  // [nativeDomain, foreignDomain]
  pairs: ActiveSynergy[];     // cross-pair(s) only (no self-pairs)
}

export interface ActiveTripleStack {
  domains: [string, string, string];
  pairs: ActiveSynergy[];
  emergentRule: EmergentRuleConfig;
  name: string;
}

// --- From synergyEffects.ts (renamed CombatResult → SynergyCombatResult) ---

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

export interface SynergyCombatResult {
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
  instantKill: boolean;
  lethalAmbushPoison: number;
  chargeCooldownWaived: boolean;
  formationCrushStacks: number;
  stunDuration: number;
  armorPiercing: number;
  capturePoisonDamage: number;
  capturePoisonStacks: number;
  slaveDamageBonus: number;
  slaveHealPenalty: number;
  chargeCaptureChance: number;
  retreatCaptureChance: number;
  navalCaptureBonus: number;
  stealthCaptureBonus: number;
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
  // Emergent combat result fields
  emergentSustainHealPercent: number;
  emergentSustainMinHp: number;
  emergentSmiteBonus: number;
  emergentPermanentStealthTerrains: string[];
  emergentCaptureBonus: number;
  emergentDesertCaptureBonus: number;
  // Juggernaut per-domain signature fields
  emergentPoisonPerHit: number;
  emergentDamageReflection: number;
  emergentKnockbackOnKill: number;
  emergentDamageBehindPercent: number;
  emergentFreeReposition: number;
  emergentArmorPierce: number;
  emergentCaptureBelowHpPercent: number;
  emergentBonusDamageAdjacentWater: number;
  emergentUndying: boolean;
  emergentIgnoreZoc: boolean;
  // Iron Turtle expanded
  emergentCrushZoneRadius: number;
  emergentCrushZoneMovementPenalty: number;
  // Many-Faced stance
  emergentManyFacedStance: string;
  emergentManyFacedDefense: number;
  emergentManyFacedReflection: number;
  emergentManyFacedDamage: number;
  emergentManyFacedRangeBonus: number;
  emergentManyFacedMovementBonus: number;
  // Structured fields for synergyRuntime bonus calculations (4e)
  multiplierStackValue: number;
  dugInDefense: number;
  auraOverlapDefense: number;
  // Phase 4-6 pair result fields
  toxicSpreadTransferRadius: number;
  toxicSpreadTransferStacks: number;
  formationWallActive: boolean;
  formationWallRangedReduction: number;
  formationPinballCollisionDamage: number;
  formationFocusBonus: number;
  formationFocusIgnoresDefense: boolean;
  formationChainBonus: number;
  bloomPulseHeal: number;
  bloomPulseSelfHeal: number;
  bloomPulseAuraRadius: number;
  bloomPulseMovementBonus: number;
  positionSwapAvailable: boolean;
  caravanRelayVisionRange: number;
  slaveHordeDamageBonus: number;
  slaveHordeDefensePenalty: number;
  slaveHordeRageTriggered: boolean;
  bombardmentRange: number;
  bombardmentDamageMultiplier: number;
  bombardmentLandAuraDefense: number;
  mobileStrongholdFortUp: boolean;
  mobileStrongholdDefenseBonus: number;
  mobileStrongholdAlliedDefenseBonus: number;
  beachRaidDamageBonus: number;
  beachRaidRetreatToWater: boolean;
  vampiricStrikeHealPercent: number;
  ghostPassActive: boolean;
  fightingRetreatFreeStrike: boolean;
  fightingRetreatDamageMultiplier: number;
  tidalCleanseHealPerTurn: number;
  tidalCleanseClearedDebuffs: string[];
  amphibiousMovementBonus: number;
  stealthAuraShareRadius: number;
  slaveEconomyHealPerTurn: number;
  slaveEconomyResourceBonus: number;
  caravanPassengerActive: boolean;
}

export interface HealingContext {
  unitId: string;
  unitTags: string[];
  baseHeal: number;
  position: { q: number; r: number };
  adjacentAllies: string[];
  isStealthed: boolean;
}
