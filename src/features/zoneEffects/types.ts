// Zone Effect types
//
// Zone effects are map-level effects that occupy one or more hexes for one or
// more rounds. They are the canonical primitive for new T3 mechanics:
//   - Maelstrom (Tidal Warfare T3): radius-3 (foreign) or radius-5 (native),
//     3 or 5 turns, damages non-owner units, slows movement.
//   - Toxic Bloom (Venomcraft T3): single-hex (radius 0), 3 turns
//     (foreign) or permanent (native), 2 dmg/turn to non-owner units.
//
// Design notes:
//   - Effects are keyed by id, not by hex; one hex may host multiple effects
//     of the same or different types (stacking).
//   - Damage is applied to UNITS, not to factions — the per-faction-turn pass
//     ticks damage for units whose hex is covered.
//   - turnsRemaining === -1 means permanent (used by native Toxic Bloom).
//   - Friendly fire is OFF: damagePerTurn applies to units whose factionId !==
//     ownerFactionId. Visibility is universal (zones are always shown, even
//     through fog of war).

import type { ZoneEffectId, FactionId, HexCoord } from '../../types.js';

export type ZoneEffectType = 'maelstrom' | 'toxic_bloom';

export interface ZoneEffect {
  id: ZoneEffectId;
  type: ZoneEffectType;
  center: HexCoord;
  /** Hexes within `hexDistance(hex, center) <= radius` are affected. 0 = single hex. */
  radius: number;
  ownerFactionId: FactionId;
  /** Damage dealt to each non-owner unit on a covered hex at the start of that unit's faction turn. */
  damagePerTurn: number;
  /** Extra movement cost to enter a covered hex (non-owner units). 0 = no penalty. */
  movementPenalty: number;
  /** Turns left until expiry. -1 means permanent. Decremented once per round. */
  turnsRemaining: number;
  /** Round when this effect was created (for telemetry). */
  createdRound: number;
}
