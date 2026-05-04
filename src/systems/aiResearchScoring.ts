// src/systems/aiResearchScoring.ts
// Extracted scoring functions for AI research strategy.
// Pure helpers — no orchestration logic. Called by aiResearchStrategy.ts.

import type { GameState } from '../game/types.js';
import type { RulesRegistry, ResearchNodeDef } from '../data/registry/types.js';
import type { FactionId } from '../types.js';
import type { FactionStrategy } from './factionStrategy.js';
import { scoreResearchCandidate } from './aiPersonality.js';
import type { AiDifficultyProfile } from './aiDifficulty.js';
import { getDomainProgression } from './domainProgression.js';
import emergentRulesData from '../content/base/emergent-rules.json' with { type: 'json' };
import type { EmergentRuleConfig } from './synergyEngine.js';

// ---------------------------------------------------------------------------
// Candidate enumeration
// ---------------------------------------------------------------------------

export interface CandidateNode {
  def: ResearchNodeDef;
  domainId: string;
  tier: number;
  isNative: boolean;
}

/**
 * Extract domain ID from a node ID.
 * Convention: "{domain}_t{tier}" e.g. "venom_t2" → "venom"
 */
function extractDomain(nodeId: string): string {
  const idx = nodeId.lastIndexOf('_t');
  return idx > 0 ? nodeId.substring(0, idx) : nodeId;
}

/**
 * Extract tier number from a node ID.
 * Convention: "{domain}_t{tier}" e.g. "venom_t2" → 2
 * Returns 1 if the pattern doesn't match.
 */
export function extractTier(nodeId: string): number {
  const match = nodeId.match(/_t(\d+)$/);
  return match ? parseInt(match[1], 10) : 1;
}

/**
 * Enumerate all researchable nodes for a faction.
 * Filters by: not completed, domain unlocked, prerequisites met,
 * and tier-ordering (T2 before T3 within a domain).
 */
