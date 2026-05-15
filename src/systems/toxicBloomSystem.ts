// Toxic Bloom System — Venom T3 mechanic.
//
// A Toxic Bloom is a ZoneEffect (type: 'toxic_bloom', radius: 0) that forms
// on any hex whose 6 neighbors contain 3+ poisoned units. The bloom deals
// 2 dmg/turn to non-owner units standing on it.
//
//   - Foreign Venom-T3 factions spawn Blooms with turnsRemaining: 3.
//   - Native Jungle Clans (nativeDomain === 'venom') spawn permanent Blooms
//     (turnsRemaining: -1) which only the cleanse pass (Druid native T3) or
//     manual removeZoneEffect can clear.
//
// Trigger semantics:
//   - "3+ poisoned units" counts ANY poisoned unit regardless of faction.
//     The trigger is poison density, not alignment.
//   - "Adjacent to" is hexDistance === 1 from the candidate center. The
//     center hex itself does NOT count toward the threshold.
//   - The spawning faction is the Venom-T3 faction with the most poisoned
//     units they own adjacent to the candidate hex. Ties: faction iteration
//     order on state.factions. A Venom-T3 faction must own at least one
//     adjacent poisoned unit to claim the spawn.
//   - Suppression: a candidate hex that already has an active toxic_bloom
//     centered on it does NOT respawn while that bloom is alive.
//
// Detection runs ONCE per round at rollover, immediately after
// tickZoneEffectLifetimes() in both turnSystem.advanceTurn AND the
// warEcology loop. Doing it after the tick lets expired Blooms re-spawn
// the same round if poisoned clusters persist.
//
// Cleansing: Druid Circle (nature_healing native T3) units passively
// cleanse Toxic Blooms they stand on. The cleanse pass runs alongside
// detection at round rollover.

import type { GameState, ZoneEffect } from '../game/types.js';
import type { FactionId, HexCoord, UnitId } from '../types.js';
import { hexDistance, hexToKey, getNeighbors } from '../core/grid.js';
import { createZoneEffectId } from '../core/ids.js';
import { resolveResearchDoctrine } from './capabilityDoctrine.js';
import { addZoneEffect, removeZoneEffect } from './zoneEffectSystem.js';

const TOXIC_BLOOM_DAMAGE_PER_TURN = 2;
const TOXIC_BLOOM_FOREIGN_DURATION = 3;
const TOXIC_BLOOM_THRESHOLD = 3;

/**
 * Scan the map for poisoned-unit clusters and spawn Toxic Blooms for any
 * Venom-T3 faction whose poisoned units form a cluster of 3+ adjacent to
 * an unclaimed center hex. Runs once per round at rollover.
 */
export function detectAndSpawnToxicBlooms(state: GameState): GameState {
  // Build the set of Venom-T3 factions (those eligible to spawn) and their
  // permanent-spawn flags. Iteration order on state.factions is the canonical
  // tiebreak order.
  const venomT3Factions: { factionId: FactionId; permanent: boolean }[] = [];
  for (const [factionId, faction] of state.factions) {
    const research = state.research.get(factionId);
    const doctrine = resolveResearchDoctrine(research, faction);
    if (doctrine.toxicBloomEnabled) {
      venomT3Factions.push({ factionId, permanent: doctrine.toxicBloomPermanent });
    }
  }
  if (venomT3Factions.length === 0) return state;

  // Collect poisoned units (with their owning faction) and the candidate
  // center-hex set: the union of all neighbors of every poisoned unit.
  const poisonedUnits: { factionId: FactionId; position: HexCoord }[] = [];
  for (const unit of state.units.values()) {
    if (unit.hp <= 0) continue;
    if (!unit.poisoned) continue;
    poisonedUnits.push({ factionId: unit.factionId, position: unit.position });
  }
  if (poisonedUnits.length < TOXIC_BLOOM_THRESHOLD) return state;

  const candidateHexes = new Map<string, HexCoord>();
  for (const pu of poisonedUnits) {
    for (const neighbor of getNeighbors(pu.position)) {
      const key = hexToKey(neighbor);
      if (!candidateHexes.has(key)) candidateHexes.set(key, neighbor);
    }
  }

  // Build a set of hex keys that already have an active toxic_bloom centered
  // on them — these are suppressed.
  const suppressed = new Set<string>();
  for (const effect of state.zoneEffects.values()) {
    if (effect.type === 'toxic_bloom') {
      suppressed.add(hexToKey(effect.center));
    }
  }

  let current = state;
  for (const [hexKey, candidate] of candidateHexes) {
    if (suppressed.has(hexKey)) continue;

    // Count poisoned-unit ownership grouped by faction for hexes within
    // distance 1 of the candidate. Also track total adjacency count so we
    // can apply the 3+ threshold against ANY poisoned unit (not just
    // Venom-T3 factions' units).
    let totalAdjacent = 0;
    const ownership = new Map<FactionId, number>();
    for (const pu of poisonedUnits) {
      if (hexDistance(pu.position, candidate) !== 1) continue;
      totalAdjacent += 1;
      ownership.set(pu.factionId, (ownership.get(pu.factionId) ?? 0) + 1);
    }
    if (totalAdjacent < TOXIC_BLOOM_THRESHOLD) continue;

    // Pick the spawning Venom-T3 faction: highest adjacent ownership, ties
    // broken by faction iteration order (venomT3Factions is built from
    // state.factions in iteration order).
    let spawner: { factionId: FactionId; permanent: boolean } | null = null;
    let bestCount = 0;
    for (const candidateFaction of venomT3Factions) {
      const count = ownership.get(candidateFaction.factionId) ?? 0;
      if (count > bestCount) {
        bestCount = count;
        spawner = candidateFaction;
      }
    }
    if (!spawner || bestCount === 0) continue;

    const bloom: ZoneEffect = {
      id: createZoneEffectId(),
      type: 'toxic_bloom',
      center: candidate,
      radius: 0,
      ownerFactionId: spawner.factionId,
      damagePerTurn: TOXIC_BLOOM_DAMAGE_PER_TURN,
      movementPenalty: 0,
      turnsRemaining: spawner.permanent ? -1 : TOXIC_BLOOM_FOREIGN_DURATION,
      createdRound: current.round,
    };
    current = addZoneEffect(current, bloom);
    suppressed.add(hexKey);
  }

  return current;
}

/**
 * Remove any Toxic Bloom whose center hex is occupied by a Druid Circle
 * (nature_healing native T3) unit. Mirrors the same round-rollover hook
 * as detection. Foreign Venom blooms also get cleansed — Druids are
 * blanket purifiers.
 */
export function cleanseToxicBlooms(state: GameState): GameState {
  if (state.zoneEffects.size === 0) return state;

  // Build the set of hex keys occupied by cleanse-enabled units. A faction's
  // doctrine is cached, so resolving it once per faction is cheap.
  const cleanseHexes = new Set<string>();
  for (const [factionId, faction] of state.factions) {
    const research = state.research.get(factionId);
    const doctrine = resolveResearchDoctrine(research, faction);
    if (!doctrine.cleanseToxicBloomEnabled) continue;
    for (const uid of faction.unitIds) {
      const unit = state.units.get(uid as UnitId);
      if (!unit || unit.hp <= 0) continue;
      cleanseHexes.add(hexToKey(unit.position));
    }
  }
  if (cleanseHexes.size === 0) return state;

  let current = state;
  for (const effect of state.zoneEffects.values()) {
    if (effect.type !== 'toxic_bloom') continue;
    if (cleanseHexes.has(hexToKey(effect.center))) {
      current = removeZoneEffect(current, effect.id);
    }
  }
  return current;
}
