import { hexDistance, hexToKey } from '../core/grid.js';
import type { RulesRegistry } from '../data/registry/types.js';
import type { Unit } from '../features/units/types.js';
import type { GameState, UnitId } from '../game/types.js';
import { getCombatAttackModifier, getCombatDefenseModifier } from './factionIdentitySystem.js';
import {
  getVeteranDefenseBonus,
  getVeteranMoraleBonus,
  getVeteranStatBonus,
  resolveCombat,
  type CombatResult,
} from './combatSystem.js';
import { resolveCapabilityDoctrine } from './capabilityDoctrine.js';
import { canUseCharge, clearPreparedAbility } from './abilitySystem.js';
import { applyCombatSignals } from './combatSignalSystem.js';
import { unlockHybridRecipes } from './hybridSystem.js';
import { awardCombatXP } from './xpSystem.js';
import { tryPromoteUnit } from './veterancySystem.js';
import { tryLearnFromKill } from './learnByKillSystem.js';
import { attemptCapture, attemptNonCombatCapture, hasCaptureAbility } from './captureSystem.js';
import { addExhaustion, EXHAUSTION_CONFIG } from './warExhaustionSystem.js';
import { applyContactTransfer } from './capabilitySystem.js';
import { destroyTransport, isTransportUnit } from './transportSystem.js';
import { applyKnockback, findRetreatHex } from './signatureAbilitySystem.js';
import { calculateFlankingBonus, isRearAttack } from './zocSystem.js';
import { getFactionCityIds, syncAllFactionSettlementIds } from './factionOwnershipSystem.js';
import {
  updateCombatRecordOnElimination,
  updateCombatRecordOnLoss,
  updateCombatRecordOnWin,
} from './historySystem.js';
import type { FactionId } from '../types.js';

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
}

export interface CombatActionPreviewOverrides {
  round?: number;
  attackerFactionId?: string;
  defenderFactionId?: string;
  attackerPrototypeName?: string;
  defenderPrototypeName?: string;
  triggeredEffects?: CombatActionEffect[];
  braceTriggered?: boolean;
  attackerWasStealthed?: boolean;
}

export interface CombatActionFeedback {
  lastLearnedDomain: { unitId: string; domainId: string } | null;
  hitAndRunRetreat: { unitId: string; to: { q: number; r: number } } | null;
}

export interface CombatActionApplyResult {
  state: GameState;
  feedback: CombatActionFeedback;
}

const WATER_TERRAIN = new Set(['coast', 'river', 'ocean']);

function getImprovementBonus(state: GameState, position: { q: number; r: number }) {
  for (const improvement of state.improvements.values()) {
    if (improvement.position.q === position.q && improvement.position.r === position.r) {
      return improvement.defenseBonus ?? 0;
    }
  }
  for (const city of state.cities.values()) {
    if (city.position.q === position.q && city.position.r === position.r) {
      return 1;
    }
  }
  for (const village of state.villages.values()) {
    if (village.position.q === position.q && village.position.r === position.r) {
      return 0.5;
    }
  }

  return 0;
}

function removeDeadUnitsFromFactions(factions: GameState['factions'], units: GameState['units']) {
  const nextFactions = new Map(factions);
  for (const [factionId, faction] of nextFactions.entries()) {
    nextFactions.set(factionId, {
      ...faction,
      unitIds: faction.unitIds.filter((unitId) => units.has(unitId as UnitId)),
    });
  }
  return nextFactions;
}

