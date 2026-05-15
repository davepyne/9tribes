// Primitive dispatcher: resolves PrimitiveEffect[] → SynergyCombatResult.

import type { CombatContext, SynergyCombatResult } from './synergyTypes.js';
import type {
  PrimitiveEffect, StatMod, SetFlag, ApplyStatus, Knockback, Heal,
  ProjectAura, Capture, PreventAction, SpawnOnMap, GrantVerb, InstantKill,
  ModeSelect, StatName,
} from './synergyPrimitives.js';
import { evaluateCondition } from './primitiveEvaluator.js';
import { EMERGENT_PARAMS } from './emergentRuleParams.js';

// ---------------------------------------------------------------------------
// Type-safe dynamic field writer
// ---------------------------------------------------------------------------

type NumericField = { [K in keyof SynergyCombatResult]: SynergyCombatResult[K] extends number ? K : never }[keyof SynergyCombatResult];
type BooleanField = { [K in keyof SynergyCombatResult]: SynergyCombatResult[K] extends boolean ? K : never }[keyof SynergyCombatResult];

function writeBoolean(result: SynergyCombatResult, key: BooleanField, value: boolean): void {
  result[key] = value;
}

// ---------------------------------------------------------------------------
// Stat field dispatcher
// ---------------------------------------------------------------------------

function applyStatModOp(result: SynergyCombatResult, stat: StatName, op: StatMod['op'], value: number): void {
  const key = stat as NumericField;
  const n = result[key];
  let next: number;
  switch (op) {
    case 'add':      next = n + value; break;
    case 'multiply': next = Math.floor(n * value); break;
    case 'set':      next = value; break;
    case 'min':      next = Math.min(n, value); break;
    case 'max':      next = Math.max(n, value); break;
  }
  result[key] = next;
}

// ---------------------------------------------------------------------------
// Per-kind dispatchers
// ---------------------------------------------------------------------------

function dispatchStatMod(p: StatMod, context: CombatContext, result: SynergyCombatResult): void {
  if (!evaluateCondition(p.condition, context)) return;
  applyStatModOp(result, p.stat, p.op, p.value);
  result.additionalEffects.push(`statMod_${p.stat}_${p.op}_${p.value}`);
}

function dispatchSetFlag(p: SetFlag, context: CombatContext, result: SynergyCombatResult): void {
  if (!evaluateCondition(p.condition, context)) return;
  writeBoolean(result, p.flag as BooleanField, true);
  result.additionalEffects.push(`setFlag_${p.flag}`);
}

function dispatchApplyStatus(p: ApplyStatus, context: CombatContext, result: SynergyCombatResult): void {
  if (!evaluateCondition(p.condition, context)) return;
  const stacks = p.stacks ?? 1;
  const dur = typeof p.duration === 'number' ? p.duration : 1;
  switch (p.status) {
    case 'poison':
      result.poisonStacks += stacks;
      break;
    case 'stun':
      result.stunDuration = Math.max(result.stunDuration, dur);
      break;
    case 'formationCrush':
      result.formationCrushStacks += stacks;
      break;
    case 'frostbite':
      result.frostbiteStacks += stacks;
      result.frostbiteColdDoT += stacks;
      result.frostbiteSlow += dur;
      break;
    case 'armorBroken':
      result.armorPiercing = Math.max(result.armorPiercing, 1);
      break;
    case 'stealth':
      if (p.duration === 'permanent') {
        result.emergentPermanentStealth = true;
        const terrains = (p.fields?.terrains as string[] | undefined) ?? EMERGENT_PARAMS.terrain_assassin.terrainTypes;
        for (const t of terrains) {
          if (!result.emergentPermanentStealthTerrains.includes(t)) {
            result.emergentPermanentStealthTerrains.push(t);
          }
        }
      }
      break;
    case 'bleed':
    case 'rage':
    case 'corruptionAura':
    case 'cleanse':
    case 'decoy':
      break;
  }
  result.additionalEffects.push(`applyStatus_${p.status}`);
}

