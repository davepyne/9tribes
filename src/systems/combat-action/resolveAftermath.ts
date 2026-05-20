/**
 * resolveAftermath.ts — Knockback/rout and final state resolution.
 * All cross-phase state is read/written via CombatContext.
 */

import type { CombatContext } from './combatContext.js';
import { getNeighbors } from '../../core/grid.js';
import { rngShuffle } from '../../core/rng.js';
import { applyCombatSignals } from '../combatSignalSystem.js';
import { applyContactTransfer } from '../capabilitySystem.js';
import { unlockHybridRecipes } from '../hybridSystem.js';
import { findRetreatHex } from '../signatureAbilitySystem.js';
import { addZoneEffect } from '../zoneEffectSystem.js';
import { createZoneEffectId } from '../../core/ids.js';
import {
  updateCombatRecordOnLoss,
  updateCombatRecordOnWin,
  recordBattleFought,
  recordEnemyKilled,
  recordPromotion,
} from '../historySystem.js';
import { applyCombatResearchBonus } from './combatContext.js';
import { maybeAbsorbFaction } from './factionAbsorption.js';
import { getUnitAtHex } from '../occupancySystem.js';
import {
  writeUnitToState,
  applyKnockbackDistance,
  destroyTransportIfApplicable,
} from './helpers.js';

/**
 * Knockback, rout, stampede, and transport destruction.
 */
export function applyKnockbackAndRout(ctx: CombatContext): void {
  const {
    registry,
    preview,
    attacker,
    defender,
    attackerDoctrine,
    atk,
    defenderActuallyDestroyed,
  } = ctx;

  let current = ctx.current;
  let baseResolution = ctx.resolution;
  const attackerActuallyDestroyed = ctx.attackerActuallyDestroyed;
  const capturedOnKill = ctx.capturedOnKill;
  const retreatCaptured = ctx.retreatCaptured;

  let totalKnockbackDistance = 0;
  let knockbackCollisionDamage = 0;
  const effectiveKnockback = preview.details.totalKnockbackDistance;
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

  ctx.current = current;
  ctx.resolution = baseResolution;
  ctx.totalKnockbackDistance = totalKnockbackDistance;
  ctx.bigChargeRoutTriggered = bigChargeRoutTriggered;
  ctx.stampedeDamageApplied = stampedeDamageApplied;
}

/**
 * Final state resolution: combat signals, research bonus, contact transfer,
 * faction absorption, combat records, hit and run, juggernaut reposition,
 * history recording.
 */
export function finalizeCombatState(ctx: CombatContext): void {
  const {
    state,
    registry,
    preview,
    attacker,
    defender,
    attackerDoctrine,
    atk,
    defenderActuallyDestroyed,
  } = ctx;

  let current = ctx.current;
  let baseResolution = ctx.resolution;
  let feedback = ctx.feedback;
  const attackerActuallyDestroyed = ctx.attackerActuallyDestroyed;
  const capturedOnKill = ctx.capturedOnKill;

  current = applyCombatSignals(current, attacker.factionId, preview.result.signals);
  current = applyCombatResearchBonus(current, attacker.factionId, defender.factionId, registry);
  current = applyCombatResearchBonus(current, defender.factionId, attacker.factionId, registry);
  current = applyContactTransfer(current, attacker.factionId, defender.factionId, 'contact');
  const absorbResult = maybeAbsorbFaction(current, attacker.factionId, defender.factionId, registry);
  current = absorbResult.state;
  if (absorbResult.absorbedDomains.length > 0) {
    feedback = { ...feedback, absorbedDomains: absorbResult.absorbedDomains };
  }
  current = unlockHybridRecipes(current, attacker.factionId, registry);

  if (defenderActuallyDestroyed && !capturedOnKill) {
    current = updateCombatRecordOnWin(current, attacker.factionId, current.round);
    current = updateCombatRecordOnLoss(current, defender.factionId, current.round);
  } else if (attackerActuallyDestroyed) {
    current = updateCombatRecordOnLoss(current, attacker.factionId, current.round);
    current = updateCombatRecordOnWin(current, defender.factionId, current.round);
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
        // DESIGN: Bloodtrail zones intentionally stack without bound (unlike
        // life_bloom/citadel which are one-per-faction). Each hit-and-run
        // leaves a separate splotch at the pre-retreat hex, creating a
        // literal trail. Self-cleaning via turnsRemaining: 2.
        if (attackerDoctrine?.bloodtrailMomentumEnabled) {
          current = addZoneEffect(current, {
            id: createZoneEffectId(),
            type: 'bloodtrail',
            center: { q: retreatingAttacker.position.q, r: retreatingAttacker.position.r },
            radius: 0,
            ownerFactionId: attacker.factionId,
            damagePerTurn: 0,
            movementPenalty: 0,
            turnsRemaining: 2,
            createdRound: current.round,
          });
        }
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

  ctx.current = current;
  ctx.resolution = baseResolution;
  ctx.feedback = feedback;
}
