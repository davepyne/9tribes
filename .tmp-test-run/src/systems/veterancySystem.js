// Veterancy System - Phase 7 MVP
// Handles promotion logic and applies veteran level bonuses
import { canPromote, promoteUnit } from './xpSystem.js';
/**
 * Try to promote a unit to the next veteran level.
 * Returns the unit unchanged if cannot promote, or promoted unit if eligible.
 */
export function tryPromoteUnit(unit, registry) {
    if (!canPromote(unit, registry)) {
        return unit;
    }
    const promoted = promoteUnit(unit, registry);
    return promoted ?? unit;
}
/**
 * Get the HP bonus for a veteran level.
 * Returns 0 if level not found or no HP bonus defined.
 */
export function getVeteranHpBonus(level, registry) {
    const levelDef = registry.getVeteranLevel(level);
    return levelDef?.hpBonus ?? 0;
}
/**
 * Get all stat bonuses for a veteran level.
 */
export function getVeteranStatBonuses(level, registry) {
    const levelDef = registry.getVeteranLevel(level);
    return {
        attackBonus: levelDef?.attackBonus ?? 0,
        defenseBonus: levelDef?.defenseBonus ?? 0,
        hpBonus: levelDef?.hpBonus ?? 0,
    };
}
/**
 * Calculate max HP including veteran bonus.
 */
export function calculateMaxHp(baseHp, veteranLevel, registry) {
    const hpBonus = getVeteranHpBonus(veteranLevel, registry);
    return baseHp + hpBonus;
}