function dispatchKnockback(p: Knockback, context: CombatContext, result: SynergyCombatResult): void {
  if (!evaluateCondition(p.condition, context)) return;
  result.knockbackDistance = Math.max(result.knockbackDistance, p.distance);
  if (p.extendMultiplier && result.knockbackDistance > 0) {
    result.knockbackDistance = Math.ceil(result.knockbackDistance * p.extendMultiplier);
  }
  if (p.collisionDamage) {
    result.formationPinballCollisionDamage = Math.max(result.formationPinballCollisionDamage, p.collisionDamage);
  }
  if (p.collisionStun) {
    result.stunDuration = Math.max(result.stunDuration, p.collisionStun);
  }
  result.additionalEffects.push(`knockback_${p.distance}`);
}

function dispatchHeal(p: Heal, context: CombatContext, result: SynergyCombatResult): void {
  if (!evaluateCondition(p.condition, context)) return;
  switch (p.mode) {
    case 'flat':
      result.synergyFlatHeal += p.amount;
      break;
    case 'percentMaxHp':
      result.synergyPercentHealMaxHp += p.amount;
      break;
    case 'percentDamage':
      // Stored as label; applied downstream where actual damage is known
      break;
  }
  result.additionalEffects.push(`heal_${p.mode}_${p.amount}`);
}

function dispatchCapture(p: Capture, context: CombatContext, result: SynergyCombatResult): void {
  if (!evaluateCondition(p.condition, context)) return;
  if (p.chanceBonus !== undefined) {
    if (context.isCharge) result.chargeCaptureChance = p.chanceBonus;
    else if (context.isRetreat) result.retreatCaptureChance = p.chanceBonus;
    else if (context.isStealthAttack) result.stealthCaptureBonus = p.chanceBonus;
    else result.navalCaptureBonus = (result.navalCaptureBonus ?? 0) + p.chanceBonus;
  }
  if (p.hpThreshold !== undefined) {
    result.emergentCaptureBelowHpPercent = p.hpThreshold;
  }
  result.additionalEffects.push('capture');
}

function dispatchPreventAction(p: PreventAction, context: CombatContext, result: SynergyCombatResult): void {
  if (!evaluateCondition(p.condition, context)) return;
  switch (p.action) {
    case 'displacement':
      result.antiDisplacement = true;
      break;
    case 'instantKill':
      result.emergentUndying = true;
      break;
    case 'zoc':
      result.emergentIgnoreZoc = true;
      break;
    case 'captureEscape':
      result.captureEscapePrevented = true;
      break;
    case 'retreat':
    case 'attackSource':
    case 'movementThrough':
    case 'pursue':
    case 'terrainPenalty':
      break;
    case 'retreatThroughImpassable':
      result.ghostPassActive = true;
      break;
    case 'impassableBlocksRetreat':
    case 'revealNetworkOnKill':
    case 'heal':
      break;
  }
  result.additionalEffects.push(`preventAction_${p.action}`);
}

function dispatchSpawnOnMap(p: SpawnOnMap, context: CombatContext, result: SynergyCombatResult): void {
  if (!evaluateCondition(p.condition, context)) return;
  const pos = p.position === 'defender' ? context.defenderPosition : context.attackerPosition;
  switch (p.effectType) {
    case 'poisonTrap':
    case 'poisonCloud':
      result.poisonTrapPositions.push(pos);
      result.emergentPoisonCloudPreventsHealing = true;
      break;
    case 'sandstorm':
      if (typeof p.fields?.damage === 'number') result.sandstormDamage = p.fields.damage;
      break;
    case 'contamination':
      result.contaminateActive = true;
      break;
    case 'decoy':
    case 'raidCamp':
      break;
  }
  result.additionalEffects.push(`spawnOnMap_${p.effectType}`);
}

