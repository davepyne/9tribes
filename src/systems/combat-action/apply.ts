import { getEffectiveXpCost } from '../knowledgeSystem.js';
import { isWaterTerrain } from '../terrainUtils.js';
import { getZoneEffectsAtHex } from '../zoneEffectSystem.js';
import { getNeighbors, hexDistance, hexToKey } from '../../core/grid.js';
import { createUnitId } from '../../core/ids.js';
import type { RulesRegistry } from '../../data/registry/types.js';
import type { Unit } from '../../features/units/types.js';
import type { GameState } from '../../game/types.js';
import type { FactionId, UnitId } from '../../types.js';
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
import { isCoverTerrain } from '../terrainUtils.js';

import {
  recordBattleFought,
  recordEnemyKilled,
  recordPromotion,
  updateCombatRecordOnLoss,
  updateCombatRecordOnWin,
} from '../historySystem.js';

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

  const rawAttackerHp = attacker.hp - preview.result.attackerDamage;
  const minHpFloor = preview.details.emergentSustainMinHp;
  let attackerHp = Math.max(0, rawAttackerHp);
  if (minHpFloor > 0 && rawAttackerHp <= 0 && attacker.hp > 0) {
    attackerHp = Math.min(minHpFloor, attacker.hp);
    baseResolution.emergentSustainMinHpSaved = true;
  }

  // Juggernaut undying: survive at 1 HP once per combat
  if (preview.details.emergentUndying && rawAttackerHp <= 0 && attacker.hp > 0 && attackerHp <= 0) {
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
  };

  // Phase 3C — Heavy naval ram: extra damage from naval ram synergy
  if (preview.details.heavyNavalRamDamage > 0 && isNavalAttacker && nextDefender.hp > 0) {
    nextDefender = { ...nextDefender, hp: Math.max(0, nextDefender.hp - preview.details.heavyNavalRamDamage) };
  }

  // Phase 3C — Slave coercion: extra damage when attacking with slaves
  if (preview.details.slaveCoercionDamageBonus > 0 && nextDefender.hp > 0) {
    const coercionDmg = Math.max(1, Math.floor(preview.result.defenderDamage * preview.details.slaveCoercionDamageBonus));
    nextDefender = { ...nextDefender, hp: Math.max(0, nextDefender.hp - coercionDmg) };
  }

  // Phase 3A — Lethal Ambush: instant kill bypasses normal damage
  if (preview.details.instantKill && nextDefender.hp > 0) {
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
  const defenderActuallyDestroyed = preview.result.defenderDestroyed && !baseResolution.lastStandSaved;

  if (preview.attackerWasStealthed && attacker.isStealthed && nextAttacker.hp > 0) {
    const isDesertStealth = attackerDoctrine?.permanentStealthEnabled === true
      && (preview.details.attackerTerrainId === 'desert' || preview.details.attackerTerrainId === 'tundra');
    const isEmergentTerrainStealth = preview.details.emergentPermanentStealthTerrains.length > 0
      && preview.details.emergentPermanentStealthTerrains.includes(preview.details.attackerTerrainId);
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

  // E5 — Paladin sustain: heal for % of damage dealt
  let emergentSustainHealApplied = 0;
  if (preview.details.emergentSustainHealPercent > 0 && nextAttacker.hp > 0 && preview.result.defenderDamage > 0) {
    const sustainHeal = Math.floor(preview.result.defenderDamage * preview.details.emergentSustainHealPercent);
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
  if (preview.details.emergentSmiteBonus > 0 && attacker.hp >= attacker.maxHp && nextDefender.hp > 0) {
    const smiteDamage = Math.floor(preview.result.defenderDamage * preview.details.emergentSmiteBonus);
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
  // E3/E4 — emergent capture bonus from Slave Empire (+0.20) and Desert Raider (+0.30 in desert)
  const emergentCaptureBonus = preview.details.emergentCaptureBonus
    + (preview.details.defenderTerrainId === 'desert' ? preview.details.emergentDesertCaptureBonus : 0);
  // Phase 3B — synergy capture bonuses
  let synergyCaptureBonus = 0;
  if (preview.details.isChargeAttack) synergyCaptureBonus += preview.details.chargeCaptureChance;
  if (isWaterTerrain(attackerTerrainId)) synergyCaptureBonus += preview.details.navalCaptureBonus;
  if (preview.attackerWasStealthed) synergyCaptureBonus += preview.details.stealthCaptureBonus;
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
    && (hasCaptureAbility(attackerPrototype, registry) || isGreedyCoastal || autoCaptureAbility || maelstromAutoCapture || navalSupportCapture)
  ) {
    const captureResult = attemptCapture(
      current,
      nextAttacker,
      defender,
      registry,
      autoCaptureAbility
        ?? maelstromAutoCapture
        ?? navalSupportCapture
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
      const propagationUnits = new Map(current.units);
      let propagated = false;
      for (const [uid, u] of propagationUnits) {
        if (u.factionId !== attacker.factionId) continue;
        if (u.hp <= 0) continue;
        if (hexDistance(u.position, ownedBloom.center) > 3) continue;
        propagationUnits.set(uid, applyPoisonDoT(u, 2, attackerDoctrine.poisonDamagePerStack, 3));
        propagated = true;
      }
      if (propagated) {
        current = { ...current, units: propagationUnits };
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

  if (!defenderActuallyDestroyed && preview.result.defenderFled && nextAttacker.hp > 0 && (attackerDoctrine?.captureRetreatEnabled || preview.details.retreatCaptureChance > 0)) {
    const retreatChance = (attackerDoctrine?.captureRetreatEnabled ? 0.15 : 0) + preview.details.retreatCaptureChance;
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
  const effectiveKnockback = preview.details.totalKnockbackDistance + preview.details.heavyMassStacks;
  if (effectiveKnockback > 0 && !defenderActuallyDestroyed && !retreatCaptured) {
    const knockbackResult = applyKnockbackDistance(current, preview.attackerId, preview.defenderId, effectiveKnockback);
    current = knockbackResult.state;
    totalKnockbackDistance = knockbackResult.appliedDistance;
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
      const retreatHex = findRetreatHex(retreatingAttacker, current);
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
  if (preview.details.poisonStacks > 0 && !defenderActuallyDestroyed && updatedDefender) {
    updatedDefender = current.units.get(preview.defenderId);
    if (updatedDefender && updatedDefender.hp > 0) {
      updatedDefender = applyPoisonDoT(updatedDefender, preview.details.poisonStacks, 1, 3);
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
  if (
    defenderActuallyDestroyed
    && attackerDoctrine?.sporeJumpEnabled
    && nextAttacker.hp > 0
    && defender.poisonStacks > 0
  ) {
    const sporeUnits = new Map(current.units);
    const jumpPoison = (id: UnitId, u: Unit) => {
      const jumped = applyPoisonDoT(u, 1, attackerDoctrine.poisonDamagePerStack, 3);
      sporeUnits.set(id, { ...jumped, poisonedBy: attacker.factionId, poisonSourcePrototypeId: attacker.prototypeId });
    };
    let sporeJumped = false;
    if (attackerDoctrine.sporeJumpAllEnemies) {
      for (const [uid, u] of sporeUnits) {
        if (u.factionId === attacker.factionId || u.hp <= 0) continue;
        if (hexDistance(u.position, defender.position) > 2) continue;
        jumpPoison(uid, u);
        sporeJumped = true;
      }
    } else {
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
      }
    }
    if (sporeJumped) {
      current = { ...current, units: sporeUnits };
    }
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

  // Phase 3C — Synergy damage reflection (heavy_fortress, iron_turtle)
  if (preview.details.damageReflection > 0 && preview.result.defenderDamage > 0 && updatedAttacker) {
    const synergyReflectedDmg = Math.max(1, Math.floor(preview.result.defenderDamage * preview.details.damageReflection));
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
  if (preview.details.chargeCooldownWaived && updatedAttacker && updatedAttacker.hp > 0) {
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
      preview.details.attackerSynergyEffects.includes('stealth_recharge')
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
  if (hitAndRunTriggered && preview.details.poisonTrapPositions.length > 0) {
    const poisonTraps = new Map(current.poisonTraps);
    for (const position of preview.details.poisonTrapPositions) {
      poisonTraps.set(hexToKey(position), {
        damage: preview.details.poisonTrapDamage,
        slow: preview.details.poisonTrapSlow,
        ownerFactionId: attacker.factionId,
      });
    }
    current = { ...current, poisonTraps };
  }
  updatedAttacker = current.units.get(preview.attackerId);
  let healOnRetreatApplied = 0;
  if (hitAndRunTriggered && preview.details.healOnRetreatAmount > 0 && updatedAttacker) {
    healOnRetreatApplied = preview.details.healOnRetreatAmount;
    current = writeUnitToState(current, {
      ...updatedAttacker,
      hp: Math.min(updatedAttacker.maxHp, updatedAttacker.hp + healOnRetreatApplied),
    });
  }

  updatedAttacker = current.units.get(preview.attackerId);
  let combatHealingApplied = 0;
  const combatHealingEffect = preview.details.attackerSynergyEffects.find((effectCode) => effectCode.includes('combat_healing'));
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
  if (preview.details.heavyRegenPercent > 0 && updatedAttacker && preview.result.defenderDamage > 0) {
    const regenAmount = Math.floor(preview.result.defenderDamage * preview.details.heavyRegenPercent);
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
  if (preview.details.slaveHealAmount > 0 && updatedAttacker && updatedAttacker.hp > 0) {
    current = writeUnitToState(current, {
      ...updatedAttacker,
      hp: Math.min(updatedAttacker.maxHp, updatedAttacker.hp + preview.details.slaveHealAmount),
    });
    baseResolution.slaveHealApplied = preview.details.slaveHealAmount;
  }

  updatedDefender = current.units.get(preview.defenderId);
  let sandstormTargetsHit = 0;
  if (preview.details.sandstormDamage > 0 && updatedDefender && !defenderActuallyDestroyed && !retreatCaptured) {
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
          hp: Math.max(0, adjUnit.hp - preview.details.sandstormDamage),
        });
        sandstormTargetsHit += 1;
      }
    }
    current = { ...current, units: sandstormUnits };
  }

  // Phase 3C — Synergy AoE damage (multiplier_stack, etc.)
  updatedDefender = current.units.get(preview.defenderId);
  if (preview.details.aoeDamage > 0 && updatedDefender && !defenderActuallyDestroyed && !retreatCaptured) {
    const aoeUnits = new Map(current.units);
    let aoeHit = 0;
    for (const adjHex of getNeighbors(updatedDefender.position)) {
      const adjUnitId = getUnitAtHex(current, adjHex);
      if (!adjUnitId) continue;
      const adjUnit = aoeUnits.get(adjUnitId);
      if (adjUnit && adjUnit.factionId !== attacker.factionId && adjUnit.hp > 0) {
        aoeUnits.set(adjUnitId, { ...adjUnit, hp: Math.max(0, adjUnit.hp - preview.details.aoeDamage) });
        aoeHit++;
      }
    }
    if (aoeHit > 0) {
      current = { ...current, units: aoeUnits };
      baseResolution.aoeTargetsHit = aoeHit;
    }
  }

  updatedDefender = current.units.get(preview.defenderId);
  if (preview.details.contaminateActive && updatedDefender && !defenderActuallyDestroyed && !retreatCaptured) {
    const contaminatedHexes = new Set(current.contaminatedHexes);
    contaminatedHexes.add(hexToKey(updatedDefender.position));
    current = { ...current, contaminatedHexes };
    contaminatedHexApplied = true;
  }

  updatedDefender = current.units.get(preview.defenderId);
  let frostbiteApplied = false;
  if (preview.details.frostbiteColdDoT > 0 && updatedDefender && !defenderActuallyDestroyed && !retreatCaptured) {
    frostbiteApplied = true;
    current = writeUnitToState(current, {
      ...updatedDefender,
      frozen: true,
      frostbiteStacks: preview.details.frostbiteColdDoT,
      frostbiteDoTDuration: 3,
      movesRemaining: Math.max(0, updatedDefender.movesRemaining - preview.details.frostbiteSlow),
    });
  }

  // Phase 3A — Stun: reduce defender moves for N turns
  updatedDefender = current.units.get(preview.defenderId);
  if (preview.details.stunDuration > 0 && updatedDefender && !defenderActuallyDestroyed && updatedDefender.hp > 0) {
    current = writeUnitToState(current, {
      ...updatedDefender,
      stunDuration: preview.details.stunDuration,
      movesRemaining: 0,
    });
    baseResolution.stunApplied = preview.details.stunDuration;
  }

  // Phase 3A — Formation Crush: apply crush stacks to defender
  if (preview.details.formationCrushStacks > 0 && updatedDefender && !defenderActuallyDestroyed && updatedDefender.hp > 0) {
    current = writeUnitToState(current, {
      ...updatedDefender,
      formationCrushStacks: (updatedDefender.formationCrushStacks ?? 0) + preview.details.formationCrushStacks,
    });
    baseResolution.formationCrushApplied = preview.details.formationCrushStacks;
  }

  // Phase 3C — Sandstorm aura: accuracy debuff on adjacent enemies
  updatedDefender = current.units.get(preview.defenderId);
  if (preview.details.sandstormAuraRadius > 0 && updatedDefender && !defenderActuallyDestroyed && updatedDefender.hp > 0) {
    const auraUnits = new Map(current.units);
    for (const adjHex of getNeighbors(updatedDefender.position)) {
      const adjUnitId = getUnitAtHex(current, adjHex);
      if (!adjUnitId) continue;
      const adjUnit = auraUnits.get(adjUnitId);
      if (adjUnit && adjUnit.factionId !== attacker.factionId && adjUnit.hp > 0) {
        auraUnits.set(adjUnitId, {
          ...adjUnit,
          accuracyDebuff: (adjUnit.accuracyDebuff ?? 0) + preview.details.sandstormAuraDebuff,
        });
      }
    }
    current = { ...current, units: auraUnits };
  }

  // Phase 3A — Lethal Ambush poison: splash poison to adjacent enemies on instant kill
  if (baseResolution.instantKillTriggered && preview.details.lethalAmbushPoison > 0) {
    const poisonUnits = new Map(current.units);
    for (const adjHex of getNeighbors(defender.position)) {
      const adjUnitId = getUnitAtHex(current, adjHex);
      if (!adjUnitId) continue;
      const adjUnit = poisonUnits.get(adjUnitId);
      if (adjUnit && adjUnit.factionId !== attacker.factionId && adjUnit.hp > 0) {
        poisonUnits.set(adjUnitId, applyPoisonDoT(
          { ...adjUnit, poisonedBy: attacker.factionId } as Unit,
          preview.details.lethalAmbushPoison, 1, 3,
        ));
      }
    }
    current = { ...current, units: poisonUnits };
  }

  // Phase 3C — Withering reduction: apply debuff to defender's healing
  if (preview.details.witheringReduction > 0 && updatedDefender && !defenderActuallyDestroyed && updatedDefender.hp > 0) {
    current = writeUnitToState(current, {
      ...updatedDefender,
      witherReduction: preview.details.witheringReduction,
    });
  }

  // Phase 3C — Slave Army: buff nearby allied units with damage bonus / defense penalty
  updatedAttacker = current.units.get(preview.attackerId);
  if (updatedAttacker && (preview.details.slaveArmyDamageBonus > 0 || preview.details.slaveArmyDefensePenalty > 0)) {
    const armyUnits = new Map(current.units);
    for (const adjHex of getNeighbors(updatedAttacker.position)) {
      const adjUnitId = getUnitAtHex(current, adjHex);
      if (!adjUnitId) continue;
      const adjUnit = armyUnits.get(adjUnitId);
      if (adjUnit && adjUnit.factionId === attacker.factionId && adjUnit.hp > 0) {
        armyUnits.set(adjUnitId, {
          ...adjUnit,
          slaveArmyDamageBonus: (adjUnit.slaveArmyDamageBonus ?? 0) + preview.details.slaveArmyDamageBonus,
          slaveArmyDefensePenalty: (adjUnit.slaveArmyDefensePenalty ?? 0) + preview.details.slaveArmyDefensePenalty,
        });
      }
    }
    current = { ...current, units: armyUnits };
  }

  // Phase 3B — Capture aftermath: apply poison and modifiers to captured units
  if (capturedOnKill) {
    const capturedUnit = current.units.get(preview.defenderId);
    if (capturedUnit && capturedUnit.hp > 0) {
      let updated = { ...capturedUnit };
      if (preview.details.capturePoisonDamage > 0) {
        updated = applyPoisonDoT(updated, preview.details.capturePoisonStacks > 0 ? preview.details.capturePoisonStacks : 1, preview.details.capturePoisonDamage, 3);
        updated = { ...updated, poisonedBy: attacker.factionId } as Unit;
      }
      if (preview.details.slaveDamageBonus > 0) {
        updated = { ...updated, slaveDamageBonus: preview.details.slaveDamageBonus };
      }
      if (preview.details.slaveHealPenalty > 0) {
        updated = { ...updated, slaveHealPenalty: preview.details.slaveHealPenalty };
      }
      if (preview.details.captureEscapePrevented) {
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
  if (sandstormTargetsHit > 0) {
    pushCombatEffect(triggeredEffects, 'Sandstorm Splash', `Area damage hit ${sandstormTargetsHit} nearby unit${sandstormTargetsHit === 1 ? '' : 's'}.`, 'aftermath');
  }
  if (contaminatedHexApplied) {
    pushCombatEffect(triggeredEffects, 'Contamination', 'The defender hex became contaminated after the strike.', 'aftermath');
  }
  if (frostbiteApplied) {
    pushCombatEffect(triggeredEffects, 'Frostbite', `Defender took ${preview.details.frostbiteColdDoT} cold DoT and ${preview.details.frostbiteSlow} slow.`, 'aftermath');
  }
  if (hitAndRunTriggered && preview.details.poisonTrapPositions.length > 0) {
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
  if (pursuitMovementRestored > 0) {
    pushCombatEffect(triggeredEffects, 'Pursuit Movement', `Foraging riders pushed forward for +${pursuitMovementRestored} movement after the kill.`, 'aftermath');
  }
  if (baseResolution.killChainApplied) {
    pushCombatEffect(triggeredEffects, 'Killing Chain', 'Skirmisher chained a follow-up attack after the kill.', 'ability');
  }
  if (emergentSustainHealApplied > 0) {
    pushCombatEffect(triggeredEffects, 'Paladin Sustain', `Attacker recovered ${emergentSustainHealApplied} HP from damage dealt.`, 'aftermath');
  }
  if (baseResolution.emergentSustainMinHpSaved) {
    pushCombatEffect(triggeredEffects, 'Undying Will', `Attacker survived a lethal blow at ${preview.details.emergentSustainMinHp} HP.`, 'aftermath');
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
  if (preview.details.emergentManyFacedStance) {
    const stanceLabel = preview.details.emergentManyFacedStance.charAt(0).toUpperCase() + preview.details.emergentManyFacedStance.slice(1);
    pushCombatEffect(triggeredEffects, `Many-Faced: ${stanceLabel}`, `Adapted stance based on combat context.`, 'synergy');
    baseResolution.emergentManyFacedStance = preview.details.emergentManyFacedStance;
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
    },
  };

  return { state: pruneDeadUnits(current), feedback };
}