function canAttackTarget(state: GameState, registry: RulesRegistry, attacker: Unit, defender: Unit): boolean {
  const attackerPrototype = state.prototypes.get(attacker.prototypeId as never);
  if (!attackerPrototype) {
    return false;
  }

  const attackRange = attackerPrototype.derivedStats.range ?? 1;
  if (hexDistance(attacker.position, defender.position) > attackRange) {
    return false;
  }

  const chassis = registry.getChassis(attackerPrototype.chassisId);
  const isNavalUnit = chassis?.movementClass === 'naval';
  if (!isNavalUnit) {
    return true;
  }

  const faction = state.factions.get(attacker.factionId);
  const doctrine = faction
    ? resolveCapabilityDoctrine(state.research.get(attacker.factionId), faction)
    : undefined;
  if (doctrine?.amphibiousAssaultEnabled === true) {
    return true;
  }

  const defenderTerrain = state.map?.tiles.get(hexToKey(defender.position))?.terrain ?? '';
  return WATER_TERRAIN.has(defenderTerrain);
}

function buildCombatActionPreview(
  state: GameState,
  attackerId: UnitId,
  defenderId: UnitId,
  result: CombatResult,
  overrides: CombatActionPreviewOverrides = {},
): CombatActionPreview | null {
  const attacker = state.units.get(attackerId);
  const defender = state.units.get(defenderId);
  const attackerPrototype = attacker ? state.prototypes.get(attacker.prototypeId as never) : null;
  const defenderPrototype = defender ? state.prototypes.get(defender.prototypeId as never) : null;
  if (!attacker || !defender || !attackerPrototype || !defenderPrototype) {
    return null;
  }

  return {
    attackerId,
    defenderId,
    result,
    round: overrides.round ?? state.round,
    attackerFactionId: overrides.attackerFactionId ?? attacker.factionId,
    defenderFactionId: overrides.defenderFactionId ?? defender.factionId,
    attackerPrototypeName: overrides.attackerPrototypeName ?? attackerPrototype.name,
    defenderPrototypeName: overrides.defenderPrototypeName ?? defenderPrototype.name,
    triggeredEffects: overrides.triggeredEffects ?? [],
    braceTriggered: overrides.braceTriggered ?? false,
    attackerWasStealthed: overrides.attackerWasStealthed ?? (attacker.isStealthed ?? false),
  };
}

export function createCombatActionPreview(
  state: GameState,
  attackerId: UnitId,
  defenderId: UnitId,
  result: CombatResult,
  overrides: CombatActionPreviewOverrides = {},
): CombatActionPreview | null {
  return buildCombatActionPreview(state, attackerId, defenderId, result, overrides);
}

function maybeAbsorbFaction(
  state: GameState,
  victorFactionId: FactionId,
  defeatedFactionId: FactionId,
): GameState {
  const stillAlive = Array.from(state.units.values()).some(
    (unit) => unit.factionId === defeatedFactionId && unit.hp > 0,
  );
  if (stillAlive) {
    return state;
  }

  const defeatedFaction = state.factions.get(defeatedFactionId);
  const victorFaction = state.factions.get(victorFactionId);
  if (!defeatedFaction || !victorFaction) {
    return state;
  }

  let current = applyContactTransfer(state, victorFactionId, defeatedFactionId, 'absorption');
  current = updateCombatRecordOnElimination(current, victorFactionId);

  const newCities = new Map(current.cities);
  for (const cityId of getFactionCityIds(current, defeatedFactionId)) {
    const city = current.cities.get(cityId);
    if (city) {
      newCities.set(cityId, { ...city, factionId: victorFactionId, turnsSinceCapture: 0 });
    }
  }

  const newVillages = new Map(current.villages);
  for (const village of current.villages.values()) {
    if (village.factionId === defeatedFactionId) {
      newVillages.set(village.id, { ...village, factionId: victorFactionId });
    }
  }

  const newFactions = new Map(current.factions);
  newFactions.set(defeatedFactionId, {
    ...defeatedFaction,
    cityIds: [],
    villageIds: [],
  });

  return syncAllFactionSettlementIds({
    ...current,
    cities: newCities,
    villages: newVillages,
    factions: newFactions,
  });
}

