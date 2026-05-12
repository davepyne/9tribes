// Research System - Domain-based research progression
// Handles technology/research tree progression with domain locking

import type { ResearchState } from '../features/research/types.js';
import type { ResearchNodeId, FactionId } from '../types.js';
import type { Faction } from '../features/factions/types.js';
import {
  getDomainTierFromProgression,
  isDomainUnlockedForFaction,
} from './domainProgression.js';

/**
 * Create initial research state for a new faction.
 * Native domain T1 is auto-completed.
 */
export function createResearchState(factionId: FactionId, nativeDomain?: string, researchPerTurn?: number): ResearchState {
  const completedNodes: ResearchNodeId[] = nativeDomain
    ? [`${nativeDomain}_t1` as ResearchNodeId]
    : [];

  return {
    factionId,
    activeNodeId: null,
    progressByNodeId: {},
    completedNodes,
    researchPerTurn: researchPerTurn ?? 1,
    recentSacrificeDomainIds: [],
  };
}

/**
 * Start researching a specific node.
 * Retains progress if switching back to a previously started node.
 * Prerequisite enforcement: all prerequisites must be completed.
 * Cannot research an already completed node.
 * Domain lock enforcement: node's domain must be in faction's learnedDomains.
 */
export function startResearch(
  state: ResearchState,
  nodeId: ResearchNodeId,
  prerequisites?: string[],
  learnedDomains?: string[]
): ResearchState {
  if (state.activeNodeId === nodeId) {
    return state;
  }

  // Domain lock enforcement: node's domain must be unlocked
  if (learnedDomains) {
    const domainId = extractDomainFromNodeId(nodeId);
    if (domainId && !learnedDomains.includes(domainId)) {
      return state; // Cannot start research — domain is locked
    }
  }

  // Prerequisite enforcement: all prerequisites must be completed
  if (prerequisites && prerequisites.length > 0) {
    const allPrereqsMet = prerequisites.every((prereqId) =>
      state.completedNodes.includes(prereqId as never)
    );
    if (!allPrereqsMet) {
      return state; // Cannot start research — prerequisites not met
    }
  }

  // Cannot research an already completed node
  if (state.completedNodes.includes(nodeId)) {
    return state;
  }

  return {
    ...state,
    activeNodeId: nodeId,
  };
}

/**
 * Extract domain ID from a node ID (e.g., "venom_t2" -> "venom").
 */
function extractDomainFromNodeId(nodeId: string): string | null {
  const parts = nodeId.split('_t');
  if (parts.length >= 2) {
    return parts[0];
  }
  return null;
}

/**
 * Check if a domain is unlocked for a faction.
 */
export function isDomainUnlocked(faction: Faction, domainId: string): boolean {
  return isDomainUnlockedForFaction(faction, domainId);
}

/**
 * Get the highest completed tier for a domain (0=locked, 1=T1 done, 2=T2 done, 3=T3 done).
 */
export function getDomainTier(
  faction: Faction,
  domainId: string,
  completedNodes: string[]
): number {
  return getDomainTierFromProgression(faction, domainId, {
    factionId: faction.id,
    activeNodeId: null,
    progressByNodeId: {},
    completedNodes: completedNodes as ResearchNodeId[],
    researchPerTurn: 1,
  });
}

/**
 * Add progress to current research.
 * Returns updated state with new progress, or completed state if threshold reached.
 */
export function addResearchProgress(
  state: ResearchState,
  xpCost: number,
  amount: number,
): ResearchState {
  if (!state.activeNodeId) {
    return state;
  }

  if (state.completedNodes.includes(state.activeNodeId)) {
    return state;
  }

  const currentProgress = state.progressByNodeId[state.activeNodeId] ?? 0;
  const newProgress = currentProgress + amount;

  if (newProgress >= xpCost) {
    return {
      ...state,
      progressByNodeId: {
        ...state.progressByNodeId,
        [state.activeNodeId]: newProgress,
      },
      completedNodes: [...state.completedNodes, state.activeNodeId],
      activeNodeId: null,
    };
  }

  return {
    ...state,
    progressByNodeId: {
      ...state.progressByNodeId,
      [state.activeNodeId]: newProgress,
    },
  };
}

/**
 * Advance research by adding researchPerTurn to the active node's progress.
 * Does not check for completion - that's handled by addResearchProgress.
 */
export function advanceResearch(state: ResearchState): ResearchState {
  if (!state.activeNodeId) {
    return state;
  }

  const currentProgress = state.progressByNodeId[state.activeNodeId] ?? 0;

  return {
    ...state,
    progressByNodeId: {
      ...state.progressByNodeId,
      [state.activeNodeId]: currentProgress + state.researchPerTurn,
    },
  };
}

/**
 * Check if a research node has been completed.
 */
export function isNodeCompleted(
  state: ResearchState,
  nodeId: ResearchNodeId
): boolean {
  return state.completedNodes.includes(nodeId);
}

/**
 * Get current research progress for a specific node.
 */
export function getResearchProgress(
  state: ResearchState,
  nodeId: ResearchNodeId
): number {
  return state.progressByNodeId[nodeId] ?? 0;
}

/**
 * Check if a faction is currently researching something.
 */
export function isResearching(state: ResearchState): boolean {
  return state.activeNodeId !== null;
}

/**
 * Get the current research rate (research points per turn).
 */
export function getResearchRate(state: ResearchState): number {
  return state.researchPerTurn;
}

/**
 * Set the research rate (research points per turn).
 */
export function setResearchRate(
  state: ResearchState,
  rate: number
): ResearchState {
  return {
    ...state,
    researchPerTurn: rate,
  };
}

// Base research rate is 8 XP/turn. Bonus calculations removed — use flat rate.

/**
 * Add progress to a specific research node (not gated by activeNodeId).
 * Used by the ecology research pass to advance all learned domains simultaneously.
 * Clears activeNodeId only if the completed node is the active one.
 */
export function addResearchProgressToNode(
  state: ResearchState,
  nodeId: ResearchNodeId,
  xpCost: number,
  amount: number,
): { state: ResearchState; completed: boolean } {
  if (state.completedNodes.includes(nodeId)) {
    return { state, completed: false };
  }

  const currentProgress = state.progressByNodeId[nodeId] ?? 0;
  const newProgress = currentProgress + amount;

  if (newProgress >= xpCost) {
    const clearActive = state.activeNodeId === nodeId;
    return {
      state: {
        ...state,
        progressByNodeId: {
          ...state.progressByNodeId,
          [nodeId]: newProgress,
        },
        completedNodes: [...state.completedNodes, nodeId],
        ...(clearActive ? { activeNodeId: null } : {}),
      },
      completed: true,
    };
  }

  return {
    state: {
      ...state,
      progressByNodeId: {
        ...state.progressByNodeId,
        [nodeId]: newProgress,
      },
    },
    completed: false,
  };
}

/**
 * Find the next uncompleted research node for a domain (T1 → T2 → T3).
 * Returns null if all tiers are completed.
 */
export function getNextResearchNodeForDomain(
  domainId: string,
  completedNodes: readonly string[],
): { nodeId: ResearchNodeId; tier: number } | null {
  const t1 = `${domainId}_t1` as ResearchNodeId;
  const t2 = `${domainId}_t2` as ResearchNodeId;
  const t3 = `${domainId}_t3` as ResearchNodeId;

  if (!completedNodes.includes(t1)) return { nodeId: t1, tier: 1 };
  if (!completedNodes.includes(t2)) return { nodeId: t2, tier: 2 };
  if (!completedNodes.includes(t3)) return { nodeId: t3, tier: 3 };
  return null;
}
