// Opportunity Attack System
// When a unit moves away from an adjacent enemy melee unit, that enemy lands a free
// reduced-damage strike. This penalizes disengaging from a protective line and rewards
// defensive positioning (e.g. a spear unit guarding a horseback unit behind it).
import { getNeighbors, hexToKey } from '../core/grid.js';
import { getUnitAtHex } from './occupancySystem.js';
import { getWeaponEffectiveness } from '../data/weaponEffectiveness.js';
import { calculateMoraleLoss } from './moraleSystem.js';
import { getVeteranStatBonus } from './combatSystem.js';
// Opportunity attacks deal 25% of the attacker's scaled attack (no retaliation, no terrain).
// Lower than a regular strike to reflect it's a quick reactive hit, not a full exchange.
const OA_MULTIPLIER = 0.25;
// Opportunity attacks from units standing in a field fort deal 40% — fortified positions
// enable stronger reactive strikes against units trying to slip past.
const OA_FORT_MULTIPLIER = 0.40;
/**
 * Returns true if the unit belongs to a movement class that can disengage freely
 * (cavalry / camel / beast). Mirrors their ZoC movement immunity.
 */
function canDisengageFree(unit, state) {
    const proto = state.prototypes.get(unit.prototypeId);
    if (!proto)
        return false;
    const chassisId = proto.chassisId;
    return chassisId === 'cavalry_frame' || chassisId === 'camel_frame' || chassisId === 'beast_frame';
}
/**
 * Returns true if there is a fortification improvement at the given position.
 */
function isOnFort(gameState, pos) {
    for (const [, improvement] of gameState.improvements) {
        if (improvement.position.q === pos.q && improvement.position.r === pos.r) {
            return improvement.type === 'fortification';
        }
    }
    return false;
}
/**
 * Returns the weapon tags from weapon-slot components on a prototype.
 */
function getWeaponTags(proto, registry) {
    const tags = [];
    for (const componentId of proto.componentIds) {
        const component = registry.getComponent(componentId);
        if (component && component.slotType === 'weapon' && component.tags) {
            tags.push(...component.tags);
        }
    }
    return tags;
}
/**
 * Apply opportunity attacks from melee enemies that the moving unit departed from.
 *
 * Call AFTER moveUnit() has placed the unit at targetHex in the returned state.
 * originHex is the unit's position before the move.
 */
export function applyOpportunityAttacks(gameState, movingUnitId, originHex, targetHex, rulesRegistry) {
    const movingUnit = gameState.units.get(movingUnitId);
    if (!movingUnit || movingUnit.hp <= 0)
        return gameState;
    // Cavalry / camel / beast disengage freely — UNLESS departing from fort ZoC.
    if (canDisengageFree(movingUnit, gameState) && !isOnFort(gameState, originHex))
        return gameState;
    // Routed units are already in flight and receive no additional OA penalty.
    if (movingUnit.routed)
        return gameState;
    // Determine moving unit's movement class for weapon effectiveness lookup.
    const movingUnitProto = gameState.prototypes.get(movingUnit.prototypeId);
    const movingUnitMovementClass = movingUnitProto
        ? (rulesRegistry.getChassis(movingUnitProto.chassisId)?.movementClass ?? 'infantry')
        : 'infantry';
    // Build the set of hex keys still adjacent after the move.
    const stillAdjacentKeys = new Set(getNeighbors(targetHex).map(hexToKey));
    let current = gameState;
    for (const neighborHex of getNeighbors(originHex)) {
        // Skip hexes still adjacent to the new position — unit didn't depart from them.
        if (stillAdjacentKeys.has(hexToKey(neighborHex)))
            continue;
        const opportunistId = getUnitAtHex(current, neighborHex);
        if (!opportunistId)
            continue;
        const opportunist = current.units.get(opportunistId);
        if (!opportunist)
            continue;
        // Must be an enemy, alive, and not routed.
        if (opportunist.factionId === movingUnit.factionId)
            continue;
        if (opportunist.hp <= 0 || opportunist.routed)
            continue;
        // Only melee-role units can snap-attack a disengaging unit.
        const oppProto = current.prototypes.get(opportunist.prototypeId);
        if (!oppProto || oppProto.derivedStats.role !== 'melee')
            continue;
        // Compute opportunity attack damage.
        const veteranBonus = getVeteranStatBonus(rulesRegistry, opportunist.veteranLevel);
        const baseAttack = Math.max(1, Math.round(oppProto.derivedStats.attack * (1 + veteranBonus)));
        const weaponMod = getWeaponEffectiveness(getWeaponTags(oppProto, rulesRegistry), movingUnitMovementClass);
        const onFort = isOnFort(current, opportunist.position);
        const multiplier = onFort ? OA_FORT_MULTIPLIER : OA_MULTIPLIER;
        const damage = Math.max(1, Math.round(baseAttack * (1 + weaponMod) * multiplier));
        // Apply damage and morale loss to the moving unit.
        const targetUnit = current.units.get(movingUnitId);
        if (!targetUnit || targetUnit.hp <= 0)
            break; // destroyed by a prior OA in this loop
        const moraleLoss = calculateMoraleLoss(damage, targetUnit.maxHp, 0);
        const newHp = targetUnit.hp - damage;
        const newMorale = Math.max(0, targetUnit.morale - moraleLoss);
        const destroyed = newHp <= 0;
        const routed = !destroyed && newMorale <= 25;
        const newUnits = new Map(current.units);
        if (destroyed) {
            newUnits.delete(movingUnitId);
            const faction = current.factions.get(targetUnit.factionId);
            if (faction) {
                const newFactions = new Map(current.factions);
                newFactions.set(targetUnit.factionId, {
                    ...faction,
                    unitIds: faction.unitIds.filter(id => id !== movingUnitId),
                });
                current = { ...current, units: newUnits, factions: newFactions };
            }
            else {
                current = { ...current, units: newUnits };
            }
        }
        else {
            newUnits.set(movingUnitId, {
                ...targetUnit,
                hp: newHp,
                morale: newMorale,
                routed: routed || targetUnit.routed,
            });
            current = { ...current, units: newUnits };
        }
    }
    return current;
}