export function getCandidateNodes(
  faction: { nativeDomain: string; learnedDomains: string[] },
  completedNodes: string[],
  registry: RulesRegistry,
): CandidateNode[] {
  const completedSet = new Set(completedNodes);
  const learnedSet = new Set(faction.learnedDomains);

  const candidates: CandidateNode[] = [];

  for (const domain of registry.getAllResearchDomains()) {
    if (!learnedSet.has(domain.id)) continue;

    const isNative = domain.id === faction.nativeDomain;

    for (const node of Object.values(domain.nodes)) {
      if (completedSet.has(node.id)) continue;

      const tier = node.tier ?? extractTier(node.id);

      if (tier === 1) continue;

      const prereqs = node.prerequisites ?? [];
      if (!prereqs.every((p) => completedSet.has(p))) continue;

      if (tier === 3) {
        const t2Id = `${domain.id}_t2`;
        if (!completedSet.has(t2Id)) continue;
      }

      candidates.push({ def: node, domainId: domain.id, tier, isNative });
    }
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Domain → posture affinity map
// ---------------------------------------------------------------------------

const POSTURE_DOMAINS: Record<string, string[]> = {
  defensive:  ['fortress', 'river_stealth', 'heavy_hitter', 'nature_healing'],
  recovery:   ['fortress', 'nature_healing', 'heavy_hitter'],
  siege:      ['fortress', 'tidal_warfare', 'heavy_hitter'],
  offensive:  ['charge', 'hitrun', 'venom', 'slaving'],
  balanced:   ['charge', 'fortress', 'hitrun', 'nature_healing'],
  exploration:['hitrun', 'river_stealth', 'camel_adaptation', 'tidal_warfare'],
};

const SIGNATURE_DOMAINS: Record<string, string[]> = {
  cavalry:    ['charge', 'hitrun'],
  archer:     ['hitrun', 'nature_healing'],
  elephant:   ['charge', 'heavy_hitter'],
  camel:      ['camel_adaptation', 'hitrun'],
  ship:       ['tidal_warfare', 'river_stealth'],
  naval:      ['tidal_warfare', 'river_stealth'],
  poison:     ['venom'],
  venom:      ['venom'],
  slave:      ['slaving'],
  infantry:   ['fortress', 'heavy_hitter'],
};

// ---------------------------------------------------------------------------
// Faction domain exploit scores (data-driven)
// ---------------------------------------------------------------------------

/** Domain affinity scores per faction for research exploit weighting. */
const FACTION_DOMAIN_EXPLOIT_SCORES: Record<string, Record<string, number>> = {
  steppe_clan:   { hitrun: 4, charge: 2 },
  coral_people:  { slaving: 4, tidal_warfare: 3, river_stealth: 1.5 },
  frost_wardens: { heavy_hitter: 4, fortress: 2, nature_healing: 2 },
  desert_nomads: { camel_adaptation: 4, hitrun: 1.5, charge: 1.5 },
};

// ---------------------------------------------------------------------------
// Scoring functions
// ---------------------------------------------------------------------------

export function scoreNativePriority(candidate: CandidateNode): number {
  if (!candidate.isNative) return 0;
  if (candidate.tier === 2) return 6;
  if (candidate.tier === 3) return 3;
  return 0;
}

export function scorePosture(posture: FactionStrategy['posture'], domainId: string): number {
  const preferred = POSTURE_DOMAINS[posture] ?? [];
  const idx = preferred.indexOf(domainId);
  if (idx === -1) return 0;
  return Math.max(1, 4 - idx);
}

export function scoreSignatureDomain(
  faction: {
    id: FactionId;
    nativeDomain: string;
    identityProfile: {
      signatureUnit: string;
      passiveTrait: string;
      economyAngle: string;
    };
  },
  domainId: string,
  difficultyProfile: AiDifficultyProfile,
): number {
  const sig = faction.identityProfile.signatureUnit.toLowerCase();
  let score = 0;
  for (const [keyword, domains] of Object.entries(SIGNATURE_DOMAINS)) {
    if (sig.includes(keyword) && domains.includes(domainId)) {
      score = 3;
      break;
    }
  }

  if (difficultyProfile.research.signatureExploitWeight <= 0) {
    return score;
  }

  const exploitScores = FACTION_DOMAIN_EXPLOIT_SCORES[faction.id];
  const exploitScore = exploitScores?.[domainId] ?? 0;

  return score + exploitScore * difficultyProfile.research.signatureExploitWeight;
}

export function scoreSynergy(strategy: FactionStrategy, codifies: string[]): number {
  let score = 0;
  for (const domainId of codifies) {
    if (strategy.hybridGoal.desiredDomainIds.includes(domainId)) score += 2.5;
  }
  return score;
}

export function scoreTierUrgency(tier: number): number {
  return tier === 2 ? 1.5 : 0;
}

export function scoreCostEfficiency(
  faction: { learnedDomains?: string[]; nativeDomain?: string },
  xpCost: number,
): number {
  return -xpCost * 0.1;
}

export function scoreGameStateUrgency(
  faction: { combatRecord?: { recentWins: number; recentLosses: number } },
  posture: FactionStrategy['posture'],
  domainId: string,
): number {
  const wins = faction.combatRecord?.recentWins ?? 0;
  const losses = faction.combatRecord?.recentLosses ?? 0;
  const losing = losses > wins;

  if (losing) {
    const defensive = ['fortress', 'nature_healing', 'heavy_hitter', 'river_stealth'];
    return defensive.includes(domainId) ? 2 : 0;
  } else {
    const offensive = ['charge', 'hitrun', 'venom', 'slaving', 'tidal_warfare'];
    return offensive.includes(domainId) ? 1 : 0;
  }
}

export function scoreDoctrinePackageCompletion(
  candidate: CandidateNode,
  completedNodes: string[],
  strategy: FactionStrategy,
): number {
  const completed = new Set(completedNodes);
  let score = 0;

  if (strategy.personality.activeDoctrines.includes(candidate.domainId)) {
    score += candidate.tier === 2 ? 1.75 : 1.25;
  }

  if (candidate.tier === 3 && completed.has(`${candidate.domainId}_t2`)) {
    score += 1.5;
  }

  const domainWeight = strategy.personality.researchWeights[candidate.domainId] ?? 0;
  if (domainWeight > 0) {
    score += Math.min(2, domainWeight);
  }

  return score;
}

export function getDomainsWithResearchProgress(research: NonNullable<GameState['research'] extends Map<any, infer R> ? R : never>): Set<string> {
  const domains = new Set<string>();

  for (const nodeId of research.completedNodes) {
    domains.add(extractDomain(nodeId));
  }
  if (research.activeNodeId) {
    domains.add(extractDomain(research.activeNodeId));
  }
  for (const [nodeId, progress] of Object.entries(research.progressByNodeId)) {
    if ((progress ?? 0) > 0) {
      domains.add(extractDomain(nodeId));
    }
  }

  return domains;
}

export function scoreNormalTier3DepthFocus(
  candidate: CandidateNode,
  domainsWithProgress: Set<string>,
  difficultyProfile: AiDifficultyProfile,
): number {
  if (!difficultyProfile.adaptiveAi) return 0;
  if (candidate.tier !== 3) return 0;
  if (!domainsWithProgress.has(candidate.domainId)) return 0;
  return difficultyProfile.research.tier3DepthWeight;
}

export function scoreNormalBreadthPivot(
  candidate: CandidateNode,
  faction: { nativeDomain: string; learnedDomains: string[] },
  progression: ReturnType<typeof getDomainProgression>,
  domainsWithProgress: Set<string>,
  difficultyProfile: AiDifficultyProfile,
): number {
  if (!difficultyProfile.adaptiveAi) return 0;

  const nativeT2Secured = progression.t2Domains.includes(faction.nativeDomain);
  const nonNativeT2Count = progression.t2Domains.filter((domainId) => domainId !== faction.nativeDomain).length;
  const activeBreadthCount = Array.from(domainsWithProgress).filter((domainId) => domainId !== faction.nativeDomain).length;
  const isForeign = candidate.domainId !== faction.nativeDomain;
  const isNewBreadthTier2 = candidate.tier === 2 && isForeign && !progression.t2Domains.includes(candidate.domainId);
  const isNativeTier3 = candidate.tier === 3 && candidate.domainId === faction.nativeDomain;

  let score = 0;
  if (nativeT2Secured && isNewBreadthTier2) {
    score += nonNativeT2Count === 0
      ? difficultyProfile.research.breadthPivotFirstWeight
      : difficultyProfile.research.breadthPivotFollowupWeight;
    if (activeBreadthCount === 0) {
      score += difficultyProfile.research.breadthPivotDevelopmentBonus;
    }
  }

  if (isNativeTier3 && nativeT2Secured && nonNativeT2Count === 0 && activeBreadthCount === 0) {
    score -= difficultyProfile.research.nativeTier3DelayPenalty;
  }

  return score;
}

export function scoreNormalHybridBreadth(
  candidate: CandidateNode,
  strategy: FactionStrategy,
  progression: ReturnType<typeof getDomainProgression>,
  difficultyProfile: AiDifficultyProfile,
): number {
  if (!difficultyProfile.adaptiveAi) return 0;
  if (candidate.tier !== 2) return 0;
  if (!strategy.hybridGoal.desiredDomainIds.includes(candidate.domainId)) return 0;

  const alreadyDeveloped = progression.t2Domains.includes(candidate.domainId);
  return alreadyDeveloped ? 0 : difficultyProfile.research.hybridBreadthWeight;
}

export function scoreNormalEmergentBreadth(
  candidate: CandidateNode,
  progression: ReturnType<typeof getDomainProgression>,
  difficultyProfile: AiDifficultyProfile,
): number {
  if (!difficultyProfile.adaptiveAi) return 0;
  if (candidate.tier !== 2) return 0;
  if (progression.emergentEligibleDomains.includes(candidate.domainId)) return 0;
    if (progression.t2Domains.length >= 3) return 0;
  return difficultyProfile.research.emergentBreadthWeight;
}

// ---------------------------------------------------------------------------
// Triple-stack helpers
// ---------------------------------------------------------------------------

export interface TripleStackOpportunity {
  ruleId: string;
  ruleName: string;
  missingDomains: Set<string>;
}

function getRuleDomainGroups(rule: EmergentRuleConfig): string[][] {
  if (rule.domainSets) {
    return Object.values(rule.domainSets);
  }
  if (rule.mobilityDomains) {
    return [rule.mobilityDomains];
  }
  if (rule.combatDomains) {
    return [rule.combatDomains];
  }
  return [];
}

export function getReachableTripleStackOpportunities(
  codifiedDomains: Set<string>,
  unlockedDomains: Set<string>,
): TripleStackOpportunity[] {
  const rules = (emergentRulesData.rules as EmergentRuleConfig[]).filter((rule) => rule.condition !== 'default');
  const opportunities: TripleStackOpportunity[] = [];

  for (const rule of rules) {
    const groups = getRuleDomainGroups(rule);
    if (groups.length === 0) {
      continue;
    }

    if (groups.length === 1) {
      const eligibleDomains = groups[0];
      const codifiedCount = eligibleDomains.filter((domainId) => codifiedDomains.has(domainId)).length;
      if (codifiedCount !== 2) {
        continue;
      }

      const missingDomains = new Set(
        eligibleDomains.filter((domainId) => unlockedDomains.has(domainId) && !codifiedDomains.has(domainId)),
      );
      if (missingDomains.size === 0) {
        continue;
      }

      opportunities.push({
        ruleId: rule.id,
        ruleName: rule.name,
        missingDomains,
      });
      continue;
    }

    const coveredGroups = groups.filter((domains) => domains.some((domainId) => codifiedDomains.has(domainId)));
    if (coveredGroups.length !== groups.length - 1) {
      continue;
    }

    const missingGroup = groups.find((domains) => !domains.some((domainId) => codifiedDomains.has(domainId)));
    if (!missingGroup) {
      continue;
    }

    const missingDomains = new Set(missingGroup.filter((domainId) => unlockedDomains.has(domainId) && !codifiedDomains.has(domainId)));
    if (missingDomains.size === 0) {
      continue;
    }

    opportunities.push({
      ruleId: rule.id,
      ruleName: rule.name,
      missingDomains,
    });
  }

  return opportunities;
}

export function scoreNormalTripleStackFocus(
  candidate: CandidateNode,
  opportunities: TripleStackOpportunity[],
  difficultyProfile: AiDifficultyProfile,
): number {
  if (!difficultyProfile.adaptiveAi) return 0;

  let score = 0;
  for (const opportunity of opportunities) {
    if (!opportunity.missingDomains.has(candidate.domainId)) {
      continue;
    }
    const tierWeight =
      candidate.tier === 2
        ? difficultyProfile.research.tripleStackTier2Weight
        : difficultyProfile.research.tripleStackTier3Weight;
    score = Math.max(score, tierWeight);
    if (opportunity.missingDomains.size === 1) {
      score += difficultyProfile.research.emergentRuleNearBonus;
    }
  }
  return score;
}

// ---------------------------------------------------------------------------
// Logistics scoring
// ---------------------------------------------------------------------------

function getMountedShare(state: GameState, factionId: FactionId): number {
  let living = 0;
  let mounted = 0;
  for (const unit of state.units.values()) {
    if (unit.factionId !== factionId || unit.hp <= 0) continue;
    const prototype = state.prototypes.get(unit.prototypeId);
    if (!prototype) continue;
    living += 1;
    if (prototype.derivedStats.role === 'mounted') {
      mounted += 1;
    }
  }
  return living > 0 ? mounted / living : 0;
}

export function scoreLogisticsFit(
  state: GameState,
  factionId: FactionId,
  strategy: FactionStrategy,
  candidate: CandidateNode,
): number {
  const economy = state.economy.get(factionId) ?? { supplyIncome: 0, supplyDemand: 0 };
  const supplyDeficit = Math.max(0, economy.supplyDemand - economy.supplyIncome);
  if (supplyDeficit <= 0) return 0;

  const mountedShare = getMountedShare(state, factionId);
  let score = 0;
  if (mountedShare >= 0.4) {
    if (candidate.domainId === 'hitrun') score += 1.5;
    if (candidate.domainId === 'nature_healing') score += 1.2;
    if (candidate.domainId === 'river_stealth') score += 1.0;
    if (candidate.domainId === 'fortress') score += 1.0;
  }
  if (candidate.domainId === 'charge' || candidate.domainId === 'heavy_hitter') {
    score -= 0.8;
  }

  const personalityPreference = scoreResearchCandidate(
    strategy.personality,
    { supplyDeficit },
    { domainId: candidate.domainId, codifies: candidate.def.codifies },
  );

  return score + personalityPreference * 0.8;
}

// ---------------------------------------------------------------------------
// Reason string builder
// ---------------------------------------------------------------------------

export interface ResearchScores {
  native: number;
  posture: number;
  signature: number;
  synergy: number;
  tier: number;
  gameState: number;
  doctrinePackage: number;
  logistics: number;
  depthFocus: number;
  breadthPivot: number;
  hybridBreadth: number;
  emergentBreadth: number;
  tripleStack: number;
}

export function buildResearchReason(
  candidate: CandidateNode,
  posture: FactionStrategy['posture'],
  scores: ResearchScores,
): string {
  const parts: string[] = [`${posture} posture`, candidate.def.id];
  if (candidate.isNative) parts.push('native domain');
  if (scores.native > 0) parts.push('native priority');
  if (scores.posture > 0) parts.push('posture-aligned');
  if (scores.signature > 0) parts.push('signature unit synergy');
  if (scores.synergy > 0) parts.push('hybrid/absorption goal');
  if (scores.tier > 0) parts.push('tier 2 urgency');
  if (scores.gameState > 0) parts.push('game-state urgency');
  if (scores.doctrinePackage > 0) parts.push('doctrine package');
  if (scores.logistics > 0) parts.push('logistics fit');
  if (scores.depthFocus > 0) parts.push('tier 3 depth push');
  if (scores.breadthPivot > 0) parts.push('breadth pivot');
  if (scores.hybridBreadth > 0) parts.push('hybrid breadth');
  if (scores.emergentBreadth > 0) parts.push('emergent breadth');
  if (scores.tripleStack > 0) parts.push('triple-stack reach');
  return parts.join(', ');
}
