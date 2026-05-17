import type { RulesRegistry } from '../../data/registry/types.js';
import type { GameState } from '../../game/types.js';
import { resolveCapabilityDoctrine, buildSlaveOverrides } from '../capabilityDoctrine.js';
import { clearPreparedAbility } from '../abilitySystem.js';
import { awardCombatXP } from '../xpSystem.js';
import { tryPromoteUnit } from '../veterancySystem.js';
import { tryLearnFromKill } from '../learnByKillSystem.js';
import { attemptNonCombatCapture, getCaptureParams, hasCaptureAbility } from '../captureSystem.js';
import { isUnitRiverStealthed } from '../factionIdentitySystem.js';
import { getPrototype } from '../../game/stateAccess.js';
import { isWaterTerrain, isWoodlandTerrain } from '../terrainUtils.js';
import { hexToKey, getNeighbors } from '../../core/grid.js';
import { getUnitAtHex } from '../occupancySystem.js';
import { removeDeadUnitsFromFactions } from './helpers.js';
import type {
  CombatActionApplyResult,
  CombatActionFeedback,
  CombatActionPreview,
  CombatActionResolution,
} from './types.js';
import type { CombatContext } from './combatContext.js';

/**
 * Create the CombatContext from raw inputs.
 * Returns either a fully-initialized CombatContext or an early-return result
 * (when units/prototypes are missing or non-combat capture fires).
 */
