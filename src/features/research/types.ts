// Research entity types
import type { ResearchNodeId, FactionId } from '../../types.js';

export type ResearchUnlock =
  | { type: 'component'; id: string }
  | { type: 'chassis'; id: string }
  | { type: 'improvement'; id: string }
  | { type: 'recipe'; id: string };

export interface ResearchState {
  factionId: FactionId;
  activeNodeId: ResearchNodeId | null;
  progressByNodeId: Partial<Record<ResearchNodeId, number>>;
  completedNodes: ResearchNodeId[];
  researchPerTurn: number;
  recentCodifiedDomainIds?: string[];
  recentCodifiedRound?: number;
}
