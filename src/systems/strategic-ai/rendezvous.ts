import type { CityId, FactionId, HexCoord, UnitId } from '../../types.js';
import type { GameState } from '../../game/types.js';
import type { FactionStrategy, UnitStrategicIntent } from '../factionStrategy.js';
import { getHexesInRange, hexDistance, hexToKey } from '../../core/grid.js';
import { isAggressiveAssignment } from './helpers.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const RENDEZVOUS_OFFSET_HEXES = 4;
export const RENDEZVOUS_READY_DISTANCE = 2;
export const HOLD_DEFENSE_RADIUS = 1;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SquadPhase = 'assembling' | 'ready' | 'engaging' | 'disbanded';

export type SquadRole = 'primary' | 'flank' | 'harass' | 'solo';

export interface SquadState {
  squadId: string;
  phase: SquadPhase;
  role: SquadRole;
  memberIds: UnitId[];
  rendezvous: HexCoord;
  objectiveHex: HexCoord;
  objectiveCityId?: CityId;
  objectiveUnitId?: UnitId;
  createdOnRound: number;
  readyOnRound?: number;
  staleOnRound: number;
}

// ---------------------------------------------------------------------------
// Terrain scoring helpers
// ---------------------------------------------------------------------------

const DEFENSIBLE_TERRAINS = new Set(['forest', 'hill', 'jungle', 'swamp']);

function isDefensibleTerrain(state: GameState, hex: HexCoord): boolean {
  const tile = state.map?.tiles.get(hexToKey(hex));
  if (!tile) return false;
  return DEFENSIBLE_TERRAINS.has(tile.terrain);
}

function isPassable(state: GameState, hex: HexCoord): boolean {
  const tile = state.map?.tiles.get(hexToKey(hex));
  if (!tile) return false;
  return tile.terrain !== 'mountain' && tile.terrain !== 'ocean';
}

function countNearbyFriendlies(
  state: GameState,
  hex: HexCoord,
  factionId: FactionId,
  radius: number,
): number {
  let count = 0;
  for (const unit of state.units.values()) {
    if (unit.factionId !== factionId || unit.hp <= 0) continue;
    if (hexDistance(hex, unit.position) <= radius) count += 1;
  }
  for (const city of state.cities.values()) {
    if (city.factionId !== factionId) continue;
    if (hexDistance(hex, city.position) <= radius) count += 1;
  }
  return count;
}

