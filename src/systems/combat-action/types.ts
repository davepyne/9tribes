import type { CombatResult } from '../combatSystem.js';
import type { SynergyCombatResult } from '../synergyTypes.js';
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

// Per-combat computed fields that are NOT synergy-derived.
// All synergy effects are read off `attackerSynergy` / `defenderSynergy` via
// the SynergyCombatResult helper API (`getStat`, `hasFlag`, etc.). Adding a
// new synergy never adds a named field here.
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
  sneakAttackTriggered: boolean;
  stampedeTriggered: boolean;
  attackerSynergy: SynergyCombatResult;
  defenderSynergy: SynergyCombatResult;
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
  hitAndRunTriggered: boolean;
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
  synergyReflectionDamage: number;
  aoeTargetsHit: number;
  heavyRegenApplied: number;
  captureEscapePrevented: boolean;
  synergyCaptureBonus: number;
  chargeSplashTargetsHit: number;
  armadaChainDamage: number;
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
