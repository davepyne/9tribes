// War Exhaustion System
// Faction-level mechanic: prolonged combat and losses accumulate exhaustion,
// creating production pressure and strategic incentive to stop fighting.

import type { WarExhaustion } from '../features/factions/types.js';
import type { GameState, UnitId } from '../game/types.js';
import type { FactionId } from '../types.js';
import type { RulesRegistry } from '../data/registry/types.js';
import { getSupplyDeficit, deriveResourceIncome } from './economySystem.js';
import { applyMoraleLoss } from './moraleSystem.js';
import { rngShuffle } from '../core/rng.js';

export const EXHAUSTION_CONFIG = {
  UNIT_KILLED: 2,
  UNIT_LOST: 2,
  CITY_CAPTURED: 5,
  VILLAGE_LOST: 2,
  SUPPLY_DEFICIT_PER_POINT: 1,
  BESIEGED_CITY_PER_TURN: 1,
  CITY_CAPTURED_ATTACKER: 2,
  DECAY_NO_LOSS: 2,
  DECAY_TERRITORY_CLEARED: 1,
  VICTORY_OFFSET: 0,
};

/**
 * Create initial war exhaustion state for a faction.
 */
export function createWarExhaustion(factionId: string): WarExhaustion {
  return {
    factionId: factionId as any,
    exhaustionPoints: 0,
    turnsWithoutLoss: 0,
  };
}

/**
 * Add exhaustion points to a faction.
 */
export function addExhaustion(
  state: WarExhaustion,
  amount: number
): WarExhaustion {
  return {
    ...state,
    exhaustionPoints: Math.max(0, state.exhaustionPoints + amount),
  };
}

/**
 * Calculate production penalty from war exhaustion.
 */
export function calculateProductionPenalty(exhaustion: number): number {
  // Every 25 exhaustion points reduces production by 5% (0.05)
  return Math.floor(exhaustion / 25) * 0.05;
}

/**
 * Calculate morale penalty to all units from war exhaustion.
 */
export function calculateMoralePenalty(exhaustion: number): number {
  // Every 20 exhaustion points reduces morale by 1
  return Math.floor(exhaustion / 20);
}

/**
 * Apply decay to war exhaustion based on peaceful conditions and research bonuses.
 */
export function applyDecay(
  state: WarExhaustion,
  conditions: {
    noLossTurns: number;
    territoryClear: boolean;
    marchingStaminaBonus?: number;
  }
): WarExhaustion {
  let decay = 0;
  if (conditions.noLossTurns >= 3) {
    decay += EXHAUSTION_CONFIG.DECAY_NO_LOSS;
  }
  if (conditions.territoryClear) {
    decay += EXHAUSTION_CONFIG.DECAY_TERRITORY_CLEARED;
  }
  if (conditions.marchingStaminaBonus) {
    decay += conditions.marchingStaminaBonus;
  }
  return {
    ...state,
    exhaustionPoints: Math.max(0, state.exhaustionPoints - decay),
  };
}

/**
 * Increment turn counters for war exhaustion tracking.
 */
export function tickWarExhaustion(state: WarExhaustion, hadLossThisTurn: boolean): WarExhaustion {
  return {
    ...state,
    turnsWithoutLoss: hadLossThisTurn ? 0 : state.turnsWithoutLoss + 1,
  };
}

/**
 * Apply supply deficit penalties for a faction at end of turn.
 * - Spreads morale loss across living units proportional to deficit
 * - Accumulates war exhaustion from sustained deficit
 * - Supply attrition: units take HP damage proportional to deficit
 *
 * Called from both live play (GameSession) and batch simulation (warEcologySimulation).
 */
export function applySupplyDeficitPenalties(
  state: GameState,
  factionId: FactionId,
  registry: RulesRegistry,
): GameState {
  const faction = state.factions.get(factionId);
  if (!faction) return state;

  // When no cities exist, skip supply penalties entirely.
  // This allows the starting units (settler + military) to explore
  // for a good city site without dying from supply starvation.
  if (faction.cityIds.length === 0) return state;

  const economy = deriveResourceIncome(state, factionId, registry);
  const supplyDeficit = getSupplyDeficit(economy);
  if (supplyDeficit <= 0) return state;

  // 1. Spread morale penalty across living units
  const livingUnitIds: UnitId[] = [];
  for (const [id, unit] of state.units) {
    if (unit.factionId === factionId && unit.hp > 0) {
      livingUnitIds.push(id as UnitId);
    }
  }

  if (livingUnitIds.length === 0) return state;

  const moraleLossPerUnit = supplyDeficit / Math.max(1, livingUnitIds.length);
  const unitsWithPenalty = new Map(state.units);
  for (const unitId of livingUnitIds) {
    const unit = unitsWithPenalty.get(unitId);
    if (!unit) continue;
    const newMorale = applyMoraleLoss(unit, moraleLossPerUnit);
    unitsWithPenalty.set(unitId, { ...unit, morale: newMorale, routed: unit.routed });
  }
  state = { ...state, units: unitsWithPenalty };

  // 2. Supply attrition: targeted 50% strikes against random units
  const strikes = Math.floor(supplyDeficit);
  if (strikes > 0) {
    const shuffled = rngShuffle(state.rngState, livingUnitIds);
    const targets = shuffled.slice(0, Math.min(strikes, shuffled.length));
    const unitsWithAttrition = new Map(state.units);
    const unitsToRemove: UnitId[] = [];
    for (const unitId of targets) {
      const unit = unitsWithAttrition.get(unitId);
      if (!unit) continue;
      const dmg = Math.floor(unit.maxHp * 0.5);
      const newHp = Math.max(0, unit.hp - dmg);
      if (newHp <= 0) {
        unitsToRemove.push(unitId);
      } else {
        unitsWithAttrition.set(unitId, { ...unit, hp: newHp });
      }
    }
    for (const unitId of unitsToRemove) {
      unitsWithAttrition.delete(unitId);
    }
    state = { ...state, units: unitsWithAttrition };
  }

  // 3. Accumulate war exhaustion from supply deficit
  let weFromSupply = state.warExhaustion.get(factionId);
  if (!weFromSupply) {
    weFromSupply = { factionId, exhaustionPoints: 0, turnsWithoutLoss: 0 };
  }
  const supplyWE = addExhaustion(weFromSupply, supplyDeficit * EXHAUSTION_CONFIG.SUPPLY_DEFICIT_PER_POINT);
  const weMap = new Map(state.warExhaustion);
  weMap.set(factionId, supplyWE);
  state = { ...state, warExhaustion: weMap };

  return state;
}
