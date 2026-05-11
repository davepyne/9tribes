// Research entity types
import type { ResearchNodeId, FactionId } from '../../types.js';

export type { ResearchUnlock } from '../../data/registry/types.js';

export interface ResearchState {
  factionId: FactionId;
  activeNodeId: ResearchNodeId | null;
  progressByNodeId: Partial<Record<ResearchNodeId, number>>;
  completedNodes: ResearchNodeId[];
  researchPerTurn: number;
  recentSacrificeDomainIds?: string[];
  recentSacrificeRound?: number;
  /** Accumulated combat research bonus per domain this turn (reset each faction turn) */
  combatResearchBonusThisTurn?: Record<string, number>;
}
