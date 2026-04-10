// src/systems/captureSystem.ts
// Slaver unit's capture mechanic - captures enemy units instead of killing them
import { rngNextFloat } from '../core/rng.js';
/**
 * Check if a prototype has capture capability (has a component with captureChance)
 */
export function hasCaptureAbility(prototype, registry) {
    return getCaptureParams(prototype, registry) !== null;
}
/**
 * Get capture parameters from the first capture-capable component
 */
export function getCaptureParams(prototype, registry) {
    for (const componentId of prototype.componentIds) {
        const component = registry.getComponent(componentId);
        if (component?.captureChance !== undefined) {
            return {
                chance: component.captureChance,
                cooldown: component.captureCooldown ?? 3,
                hpFraction: component.captureHpFraction ?? 0.25,
            };
        }
    }
    return null;
}
/**
 * Get the remaining cooldown for a unit's capture ability
 */
export function getCaptureCooldownRemaining(unit, currentRound, cooldown) {
    const captureAttempts = unit.history.filter((entry) => entry.type === 'capture_attempt');
    if (captureAttempts.length === 0) {
        return 0;
    }
    // Find the most recent capture attempt
    const mostRecent = captureAttempts[captureAttempts.length - 1];
    const attemptRound = mostRecent.details.round;
    if (attemptRound === undefined) {
        return 0;
    }
    const elapsed = currentRound - attemptRound;
    const remaining = cooldown - elapsed;
    return Math.max(0, remaining);
}
/**
 * Check if a unit is on capture cooldown.
 * Note: Requires cooldown parameter since it's component-specific.
 * Use getCaptureCooldownRemaining for full cooldown checking with registry access.
 */
export function isOnCaptureCooldownWithCooldown(unit, currentRound, cooldown) {
    return getCaptureCooldownRemaining(unit, currentRound, cooldown) > 0;
}
/**
 * Check if a unit is on capture cooldown (legacy/placeholder).
 * This overload requires explicit cooldown value.
 * @deprecated Use isOnCaptureCooldownWithCooldown or getCaptureCooldownRemaining instead.
 */
export function isOnCaptureCooldown(unit, currentRoundOrCooldown, cooldown) {
    // If called with two args (currentRound, cooldown), use them directly
    if (currentRoundOrCooldown !== undefined && cooldown !== undefined) {
        return isOnCaptureCooldownWithCooldown(unit, currentRoundOrCooldown, cooldown);
    }
    // Otherwise, can't determine without registry - return false
    // Caller should use getCaptureCooldownRemaining with proper parameters
    return false;
}
/**
 * Attempt to capture a defeated enemy unit.
 * Returns { captured: true, state } if capture succeeded, or { captured: false, state } if failed/destroyed.
 * @param greedyAbility - Optional signature ability with greedy capture params (used when unit has no capture component)
 */
export function attemptCapture(state, attacker, defender, registry, greedyAbility, rngState) {
    const attackerPrototype = state.prototypes.get(attacker.prototypeId);
    if (!attackerPrototype) {
        return { captured: false, state };
    }
    let captureParams = getCaptureParams(attackerPrototype, registry);
    // If no component-based capture, check for greedy passive capture
    if (!captureParams && greedyAbility) {
        const chance = greedyAbility.greedyCaptureChance ?? 0.5;
        const cooldown = greedyAbility.greedyCaptureCooldown ?? 4;
        const hpFraction = greedyAbility.greedyCaptureHpFraction ?? 0.4;
        captureParams = { chance, cooldown, hpFraction };
    }
    if (!captureParams) {
        return { captured: false, state };
    }
    const { chance, cooldown, hpFraction } = captureParams;
    // Check cooldown - look at unit.history for 'capture_attempt' entries
    const captureAttempts = attacker.history.filter((entry) => entry.type === 'capture_attempt');
    if (captureAttempts.length > 0) {
        const mostRecent = captureAttempts[captureAttempts.length - 1];
        const attemptRound = mostRecent.details.round;
        if (attemptRound !== undefined) {
            const elapsed = state.round - attemptRound;
            if (elapsed < cooldown) {
                // Still on cooldown, unit is destroyed instead
                return { captured: false, state: destroyUnit(state, defender) };
            }
        }
    }
    // Roll for capture
    const roll = rngState ? rngNextFloat(rngState) : Math.random();
    const captureSucceeded = roll < chance;
    if (!captureSucceeded) {
        // Capture failed - normal destruction
        return { captured: false, state: destroyUnit(state, defender) };
    }
    // Capture succeeded!
    // 1. Change defender's factionId to attacker's faction
    // 2. Set HP to hpFraction of maxHp
    // 3. Reset morale to 50
    // 4. Set routed = false
    // 5. Reset veteranLevel to 'green'
    // 6. Add defender's unitId to new faction's unitIds
    // 7. Remove from old faction's unitIds
    // 8. Add history entries to both attacker and defender
    const attackerFactionId = attacker.factionId;
    const defenderFactionId = defender.factionId;
    // Create captured defender unit
    const capturedDefender = {
        ...defender,
        factionId: attackerFactionId,
        hp: Math.max(1, Math.floor(defender.maxHp * hpFraction)),
        morale: 50,
        routed: false,
        veteranLevel: 'green',
        history: [
            ...defender.history,
            {
                type: 'captured',
                timestamp: Date.now(),
                details: {
                    capturedBy: attacker.id,
                    originalFaction: defenderFactionId,
                    capturingFaction: attackerFactionId,
                    round: state.round,
                },
            },
        ],
    };
    // Create attacker with capture history
    const updatedAttacker = {
        ...attacker,
        history: [
            ...attacker.history,
            {
                type: 'capture_attempt',
                timestamp: Date.now(),
                details: {
                    targetId: defender.id,
                    targetFaction: defenderFactionId,
                    success: true,
                    round: state.round,
                },
            },
        ],
    };
    // Update units map
    const newUnits = new Map(state.units);
    newUnits.set(defender.id, capturedDefender);
    newUnits.set(attacker.id, updatedAttacker);
    // Update factions
    const defenderFaction = state.factions.get(defenderFactionId);
    const attackerFaction = state.factions.get(attackerFactionId);
    let newFactions = new Map(state.factions);
    if (defenderFaction) {
        // Remove defender from old faction's unitIds
        const updatedDefenderFaction = {
            ...defenderFaction,
            unitIds: defenderFaction.unitIds.filter((id) => id !== defender.id),
        };
        newFactions.set(defenderFactionId, updatedDefenderFaction);
    }
    if (attackerFaction) {
        // Add defender to attacker's faction's unitIds
        const updatedAttackerFaction = {
            ...attackerFaction,
            unitIds: [...attackerFaction.unitIds, defender.id],
        };
        newFactions.set(attackerFactionId, updatedAttackerFaction);
    }
    const newState = {
        ...state,
        units: newUnits,
        factions: newFactions,
    };
    return { captured: true, state: newState };
}
/**
 * Destroy a unit (remove from game state) - used when capture fails
 */
