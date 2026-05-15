// Zone Effect System — lifecycle and query helpers for map-level zone
// effects (Maelstrom, Toxic Bloom, …). See src/features/zoneEffects/types.ts
// for the data shape and the design notes.
//
// This module is intentionally a thin orchestration layer. The actual
// mechanic that CREATES a zone effect (Maelstrom declaration, Toxic Bloom
// formation) lives in the mechanic's own module and calls
// `addZoneEffect(state, effect)`. The mechanic that CONSUMES the effect
// (damage on faction turn start, movement cost penalty) reads via the
// query helpers below.

import type { GameState, ZoneEffect, ZoneEffectId, HexCoord, FactionId } from '../game/types.js';
import type { ZoneEffectType } from '../features/zoneEffects/types.js';
import { hexDistance } from '../core/grid.js';
export { ZONE_EFFECT_LABEL, type ZoneEffectType } from '../features/zoneEffects/types.js';

/**
 * All zone effects whose coverage includes the given hex.
 *
 * A zone effect covers every hex within `hexDistance(hex, effect.center) <=
 * effect.radius`. radius=0 means the center hex only.
 *
 * Time complexity is O(n) in the number of active effects, which is expected
 * to stay small (single-digit zones in most games). If that ever changes,
 * swap to an `effects-by-hex` index on GameState.
 */
export function getZoneEffectsAtHex(state: GameState, hex: HexCoord): ZoneEffect[] {
  const result: ZoneEffect[] = [];
  for (const effect of state.zoneEffects.values()) {
    if (hexDistance(hex, effect.center) <= effect.radius) {
      result.push(effect);
    }
  }
  return result;
}

/**
 * Sum of damagePerTurn from every active zone effect on the hex that the
 * given faction is NOT the owner of (no friendly fire). Multiple effects on
 * the same hex stack additively — two overlapping Toxic Blooms = 4 dmg.
 */
export function getZoneEffectDamageOnHex(
  state: GameState,
  hex: HexCoord,
  factionId: FactionId,
): number {
  let total = 0;
  for (const effect of state.zoneEffects.values()) {
    if (effect.ownerFactionId === factionId) continue;
    if (hexDistance(hex, effect.center) > effect.radius) continue;
    total += effect.damagePerTurn;
  }
  return total;
}

/**
 * Sum of movementPenalty from every active zone effect on the hex that the
 * given faction is NOT the owner of. Stacks additively.
 */
export function getZoneEffectMovementPenalty(
  state: GameState,
  hex: HexCoord,
  factionId: FactionId,
): number {
  let total = 0;
  for (const effect of state.zoneEffects.values()) {
    if (effect.ownerFactionId === factionId) continue;
    if (hexDistance(hex, effect.center) > effect.radius) continue;
    total += effect.movementPenalty;
  }
  return total;
}

/**
 * Register a new zone effect.
 *
 * Callers are responsible for choosing the right id (use createZoneEffectId
 * from core/ids.ts), the center/radius, the owner, and the damage / movement
 * / turnsRemaining payload. This function is intentionally dumb — it makes
 * no game-design decisions.
 */
export function addZoneEffect(state: GameState, effect: ZoneEffect): GameState {
  const zoneEffects = new Map(state.zoneEffects);
  zoneEffects.set(effect.id, effect);
  return { ...state, zoneEffects };
}

/**
 * Remove all zone effects matching a type and owner in a single pass.
 */
export function removeZoneEffectsByOwner(
  state: GameState,
  type: ZoneEffectType,
  ownerFactionId: FactionId,
): GameState {
  const next = new Map(state.zoneEffects);
  let removed = false;
  for (const [id, ze] of next) {
    if (ze.type === type && ze.ownerFactionId === ownerFactionId) {
      next.delete(id);
      removed = true;
    }
  }
  return removed ? { ...state, zoneEffects: next } : state;
}

/**
 * Remove a zone effect by id (e.g., manual cleanse, terrain cleared).
 */
export function removeZoneEffect(state: GameState, id: ZoneEffectId): GameState {
  if (!state.zoneEffects.has(id)) return state;
  const zoneEffects = new Map(state.zoneEffects);
  zoneEffects.delete(id);
  return { ...state, zoneEffects };
}

/**
 * Decrement turnsRemaining for every non-permanent effect by 1, and remove
 * any effect whose turnsRemaining drops to 0. Called once per round (from
 * turnSystem.ts on round rollover). Permanent effects (turnsRemaining === -1)
 * are untouched.
 */
export function tickZoneEffectLifetimes(state: GameState): GameState {
  if (state.zoneEffects.size === 0) return state;
  const next = new Map<ZoneEffectId, ZoneEffect>();
  for (const [id, effect] of state.zoneEffects) {
    if (effect.turnsRemaining === -1) {
      next.set(id, effect);
      continue;
    }
    const remaining = effect.turnsRemaining - 1;
    if (remaining <= 0) {
      // expired; drop
      continue;
    }
    next.set(id, { ...effect, turnsRemaining: remaining });
  }
  return { ...state, zoneEffects: next };
}
