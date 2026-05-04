// src/systems/aiResearchStrategy.ts
// AI Research Strategy — orchestration layer.
// Scoring functions extracted to aiResearchScoring.ts.

import type { GameState } from '../game/types.js';
import type { RulesRegistry } from '../data/registry/types.js';
import type { FactionId } from '../types.js';
import type { FactionStrategy, ResearchPriority } from './factionStrategy.js';
import type { DifficultyLevel } from './aiDifficulty.js';
import { getAiDifficultyProfile } from './aiDifficulty.js';
import { getDomainProgression } from './domainProgression.js';
import {
  type CandidateNode,
  getCandidateNodes,
  getDomainsWithResearchProgress,
  scoreNativePriority,
  scorePosture,
  scoreSignatureDomain,
  scoreSynergy,
  scoreTierUrgency,
  scoreCostEfficiency,
  scoreGameStateUrgency,
  scoreDoctrinePackageCompletion,
  scoreNormalTier3DepthFocus,
  scoreNormalBreadthPivot,
  scoreNormalHybridBreadth,
  scoreNormalEmergentBreadth,
  getReachableTripleStackOpportunities,
  scoreNormalTripleStackFocus,
  scoreLogisticsFit,
  buildResearchReason,
  type ResearchScores,
} from './aiResearchScoring.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ResearchDecision {
  nodeId: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Rank all available research nodes by strategic score.
 * Returns sorted list of ResearchPriority entries (highest first).
 */
export function rankResearchPriorities(
  state: GameState,
  factionId: FactionId,
  strategy: FactionStrategy,
  registry: RulesRegistry,
  difficulty?: DifficultyLevel,
): ResearchPriority[] {
  const difficultyProfile = getAiDifficultyProfile(difficulty);
  const faction = state.factions.get(factionId);
  const research = state.research.get(factionId);
  if (!faction || !research) return [];

  const candidates = getCandidateNodes(faction, research.completedNodes as string[], registry);
  const domainsWithProgress = getDomainsWithResearchProgress(research);
  const progression = getDomainProgression(faction, research);
  const tripleStackOpportunities = getReachableTripleStackOpportunities(
    new Set(progression.emergentEligibleDomains),
    new Set(faction.learnedDomains),
  );

  return candidates
    .map((candidate) => {
      const native = scoreNativePriority(candidate);
      const postureScore = scorePosture(strategy.posture, candidate.domainId);
      const signatureScore = scoreSignatureDomain(
        faction,
        candidate.domainId,
        difficultyProfile,
      );
      const synergyScore = scoreSynergy(strategy, candidate.def.codifies ?? []);
      const tierScore = scoreTierUrgency(candidate.tier);
      const costScore = scoreCostEfficiency(faction, candidate.def.xpCost);
      const gameStateScore = scoreGameStateUrgency(faction, strategy.posture, candidate.domainId);
      const doctrinePackageScore = scoreDoctrinePackageCompletion(
        candidate,
        research.completedNodes as string[],
        strategy,
      );
      const logisticsScore = scoreLogisticsFit(state, factionId, strategy, candidate);
      const depthFocusScore = scoreNormalTier3DepthFocus(candidate, domainsWithProgress, difficultyProfile);
      const breadthPivotScore = scoreNormalBreadthPivot(
        candidate,
        faction,
        progression,
        domainsWithProgress,
        difficultyProfile,
      );
      const hybridBreadthScore = scoreNormalHybridBreadth(candidate, strategy, progression, difficultyProfile);
      const emergentBreadthScore = scoreNormalEmergentBreadth(candidate, progression, difficultyProfile);
      const tripleStackScore = scoreNormalTripleStackFocus(candidate, tripleStackOpportunities, difficultyProfile);

      const score =
        native +
        postureScore +
        signatureScore +
        synergyScore +
        tierScore +
        costScore +
        gameStateScore +
        doctrinePackageScore +
        logisticsScore +
        depthFocusScore +
        breadthPivotScore +
        hybridBreadthScore +
        emergentBreadthScore +
        tripleStackScore;

      return {
        nodeId: candidate.def.id,
        score,
        reason: buildResearchReason(candidate, strategy.posture, {
          native,
          posture: postureScore,
          signature: signatureScore,
          synergy: synergyScore,
          tier: tierScore,
          gameState: gameStateScore,
          doctrinePackage: doctrinePackageScore,
          logistics: logisticsScore,
          depthFocus: depthFocusScore,
          breadthPivot: breadthPivotScore,
          hybridBreadth: hybridBreadthScore,
          emergentBreadth: emergentBreadthScore,
          tripleStack: tripleStackScore,
        }),
      };
    })
    .sort((a, b) => b.score - a.score || a.nodeId.localeCompare(b.nodeId));
}

/**
 * Choose the best research node for the AI to work on next.
 * Implements "sticky" behavior: won't switch away from the active node
 * unless a clearly better option emerges (score > active + threshold).
 */
export function chooseStrategicResearch(
  state: GameState,
  factionId: FactionId,
  strategy: FactionStrategy,
  registry: RulesRegistry,
  difficulty?: DifficultyLevel,
): ResearchDecision | null {
  const difficultyProfile = getAiDifficultyProfile(difficulty);
  const priorities = rankResearchPriorities(state, factionId, strategy, registry, difficulty);
  strategy.researchPriorities = priorities;

  const research = state.research.get(factionId);
  if (!research) return null;

  const top = priorities[0];
  if (!top) return null;

  // Sticky: keep active research unless the new top pick is clearly better
  if (research.activeNodeId && research.activeNodeId !== top.nodeId) {
    const activePriority = priorities.find((p) => p.nodeId === research.activeNodeId);
    const activeScore = activePriority?.score ?? -Infinity;

    if (top.score - activeScore < difficultyProfile.research.stickyThreshold) {
      return {
        nodeId: research.activeNodeId,
        reason: activePriority?.reason ?? `keeping active research ${research.activeNodeId} sticky`,
      };
    }
  }

  return {
    nodeId: top.nodeId,
    reason: top.reason,
  };
}