export function previewCombatAction(
  state: GameState,
  registry: RulesRegistry,
  attackerId: UnitId,
  defenderId: UnitId,
): CombatActionPreview | null {
  const attacker = state.units.get(attackerId);
  const defender = state.units.get(defenderId);
  if (!attacker || !defender || attacker.hp <= 0 || defender.hp <= 0 || !state.map) {
    return null;
  }

  if (attacker.factionId !== state.activeFactionId || defender.factionId === attacker.factionId || attacker.attacksRemaining <= 0) {
    return null;
  }

  if (!canAttackTarget(state, registry, attacker, defender)) {
    return null;
  }

  const attackerPrototype = state.prototypes.get(attacker.prototypeId as never);
  const defenderPrototype = state.prototypes.get(defender.prototypeId as never);
  if (!attackerPrototype || !defenderPrototype) {
    return null;
  }

  const attackerTerrainId = state.map.tiles.get(hexToKey(attacker.position))?.terrain ?? 'plains';
  const defenderTerrainId = state.map.tiles.get(hexToKey(defender.position))?.terrain ?? 'plains';
  const attackerTerrain = registry.getTerrain(attackerTerrainId);
  const defenderTerrain = registry.getTerrain(defenderTerrainId);
  const attackerFaction = state.factions.get(attacker.factionId);
  const defenderFaction = state.factions.get(defender.factionId);
  const attackerDoctrine = attackerFaction
    ? resolveCapabilityDoctrine(state.research.get(attacker.factionId), attackerFaction)
    : undefined;
  const defenderDoctrine = defenderFaction
    ? resolveCapabilityDoctrine(state.research.get(defender.factionId), defenderFaction)
    : undefined;
  const canChargeAttack =
    (attackerPrototype.derivedStats.range ?? 1) <= 1
    && (canUseCharge(attackerPrototype) || attackerDoctrine?.chargeTranscendenceEnabled === true);
  const isChargeAttack = canChargeAttack
    && (
      attackerDoctrine?.chargeTranscendenceEnabled === true
      || attacker.movesRemaining < attacker.maxMoves
    );
  const defenderOnFort = getImprovementBonus(state, defender.position) > 0;
  const flankingBonus = defenderOnFort ? 0 : calculateFlankingBonus(attacker, defender, state);
  const rearAttackBonus = (defenderOnFort ? false : isRearAttack(attacker, defender)) ? 0.2 : 0;
  const braceTriggered = defender.preparedAbility === 'brace'
    && (attackerPrototype.derivedStats.role === 'mounted' || (attackerPrototype.derivedStats.range ?? 1) <= 1);
  const ambushAttackBonus = attacker.preparedAbility === 'ambush' ? 0.15 : 0;
  const chargeAttackBonus = isChargeAttack && !braceTriggered ? 0.15 : 0;
  const braceDefenseBonus = defender.preparedAbility === 'brace'
    ? (defenderDoctrine?.fortressTranscendenceEnabled ? 0.4 : 0.2)
    : 0;
  const attackModifier =
    getCombatAttackModifier(attackerFaction, attackerTerrain, defenderTerrain)
    + chargeAttackBonus
    + (attackerDoctrine?.antiFortificationEnabled && (defender.preparedAbility === 'brace' || defenderOnFort) ? 0.2 : 0)
    + (attackerDoctrine?.chargeRoutedBonusEnabled && isChargeAttack && defender.routed ? 0.5 : 0);
  const defenseModifier =
    getCombatDefenseModifier(defenderFaction, defenderTerrain)
    + (defender.hillDugIn ? 0.2 : 0);
  const result = resolveCombat(
    attacker,
    defender,
    attackerPrototype,
    defenderPrototype,
    getVeteranStatBonus(registry, attacker.veteranLevel),
    getVeteranDefenseBonus(registry, defender.veteranLevel),
    attackerTerrain,
    defenderTerrain,
    getImprovementBonus(state, defender.position),
    getVeteranMoraleBonus(registry, defender.veteranLevel),
    registry,
    flankingBonus,
    attackModifier,
    defenseModifier,
    state.rngState,
    rearAttackBonus,
    braceDefenseBonus,
    ambushAttackBonus,
    (rearAttackBonus > 0 ? 18 : 0) + (attacker.preparedAbility === 'ambush' ? 10 : 0),
    braceTriggered && isChargeAttack ? 1.1 : 1,
    0,
    isChargeAttack,
    attacker.isStealthed,
  );

  const triggeredEffects: CombatActionEffect[] = [];

  if (result.flankingBonus !== 0) {
    triggeredEffects.push({
      label: 'Flanking',
      detail: `Attacked from the side (${(result.flankingBonus * 100).toFixed(0)}%)`,
      category: 'positioning',
    });
  }
  if (result.rearAttackBonus !== 0) {
    triggeredEffects.push({
      label: 'Rear Attack',
      detail: `Struck from behind (${(result.rearAttackBonus * 100).toFixed(0)}%)`,
      category: 'positioning',
    });
  }
  if (result.roleModifier !== 0) {
    const sign = result.roleModifier > 0 ? '+' : '';
    triggeredEffects.push({
      label: 'Role Effectiveness',
      detail: `${attackerPrototype.derivedStats.role ?? 'unknown'} vs ${defenderPrototype.derivedStats.role ?? 'unknown'}: ${sign}${(result.roleModifier * 100).toFixed(0)}%`,
      category: 'positioning',
    });
  }
  if (result.weaponModifier !== 0) {
    const sign = result.weaponModifier > 0 ? '+' : '';
    triggeredEffects.push({
      label: 'Weapon Effectiveness',
      detail: `${sign}${(result.weaponModifier * 100).toFixed(0)}%`,
      category: 'ability',
    });
  }
  if (result.braceDefenseBonus !== 0) {
    triggeredEffects.push({
      label: 'Brace Defense',
      detail: `Defender braced (+${(result.braceDefenseBonus * 100).toFixed(0)}%)`,
      category: 'positioning',
    });
  }
  if (result.ambushAttackBonus !== 0) {
    triggeredEffects.push({
      label: 'Ambush Attack',
      detail: `+${(result.ambushAttackBonus * 100).toFixed(0)}%`,
      category: 'positioning',
    });
  }
  if (attacker.isStealthed) {
    triggeredEffects.push({
      label: 'Stealth Ambush',
      detail: 'Opened from stealth for a major attack bonus.',
      category: 'ability',
    });
  }

  for (const signal of result.signals) {
    if (signal.startsWith('synergy:')) {
      triggeredEffects.push({ label: 'Synergy', detail: signal.replace('synergy:', ''), category: 'synergy' });
    } else if (signal.startsWith('terrain:')) {
      triggeredEffects.push({ label: 'Terrain', detail: signal.replace('terrain:', ''), category: 'positioning' });
    } else if (signal.startsWith('charge:')) {
      triggeredEffects.push({ label: 'Charge', detail: signal.replace('charge:', ''), category: 'ability' });
    } else if (signal.startsWith('aftermath:')) {
      triggeredEffects.push({ label: 'Aftermath', detail: signal.replace('aftermath:', ''), category: 'aftermath' });
    }
  }

  return buildCombatActionPreview(state, attackerId, defenderId, result, {
    round: state.round,
    attackerFactionId: attacker.factionId,
    defenderFactionId: defender.factionId,
    attackerPrototypeName: attackerPrototype.name,
    defenderPrototypeName: defenderPrototype.name,
    triggeredEffects,
    braceTriggered,
    attackerWasStealthed: attacker.isStealthed ?? false,
  });
}

