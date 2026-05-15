// Primitive dispatcher: resolves PrimitiveEffect[] → SynergyCombatResult.
//
// Every primitive funnels into one of the result containers (stats / flags /
// statuses / spawns / verbs / data). Dispatch never adds named fields to the
// result type.

import type { CombatContext, SynergyCombatResult } from './synergyTypes.js';
import type {
  PrimitiveEffect, StatMod, SetFlag, ApplyStatus, Knockback, Heal,
  ProjectAura, Capture, PreventAction, SpawnOnMap, GrantVerb, InstantKill,
  ModeSelect, StatName,
} from './synergyPrimitives.js';
import { evaluateCondition } from './primitiveEvaluator.js';
import { EMERGENT_PARAMS } from './emergentRuleParams.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addToStat(result: SynergyCombatResult, stat: StatName, delta: number): void {
  result.stats.set(stat, result.getStat(stat) + delta);
}

function maxStat(result: SynergyCombatResult, stat: StatName, value: number): void {
  result.stats.set(stat, Math.max(result.getStat(stat), value));
}

function applyStatModOp(result: SynergyCombatResult, stat: StatName, op: StatMod['op'], value: number): void {
  const cur = result.getStat(stat);
  let next: number;
  switch (op) {
    case 'add':      next = cur + value; break;
    case 'multiply': next = Math.floor(cur * value); break;
    case 'set':      next = value; break;
    case 'min':      next = Math.min(cur, value); break;
    case 'max':      next = Math.max(cur, value); break;
  }
  result.stats.set(stat, next);
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
  result.flags.add(p.flag);
  result.additionalEffects.push(`setFlag_${p.flag}`);
}

function dispatchApplyStatus(p: ApplyStatus, context: CombatContext, result: SynergyCombatResult): void {
  if (!evaluateCondition(p.condition, context)) return;
  const stacks = p.stacks ?? 1;
  const dur = typeof p.duration === 'number' ? p.duration : 1;
  switch (p.status) {
    case 'poison':
      addToStat(result, 'poisonStacks', stacks);
      break;
    case 'stun':
      maxStat(result, 'stunDuration', dur);
      break;
    case 'formationCrush':
      addToStat(result, 'formationCrushStacks', stacks);
      break;
    case 'frostbite':
      addToStat(result, 'frostbiteStacks', stacks);
      addToStat(result, 'frostbiteColdDoT', stacks);
      addToStat(result, 'frostbiteSlow', dur);
      break;
    case 'armorBroken':
      maxStat(result, 'armorPiercing', 1);
      break;
    case 'stealth':
      if (p.duration === 'permanent') {
        result.flags.add('emergentPermanentStealth');
        const terrains = (p.fields?.terrains as string[] | undefined) ?? EMERGENT_PARAMS.terrain_assassin.terrainTypes;
        const existing = (result.data.get('emergentPermanentStealthTerrains') as string[] | undefined) ?? [];
        const merged = [...existing];
        for (const t of terrains) {
          if (!merged.includes(t)) merged.push(t);
        }
        result.data.set('emergentPermanentStealthTerrains', merged);
      }
      break;
    case 'bleed':
    case 'rage':
    case 'corruptionAura':
    case 'cleanse':
    case 'decoy':
      break;
  }
  result.statuses.push({ name: p.status, stacks, duration: dur, fields: p.fields });
  result.additionalEffects.push(`applyStatus_${p.status}`);
}

function dispatchKnockback(p: Knockback, context: CombatContext, result: SynergyCombatResult): void {
  if (!evaluateCondition(p.condition, context)) return;
  maxStat(result, 'knockbackDistance', p.distance);
  if (p.extendMultiplier && result.getStat('knockbackDistance') > 0) {
    result.stats.set('knockbackDistance', Math.ceil(result.getStat('knockbackDistance') * p.extendMultiplier));
  }
  if (p.collisionDamage) {
    maxStat(result, 'formationPinballCollisionDamage', p.collisionDamage);
  }
  if (p.collisionStun) {
    maxStat(result, 'stunDuration', p.collisionStun);
  }
  result.additionalEffects.push(`knockback_${p.distance}`);
}

