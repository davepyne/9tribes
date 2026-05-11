/**
 * Research inspector view model extracted from worldViewModel.
 */

import type { GameState } from '../../../../../src/game/types.js';
import type { RulesRegistry, ResearchNodeDef } from '../../../../../src/data/registry/types.js';
import {
  getDomainTier,
} from '../../../../../src/systems/researchSystem.js';
import { getForeignT1Cost } from '../../../../../src/systems/knowledgeSystem.js';
import { getDomainProgression } from '../../../../../src/systems/domainProgression.js';
import type {
  ResearchInspectorViewModel,
  ResearchNodeViewState,
  ResearchNodeViewModel,
} from '../../types/clientState';
import HYBRID_RECIPES from '../../../../../src/content/base/hybrid-recipes.json';
import SIGNATURE_ABILITIES from '../../../../../src/content/base/signatureAbilities.json';
import CIVILIZATIONS from '../../../../../src/content/base/civilizations.json';
import { getFaction, getResearch, getResearchProgress, isResearchNodeCompleted, getUnit, getCity } from '../../stateAccess.js';
import {
  DOMAIN_TERRAIN_AFFINITY,
  MAX_RESEARCH_TERRAIN_BONUS,
  TERRAIN_RESEARCH_BONUS,
  RESEARCH_PROXIMITY_BONUS_PER_CONTACT,
} from '../../../../../src/systems/simulation/factionTurnEffects.js';
import { getHexesInRange, hexToKey, hexDistance } from '../../../../../src/core/grid.js';

type UnlockEntry = { type: 'component' | 'chassis' | 'improvement' | 'recipe'; id: string; name: string };

type SignatureSummon = {
  chassisId: string;
  name: string;
};

function getSignatureSummon(value: unknown): SignatureSummon | null {
  if (!value || typeof value !== 'object' || !('summon' in value)) return null;
  const summon = (value as { summon?: unknown }).summon;
  if (!summon || typeof summon !== 'object') return null;
  const maybeSummon = summon as { chassisId?: unknown; name?: unknown };
  return typeof maybeSummon.chassisId === 'string' && typeof maybeSummon.name === 'string'
    ? { chassisId: maybeSummon.chassisId, name: maybeSummon.name }
    : null;
}

function getUnitUnlocksForNode(
  domainId: string,
  tier: number,
  nativeFaction: string,
): UnlockEntry[] {
  const unlocks: UnlockEntry[] = [];

  // T2 unlocks: mid-tier hybrid recipes (minLearnedDomains === 2) from the domain's native faction
  if (tier >= 2) {
    for (const recipe of Object.values(HYBRID_RECIPES) as { id: string; name: string; minLearnedDomains: number; nativeFaction: string }[]) {
      if (recipe.nativeFaction === nativeFaction && recipe.minLearnedDomains === 2) {
        unlocks.push({ type: 'recipe', id: recipe.id, name: recipe.name });
      }
    }
  }

  // T3 unlocks: late-tier hybrid recipes (minLearnedDomains === 3) from the domain's native faction
  if (tier >= 3) {
    for (const recipe of Object.values(HYBRID_RECIPES) as { id: string; name: string; minLearnedDomains: number; nativeFaction: string }[]) {
      if (recipe.nativeFaction === nativeFaction && recipe.minLearnedDomains === 3) {
        unlocks.push({ type: 'recipe', id: recipe.id, name: recipe.name });
      }
    }

    // T3 also unlocks the signature summon unit for this faction (if it exists)
    const summon = getSignatureSummon(SIGNATURE_ABILITIES[nativeFaction as keyof typeof SIGNATURE_ABILITIES]);
    if (summon) {
      unlocks.push({ type: 'recipe', id: summon.chassisId, name: summon.name });
    }
  }

  return unlocks;
}

function getNativeFactionForDomain(domainId: string): string {
  for (const civ of Object.values(CIVILIZATIONS) as { id: string; nativeDomain: string }[]) {
    if (civ.nativeDomain === domainId) {
      return civ.id;
    }
  }
  return '';
}

interface EcologyBonusSource {
  type: 'terrain' | 'proximity' | 'combat';
  amount: number;
  detail: string;
}

