// History System - Phase 7 MVP
// Records unit events for persistent unit identity

import type { Unit, HistoryEntry } from '../features/units/types.js';
import type { UnitId, FactionId, PrototypeId, CityId } from '../types.js';
import type { HistoryEntryType, VeteranLevel } from '../core/enums.js';
import type { GameState } from '../game/types.js';
import type { CombatRecord } from '../features/factions/types.js';

// Create a new history entry with timestamp
function createHistoryEntry(
  type: HistoryEntryType,
  details: Record<string, unknown>
): HistoryEntry {
  return {
    type,
    timestamp: Date.now(),
    details,
  };
}

// Add a history entry to unit (returns new unit with updated history)
export function addHistoryEntry(
  unit: Unit,
  type: HistoryEntryType,
  details: Record<string, unknown>
): Unit {
  const entry = createHistoryEntry(type, details);
  return {
    ...unit,
    history: [...(unit.history ?? []), entry],
  };
}

// Record unit creation event
export function recordUnitCreated(
  unit: Unit,
  factionId: FactionId,
  prototypeId: PrototypeId
): Unit {
  return addHistoryEntry(unit, 'created', { factionId, prototypeId });
}

// Record battle participation
export function recordBattleFought(
  unit: Unit,
  opponentId: UnitId,
  won: boolean,
  damageDealt: number,
  damageTaken: number
): Unit {
  return addHistoryEntry(unit, 'battle_fought', {
    opponentId,
    outcome: won ? 'victory' : 'defeat',
    damageDealt,
    damageTaken,
  });
}

// Record veteran level promotion
export function recordPromotion(
  unit: Unit,
  fromLevel: VeteranLevel,
  toLevel: VeteranLevel
): Unit {
  return addHistoryEntry(unit, 'promoted', { fromLevel, toLevel });
}

// Record enemy unit killed
export function recordEnemyKilled(unit: Unit, victimId: UnitId): Unit {
  return addHistoryEntry(unit, 'unit_killed', { victimId });
}

// Query: Get all history entries of a specific type
export function getHistoryByType(
  unit: Unit,
  type: HistoryEntryType
): HistoryEntry[] {
  return (unit.history ?? []).filter((entry) => entry.type === type);
}

// Query: Get total number of battles fought
export function getBattleCount(unit: Unit): number {
  return (unit.history ?? []).filter((entry) => entry.type === 'battle_fought').length;
}

// Query: Get total number of enemies killed
export function getKillCount(unit: Unit): number {
  return (unit.history ?? []).filter((entry) => entry.type === 'unit_killed').length;
}

// Combat Record Tracking Functions

/**
 * Update combat record when faction wins a battle
 */
export function updateCombatRecordOnWin(
  state: GameState,
  factionId: FactionId,
  round: number
): GameState {
  const faction = state.factions.get(factionId);
  if (!faction) return state;

  const factions = new Map(state.factions);
  factions.set(factionId, {
    ...faction,
    combatRecord: {
      ...faction.combatRecord,
      recentWins: faction.combatRecord.recentWins + 1,
      lastWinRound: round,
    },
  });

  return { ...state, factions };
}

/**
 * Update combat record when faction loses a battle
 */
export function updateCombatRecordOnLoss(
  state: GameState,
  factionId: FactionId,
  round: number
): GameState {
  const faction = state.factions.get(factionId);
  if (!faction) return state;

  const factions = new Map(state.factions);
  factions.set(factionId, {
    ...faction,
    combatRecord: {
      ...faction.combatRecord,
      recentLosses: faction.combatRecord.recentLosses + 1,
      lastLossRound: round,
    },
  });

  return { ...state, factions };
}

/**
 * Update combat record when faction eliminates another faction
 */
export function updateCombatRecordOnElimination(
  state: GameState,
  factionId: FactionId
): GameState {
  const faction = state.factions.get(factionId);
  if (!faction) return state;

  const factions = new Map(state.factions);
  factions.set(factionId, {
    ...faction,
    combatRecord: {
      ...faction.combatRecord,
      totalEliminations: faction.combatRecord.totalEliminations + 1,
    },
  });

  return { ...state, factions };
}

/**
 * Reset combat record streaks (called periodically to decay old streaks)
 */
export function resetCombatRecordStreaks(
  state: GameState,
  factionId: FactionId
): GameState {
  const faction = state.factions.get(factionId);
  if (!faction) return state;

  const factions = new Map(state.factions);
  factions.set(factionId, {
    ...faction,
    combatRecord: {
      ...faction.combatRecord,
      recentWins: 0,
      recentLosses: 0,
    },
  });

  return { ...state, factions };
}

/**
 * Get current win streak for a faction
 */
export function getWinStreak(
  record: CombatRecord,
  currentRound: number
): number {
  if (record.lastLossRound > record.lastWinRound) {
    return 0; // Streak broken
  }
  return record.recentWins;
}

/**
 * Check if faction has recent stability (good combat performance)
 */
export function hasRecentStability(
  record: CombatRecord,
  currentRound: number
): boolean {
  return (
    (record.recentWins >= 1 && record.recentLosses === 0) ||
    record.totalEliminations >= 1
  );
}

// City capture event type (for simulation trace / future history)
export interface CityCapturedEntry {
  type: 'city_captured';
  round: number;
  cityId: CityId;
  cityName: string;
  oldOwnerFactionId: FactionId;
  newOwnerFactionId: FactionId;
}
