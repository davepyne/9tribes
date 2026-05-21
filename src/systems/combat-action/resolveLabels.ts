import type { CombatContext } from './combatContext.js';
import type { CombatActionApplyResult, CombatActionResolution } from './types.js';
import { pushCombatEffect } from './labeling.js';
import { pruneDeadUnits } from './helpers.js';

export function buildCombatLabels(ctx: CombatContext): void {
  const {
    preview,
    attacker,
    atk,
  } = ctx;

  const current = ctx.current;
  const updatedDefender = current.units.get(preview.defenderId);
  const triggeredEffects = [...preview.triggeredEffects];

  if (ctx.poisonApplied && updatedDefender) {
    pushCombatEffect(triggeredEffects, 'Poisoned', `Defender was poisoned for ${updatedDefender.poisonStacks} stack damage over time.`, 'aftermath');
  }
  if (ctx.resolution.bleedApplied) {
    pushCombatEffect(triggeredEffects, 'Predator Bleed', 'Stealth attack inflicted bleed (1 dmg/turn for 3 turns).', 'ability');
  }
  if (ctx.reflectionDamageApplied > 0) {
    pushCombatEffect(triggeredEffects, 'Reflection', `Defender reflected ${ctx.reflectionDamageApplied} damage back to the attacker.`, 'aftermath');
  }
  if (ctx.totalKnockbackDistance > 0 && !ctx.defenderActuallyDestroyed) {
    pushCombatEffect(triggeredEffects, 'Knockback', `Defender was displaced ${ctx.totalKnockbackDistance} hex${ctx.totalKnockbackDistance === 1 ? '' : 'es'}.`, 'aftermath');
  }
  if (ctx.knockbackCollisionDamage > 0) {
    pushCombatEffect(triggeredEffects, 'Pinball Collision', `Knockback collision dealt ${ctx.knockbackCollisionDamage} damage.`, 'synergy');
  }
  if (ctx.bigChargeRoutTriggered) {
    pushCombatEffect(triggeredEffects, 'Big Charge Rout', 'Heavy charge routed the defender.', 'ability');
    if (ctx.stampedeDamageApplied > 0) {
      pushCombatEffect(triggeredEffects, 'Stampede', `Routed defender stampeded into an obstacle, taking ${ctx.stampedeDamageApplied} damage.`, 'ability');
    }
  }
  if (ctx.reStealthTriggered) {
    pushCombatEffect(triggeredEffects, 'Stealth Recharge', 'Attacker slipped back into stealth after the exchange.', 'aftermath');
  }
  if (ctx.combatHealingApplied > 0) {
    pushCombatEffect(triggeredEffects, 'Combat Healing', `Attacker recovered ${ctx.combatHealingApplied} HP from dealt damage.`, 'aftermath');
  }
  if (ctx.bombardmentDamageApplied > 0) {
    pushCombatEffect(triggeredEffects, 'Naval Bombardment', `Ships bombarded for +${ctx.bombardmentDamageApplied} bonus damage.`, 'synergy');
  }
  if (ctx.fightingRetreatDamage > 0) {
    pushCombatEffect(triggeredEffects, 'Fighting Retreat', `Disengaging strike dealt ${ctx.fightingRetreatDamage} damage.`, 'synergy');
  }
  if (ctx.sandstormTargetsHit > 0) {
    pushCombatEffect(triggeredEffects, 'Sandstorm Splash', `Area damage hit ${ctx.sandstormTargetsHit} nearby unit${ctx.sandstormTargetsHit === 1 ? '' : 's'}.`, 'aftermath');
  }
  if (ctx.contaminatedHexApplied) {
    pushCombatEffect(triggeredEffects, 'Contamination', 'The defender hex became contaminated after the strike.', 'aftermath');
  }
  if (ctx.hitAndRunTriggered && ctx.poisonTrapPositionsRaw.length > 0) {
    pushCombatEffect(triggeredEffects, 'Poison Trap', 'Attacker left a poison trap on the retreat path.', 'aftermath');
  }
  if (ctx.hitAndRunTriggered) {
    pushCombatEffect(triggeredEffects, 'Hit And Run', 'Attacker disengaged after combat to avoid being pinned.', 'aftermath');
  }
  if (ctx.pursuitDamageApplied > 0) {
    pushCombatEffect(triggeredEffects, 'Pursuit', `Skirmisher pressed the advantage for +${ctx.pursuitDamageApplied} bonus damage.`, 'aftermath');
  }
  if (ctx.pressGangCaptured) {
    pushCombatEffect(triggeredEffects, 'Press Gang', 'Killer crew pressed the fallen enemy into service.', 'aftermath');
  }
  if (ctx.greedyLootGained > 0) {
    pushCombatEffect(triggeredEffects, 'Greedy Loot', `Pirate Lords salvaged ${ctx.greedyLootGained} gold and supplies from the kill.`, 'aftermath');
  }
  if (ctx.poisonDetonated) {
    pushCombatEffect(triggeredEffects, 'Poison Detonation', 'Venom erupted on kill, poisoning adjacent enemies.', 'aftermath');
  }
  if (ctx.chargeSplashTargetsHit > 0) {
    pushCombatEffect(triggeredEffects, 'Charge Splash', `Charge impact dealt ${ctx.chargeSplashDamage} splash damage to ${ctx.chargeSplashTargetsHit} adjacent unit${ctx.chargeSplashTargetsHit === 1 ? '' : 's'}.`, 'aftermath');
  }
  if (ctx.pursuitMovementRestored > 0) {
    pushCombatEffect(triggeredEffects, 'Pursuit Movement', `Foraging riders pushed forward for +${ctx.pursuitMovementRestored} movement after the kill.`, 'aftermath');
  }
  if (ctx.resolution.killChainApplied) {
    pushCombatEffect(triggeredEffects, 'Killing Chain', 'Skirmisher chained a follow-up attack after the kill.', 'ability');
  }
  if (ctx.resolution.sporeJumpApplied) {
    pushCombatEffect(triggeredEffects, 'Spore Jump', `Venom jumped to ${ctx.sporeJumpTargets} nearby unit${ctx.sporeJumpTargets === 1 ? '' : 's'} after the poisoned kill.`, 'ability');
  }
  if (ctx.resolution.myceliumNetworkApplied) {
    pushCombatEffect(triggeredEffects, 'Mycelium Network', `Toxic bloom propagated ${ctx.myceliumTargets} friendly unit${ctx.myceliumTargets === 1 ? '' : 's'} with poison.`, 'ability');
  }
  if (ctx.emergentSustainHealApplied > 0) {
    pushCombatEffect(triggeredEffects, 'Paladin Sustain', `Attacker recovered ${ctx.emergentSustainHealApplied} HP from damage dealt.`, 'aftermath');
  }
  if (ctx.resolution.emergentSustainMinHpSaved) {
    pushCombatEffect(triggeredEffects, 'Undying Will', `Attacker survived a lethal blow at ${ctx.minHpFloor} HP.`, 'aftermath');
  }
  if (ctx.resolution.emergentSmiteApplied > 0) {
    pushCombatEffect(triggeredEffects, 'Radiant Smite', `Paladin at full HP dealt +${ctx.resolution.emergentSmiteApplied} smite damage.`, 'synergy');
  }
  if (ctx.resolution.emergentUndyingSaved) {
    pushCombatEffect(triggeredEffects, 'Juggernaut Undying', 'Juggernaut survived a lethal blow at 1 HP.', 'synergy');
  }
  if (ctx.resolution.lastStandSaved) {
    pushCombatEffect(triggeredEffects, 'Last Stand', 'Arctic Warden survived a lethal blow at 1 HP.', 'ability');
  }
  if (ctx.woundedEarthAbsorbed > 0) {
    if (ctx.woundedEarthAlliesHealed > 0) {
      pushCombatEffect(triggeredEffects, 'Wounded Earth', `Terrain channeled ${ctx.woundedEarthAbsorbed} absorbed damage into healing ${ctx.woundedEarthAlliesHealed} adjacent friendly unit${ctx.woundedEarthAlliesHealed === 1 ? '' : 's'} on forest/jungle.`, 'ability');
    } else {
      pushCombatEffect(triggeredEffects, 'Wounded Earth', `Terrain absorbed ${ctx.woundedEarthAbsorbed} damage, reducing HP loss.`, 'ability');
    }
  }
  const emergentManyFacedStance = (atk.data.get('emergentManyFacedStance') as string | undefined) ?? '';
  if (emergentManyFacedStance) {
    const stanceLabel = emergentManyFacedStance.charAt(0).toUpperCase() + emergentManyFacedStance.slice(1);
    pushCombatEffect(triggeredEffects, `Many-Faced: ${stanceLabel}`, `Adapted stance based on combat context.`, 'synergy');
    ctx.resolution.emergentManyFacedStance = emergentManyFacedStance;
    // Store stance on faction for non-combat consumption (phantom movement bonus)
    const factionsMF = new Map(ctx.current.factions);
    const mf = factionsMF.get(attacker.factionId);
    if (mf) {
      factionsMF.set(attacker.factionId, {
        ...mf,
        manyFacedLastStance: emergentManyFacedStance,
      });
      ctx.current = { ...ctx.current, factions: factionsMF };
    }
  }
  if (ctx.resolution.instantKillTriggered) {
    pushCombatEffect(triggeredEffects, 'Lethal Ambush', 'Synergy enabled an instant kill bypassing all defenses.', 'synergy');
  }
  if (ctx.resolution.stunApplied > 0) {
    pushCombatEffect(triggeredEffects, 'Stun', `Synergy stunned the defender for ${ctx.resolution.stunApplied} turn(s).`, 'synergy');
  }
  if (ctx.resolution.synergyReflectionDamage > 0) {
    pushCombatEffect(triggeredEffects, 'Synergy Reflection', `Synergy reflected ${ctx.resolution.synergyReflectionDamage} damage.`, 'synergy');
  }
  if (ctx.resolution.aoeTargetsHit > 0) {
    pushCombatEffect(triggeredEffects, 'Synergy AoE', `Area damage hit ${ctx.resolution.aoeTargetsHit} unit(s).`, 'synergy');
  }
  if (ctx.resolution.heavyRegenApplied > 0) {
    pushCombatEffect(triggeredEffects, 'Heavy Regeneration', `Synergy regenerated ${ctx.resolution.heavyRegenApplied} HP.`, 'synergy');
  }

  if (ctx.resolution.saplingApplied) {
    const detail = ctx.resolution.saplingMaxHpBonus > 0
      ? `Defender hex transformed into forest. Druid gained +${ctx.resolution.saplingMaxHpBonus} max HP.`
      : 'Defender hex transformed into forest.';
    pushCombatEffect(triggeredEffects, 'Sapling', detail, 'aftermath');
  }

  // Store triggered effects on feedback resolution
  ctx.feedback = {
    ...ctx.feedback,
    resolution: {
      ...ctx.feedback.resolution,
      triggeredEffects,
    },
  };
}