export function createCombatContext(
  state: GameState,
  registry: RulesRegistry,
  preview: CombatActionPreview,
  learnChanceScale: number,
): { ctx: CombatContext } | { earlyReturn: CombatActionApplyResult } {
  const baseResolution: CombatActionResolution = {
    triggeredEffects: [...preview.triggeredEffects],
    capturedOnKill: false, retreatCaptured: false, pressGangCaptured: false,
    captiveChampionSpawned: false, poisonDetonated: false, greedyLootGained: 0,
    pursuitMovementRestored: 0, poisonApplied: false, reStealthTriggered: false,
    reflectionDamageApplied: 0, combatHealingApplied: 0, sandstormTargetsHit: 0,
    contaminatedHexApplied: false, hitAndRunTriggered: false, totalKnockbackDistance: 0,
    pursuitDamageApplied: 0, emergentSustainHealApplied: 0, emergentSustainMinHpSaved: false,
    emergentSmiteApplied: 0, emergentUndyingSaved: false, lastStandSaved: false,
    bleedApplied: false, killChainApplied: false, sporeJumpApplied: false,
    myceliumNetworkApplied: false, emergentManyFacedStance: '', instantKillTriggered: false,
    stunApplied: 0, synergyReflectionDamage: 0, aoeTargetsHit: 0, heavyRegenApplied: 0,
    captureEscapePrevented: false, synergyCaptureBonus: 0, chargeSplashTargetsHit: 0,
    armadaChainDamage: 0, woundedEarthAbsorbed: 0, woundedEarthAlliesHealed: 0,
    woundedEarthSaved: false, saplingApplied: false, saplingMaxHpBonus: 0,
  };
  const emptyFeedback: CombatActionFeedback = {
    lastLearnedDomain: null, hitAndRunRetreat: null, absorbedDomains: [], resolution: baseResolution,
  };
  const attacker = state.units.get(preview.attackerId);
  const defender = state.units.get(preview.defenderId);
  if (!attacker || !defender) {
    return { earlyReturn: { state, feedback: emptyFeedback } };
  }
  const attackerPrototype = getPrototype(state, attacker.prototypeId);
  const defenderPrototype = getPrototype(state, defender.prototypeId);
  if (!attackerPrototype || !defenderPrototype) {
    return { earlyReturn: { state, feedback: emptyFeedback } };
  }
  const attackerIsRanged =
    attackerPrototype.derivedStats.role === 'ranged' || (attackerPrototype.derivedStats.range ?? 1) > 1;
  const attackerFactionForDoctrine = state.factions.get(attacker.factionId);
  const attackerDoctrine = attackerFactionForDoctrine
    ? resolveCapabilityDoctrine(state.research.get(attacker.factionId), attackerFactionForDoctrine)
    : undefined;
  const defenderFactionForDoctrine = state.factions.get(defender.factionId);
  const defenderDoctrine = defenderFactionForDoctrine
    ? resolveCapabilityDoctrine(state.research.get(defender.factionId), defenderFactionForDoctrine)
    : undefined;
  const attackerChassis = registry.getChassis(attackerPrototype.chassisId);
  const isNavalAttacker = attackerChassis?.movementClass === 'naval';
  const defenderTerrainId = state.map?.tiles.get(hexToKey(defender.position))?.terrain ?? '';
  const isDefenderOnWater = isWaterTerrain(defenderTerrainId);
  const attackerTerrainId = state.map?.tiles.get(hexToKey(attacker.position))?.terrain ?? '';

  // Non-combat capture early return
  if (isNavalAttacker && !isDefenderOnWater && hasCaptureAbility(attackerPrototype, registry)) {
    const captureParams = getCaptureParams(attackerPrototype, registry);
    if (captureParams) {
      const enslavementResult = attemptNonCombatCapture(
        state, preview.attackerId, preview.defenderId, registry,
        captureParams.chance, captureParams.hpFraction, captureParams.cooldown,
        state.rngState, buildSlaveOverrides(attackerDoctrine),
      );
      const spentAttacker = enslavementResult.state.units.get(preview.attackerId);
      let enslavementState = enslavementResult.state;
      if (spentAttacker) {
        const units = new Map(enslavementState.units);
        units.set(preview.attackerId, {
          ...spentAttacker, attacksRemaining: 0, movesRemaining: 0,
          activatedThisRound: true, status: 'spent',
        });
        enslavementState = { ...enslavementState, units };
      }
      return {
        earlyReturn: {
          state: enslavementState,
          feedback: {
            lastLearnedDomain: null, hitAndRunRetreat: null, absorbedDomains: [],
            resolution: { ...baseResolution, retreatCaptured: enslavementResult.captured },
          },
        },
      };
    }
  }

  const atk = preview.details.attackerSynergy;
  const def = preview.details.defenderSynergy;
  const ctx: CombatContext = {
    // Immutable inputs
    state, registry, preview, learnChanceScale,
    // Computed once
    attacker, defender, attackerPrototype, defenderPrototype,
    attackerIsRanged, isNavalAttacker, defenderTerrainId, attackerTerrainId,
    isDefenderOnWater,
    attackerFaction: attackerFactionForDoctrine,
    defenderFaction: defenderFactionForDoctrine,
    attackerDoctrine, defenderDoctrine, atk, def,
    // Mutable pipeline state
    current: state, resolution: baseResolution, feedback: emptyFeedback,
    nextAttacker: attacker, nextDefender: defender,
    defenderActuallyDestroyed: false, attackerActuallyDestroyed: false,
    // Tracking variables
    capturedOnKill: false, retreatCaptured: false, pressGangCaptured: false,
    poisonApplied: false, reStealthTriggered: false, reflectionDamageApplied: 0,
    combatHealingApplied: 0, sandstormTargetsHit: 0, contaminatedHexApplied: false,
    pursuitDamageApplied: 0, greedyLootGained: 0, pursuitMovementRestored: 0,
    chargeSplashDamage: 0, chargeSplashTargetsHit: 0, totalKnockbackDistance: 0,
    minHpFloor: 0, woundedEarthAbsorbed: 0, woundedEarthAlliesHealed: 0,
    sporeJumpTargets: 0, myceliumTargets: 0, bigChargeRoutTriggered: false,
    stampedeDamageApplied: 0, bombardmentDamageApplied: 0, fightingRetreatDamage: 0,
    emergentSustainHealApplied: 0, emergentSmiteApplied: 0, armadaChainDamage: 0,
    poisonDetonated: false, saplingMaxHpBonus: 0, knockbackCollisionDamage: 0,
    hitAndRunTriggered: false, poisonTrapPositionsRaw: [],
  };
  return { ctx };
}

