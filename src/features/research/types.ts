// Research entity types
import type { ResearchNodeId, FactionId } from '../../types.js';

export type { ResearchUnlock } from '../../data/registry/types.js';

export interface ResearchState {
  factionId: FactionId;
  activeNodeId: ResearchNodeId | null;
  progressByNodeId: Partial<Record<ResearchNodeId, number>>;
  completedNodes: ResearchNodeId[];
  researchPerTurn: number;
  recentCodifiedDomainIds?: string[];
  recentCodifiedRound?: number;
}
