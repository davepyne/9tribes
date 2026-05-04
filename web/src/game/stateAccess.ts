/**
 * Typed accessors for GameState maps.
 * Centralizes branded-ID casts so callers don't need `as never`.
 *
 * Branded types (FactionId, UnitId, etc.) are `string & { __brand }` at the
 * type level but plain `string` at runtime. These helpers bridge the gap.
 */

import type {
  City, Faction, GameState, Improvement, Prototype, ResearchState, Unit,
} from '../../../src/game/types.js';
import type {
  CityId, FactionId, ImprovementId, PrototypeId, ResearchNodeId, UnitId,
} from '../../../src/types.js';

// ── Map.get accessors ───────────────────────────────────────────────

export function getUnit(state: GameState, id: string): Unit | undefined {
  return state.units.get(id as UnitId);
}

export function getFaction(state: GameState, id: string | null | undefined): Faction | undefined {
  if (id == null) return undefined;
  return state.factions.get(id as FactionId);
}

export function getCity(state: GameState, id: string): City | undefined {
  return state.cities.get(id as CityId);
}

export function getPrototype(state: GameState, id: string): Prototype | undefined {
  return state.prototypes.get(id as PrototypeId);
}

export function getResearch(state: GameState, id: string): ResearchState | undefined {
  return state.research.get(id as FactionId);
}

// ── Map.has ─────────────────────────────────────────────────────────

export function hasUnit(state: GameState, id: string): boolean {
  return state.units.has(id as UnitId);
}

// ── Research helpers ────────────────────────────────────────────────

export function getResearchProgress(research: ResearchState, nodeId: string): number {
  return research.progressByNodeId[nodeId as ResearchNodeId] ?? 0;
}

export function isResearchNodeCompleted(research: ResearchState, nodeId: string): boolean {
  return research.completedNodes.includes(nodeId as ResearchNodeId);
}

// ── Branded-ID casts ────────────────────────────────────────────────
// Use when passing a string ID to a backend system that expects a branded type.

export function asFactionId(id: string): FactionId { return id as FactionId; }
export function asUnitId(id: string): UnitId { return id as UnitId; }
export function asCityId(id: string): CityId { return id as CityId; }
export function asPrototypeId(id: string): PrototypeId { return id as PrototypeId; }
export function asImprovementId(id: string): ImprovementId { return id as ImprovementId; }
export function asResearchNodeId(id: string): ResearchNodeId { return id as ResearchNodeId; }
