import { getEffectiveXpCost } from '../knowledgeSystem.js';
import { isWaterTerrain } from '../terrainUtils.js';
import { getZoneEffectsAtHex, addZoneEffect } from '../zoneEffectSystem.js';
import { getNeighbors, hexDistance, hexToKey } from '../../core/grid.js';
import { createUnitId } from '../../core/ids.js';
import type { RulesRegistry } from '../../data/registry/types.js';
import type { Unit } from '../../features/units/types.js';
import type { GameState } from '../../game/types.js';
import type { FactionId, TileCoord, UnitId } from '../../types.js';
import { rngChance, rngShuffle } from '../../core/rng.js';
import { resolveCapabilityDoctrine, buildSlaveOverrides } from '../capabilityDoctrine.js';
import { clearPreparedAbility } from '../abilitySystem.js';
import { applyCombatSignals } from '../combatSignalSystem.js';
import { addResearchProgressToNode, getNextResearchNodeForDomain } from '../researchSystem.js';
import { unlockHybridRecipes } from '../hybridSystem.js';
import { awardCombatXP } from '../xpSystem.js';
import { tryPromoteUnit } from '../veterancySystem.js';
import { tryLearnFromKill } from '../learnByKillSystem.js';
import { attemptCapture, attemptNonCombatCapture, getCaptureParams, hasCaptureAbility, findOriginalFaction, liberationOverrides } from '../captureSystem.js';
import { applyContactTransfer } from '../capabilitySystem.js';
import { applyPoisonDoT, enterStealth, findRetreatHex } from '../signatureAbilitySystem.js';
import { getPrototype, getNearestFriendlyCity } from '../../game/stateAccess.js';
import { getUnitAtHex } from '../occupancySystem.js';
import { getGreedyLootOnKill, getPoisonOnAttack, getPursuitMovementOnKill, isUnitRiverStealthed } from '../factionIdentitySystem.js';
import { isCoverTerrain, isWoodlandTerrain } from '../terrainUtils.js';

import {
  recordBattleFought,
  recordEnemyKilled,
  recordPromotion,
  updateCombatRecordOnLoss,
  updateCombatRecordOnWin,
  addHistoryEntry,
  getHistoryByType,
} from '../historySystem.js';

import { setTerrainAt } from '../terrainMutationSystem.js';
import { createZoneEffectId } from '../../core/ids.js';
import { EMERGENT_PARAMS } from '../emergentRuleParams.js';

import type {
  CombatActionApplyResult,
  CombatActionFeedback,
  CombatActionPreview,
  CombatActionResolution,
} from './types.js';
import { pushCombatEffect } from './labeling.js';
import {
  pruneDeadUnits,
  removeDeadUnitsFromFactions,
  rotateUnitToward,
  writeUnitToState,
  applyKnockbackDistance,
  destroyTransportIfApplicable,
} from './helpers.js';
import { maybeAbsorbFaction } from './factionAbsorption.js';

const COMBAT_RESEARCH_BONUS = 1.0;

function applyCombatResearchBonus(
  state: GameState,
  learnerFactionId: FactionId,
  enemyFactionId: FactionId,
  registry: RulesRegistry,
): GameState {
  const learner = state.factions.get(learnerFactionId);
  const enemy = state.factions.get(enemyFactionId);
  if (!learner || !enemy) return state;

  const domainId = enemy.nativeDomain;
  if (!learner.learnedDomains.includes(domainId)) return state;

  const research = state.research.get(learnerFactionId);
  if (!research) return state;

  const nextNode = getNextResearchNodeForDomain(domainId, research.completedNodes);
  if (!nextNode) return state;

  const domain = registry.getAllResearchDomains().find(d => d.id === domainId);
  const nodeDef = domain?.nodes[nextNode.nodeId];
  if (!nodeDef) return state;

  const domainCost = getEffectiveXpCost(learner, domainId, nodeDef.xpCost);

  const { state: updatedResearch } = addResearchProgressToNode(
    research, nextNode.nodeId, domainCost, COMBAT_RESEARCH_BONUS,
  );

  // Accumulate for UI display (view model reads this to show combat source)
  const prevCombat = updatedResearch.combatResearchBonusThisTurn ?? {};
  updatedResearch.combatResearchBonusThisTurn = {
    ...prevCombat,
    [domainId]: (prevCombat[domainId] ?? 0) + COMBAT_RESEARCH_BONUS,
  };

  const researchMap = new Map(state.research);
  researchMap.set(learnerFactionId, updatedResearch);
  return { ...state, research: researchMap };
}

interface PoisonInRangeOptions {
  factionFilter: 'friendlies' | 'enemies';
  filterFactionId: FactionId;
  stacks: number;
  damagePerStack: number;
  duration: number;
  provenance?: { factionId: FactionId; prototypeId?: string };
}

function applyPoisonInRange(
  units: ReadonlyMap<UnitId, Unit>,
  center: TileCoord,
  radius: number,
  opts: PoisonInRangeOptions,
): { units: Map<UnitId, Unit>; targetsHit: number } {
  const newUnits = new Map(units);
  let targetsHit = 0;

  for (const [uid, u] of newUnits) {
    if (opts.factionFilter === 'friendlies' && u.factionId !== opts.filterFactionId) continue;
    if (opts.factionFilter === 'enemies' && u.factionId === opts.filterFactionId) continue;
    if (u.hp <= 0) continue;
    if (hexDistance(u.position, center) > radius) continue;

    let poisonedUnit = applyPoisonDoT(u, opts.stacks, opts.damagePerStack, opts.duration);
    if (opts.provenance) {
      poisonedUnit = { ...poisonedUnit, poisonedBy: opts.provenance.factionId };
      if (opts.provenance.prototypeId !== undefined) {
        poisonedUnit = { ...poisonedUnit, poisonSourcePrototypeId: opts.provenance.prototypeId };
      }
    }
    newUnits.set(uid, poisonedUnit);
    targetsHit++;
  }

  return { units: newUnits, targetsHit };
}

