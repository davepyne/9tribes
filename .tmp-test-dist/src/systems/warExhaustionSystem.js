// War Exhaustion System
// Faction-level mechanic: prolonged combat and losses accumulate exhaustion,
// creating production pressure and strategic incentive to stop fighting.
import { getSupplyDeficit, deriveResourceIncome } from './economySystem.js';
import { applyMoraleLoss } from './moraleSystem.js';
export const EXHAUSTION_CONFIG = {
    UNIT_KILLED: 5,
    UNIT_LOST: 8,
    CITY_CAPTURED: 15,
    VILLAGE_LOST: 3,
    SUPPLY_DEFICIT_PER_POINT: 2,
    BESIEGED_CITY_PER_TURN: 2,
    CITY_CAPTURED_ATTACKER: 5,
    DECAY_NO_LOSS: 4,
    DECAY_TERRITORY_CLEARED: 15,
    VICTORY_OFFSET: 10,
};
/**
 * Create initial war exhaustion state for a faction.
 */
export function createWarExhaustion(factionId) {
    return {
        factionId: factionId,
        exhaustionPoints: 0,
        turnsWithoutLoss: 0,
    };
}
/**
 * Add exhaustion points to a faction.
 */
export function addExhaustion(state, amount) {
    return {
        ...state,
        exhaustionPoints: Math.max(0, state.exhaustionPoints + amount),
    };
}
/**
 * Calculate production penalty from war exhaustion.
 */
export function calculateProductionPenalty(exhaustion) {
    if (exhaustion <= 5)
        return 0;
    if (exhaustion <= 10)
        return 0.10;
    if (exhaustion <= 20)
        return 0.20;
    if (exhaustion <= 35)
        return 0.30;
    if (exhaustion <= 50)
        return 0.40;
    return 0.50;
}
/**
 * Calculate morale penalty to all units from war exhaustion.
 */
export function calculateMoralePenalty(exhaustion) {
    if (exhaustion < 10)
        return 0;
    if (exhaustion <= 20)
        return 2;
    if (exhaustion <= 35)
        return 4;
    if (exhaustion <= 50)
        return 6;
    return 8;
}
/**
 * Apply decay to war exhaustion based on peaceful conditions.
 */
export function applyDecay(state, conditions) {
    let decay = 0;
    if (conditions.noLossTurns >= 3) {
        decay += EXHAUSTION_CONFIG.DECAY_NO_LOSS;
    }
    if (conditions.territoryClear) {
        decay += EXHAUSTION_CONFIG.DECAY_TERRITORY_CLEARED;
    }
    return {
        ...state,
        exhaustionPoints: Math.max(0, state.exhaustionPoints - decay),
    };
}
/**
 * Increment turn counters for war exhaustion tracking.
 */
export function tickWarExhaustion(state, hadLossThisTurn) {
    return {
        ...state,
        turnsWithoutLoss: hadLossThisTurn ? 0 : state.turnsWithoutLoss + 1,
    };
}
/**
 * Apply supply deficit penalties for a faction at end of turn.
 * - Spreads morale loss across living units proportional to deficit
 * - Accumulates war exhaustion from sustained deficit
 *
 * Called from both live play (GameSession) and batch simulation (warEcologySimulation).
 */
export function applySupplyDeficitPenalties(state, factionId, registry) {
    const faction = state.factions.get(factionId);
    if (!faction)
        return state;
    const economy = deriveResourceIncome(state, factionId, registry);
    const supplyDeficit = getSupplyDeficit(economy);
    if (supplyDeficit <= 0)
        return state;
    // 1. Spread morale penalty across living units
    const livingUnitIds = [];
    for (const [id, unit] of state.units) {
        if (unit.factionId === factionId && unit.hp > 0) {
            livingUnitIds.push(id);
        }
    }
    if (livingUnitIds.length === 0)
        return state;
    const moraleLossPerUnit = supplyDeficit / Math.max(1, livingUnitIds.length);
    const unitsWithPenalty = new Map(state.units);
    for (const unitId of livingUnitIds) {
        const unit = unitsWithPenalty.get(unitId);
        if (!unit)
            continue;
        const newMorale = applyMoraleLoss(unit, moraleLossPerUnit);
        unitsWithPenalty.set(unitId, { ...unit, morale: newMorale, routed: unit.routed });
    }
    state = { ...state, units: unitsWithPenalty };
    // 2. Accumulate war exhaustion from supply deficit
    let weFromSupply = state.warExhaustion.get(factionId);
    if (!weFromSupply) {
        // Initialize if missing (shouldn't happen in normal flow, but safety net)
        weFromSupply = { factionId, exhaustionPoints: 0, turnsWithoutLoss: 0 };
    }
    const supplyWE = addExhaustion(weFromSupply, supplyDeficit * EXHAUSTION_CONFIG.SUPPLY_DEFICIT_PER_POINT);
    const weMap = new Map(state.warExhaustion);
    weMap.set(factionId, supplyWE);
    state = { ...state, warExhaustion: weMap };
    return state;
}
