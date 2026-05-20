import type { GameState } from '../../game/types.js';
import type { FactionId } from '../../types.js';
import type { RulesRegistry } from '../../data/registry/types.js';
import type { SimulationTrace } from './traceTypes.js';
import { log, recordResearch } from './traceRecorder.js';
import { getCity } from '../../game/stateAccess.js';
import { hexToKey, hexDistance, getHexesInRange } from '../../core/grid.js';
import { getNativeDomains } from '../../features/factions/types.js';
import { addResearchProgressToNode, getNextResearchNodeForDomain } from '../researchSystem.js';
import { getEffectiveXpCost, getForeignT1Cost, isDomainRestricted } from '../knowledgeSystem.js';

export const DOMAIN_TERRAIN_AFFINITY: Record<string, readonly string[]> = {
  venom:            ['jungle'],
  nature_healing:   ['forest'],
  fortress:         ['hill', 'mountain'],
  charge:           ['savannah'],
  hitrun:           ['plains'],
  camel_adaptation: ['desert', 'oasis'],
  tidal_warfare:    ['coast', 'ocean'],
  river_stealth:    ['river', 'swamp'],
  slaving:          ['coast', 'ocean'],
  heavy_hitter:     ['tundra'],
};

export const TERRAIN_RESEARCH_BONUS: Record<string, number> = {
  plains:    0.5,
  savannah:  0.5,
  hill:      0.25,
  coast:     0.25,
  forest:    0.5,
  jungle:    1.75,
  desert:    0.5,
  tundra:    1.0,
  river:     1.75,
  swamp:     2.0,
  mountain:  3.0,
  ocean:     0.5,
  oasis:     2.0,
};

export const MAX_RESEARCH_TERRAIN_BONUS = 5;

export function computeTerrainResearchBonuses(
  state: GameState,
  factionId: FactionId,
  domainIds: readonly string[],
): Map<string, number> {
  const result = new Map<string, number>();
  const faction = state.factions.get(factionId);
  if (!faction || !state.map) return result;

  for (const domainId of domainIds) {
    const affinityTerrains = DOMAIN_TERRAIN_AFFINITY[domainId];
    if (!affinityTerrains) continue;

    const affinitySet = new Set(affinityTerrains);
    let bonus = 0;

    for (const uid of faction.unitIds) {
      const u = state.units.get(uid as import('../../types.js').UnitId);
      if (!u || u.hp <= 0) continue;
      const tile = state.map.tiles.get(hexToKey(u.position));
      if (tile && affinitySet.has(tile.terrain)) {
        bonus += TERRAIN_RESEARCH_BONUS[tile.terrain] ?? 0.5;
      }
    }

    for (const cid of faction.cityIds) {
      const city = getCity(state, cid);
      if (!city) continue;
      const radius = city.territoryRadius ?? 2;
      for (const hex of getHexesInRange(city.position, radius)) {
        const tile = state.map.tiles.get(hexToKey(hex));
        if (tile && affinitySet.has(tile.terrain)) {
          bonus += TERRAIN_RESEARCH_BONUS[tile.terrain] ?? 0.5;
        }
      }
    }

    result.set(domainId, Math.min(bonus, MAX_RESEARCH_TERRAIN_BONUS));
  }
  return result;
}

export const RESEARCH_PROXIMITY_BONUS_PER_CONTACT = 0.5;

export function computeProximityResearchBonuses(
  state: GameState,
  factionId: FactionId,
): Map<string, number> {
  const result = new Map<string, number>();
  const faction = state.factions.get(factionId);
  if (!faction) return result;

  for (const uid of faction.unitIds) {
    const fUnit = state.units.get(uid as import('../../types.js').UnitId);
    if (!fUnit || fUnit.hp <= 0) continue;
    for (const [, enemyUnit] of state.units) {
      if (enemyUnit.factionId === factionId || enemyUnit.hp <= 0) continue;
      if (hexDistance(fUnit.position, enemyUnit.position) <= 2) {
        const enemyFaction = state.factions.get(enemyUnit.factionId);
        if (enemyFaction) {
          result.set(
            enemyFaction.nativeDomain,
            (result.get(enemyFaction.nativeDomain) ?? 0) + RESEARCH_PROXIMITY_BONUS_PER_CONTACT,
          );
        }
      }
    }
  }
  return result;
}