function destroyUnit(state, unit) {
    const faction = state.factions.get(unit.factionId);
    if (!faction) {
        // No faction to update, just remove from units
        const newUnits = new Map(state.units);
        newUnits.delete(unit.id);
        return { ...state, units: newUnits };
    }
    // Remove from faction's unitIds
    const newFaction = {
        ...faction,
        unitIds: faction.unitIds.filter((id) => id !== unit.id),
    };
    const newFactions = new Map(state.factions);
    newFactions.set(unit.factionId, newFaction);
    // Remove from units
    const newUnits = new Map(state.units);
    newUnits.delete(unit.id);
    return {
        ...state,
        units: newUnits,
        factions: newFactions,
    };
}
/**
 * Attempt non-combat capture: convert an adjacent enemy unit without fighting.
 * Used by Slave Galley and other pirate capture units.
 * Returns updated state and whether capture succeeded.
 */
export function attemptNonCombatCapture(state, captorId, targetId, registry, captureChance, hpFraction, cooldown, rngState) {
    const captor = state.units.get(captorId);
    const target = state.units.get(targetId);
    if (!captor || !target)
        return { state, captured: false };
    if (captor.hp <= 0 || target.hp <= 0)
        return { state, captured: false };
    if (captor.factionId === target.factionId)
        return { state, captured: false };
    // Check cooldown on captor
    const captureAttempts = captor.history.filter((e) => e.type === 'capture_attempt');
    if (captureAttempts.length > 0) {
        const mostRecent = captureAttempts[captureAttempts.length - 1];
        const attemptRound = mostRecent.details.round;
        if (attemptRound !== undefined && state.round - attemptRound < cooldown) {
            return { state, captured: false }; // On cooldown
        }
    }
    // Roll for capture
    if ((rngState ? rngNextFloat(rngState) : Math.random()) >= captureChance) {
        return { state, captured: false }; // Failed
    }
    // Capture succeeded — convert target to captor's faction
    const newHp = Math.max(1, Math.floor(target.maxHp * hpFraction));
    const capturedTarget = {
        ...target,
        factionId: captor.factionId,
        hp: newHp,
        morale: 50,
        routed: false,
        veteranLevel: 'green',
        history: [
            ...target.history,
            {
                type: 'captured',
                timestamp: Date.now(),
                details: {
                    capturedBy: captorId,
                    originalFaction: target.factionId,
                    capturingFaction: captor.factionId,
                    round: state.round,
                    nonCombat: true,
                },
            },
        ],
    };
    const updatedCaptor = {
        ...captor,
        attacksRemaining: 0, // Non-combat capture costs the action
        history: [
            ...captor.history,
            {
                type: 'capture_attempt',
                timestamp: Date.now(),
                details: {
                    targetId,
                    targetFaction: target.factionId,
                    success: true,
                    round: state.round,
                    nonCombat: true,
                },
            },
        ],
    };
    // Update units
    const newUnits = new Map(state.units);
    newUnits.set(targetId, capturedTarget);
    newUnits.set(captorId, updatedCaptor);
    // Update factions
    const newFactions = new Map(state.factions);
    const targetFaction = state.factions.get(target.factionId);
    const captorFaction = state.factions.get(captor.factionId);
    if (targetFaction) {
        newFactions.set(target.factionId, {
            ...targetFaction,
            unitIds: targetFaction.unitIds.filter((id) => id !== targetId),
        });
    }
    if (captorFaction) {
        newFactions.set(captor.factionId, {
            ...captorFaction,
            unitIds: [...captorFaction.unitIds, targetId],
        });
    }
    return {
        state: { ...state, units: newUnits, factions: newFactions },
        captured: true,
    };
}
