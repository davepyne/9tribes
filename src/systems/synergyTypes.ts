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
  effects: PrimitiveEffect[];
  description: string;
  friendlyFlavor: string;
  enemyFlavor: string;
}

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
  attackerLearnedDomains: string[];
}

export interface SynergyCombatResult {
  damage: number;
  defense: number;
  knockbackDistance: number;
  poisonStacks: number;
  frostbiteStacks: number;
  poisonTrapPositions: { x: number; y: number }[];
  additionalEffects: string[];
  chargeShield: boolean;
  antiDisplacement: boolean;
  healOnRetreatAmount: number;

  sandstormDamage: number;
  sandstormAccuracyDebuff: number;
  witheringReduction: number;
  poisonTrapDamage: number;
  poisonTrapSlow: number;
  contaminateActive: boolean;
  frostbiteColdDoT: number;
  frostbiteSlow: number;
  stealthChargeMultiplier: number;

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

  coastalNomadDefense: number;

  heavyNavalRamDamage: number;
  slaveHealAmount: number;
  heavyRegenPercent: number;

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

  amphibiousMovementBonus: number;
  stealthAuraShareRadius: number;
  slaveEconomyHealPerTurn: number;
  slaveEconomyResourceBonus: number;
  caravanPassengerActive: boolean;
  countsAsCity: boolean;
  transportedTroopsStealth: boolean;
  // Heal primitive wiring
  synergyFlatHeal: number;
  synergyPercentHealMaxHp: number;
  // Post-combat re-stealth
  reEnterStealthAfterCombat: boolean;
  // New emergent wiring fields
  emergentPermanentStealth: boolean;
  emergentKillChainRedeployRange: number;
  emergentPoisonCloudPreventsHealing: boolean;
}

export interface HealingContext {
  unitId: string;
  unitTags: string[];
  baseHeal: number;
  position: { q: number; r: number };
  adjacentAllies: string[];
  isStealthed: boolean;
}