export function assembleResult(ctx: CombatContext): CombatActionApplyResult {
  const resolution: CombatActionResolution = {
    triggeredEffects: ctx.feedback.resolution.triggeredEffects,
    capturedOnKill: ctx.capturedOnKill,
    retreatCaptured: ctx.retreatCaptured,
    pressGangCaptured: ctx.resolution.pressGangCaptured,
    captiveChampionSpawned: ctx.resolution.captiveChampionSpawned,
    poisonDetonated: ctx.resolution.poisonDetonated,
    greedyLootGained: ctx.resolution.greedyLootGained,
    pursuitMovementRestored: ctx.resolution.pursuitMovementRestored,
    poisonApplied: ctx.poisonApplied,
    reStealthTriggered: ctx.reStealthTriggered,
    reflectionDamageApplied: ctx.reflectionDamageApplied,
    combatHealingApplied: ctx.combatHealingApplied,
    sandstormTargetsHit: ctx.sandstormTargetsHit,
    contaminatedHexApplied: ctx.contaminatedHexApplied,
    hitAndRunTriggered: ctx.hitAndRunTriggered,
    totalKnockbackDistance: ctx.totalKnockbackDistance,
    pursuitDamageApplied: ctx.pursuitDamageApplied,
    emergentSustainHealApplied: ctx.resolution.emergentSustainHealApplied,
    emergentSustainMinHpSaved: ctx.resolution.emergentSustainMinHpSaved,
    emergentSmiteApplied: ctx.resolution.emergentSmiteApplied,
    emergentUndyingSaved: ctx.resolution.emergentUndyingSaved,
    lastStandSaved: ctx.resolution.lastStandSaved,
    bleedApplied: ctx.resolution.bleedApplied,
    killChainApplied: ctx.resolution.killChainApplied,
    sporeJumpApplied: ctx.resolution.sporeJumpApplied,
    myceliumNetworkApplied: ctx.resolution.myceliumNetworkApplied,
    emergentManyFacedStance: ctx.resolution.emergentManyFacedStance,
    instantKillTriggered: ctx.resolution.instantKillTriggered,
    stunApplied: ctx.resolution.stunApplied,
    synergyReflectionDamage: ctx.resolution.synergyReflectionDamage,
    aoeTargetsHit: ctx.resolution.aoeTargetsHit,
    heavyRegenApplied: ctx.resolution.heavyRegenApplied,
    captureEscapePrevented: ctx.resolution.captureEscapePrevented,
    synergyCaptureBonus: ctx.resolution.synergyCaptureBonus,
    chargeSplashTargetsHit: ctx.resolution.chargeSplashTargetsHit,
    armadaChainDamage: ctx.resolution.armadaChainDamage,
    woundedEarthAbsorbed: ctx.woundedEarthAbsorbed,
    woundedEarthAlliesHealed: ctx.woundedEarthAlliesHealed,
    woundedEarthSaved: ctx.resolution.woundedEarthSaved,
    saplingApplied: ctx.resolution.saplingApplied,
    saplingMaxHpBonus: ctx.resolution.saplingMaxHpBonus,
    spikeLineChargeDamage: ctx.resolution.spikeLineChargeDamage,
    phalanxDamageShared: ctx.resolution.phalanxDamageShared,
    sunderingChargeApplied: ctx.resolution.sunderingChargeApplied,
  };

  const feedback = {
    ...ctx.feedback,
    resolution,
  };

  return { state: pruneDeadUnits(ctx.current), feedback };
}
