// Zone of Control System
// Enemy units exert ZoC on adjacent hexes: +1 movement cost, forced stop, flanking bonuses
import { getDirectionIndex, getNeighbors, getOppositeDirection } from '../core/grid.js';
import { getUnitAtHex } from './occupancySystem.js';
/**
 * Get all enemy units adjacent to a hex that exert Zone of Control.
 */
export function getZoCBlockers(hex, movingFactionId, state) {
    const neighbors = getNeighbors(hex);
    const blockers = [];
    for (const neighborHex of neighbors) {
        const unitId = getUnitAtHex(state, neighborHex);
        if (unitId) {
            const unit = state.units.get(unitId);
            if (unit && unit.factionId !== movingFactionId && unit.hp > 0 && !unit.routed) {
                blockers.push(unit);
            }
        }
    }
    return blockers;
}
/**
 * Extended ZoC check that includes aura projection from fortified units.
 * Fortified enemy units project ZoC from all 6 adjacent hexes.
 * Field fort improvements project uncancellable ZoC — no unit can ignore it.
 */
export function getZoCBlockersWithAura(hex, movingFactionId, state, doctrine) {
    const blockers = getZoCBlockers(hex, movingFactionId, state);
    let fortZoC = false;
    // Hill-dug-in units project ZoC aura (doctrine-gated)
    if (doctrine?.zoCAuraEnabled) {
        const neighbors = getNeighbors(hex);
        for (const neighborHex of neighbors) {
            const unitId = getUnitAtHex(state, neighborHex);
            if (unitId) {
                const unit = state.units.get(unitId);
                if (unit && unit.factionId !== movingFactionId && unit.hp > 0 && !unit.routed && unit.hillDugIn) {
                    if (!blockers.find(b => b.id === unit.id)) {
                        blockers.push(unit);
                    }
                }
            }
        }
    }
    // Field fort improvements project uncancellable ZoC — even mounted units can't ignore it
    const neighbors = getNeighbors(hex);
    for (const neighborHex of neighbors) {
        // Check if any hex adjacent to this one has a fortification improvement
        for (const [, improvement] of state.improvements) {
            if (improvement.position.q === neighborHex.q && improvement.position.r === neighborHex.r) {
                if (improvement.type === 'fortification') {
                    fortZoC = true;
                    break;
                }
            }
        }
        if (fortZoC)
            break;
    }
    return { blockers, fortZoC };
}
/**
 * Calculate ZoC movement penalty for entering a hex.
 * Returns 0 if no enemy ZoC, 1 if enemy ZoC present.
 * Cavalry ignores ZoC movement cost, EXCEPT from field forts (uncancellable).
 */
export function getZoCMovementCost(hex, movingUnit, state, doctrine) {
    const { blockers, fortZoC } = getZoCBlockersWithAura(hex, movingUnit.factionId, state, doctrine);
    // Fort ZoC cannot be ignored by any unit type
    if (fortZoC)
        return 1;
    // Mounted units ignore normal unit ZoC
    if (isMounted(movingUnit, state) || canIgnoreZoCWithHitAndRun(movingUnit, state, doctrine)) {
        return 0;
    }
    return blockers.length > 0 ? 1 : 0;
}
export function isHexInEnemyZoC(hex, movingUnit, state, doctrine) {
    return getZoCMovementCost(hex, movingUnit, state, doctrine) > 0;
}
export function entersEnemyZoC(originHex, targetHex, movingUnit, state, doctrine) {
    // Check if target hex has fort ZoC (uncancellable by mounted units)
    const { fortZoC } = getZoCBlockersWithAura(targetHex, movingUnit.factionId, state, doctrine);
    // Mounted units ignore normal unit ZoC
    if (isMounted(movingUnit, state) || canIgnoreZoCWithHitAndRun(movingUnit, state, doctrine)) {
        // But cannot ignore fort ZoC
        if (fortZoC) {
            return !isOnFortAtHex(state, originHex); // already in fort = no ZoC entry
        }
        return false;
    }
    return !isHexInEnemyZoC(originHex, movingUnit, state, doctrine) && isHexInEnemyZoC(targetHex, movingUnit, state, doctrine);
}
function isOnFortAtHex(gameState, pos) {
    for (const [, improvement] of gameState.improvements) {
        if (improvement.position.q === pos.q && improvement.position.r === pos.r) {
            return improvement.type === 'fortification';
        }
    }
    return false;
}
/**
 * Check if a unit is cavalry (based on prototype chassis).
 * @deprecated Use isMounted instead for broader mounted unit support
 */
function isCavalry(unit, state) {
    return isMounted(unit, state);
}
/**
 * Check if a unit is mounted (cavalry, camel, heavy cavalry, or any unit with mounted tags).
 * Mounted units ignore Zone of Control.
 */
function isMounted(unit, state) {
    const prototype = state.prototypes.get(unit.prototypeId);
    if (!prototype)
        return false;
    // Check by chassis ID
    const chassis = prototype.chassisId;
    if (chassis === 'cavalry_frame' || chassis === 'camel_frame' || chassis === 'heavy_cavalry')
        return true;
    // Check by tags (catches future variants)
    const tags = prototype.tags ?? [];
    if (tags.includes('cavalry') || tags.includes('mounted'))
        return true;
    return false;
}
function canIgnoreZoCWithHitAndRun(unit, state, doctrine) {
    if (!doctrine?.hitrunZocIgnoreEnabled) {
        return false;
    }
    const prototype = state.prototypes.get(unit.prototypeId);
    if (!prototype)
        return false;
    const tags = prototype.tags ?? [];
    return tags.includes('skirmish') || tags.includes('stealth');
}
/**
 * Calculate flanking bonus for an attacker.
 * +15% damage per allied unit adjacent to the defender (excluding the attacker).
 */
export function calculateFlankingBonus(attacker, defender, state) {
    const defenderNeighbors = getNeighbors(defender.position);
    let flankingAllies = 0;
    for (const hex of defenderNeighbors) {
        const unitId = getUnitAtHex(state, hex);
        if (unitId) {
            const neighbor = state.units.get(unitId);
            if (neighbor &&
                neighbor.factionId === attacker.factionId &&
                neighbor.id !== attacker.id &&
                neighbor.hp > 0) {
                flankingAllies++;
            }
        }
    }
    return flankingAllies * 0.15;
}
export function isRearAttack(attacker, defender) {
    if (defender.routed) {
        return false;
    }
    const attackDirection = getDirectionIndex(defender.position, attacker.position);
    if (attackDirection === null) {
        return false;
    }
    const rearCenter = getOppositeDirection(defender.facing);
    const rearLeft = (rearCenter + 7) % 8;
    const rearRight = (rearCenter + 1) % 8;
    return attackDirection === rearCenter || attackDirection === rearLeft || attackDirection === rearRight;
}