function computeEcologyBonusesForDomain(
  state: GameState,
  factionId: string,
  domainId: string,
): { bonus: number; sources: EcologyBonusSource[] } {
  const faction = getFaction(state, factionId);
  if (!faction || !state.map) {
    return { bonus: 0, sources: [] };
  }

  const sources: EcologyBonusSource[] = [];
  const affinityTerrains = DOMAIN_TERRAIN_AFFINITY?.[domainId];

  // Terrain bonus
  if (affinityTerrains) {
    const affinitySet = new Set(affinityTerrains);
    let terrainBonus = 0;
    let unitCount = 0;

    for (const uid of faction.unitIds) {
      const u = getUnit(state, uid);
      if (!u || u.hp <= 0) continue;
      const tile = state.map.tiles.get(hexToKey(u.position));
      if (tile && affinitySet.has(tile.terrain)) {
        terrainBonus += TERRAIN_RESEARCH_BONUS[tile.terrain] ?? 0.5;
        unitCount++;
      }
    }

    for (const cid of faction.cityIds) {
      const city = getCity(state, cid);
      if (!city) continue;
      const radius = city.territoryRadius ?? 2;
      for (const hex of getHexesInRange(city.position, radius)) {
        const tile = state.map.tiles.get(hexToKey(hex));
        if (tile && affinitySet.has(tile.terrain)) {
          terrainBonus += TERRAIN_RESEARCH_BONUS[tile.terrain] ?? 0.5;
        }
      }
    }

    terrainBonus = Math.min(terrainBonus, MAX_RESEARCH_TERRAIN_BONUS);
    if (terrainBonus > 0) {
      sources.push({
        type: 'terrain',
        amount: terrainBonus,
        detail: `${unitCount} units + city territory on ${affinityTerrains.slice(0, 2).join('/')} terrain`,
      });
    }
  }

  // Proximity bonus
  let proximityBonus = 0;
  let contactCount = 0;
  for (const uid of faction.unitIds) {
    const fUnit = getUnit(state, uid);
    if (!fUnit || fUnit.hp <= 0) continue;
    for (const [eid, enemyUnit] of state.units) {
      if (enemyUnit.factionId === factionId || enemyUnit.hp <= 0) continue;
      if (hexDistance(fUnit.position, enemyUnit.position) <= 2) {
        const enemyFaction = getFaction(state, enemyUnit.factionId);
        if (enemyFaction && enemyFaction.nativeDomain === domainId) {
          proximityBonus += RESEARCH_PROXIMITY_BONUS_PER_CONTACT;
          contactCount++;
        }
      }
    }
  }

  if (proximityBonus > 0) {
    proximityBonus = Math.min(proximityBonus, MAX_RESEARCH_TERRAIN_BONUS);
    sources.push({
      type: 'proximity',
      amount: proximityBonus,
      detail: `${contactCount} enemy contacts within range`,
    });
  }

  // Combat bonus — read per-turn accumulator from research state
  const rs = getResearch(state, factionId);
  const combatThisTurn = rs?.combatResearchBonusThisTurn?.[domainId] ?? 0;
  if (combatThisTurn > 0) {
    sources.push({
      type: 'combat',
      amount: combatThisTurn,
      detail: `${combatThisTurn.toFixed(0)} combat action${combatThisTurn > 1 ? 's' : ''} this turn`,
    });
  }

  const totalBonus = Math.min(
    sources.reduce((sum, s) => sum + s.amount, 0),
    MAX_RESEARCH_TERRAIN_BONUS,
  );

  return { bonus: totalBonus, sources };
}