export function applyCombatAction(
  state: GameState,
  registry: RulesRegistry,
  preview: CombatActionPreview,
): CombatActionApplyResult {
  const attacker = state.units.get(preview.attackerId);
  const defender = state.units.get(preview.defenderId);
  if (!attacker || !defender) {
    return {
      state,
      feedback: {
        lastLearnedDomain: null,
        hitAndRunRetreat: null,
      },
    };
  }

  const attackerPrototype = state.prototypes.get(attacker.prototypeId as never);
  const defenderPrototype = state.prototypes.get(defender.prototypeId as never);
  if (!attackerPrototype || !defenderPrototype) {
    return {
      state,
      feedback: {
        lastLearnedDomain: null,
        hitAndRunRetreat: null,
      },
    };
  }

  let nextAttacker: Unit = {
    ...attacker,
    hp: Math.max(0, attacker.hp - preview.result.attackerDamage),
    morale: Math.max(0, attacker.morale - preview.result.attackerMoraleLoss),
    routed: preview.result.attackerRouted || preview.result.attackerFled,
    hillDugIn: false,
    attacksRemaining: 0,
    movesRemaining: 0,
    activatedThisRound: true,
    status: 'spent',
  };
  let nextDefender: Unit = {
    ...defender,
    hp: Math.max(0, defender.hp - preview.result.defenderDamage),
    morale: Math.max(0, defender.morale - preview.result.defenderMoraleLoss),
    routed: preview.result.defenderRouted || preview.result.defenderFled,
    hillDugIn: false,
    status: preview.result.defenderDestroyed ? 'spent' : defender.status,
  };

  if (preview.attackerWasStealthed && nextAttacker.hp > 0) {
    nextAttacker = { ...nextAttacker, isStealthed: false, turnsSinceStealthBreak: 1 };
  }
  if (nextAttacker.preparedAbility) {
    nextAttacker = clearPreparedAbility(nextAttacker);
  }
  if (preview.braceTriggered && nextDefender.preparedAbility) {
    nextDefender = clearPreparedAbility(nextDefender);
  }

  let feedback: CombatActionFeedback = {
    lastLearnedDomain: null,
    hitAndRunRetreat: null,
  };

  if (preview.result.defenderDestroyed && !preview.result.attackerDestroyed && nextAttacker.hp > 0) {
    const learnResult = tryLearnFromKill(nextAttacker, defender, state, state.rngState);
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
    nextAttacker = awardCombatXP(nextAttacker, preview.result.defenderDestroyed, !preview.result.attackerDestroyed);
    nextAttacker = tryPromoteUnit(nextAttacker, registry);
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
  const attackerDoctrine = attackerFaction
    ? resolveCapabilityDoctrine(current.research.get(attacker.factionId), attackerFaction)
    : undefined;
  const attackerTerrainId = current.map?.tiles.get(hexToKey(attacker.position))?.terrain ?? '';
  const isGreedyCoastal = attackerFaction?.identityProfile.passiveTrait === 'greedy'
    && WATER_TERRAIN.has(attackerTerrainId);
  const autoCaptureAbility = attackerDoctrine?.autoCaptureEnabled && defender.hp <= defender.maxHp * 0.25
    ? {
        greedyCaptureChance: 1,
        greedyCaptureCooldown: 0,
        greedyCaptureHpFraction: 0.25,
      }
    : null;
  let capturedOnKill = false;
  let retreatCaptured = false;
  if (
    preview.result.defenderDestroyed
    && nextAttacker.hp > 0
    && (hasCaptureAbility(attackerPrototype, registry) || isGreedyCoastal || autoCaptureAbility)
  ) {
    const captureResult = attemptCapture(
      current,
      nextAttacker,
      defender,
      registry,
      autoCaptureAbility
        ?? (isGreedyCoastal && !hasCaptureAbility(attackerPrototype, registry)
          ? registry.getSignatureAbility(attacker.factionId)
          : null),
      current.rngState,
    );
    current = captureResult.state;
    capturedOnKill = captureResult.captured;
  }

  if (!preview.result.defenderDestroyed && preview.result.defenderFled && nextAttacker.hp > 0 && attackerDoctrine?.captureRetreatEnabled) {
    const retreatCapture = attemptNonCombatCapture(
      current,
      preview.attackerId,
      preview.defenderId,
      registry,
      0.15,
      0.25,
      0,
      current.rngState,
    );
    current = retreatCapture.state;
    retreatCaptured = retreatCapture.captured;
  }

  if (preview.result.defenderKnockedBack && !preview.result.defenderDestroyed && !retreatCaptured) {
    const knockedAttacker = current.units.get(preview.attackerId);
    const knockedDefender = current.units.get(preview.defenderId);
    if (knockedAttacker && knockedDefender) {
      const knockbackHex = applyKnockback(current, knockedAttacker, knockedDefender, preview.result.knockbackDistance);
      if (knockbackHex) {
        const unitsAfterKnockback = new Map(current.units);
        unitsAfterKnockback.set(knockedDefender.id, {
          ...knockedDefender,
          position: knockbackHex,
        });
        current = { ...current, units: unitsAfterKnockback };
      }
    }
  }

  if (preview.result.defenderDestroyed && !capturedOnKill) {
    const destroyedDefender = current.units.get(preview.defenderId) ?? defender;
    const proto = current.prototypes.get(destroyedDefender.prototypeId as never);
    if (proto && isTransportUnit(proto, registry)) {
      const destroyResult = destroyTransport(current, destroyedDefender.id, current.transportMap);
      current = { ...destroyResult.state, transportMap: destroyResult.transportMap };
    }
  }
  if (preview.result.attackerDestroyed) {
    const destroyedAttacker = current.units.get(preview.attackerId) ?? attacker;
    const proto = current.prototypes.get(destroyedAttacker.prototypeId as never);
    if (proto && isTransportUnit(proto, registry)) {
      const destroyResult = destroyTransport(current, destroyedAttacker.id, current.transportMap);
      current = { ...destroyResult.state, transportMap: destroyResult.transportMap };
    }
  }

  current = applyCombatSignals(current, attacker.factionId, preview.result.signals);
  current = applyContactTransfer(current, attacker.factionId, defender.factionId, 'contact');
  current = maybeAbsorbFaction(current, attacker.factionId as FactionId, defender.factionId as FactionId);
  current = unlockHybridRecipes(current, attacker.factionId, registry);

  if (preview.result.defenderDestroyed && !capturedOnKill) {
    current = updateCombatRecordOnWin(current, attacker.factionId as FactionId, current.round);
    current = updateCombatRecordOnLoss(current, defender.factionId as FactionId, current.round);
  } else if (preview.result.attackerDestroyed) {
    current = updateCombatRecordOnLoss(current, attacker.factionId as FactionId, current.round);
    current = updateCombatRecordOnWin(current, defender.factionId as FactionId, current.round);
  }

  const attackerWarExhaustion = current.warExhaustion.get(attacker.factionId);
  const defenderWarExhaustion = current.warExhaustion.get(defender.factionId);
  if (preview.result.defenderDestroyed && attackerWarExhaustion) {
    current = {
      ...current,
      warExhaustion: new Map(current.warExhaustion).set(
        attacker.factionId,
        addExhaustion(attackerWarExhaustion, EXHAUSTION_CONFIG.UNIT_KILLED),
      ),
    };
  }
  if (preview.result.attackerDestroyed && defenderWarExhaustion) {
    current = {
      ...current,
      warExhaustion: new Map(current.warExhaustion).set(
        defender.factionId,
        addExhaustion(defenderWarExhaustion, EXHAUSTION_CONFIG.UNIT_KILLED),
      ),
    };
  }

  const hitAndRunEligible =
    attackerDoctrine?.universalHitAndRunEnabled
    || (attackerDoctrine?.hitAndRunEnabled && attackerPrototype.tags?.includes('cavalry') && attackerPrototype.tags?.includes('skirmish'));
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

  return { state: current, feedback };
}