function dispatchHeal(p: Heal, context: CombatContext, result: SynergyCombatResult): void {
  if (!evaluateCondition(p.condition, context)) return;
  switch (p.mode) {
    case 'flat':
      addToStat(result, 'synergyFlatHeal', p.amount);
      break;
    case 'percentMaxHp':
      addToStat(result, 'synergyPercentHealMaxHp', p.amount);
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
    if (context.isCharge) result.stats.set('chargeCaptureChance', p.chanceBonus);
    else if (context.isRetreat) result.stats.set('retreatCaptureChance', p.chanceBonus);
    else if (context.isStealthAttack) result.stats.set('stealthCaptureBonus', p.chanceBonus);
    else addToStat(result, 'navalCaptureBonus', p.chanceBonus);
  }
  if (p.hpThreshold !== undefined) {
    result.stats.set('emergentCaptureBelowHpPercent', p.hpThreshold);
  }
  result.additionalEffects.push('capture');
}

function dispatchPreventAction(p: PreventAction, context: CombatContext, result: SynergyCombatResult): void {
  if (!evaluateCondition(p.condition, context)) return;
  switch (p.action) {
    case 'displacement':
      result.flags.add('antiDisplacement');
      break;
    case 'instantKill':
      result.flags.add('emergentUndying');
      break;
    case 'zoc':
      result.flags.add('emergentIgnoreZoc');
      break;
    case 'captureEscape':
      result.flags.add('captureEscapePrevented');
      break;
    case 'retreat':
    case 'attackSource':
    case 'movementThrough':
    case 'pursue':
    case 'terrainPenalty':
      break;
    case 'retreatThroughImpassable':
      result.flags.add('ghostPassActive');
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
  result.spawns.push({
    effectType: p.effectType,
    position: pos,
    radius: p.radius,
    duration: p.duration,
    fields: p.fields,
  });
  switch (p.effectType) {
    case 'poisonTrap':
    case 'poisonCloud': {
      const existing = (result.data.get('poisonTrapPositions') as { x: number; y: number }[] | undefined) ?? [];
      result.data.set('poisonTrapPositions', [...existing, pos]);
      if (p.effectType === 'poisonCloud') {
        result.flags.add('emergentPoisonCloudPreventsHealing');
      }
      break;
    }
    case 'sandstorm':
      if (typeof p.fields?.damage === 'number') {
        result.stats.set('sandstormDamage', p.fields.damage);
      }
      break;
    case 'contamination':
      result.flags.add('contaminateActive');
      break;
    case 'decoy':
    case 'raidCamp':
      break;
  }
  result.additionalEffects.push(`spawnOnMap_${p.effectType}`);
}

function dispatchGrantVerb(p: GrantVerb, context: CombatContext, result: SynergyCombatResult): void {
  if (!evaluateCondition(p.condition, context)) return;
  result.verbs.add(p.verb);
  switch (p.verb) {
    case 'positionSwap':
      result.flags.add('positionSwapAvailable');
      break;
    case 'secondCharge':
    case 'waiveChargeCooldown':
      result.flags.add('chargeCooldownWaived');
      break;
    case 'retreatThroughImpassable':
      result.flags.add('ghostPassActive');
      break;
    case 'opportunityStrikeOnDisengage':
      result.flags.add('fightingRetreatFreeStrike');
      break;
    case 'fortUp':
      result.flags.add('mobileStrongholdFortUp');
      break;
    case 'carryCaptured':
      result.flags.add('caravanPassengerActive');
      break;
    case 'retreatToWater':
      result.flags.add('beachRaidRetreatToWater');
      break;
    case 'reEnterStealth':
      result.flags.add('reEnterStealthAfterCombat');
      break;
    // Activation-phase verbs — recorded as granted but no combat-phase write
    case 'submerge':
    case 'declareOasis':
    case 'relayMarch':
    case 'repositionAfterKill':
    case 'shareVision':
    case 'instantRetreatWithCaptive':
      break;
    case 'redeployOnKill':
      result.stats.set('emergentKillChainRedeployRange', p.range ?? EMERGENT_PARAMS.ghost_army.killChainRedeployRange);
      break;
  }
  result.additionalEffects.push(`grantVerb_${p.verb}`);
}

function dispatchInstantKill(p: InstantKill, context: CombatContext, result: SynergyCombatResult): void {
  if (!evaluateCondition(p.condition, context)) return;
  result.flags.add('instantKill');
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
