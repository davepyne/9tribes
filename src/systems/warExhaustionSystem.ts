// War Exhaustion System
// Faction-level mechanic: prolonged combat and losses accumulate exhaustion,
// creating production pressure and strategic incentive to stop fighting.

import type { WarExhaustion } from '../features/factions/types.js';
import type { GameState, UnitId } from '../game/types.js';
import type { FactionId } from '../types.js';
import type { RulesRegistry } from '../data/registry/types.js';
import { getSupplyDeficit, deriveResourceIncome } from './economySystem.js';
import { applyMoraleLoss } from './moraleSystem.js';

export const EXHAUSTION_CONFIG = {
  UNIT_KILLED: 0,
  UNIT_LOST: 0,
  CITY_CAPTURED: 0,
  VILLAGE_LOST: 0,
  SUPPLY_DEFICIT_PER_POINT: 0,
  BESIEGED_CITY_PER_TURN: 0,
  CITY_CAPTURED_ATTACKER: 0,
  DECAY_NO_LOSS: 0,
  DECAY_TERRITORY_CLEARED: 0,
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
  return 0;
}

/**
 * Calculate morale penalty to all units from war exhaustion.
 */
export function calculateMoralePenalty(exhaustion: number): number {
  return 0;
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
export const SUPPLY_ATTRITION_HP_PER_DEFICIT = 0.5;

export function applySupplyDeficitPenalties(
  state: GameState,
  factionId: FactionId,
  registry: RulesRegistry,
): GameState {
  const faction = state.factions.get(factionId);
  if (!faction) return state;

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

  // 2. Supply attrition: units lose HP proportional to deficit
  const hpLossPerUnit = Math.min(
    SUPPLY_ATTRITION_HP_PER_DEFICIT * supplyDeficit / Math.max(1, livingUnitIds.length),
    2,
  );
  if (hpLossPerUnit >= 0.1) {
    const unitsWithAttrition = new Map(state.units);
    const unitsToRemove: UnitId[] = [];
    for (const unitId of livingUnitIds) {
      const unit = unitsWithAttrition.get(unitId);
      if (!unit) continue;
      const newHp = Math.max(0, unit.hp - hpLossPerUnit);
      if (newHp <= 0) {
        unitsToRemove.push(unitId);
      } else {
        unitsWithAttrition.set(unitId, { ...unit, hp: newHp });
      }
    }
    // Remove units that died from attrition
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
