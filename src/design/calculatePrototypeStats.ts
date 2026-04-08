// Calculate derived unit stats from chassis and components

import type { ChassisDef, ComponentDef } from '../data/registry/types.js';
import type { UnitStats } from '../features/prototypes/types.js';

/**
 * Calculate derived unit stats by summing chassis base stats
 * and component bonuses
 */
export function calculatePrototypeStats(
  chassis: ChassisDef,
  components: ComponentDef[]
): UnitStats {
  // Initialize with chassis base stats
  const stats: UnitStats = {
    hp: chassis.baseHp,
    attack: chassis.baseAttack,
    defense: chassis.baseDefense,
    moves: chassis.baseMoves,
    range: chassis.baseRange ?? 1,
    role: chassis.role ?? 'melee',
  };

  // Add bonuses from each component
  for (const component of components) {
    stats.hp += component.hpBonus ?? 0;
    stats.attack += component.attackBonus ?? 0;
    stats.defense += component.defenseBonus ?? 0;
    stats.moves += component.movesBonus ?? 0;
    stats.range += component.rangeBonus ?? 0;
  }

  // Ensure minimum values
  stats.hp = Math.max(1, stats.hp);
  stats.attack = Math.max(0, stats.attack);
  stats.defense = Math.max(0, stats.defense);
  stats.moves = Math.max(1, stats.moves);
  stats.range = Math.max(1, stats.range);

  return stats;
}
