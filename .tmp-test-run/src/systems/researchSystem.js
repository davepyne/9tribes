// Research System - Domain-based research progression
// Handles technology/research tree progression with domain locking
import { getDomainTierFromProgression, isDomainUnlockedForFaction, } from './domainProgression.js';
/**
 * Create initial research state for a new faction.
 * Native domain T1 is auto-completed.
 */
export function createResearchState(factionId, nativeDomain) {
    const completedNodes = [];
    if (nativeDomain) {
        completedNodes.push(`${nativeDomain}_t1`);
    }
    return {
        factionId,
        activeNodeId: null,
        progressByNodeId: {},
        completedNodes,
        researchPerTurn: 4,
        recentCodifiedDomainIds: [],
    };
}
/**
 * Start researching a specific node.
 * Retains progress if switching back to a previously started node.
 * Prerequisite enforcement: all prerequisites must be completed.
 * Cannot research an already completed node.
 * Domain lock enforcement: node's domain must be in faction's learnedDomains.
 */
export function startResearch(state, nodeId, prerequisites, learnedDomains) {
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
        const allPrereqsMet = prerequisites.every((prereqId) => state.completedNodes.includes(prereqId));
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
function extractDomainFromNodeId(nodeId) {
    const parts = nodeId.split('_t');
    if (parts.length >= 2) {
        return parts[0];
    }
    return null;
}
/**
 * Check if a domain is unlocked for a faction.
 */
export function isDomainUnlocked(faction, domainId) {
    return isDomainUnlockedForFaction(faction, domainId);
}
/**
 * Get the highest completed tier for a domain (0=locked, 1=T1 done, 2=T2 done, 3=T3 done).
 */
export function getDomainTier(faction, domainId, completedNodes) {
    return getDomainTierFromProgression(faction, domainId, {
        factionId: faction.id,
        activeNodeId: null,
        progressByNodeId: {},
        completedNodes: completedNodes,
        researchPerTurn: 4,
    });
}
/**
 * Add progress to current research.
 * Returns updated state with new progress, or completed state if threshold reached.
 */
export function addResearchProgress(state, xpCost, amount) {
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
export function advanceResearch(state) {
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
export function isNodeCompleted(state, nodeId) {
    return state.completedNodes.includes(nodeId);
}
/**
 * Get current research progress for a specific node.
 */
export function getResearchProgress(state, nodeId) {
    return state.progressByNodeId[nodeId] ?? 0;
}
/**
 * Check if a faction is currently researching something.
 */
export function isResearching(state) {
    return state.activeNodeId !== null;
}
/**
 * Get the current research rate (research points per turn).
 */
export function getResearchRate(state) {
    return state.researchPerTurn;
}
/**
 * Set the research rate (research points per turn).
 */
export function setResearchRate(state, rate) {
    return {
        ...state,
        researchPerTurn: rate,
    };
}
// Base research rate is 4 XP/turn. Bonus calculations removed — use flat rate.