function isAdjacentToEnemyCity(
  state: GameState,
  hex: HexCoord,
  factionId: FactionId,
): boolean {
  for (const city of state.cities.values()) {
    if (city.factionId === factionId) continue;
    if (hexDistance(hex, city.position) <= 1) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// computeRendezvousHex
// ---------------------------------------------------------------------------

/**
 * Select a staging position for a squad approaching an objective.
 *
 * Algorithm:
 * 1. Compute vector from objective toward the friendly anchor; offset by RENDEZVOUS_OFFSET_HEXES.
 * 2. Score candidates in a radius-1 ring around the initial candidate using terrain/ZoC heuristics.
 * 3. Return the highest-scoring passable hex.
 */
export function computeRendezvousHex(
  objectiveHex: HexCoord,
  friendlyAnchorHex: HexCoord,
  state: GameState,
  factionId: FactionId,
): HexCoord {
  // Vector from objective toward friendly anchor
  const dq = friendlyAnchorHex.q - objectiveHex.q;
  const dr = friendlyAnchorHex.r - objectiveHex.r;
  const len = Math.sqrt(dq * dq + dr * dr);

  // Normalize and offset; degenerate case (same hex) defaults to north
  const scale = len > 0 ? RENDEZVOUS_OFFSET_HEXES / len : 0;
  const offsetDq = len > 0 ? Math.round(dq * scale) : 0;
  const offsetDr = len > 0 ? Math.round(dr * scale) : -RENDEZVOUS_OFFSET_HEXES;

  const rawCandidate: HexCoord = {
    q: objectiveHex.q + offsetDq,
    r: objectiveHex.r + offsetDr,
  };

  // Score the candidate and its radius-1 neighbors
  const candidates = getHexesInRange(rawCandidate, 1);
  let best = rawCandidate;
  let bestScore = -Infinity;

  for (const hex of candidates) {
    let score = 0;

    if (!isPassable(state, hex)) {
      score -= 5;
    } else {
      if (isDefensibleTerrain(state, hex)) score += 2;
      // Check enemy ZoC — need a dummy-free approach (no unit context available)
      // Use city-adjacency as a proxy for danger when we can't check ZoC without a unit
      if (isAdjacentToEnemyCity(state, hex, factionId)) score -= 2;
      score += countNearbyFriendlies(state, hex, factionId, 3); // +1 per friendly
    }

    // Prefer candidates closer to the raw candidate to avoid drifting
    const distFromRaw = hexDistance(hex, rawCandidate);
    score -= distFromRaw * 0.5;

    if (score > bestScore) {
      bestScore = score;
      best = hex;
    }
  }

  return best;
}

// ---------------------------------------------------------------------------
// Squad state reconstruction
// ---------------------------------------------------------------------------

export interface SquadGateStats {
  assembling: number;
  ready: number;
  engaging: number;
  disbanded: number;
}

/**
 * Rebuild squad state from coordinator-stamped intents and previous strategy.
 *
 * Groups intents by squadId, computes member proximity to rendezvous, and
 * determines phase (assembling → ready → engaging → disbanded). Matches
 * previous-turn squads by objective+role for staleness continuity.
 */
export function reconstructSquads(
  state: GameState,
  factionId: FactionId,
  previousStrategy: FactionStrategy | undefined,
  currentIntents: Record<string, UnitStrategicIntent>,
): Map<string, SquadState> {
  const groups = new Map<string, { intent: UnitStrategicIntent; unitId: UnitId }[]>();
  for (const [unitId, intent] of Object.entries(currentIntents)) {
    if (!intent.squadId || !intent.rendezvousHex) continue;
    let group = groups.get(intent.squadId);
    if (!group) {
      group = [];
      groups.set(intent.squadId, group);
    }
    group.push({ intent, unitId: unitId as UnitId });
  }
  const previousByObjective = new Map<string, SquadState>();
  if (previousStrategy?.squads) {
    for (const squad of previousStrategy.squads) {
      const key = `${squad.objectiveCityId ?? squad.objectiveUnitId ?? ''}:${squad.role}`;
      previousByObjective.set(key, squad);
    }
  }

  const squads = new Map<string, SquadState>();
  for (const [squadId, entries] of groups) {
    const livingEntries = entries.filter((e) => {
      const unit = state.units.get(e.unitId);
      return unit && unit.hp > 0;
    });

    if (livingEntries.length === 0) continue;

    const first = entries[0].intent;
    const rendezvous = first.rendezvousHex!;
    const objectiveHex = first.objectiveCityId
      ? state.cities.get(first.objectiveCityId)?.position
      : first.objectiveUnitId
        ? state.units.get(first.objectiveUnitId)?.position
        : undefined;

    if (!objectiveHex) continue;

    const memberIds = livingEntries.map((e) => e.unitId);

    let trailDist = 0;
    for (const entry of livingEntries) {
      const unit = state.units.get(entry.unitId)!;
      const dist = hexDistance(unit.position, rendezvous);
      if (dist > trailDist) trailDist = dist;
    }

    const lookupKey = `${first.objectiveCityId ?? first.objectiveUnitId ?? ''}:${first.squadRole}`;
    const previousSquad = previousByObjective.get(lookupKey);
    const createdOnRound = previousSquad?.createdOnRound ?? state.round;

    // Travel-time-based staleness: compute timeout from actual distance & unit speed
    const slowestMoves = Math.max(1, ...livingEntries.map(e => {
      const unit = state.units.get(e.unitId);
      const pid = unit?.prototypeId;
      return pid ? (state.prototypes.get(pid)?.derivedStats?.moves ?? 2) : 2;
    }));
    const estimatedTravelTurns = Math.ceil(trailDist / slowestMoves);
    const STALE_BUFFER = 2;
    const defaultStaleOnRound = createdOnRound + estimatedTravelTurns + STALE_BUFFER;
    const staleOnRound = previousSquad?.staleOnRound ?? defaultStaleOnRound;

    let phase: SquadPhase;
    if (previousSquad?.phase === 'engaging') {
      phase = 'engaging';
    } else if (trailDist <= RENDEZVOUS_READY_DISTANCE) {
      phase = 'ready';
    } else if (state.round > staleOnRound) {
      phase = 'disbanded';
    } else {
      phase = 'assembling';
    }

    squads.set(squadId, {
      squadId,
      phase,
      role: (first.squadRole ?? 'primary') as SquadRole,
      memberIds,
      rendezvous,
      objectiveHex,
      objectiveCityId: first.objectiveCityId,
      objectiveUnitId: first.objectiveUnitId,
      createdOnRound,
      readyOnRound: phase === 'ready' || phase === 'engaging' ? state.round : previousSquad?.readyOnRound,
      staleOnRound,
    });
  }

  return squads;
}

/**
 * Replace the old wait-for-allies demotion path with squad-aware gating.
 *
 * - assembling: units en route to rendezvous hold (never demote to reserve).
 * - ready: promote all members to engage the objective.
 * - engaging: pass through.
 * - disbanded: clear squad data so coordinator re-plans.
 */
export function applySquadGate(
  state: GameState,
  factionId: FactionId,
  squads: Map<string, SquadState>,
  intents: Record<string, UnitStrategicIntent>,
): SquadGateStats {
  const stats: SquadGateStats = { assembling: 0, ready: 0, engaging: 0, disbanded: 0 };

  // Snapshot original phases so mutating a squad mid-loop doesn't affect
  // other members of the same squad.
  const originalPhases = new Map<string, SquadPhase>();
  for (const [squadId, squad] of squads) {
    originalPhases.set(squadId, squad.phase);
  }

  for (const [unitId, intent] of Object.entries(intents)) {
    if (!intent.squadId) continue;
    if (!isAggressiveAssignment(intent.assignment)) continue;

    const squad = squads.get(intent.squadId);
    if (!squad) {
      continue;
    }

    const unit = state.units.get(unitId as UnitId);
    if (!unit || unit.hp <= 0) continue;

    const phase = originalPhases.get(squad.squadId) ?? squad.phase;

    switch (phase) {
      case 'assembling': {
        stats.assembling += 1;
        const distToRendezvous = hexDistance(unit.position, squad.rendezvous);
        if (distToRendezvous <= RENDEZVOUS_READY_DISTANCE) {
          intents[unitId] = {
            ...intent,
            waypointKind: 'front_anchor',
            waypoint: unit.position,
            reason: `${intent.reason}; squad_hold=at_rendezvous`,
          };
        }
        break;
      }

      case 'ready': {
        stats.ready += 1;
        intents[unitId] = {
          ...intent,
          waypointKind: intent.objectiveCityId ? 'enemy_city' : 'cleanup_target',
          waypoint: squad.objectiveHex,
          reason: `${intent.reason}; squad_phase=engaging`,
        };
        squad.phase = 'engaging';
        squad.readyOnRound = state.round;
        break;
      }

      case 'engaging': {
        stats.engaging += 1;
        break;
      }

      case 'disbanded': {
        stats.disbanded += 1;
        intents[unitId] = {
          ...intent,
          squadId: undefined,
          rendezvousHex: undefined,
          squadRole: undefined,
          reason: `${intent.reason}; squad_disbanded=stale`,
        };
        break;
      }
    }
  }

  return stats;
}