/**
 * Resolve damage, apply survival mechanics, build nextAttacker/nextDefender.
 * Mutates ctx fields: resolution, nextAttacker, nextDefender, minHpFloor,
 * woundedEarthAbsorbed, woundedEarthAlliesHealed, defenderActuallyDestroyed.
 */
export function resolveDamage(ctx: CombatContext): void {
  const { attacker, defender, preview, atk, defenderTerrainId, defenderDoctrine, attackerDoctrine, attackerFaction, isNavalAttacker } = ctx;
  const rawAttackerHp = attacker.hp - preview.result.attackerDamage;
  const minHpFloor = atk.getStat('emergentSustainMinHp');
  let attackerHp = Math.max(0, rawAttackerHp);
  if (minHpFloor > 0 && rawAttackerHp <= 0 && attacker.hp > 0) {
    attackerHp = Math.min(minHpFloor, attacker.hp);
    ctx.resolution.emergentSustainMinHpSaved = true;
  }
  // Juggernaut undying: survive at 1 HP once per combat
  if (atk.hasFlag('emergentUndying') && rawAttackerHp <= 0 && attacker.hp > 0 && attackerHp <= 0) {
    attackerHp = 1;
    ctx.resolution.emergentUndyingSaved = true;
  }
  let nextAttacker: typeof attacker = {
    ...attacker,
    hp: attackerHp,
    morale: Math.max(0, attacker.morale - preview.result.attackerMoraleLoss),
    routed: preview.result.attackerRouted || preview.result.attackerFled,
    hillDugIn: false, digInStacks: 0, attacksRemaining: 0, movesRemaining: 0,
    activatedThisRound: true, status: 'spent',
    woundsReceivedThisTurn: preview.result.attackerDamage > 0
      ? (attacker.woundsReceivedThisTurn ?? 0) + 1 : attacker.woundsReceivedThisTurn,
  };
  let nextDefender: typeof defender = {
    ...defender,
    hp: Math.max(0, defender.hp - preview.result.defenderDamage),
    morale: Math.max(0, defender.morale - preview.result.defenderMoraleLoss),
    routed: defender.slaveRoutImmune ? false : (preview.result.defenderRouted || preview.result.defenderFled),
    hillDugIn: false, digInStacks: 0,
    status: preview.result.defenderDestroyed ? 'spent' : defender.status,
    woundsReceivedThisTurn: preview.result.defenderDamage > 0
      ? (defender.woundsReceivedThisTurn ?? 0) + 1 : defender.woundsReceivedThisTurn,
  };

  // Nature Healing T2 — Wounded Earth: terrain absorbs 25% damage on forest/jungle
  let woundedEarthAbsorbed = 0;
  let woundedEarthAlliesHealed = 0;
  if (defenderDoctrine?.woundedEarthEnabled && preview.result.defenderDamage > 0 && isWoodlandTerrain(defenderTerrainId)) {
    const absorbAmount = Math.floor(preview.result.defenderDamage * 0.25);
    if (absorbAmount > 0) {
      woundedEarthAbsorbed = absorbAmount;
      if (!defenderDoctrine.woundedEarthHealEnabled) {
        // Foreign: terrain absorbs damage, reducing HP loss
        const newHp = Math.min(defender.hp, nextDefender.hp + absorbAmount);
        nextDefender = { ...nextDefender, hp: newHp, terrainDamageAbsorption: absorbAmount };
        if (preview.result.defenderDestroyed && newHp > 0) {
          ctx.resolution.woundedEarthSaved = true;
        }
      } else {
        // Native: defender takes full damage; adjacent allies heal instead
        nextDefender = { ...nextDefender, terrainDamageAbsorption: absorbAmount };
      }
    }
  }
  // Revert 'spent' status if Wounded Earth saved the defender
  if (ctx.resolution.woundedEarthSaved) {
    nextDefender = { ...nextDefender, status: defender.status };
  }

  // Heavy naval ram: extra damage from naval ram synergy
  const heavyNavalRamDamage = atk.getStat('heavyNavalRamDamage');
  if (heavyNavalRamDamage > 0 && isNavalAttacker && nextDefender.hp > 0) {
    nextDefender = { ...nextDefender, hp: Math.max(0, nextDefender.hp - heavyNavalRamDamage) };
  }
  // Slave coercion: extra damage when attacking with slaves
  const slaveCoercionDamageBonus = atk.getStat('slaveCoercionDamageBonus');
  if (slaveCoercionDamageBonus > 0 && nextDefender.hp > 0) {
    const coercionDmg = Math.max(1, Math.floor(preview.result.defenderDamage * slaveCoercionDamageBonus));
    nextDefender = { ...nextDefender, hp: Math.max(0, nextDefender.hp - coercionDmg) };
  }
  // Lethal Ambush: instant kill bypasses normal damage
  if (atk.hasFlag('instantKill') && nextDefender.hp > 0) {
    nextDefender = { ...nextDefender, hp: 0 };
    ctx.resolution.instantKillTriggered = true;
  }
  // Heavy Hitter T3 native — Last Stand: survive lethal at 1 HP once per turn
  if (
    nextDefender.hp <= 0 && defender.hp > 0 && defenderDoctrine?.lastStandEnabled
    && !defender.lastStandUsedThisTurn && !ctx.resolution.instantKillTriggered
  ) {
    nextDefender = { ...nextDefender, hp: 1, lastStandUsedThisTurn: true, status: defender.status };
    ctx.resolution.lastStandSaved = true;
  }
  const defenderActuallyDestroyed =
    preview.result.defenderDestroyed && !ctx.resolution.lastStandSaved && !ctx.resolution.woundedEarthSaved;

  if (preview.attackerWasStealthed && attacker.isStealthed && nextAttacker.hp > 0) {
    const isDesertStealth = attackerDoctrine?.permanentStealthEnabled === true
      && (preview.details.attackerTerrainId === 'desert' || preview.details.attackerTerrainId === 'tundra');
    const stealthTerrains = atk.getList('emergentPermanentStealthTerrains');
    const isEmergentTerrainStealth = stealthTerrains.length > 0
      && stealthTerrains.includes(preview.details.attackerTerrainId);
    const isRiverTerrainStealth = isUnitRiverStealthed(attackerFaction, preview.details.attackerTerrainId);
    const isPersistentStealth = attackerDoctrine?.persistentStealthOnAttackEnabled === true;
    if (!isDesertStealth && !isEmergentTerrainStealth && !isRiverTerrainStealth && !isPersistentStealth) {
      nextAttacker = { ...nextAttacker, isStealthed: false, turnsSinceStealthBreak: 1 };
    }
  }
  if (nextAttacker.preparedAbility) {
    nextAttacker = clearPreparedAbility(nextAttacker);
  }
  if (preview.braceTriggered && nextDefender.preparedAbility) {
    nextDefender = clearPreparedAbility(nextDefender);
  }
  // River Stealth T2 — Predator bleed: first attack from stealth applies bleed
  if (preview.attackerWasStealthed && attackerDoctrine?.predatorBleedEnabled && nextDefender.hp > 0 && !defenderActuallyDestroyed) {
    nextDefender = { ...nextDefender, bleeding: true, bleedTurnsRemaining: 3 };
    ctx.resolution.bleedApplied = true;
  }
  ctx.feedback = {
    lastLearnedDomain: null, hitAndRunRetreat: null, absorbedDomains: [], resolution: ctx.resolution,
  };
  // Write results back to ctx
  ctx.nextAttacker = nextAttacker;
  ctx.nextDefender = nextDefender;
  ctx.defenderActuallyDestroyed = defenderActuallyDestroyed;
  ctx.minHpFloor = minHpFloor;
  ctx.woundedEarthAbsorbed = woundedEarthAbsorbed;
  ctx.woundedEarthAlliesHealed = woundedEarthAlliesHealed;
}