export function buildEcologyBreakdown(
  sortedDomains: string[],
  terrainBonuses: Map<string, number>,
  proximityBonuses: Map<string, number>,
  combatBonuses: Record<string, number> | undefined,
): {
  bonuses: Record<string, number>;
  breakdown: Record<string, Array<{ type: 'terrain' | 'proximity' | 'combat'; amount: number; detail: string }>>;
} {
  const bonuses: Record<string, number> = {};
  const breakdown: Record<string, Array<{ type: 'terrain' | 'proximity' | 'combat'; amount: number; detail: string }>> = {};

  for (const domainId of sortedDomains) {
    const terrain = terrainBonuses.get(domainId) ?? 0;
    const proximity = proximityBonuses.get(domainId) ?? 0;
    const combatBonus = combatBonuses?.[domainId] ?? 0;
    const totalBonus = Math.min(terrain + proximity, MAX_RESEARCH_TERRAIN_BONUS) + combatBonus;
    if (totalBonus <= 0) continue;

    const sources: Array<{ type: 'terrain' | 'proximity' | 'combat'; amount: number; detail: string }> = [];
    if (terrain > 0) sources.push({ type: 'terrain', amount: Math.min(terrain, MAX_RESEARCH_TERRAIN_BONUS), detail: `Terrain bonus: +${terrain.toFixed(2)}` });
    if (proximity > 0) sources.push({ type: 'proximity', amount: proximity, detail: `Proximity bonus: +${proximity.toFixed(2)}` });
    if (combatBonus > 0) sources.push({ type: 'combat', amount: combatBonus, detail: `Combat bonus: +${combatBonus.toFixed(0)}` });

    bonuses[domainId] = totalBonus;
    breakdown[domainId] = sources;
  }

  if (combatBonuses) {
    for (const [domainId, bonus] of Object.entries(combatBonuses)) {
      if (!breakdown[domainId]) {
        bonuses[domainId] = bonus;
        breakdown[domainId] = [{ type: 'combat', amount: bonus, detail: `Combat bonus: +${bonus.toFixed(0)}` }];
      }
    }
  }

  return { bonuses, breakdown };
}

