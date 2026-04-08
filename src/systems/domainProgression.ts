import type { Faction } from '../features/factions/types.js';
import type { ResearchState } from '../features/research/types.js';

export interface DomainProgression {
  learnedDomainCount: number;
  t1Domains: string[];
  t2Domains: string[];
  t3Domains: string[];
  pairEligibleDomains: string[];
  emergentEligibleDomains: string[];
  nativeT3Domains: string[];
  foreignT3Domains: string[];
  canBuildMidTier: boolean;
  canBuildLateTier: boolean;
}

export function getMinLearnedDomainsForTier(tier: 'base' | 'mid' | 'late' | undefined): number {
  switch (tier) {
    case 'mid':
      return 2;
    case 'late':
      return 3;
    default:
      return 1;
  }
}

export function getMinLearnedDomainsRequirement(
  value: { minLearnedDomains?: number; tier?: 'base' | 'mid' | 'late' },
): number {
  return value.minLearnedDomains ?? getMinLearnedDomainsForTier(value.tier);
}

export function meetsLearnedDomainRequirement(
  progression: Pick<DomainProgression, 'learnedDomainCount'>,
  value: { minLearnedDomains?: number; tier?: 'base' | 'mid' | 'late' },
): boolean {
  return progression.learnedDomainCount >= getMinLearnedDomainsRequirement(value);
}

function getCompletedNodesSet(researchState: ResearchState | undefined): Set<string> {
  return new Set(researchState?.completedNodes ?? []);
}

function getHighestCompletedTier(domainId: string, completedNodes: Set<string>): number {
  if (completedNodes.has(`${domainId}_t3`)) return 3;
  if (completedNodes.has(`${domainId}_t2`)) return 2;
  if (completedNodes.has(`${domainId}_t1`)) return 1;
  return 0;
}

export function getDomainProgression(
  faction: Pick<Faction, 'nativeDomain' | 'learnedDomains'>,
  researchState?: ResearchState,
): DomainProgression {
  const learnedDomains = Array.from(new Set(faction.learnedDomains ?? []));
  const completedNodes = getCompletedNodesSet(researchState);
  const t1Domains: string[] = [];
  const t2Domains: string[] = [];
  const t3Domains: string[] = [];
  const nativeT3Domains: string[] = [];
  const foreignT3Domains: string[] = [];

  for (const domainId of learnedDomains) {
    const tier = getHighestCompletedTier(domainId, completedNodes);
    if (tier >= 1) t1Domains.push(domainId);
    if (tier >= 2) t2Domains.push(domainId);
    if (tier >= 3) {
      t3Domains.push(domainId);
      if (domainId === faction.nativeDomain) {
        nativeT3Domains.push(domainId);
      } else {
        foreignT3Domains.push(domainId);
      }
    }
  }

  return {
    learnedDomainCount: learnedDomains.length,
    t1Domains,
    t2Domains,
    t3Domains,
    pairEligibleDomains: t1Domains,
    emergentEligibleDomains: t2Domains,
    nativeT3Domains,
    foreignT3Domains,
    canBuildMidTier: learnedDomains.length >= 2,
    canBuildLateTier: learnedDomains.length >= 3,
  };
}

export function isDomainUnlockedForFaction(
  faction: Pick<Faction, 'learnedDomains'>,
  domainId: string,
): boolean {
  return (faction.learnedDomains ?? []).includes(domainId);
}

export function getDomainTierFromProgression(
  faction: Pick<Faction, 'nativeDomain' | 'learnedDomains'>,
  domainId: string,
  researchState?: ResearchState,
): number {
  const progression = getDomainProgression(faction, researchState);
  if (progression.t3Domains.includes(domainId)) return 3;
  if (progression.t2Domains.includes(domainId)) return 2;
  if (progression.t1Domains.includes(domainId)) return 1;
  return 0;
}