/**
 * Learn from kill, award XP, promote, write units to state.
 * Mutates ctx fields: nextAttacker, feedback, current.
 */
export function processKillAndState(ctx: CombatContext): void {
  const { attacker, defender, defenderPrototype, preview, learnChanceScale, registry } = ctx;
  if (ctx.defenderActuallyDestroyed && !preview.result.attackerDestroyed && ctx.nextAttacker.hp > 0) {
    const learnResult = tryLearnFromKill(ctx.nextAttacker, defender, ctx.state, ctx.state.rngState, undefined, learnChanceScale);
    ctx.nextAttacker = learnResult.unit;
    if (learnResult.learned && learnResult.domainId) {
      ctx.feedback = {
        ...ctx.feedback,
        lastLearnedDomain: { unitId: ctx.nextAttacker.id, domainId: learnResult.domainId },
      };
    }
  }
  if (ctx.nextAttacker.hp > 0) {
    ctx.nextAttacker = awardCombatXP(ctx.nextAttacker, ctx.defenderActuallyDestroyed, !preview.result.attackerDestroyed);
    ctx.nextAttacker = tryPromoteUnit(ctx.nextAttacker, registry);
    ctx.nextAttacker = {
      ...ctx.nextAttacker,
      attackedTargetsThisTurn: [...(ctx.nextAttacker.attackedTargetsThisTurn ?? []), preview.defenderId],
    };
    // Slayer bonus: killing a cyclops promotes directly to Elite
    if (preview.result.defenderDestroyed && defenderPrototype?.tags?.includes('cyclops')) {
      const eliteThreshold = registry.getVeteranLevel('elite')?.xpThreshold ?? 120;
      ctx.nextAttacker = { ...ctx.nextAttacker, xp: eliteThreshold, veteranLevel: 'elite' };
    }
  }
  const nextUnits = new Map(ctx.state.units);
  if (ctx.nextAttacker.hp > 0) {
    nextUnits.set(preview.attackerId, ctx.nextAttacker);
  } else {
    nextUnits.delete(preview.attackerId);
  }
  if (ctx.nextDefender.hp > 0) {
    nextUnits.set(preview.defenderId, ctx.nextDefender);
  } else {
    nextUnits.delete(preview.defenderId);
  }
  ctx.current = {
    ...ctx.state,
    units: nextUnits,
    factions: removeDeadUnitsFromFactions(ctx.state.factions, nextUnits),
    rngState: preview.result.rngState,
  };
}

