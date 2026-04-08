// XP System - Phase 7 MVP
// Handles XP gain from combat and promotion thresholds

import type { Unit } from '../features/units/types.js';
import type { VeteranLevel } from '../core/enums.js';
import type { RulesRegistry } from '../data/registry/types.js';

// XP configuration constants
export const XP_CONFIG = {
  COMBAT_PARTICIPATION: 5,
  ENEMY_KILLED_BONUS: 15,
  SURVIVED_BONUS: 3,
};

// Veteran level progression order
const VETERAN_LEVEL_ORDER: VeteranLevel[] = ['green', 'seasoned', 'veteran', 'elite'];

/**
 * Award XP to a unit after combat.
 * Returns a new Unit object with updated XP (immutable).
 */
export function awardCombatXP(
  unit: Unit,
  killedEnemy: boolean,
  survived: boolean
): Unit {
  let xpGained = XP_CONFIG.COMBAT_PARTICIPATION;

  if (killedEnemy) {
    xpGained += XP_CONFIG.ENEMY_KILLED_BONUS;
  }

  if (survived) {
    xpGained += XP_CONFIG.SURVIVED_BONUS;
  }

  return {
    ...unit,
    xp: unit.xp + xpGained,
  };
}

/**
 * Get the next veteran level in the progression.
 * Returns null if already at max level.
 */
export function getNextVeteranLevel(
  currentLevel: VeteranLevel
): VeteranLevel | null {
  const currentIndex = VETERAN_LEVEL_ORDER.indexOf(currentLevel);
  if (currentIndex === -1 || currentIndex >= VETERAN_LEVEL_ORDER.length - 1) {
    return null;
  }
  return VETERAN_LEVEL_ORDER[currentIndex + 1];
}

/**
 * Get XP needed for next level.
 * Returns null if already at max level.
 */
export function getXPForNextLevel(
  currentLevel: VeteranLevel,
  registry: RulesRegistry
): number | null {
  const nextLevel = getNextVeteranLevel(currentLevel);
  if (nextLevel === null) {
    return null;
  }

  const nextLevelDef = registry.getVeteranLevel(nextLevel);
  return nextLevelDef?.xpThreshold ?? null;
}

/**
 * Check if a unit can promote to the next veteran level.
 * Returns false if already at max level or XP is insufficient.
 */
export function canPromote(
  unit: Unit,
  registry: RulesRegistry
): boolean {
  const xpNeeded = getXPForNextLevel(unit.veteranLevel, registry);
  
  if (xpNeeded === null) {
    // Already at max level
    return false;
  }

  return unit.xp >= xpNeeded;
}

/**
 * Promote a unit to the next veteran level.
 * Returns a new Unit object with updated veteran level (immutable).
 * Returns null if already at max level.
 */
export function promoteUnit(
  unit: Unit,
  registry: RulesRegistry
): Unit | null {
  const nextLevel = getNextVeteranLevel(unit.veteranLevel);
  
  if (nextLevel === null) {
    return null;
  }

  return {
    ...unit,
    veteranLevel: nextLevel,
  };
}
