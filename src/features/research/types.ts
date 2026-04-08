// Research entity types
import type { ResearchNodeId, FactionId } from '../../types.js';

export interface QualitativeEffect {
  type: string;
  description: string;
  effect: Record<string, unknown>;
}

export interface ResearchNode {
  id: ResearchNodeId;
  name: string;
  domain: string;
  tier: number;
  xpCost: number;
  prerequisites: string[];
  isNative: boolean;
  isLocked: boolean;
  unlocks: ResearchUnlock[];
  qualitativeEffect?: QualitativeEffect;
}

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