/**
 * Post-damage effects: Wounded Earth heal, emergent sustain, smite, pursuit.
 * Mutates ctx fields: current, resolution, emergentSustainHealApplied, emergentSmiteApplied,
 * pursuitDamageApplied, woundedEarthAlliesHealed.
 */
export function applyPostDamageEffects(ctx: CombatContext): void {
  const { attacker, defender, preview, atk, nextAttacker, nextDefender, defenderDoctrine } = ctx;
  // Nature Healing T2 native — Wounded Earth: adjacent allies on forest/jungle heal for absorbed amount
  if (ctx.woundedEarthAbsorbed > 0 && defenderDoctrine?.woundedEarthHealEnabled) {
    const healUnits = new Map(ctx.current.units);
    for (const adjHex of getNeighbors(defender.position)) {
      const adjUnitId = getUnitAtHex(ctx.current, adjHex);
      if (!adjUnitId) continue;
      const adjUnit = healUnits.get(adjUnitId);
      if (!adjUnit || adjUnit.factionId !== defender.factionId || adjUnit.hp <= 0) continue;
      const adjTerrainId = ctx.current.map?.tiles.get(hexToKey(adjHex))?.terrain ?? '';
      if (isWoodlandTerrain(adjTerrainId)) {
        healUnits.set(adjUnitId, { ...adjUnit, hp: Math.min(adjUnit.maxHp, adjUnit.hp + ctx.woundedEarthAbsorbed) });
        ctx.woundedEarthAlliesHealed++;
      }
    }
    if (ctx.woundedEarthAlliesHealed > 0) {
      ctx.current = { ...ctx.current, units: healUnits };
    }
  }

  // E5 — Paladin sustain: heal for % of damage dealt
  const emergentSustainHealPercent = atk.getStat('emergentSustainHealPercent');
  if (emergentSustainHealPercent > 0 && nextAttacker.hp > 0 && preview.result.defenderDamage > 0) {
    const sustainHeal = Math.floor(preview.result.defenderDamage * emergentSustainHealPercent);
    if (sustainHeal > 0) {
      const sustainUnit = ctx.current.units.get(preview.attackerId);
      if (sustainUnit && sustainUnit.hp > 0) {
        const healedHp = Math.min(sustainUnit.maxHp, sustainUnit.hp + sustainHeal);
        const afterSustain = new Map(ctx.current.units);
        afterSustain.set(preview.attackerId, { ...sustainUnit, hp: healedHp });
        ctx.current = { ...ctx.current, units: afterSustain };
        ctx.emergentSustainHealApplied = sustainHeal;
        ctx.resolution.emergentSustainHealApplied = sustainHeal;
      }
    }
  }

  // E5b — Paladin smite: bonus damage when attacker is at full HP
  const emergentSmiteBonus = atk.getStat('emergentSmiteBonus');
  if (emergentSmiteBonus > 0 && attacker.hp >= attacker.maxHp && nextDefender.hp > 0) {
    const smiteDamage = Math.floor(preview.result.defenderDamage * emergentSmiteBonus);
    if (smiteDamage > 0) {
      const smittenDefender = ctx.current.units.get(preview.defenderId);
      if (smittenDefender && smittenDefender.hp > 0) {
        const afterSmite = new Map(ctx.current.units);
        afterSmite.set(preview.defenderId, { ...smittenDefender, hp: Math.max(0, smittenDefender.hp - smiteDamage) });
        ctx.current = { ...ctx.current, units: afterSmite };
        ctx.emergentSmiteApplied = smiteDamage;
        ctx.resolution.emergentSmiteApplied = smiteDamage;
      }
    }
  }

  // Pursuit bonus: hitrun domain units press their advantage when winning the exchange
  const attackerFaction = ctx.current.factions.get(attacker.factionId);
  const hasHitrunDomain = attackerFaction && (
    attackerFaction.nativeDomain === 'hitrun' || attackerFaction.learnedDomains?.includes('hitrun')
  );
  if (hasHitrunDomain && nextAttacker.hp > 0 && nextDefender.hp > 0 && preview.result.defenderDamage > preview.result.attackerDamage) {
    const PURSUIT_BONUS = 2;
    const pursuedDefender = ctx.current.units.get(preview.defenderId);
    if (pursuedDefender && pursuedDefender.hp > 0) {
      const newHp = Math.max(0, pursuedDefender.hp - PURSUIT_BONUS);
      const unitsAfterPursuit = new Map(ctx.current.units);
      unitsAfterPursuit.set(preview.defenderId, { ...pursuedDefender, hp: newHp });
      ctx.current = { ...ctx.current, units: unitsAfterPursuit };
      ctx.pursuitDamageApplied = PURSUIT_BONUS;
    }
  }
}
