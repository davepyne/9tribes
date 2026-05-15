import type { HexCoord } from '../../types.js';
import type { CombatResult } from '../combatSystem.js';
import type { UnitId } from '../../game/types.js';

export type CombatActionEffectCategory = 'positioning' | 'ability' | 'synergy' | 'aftermath';

export interface CombatActionEffect {
  label: string;
  detail: string;
  category: CombatActionEffectCategory;
}

export interface CombatActionPreview {
  attackerId: UnitId;
  defenderId: UnitId;
  result: CombatResult;
  round: number;
  attackerFactionId: string;
  defenderFactionId: string;
  attackerPrototypeName: string;
  defenderPrototypeName: string;
  triggeredEffects: CombatActionEffect[];
  braceTriggered: boolean;
  attackerWasStealthed: boolean;
  details: CombatActionPreviewDetails;
}

export interface CombatActionPreviewDetails {
  attackerTerrainId: string;
  defenderTerrainId: string;
  isChargeAttack: boolean;
  chargeAttackBonus: number;
  chargeChainBonusAmount: number;
  chargeSplashEnabled: boolean;
  synergyAttackModifier: number;
  synergyDefenseModifier: number;
  improvementDefenseBonus: number;
  wallDefenseBonus: number;
  totalKnockbackDistance: number;
  poisonTrapPositions: HexCoord[];
  poisonTrapDamage: number;
  poisonTrapSlow: number;
  healOnRetreatAmount: number;
  sandstormDamage: number;
  contaminateActive: boolean;
  frostbiteColdDoT: number;
  frostbiteSlow: number;
  attackerSynergyEffects: string[];
  defenderSynergyEffects: string[];
  sneakAttackTriggered: boolean;
  stampedeTriggered: boolean;
  // Phase 4: emergent rule fields
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
  // Phase 3A: direct combat effects
  instantKill: boolean;
  lethalAmbushPoison: number;
  chargeCooldownWaived: boolean;
  formationCrushStacks: number;
  stunDuration: number;
  armorPiercing: number;
  // Phase 3B: capture synergy modifiers
  capturePoisonDamage: number;
  capturePoisonStacks: number;
  slaveDamageBonus: number;
  slaveHealPenalty: number;
  chargeCaptureChance: number;
  retreatCaptureChance: number;
  navalCaptureBonus: number;
  stealthCaptureBonus: number;
  // Phase 3C: buff/aura/retreat effects
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
  // Top-level synergy modifiers
  synergyDamageBonus: number;
  synergyDefenseBonus: number;
  poisonStacks: number;
  damageReflection: number;
  aoeDamage: number;
  witheringReduction: number;
  // Heal primitive wiring
  synergyFlatHeal: number;
  synergyPercentHealMaxHp: number;
  // Post-combat re-stealth
  reEnterStealthAfterCombat: boolean;
  // Pair synergy fields
  vampiricStrikeHealPercent: number;
  bombardmentRange: number;
  bombardmentDamageMultiplier: number;
  bombardmentLandAuraDefense: number;
  mobileStrongholdFortUp: boolean;
  mobileStrongholdDefenseBonus: number;
  mobileStrongholdAlliedDefenseBonus: number;
  beachRaidDamageBonus: number;
  beachRaidRetreatToWater: boolean;
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
  positionSwapAvailable: boolean;
  caravanRelayVisionRange: number;
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
  toxicSpreadTransferRadius: number;
  toxicSpreadTransferStacks: number;
  // New emergent wiring fields
  emergentPermanentStealth: boolean;
  emergentTerraformCharges: number;
  emergentPhaseDistance: number;
  emergentKillChainRedeployRange: number;
  emergentPoisonCloudPreventsHealing: boolean;
}

export interface CombatActionFeedback {
  lastLearnedDomain: { unitId: string; domainId: string } | null;
  hitAndRunRetreat: { unitId: string; to: { q: number; r: number } } | null;
  absorbedDomains: string[];
  resolution: CombatActionResolution;
}

export interface CombatActionResolution {
  triggeredEffects: CombatActionEffect[];
  capturedOnKill: boolean;
  retreatCaptured: boolean;
  pressGangCaptured: boolean;
  captiveChampionSpawned: boolean;
  poisonDetonated: boolean;
  greedyLootGained: number;
  pursuitMovementRestored: number;
  poisonApplied: boolean;
  reStealthTriggered: boolean;
  reflectionDamageApplied: number;
  combatHealingApplied: number;
  sandstormTargetsHit: number;
  contaminatedHexApplied: boolean;
  frostbiteApplied: boolean;
  hitAndRunTriggered: boolean;
  healOnRetreatApplied: number;
  totalKnockbackDistance: number;
  pursuitDamageApplied: number;
  // Phase 4: emergent rule resolution
  emergentSustainHealApplied: number;
  emergentSustainMinHpSaved: boolean;
  emergentSmiteApplied: number;
  emergentUndyingSaved: boolean;
  lastStandSaved: boolean;
  bleedApplied: boolean;
  killChainApplied: boolean;
  sporeJumpApplied: boolean;
  myceliumNetworkApplied: boolean;
  emergentManyFacedStance: string;
  // Phase 3A/3B/3C: synergy effect resolution
  instantKillTriggered: boolean;
  stunApplied: number;
  formationCrushApplied: number;
  synergyReflectionDamage: number;
  aoeTargetsHit: number;
  heavyRegenApplied: number;
  slaveHealApplied: number;
  captureEscapePrevented: boolean;
  synergyCaptureBonus: number;
  chargeSplashTargetsHit: number;
  woundedEarthAbsorbed: number;
  woundedEarthAlliesHealed: number;
  woundedEarthSaved: boolean;
  saplingApplied: boolean;
  saplingMaxHpBonus: number;
}

export interface CombatActionApplyResult {
  state: import('../../game/types.js').GameState;
  feedback: CombatActionFeedback;
}