export function applyCombatAction(
  state: GameState,
  registry: RulesRegistry,
  preview: CombatActionPreview,
  learnChanceScale = 1,
): CombatActionApplyResult {
  const baseResolution: CombatActionResolution = {
    triggeredEffects: [...preview.triggeredEffects],
    capturedOnKill: false,
    retreatCaptured: false,
    pressGangCaptured: false,
    captiveChampionSpawned: false,
    poisonDetonated: false,
    greedyLootGained: 0,
    pursuitMovementRestored: 0,
    poisonApplied: false,
    reStealthTriggered: false,
    reflectionDamageApplied: 0,
    combatHealingApplied: 0,
    sandstormTargetsHit: 0,
    contaminatedHexApplied: false,
    frostbiteApplied: false,
    hitAndRunTriggered: false,
    healOnRetreatApplied: 0,
    totalKnockbackDistance: 0,
    pursuitDamageApplied: 0,
    emergentSustainHealApplied: 0,
    emergentSustainMinHpSaved: false,
    emergentSmiteApplied: 0,
    emergentUndyingSaved: false,
    lastStandSaved: false,
    bleedApplied: false,
    killChainApplied: false,
    sporeJumpApplied: false,
    myceliumNetworkApplied: false,
    emergentManyFacedStance: '',
    instantKillTriggered: false,
    stunApplied: 0,
    formationCrushApplied: 0,
    synergyReflectionDamage: 0,
    aoeTargetsHit: 0,
    heavyRegenApplied: 0,
    slaveHealApplied: 0,
    captureEscapePrevented: false,
    synergyCaptureBonus: 0,
    chargeSplashTargetsHit: 0,
    woundedEarthAbsorbed: 0,
    woundedEarthAlliesHealed: 0,
    woundedEarthSaved: false,
    saplingApplied: false,
    saplingMaxHpBonus: 0,
  };

  const attacker = state.units.get(preview.attackerId);
  const defender = state.units.get(preview.defenderId);
  if (!attacker || !defender) {
    return {
      state,
      feedback: {
        lastLearnedDomain: null,
        hitAndRunRetreat: null,
        absorbedDomains: [],
        resolution: baseResolution,
      },
    };
  }

  const attackerPrototype = getPrototype(state, attacker.prototypeId);
  const defenderPrototype = getPrototype(state, defender.prototypeId);
  if (!attackerPrototype || !defenderPrototype) {
    return {
      state,
      feedback: {
        lastLearnedDomain: null,
        hitAndRunRetreat: null,
        absorbedDomains: [],
        resolution: baseResolution,
      },
    };
  }

  const attackerIsRanged = attackerPrototype.derivedStats.role === 'ranged' || (attackerPrototype.derivedStats.range ?? 1) > 1;

  const attackerFactionForDoctrine = state.factions.get(attacker.factionId);
  const attackerDoctrine = attackerFactionForDoctrine
    ? resolveCapabilityDoctrine(state.research.get(attacker.factionId), attackerFactionForDoctrine)
    : undefined;

  const defenderFactionForDoctrine = state.factions.get(defender.factionId);
  const defenderDoctrineEarly = defenderFactionForDoctrine
    ? resolveCapabilityDoctrine(state.research.get(defender.factionId), defenderFactionForDoctrine)
    : undefined;

  // E5 — Paladin minHp: can't drop below threshold from a single hit
  const attackerChassis = registry.getChassis(attackerPrototype.chassisId);
  const isNavalAttacker = attackerChassis?.movementClass === 'naval';
  const defenderTerrainId = state.map?.tiles.get(hexToKey(defender.position))?.terrain ?? '';
  const isDefenderOnWater = isWaterTerrain(defenderTerrainId);

  if (isNavalAttacker && !isDefenderOnWater && hasCaptureAbility(attackerPrototype, registry)) {
    const captureParams = getCaptureParams(attackerPrototype, registry);
    if (captureParams) {
      const enslavementResult = attemptNonCombatCapture(
        state,
        preview.attackerId,
        preview.defenderId,
        registry,
        captureParams.chance,
        captureParams.hpFraction,
        captureParams.cooldown,
        state.rngState,
        buildSlaveOverrides(attackerDoctrine),
      );

      const spentAttacker = enslavementResult.state.units.get(preview.attackerId);
      let enslavementState = enslavementResult.state;
      if (spentAttacker) {
        const units = new Map(enslavementState.units);
        units.set(preview.attackerId, {
          ...spentAttacker,
          attacksRemaining: 0,
          movesRemaining: 0,
          activatedThisRound: true,
          status: 'spent',
        });
        enslavementState = { ...enslavementState, units };
      }

      return {
        state: enslavementState,
        feedback: {
          lastLearnedDomain: null,
          hitAndRunRetreat: null,
          absorbedDomains: [],
          resolution: {
            ...baseResolution,
            retreatCaptured: enslavementResult.captured,
          },
        },
      };
    }
  }

  const atk = preview.details.attackerSynergy;
  const def = preview.details.defenderSynergy;

  const rawAttackerHp = attacker.hp - preview.result.attackerDamage;
  const minHpFloor = atk.getStat('emergentSustainMinHp');
  let attackerHp = Math.max(0, rawAttackerHp);
  if (minHpFloor > 0 && rawAttackerHp <= 0 && attacker.hp > 0) {
    attackerHp = Math.min(minHpFloor, attacker.hp);
    baseResolution.emergentSustainMinHpSaved = true;
  }

  // Juggernaut undying: survive at 1 HP once per combat
  if (atk.hasFlag('emergentUndying') && rawAttackerHp <= 0 && attacker.hp > 0 && attackerHp <= 0) {
    attackerHp = 1;
    baseResolution.emergentUndyingSaved = true;
  }

  let nextAttacker: Unit = {
    ...attacker,
    hp: attackerHp,
    morale: Math.max(0, attacker.morale - preview.result.attackerMoraleLoss),
    routed: preview.result.attackerRouted || preview.result.attackerFled,
    hillDugIn: false,
    digInStacks: 0,
    attacksRemaining: 0,
    movesRemaining: 0,
    activatedThisRound: true,
    status: 'spent',
    woundsReceivedThisTurn: preview.result.attackerDamage > 0
      ? (attacker.woundsReceivedThisTurn ?? 0) + 1
      : attacker.woundsReceivedThisTurn,
  };
  let nextDefender: Unit = {
    ...defender,
    hp: Math.max(0, defender.hp - preview.result.defenderDamage),
    morale: Math.max(0, defender.morale - preview.result.defenderMoraleLoss),
    routed: defender.slaveRoutImmune ? false : (preview.result.defenderRouted || preview.result.defenderFled),
    hillDugIn: false,
    digInStacks: 0,
    // Preview-based status: marked 'spent' if the preview predicts a kill;
    // the Last Stand block below reverts this to defender.status if a save
    // fires, so the final state correctly reflects defenderActuallyDestroyed.
    status: preview.result.defenderDestroyed ? 'spent' : defender.status,
    woundsReceivedThisTurn: preview.result.defenderDamage > 0
      ? (defender.woundsReceivedThisTurn ?? 0) + 1
      : defender.woundsReceivedThisTurn,
  };

  // Nature Healing T2 — Wounded Earth: terrain absorbs 25% damage on forest/jungle
  let woundedEarthAbsorbed = 0;
  let woundedEarthAlliesHealed = 0;
  if (
    defenderDoctrineEarly?.woundedEarthEnabled
    && preview.result.defenderDamage > 0
    && isWoodlandTerrain(defenderTerrainId)
  ) {
    const absorbAmount = Math.floor(preview.result.defenderDamage * 0.25);
    if (absorbAmount > 0) {
      woundedEarthAbsorbed = absorbAmount;
      if (!defenderDoctrineEarly.woundedEarthHealEnabled) {
        // Foreign: terrain absorbs damage, reducing HP loss
        const newHp = Math.min(defender.hp, nextDefender.hp + absorbAmount);
        nextDefender = {
          ...nextDefender,
          hp: newHp,
          terrainDamageAbsorption: absorbAmount,
        };
        if (preview.result.defenderDestroyed && newHp > 0) {
          baseResolution.woundedEarthSaved = true;
        }
      } else {
        // Native: defender takes full damage; adjacent allies heal instead (applied after current is built)
        nextDefender = { ...nextDefender, terrainDamageAbsorption: absorbAmount };
      }
    }
  }

  // Revert 'spent' status if Wounded Earth saved the defender
  if (baseResolution.woundedEarthSaved) {
    nextDefender = { ...nextDefender, status: defender.status };
  }

  // Phase 3C — Heavy naval ram: extra damage from naval ram synergy
  const heavyNavalRamDamage = atk.getStat('heavyNavalRamDamage');
  if (heavyNavalRamDamage > 0 && isNavalAttacker && nextDefender.hp > 0) {
    nextDefender = { ...nextDefender, hp: Math.max(0, nextDefender.hp - heavyNavalRamDamage) };
  }

  // Phase 3C — Slave coercion: extra damage when attacking with slaves
  const slaveCoercionDamageBonus = atk.getStat('slaveCoercionDamageBonus');
  if (slaveCoercionDamageBonus > 0 && nextDefender.hp > 0) {
    const coercionDmg = Math.max(1, Math.floor(preview.result.defenderDamage * slaveCoercionDamageBonus));
    nextDefender = { ...nextDefender, hp: Math.max(0, nextDefender.hp - coercionDmg) };
  }

  // Phase 3A — Lethal Ambush: instant kill bypasses normal damage
  if (atk.hasFlag('instantKill') && nextDefender.hp > 0) {
    nextDefender = { ...nextDefender, hp: 0 };
    baseResolution.instantKillTriggered = true;
  }

  // Heavy Hitter T3 native — Last Stand: survive lethal at 1 HP once per turn
  if (
    nextDefender.hp <= 0
    && defender.hp > 0
    && defenderDoctrineEarly?.lastStandEnabled
    && !defender.lastStandUsedThisTurn
    && !baseResolution.instantKillTriggered
  ) {
    // Restore HP + status. The 'spent' status was set above based on the
    // preview's destroyed prediction; revert it so the saved defender is
    // not mis-flagged as having acted/died.
    nextDefender = { ...nextDefender, hp: 1, lastStandUsedThisTurn: true, status: defender.status };
    baseResolution.lastStandSaved = true;
  }

  // After Last Stand has had a chance to fire, this is the canonical
  // "did the defender actually die?" signal that all downstream logic
  // (kill XP, learn-from-kill, transport destroy, killchain, post-kill
  // effects, knockback, rout, etc.) should read. `preview.result.
  // defenderDestroyed` reflects only the preview's prediction and is
  // stale once a save mechanism fires.
  const defenderActuallyDestroyed = preview.result.defenderDestroyed && !baseResolution.lastStandSaved && !baseResolution.woundedEarthSaved;

  if (preview.attackerWasStealthed && attacker.isStealthed && nextAttacker.hp > 0) {
    const isDesertStealth = attackerDoctrine?.permanentStealthEnabled === true
      && (preview.details.attackerTerrainId === 'desert' || preview.details.attackerTerrainId === 'tundra');
    const stealthTerrains = atk.getList('emergentPermanentStealthTerrains');
    const isEmergentTerrainStealth = stealthTerrains.length > 0
      && stealthTerrains.includes(preview.details.attackerTerrainId);
    const isRiverTerrainStealth = isUnitRiverStealthed(attackerFactionForDoctrine, preview.details.attackerTerrainId);
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
  if (
    preview.attackerWasStealthed
    && attackerDoctrine?.predatorBleedEnabled
    && nextDefender.hp > 0
    && !defenderActuallyDestroyed
  ) {
    nextDefender = {
      ...nextDefender,
      bleeding: true,
      bleedTurnsRemaining: 3,
    };
    baseResolution.bleedApplied = true;
  }

  let feedback: CombatActionFeedback = {
    lastLearnedDomain: null,
    hitAndRunRetreat: null,
    absorbedDomains: [],
    resolution: baseResolution,
  };

  if (defenderActuallyDestroyed && !preview.result.attackerDestroyed && nextAttacker.hp > 0) {
    const learnResult = tryLearnFromKill(nextAttacker, defender, state, state.rngState, undefined, learnChanceScale);
    nextAttacker = learnResult.unit;
    if (learnResult.learned && learnResult.domainId) {
      feedback = {
        ...feedback,
        lastLearnedDomain: {
          unitId: nextAttacker.id,
          domainId: learnResult.domainId,
        },
      };
    }
  }

  if (nextAttacker.hp > 0) {
    nextAttacker = awardCombatXP(nextAttacker, defenderActuallyDestroyed, !preview.result.attackerDestroyed);
    nextAttacker = tryPromoteUnit(nextAttacker, registry);
    nextAttacker = {
      ...nextAttacker,
      attackedTargetsThisTurn: [...(nextAttacker.attackedTargetsThisTurn ?? []), preview.defenderId],
    };
  }

  const nextUnits = new Map(state.units);
  if (nextAttacker.hp > 0) {
    nextUnits.set(preview.attackerId, nextAttacker);
  } else {
    nextUnits.delete(preview.attackerId);
  }
  if (nextDefender.hp > 0) {
    nextUnits.set(preview.defenderId, nextDefender);
  } else {
    nextUnits.delete(preview.defenderId);
  }

  let current: GameState = {
    ...state,
    units: nextUnits,
    factions: removeDeadUnitsFromFactions(state.factions, nextUnits),
    rngState: preview.result.rngState,
  };

  const attackerFaction = current.factions.get(attacker.factionId);
  const defenderFaction = current.factions.get(defender.factionId);
  const defenderDoctrine = defenderFaction
    ? resolveCapabilityDoctrine(current.research.get(defender.factionId), defenderFaction)
    : undefined;

  // Nature Healing T2 native — Wounded Earth: adjacent allies on forest/jungle heal for absorbed amount
  if (woundedEarthAbsorbed > 0 && defenderDoctrineEarly?.woundedEarthHealEnabled) {
    const healUnits = new Map(current.units);
    for (const adjHex of getNeighbors(defender.position)) {
      const adjUnitId = getUnitAtHex(current, adjHex);
      if (!adjUnitId) continue;
      const adjUnit = healUnits.get(adjUnitId);
      if (!adjUnit || adjUnit.factionId !== defender.factionId || adjUnit.hp <= 0) continue;
      const adjTerrainId = current.map?.tiles.get(hexToKey(adjHex))?.terrain ?? '';
      if (isWoodlandTerrain(adjTerrainId)) {
        healUnits.set(adjUnitId, {
          ...adjUnit,
          hp: Math.min(adjUnit.maxHp, adjUnit.hp + woundedEarthAbsorbed),
        });
        woundedEarthAlliesHealed++;
      }
    }
    if (woundedEarthAlliesHealed > 0) {
      current = { ...current, units: healUnits };
    }
  }

  // E5 — Paladin sustain: heal for % of damage dealt
  let emergentSustainHealApplied = 0;
  const emergentSustainHealPercent = atk.getStat('emergentSustainHealPercent');
  if (emergentSustainHealPercent > 0 && nextAttacker.hp > 0 && preview.result.defenderDamage > 0) {
    const sustainHeal = Math.floor(preview.result.defenderDamage * emergentSustainHealPercent);
    if (sustainHeal > 0) {
      const sustainUnit = current.units.get(preview.attackerId);
      if (sustainUnit && sustainUnit.hp > 0) {
        const healedHp = Math.min(sustainUnit.maxHp, sustainUnit.hp + sustainHeal);
        const afterSustain = new Map(current.units);
        afterSustain.set(preview.attackerId, { ...sustainUnit, hp: healedHp });
        current = { ...current, units: afterSustain };
        emergentSustainHealApplied = sustainHeal;
        baseResolution.emergentSustainHealApplied = sustainHeal;
      }
    }
  }

  // E5b — Paladin smite: bonus damage when attacker is at full HP
  let emergentSmiteApplied = 0;
  const emergentSmiteBonus = atk.getStat('emergentSmiteBonus');
  if (emergentSmiteBonus > 0 && attacker.hp >= attacker.maxHp && nextDefender.hp > 0) {
    const smiteDamage = Math.floor(preview.result.defenderDamage * emergentSmiteBonus);
    if (smiteDamage > 0) {
      const smittenDefender = current.units.get(preview.defenderId);
      if (smittenDefender && smittenDefender.hp > 0) {
        const afterSmite = new Map(current.units);
        afterSmite.set(preview.defenderId, { ...smittenDefender, hp: Math.max(0, smittenDefender.hp - smiteDamage) });
        current = { ...current, units: afterSmite };
        emergentSmiteApplied = smiteDamage;
        baseResolution.emergentSmiteApplied = smiteDamage;
      }
    }
  }

  // Pursuit bonus: hitrun domain units press their advantage when winning the exchange
  const hasHitrunDomain = attackerFaction && (
    attackerFaction.nativeDomain === 'hitrun'
    || attackerFaction.learnedDomains?.includes('hitrun')
  );
  let pursuitDamageApplied = 0;
  if (
    hasHitrunDomain
    && nextAttacker.hp > 0
    && nextDefender.hp > 0
    && preview.result.defenderDamage > preview.result.attackerDamage
  ) {
    const PURSUIT_BONUS = 2;
    const pursuedDefender = current.units.get(preview.defenderId);
    if (pursuedDefender && pursuedDefender.hp > 0) {
      const newHp = Math.max(0, pursuedDefender.hp - PURSUIT_BONUS);
      const unitsAfterPursuit = new Map(current.units);
      unitsAfterPursuit.set(preview.defenderId, { ...pursuedDefender, hp: newHp });
      current = { ...current, units: unitsAfterPursuit };
      pursuitDamageApplied = PURSUIT_BONUS;
    }
  }
  const attackerTerrainId = current.map?.tiles.get(hexToKey(attacker.position))?.terrain ?? '';
  const isGreedyCoastal = attackerFaction?.identityProfile.passiveTrait === 'greedy'
    && isWaterTerrain(attackerTerrainId);
  const autoCaptureThreshold = attackerDoctrine?.slaverTranscendenceEnabled ? 0.5
    : attackerDoctrine?.autoCaptureEnabled ? 0.25 : 0;
  const autoCaptureAbility = autoCaptureThreshold > 0 && defender.hp <= defender.maxHp * autoCaptureThreshold
    ? {
        greedyCaptureChance: 1,
        greedyCaptureCooldown: 0,
        greedyCaptureHpFraction: autoCaptureThreshold,
      }
    : null;
  // Maelstrom auto-capture: native tidal T3 — naval kills inside attacker's
  // own Maelstrom auto-capture regardless of HP threshold (slaving synergy).
  const maelstromAutoCapture = attackerDoctrine?.maelstromAutoCaptureEnabled
    && isNavalAttacker
    && getZoneEffectsAtHex(current, defender.position).some(
      e => e.type === 'maelstrom' && e.ownerFactionId === attacker.factionId,
    )
    ? { greedyCaptureChance: 1, greedyCaptureCooldown: 0, greedyCaptureHpFraction: 0.5 }
    : null;
  // Slaving T3 — Naval capture radius: friendly naval units within range extend
  // auto-capture to non-capture attackers (naval support aura).
  const navalRadius = attackerDoctrine?.navalCaptureRadius ?? 0;
  const hasNavalSupport = navalRadius > 0
    && !hasCaptureAbility(attackerPrototype, registry)
    && !autoCaptureAbility
    && !maelstromAutoCapture
    && Array.from(current.units.values()).some(unit => {
      if (unit.factionId !== attacker.factionId || unit.id === attacker.id) return false;
      if (hexDistance(unit.position, defender.position) > navalRadius) return false;
      const proto = current.prototypes.get(unit.prototypeId);
      const chassis = proto ? registry.getChassis(proto.chassisId) : undefined;
      return chassis?.movementClass === 'naval' && !unit.slaveStatFraction;
    });
  const navalSupportCapture = hasNavalSupport && defender.hp <= defender.maxHp * 0.5
    ? { greedyCaptureChance: 1, greedyCaptureCooldown: 0, greedyCaptureHpFraction: 0.5 }
    : null;
  // Juggernaut slaving signature: auto-capture below HP threshold
  const emergentCaptureBelowHpPercent = atk.getStat('emergentCaptureBelowHpPercent');
  const juggernautSlavingCapture = emergentCaptureBelowHpPercent > 0
    && !autoCaptureAbility && !maelstromAutoCapture && !navalSupportCapture
    && defender.hp <= defender.maxHp * emergentCaptureBelowHpPercent
    ? { greedyCaptureChance: 1, greedyCaptureCooldown: 0, greedyCaptureHpFraction: emergentCaptureBelowHpPercent }
    : null;
  // E3/E4 — emergent capture bonus from Slave Empire (+0.20) and Desert Raider (+0.30 in desert)
  const emergentCaptureBonus = atk.getStat('emergentCaptureBonus')
    + (preview.details.defenderTerrainId === 'desert' ? atk.getStat('emergentDesertCaptureBonus') : 0);
  // Phase 3B — synergy capture bonuses
  let synergyCaptureBonus = 0;
  if (preview.details.isChargeAttack) synergyCaptureBonus += atk.getStat('chargeCaptureChance');
  if (isWaterTerrain(attackerTerrainId)) synergyCaptureBonus += atk.getStat('navalCaptureBonus');
  if (preview.attackerWasStealthed) synergyCaptureBonus += atk.getStat('stealthCaptureBonus');
  baseResolution.synergyCaptureBonus = synergyCaptureBonus;
  const totalCaptureBonus = emergentCaptureBonus + synergyCaptureBonus;

  // E5 — Paladin sustain overrides attackerDestroyed when minHp saved the unit
  // Juggernaut undying also prevents attacker destruction once per combat
  const attackerActuallyDestroyed = preview.result.attackerDestroyed && !baseResolution.emergentSustainMinHpSaved && !baseResolution.emergentUndyingSaved;

  let capturedOnKill = false;
  let retreatCaptured = false;
  if (
    defenderActuallyDestroyed
    && nextAttacker.hp > 0
    && (hasCaptureAbility(attackerPrototype, registry) || isGreedyCoastal || autoCaptureAbility || maelstromAutoCapture || navalSupportCapture || juggernautSlavingCapture)
  ) {
    const captureResult = attemptCapture(
      current,
      nextAttacker,
      defender,
      registry,
      autoCaptureAbility
        ?? maelstromAutoCapture
        ?? navalSupportCapture
        ?? juggernautSlavingCapture
        ?? (isGreedyCoastal && !hasCaptureAbility(attackerPrototype, registry)
          ? registry.getSignatureAbility(attacker.factionId)
          : null),
      current.rngState,
      totalCaptureBonus > 0 ? totalCaptureBonus : undefined,
      buildSlaveOverrides(attackerDoctrine),
    );
    current = captureResult.state;
    capturedOnKill = captureResult.captured;
  }

  // Phase A — Press gang capture (slaving_t1): capture chance on kill vs wounded
  let pressGangCaptured = false;
  if (
    defenderActuallyDestroyed
    && !capturedOnKill
    && attackerDoctrine?.pressGangCaptureEnabled
    && nextAttacker.hp > 0
  ) {
    // Use original `defender` (captured at function entry) because the defender
    // was already deleted from current.units when defenderDestroyed is true.
    if (defender) {
      if (rngChance(current.rngState, 0.3)) {
        const slaveHp = attackerDoctrine?.slaveHpFraction ?? 0.25;
        const overrides = buildSlaveOverrides(attackerDoctrine);
        const isReCapture = findOriginalFaction(defender, defender.factionId) === attacker.factionId;
        const liberation = liberationOverrides(isReCapture, overrides, defender.slaveStatFraction);
        const captured: Unit = {
          ...defender,
          factionId: attacker.factionId,
          hp: Math.max(1, Math.floor(defender.maxHp * slaveHp)),
          morale: 40,
          veteranLevel: 'green' as import('../../core/enums.js').VeteranLevel,
          status: 'ready' as import('../../core/enums.js').UnitStatus,
          slaveStatFraction: liberation.statFraction,
          slaveRoutImmune: liberation.routImmune,
        };
        const unitsAfterCapture = new Map(current.units);
        unitsAfterCapture.set(preview.defenderId, captured);
        const factionsAfterCapture = new Map(current.factions);
        const attackerFactionAfterCapture = factionsAfterCapture.get(attacker.factionId);
        if (attackerFactionAfterCapture) {
          factionsAfterCapture.set(attacker.factionId, {
            ...attackerFactionAfterCapture,
            unitIds: [...attackerFactionAfterCapture.unitIds, captured.id],
            slaveCaptureCount: attackerFactionAfterCapture.slaveCaptureCount + 1,
          });
        }
        current = { ...current, units: unitsAfterCapture, factions: factionsAfterCapture };
        pressGangCaptured = true;
        baseResolution.pressGangCaptured = true;
      }
    }
  }

  // Phase A — Greedy loot on kill (Pirate Lords passive)
  let greedyLootGained = 0;
  if (defenderActuallyDestroyed && nextAttacker.hp > 0) {
    const loot = getGreedyLootOnKill(attackerFaction);
    if (loot) {
      const attackerEconomy = current.economy.get(attacker.factionId);
      if (attackerEconomy) {
        const updatedEconomy = new Map(current.economy);
        updatedEconomy.set(attacker.factionId, {
          ...attackerEconomy,
          productionPool: attackerEconomy.productionPool + loot.gold + loot.supplies,
        });
        current = { ...current, economy: updatedEconomy };
        greedyLootGained = loot.gold;
        baseResolution.greedyLootGained = loot.gold;
      }
    }
  }

  // Mycelium Network (venom_t3 native): a kill on a hex covered by an
  // attacker-owned Toxic Bloom propagates 2 fresh poison stacks to ALL
  // friendly units within 3 hexes of that bloom's center.
  let myceliumTargets = 0;
  if (
    defenderActuallyDestroyed
    && attackerDoctrine?.myceliumNetworkOnKillEnabled
    && nextAttacker.hp > 0
  ) {
    let ownedBloom: import('../../game/types.js').ZoneEffect | null = null;
    for (const effect of current.zoneEffects.values()) {
      if (effect.type !== 'toxic_bloom') continue;
      if (effect.ownerFactionId !== attacker.factionId) continue;
      if (hexDistance(defender.position, effect.center) > effect.radius) continue;
      ownedBloom = effect;
      break;
    }
    if (ownedBloom) {
      const result = applyPoisonInRange(current.units, ownedBloom.center, 3, {
        factionFilter: 'friendlies', filterFactionId: attacker.factionId,
        stacks: 2, damagePerStack: attackerDoctrine.poisonDamagePerStack, duration: 3,
        provenance: { factionId: attacker.factionId, prototypeId: attacker.prototypeId },
      });
      if (result.targetsHit > 0) {
        current = { ...current, units: result.units };
        baseResolution.myceliumNetworkApplied = true;
        myceliumTargets = result.targetsHit;
      }
    }
  }

  // Phase A — Poison detonate (venom_t3 native): AoE poison on adjacent enemies after kill
  let poisonDetonated = false;
  if (defenderActuallyDestroyed && attackerDoctrine?.nativePoisonDetonateEnabled && nextAttacker.hp > 0) {
    const detonateUnits = new Map(current.units);
    let detonateCount = 0;
    for (const adjHex of getNeighbors(defender.position)) {
      const adjUnitId = getUnitAtHex(current, adjHex);
      if (!adjUnitId) continue;
      const adjUnit = detonateUnits.get(adjUnitId);
      if (adjUnit && adjUnit.factionId !== attacker.factionId && adjUnit.hp > 0) {
        detonateUnits.set(adjUnitId, {
          ...adjUnit,
          hp: Math.max(0, adjUnit.hp - 3),
          poisonedBy: attacker.factionId,
          poisonStacks: (adjUnit.poisonStacks ?? 0) + 2,
          poisonTurnsRemaining: Math.max(adjUnit.poisonTurnsRemaining ?? 0, 3),
        });
        detonateCount++;
      }
    }
    if (detonateCount > 0) {
      current = { ...current, units: detonateUnits };
      poisonDetonated = true;
      baseResolution.poisonDetonated = true;
    }
  }

  // Charge T3 native — splash: 50% of charge damage to enemies adjacent to defender
  let chargeSplashDamage = 0;
  let chargeSplashTargetsHit = 0;
  if (
    preview.details.isChargeAttack
    && preview.details.chargeSplashEnabled
    && preview.result.defenderDamage > 0
    && nextAttacker.hp > 0
  ) {
    chargeSplashDamage = Math.max(1, Math.floor(preview.result.defenderDamage * 0.5));
    const splashUnits = new Map(current.units);
    for (const adjHex of getNeighbors(defender.position)) {
      const adjUnitId = getUnitAtHex(current, adjHex);
      if (!adjUnitId) continue;
      const adjUnit = splashUnits.get(adjUnitId);
      if (adjUnit && adjUnit.factionId !== attacker.factionId && adjUnit.hp > 0) {
        splashUnits.set(adjUnitId, { ...adjUnit, hp: Math.max(0, adjUnit.hp - chargeSplashDamage) });
        chargeSplashTargetsHit++;
      }
    }
    if (chargeSplashTargetsHit > 0) {
      current = { ...current, units: splashUnits };
      baseResolution.chargeSplashTargetsHit = chargeSplashTargetsHit;
    }
  }

  // Phase A — Pursuit movement (foraging_riders): restore movement after kill
  let pursuitMovementRestored = 0;
  if (defenderActuallyDestroyed && nextAttacker.hp > 0) {
    const pursuitMoves = getPursuitMovementOnKill(attackerFaction);
    if (pursuitMoves > 0) {
      const pursuitUnit = current.units.get(preview.attackerId);
      if (pursuitUnit && pursuitUnit.hp > 0) {
        const unitsAfterPursuit = new Map(current.units);
        unitsAfterPursuit.set(preview.attackerId, {
          ...pursuitUnit,
          movesRemaining: pursuitUnit.movesRemaining + pursuitMoves,
        });
        current = { ...current, units: unitsAfterPursuit };
        pursuitMovementRestored = pursuitMoves;
        baseResolution.pursuitMovementRestored = pursuitMoves;
      }
    }
  }

  // Melee advance: melee attacker occupies defender's hex on kill (not capture)
  if (
    defenderActuallyDestroyed
    && !attackerActuallyDestroyed
    && !capturedOnKill
    && !attackerIsRanged
  ) {
    const advancingUnit = current.units.get(preview.attackerId);
    if (advancingUnit) {
      const advancedUnits = new Map(current.units);
      advancedUnits.set(preview.attackerId, {
        ...advancingUnit,
        position: defender.position,
      });
      current = { ...current, units: advancedUnits };
    }
  }

  // Hitrun T3 — Killing Chain: follow-up attack after kill
  if (
    defenderActuallyDestroyed
    && !attackerActuallyDestroyed
    && (attackerDoctrine?.killChainEnabled || attackerDoctrine?.nativeKillChainEnabled)
  ) {
    const chainUnit = current.units.get(preview.attackerId);
    if (chainUnit && chainUnit.hp > 0) {
      const attackRange = attackerPrototype.derivedStats.range ?? 1;
      const maxChains = attackerDoctrine.nativeKillChainEnabled ? 3 : 1;
      const currentChainCount = chainUnit.killChainCountThisTurn ?? 0;
      if (currentChainCount < maxChains) {
        // Find nearest enemy within attack range (excluding the already-killed defender)
        let nearestEnemy: Unit | null = null;
        let nearestDist = Infinity;
        for (const [uid, u] of current.units) {
          if (u.factionId === attacker.factionId || u.hp <= 0 || uid === preview.defenderId) continue;
          const dist = hexDistance(chainUnit.position, u.position);
          if (dist <= attackRange && dist < nearestDist) {
            nearestDist = dist;
            nearestEnemy = u;
          }
        }
        if (nearestEnemy) {
          const damageMultiplier = attackerDoctrine.nativeKillChainEnabled ? 1.0 : 0.6;
          const chainDamage = Math.max(1, Math.floor(preview.result.defenderDamage * damageMultiplier));
          const newHp = Math.max(0, nearestEnemy.hp - chainDamage);
          const chainUnits = new Map(current.units);
          chainUnits.set(nearestEnemy.id, { ...nearestEnemy, hp: newHp });
          // If the chain killed the target, remove from factions
          if (newHp <= 0) {
            chainUnits.delete(nearestEnemy.id);
            current = { ...current, units: chainUnits, factions: removeDeadUnitsFromFactions(current.factions, chainUnits) };
          } else {
            current = { ...current, units: chainUnits };
          }
          // Increment chain counter on attacker
          const updatedChainUnit = current.units.get(preview.attackerId);
          if (updatedChainUnit) {
            current = writeUnitToState(current, {
              ...updatedChainUnit,
              killChainCountThisTurn: (updatedChainUnit.killChainCountThisTurn ?? 0) + 1,
            });
          }
          baseResolution.killChainApplied = true;
        }
      }
    }
  }

  const retreatCaptureChance = atk.getStat('retreatCaptureChance');
  if (!defenderActuallyDestroyed && preview.result.defenderFled && nextAttacker.hp > 0 && (attackerDoctrine?.captureRetreatEnabled || retreatCaptureChance > 0)) {
    const retreatChance = (attackerDoctrine?.captureRetreatEnabled ? 0.15 : 0) + retreatCaptureChance;
    const retreatSlaveHp = attackerDoctrine?.slaveHpFraction ?? 0.25;
    const retreatSlaveOverrides = buildSlaveOverrides(attackerDoctrine);
    const retreatCapture = attemptNonCombatCapture(
      current,
      preview.attackerId,
      preview.defenderId,
      registry,
      retreatChance,
      retreatSlaveHp,
      0,
      current.rngState,
      retreatSlaveOverrides,
    );
    current = retreatCapture.state;
    retreatCaptured = retreatCapture.captured;
  }

  // Slaving T3 native — Captive Champion: every 5 captures spawn a promoted unit
  const anyCapture = capturedOnKill || pressGangCaptured || retreatCaptured;
  if (anyCapture && attackerDoctrine?.slaverTranscendenceEnabled && nextAttacker.hp > 0) {
    const captorFaction = current.factions.get(attacker.factionId);
    if (captorFaction && captorFaction.slaveCaptureCount > 0 && captorFaction.slaveCaptureCount % 5 === 0) {
      const championPrototype = current.prototypes.get(defender.prototypeId);
      if (championPrototype) {
        const spawnHex = getNeighbors(nextAttacker.position).find(hex => {
          const tile = current.map?.tiles.get(hexToKey(hex));
          if (!tile) return false;
          return !getUnitAtHex(current, hex);
        });
        if (spawnHex) {
          const stats = championPrototype.derivedStats;
          const championUnit: Unit = {
            id: createUnitId(),
            factionId: attacker.factionId,
            position: spawnHex,
            facing: nextAttacker.facing,
            hp: stats.hp,
            maxHp: stats.hp,
            movesRemaining: stats.moves,
            maxMoves: stats.moves,
            attacksRemaining: 1,
            xp: 0,
            veteranLevel: 'seasoned' as import('../../core/enums.js').VeteranLevel,
            status: 'ready' as import('../../core/enums.js').UnitStatus,
            prototypeId: defender.prototypeId,
            history: [{ type: 'captive_champion', timestamp: current.round, details: { round: current.round, fromCaptureOf: defender.id } }],
            morale: 75,
            routed: false,
            poisonStacks: 0,
            poisonTurnsRemaining: 0,
            isStealthed: false,
            turnsSinceStealthBreak: 0,
            learnedAbilities: [],
          };
          const champUnits = new Map(current.units);
          champUnits.set(championUnit.id, championUnit);
          const champFactions = new Map(current.factions);
          champFactions.set(attacker.factionId, {
            ...captorFaction,
            unitIds: [...captorFaction.unitIds, championUnit.id],
          });
          current = { ...current, units: champUnits, factions: champFactions };
          baseResolution.captiveChampionSpawned = true;
        }
      }
    }
  }

  // Slaving T2 — Slave market: +1 production to nearest city on capture
  if (anyCapture && attackerDoctrine?.captureRetreatEnabled && nextAttacker.hp > 0) {
    const nearestCity = getNearestFriendlyCity(current, attacker.factionId, defender.position);
    if (nearestCity) {
      const updatedCities = new Map(current.cities);
      updatedCities.set(nearestCity.id, {
        ...nearestCity,
        productionProgress: nearestCity.productionProgress + 1,
      });
      current = { ...current, cities: updatedCities };
    }
  }

  let totalKnockbackDistance = 0;
  let knockbackCollisionDamage = 0;
  const effectiveKnockback = preview.details.totalKnockbackDistance + atk.getStat('heavyMassStacks');
  const collisionDmg = atk.getStat('formationPinballCollisionDamage');
  if (effectiveKnockback > 0 && !defenderActuallyDestroyed && !retreatCaptured) {
    const knockbackResult = applyKnockbackDistance(current, preview.attackerId, preview.defenderId, effectiveKnockback, collisionDmg);
    current = knockbackResult.state;
    totalKnockbackDistance = knockbackResult.appliedDistance;
    knockbackCollisionDamage = knockbackResult.collisionDamageApplied;
  }

  // Juggernaut charge signature: knockback on kill
  const emergentKnockbackOnKill = atk.getStat('emergentKnockbackOnKill');
  if (emergentKnockbackOnKill > 0 && defenderActuallyDestroyed) {
    const knockbackResult = applyKnockbackDistance(current, preview.attackerId, preview.defenderId, emergentKnockbackOnKill);
    current = knockbackResult.state;
    totalKnockbackDistance += knockbackResult.appliedDistance;
  }

  // Charge T2 — Rout on big charge + Stampede
  let bigChargeRoutTriggered = false;
  let stampedeDamageApplied = 0;
  if (
    preview.details.isChargeAttack
    && !defenderActuallyDestroyed
    && !retreatCaptured
    && attackerDoctrine?.routOnBigChargeEnabled
    && preview.result.defenderDamage > defender.maxHp * 0.5
  ) {
    const routedDefender = current.units.get(preview.defenderId);
    if (routedDefender && routedDefender.hp > 0 && !routedDefender.slaveRoutImmune) {
      current = writeUnitToState(current, { ...routedDefender, routed: true });
      bigChargeRoutTriggered = true;

      // Native Stampede: routed target moves 2 hexes randomly, takes 2 dmg on collision
      if (attackerDoctrine.stampedeOnRoutEnabled) {
        let stampedeUnit = current.units.get(preview.defenderId);
        if (stampedeUnit) {
          const neighbors = getNeighbors(stampedeUnit.position);
          const shuffled = rngShuffle(current.rngState, neighbors);
          let moved = 0;
          for (const hex of shuffled) {
            if (moved >= 2) break;
            const occupant = getUnitAtHex(current, hex);
            if (occupant) {
              // Collision: deal 2 damage to the stampeding unit
              stampedeUnit = { ...stampedeUnit, hp: Math.max(0, stampedeUnit.hp - 2) };
              stampedeDamageApplied = 2;
              break;
            }
            const tile = current.map?.tiles.get(`${hex.q},${hex.r}`);
            if (!tile) continue;
            stampedeUnit = { ...stampedeUnit, position: hex };
            moved++;
          }
          current = writeUnitToState(current, stampedeUnit);
        }
      }
    }
  }

  if (defenderActuallyDestroyed && !capturedOnKill) {
    current = destroyTransportIfApplicable(current, preview.defenderId, registry);
  }
  if (attackerActuallyDestroyed) {
    current = destroyTransportIfApplicable(current, preview.attackerId, registry);
  }

  current = applyCombatSignals(current, attacker.factionId, preview.result.signals);
  current = applyCombatResearchBonus(current, attacker.factionId, defender.factionId, registry);
  current = applyCombatResearchBonus(current, defender.factionId, attacker.factionId, registry);
  current = applyContactTransfer(current, attacker.factionId, defender.factionId, 'contact');
  const absorbResult = maybeAbsorbFaction(current, attacker.factionId as FactionId, defender.factionId as FactionId, registry);
  current = absorbResult.state;
  if (absorbResult.absorbedDomains.length > 0) {
    feedback = { ...feedback, absorbedDomains: absorbResult.absorbedDomains };
  }
  current = unlockHybridRecipes(current, attacker.factionId, registry);

  if (defenderActuallyDestroyed && !capturedOnKill) {
    current = updateCombatRecordOnWin(current, attacker.factionId as FactionId, current.round);
    current = updateCombatRecordOnLoss(current, defender.factionId as FactionId, current.round);
  } else if (attackerActuallyDestroyed) {
    current = updateCombatRecordOnLoss(current, attacker.factionId as FactionId, current.round);
    current = updateCombatRecordOnWin(current, defender.factionId as FactionId, current.round);
  }

  const hitAndRunEligible =
    attackerDoctrine?.universalHitAndRunEnabled
    || (attackerDoctrine?.hitAndRunEnabled && defenderActuallyDestroyed);
  if (hitAndRunEligible) {
    const retreatingAttacker = current.units.get(preview.attackerId);
    if (retreatingAttacker && retreatingAttacker.hp > 0) {
      const retreatHex = findRetreatHex(retreatingAttacker, current, {
        ghostPassActive: atk.hasFlag('ghostPassActive'),
        preferWater: atk.hasFlag('beachRaidRetreatToWater'),
      });
      if (retreatHex) {
        const unitsAfterRetreat = new Map(current.units);
        unitsAfterRetreat.set(retreatingAttacker.id, {
          ...retreatingAttacker,
          position: retreatHex,
          status: 'ready',
          movesRemaining: Math.max(0, retreatingAttacker.movesRemaining - 1),
        });
        current = { ...current, units: unitsAfterRetreat };
        feedback = {
          ...feedback,
          hitAndRunRetreat: { unitId: retreatingAttacker.id, to: retreatHex },
        };
      }
    }
  }

  // Juggernaut hitrun signature: free reposition after kill
  if (atk.getStat('emergentFreeReposition') > 0 && defenderActuallyDestroyed && !hitAndRunEligible) {
    const repositionAttacker = current.units.get(preview.attackerId);
    if (repositionAttacker && repositionAttacker.hp > 0) {
      const retreatHex = findRetreatHex(repositionAttacker, current);
      if (retreatHex) {
        current = writeUnitToState(current, {
          ...repositionAttacker,
          position: retreatHex,
          status: 'ready',
        });
        feedback = {
          ...feedback,
          hitAndRunRetreat: { unitId: repositionAttacker.id, to: retreatHex },
        };
      }
    }
  }

  // Ghost army kill-chain redeploy: after a kill, attacker can reposition anywhere
  if (atk.getStat('emergentKillChainRedeployRange') > 0 && defenderActuallyDestroyed) {
    const redeployAttacker = current.units.get(preview.attackerId);
    if (redeployAttacker && redeployAttacker.hp > 0) {
      current = writeUnitToState(current, {
        ...redeployAttacker,
        movesRemaining: redeployAttacker.maxMoves,
        attacksRemaining: Math.max(redeployAttacker.attacksRemaining, 1),
        status: 'ready',
      });
    }
  }

  let updatedAttacker = current.units.get(preview.attackerId);
  let updatedDefender = current.units.get(preview.defenderId);

  if (updatedAttacker) {
    updatedAttacker = recordBattleFought(
      updatedAttacker,
      defender.id,
      defenderActuallyDestroyed,
      preview.result.attackerDamage,
      preview.result.defenderDamage,
      state.round,
    );
    if (defenderActuallyDestroyed) {
      updatedAttacker = recordEnemyKilled(updatedAttacker, defender.id, state.round);
    }
    if (updatedAttacker.veteranLevel !== attacker.veteranLevel) {
      updatedAttacker = recordPromotion(updatedAttacker, attacker.veteranLevel, updatedAttacker.veteranLevel, state.round);
    }
    current = writeUnitToState(current, updatedAttacker);
  }

  updatedAttacker = current.units.get(preview.attackerId);
  updatedDefender = current.units.get(preview.defenderId);

  const canInflictPoison = (attackerPrototype.tags?.includes('poison') ?? false)
    || (attackerDoctrine?.toxicBulwarkEnabled === true)
    || (attackerDoctrine?.venomousStrikesEnabled === true);
  let poisonApplied = false;
  if (!defenderActuallyDestroyed && preview.result.defenderDamage > 0 && canInflictPoison && updatedDefender) {
    updatedDefender = applyPoisonDoT(
      updatedDefender,
      attackerDoctrine?.poisonStacksOnHit ?? 1,
      attackerDoctrine?.poisonDamagePerStack ?? 1,
      3,
    );
    updatedDefender = { ...updatedDefender, poisonedBy: attacker.factionId, poisonSourcePrototypeId: attacker.prototypeId } as Unit;
    current = writeUnitToState(current, updatedDefender);
    poisonApplied = true;
  }

  // Phase 3A — Synergy poison stacks (separate from tag-based poison)
  const synergyPoisonStacks = atk.getStat('poisonStacks');
  if (synergyPoisonStacks > 0 && !defenderActuallyDestroyed && updatedDefender) {
    updatedDefender = current.units.get(preview.defenderId);
    if (updatedDefender && updatedDefender.hp > 0) {
      updatedDefender = applyPoisonDoT(updatedDefender, synergyPoisonStacks, 1, 3);
      updatedDefender = { ...updatedDefender, poisonedBy: attacker.factionId } as Unit;
      current = writeUnitToState(current, updatedDefender);
      poisonApplied = true;
    }
  }

  const emergentPoisonPerHit = atk.getStat('emergentPoisonPerHit');
  if (emergentPoisonPerHit > 0 && !defenderActuallyDestroyed) {
    updatedDefender = current.units.get(preview.defenderId);
    if (updatedDefender && updatedDefender.hp > 0) {
      updatedDefender = applyPoisonDoT(updatedDefender, emergentPoisonPerHit, 1, 3);
      updatedDefender = { ...updatedDefender, poisonedBy: attacker.factionId } as Unit;
      current = writeUnitToState(current, updatedDefender);
      poisonApplied = true;
    }
  }

  // Jungle Stalkers passive: extra poison stacks in native terrain (stacks with venom_t1)
  if (!defenderActuallyDestroyed) {
    const junglePoison = getPoisonOnAttack(attackerFaction, attackerTerrainId);
    if (junglePoison && junglePoison.stacks > 0) {
      updatedDefender = current.units.get(preview.defenderId);
      if (updatedDefender && updatedDefender.hp > 0) {
        updatedDefender = applyPoisonDoT(updatedDefender, junglePoison.stacks, 1, 3);
        updatedDefender = { ...updatedDefender, poisonedBy: attacker.factionId } as Unit;
        current = writeUnitToState(current, updatedDefender);
        poisonApplied = true;
      }
    }
  }

  let contaminatedHexApplied = false;
  if (defenderActuallyDestroyed && attackerDoctrine?.contaminateTerrainEnabled) {
    const contaminatedHexes = new Set(current.contaminatedHexes);
    contaminatedHexes.add(hexToKey(defender.position));
    current = { ...current, contaminatedHexes };
    contaminatedHexApplied = true;
  }

  // Spore-jump (venom_t2): when a poisoned enemy dies, jump poison stacks to nearby enemies.
  let sporeJumpTargets = 0;
  if (
    defenderActuallyDestroyed
    && attackerDoctrine?.sporeJumpEnabled
    && nextAttacker.hp > 0
    && defender.poisonStacks > 0
  ) {
    let sporeJumped = false;
    let sporeUnits = new Map(current.units);
    if (attackerDoctrine.sporeJumpAllEnemies) {
      const result = applyPoisonInRange(current.units, defender.position, 2, {
        factionFilter: 'enemies', filterFactionId: attacker.factionId,
        stacks: 1, damagePerStack: attackerDoctrine.poisonDamagePerStack, duration: 3,
        provenance: { factionId: attacker.factionId, prototypeId: attacker.prototypeId },
      });
      if (result.targetsHit > 0) {
        sporeUnits = result.units;
        sporeJumped = true;
        sporeJumpTargets = result.targetsHit;
      }
    } else {
      sporeUnits = new Map(current.units);
      const jumpPoison = (id: UnitId, u: Unit) => {
        const jumped = applyPoisonDoT(u, 1, attackerDoctrine.poisonDamagePerStack, 3);
        sporeUnits.set(id, { ...jumped, poisonedBy: attacker.factionId, poisonSourcePrototypeId: attacker.prototypeId });
      };
      let nearestId: UnitId | null = null;
      let nearestDist = Infinity;
      for (const [uid, u] of sporeUnits) {
        if (u.factionId === attacker.factionId || u.hp <= 0) continue;
        const dist = hexDistance(u.position, defender.position);
        if (dist <= 2 && dist < nearestDist) {
          nearestDist = dist;
          nearestId = uid;
          if (dist === 1) break;
        }
      }
      if (nearestId) {
        jumpPoison(nearestId, sporeUnits.get(nearestId)!);
        sporeJumped = true;
        sporeJumpTargets = 1;
      }
    }
    if (sporeJumped) {
      current = { ...current, units: sporeUnits };
      baseResolution.sporeJumpApplied = true;
    }
  }

  // Toxic Spread (venom+venom): when a poisoned enemy dies, spread poison to adjacent enemies
  const toxicSpreadTransferRadius = atk.getStat('toxicSpreadTransferRadius');
  if (
    defenderActuallyDestroyed
    && toxicSpreadTransferRadius > 0
    && defender.poisonStacks > 0
    && nextAttacker.hp > 0
  ) {
    const spreadRadius = toxicSpreadTransferRadius;
    const spreadStacks = atk.getStat('toxicSpreadTransferStacks');
    const spreadResult = applyPoisonInRange(current.units, defender.position, spreadRadius, {
      factionFilter: 'enemies', filterFactionId: attacker.factionId,
      stacks: spreadStacks, damagePerStack: attackerDoctrine?.poisonDamagePerStack ?? 1, duration: 3,
      provenance: { factionId: attacker.factionId, prototypeId: attacker.prototypeId },
    });
    if (spreadResult.targetsHit > 0) {
      current = { ...current, units: spreadResult.units };
    }
  }

  // Sapling: Nature Healing T3 native — cap +3 lifetime
  let saplingMaxHpBonus = 0;
  if (
    defenderActuallyDestroyed
    && attackerDoctrine?.saplingOnKillEnabled
    && nextAttacker.hp > 0
  ) {
    current = setTerrainAt(current, defender.position, 'forest');
    const saplingKillCount = getHistoryByType(nextAttacker, 'sapling_kill').length;
    if (saplingKillCount < 3) {
      updatedAttacker = addHistoryEntry(nextAttacker, 'sapling_kill', { hex: defender.position }, current.round);
      updatedAttacker = { ...updatedAttacker, maxHp: updatedAttacker.maxHp + 1, hp: updatedAttacker.hp + 1 };
      current = writeUnitToState(current, updatedAttacker);
      saplingMaxHpBonus = 1;
    }
    baseResolution.saplingApplied = true;
    baseResolution.saplingMaxHpBonus = saplingMaxHpBonus;
  }

  updatedAttacker = current.units.get(preview.attackerId);
  updatedDefender = current.units.get(preview.defenderId);

  if (updatedAttacker) {
    current = writeUnitToState(current, rotateUnitToward(updatedAttacker, defender.position));
  }
  updatedAttacker = current.units.get(preview.attackerId);
  if (updatedDefender && !defenderActuallyDestroyed) {
    current = writeUnitToState(
      current,
      rotateUnitToward(updatedDefender, updatedAttacker?.position ?? attacker.position),
    );
  }

  updatedAttacker = current.units.get(preview.attackerId);
  let reflectionDamageApplied = 0;
  if (defenderDoctrine?.damageReflectionEnabled && preview.result.defenderDamage > 0 && updatedAttacker) {
    const reflectionPct = defenderDoctrine.nativeDamageReflectionEnabled ? 0.5 : 0.25;
    reflectionDamageApplied = Math.max(1, Math.floor(preview.result.defenderDamage * reflectionPct));
    updatedAttacker = {
      ...updatedAttacker,
      hp: Math.max(0, updatedAttacker.hp - reflectionDamageApplied),
      ...(defenderDoctrine.nativeDamageReflectionEnabled ? { nextTurnMovePenalty: 1 } : {}),
    };
    current = writeUnitToState(current, updatedAttacker);
  }

  // Phase 3C — Synergy damage reflection (heavy_fortress, iron_turtle, juggernaut fortress sig)
  const totalReflection = def.getStat('damageReflection') + atk.getStat('emergentDamageReflection');
  if (totalReflection > 0 && preview.result.defenderDamage > 0 && updatedAttacker) {
    const synergyReflectedDmg = Math.max(1, Math.floor(preview.result.defenderDamage * totalReflection));
    updatedAttacker = { ...updatedAttacker, hp: Math.max(0, updatedAttacker.hp - synergyReflectedDmg) };
    current = writeUnitToState(current, updatedAttacker);
    reflectionDamageApplied += synergyReflectedDmg;
    baseResolution.synergyReflectionDamage = synergyReflectedDmg;
  }

  updatedAttacker = current.units.get(preview.attackerId);
  if (preview.details.stampedeTriggered && updatedAttacker) {
    current = writeUnitToState(current, {
      ...updatedAttacker,
      movesRemaining: updatedAttacker.movesRemaining + 1,
    });
  }

  // Phase 3A — Charge cooldown waived: grant an extra attack
  updatedAttacker = current.units.get(preview.attackerId);
  if (atk.hasFlag('chargeCooldownWaived') && updatedAttacker && updatedAttacker.hp > 0) {
    current = writeUnitToState(current, {
      ...updatedAttacker,
      attacksRemaining: Math.max(updatedAttacker.attacksRemaining, 1),
    });
  }

  updatedAttacker = current.units.get(preview.attackerId);
  let reStealthTriggered = false;
  if (
    updatedAttacker
    && (
      atk.additionalEffects.includes('stealth_recharge')
      || (attackerDoctrine?.stealthRechargeEnabled && isCoverTerrain(preview.details.attackerTerrainId))
    )
  ) {
    const hasAdjacentEnemy = getNeighbors(updatedAttacker.position).some((hex) => {
      const neighborUnitId = getUnitAtHex(current, hex);
      if (!neighborUnitId) {
        return false;
      }
      const neighbor = current.units.get(neighborUnitId);
      return Boolean(neighbor && neighbor.hp > 0 && neighbor.factionId !== updatedAttacker!.factionId);
    });
    if (!hasAdjacentEnemy) {
      updatedAttacker = enterStealth(
        {
          ...updatedAttacker,
          turnsSinceStealthBreak: 0,
        },
        attackerPrototype.tags ?? [],
      );
      current = writeUnitToState(current, updatedAttacker);
      reStealthTriggered = updatedAttacker.isStealthed ?? false;
    }
  }

  const hitAndRunTriggered = feedback.hitAndRunRetreat !== null;
  const poisonTrapPositionsRaw =
    atk.getStat('poisonTrapDamage') > 0
      ? [{ q: attacker.position.q, r: attacker.position.r }]
      : (atk.data.get('poisonTrapPositions') as { x: number; y: number }[] | undefined ?? [])
          .map(p => ({ q: p.x, r: p.y }));
  if (hitAndRunTriggered && poisonTrapPositionsRaw.length > 0) {
    const poisonTraps = new Map(current.poisonTraps);
    for (const position of poisonTrapPositionsRaw) {
      poisonTraps.set(hexToKey(position), {
        damage: atk.getStat('poisonTrapDamage'),
        slow: atk.getStat('poisonTrapSlow'),
        ownerFactionId: attacker.factionId,
      });
    }
    current = { ...current, poisonTraps };

    // Poison Shadow: create a poison_cloud zone effect that prevents healing
    if (atk.hasFlag('emergentPoisonCloudPreventsHealing')) {
      const cloudCenter = poisonTrapPositionsRaw[0] ?? attacker.position;
      current = addZoneEffect(current, {
        id: createZoneEffectId(),
        type: 'poison_cloud',
        center: { q: cloudCenter.q, r: cloudCenter.r },
        radius: 2,
        ownerFactionId: attacker.factionId,
        damagePerTurn: EMERGENT_PARAMS.poison_shadow.poisonCloudDamage,
        movementPenalty: 0,
        turnsRemaining: 3,
        createdRound: current.round,
        preventsHealing: true,
      });
    }
  }
  updatedAttacker = current.units.get(preview.attackerId);
  let healOnRetreatApplied = 0;
  const healOnRetreatAmount = atk.getStat('healOnRetreatAmount');
  if (hitAndRunTriggered && healOnRetreatAmount > 0 && updatedAttacker) {
    healOnRetreatApplied = healOnRetreatAmount;
    current = writeUnitToState(current, {
      ...updatedAttacker,
      hp: Math.min(updatedAttacker.maxHp, updatedAttacker.hp + healOnRetreatApplied),
    });
  }

  updatedAttacker = current.units.get(preview.attackerId);
  let combatHealingApplied = 0;
  const combatHealingEffect = atk.additionalEffects.find((effectCode) => effectCode.includes('combat_healing'));
  if (combatHealingEffect && updatedAttacker) {
    const healMatch = combatHealingEffect.match(/combat_healing_(\d+)%/);
    if (healMatch) {
      const healPercent = parseInt(healMatch[1], 10) / 100;
      const healAmount = Math.floor(preview.result.defenderDamage * healPercent);
      if (healAmount > 0) {
        combatHealingApplied = healAmount;
        current = writeUnitToState(current, {
          ...updatedAttacker,
          hp: Math.min(updatedAttacker.maxHp, updatedAttacker.hp + healAmount),
        });
      }
    }
  }

  // Phase 3C — Heavy regen: heal attacker for % of damage dealt
  updatedAttacker = current.units.get(preview.attackerId);
  const heavyRegenPercent = atk.getStat('heavyRegenPercent');
  if (heavyRegenPercent > 0 && updatedAttacker && preview.result.defenderDamage > 0) {
    const regenAmount = Math.floor(preview.result.defenderDamage * heavyRegenPercent);
    if (regenAmount > 0) {
      current = writeUnitToState(current, {
        ...updatedAttacker,
        hp: Math.min(updatedAttacker.maxHp, updatedAttacker.hp + regenAmount),
      });
      baseResolution.heavyRegenApplied = regenAmount;
    }
  }

  // Phase 3C — Slave healing: flat heal from slave synergy
  updatedAttacker = current.units.get(preview.attackerId);
  const slaveHealAmount = atk.getStat('slaveHealAmount');
  if (slaveHealAmount > 0 && updatedAttacker && updatedAttacker.hp > 0) {
    current = writeUnitToState(current, {
      ...updatedAttacker,
      hp: Math.min(updatedAttacker.maxHp, updatedAttacker.hp + slaveHealAmount),
    });
    baseResolution.slaveHealApplied = slaveHealAmount;
  }

  updatedDefender = current.units.get(preview.defenderId);
  let sandstormTargetsHit = 0;
  const sandstormDamage = atk.getStat('sandstormDamage');
  if (sandstormDamage > 0 && updatedDefender && !defenderActuallyDestroyed && !retreatCaptured) {
    const sandstormUnits = new Map(current.units);
    for (const adjHex of getNeighbors(updatedDefender.position)) {
      const adjUnitId = getUnitAtHex(current, adjHex);
      if (!adjUnitId) {
        continue;
      }
      const adjUnit = sandstormUnits.get(adjUnitId);
      if (adjUnit && adjUnit.factionId !== attacker.factionId && adjUnit.hp > 0) {
        sandstormUnits.set(adjUnitId, {
          ...adjUnit,
          hp: Math.max(0, adjUnit.hp - sandstormDamage),
        });
        sandstormTargetsHit += 1;
      }
    }
    current = { ...current, units: sandstormUnits };
  }

  // Phase 3C — Synergy AoE damage (multiplier_stack, etc.)
  updatedDefender = current.units.get(preview.defenderId);
  const aoeDamage = atk.getStat('aoeDamage');
  if (aoeDamage > 0 && updatedDefender && !defenderActuallyDestroyed && !retreatCaptured) {
    const aoeUnits = new Map(current.units);
    let aoeHit = 0;
    for (const adjHex of getNeighbors(updatedDefender.position)) {
      const adjUnitId = getUnitAtHex(current, adjHex);
      if (!adjUnitId) continue;
      const adjUnit = aoeUnits.get(adjUnitId);
      if (adjUnit && adjUnit.factionId !== attacker.factionId && adjUnit.hp > 0) {
        aoeUnits.set(adjUnitId, { ...adjUnit, hp: Math.max(0, adjUnit.hp - aoeDamage) });
        aoeHit++;
      }
    }
    if (aoeHit > 0) {
      current = { ...current, units: aoeUnits };
      baseResolution.aoeTargetsHit = aoeHit;
    }
  }

  updatedDefender = current.units.get(preview.defenderId);
  if (atk.hasFlag('contaminateActive') && updatedDefender && !defenderActuallyDestroyed && !retreatCaptured) {
    const contaminatedHexes = new Set(current.contaminatedHexes);
    contaminatedHexes.add(hexToKey(updatedDefender.position));
    current = { ...current, contaminatedHexes };
    contaminatedHexApplied = true;
  }

  updatedDefender = current.units.get(preview.defenderId);
  let frostbiteApplied = false;
  const frostbiteColdDoT = atk.getStat('frostbiteColdDoT');
  const frostbiteSlow = atk.getStat('frostbiteSlow');
  if (frostbiteColdDoT > 0 && updatedDefender && !defenderActuallyDestroyed && !retreatCaptured) {
    frostbiteApplied = true;
    current = writeUnitToState(current, {
      ...updatedDefender,
      frozen: true,
      frostbiteStacks: frostbiteColdDoT,
      frostbiteDoTDuration: 3,
      movesRemaining: Math.max(0, updatedDefender.movesRemaining - frostbiteSlow),
    });
  }

  // Phase 3A — Stun: reduce defender moves for N turns
  updatedDefender = current.units.get(preview.defenderId);
  const stunDuration = atk.getStat('stunDuration');
  if (stunDuration > 0 && updatedDefender && !defenderActuallyDestroyed && updatedDefender.hp > 0) {
    current = writeUnitToState(current, {
      ...updatedDefender,
      stunDuration,
      movesRemaining: 0,
    });
    baseResolution.stunApplied = stunDuration;
  }

  // Phase 3A — Formation Crush: apply crush stacks to defender
  const formationCrushStacks = atk.getStat('formationCrushStacks');
  if (formationCrushStacks > 0 && updatedDefender && !defenderActuallyDestroyed && updatedDefender.hp > 0) {
    current = writeUnitToState(current, {
      ...updatedDefender,
      formationCrushStacks: (updatedDefender.formationCrushStacks ?? 0) + formationCrushStacks,
    });
    baseResolution.formationCrushApplied = formationCrushStacks;
  }

  // Phase 3C — Sandstorm aura: accuracy debuff on adjacent enemies
  updatedDefender = current.units.get(preview.defenderId);
  const sandstormAuraRadius = atk.getStat('sandstormAuraRadius');
  const sandstormAuraDebuff = atk.getStat('sandstormAuraDebuff');
  if (sandstormAuraRadius > 0 && updatedDefender && !defenderActuallyDestroyed && updatedDefender.hp > 0) {
    const auraUnits = new Map(current.units);
    for (const adjHex of getNeighbors(updatedDefender.position)) {
      const adjUnitId = getUnitAtHex(current, adjHex);
      if (!adjUnitId) continue;
      const adjUnit = auraUnits.get(adjUnitId);
      if (adjUnit && adjUnit.factionId !== attacker.factionId && adjUnit.hp > 0) {
        auraUnits.set(adjUnitId, {
          ...adjUnit,
          accuracyDebuff: (adjUnit.accuracyDebuff ?? 0) + sandstormAuraDebuff,
        });
      }
    }
    current = { ...current, units: auraUnits };
  }

  // Phase 3A — Lethal Ambush poison: splash poison to adjacent enemies on instant kill
  const lethalAmbushPoison = atk.getStat('lethalAmbushPoison');
  if (baseResolution.instantKillTriggered && lethalAmbushPoison > 0) {
    const result = applyPoisonInRange(current.units, defender.position, 1, {
      factionFilter: 'enemies', filterFactionId: attacker.factionId,
      stacks: lethalAmbushPoison, damagePerStack: 1, duration: 3,
      provenance: { factionId: attacker.factionId },
    });
    if (result.targetsHit > 0) {
      current = { ...current, units: result.units };
    }
  }

  // Phase 3C — Withering reduction: apply debuff to defender's healing
  const witheringReduction = atk.getStat('witheringReduction');
  if (witheringReduction > 0 && updatedDefender && !defenderActuallyDestroyed && updatedDefender.hp > 0) {
    current = writeUnitToState(current, {
      ...updatedDefender,
      witherReduction: witheringReduction,
    });
  }

  // Phase 3C — Slave Army: buff nearby allied units with damage bonus / defense penalty
  updatedAttacker = current.units.get(preview.attackerId);
  const slaveArmyDamageBonus = atk.getStat('slaveArmyDamageBonus');
  const slaveArmyDefensePenalty = atk.getStat('slaveArmyDefensePenalty');
  if (updatedAttacker && (slaveArmyDamageBonus > 0 || slaveArmyDefensePenalty > 0)) {
    const armyUnits = new Map(current.units);
    for (const adjHex of getNeighbors(updatedAttacker.position)) {
      const adjUnitId = getUnitAtHex(current, adjHex);
      if (!adjUnitId) continue;
      const adjUnit = armyUnits.get(adjUnitId);
      if (adjUnit && adjUnit.factionId === attacker.factionId && adjUnit.hp > 0) {
        armyUnits.set(adjUnitId, {
          ...adjUnit,
          slaveArmyDamageBonus: (adjUnit.slaveArmyDamageBonus ?? 0) + slaveArmyDamageBonus,
          slaveArmyDefensePenalty: (adjUnit.slaveArmyDefensePenalty ?? 0) + slaveArmyDefensePenalty,
        });
      }
    }
    current = { ...current, units: armyUnits };
  }

  // Synergy heal primitives (flat + % max HP)
  updatedAttacker = current.units.get(preview.attackerId);
  const synergyFlatHeal = atk.getStat('synergyFlatHeal');
  const synergyPercentHealMaxHp = atk.getStat('synergyPercentHealMaxHp');
  if (updatedAttacker && updatedAttacker.hp > 0) {
    let healed = false;
    if (synergyFlatHeal > 0) {
      updatedAttacker = { ...updatedAttacker, hp: Math.min(updatedAttacker.maxHp, updatedAttacker.hp + synergyFlatHeal) };
      combatHealingApplied += synergyFlatHeal;
      healed = true;
    }
    if (synergyPercentHealMaxHp > 0) {
      const pctHeal = Math.floor(updatedAttacker.maxHp * synergyPercentHealMaxHp);
      if (pctHeal > 0) {
        updatedAttacker = { ...updatedAttacker, hp: Math.min(updatedAttacker.maxHp, updatedAttacker.hp + pctHeal) };
        combatHealingApplied += pctHeal;
        healed = true;
      }
    }
    if (healed) current = writeUnitToState(current, updatedAttacker);
  }

  // Vampiric Strike (hitrun+nature_healing): heal attacker for % of damage dealt
  updatedAttacker = current.units.get(preview.attackerId);
  const vampiricStrikeHealPercent = atk.getStat('vampiricStrikeHealPercent');
  if (vampiricStrikeHealPercent > 0 && updatedAttacker && preview.result.defenderDamage > 0) {
    const vampHeal = Math.floor(preview.result.defenderDamage * vampiricStrikeHealPercent);
    if (vampHeal > 0) {
      current = writeUnitToState(current, {
        ...updatedAttacker,
        hp: Math.min(updatedAttacker.maxHp, updatedAttacker.hp + vampHeal),
      });
      combatHealingApplied += vampHeal;
    }
  }

  // Bombardment (fortress+tidal_warfare): naval attacker deals bonus damage to land defender
  let bombardmentDamageApplied = 0;
  updatedDefender = current.units.get(preview.defenderId);
  const bombardmentDamageMultiplier = atk.getStat('bombardmentDamageMultiplier');
  if (bombardmentDamageMultiplier > 0 && updatedDefender && !defenderActuallyDestroyed
    && isWaterTerrain(preview.details.attackerTerrainId) && !isWaterTerrain(preview.details.defenderTerrainId)) {
    bombardmentDamageApplied = Math.max(1, Math.floor(preview.result.defenderDamage * bombardmentDamageMultiplier));
    current = writeUnitToState(current, { ...updatedDefender, hp: Math.max(0, updatedDefender.hp - bombardmentDamageApplied) });
  }

  // Fighting Retreat (hitrun+heavy_hitter): free strike during hit-and-run
  let fightingRetreatDamage = 0;
  updatedDefender = current.units.get(preview.defenderId);
  if (hitAndRunTriggered && atk.hasFlag('fightingRetreatFreeStrike') && updatedDefender && updatedDefender.hp > 0) {
    fightingRetreatDamage = Math.max(1, Math.floor(preview.result.defenderDamage * (atk.getStat('fightingRetreatDamageMultiplier') || 1)));
    current = writeUnitToState(current, { ...updatedDefender, hp: Math.max(0, updatedDefender.hp - fightingRetreatDamage) });
  }

  updatedAttacker = current.units.get(preview.attackerId);
  if (atk.hasFlag('reEnterStealthAfterCombat') && updatedAttacker && updatedAttacker.hp > 0 && !updatedAttacker.isStealthed) {
    updatedAttacker = enterStealth({ ...updatedAttacker, turnsSinceStealthBreak: 0 }, attackerPrototype.tags ?? []);
    current = writeUnitToState(current, updatedAttacker);
    reStealthTriggered = true;
  }

  // Phase 3B — Capture aftermath: apply poison and modifiers to captured units
  if (capturedOnKill) {
    const capturedUnit = current.units.get(preview.defenderId);
    if (capturedUnit && capturedUnit.hp > 0) {
      let updated = { ...capturedUnit };
      const capturePoisonDamage = atk.getStat('capturePoisonDamage');
      const capturePoisonStacks = atk.getStat('capturePoisonStacks');
      const slaveDamageBonus = atk.getStat('slaveDamageBonus');
      const slaveHealPenalty = atk.getStat('slaveHealPenalty');
      if (capturePoisonDamage > 0) {
        updated = applyPoisonDoT(updated, capturePoisonStacks > 0 ? capturePoisonStacks : 1, capturePoisonDamage, 3);
        updated = { ...updated, poisonedBy: attacker.factionId } as Unit;
      }
      if (slaveDamageBonus > 0) {
        updated = { ...updated, slaveDamageBonus };
      }
      if (slaveHealPenalty > 0) {
        updated = { ...updated, slaveHealPenalty };
      }
      if (atk.hasFlag('captureEscapePrevented')) {
        updated = { ...updated, captureEscapePrevented: true };
        baseResolution.captureEscapePrevented = true;
      }
      current = writeUnitToState(current, updated);
    }
  }

  updatedDefender = current.units.get(preview.defenderId);
  const triggeredEffects = [...preview.triggeredEffects];
  if (poisonApplied && updatedDefender) {
    pushCombatEffect(triggeredEffects, 'Poisoned', `Defender was poisoned for ${updatedDefender.poisonStacks} stack damage over time.`, 'aftermath');
  }
  if (baseResolution.bleedApplied) {
    pushCombatEffect(triggeredEffects, 'Predator Bleed', 'Stealth attack inflicted bleed (1 dmg/turn for 3 turns).', 'ability');
  }
  if (reflectionDamageApplied > 0) {
    pushCombatEffect(triggeredEffects, 'Reflection', `Defender reflected ${reflectionDamageApplied} damage back to the attacker.`, 'aftermath');
  }
  if (totalKnockbackDistance > 0 && !defenderActuallyDestroyed) {
    pushCombatEffect(triggeredEffects, 'Knockback', `Defender was displaced ${totalKnockbackDistance} hex${totalKnockbackDistance === 1 ? '' : 'es'}.`, 'aftermath');
  }
  if (knockbackCollisionDamage > 0) {
    pushCombatEffect(triggeredEffects, 'Pinball Collision', `Knockback collision dealt ${knockbackCollisionDamage} damage.`, 'synergy');
  }
  if (bigChargeRoutTriggered) {
    pushCombatEffect(triggeredEffects, 'Big Charge Rout', 'Heavy charge routed the defender.', 'ability');
    if (stampedeDamageApplied > 0) {
      pushCombatEffect(triggeredEffects, 'Stampede', `Routed defender stampeded into an obstacle, taking ${stampedeDamageApplied} damage.`, 'ability');
    }
  }
  if (reStealthTriggered) {
    pushCombatEffect(triggeredEffects, 'Stealth Recharge', 'Attacker slipped back into stealth after the exchange.', 'aftermath');
  }
  if (combatHealingApplied > 0) {
    pushCombatEffect(triggeredEffects, 'Combat Healing', `Attacker recovered ${combatHealingApplied} HP from dealt damage.`, 'aftermath');
  }
  if (bombardmentDamageApplied > 0) {
    pushCombatEffect(triggeredEffects, 'Naval Bombardment', `Ships bombarded for +${bombardmentDamageApplied} bonus damage.`, 'synergy');
  }
  if (fightingRetreatDamage > 0) {
    pushCombatEffect(triggeredEffects, 'Fighting Retreat', `Disengaging strike dealt ${fightingRetreatDamage} damage.`, 'synergy');
  }
  if (sandstormTargetsHit > 0) {
    pushCombatEffect(triggeredEffects, 'Sandstorm Splash', `Area damage hit ${sandstormTargetsHit} nearby unit${sandstormTargetsHit === 1 ? '' : 's'}.`, 'aftermath');
  }
  if (contaminatedHexApplied) {
    pushCombatEffect(triggeredEffects, 'Contamination', 'The defender hex became contaminated after the strike.', 'aftermath');
  }
  if (frostbiteApplied) {
    pushCombatEffect(triggeredEffects, 'Frostbite', `Defender took ${frostbiteColdDoT} cold DoT and ${frostbiteSlow} slow.`, 'aftermath');
  }
  if (hitAndRunTriggered && poisonTrapPositionsRaw.length > 0) {
    pushCombatEffect(triggeredEffects, 'Poison Trap', 'Attacker left a poison trap on the retreat path.', 'aftermath');
  }
  if (hitAndRunTriggered) {
    pushCombatEffect(triggeredEffects, 'Hit And Run', 'Attacker disengaged after combat to avoid being pinned.', 'aftermath');
  }
  if (healOnRetreatApplied > 0) {
    pushCombatEffect(triggeredEffects, 'Retreat Heal', `Attacker recovered ${healOnRetreatApplied} HP while withdrawing.`, 'aftermath');
  }
  if (pursuitDamageApplied > 0) {
    pushCombatEffect(triggeredEffects, 'Pursuit', `Skirmisher pressed the advantage for +${pursuitDamageApplied} bonus damage.`, 'aftermath');
  }
  if (pressGangCaptured) {
    pushCombatEffect(triggeredEffects, 'Press Gang', 'Killer crew pressed the fallen enemy into service.', 'aftermath');
  }
  if (greedyLootGained > 0) {
    pushCombatEffect(triggeredEffects, 'Greedy Loot', `Pirate Lords salvaged ${greedyLootGained} gold and supplies from the kill.`, 'aftermath');
  }
  if (poisonDetonated) {
    pushCombatEffect(triggeredEffects, 'Poison Detonation', 'Venom erupted on kill, poisoning adjacent enemies.', 'aftermath');
  }
  if (chargeSplashTargetsHit > 0) {
    pushCombatEffect(triggeredEffects, 'Charge Splash', `Charge impact dealt ${chargeSplashDamage} splash damage to ${chargeSplashTargetsHit} adjacent unit${chargeSplashTargetsHit === 1 ? '' : 's'}.`, 'aftermath');
  }
  if (pursuitMovementRestored > 0) {
    pushCombatEffect(triggeredEffects, 'Pursuit Movement', `Foraging riders pushed forward for +${pursuitMovementRestored} movement after the kill.`, 'aftermath');
  }
  if (baseResolution.killChainApplied) {
    pushCombatEffect(triggeredEffects, 'Killing Chain', 'Skirmisher chained a follow-up attack after the kill.', 'ability');
  }
  if (baseResolution.sporeJumpApplied) {
    pushCombatEffect(triggeredEffects, 'Spore Jump', `Venom jumped to ${sporeJumpTargets} nearby unit${sporeJumpTargets === 1 ? '' : 's'} after the poisoned kill.`, 'ability');
  }
  if (baseResolution.myceliumNetworkApplied) {
    pushCombatEffect(triggeredEffects, 'Mycelium Network', `Toxic bloom propagated ${myceliumTargets} friendly unit${myceliumTargets === 1 ? '' : 's'} with poison.`, 'ability');
  }
  if (emergentSustainHealApplied > 0) {
    pushCombatEffect(triggeredEffects, 'Paladin Sustain', `Attacker recovered ${emergentSustainHealApplied} HP from damage dealt.`, 'aftermath');
  }
  if (baseResolution.emergentSustainMinHpSaved) {
    pushCombatEffect(triggeredEffects, 'Undying Will', `Attacker survived a lethal blow at ${minHpFloor} HP.`, 'aftermath');
  }
  if (baseResolution.emergentSmiteApplied > 0) {
    pushCombatEffect(triggeredEffects, 'Radiant Smite', `Paladin at full HP dealt +${baseResolution.emergentSmiteApplied} smite damage.`, 'synergy');
  }
  if (baseResolution.emergentUndyingSaved) {
    pushCombatEffect(triggeredEffects, 'Juggernaut Undying', 'Juggernaut survived a lethal blow at 1 HP.', 'synergy');
  }
  if (baseResolution.lastStandSaved) {
    pushCombatEffect(triggeredEffects, 'Last Stand', 'Arctic Warden survived a lethal blow at 1 HP.', 'ability');
  }
  if (woundedEarthAbsorbed > 0) {
    if (woundedEarthAlliesHealed > 0) {
      pushCombatEffect(triggeredEffects, 'Wounded Earth', `Terrain channeled ${woundedEarthAbsorbed} absorbed damage into healing ${woundedEarthAlliesHealed} adjacent friendly unit${woundedEarthAlliesHealed === 1 ? '' : 's'} on forest/jungle.`, 'ability');
    } else {
      pushCombatEffect(triggeredEffects, 'Wounded Earth', `Terrain absorbed ${woundedEarthAbsorbed} damage, reducing HP loss.`, 'ability');
    }
  }
  const emergentManyFacedStance = (atk.data.get('emergentManyFacedStance') as string | undefined) ?? '';
  if (emergentManyFacedStance) {
    const stanceLabel = emergentManyFacedStance.charAt(0).toUpperCase() + emergentManyFacedStance.slice(1);
    pushCombatEffect(triggeredEffects, `Many-Faced: ${stanceLabel}`, `Adapted stance based on combat context.`, 'synergy');
    baseResolution.emergentManyFacedStance = emergentManyFacedStance;
    // Store stance on faction for non-combat consumption (phantom movement bonus)
    const factionsMF = new Map(current.factions);
    const mf = factionsMF.get(attacker.factionId);
    if (mf) {
      factionsMF.set(attacker.factionId, {
        ...mf,
        manyFacedLastStance: emergentManyFacedStance,
      });
      current = { ...current, factions: factionsMF };
    }
  }
  if (baseResolution.instantKillTriggered) {
    pushCombatEffect(triggeredEffects, 'Lethal Ambush', 'Synergy enabled an instant kill bypassing all defenses.', 'synergy');
  }
  if (baseResolution.stunApplied > 0) {
    pushCombatEffect(triggeredEffects, 'Stun', `Synergy stunned the defender for ${baseResolution.stunApplied} turn(s).`, 'synergy');
  }
  if (baseResolution.formationCrushApplied > 0) {
    pushCombatEffect(triggeredEffects, 'Formation Crush', `Synergy applied ${baseResolution.formationCrushApplied} crush stack(s).`, 'synergy');
  }
  if (baseResolution.synergyReflectionDamage > 0) {
    pushCombatEffect(triggeredEffects, 'Synergy Reflection', `Synergy reflected ${baseResolution.synergyReflectionDamage} damage.`, 'synergy');
  }
  if (baseResolution.aoeTargetsHit > 0) {
    pushCombatEffect(triggeredEffects, 'Synergy AoE', `Area damage hit ${baseResolution.aoeTargetsHit} unit(s).`, 'synergy');
  }
  if (baseResolution.heavyRegenApplied > 0) {
    pushCombatEffect(triggeredEffects, 'Heavy Regeneration', `Synergy regenerated ${baseResolution.heavyRegenApplied} HP.`, 'synergy');
  }
  if (baseResolution.slaveHealApplied > 0) {
    pushCombatEffect(triggeredEffects, 'Slave Healing', `Synergy healed ${baseResolution.slaveHealApplied} HP.`, 'synergy');
  }

  if (baseResolution.saplingApplied) {
    const detail = baseResolution.saplingMaxHpBonus > 0
      ? `Defender hex transformed into forest. Druid gained +${baseResolution.saplingMaxHpBonus} max HP.`
      : 'Defender hex transformed into forest.';
    pushCombatEffect(triggeredEffects, 'Sapling', detail, 'aftermath');
  }

  feedback = {
    ...feedback,
    resolution: {
      triggeredEffects,
      capturedOnKill,
      retreatCaptured,
      pressGangCaptured: baseResolution.pressGangCaptured,
      captiveChampionSpawned: baseResolution.captiveChampionSpawned,
      poisonDetonated: baseResolution.poisonDetonated,
      greedyLootGained: baseResolution.greedyLootGained,
      pursuitMovementRestored: baseResolution.pursuitMovementRestored,
      poisonApplied,
      reStealthTriggered,
      reflectionDamageApplied,
      combatHealingApplied,
      sandstormTargetsHit,
      contaminatedHexApplied,
      frostbiteApplied,
      hitAndRunTriggered,
      healOnRetreatApplied,
      totalKnockbackDistance,
      pursuitDamageApplied,
      emergentSustainHealApplied: baseResolution.emergentSustainHealApplied,
      emergentSustainMinHpSaved: baseResolution.emergentSustainMinHpSaved,
      emergentSmiteApplied: baseResolution.emergentSmiteApplied,
      emergentUndyingSaved: baseResolution.emergentUndyingSaved,
      lastStandSaved: baseResolution.lastStandSaved,
      bleedApplied: baseResolution.bleedApplied,
      killChainApplied: baseResolution.killChainApplied,
      sporeJumpApplied: baseResolution.sporeJumpApplied,
      myceliumNetworkApplied: baseResolution.myceliumNetworkApplied,
      emergentManyFacedStance: baseResolution.emergentManyFacedStance,
      instantKillTriggered: baseResolution.instantKillTriggered,
      stunApplied: baseResolution.stunApplied,
      formationCrushApplied: baseResolution.formationCrushApplied,
      synergyReflectionDamage: baseResolution.synergyReflectionDamage,
      aoeTargetsHit: baseResolution.aoeTargetsHit,
      heavyRegenApplied: baseResolution.heavyRegenApplied,
      slaveHealApplied: baseResolution.slaveHealApplied,
      captureEscapePrevented: baseResolution.captureEscapePrevented,
      synergyCaptureBonus: baseResolution.synergyCaptureBonus,
      chargeSplashTargetsHit: baseResolution.chargeSplashTargetsHit,
      woundedEarthAbsorbed,
      woundedEarthAlliesHealed,
      woundedEarthSaved: baseResolution.woundedEarthSaved,
      saplingApplied: baseResolution.saplingApplied,
      saplingMaxHpBonus: baseResolution.saplingMaxHpBonus,
    },
  };

  return { state: pruneDeadUnits(current), feedback };
}
