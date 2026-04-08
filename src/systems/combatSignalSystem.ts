// Combat Signal System - War Engine v2
// Collects combat signals from battle context and applies them as capability gains
// Replaces the hardcoded applyCombatPressure with a data-driven signal approach

import type { GameState } from '../game/types.js';
import type { TerrainDef } from '../data/registry/types.js';
import type { FactionId } from '../types.js';
import { addCapabilityProgress } from './capabilitySystem.js';

export interface CombatSignalMapping {
  signal: string;
  domain: string;
  amount: number;
}

// Signal → capability domain mappings
// Each combat can produce multiple signals, each granting capability progress
const SIGNAL_CAPABILITY_MAP: CombatSignalMapping[] = [
  { signal: 'forest_combat',        domain: 'woodcraft',          amount: 1.5 },
  { signal: 'forest_combat',        domain: 'stealth',            amount: 0.5 },
  { signal: 'hill_combat',          domain: 'hill_fighting',      amount: 1.5 },
  { signal: 'hill_combat',          domain: 'fortification',      amount: 0.5 },
  { signal: 'plains_combat',        domain: 'charge',             amount: 1.0 },
  { signal: 'river_combat',         domain: 'navigation',         amount: 1.5 },
  { signal: 'river_combat',         domain: 'seafaring',          amount: 0.5 },
  { signal: 'mounted_charge',      domain: 'charge',             amount: 2.0 },
  { signal: 'ranged_engagement',    domain: 'woodcraft',          amount: 1.0 },
  { signal: 'anti_cavalry_tactics', domain: 'formation_warfare',  amount: 2.0 },
  { signal: 'shock_combat',         domain: 'formation_warfare',  amount: 1.5 },
  { signal: 'poison_combat',        domain: 'poisoncraft',        amount: 1.5 },
  { signal: 'ambush_combat',        domain: 'stealth',            amount: 2.0 },
];

/**
 * Collect combat signals from battle context.
 * Signals describe what kind of combat occurred for capability feedback.
 */
export function collectCombatSignals(
  attackerTerrain: TerrainDef | undefined,
  defenderTerrain: TerrainDef | undefined,
  attackerRole: string,
  attackerWeaponTags: string[],
  defenderMovementClass: string,
  attackerTags: string[]
): Set<string> {
  const signals = new Set<string>();

  // Terrain-based signals
  const attackerTerrainId = attackerTerrain?.id ?? '';
  const defenderTerrainId = defenderTerrain?.id ?? '';

  if (attackerTerrainId === 'forest' || defenderTerrainId === 'forest') {
    signals.add('forest_combat');
  }
  if (attackerTerrainId === 'hill' || defenderTerrainId === 'hill') {
    signals.add('hill_combat');
  }
  if (attackerTerrainId === 'plains' || defenderTerrainId === 'plains') {
    signals.add('plains_combat');
  }
  if (attackerTerrainId === 'river' || defenderTerrainId === 'river' || attackerTerrainId === 'coast' || defenderTerrainId === 'coast') {
    signals.add('river_combat');
  }

  // Role-based signals
  if (attackerRole === 'mounted') {
    signals.add('mounted_charge');
  }

  // Weapon-based signals
  if (attackerWeaponTags.includes('ranged')) {
    signals.add('ranged_engagement');
  }

  // Anti-cavalry: spear vs cavalry
  if (attackerWeaponTags.includes('spear') && defenderMovementClass === 'cavalry') {
    signals.add('anti_cavalry_tactics');
  }

  // Tag-based signals
  if (attackerTags.includes('shock')) {
    signals.add('shock_combat');
  }
  if (attackerTags.includes('poison')) {
    signals.add('poison_combat');
  }

  // Ambush: forest + ranged
  if (
    (attackerTerrainId === 'forest' || defenderTerrainId === 'forest') &&
    attackerRole === 'ranged'
  ) {
    signals.add('ambush_combat');
  }

  return signals;
}

/**
 * Apply combat signals as capability progress for a faction.
 * Each signal maps to one or more capability domain gains.
 */
export function applyCombatSignals(
  state: GameState,
  factionId: FactionId,
  signals: Set<string>
): GameState {
  let current = state;

  for (const signal of signals) {
    const mappings = SIGNAL_CAPABILITY_MAP.filter((m) => m.signal === signal);
    for (const mapping of mappings) {
      current = addCapabilityProgress(
        current,
        factionId,
        mapping.domain,
        mapping.amount,
        'combat',
        `${signal} experience`
      );
    }
  }

  return current;
}
