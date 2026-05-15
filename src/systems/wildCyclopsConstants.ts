import type { FactionId } from '../types.js';

/** Faction ID for the wild cyclops — not a real faction (no economy, no cities, no victory). */
export const WILD_CYCLOPS_FACTION_ID = 'wild_cyclops' as FactionId;

export const CYCLOPS_SPAWN_CHANCE = 0.25;

export const CYCLOPS_REGEN_PER_ROUND = 2;

export function isWildFaction(factionId: FactionId): boolean {
  return factionId === WILD_CYCLOPS_FACTION_ID;
}
