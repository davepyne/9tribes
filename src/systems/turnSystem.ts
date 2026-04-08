// Turn system - manages turn progression, faction order, and unit activation
import type { GameState, Faction } from '../game/types.js';
import type { FactionId, UnitId } from '../types.js';
import type { Unit } from '../features/units/types.js';

/**
 * Activation state for alternating unit activation.
 * Tracks the interleaved queue of units to activate this round.
 */
export interface ActivationState {
  queue: UnitId[];
  index: number;
}

/**
 * Get the currently active faction
 */
export function getActiveFaction(gameState: GameState): Faction | null {
  if (!gameState.activeFactionId) return null;
  return gameState.factions.get(gameState.activeFactionId) ?? null;
}

/**
 * Check if it's a specific faction's turn
 */
export function isFactionTurn(gameState: GameState, factionId: FactionId): boolean {
  return gameState.activeFactionId === factionId;
}

/**
 * Reset moves and attacks for all units of a faction to their max
 */
function resetFactionUnitsMoves(
  units: Map<UnitId, Unit>,
  factionId: FactionId
): Map<UnitId, Unit> {
  const newUnits = new Map(units);
  for (const [unitId, unit] of units) {
    if (unit.factionId === factionId) {
      newUnits.set(unitId, {
        ...unit,
        movesRemaining: unit.maxMoves,
        attacksRemaining: 1,
        status: 'ready',
        enteredZoCThisActivation: false,
      });
    }
  }
  return newUnits;
}

/**
 * Get the first faction in the factions map (for round start)
 */
function getFirstFactionId(factions: Map<FactionId, Faction>): FactionId | null {
  const iterator = factions.keys();
  const first = iterator.next();
  return first.done ? null : first.value;
}

/**
 * Get the next faction in order (cycles through factions map)
 */
function getNextFactionId(
  factions: Map<FactionId, Faction>,
  currentFactionId: FactionId
): FactionId | null {
  const factionIds = Array.from(factions.keys());
  const currentIndex = factionIds.indexOf(currentFactionId);
  
  if (currentIndex === -1 || factionIds.length === 0) return null;
  
  const nextIndex = (currentIndex + 1) % factionIds.length;
  return factionIds[nextIndex];
}

/**
 * Advance to the next faction's turn
 * After all factions have taken a turn, increment the round
 * Reset the new active faction's units' movesRemaining
 */
export function advanceTurn(gameState: GameState): GameState {
  const factions = gameState.factions;
  
  // If no active faction, start at the first one
  if (!gameState.activeFactionId) {
    const firstFactionId = getFirstFactionId(factions);
    if (!firstFactionId) return gameState; // No factions in game
    
    return {
      ...gameState,
      round: 1,
      turnNumber: 1,
      activeFactionId: firstFactionId,
      units: resetFactionUnitsMoves(gameState.units, firstFactionId),
    };
  }
  
  const currentFactionId = gameState.activeFactionId;
  const nextFactionId = getNextFactionId(factions, currentFactionId);
  
  if (!nextFactionId) return gameState; // No factions
  
  const isNewRound = nextFactionId === getFirstFactionId(factions);
  
  const newUnits = resetFactionUnitsMoves(gameState.units, nextFactionId);
  
  return {
    ...gameState,
    round: isNewRound ? gameState.round + 1 : gameState.round,
    turnNumber: gameState.turnNumber + 1,
    activeFactionId: nextFactionId,
    units: newUnits,
  };
}

// ─── Alternating Unit Activation ────────────────────────────────────────────

/**
 * Reset all units across all factions for a new round.
 * Clears activatedThisRound, restores moves/attacks, recovers morale.
 */
export function resetAllUnitsForRound(state: GameState): GameState {
  const newUnits = new Map(state.units);
  for (const [unitId, unit] of newUnits) {
    if (unit.hp <= 0) continue;
      newUnits.set(unitId, {
        ...unit,
        movesRemaining: unit.maxMoves,
        attacksRemaining: 1,
        status: 'ready' as const,
        activatedThisRound: false,
        enteredZoCThisActivation: false,
      });
  }
  return { ...state, units: newUnits };
}

/**
 * Build an interleaved activation queue from all factions' living units.
 * Option A: round-robin one unit per faction, extras go at the end.
 */
export function buildActivationQueue(state: GameState): ActivationState {
  const factionIds = Array.from(state.factions.keys());

  // Collect living units per faction
  const unitsByFaction: Map<FactionId, UnitId[]> = new Map();
  for (const factionId of factionIds) {
    unitsByFaction.set(factionId, []);
  }
  for (const [unitId, unit] of state.units) {
    if (unit.hp > 0) {
      const list = unitsByFaction.get(unit.factionId);
      if (list) list.push(unitId);
    }
  }

  // Interleave: take one from each faction in order, repeat
  const queue: UnitId[] = [];
  const indices: Map<FactionId, number> = new Map();
  for (const factionId of factionIds) {
    indices.set(factionId, 0);
  }

  let added = true;
  while (added) {
    added = false;
    for (const factionId of factionIds) {
      const units = unitsByFaction.get(factionId)!;
      const idx = indices.get(factionId)!;
      if (idx < units.length) {
        queue.push(units[idx]);
        indices.set(factionId, idx + 1);
        added = true;
      }
    }
  }

  return { queue, index: 0 };
}

/**
 * Get the next unit to activate from the queue.
 * Skips dead units and already-activated units.
 * Returns { unitId, factionId } or null when queue is exhausted.
 */
export function nextUnitActivation(
  state: GameState,
  activation: ActivationState
): { unitId: UnitId; factionId: FactionId } | null {
  while (activation.index < activation.queue.length) {
    const unitId = activation.queue[activation.index];
    activation.index++;

    const unit = state.units.get(unitId);
    if (!unit || unit.hp <= 0 || unit.activatedThisRound) continue;

    return { unitId, factionId: unit.factionId };
  }

  return null;
}
