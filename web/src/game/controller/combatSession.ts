/**
 * Combat preview and resolution helpers extracted from GameSession.
 */

import type { GameState, UnitId } from '../../../../src/game/types.js';
import type { RulesRegistry } from '../../../../src/data/registry/types.js';
import type { CombatResult } from '../../../../src/systems/combatSystem.js';
import type { CombatActionPreview } from '../../../../src/systems/combatActionSystem.js';
import type { ReplayCombatEvent } from '../types/replay';
import { getUnit, getPrototype } from '../stateAccess.js';

/** Pre-resolved combat data returned by resolveAttack() before state is mutated */
export interface PendingCombat {
  attackerId: UnitId;
  defenderId: UnitId;
  preview: CombatActionPreview;
  result: CombatResult;
  combatEvent: ReplayCombatEvent;
}

export function buildPendingCombat(
  state: GameState,
  registry: RulesRegistry,
  preview: CombatActionPreview,
): PendingCombat {
  const attacker = getUnit(state, preview.attackerId);
  const defender = getUnit(state, preview.defenderId);
  const attackerPrototype = attacker ? getPrototype(state, attacker.prototypeId) : null;
  const defenderPrototype = defender ? getPrototype(state, defender.prototypeId) : null;
  if (!attacker || !defender || !attackerPrototype || !defenderPrototype) {
    throw new Error('Cannot build pending combat without attacker, defender, and prototype records.');
  }

  const attackerHpAfter = Math.max(0, attacker.hp - preview.result.attackerDamage);
  const defenderHpAfter = Math.max(0, defender.hp - preview.result.defenderDamage);

  const situationalAttackModifier =
    preview.result.situationalAttackModifier - preview.details.chargeAttackBonus - preview.details.synergyAttackModifier;
  const situationalDefenseModifier =
    preview.result.situationalDefenseModifier - preview.details.synergyDefenseModifier;

  const combatEvent: ReplayCombatEvent = {
    round: preview.round,
    attackerUnitId: preview.attackerId,
    defenderUnitId: preview.defenderId,
    attackerFactionId: preview.attackerFactionId,
    defenderFactionId: preview.defenderFactionId,
    attackerPrototypeId: attacker.prototypeId,
    defenderPrototypeId: defender.prototypeId,
    attackerPrototypeName: preview.attackerPrototypeName,
    defenderPrototypeName: preview.defenderPrototypeName,
    attackerDamage: preview.result.attackerDamage,
    defenderDamage: preview.result.defenderDamage,
    attackerHpAfter,
    defenderHpAfter,
    attackerDestroyed: preview.result.attackerDestroyed,
    defenderDestroyed: preview.result.defenderDestroyed,
    attackerRouted: preview.result.attackerRouted,
    defenderRouted: preview.result.defenderRouted,
    attackerFled: preview.result.attackerFled,
    defenderFled: preview.result.defenderFled,
    summary: `${preview.attackerPrototypeName} attacked ${preview.defenderPrototypeName}`,
    breakdown: {
      attacker: {
        unitId: attacker.id,
        factionId: attacker.factionId,
        prototypeId: attacker.prototypeId,
        prototypeName: attackerPrototype.name,
        position: { ...attacker.position },
        terrain: preview.details.attackerTerrainId,
        hpBefore: attacker.hp,
        hpAfter: attackerHpAfter,
        maxHp: attacker.maxHp,
        baseStat: preview.result.attackerBaseAttack,
      },
      defender: {
        unitId: defender.id,
        factionId: defender.factionId,
        prototypeId: defender.prototypeId,
        prototypeName: defenderPrototype.name,
        position: { ...defender.position },
        terrain: preview.details.defenderTerrainId,
        hpBefore: defender.hp,
        hpAfter: defenderHpAfter,
        maxHp: defender.maxHp,
        baseStat: preview.result.defenderBaseDefense,
      },
      modifiers: {
        roleModifier: preview.result.roleModifier,
        weaponModifier: preview.result.weaponModifier,
        flankingBonus: preview.result.flankingBonus,
        chargeBonus: preview.details.chargeAttackBonus,
        braceDefenseBonus: preview.result.braceDefenseBonus,
        ambushBonus: preview.result.ambushAttackBonus,
        hiddenAttackBonus: preview.result.hiddenAttackBonus,
        stealthAmbushBonus: preview.attackerWasStealthed ? 0.5 : 0,
        rearAttackBonus: preview.result.rearAttackBonus,
        situationalAttackModifier,
        situationalDefenseModifier,
        synergyAttackModifier: preview.details.synergyAttackModifier,
        synergyDefenseModifier: preview.details.synergyDefenseModifier,
        improvementDefenseBonus: preview.details.improvementDefenseBonus,
        wallDefenseBonus: preview.details.wallDefenseBonus,
        finalAttackStrength: preview.result.attackStrength,
        finalDefenseStrength: preview.result.defenseStrength,
        baseMultiplier: preview.result.baseMultiplier,
        positionalMultiplier: preview.result.positionalMultiplier,
        damageVarianceMultiplier: preview.result.damageVarianceMultiplier,
        retaliationVarianceMultiplier: preview.result.retaliationVarianceMultiplier,
      },
      morale: {
        attackerLoss: preview.result.attackerMoraleLoss,
        defenderLoss: preview.result.defenderMoraleLoss,
        attackerRouted: preview.result.attackerRouted,
        defenderRouted: preview.result.defenderRouted,
        attackerFled: preview.result.attackerFled,
        defenderFled: preview.result.defenderFled,
      },
      outcome: {
        attackerDamage: preview.result.attackerDamage,
        defenderDamage: preview.result.defenderDamage,
        attackerDestroyed: preview.result.attackerDestroyed,
        defenderDestroyed: preview.result.defenderDestroyed,
        defenderKnockedBack: preview.result.defenderKnockedBack,
        knockbackDistance: preview.result.knockbackDistance,
      },
      triggeredEffects: [...preview.triggeredEffects],
    },
  };

  return {
    attackerId: preview.attackerId,
    defenderId: preview.defenderId,
    preview,
    result: preview.result,
    combatEvent,
  };
}