function dispatchGrantVerb(p: GrantVerb, context: CombatContext, result: SynergyCombatResult): void {
  if (!evaluateCondition(p.condition, context)) return;
  switch (p.verb) {
    case 'positionSwap':
      result.positionSwapAvailable = true;
      break;
    case 'secondCharge':
    case 'waiveChargeCooldown':
      result.chargeCooldownWaived = true;
      break;
    case 'retreatThroughImpassable':
      result.ghostPassActive = true;
      break;
    case 'opportunityStrikeOnDisengage':
      result.fightingRetreatFreeStrike = true;
      break;
    case 'fortUp':
      result.mobileStrongholdFortUp = true;
      break;
    case 'carryCaptured':
      result.caravanPassengerActive = true;
      break;
    case 'retreatToWater':
      result.beachRaidRetreatToWater = true;
      break;
    case 'reEnterStealth':
      result.reEnterStealthAfterCombat = true;
      break;
    // Activation-phase verbs — recorded but not applied during combat
    case 'submerge':
    case 'declareOasis':
    case 'relayMarch':
    case 'repositionAfterKill':
    case 'shareVision':
    case 'instantRetreatWithCaptive':
      break;
    case 'redeployOnKill':
      result.emergentKillChainRedeployRange = p.range ?? EMERGENT_PARAMS.ghost_army.killChainRedeployRange;
      break;
  }
  result.additionalEffects.push(`grantVerb_${p.verb}`);
}

function dispatchInstantKill(p: InstantKill, context: CombatContext, result: SynergyCombatResult): void {
  if (!evaluateCondition(p.condition, context)) return;
  result.instantKill = true;
  result.additionalEffects.push('instantKill');
}

function dispatchProjectAura(p: ProjectAura, context: CombatContext, result: SynergyCombatResult): void {
  if (!evaluateCondition(p.condition, context)) return;
  for (const inner of p.effects) {
    dispatchPrimitive(inner, context, result);
  }
  result.additionalEffects.push(`projectAura_radius_${p.radius}`);
}

function dispatchModeSelect(p: ModeSelect, context: CombatContext, result: SynergyCombatResult): void {
  if (!evaluateCondition(p.condition, context)) return;

  if (p.collectMode === 'collectAll') {
    for (const effects of Object.values(p.modes)) {
      for (const effect of effects) {
        dispatchPrimitive(effect, context, result);
      }
    }
  } else {
    const selectedMode = evaluateModeSelector(p.selector, context);
    if (selectedMode && p.modes[selectedMode]) {
      for (const effect of p.modes[selectedMode]) {
        dispatchPrimitive(effect, context, result);
      }
    }
  }
  result.additionalEffects.push(`modeSelect_${p.selector}`);
}

function evaluateModeSelector(selector: string, context: CombatContext): string | null {
  switch (selector) {
    case 'combatContext':
    case 'stance':
    case 'stanceToggle': {
      if (context.isRetreat || context.defenderHp < context.attackerHp) return 'bulwark';
      if (context.isCharge || context.isStealthAttack) return 'predator';
      return 'phantom';
    }
    case 'domainSignature':
      return null;
    case 'playerChoice':
      return null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Core dispatch
// ---------------------------------------------------------------------------

function dispatchPrimitive(p: PrimitiveEffect, context: CombatContext, result: SynergyCombatResult): void {
  switch (p.kind) {
    case 'statMod':        dispatchStatMod(p, context, result); break;
    case 'setFlag':        dispatchSetFlag(p, context, result); break;
    case 'applyStatus':    dispatchApplyStatus(p, context, result); break;
    case 'knockback':      dispatchKnockback(p, context, result); break;
    case 'heal':           dispatchHeal(p, context, result); break;
    case 'capture':        dispatchCapture(p, context, result); break;
    case 'preventAction':  dispatchPreventAction(p, context, result); break;
    case 'spawnOnMap':     dispatchSpawnOnMap(p, context, result); break;
    case 'grantVerb':      dispatchGrantVerb(p, context, result); break;
    case 'instantKill':    dispatchInstantKill(p, context, result); break;
    case 'projectAura':    dispatchProjectAura(p, context, result); break;
    case 'modeSelect':     dispatchModeSelect(p, context, result); break;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function resolvePrimitives(
  effects: PrimitiveEffect[],
  context: CombatContext,
  result: SynergyCombatResult,
): void {
  for (const effect of effects) {
    dispatchPrimitive(effect, context, result);
  }
}