export function buildResearchInspectorViewModel(
  state: GameState,
  registry: RulesRegistry,
): ResearchInspectorViewModel | null {
  const factionId = state.activeFactionId;
  if (!factionId) return null;
  const faction = getFaction(state, factionId);
  if (!faction) return null;

  const research = getResearch(state, factionId);
  if (!research) return null;

  const nativeDomain = faction.nativeDomain ?? '';
  const learnedDomains = faction.learnedDomains ?? [nativeDomain];
  const assimilatedCount = faction.assimilatedDomainCount ?? 0;
  const allDomains = registry.getAllResearchDomains();
  const progression = getDomainProgression(faction, research);

  // Build node VMs across all research domains
  const nodes: ResearchNodeViewModel[] = [];
  for (const domainDef of allDomains) {
    const domainId = domainDef.id;
    const isNative = domainId === nativeDomain;
    const isUnlocked = learnedDomains.includes(domainId);
    const domainNativeFaction = getNativeFactionForDomain(domainId);

    for (const nodeDef of Object.values(domainDef.nodes) as ResearchNodeDef[]) {
      const isCompleted = isResearchNodeCompleted(research, nodeDef.id);
      const isActive = research.activeNodeId === nodeDef.id;
      const progress = getResearchProgress(research, nodeDef.id);

      const prereqsMet = (nodeDef.prerequisites ?? []).every((prereqId) =>
        isResearchNodeCompleted(research, prereqId),
      );

      const isForeignT1 = !isUnlocked && (nodeDef.tier ?? 1) === 1;
      const foreignT1Cost = isForeignT1 ? getForeignT1Cost(assimilatedCount) : 0;

      let nodeState: ResearchNodeViewState;
      if (isCompleted) {
        nodeState = 'completed';
      } else if (isForeignT1) {
        // Foreign T1: assimilating via ecology — show as active if progress exists, available otherwise
        nodeState = progress > 0 ? 'active' : 'available';
      } else if (!isUnlocked) {
        nodeState = 'locked';
      } else if (isActive) {
        nodeState = 'active';
      } else if (!prereqsMet) {
        nodeState = 'locked';
      } else {
        nodeState = 'available';
      }

      const effectiveCost = isForeignT1 ? foreignT1Cost : nodeDef.xpCost;

      const estimatedTurns =
        nodeState === 'active' && research.researchPerTurn > 0 && !isForeignT1
          ? Math.ceil(Math.max(0, effectiveCost - progress) / research.researchPerTurn)
          : null;

      // Ecology/war auto-progress — compute for ALL domains
      // For foreign T1: ecology XP now counts toward assimilation (real progress)
      // For foreign T2+/unlearned: still potential-only
      let ecologyBonus = 0;
      let ecologySources: { type: 'terrain' | 'proximity' | 'combat'; amount: number; detail: string }[] = [];
      let ecologyEstimatedTurns: number | null = null;
      let isEcologyActive = false;
      let potentialEcologyBonus = 0;
      let potentialEcologySources: { type: 'terrain' | 'proximity' | 'combat'; amount: number; detail: string }[] = [];

      const { bonus, sources } = computeEcologyBonusesForDomain(state, factionId, domainId);
      if (bonus > 0) {
        if (isForeignT1) {
          // Foreign T1: ecology IS real assimilation progress
          ecologyBonus = bonus;
          ecologySources = sources;
          isEcologyActive = true;
          ecologyEstimatedTurns = effectiveCost > 0 ? Math.ceil(Math.max(0, effectiveCost - progress) / bonus) : null;
        } else if (isUnlocked && !isCompleted) {
          // Learned domain with incomplete node — real passive progress
          ecologyBonus = bonus;
          ecologySources = sources;
          isEcologyActive = true;
          ecologyEstimatedTurns = Math.ceil(Math.max(0, effectiveCost - progress) / bonus);
        } else {
          // Locked non-T1 domain — show potential only
          potentialEcologyBonus = bonus;
          potentialEcologySources = sources;
        }
      }

      nodes.push({
        nodeId: nodeDef.id,
        name: nodeDef.name,
        tier: nodeDef.tier ?? 1,
        xpCost: effectiveCost,
        discountedXpCost: null,
        currentProgress: progress,
        state: nodeState,
        prerequisites: nodeDef.prerequisites ?? [],
        prerequisiteNames: [],
        unlocks: getUnitUnlocksForNode(domainId, nodeDef.tier ?? 1, domainNativeFaction),
        qualitativeEffect: isNative
          ? (nodeDef.qualitativeEffect?.nativeDescription ?? nodeDef.qualitativeEffect?.description ?? null)
          : (nodeDef.qualitativeEffect?.description ?? null),
        estimatedTurns,
        ecologyBonus,
        ecologySources,
        ecologyEstimatedTurns,
        isEcologyActive,
        potentialEcologyBonus,
        potentialEcologySources,
        domain: domainId,
        isNative,
        isLocked: isForeignT1 ? false : !isUnlocked,
        isDomainLocked: isForeignT1 ? false : !isUnlocked,
        isForeignAssimilating: isForeignT1 && !isCompleted,
      });
    }
  }

  // Build domain pips for all 10 research domains
  const capabilitiesVms = allDomains.map((domainDef: { id: string; name: string }) => {
    const domainId = domainDef.id;
    const tier = getDomainTier(faction, domainId, research.completedNodes);
    return {
      domainId,
      domainName: domainDef.name,
      description: domainDef.name,
      level: tier,
      hasResearchTrack: true,
      codified: learnedDomains.includes(domainId),
      t1Ready: tier >= 1,
      t2Ready: tier >= 2,
    };
  });

  // Find active node info across domains
  let activeNodeName: string | null = null;
  let activeNodeCost: number | null = null;
  let activeNodeProgress: number | null = null;

  if (research.activeNodeId) {
    const domainId = research.activeNodeId.split('_t')[0];
    const domain = registry.getResearchDomain(domainId);
    if (domain?.nodes[research.activeNodeId]) {
      activeNodeName = domain.nodes[research.activeNodeId].name;
      activeNodeCost = domain.nodes[research.activeNodeId].xpCost;
      activeNodeProgress = getResearchProgress(research, research.activeNodeId);
    }
  }

  // Simplified rate breakdown — flat base rate only
  const totalRate = research.researchPerTurn;

  // Ecology total from all active ecology nodes
  const ecologyNodes = nodes.filter(n => n.isEcologyActive);
  const ecologyTotal = ecologyNodes.reduce((sum, n) => sum + (n.ecologyBonus ?? 0), 0);

  return {
    factionId,
    activeNodeId: research.activeNodeId,
    activeNodeName,
    activeNodeProgress,
    activeNodeXpCost: activeNodeCost,
    completedCount: research.completedNodes.length,
    totalNodes: nodes.length,
    nodes,
    capabilities: capabilitiesVms,
    rateBreakdown: {
      base: research.researchPerTurn,
      detail: progression.canBuildLateTier
        ? `${learnedDomains.length} domains unlocked · late-tier production available`
        : progression.canBuildMidTier
          ? `${learnedDomains.length} domains unlocked · mid-tier production available`
          : `${learnedDomains.length} domain unlocked · base production only`,
      total: totalRate,
      ecologyTotal,
    },
    hasKnowledgeDiscount: false,
  };
}