export function applyEcologyResearchPass(
  state: GameState,
  factionId: FactionId,
  registry: RulesRegistry,
  trace?: SimulationTrace,
): GameState {
  const faction = state.factions.get(factionId);
  if (!faction) return state;

  const learnedDomains = faction.learnedDomains;
  const assimilatedCount = faction.assimilatedDomainCount ?? 0;

  const allDomainIds = registry.getAllResearchDomains().map(d => d.id);
  const terrainBonuses = computeTerrainResearchBonuses(state, factionId, allDomainIds);
  const proximityBonuses = computeProximityResearchBonuses(state, factionId);

  const allDomains = new Set([...terrainBonuses.keys(), ...proximityBonuses.keys()]);
  if (allDomains.size === 0) return state;

  let research = state.research.get(factionId);
  if (!research) return state;
  let currentResearch = research;
  let changed = false;
  let updatedFaction = faction;

  const nativeDomains = new Set(getNativeDomains(faction));
  const learnedSet = new Set(learnedDomains);
  const sortedDomains = [...allDomains].sort((a, b) => {
    const aNative = nativeDomains.has(a);
    const bNative = nativeDomains.has(b);
    if (aNative && !bNative) return -1;
    if (!aNative && bNative) return 1;
    const aLearned = learnedSet.has(a);
    const bLearned = learnedSet.has(b);
    if (aLearned && !bLearned) return -1;
    if (!aLearned && bLearned) return 1;
    const aNext = getNextResearchNodeForDomain(a, currentResearch.completedNodes);
    const bNext = getNextResearchNodeForDomain(b, currentResearch.completedNodes);
    const aProgress = aNext ? (currentResearch.progressByNodeId[aNext.nodeId] ?? 0) : 0;
    const bProgress = bNext ? (currentResearch.progressByNodeId[bNext.nodeId] ?? 0) : 0;
    return bProgress - aProgress;
  });

  for (const domainId of sortedDomains) {
    const isLearned = learnedSet.has(domainId);
    const terrain = terrainBonuses.get(domainId) ?? 0;
    const proximity = proximityBonuses.get(domainId) ?? 0;
    const totalBonus = Math.min(terrain + proximity, MAX_RESEARCH_TERRAIN_BONUS);
    if (totalBonus <= 0) continue;

    if (isLearned) {
      const nextNode = getNextResearchNodeForDomain(domainId, currentResearch.completedNodes);
      if (!nextNode) continue;

      const domain = registry.getAllResearchDomains().find(d => d.id === domainId);
      const nodeDef = domain?.nodes[nextNode.nodeId];
      if (!nodeDef) continue;

      const domainCost = getEffectiveXpCost(faction, domainId, nodeDef.xpCost);

      const { state: updatedResearch, completed } = addResearchProgressToNode(
        currentResearch, nextNode.nodeId, domainCost, totalBonus,
      );
      currentResearch = updatedResearch;
      changed = true;

      if (completed) {
        log(trace, `${faction.name} ecology completed ${nextNode.nodeId} (${domainId} T${nextNode.tier})`);
        recordResearch(trace, {
          round: state.round,
          factionId,
          phase: 'completed',
          nodeId: nextNode.nodeId,
          nodeName: nodeDef.name,
          domainId,
        });
      } else {
        log(trace, `${faction.name} ecology: +${totalBonus} ${domainId} progress (${currentResearch.progressByNodeId[nextNode.nodeId] ?? 0}/${domainCost})`);
      }
    } else {
      if (isDomainRestricted(domainId)) {
        continue;
      }
      const t1NodeId = `${domainId}_t1` as import('../../types.js').ResearchNodeId;
      if (currentResearch.completedNodes.includes(t1NodeId)) continue;

      const dynamicCost = getEffectiveXpCost(faction, domainId, getForeignT1Cost(assimilatedCount));

      const { state: updatedResearch, completed } = addResearchProgressToNode(
        currentResearch, t1NodeId, dynamicCost, totalBonus,
      );
      currentResearch = updatedResearch;
      changed = true;

      if (completed) {
        const newLearnedDomains = [...learnedDomains, domainId];
        const newAssimilatedCount = assimilatedCount + 1;
        updatedFaction = {
          ...updatedFaction,
          learnedDomains: newLearnedDomains,
          assimilatedDomainCount: newAssimilatedCount,
          domainAcquisitionMethod: {
            ...updatedFaction.domainAcquisitionMethod,
            [domainId]: 'ecology',
          },
        };

        log(trace, `${faction.name} has ASSIMILATED ${domainId} through ecological exposure (cost: ${dynamicCost} XP)`);

        const domainReg = registry.getAllResearchDomains().find(d => d.id === domainId);
        recordResearch(trace, {
          round: state.round,
          factionId,
          phase: 'completed',
          nodeId: t1NodeId,
          nodeName: domainReg?.nodes[t1NodeId]?.name ?? domainId,
          domainId,
        });
      } else {
        log(trace, `${faction.name} ecology: +${totalBonus} ${domainId} T1 assimilation (${(currentResearch.progressByNodeId as Record<string, number>)[t1NodeId] ?? 0}/${dynamicCost})`);
      }
    }
  }

  const { bonuses: ecologyBonuses, breakdown: ecologyBreakdown } = buildEcologyBreakdown(
    sortedDomains, terrainBonuses, proximityBonuses, currentResearch.combatResearchBonusThisTurn,
  );
  const researchWithEcology = { ...currentResearch, ecologyBonusesThisTurn: ecologyBonuses, ecologyBreakdownThisTurn: ecologyBreakdown };

  if (!changed) {
    if (Object.keys(ecologyBonuses).length > 0) {
      const researchMap = new Map(state.research);
      researchMap.set(factionId, researchWithEcology);
      return { ...state, research: researchMap };
    }
    return state;
  }

  const researchMap = new Map(state.research);
  researchMap.set(factionId, researchWithEcology);

  const factions = new Map(state.factions);
  factions.set(factionId, updatedFaction);

  return { ...state, research: researchMap, factions };
}
