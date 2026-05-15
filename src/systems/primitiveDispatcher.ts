// Primitive dispatcher: resolves PrimitiveEffect[] → SynergyCombatResult.
// Replaces the 69-entry synergyEffectHandlers Map and 11-entry emergentEffectHandlers Map.

import type { CombatContext, HealingContext, SynergyCombatResult } from './synergyTypes.js';
import type {
  PrimitiveEffect, StatMod, SetFlag, ApplyStatus, Knockback, Heal,
  ProjectAura, Capture, PreventAction, SpawnOnMap, GrantVerb, InstantKill,
  ModeSelect, StatName,
} from './synergyPrimitives.js';
import { evaluateCondition } from './primitiveEvaluator.js';

// ---------------------------------------------------------------------------
// Type-safe dynamic field writer
// ---------------------------------------------------------------------------

type NumericField = { [K in keyof SynergyCombatResult]: SynergyCombatResult[K] extends number ? K : never }[keyof SynergyCombatResult];
type BooleanField = { [K in keyof SynergyCombatResult]: SynergyCombatResult[K] extends boolean ? K : never }[keyof SynergyCombatResult];

function writeNumeric(result: SynergyCombatResult, key: NumericField, value: number): void {
  result[key] = value;
}

function readNumeric(result: SynergyCombatResult, key: NumericField): number {
  return result[key];
}

function writeBoolean(result: SynergyCombatResult, key: BooleanField, value: boolean): void {
  result[key] = value;
}

// ---------------------------------------------------------------------------
// Stat field dispatcher
// ---------------------------------------------------------------------------

function applyStatModOp(result: SynergyCombatResult, stat: StatName, op: StatMod['op'], value: number): void {
  // Only numeric fields can be modified via statMod
  const current = (result as unknown as Record<string, unknown>)[stat];
  if (typeof current !== 'number') return;
  const n = current;
  let next: number;
  switch (op) {
    case 'add':      next = n + value; break;
    case 'multiply': next = Math.floor(n * value); break;
    case 'set':      next = value; break;
    case 'min':      next = Math.min(n, value); break;
    case 'max':      next = Math.max(n, value); break;
  }
  (result as unknown as Record<string, number>)[stat] = next;
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
  const flag = p.flag;
  // Type-safe boolean field write
  switch (flag) {
    case 'chargeShield':               result.chargeShield = true; break;
    case 'antiDisplacement':           result.antiDisplacement = true; break;
    case 'contaminateActive':          result.contaminateActive = true; break;
    case 'instantKill':                result.instantKill = true; break;
    case 'chargeCooldownWaived':       result.chargeCooldownWaived = true; break;
    case 'captureEscapePrevented':     result.captureEscapePrevented = true; break;
    case 'formationWallActive':        result.formationWallActive = true; break;
    case 'positionSwapAvailable':      result.positionSwapAvailable = true; break;
    case 'beachRaidRetreatToWater':    result.beachRaidRetreatToWater = true; break;
    case 'ghostPassActive':            result.ghostPassActive = true; break;
    case 'fightingRetreatFreeStrike':  result.fightingRetreatFreeStrike = true; break;
    case 'caravanPassengerActive':     result.caravanPassengerActive = true; break;
    case 'mobileStrongholdFortUp':     result.mobileStrongholdFortUp = true; break;
    case 'formationFocusIgnoresDefense': result.formationFocusIgnoresDefense = true; break;
    case 'emergentUndying':            result.emergentUndying = true; break;
    case 'emergentIgnoreZoc':          result.emergentIgnoreZoc = true; break;
    case 'stealthChargeMultiplier':    writeBoolean(result, 'stealthChargeMultiplier' as BooleanField, true); break;
  }
  result.additionalEffects.push(`setFlag_${flag}`);
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
    case 'slow':
      result.slowDuration = Math.max(result.slowDuration, dur);
      break;
    case 'formationCrush':
      result.formationCrushStacks += stacks;
      break;
    default:
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
  result.additionalEffects.push(`heal_${p.mode}_${p.amount}`);
}

function dispatchCapture(p: Capture, context: CombatContext, result: SynergyCombatResult): void {
  if (!evaluateCondition(p.condition, context)) return;
  if (p.chanceBonus !== undefined) {
    if (context.isCharge) {
      result.chargeCaptureChance = p.chanceBonus;
    } else if (context.isRetreat) {
      result.retreatCaptureChance = p.chanceBonus;
    } else if (context.isStealthAttack) {
      result.stealthCaptureBonus = p.chanceBonus;
    } else {
      result.navalCaptureBonus = p.chanceBonus;
    }
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
    default:
      break;
  }
  result.additionalEffects.push(`preventAction_${p.action}`);
}

function dispatchSpawnOnMap(p: SpawnOnMap, context: CombatContext, result: SynergyCombatResult): void {
  if (!evaluateCondition(p.condition, context)) return;
  if (p.effectType === 'poisonTrap' || p.effectType === 'poisonCloud') {
    result.poisonTrapPositions.push(context.attackerPosition);
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
    default:
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

export function resolveHealingPrimitives(
  effects: PrimitiveEffect[],
  context: HealingContext,
): number {
  let bonus = 0;
  for (const p of effects) {
    if (p.kind === 'heal') {
      switch (p.mode) {
        case 'flat':
          bonus += p.amount;
          break;
        case 'percentMaxHp':
        case 'percentDamage':
          bonus += Math.floor(context.baseHeal * p.amount);
          break;
      }
    }
    if (p.kind === 'statMod' && p.stat === 'heavyRegenPercent') {
      bonus += Math.max(1, Math.floor(context.baseHeal * p.value));
    }
  }
  return bonus;
}
