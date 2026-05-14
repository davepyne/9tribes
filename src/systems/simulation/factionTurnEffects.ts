import type { GameState, Unit } from '../../game/types.js';
import type { RulesRegistry } from '../../data/registry/types.js';
import type { FactionId, HexCoord, UnitId, ChassisId } from '../../types.js';
import type { PrototypeId } from '../../types.js';
import type { Prototype } from '../../features/prototypes/types.js';
import type { VeteranLevel, UnitStatus } from '../../core/enums.js';
import { createImprovementId, createUnitId } from '../../core/ids.js';
import { hexToKey, hexDistance, getNeighbors, getHexesInRange } from '../../core/grid.js';
import { isHexOccupied } from '../occupancySystem.js';
import { resolveResearchDoctrine, prototypeHasComponent } from '../capabilityDoctrine.js';
import { addResearchProgress, addResearchProgressToNode, getNextResearchNodeForDomain, startResearch } from '../researchSystem.js';
import { unlockHybridRecipes } from '../hybridSystem.js';
import { deriveResourceIncome, getSupplyDeficit, advanceCaptureTimers } from '../economySystem.js';
import {
  advanceProduction,
  canCompleteCurrentProduction,
  canSpawnAt,
  completeProduction,
  getAvailableProductionPrototypes,
  getProjectedSupplyDemandWithPrototype,
  isSettlerPrototype,
  queueUnit,
} from '../productionSystem.js';
import { chooseStrategicProduction, rankProductionPriorities } from '../aiProductionStrategy.js';
import { chooseStrategicResearch } from '../aiResearchStrategy.js';
import { getCity, getPrototype } from '../../game/stateAccess.js';
import { includesResearchNode, asResearchNodeId } from '../../game/stateAccess.js';
import {
  degradeWalls,
  repairWalls,
  isCityVulnerable,
  getCapturingFaction,
  captureCityWithResult,
} from '../siegeSystem.js';
import {
  getFactionCityIds,
} from '../factionOwnershipSystem.js';
import {
  updateFogState,
} from '../fogSystem.js';
import {
  recoverMorale,
  checkRally,
} from '../moraleSystem.js';
import {
  tickStealthCooldown,
  enterStealth,
  getNatureHealingAura,
} from '../signatureAbilitySystem.js';
import { evaluateAndSpawnVillage } from '../villageSystem.js';
import { isCityEncircled, isEncirclementBroken } from '../territorySystem.js';
import { applyEcologyPressure, applyForceCompositionPressure } from '../capabilitySystem.js';
import { getDomainProgression } from '../domainProgression.js';
import { gainExposure, calculatePrototypeCost, getDomainIdsByTags, getForeignT1Cost, getEffectiveXpCost, isDomainRestricted } from '../knowledgeSystem.js';
import {
  computeFactionStrategy,
} from '../strategicAi.js';
import { getSynergyEngine, resolveEffectiveSynergies } from '../synergyRuntime.js';
import type { SynergyEngine, ActiveTripleStack, ActiveDoubleStack, ActiveSynergy } from '../synergyEngine.js';
import { applyHealingSynergies, type HealingContext } from '../synergyEffects.js';
import { getUnitAtHex } from '../occupancySystem.js';
import { maybeExpirePreparedAbility } from '../unitActivationSystem.js';
import type { DifficultyLevel } from '../aiDifficulty.js';
import { getAiDifficultyProfile } from '../aiDifficulty.js';
import type { FactionStrategy } from '../factionStrategy.js';
import type { SimulationTrace } from './traceTypes.js';
import { log, recordFactionStrategy, recordSiegeEvent, recordResearch, recordTripleStack } from './traceRecorder.js';
import { getTerrainAt, occupiesFriendlySettlement, applyEnvironmentalDamage, getHealRate } from './environmentalEffects.js';
import { isWetlandTerrain } from '../terrainUtils.js';
import { isPassiveWetlandStealth } from '../factionIdentitySystem.js';

function removeUnitFromFaction(
  state: GameState,
  factionId: FactionId,
  unitId: UnitId,
): GameState {
  const faction = state.factions.get(factionId);
  if (!faction) {
    return state;
  }

  const factions = new Map(state.factions);
  factions.set(factionId, {
    ...faction,
    unitIds: faction.unitIds.filter((id) => id !== unitId),
  });

  return { ...state, factions };
}

// Domain-to-terrain affinity: which terrain types boost research for each domain
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

// Per-hex research bonus scales with terrain rarity — rarer terrain gives more per hex
// Proportional to 1/frequency, rounded to nearest 0.25, with mountain capped at 3.0
export const TERRAIN_RESEARCH_BONUS: Record<string, number> = {
  plains:    0.5,   // 9.3%
  savannah:  0.5,   // 12.1%
  hill:      0.25,  // 18.0%
  coast:     0.25,  // 18.0%
  forest:    0.5,   // 8.6%
  jungle:    1.75,  // 2.5%
  desert:    0.5,   // 9.3%
  tundra:    1.0,   // 5.0%
  river:     1.75,  // 2.7%
  swamp:     2.0,   // 2.4%
  mountain:  3.0,   // 0.7% (impassable, only city territory collects)
  ocean:     0.5,   // 11.3%
  oasis:     2.0,   // not in base generation, grouped with swamp rarity
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
      const u = state.units.get(uid as UnitId);
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
    const fUnit = state.units.get(uid as UnitId);
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

function startOrAdvanceCodification(
  state: GameState,
  factionId: FactionId,
  registry: RulesRegistry,
  trace?: SimulationTrace,
  strategy?: FactionStrategy,
  difficulty?: DifficultyLevel,
): GameState {
  const faction = state.factions.get(factionId);
  const research = state.research.get(factionId);
  if (!faction || !research) {
    return state;
  }

  let currentResearch = research;
  if (!currentResearch.activeNodeId) {
    const decision = strategy ? chooseStrategicResearch(state, factionId, strategy, registry, difficulty) : null;
    if (decision) {
      const decisionNode = registry.getAllResearchDomains()
        .flatMap((domain) => Object.values(domain.nodes))
        .find((node) => node.id === decision.nodeId);
      const decisionDomain = registry.getAllResearchDomains()
        .find((domain) => domain.nodes[decision.nodeId]);
      const prerequisitesMet = (decisionNode?.prerequisites ?? []).every(
        (prereqId) => includesResearchNode(currentResearch.completedNodes, prereqId),
      );
      if (prerequisitesMet) {
        currentResearch = startResearch(
          currentResearch,
          asResearchNodeId(decision.nodeId),
          decisionNode?.prerequisites,
          faction.learnedDomains,
        );
        const nodeName = decisionNode?.name ?? decision.nodeId;
        log(trace, `${faction.name} starts research on ${nodeName} (${decision.reason})`);
        recordResearch(trace, {
          round: state.round,
          factionId,
          phase: 'started',
          nodeId: decision.nodeId,
          nodeName,
          domainId: decisionDomain?.id ?? '',
          reason: decision.reason,
        });
      }
    }
  }

  if (!currentResearch.activeNodeId) {
    return state;
  }

  const activeDomain = registry.getAllResearchDomains().find((domain) =>
    Boolean(domain.nodes[currentResearch.activeNodeId as string]),
  );
  const activeNode = activeDomain?.nodes[currentResearch.activeNodeId as string];
  if (!activeNode) {
    return state;
  }

  const researchAmount = difficulty
    ? getAiDifficultyProfile(difficulty).researchRate
    : currentResearch.researchPerTurn;

  const domainCost = getEffectiveXpCost(faction, activeDomain?.id ?? '', activeNode.xpCost);

  const updatedResearch = addResearchProgress(
    currentResearch,
    domainCost,
    researchAmount,
  );

  const researchMap = new Map(state.research);
  researchMap.set(factionId, updatedResearch);
  const current = { ...state, research: researchMap };

  if (!updatedResearch.activeNodeId) {
    log(trace, `${faction.name} completed research: ${activeNode.name}`);
    recordResearch(trace, {
      round: state.round,
      factionId,
      phase: 'completed',
      nodeId: activeNode.id,
      nodeName: activeNode.name,
      domainId: activeDomain?.id ?? '',
    });
  }

  return current;
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

  // Compute bonuses for ALL domains (learned + foreign) — cultural assimilation
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

  // Sort ecology domains by priority: native > learned > foreign with progress
  const nativeDomain = faction.nativeDomain ?? '';
  const learnedSet = new Set(learnedDomains);
  const sortedDomains = [...allDomains].sort((a, b) => {
    if (a === nativeDomain && b !== nativeDomain) return -1;
    if (b === nativeDomain && a !== nativeDomain) return 1;
    // Learned domains before foreign
    const aLearned = learnedSet.has(a);
    const bLearned = learnedSet.has(b);
    if (aLearned && !bLearned) return -1;
    if (!aLearned && bLearned) return 1;
    // Then by most progress
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
      // Learned domain: apply to next incomplete node (T2 or T3) as before
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
      // Foreign domain: apply ecology XP toward T1 assimilation with scaled cost
      // Skip restricted domains (can only be acquired natively)
      if (isDomainRestricted(domainId)) {
        continue;
      }
      const t1NodeId = `${domainId}_t1` as import('../../types.js').ResearchNodeId;
      // Skip if T1 already somehow completed
      if (currentResearch.completedNodes.includes(t1NodeId)) continue;

      const dynamicCost = getEffectiveXpCost(faction, domainId, getForeignT1Cost(assimilatedCount));

      const { state: updatedResearch, completed } = addResearchProgressToNode(
        currentResearch, t1NodeId, dynamicCost, totalBonus,
      );
      currentResearch = updatedResearch;
      changed = true;

      if (completed) {
        // Domain assimilated via ecology! Add to learned domains.
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

  // Update faction if any domains were assimilated this turn
  const factions = new Map(state.factions);
  factions.set(factionId, updatedFaction);

  return { ...state, research: researchMap, factions };
}

function chooseBestChassis(
  state: GameState,
  factionId: FactionId,
  registry: RulesRegistry
): { chassisId: string; prototypeId: string } | null {
  const faction = state.factions.get(factionId);
  const availablePrototypes = getAvailableProductionPrototypes(state, factionId, registry);
  if (!faction || availablePrototypes.length === 0) return null;

  const livingSteppeScreens = factionId === ('steppe_clan' as FactionId)
    ? faction.unitIds.reduce((count, unitId) => {
      const unit = state.units.get(unitId);
      if (!unit || unit.hp <= 0) {
        return count;
      }
      const prototype = state.prototypes.get(unit.prototypeId);
      if (!prototype || prototype.derivedStats.role === 'mounted') {
        return count;
      }
      const tags = new Set(prototype.tags ?? []);
      return tags.has('spear') || tags.has('formation') ? count + 1 : count;
    }, 0)
    : 0;
  const missingSteppeScreens = Math.max(0, 2 - livingSteppeScreens);

  const chassisCounts: Record<string, number> = {};
  const totalUnits = faction.unitIds.length;
  for (const unitId of faction.unitIds) {
    const unit = state.units.get(unitId);
    if (!unit || unit.hp <= 0) continue;
    const proto = state.prototypes.get(unit.prototypeId);
    if (proto) {
      chassisCounts[proto.chassisId] = (chassisCounts[proto.chassisId] ?? 0) + 1;
    }
  }

  const infantryFactionBonus =
    factionId === ('hill_clan' as FactionId)
      ? 2
      : factionId === ('druid_circle' as FactionId)
        ? 0.75
        : 0;
  const rangedFactionBonus =
    factionId === ('jungle_clan' as FactionId)
      ? 1.5
      : factionId === ('hill_clan' as FactionId)
        ? 1.0
        : factionId === ('druid_circle' as FactionId)
          ? 0.75
          : 0;
  const cavalryFactionBonus = factionId === ('steppe_clan' as FactionId) ? 2 : 0;
  const elephantFactionBonus = factionId === ('savannah_lions' as FactionId) ? 2 : 0;
  const navalFactionBonus = factionId === ('coral_people' as FactionId)
    ? 1.0
    : factionId === ('river_people' as FactionId)
      ? 1.5
      : 0;
  const steppeInfantryScreenBonus = missingSteppeScreens * 8;
  const steppeCavalryScreenPenalty = missingSteppeScreens * 3;

  const prototypeScores = availablePrototypes.map((prototype) => {
    const tags = new Set(prototype.tags ?? []);
    let score = 0;

    if (prototype.chassisId === 'infantry_frame' || prototype.chassisId === 'heavy_infantry_frame') {
      score += infantryFactionBonus + steppeInfantryScreenBonus;
      if (tags.has('fortress') || tags.has('formation')) score += 2;
    }

    if (prototype.chassisId === 'ranged_frame' || prototype.chassisId === 'ranged_naval_frame') {
      score += rangedFactionBonus;
      if (tags.has('ranged') || tags.has('skirmish')) score += 1.5;
    }

    if (prototype.chassisId === 'cavalry_frame' || prototype.chassisId === 'heavy_cavalry' || prototype.chassisId === 'chariot_frame') {
      score += cavalryFactionBonus - steppeCavalryScreenPenalty;
      if (tags.has('mobility') || tags.has('shock')) score += 2;
    }

    if (prototype.chassisId === 'camel_frame') {
      score += factionId === ('desert_nomads' as FactionId) ? 2 : 0;
      if (tags.has('camel') || tags.has('desert')) score += 2;
    }

    if (prototype.chassisId === 'naval_frame' || prototype.chassisId === 'galley_frame') {
      score += navalFactionBonus;
      if (tags.has('naval') || tags.has('amphibious')) score += 2;
    }

    if (prototype.chassisId === 'elephant_frame') {
      score += elephantFactionBonus;
      if (tags.has('elephant') || tags.has('shock')) score += 2;
    }

    score -= (chassisCounts[prototype.chassisId] ?? 0) / Math.max(1, totalUnits) * 3;
    return { prototypeId: prototype.id, score };
  });

  prototypeScores.sort((a, b) => b.score - a.score);

  for (const { prototypeId } of prototypeScores) {
    const prototype = availablePrototypes.find((entry) => entry.id === prototypeId);
    if (prototype) {
      return { chassisId: prototype.chassisId, prototypeId: prototype.id };
    }
  }

  const fallbackProto = availablePrototypes[0];
  if (fallbackProto) {
    return { chassisId: fallbackProto.chassisId, prototypeId: fallbackProto.id };
  }

  return null;
}

export function tickSummonState(
  state: GameState,
  factionId: FactionId,
  registry: RulesRegistry,
  trace?: SimulationTrace
): GameState {
  const faction = state.factions.get(factionId);
  if (!faction) return state;

  const abilities = registry.getSignatureAbility(factionId);
  if (!abilities) return state;

  const summonConfig = abilities.summon;
  if (!summonConfig) return state;

  const summonDuration = abilities.summonDuration ?? 5;
  const cooldownDuration = abilities.cooldownDuration ?? 5;

  let summonState = faction.summonState ?? {
    summoned: false,
    turnsRemaining: 0,
    cooldownRemaining: 4,
    unitId: null,
  };

  if (summonState.summoned && summonState.unitId) {
    summonState = {
      ...summonState,
      turnsRemaining: summonState.turnsRemaining - 1,
    };

    if (summonState.turnsRemaining <= 0 && summonState.unitId) {
      const units = new Map(state.units);
      units.delete(summonState.unitId);

      const updatedFaction = {
        ...faction,
        unitIds: faction.unitIds.filter(id => id !== summonState.unitId),
        summonState: {
          ...summonState,
          summoned: false,
          unitId: null,
          cooldownRemaining: cooldownDuration,
        },
      };
      const factions = new Map(state.factions);
      factions.set(factionId, updatedFaction);

      log(trace, `${faction.name}'s ${summonConfig.name} expired`);
      return { ...state, units, factions };
    }
  }
  else if (summonState.cooldownRemaining > 0) {
    summonState = {
      ...summonState,
      cooldownRemaining: summonState.cooldownRemaining - 1,
    };
  }

  if (faction.summonState !== summonState) {
    const updatedFaction = { ...faction, summonState };
    const factions = new Map(state.factions);
    factions.set(factionId, updatedFaction);
    return { ...state, factions };
  }

  return state;
}

function applyWarlordAura(
  state: GameState,
  factionId: FactionId,
  registry: RulesRegistry,
  trace?: SimulationTrace
): GameState {
  const faction = state.factions.get(factionId);
  if (!faction) return state;

  const auraRadius = 3;
  const moraleBoost = 10;

  const warlordUnits: Unit[] = [];
  for (const unitId of faction.unitIds) {
    const unit = state.units.get(unitId);
    if (!unit || unit.hp <= 0) continue;
    const protoTags = state.prototypes.get(unit.prototypeId)?.tags ?? [];
    if (protoTags.includes('warlord')) {
      warlordUnits.push(unit);
    }
  }

  if (warlordUnits.length === 0) return state;

  const unitsMap = new Map(state.units);
  let anyBuffed = false;

  for (const warlord of warlordUnits) {
    for (const [unitId, unit] of unitsMap) {
      if (unit.hp <= 0 || unit.factionId !== factionId) continue;

      const dist = hexDistance(warlord.position, unit.position);
      if (dist > auraRadius) continue;

      const protoTags = state.prototypes.get(unit.prototypeId)?.tags ?? [];
      if (!protoTags.includes('cavalry') && !protoTags.includes('mounted')) continue;

      const newMorale = Math.min(100, unit.morale + moraleBoost);
      if (newMorale !== unit.morale) {
        unitsMap.set(unitId, { ...unit, morale: newMorale });
        anyBuffed = true;
      }
    }
  }

  if (anyBuffed) {
    log(trace, `${faction.name}'s Warlord Command aura buffed nearby cavalry/mounted units`);
  }

  return { ...state, units: unitsMap };
}

function setFactionSynergyFields(
  state: GameState,
  factionId: FactionId,
  fields: { activeTripleStack?: ActiveTripleStack; activeDoubleStack?: ActiveDoubleStack | null; activeNativeSelfPair?: ActiveSynergy | null },
): GameState {
  const faction = state.factions.get(factionId);
  if (!faction) return state;
  const factions = new Map(state.factions);
  factions.set(factionId, {
    ...faction,
    ...(fields.activeTripleStack !== undefined && { activeTripleStack: fields.activeTripleStack }),
    ...(fields.activeDoubleStack !== undefined && { activeDoubleStack: fields.activeDoubleStack ?? undefined }),
    ...(fields.activeNativeSelfPair !== undefined && { activeNativeSelfPair: fields.activeNativeSelfPair ?? undefined }),
  });
  return { ...state, factions };
}

function applyGhostArmyMovement(state: GameState, factionId: FactionId, bonusMovement: number): GameState {
  const units = new Map(state.units);
  const faction = state.factions.get(factionId);
  if (!faction) return state;

  for (const unitId of faction.unitIds) {
    const unit = units.get(unitId as UnitId);
    if (unit && unit.hp > 0) {
      units.set(unitId as UnitId, {
        ...unit,
        maxMoves: unit.maxMoves + bonusMovement,
        movesRemaining: unit.movesRemaining + bonusMovement,
      });
    }
  }
  return { ...state, units };
}

function applyJuggernautBonus(state: GameState, factionId: FactionId): GameState {
  const faction = state.factions.get(factionId);
  if (!faction) return state;
  const factions = new Map(state.factions);
  factions.set(factionId, { ...faction, juggernautActive: true });
  return { ...state, factions };
}

export function processFactionPhases(
  state: GameState,
  factionId: FactionId,
  registry: RulesRegistry,
  trace?: SimulationTrace,
  difficulty?: DifficultyLevel,
): GameState {
  const faction = state.factions.get(factionId);
  if (!faction || !state.map) {
    return state;
  }

  let current = state;

  // Reset per-turn research bonus accumulators
  const research = current.research.get(factionId);
  if (research?.combatResearchBonusThisTurn || research?.ecologyBonusesThisTurn || research?.ecologyBreakdownThisTurn) {
    const updatedResearch = { ...research, combatResearchBonusThisTurn: undefined, ecologyBonusesThisTurn: undefined, ecologyBreakdownThisTurn: undefined };
    const researchMap = new Map(current.research);
    researchMap.set(factionId, updatedResearch);
    current = { ...current, research: researchMap };
  }

  current = updateFogState(current, factionId);

  // Derive economy before strategy so the coordinator has current-turn supply data
  current = advanceCaptureTimers(current, factionId);
  const economy = deriveResourceIncome(current, factionId, registry);
  const economyMap = new Map(current.economy);
  economyMap.set(factionId, economy);
  current = { ...current, economy: economyMap };

  const strategy = computeFactionStrategy(current, factionId, registry, difficulty);
  const factionStrategies = new Map(current.factionStrategies);
  factionStrategies.set(factionId, strategy);
  current = { ...current, factionStrategies };
  recordFactionStrategy(trace, {
    round: current.round,
    factionId,
    posture: strategy.posture,
    primaryObjective: strategy.primaryObjective,
    primaryEnemyFactionId: strategy.primaryEnemyFactionId,
    primaryCityObjectiveId: strategy.primaryCityObjectiveId,
    threatenedCityIds: strategy.threatenedCities.map((threat) => threat.cityId),
    frontAnchors: strategy.fronts.map((front) => front.anchor),
    focusTargetUnitIds: strategy.focusTargetUnitIds,
    reasons: strategy.debugReasons,
  });
  log(trace, `${faction.name} strategy: ${strategy.posture} | ${strategy.primaryObjective}`);

  const engine = getSynergyEngine();
  const progression = getDomainProgression(faction, current.research.get(factionId));
  const pairEligible = progression.pairEligibleDomains;
  const emergentEligible = progression.emergentEligibleDomains;
  const nativeT3 = progression.nativeT3Domains.includes(faction.nativeDomain);

  // Resolve native self-pair (independent of foreign domains)
  const nativeSelfPair = nativeT3 ? engine.resolveNativeSelfPair(faction.nativeDomain) : null;

  // Resolve triple stack first (highest priority)
  const tripleStack = engine.resolveFactionTriple(pairEligible, emergentEligible);
  if (tripleStack) {
    log(trace, `${faction.name} activates ${tripleStack.name} — ${tripleStack.emergentRule.name} emergent!`);
    recordTripleStack(trace, {
      round: current.round,
      factionId,
      phase: 'activated',
      name: tripleStack.name,
      domains: tripleStack.domains,
      emergentRule: tripleStack.emergentRule.name,
    });
  }

  let tripleResult: ActiveTripleStack | undefined;
  let doubleResult: ActiveDoubleStack | null | undefined;
  if (tripleStack) {
    const emergent = tripleStack.emergentRule.effect;
    if (emergent.type === 'ghost_army') {
      current = applyGhostArmyMovement(current, factionId, emergent.phaseAlliesMovementBonus);
    }
    if (emergent.type === 'juggernaut') {
      current = applyJuggernautBonus(current, factionId);
    }
    tripleResult = tripleStack;
  } else {
    const prevTriple = faction.activeTripleStack;
    if (prevTriple) {
      recordTripleStack(trace, {
        round: current.round,
        factionId,
        phase: 'lost',
        name: prevTriple.name,
        domains: prevTriple.domains,
        emergentRule: prevTriple.emergentRule.name,
      });
    }

    const doubleStack = engine.resolveFactionDouble(faction.nativeDomain, pairEligible);
    if (doubleStack) {
      log(trace, `${faction.name} double stack: ${doubleStack.pairs.map(p => p.name).join(', ')} [${doubleStack.domains.join('+')}]`);
    }
    doubleResult = doubleStack;
  }

  current = setFactionSynergyFields(current, factionId, {
    activeTripleStack: tripleResult,
    activeDoubleStack: doubleResult,
    activeNativeSelfPair: nativeSelfPair,
  });

  current = applyEcologyPressure(current, factionId, registry);
  current = applyForceCompositionPressure(current, factionId, registry);
  current = startOrAdvanceCodification(current, factionId, registry, trace, strategy, difficulty);
  current = applyEcologyResearchPass(current, factionId, registry, trace);
  current = unlockHybridRecipes(current, factionId, registry);

  const citiesMap = new Map(current.cities);
  const factionCityIds = getFactionCityIds(current, factionId);
  const cityCount = Math.max(1, factionCityIds.length);
  for (const cityId of factionCityIds) {
    const city = current.cities.get(cityId);
    if (!city) continue;

    const cityProductionIncome = economy.productionPool / cityCount;

    // E3 — Slave Empire emergent: captured slaves boost production
    let slaveProductionBonus = 0;
    if (tripleStack?.emergentRule.effect.type === 'slave_empire') {
      const slaveEffect = tripleStack.emergentRule.effect as import('../synergyEngine.js').EmergentEffect & { type: 'slave_empire' };
      slaveProductionBonus = cityProductionIncome * slaveEffect.slaveProductionBonus;
    }

    let updatedCity = advanceProduction(city, cityProductionIncome + slaveProductionBonus);

    if (canCompleteCurrentProduction(current, cityId, registry)) {
      current = completeProduction(current, cityId, registry);
      updatedCity = current.cities.get(cityId) ?? updatedCity;
      const spentProduction = city.currentProduction?.costType === 'villages'
        ? 0
        : city.currentProduction?.cost ?? 0;
      const currentEconomy = current.economy.get(factionId);
      if (currentEconomy) {
        const updatedEconomy = {
          ...currentEconomy,
          productionPool: Math.max(0, currentEconomy.productionPool - spentProduction),
        };
        const newEconomyMap = new Map(current.economy);
        newEconomyMap.set(factionId, updatedEconomy);
        current = { ...current, economy: newEconomyMap };
      }
      log(trace, `${faction.name} completed unit production at ${updatedCity.name}`);
    }

    if (!updatedCity.currentProduction && updatedCity.productionQueue.length === 0 && !updatedCity.besieged) {
      // Try production candidates in priority order; fall through to next if spawn/supply gate blocks
      const rankedChoices = rankProductionPriorities(current, factionId, strategy, registry, difficulty);
      let queued = false;
      for (const priority of rankedChoices) {
        const proto = getPrototype(current, priority.prototypeId);
        if (!proto) continue;

        // Spawn feasibility gate: skip if the unit can't physically spawn adjacent to this city
        if (!canSpawnAt(current, updatedCity.position, registry, proto)) {
          log(trace, `${faction.name} skipped ${proto.chassisId} at ${updatedCity.name} — no valid spawn hex`);
          continue;
        }
        // Supply gate: don't produce military units if projected demand would exceed income.
        const isSettler = isSettlerPrototype(proto);
        if (!isSettler) {
          const econ = current.economy.get(factionId);
          if (econ) {
            const projectedDemand = getProjectedSupplyDemandWithPrototype(current, factionId, proto, registry);
            if (projectedDemand > econ.supplyIncome) {
              log(trace, `${faction.name} skipped ${proto.chassisId} — supply capped (${projectedDemand.toFixed(1)} demand > ${econ.supplyIncome.toFixed(1)} income)`);
              continue;
            }
          }
        }

        const cityCount = faction.cityIds.length;
        const domains = getDomainIdsByTags(proto.tags ?? []);
        const cost = isSettler
          ? (cityCount >= 3 ? 6 : 6)
          : calculatePrototypeCost(proto.productionCost, faction, domains, proto);
        const costType = isSettler ? 'villages' as const : 'production' as const;
        updatedCity = queueUnit(updatedCity, proto.id, proto.chassisId, cost, costType);
        log(trace, `${faction.name} queued ${proto.chassisId} at ${updatedCity.name} (${priority.reason})`);
        queued = true;
        break;
      }
      if (!queued && rankedChoices.length > 0) {
        log(trace, `${faction.name} unable to queue any production at ${updatedCity.name} — all candidates blocked`);
      }
    }

    citiesMap.set(cityId, updatedCity);
  }
  current = { ...current, cities: citiesMap };
  log(trace, `${faction.name} supply deficit: ${getSupplyDeficit(economy)}`);

  const factionAbilities = registry.getSignatureAbility(factionId);
  if (factionAbilities?.summon) {
    current = tickSummonState(current, factionId, registry, trace);
  }

  current = applyWarlordAura(current, factionId, registry, trace);

  const unitsMap = new Map(current.units);
  const refreshedFaction = current.factions.get(factionId) ?? faction;
  for (const unitIdStr of refreshedFaction.unitIds) {
    const unit = unitsMap.get(unitIdStr as UnitId);
    if (!unit || unit.hp <= 0) continue;

    const terrainId = getTerrainAt(current, unit.position);
    // Captured units may be on contested hexes — skip contested check so they still heal at territory rate
    let healRate = getHealRate(unit, current, factionId, true);

    const healPrototype = current.prototypes.get(unit.prototypeId);
    const healTags = healPrototype?.tags ?? [];
    const unitSynergies = resolveEffectiveSynergies(refreshedFaction, healTags);

    const healingContext: HealingContext = {
      unitId: unitIdStr as string,
      unitTags: healTags,
      baseHeal: healRate,
      position: unit.position,
      adjacentAllies: [],
      isStealthed: unit.isStealthed,
    };

    const synergyHealRate = applyHealingSynergies(healingContext, unitSynergies);

    if (healTags.includes('druid') || healTags.includes('healing')) {
      const aura = getNatureHealingAura();
      healRate = Math.max(healRate, synergyHealRate);
    } else {
      const neighbors = getNeighbors(unit.position);
      for (const hex of neighbors) {
        const neighborUnitId = getUnitAtHex(current, hex);
        if (neighborUnitId) {
          const neighborUnit = current.units.get(neighborUnitId);
          if (neighborUnit && neighborUnit.factionId === factionId && neighborUnit.hp > 0) {
            const neighborProto = current.prototypes.get(neighborUnit.prototypeId);
            const neighborTags = neighborProto?.tags ?? [];
            if (neighborTags.includes('druid') || neighborTags.includes('healing')) {
              const aura = getNatureHealingAura();
              healRate += aura.allyHeal;
              const neighborSynergies = resolveEffectiveSynergies(refreshedFaction, neighborTags);
              const neighborHealContext: HealingContext = {
                unitId: neighborUnitId,
                unitTags: neighborTags,
                baseHeal: aura.allyHeal,
                position: neighborUnit.position,
                adjacentAllies: [],
                isStealthed: neighborUnit.isStealthed,
              };
              const extendedHeal = applyHealingSynergies(neighborHealContext, neighborSynergies);
              healRate = Math.max(healRate, extendedHeal);
              break;
            }
          }
        }
      }
    }

    const healNeighbors = getNeighbors(unit.position);
    for (const hex of healNeighbors) {
      const neighborUnitId = getUnitAtHex(current, hex);
      if (neighborUnitId) {
        const neighborUnit = current.units.get(neighborUnitId);
        if (neighborUnit && neighborUnit.factionId !== factionId && neighborUnit.hp > 0) {
          const neighborProto = current.prototypes.get(neighborUnit.prototypeId);
          const neighborTags = neighborProto?.tags ?? [];
          const enemyFaction = current.factions.get(neighborUnit.factionId);
          const neighborSynergies = resolveEffectiveSynergies(enemyFaction, neighborTags);
          for (const syn of neighborSynergies) {
            if (syn.effect.type === 'withering') {
              const reduction = (syn.effect as { healingReduction: number }).healingReduction;
              healRate = Math.floor(healRate * (1 - reduction));
              break;
            }
          }
        }
      }
    }

    const safeInSettlement = occupiesFriendlySettlement(current, unit);
    const research = current.research.get(factionId);
    const doctrine = resolveResearchDoctrine(research, faction);
    const prototype = current.prototypes.get(unit.prototypeId);
    const currentTerrainId = getTerrainAt(current, unit.position);
    const coldProvisionMoveBonus =
      prototype &&
      prototypeHasComponent(prototype, 'cold_provisions') &&
      (currentTerrainId === 'tundra' || currentTerrainId === 'hill')
        ? 1
        : 0;
    // Nature Healing T1 regen + forest override
    if (doctrine.natureHealingRegenBonus > 0) {
      if (doctrine.forestRegenBonus > 0 && (terrainId === 'forest' || terrainId === 'jungle')) {
        healRate += doctrine.forestRegenBonus;
      } else {
        healRate += doctrine.natureHealingRegenBonus;
      }
    }

    const poisonMovePenalty = unit.poisoned ? doctrine.poisonMovePenalty : 0;
    const staggerPenalty = unit.nextTurnMovePenalty ?? 0;
    const harshTerrainBonus = doctrine.heatResistanceEnabled && (currentTerrainId === 'desert' || currentTerrainId === 'tundra') ? 1 : 0;
    const refreshedMoves = Math.min(
      unit.maxMoves + 1,
      Math.max(0, unit.maxMoves + coldProvisionMoveBonus + harshTerrainBonus - poisonMovePenalty - staggerPenalty),
    );
    const refreshedUnit = {
      ...unit,
      movesRemaining: refreshedMoves,
      attacksRemaining: 1,
      morale: recoverMorale(unit),
      hp: Math.min(unit.maxHp, unit.hp + healRate),
      poisoned: safeInSettlement ? false : unit.poisoned,
      poisonStacks: safeInSettlement ? 0 : unit.poisonStacks,
      poisonTurnsRemaining: safeInSettlement ? 0 : unit.poisonTurnsRemaining,
      enteredZoCThisActivation: false,
      nextTurnMovePenalty: undefined,
      attackedTargetsThisTurn: [],
    };

    let stealthUpdatedUnit = tickStealthCooldown(refreshedUnit);
    if (!stealthUpdatedUnit.isStealthed) {
      const protoTags = current.prototypes.get(unit.prototypeId)?.tags ?? [];
      stealthUpdatedUnit = enterStealth(stealthUpdatedUnit, protoTags);
    }

    // Wetland stealth: river_stealth_t1 doctrine or river_assault passive
    if (!stealthUpdatedUnit.isStealthed && (doctrine.wetlandStealthEnabled || isPassiveWetlandStealth(faction))) {
      const unitTerrain = getTerrainAt(current, unit.position);
      if (isWetlandTerrain(unitTerrain)) {
        stealthUpdatedUnit = { ...stealthUpdatedUnit, isStealthed: true };
      }
    }

    const updatedUnit = maybeExpirePreparedAbility(stealthUpdatedUnit, current.round, current);

    checkRally(updatedUnit);

    unitsMap.set(unitIdStr as UnitId, updatedUnit);
  }
  current = { ...current, units: unitsMap };
  current = applyEnvironmentalDamage(current, factionId, registry, trace);

  // H-1-2-2: Gain exposure from proximity to enemy units
  const exposureFaction = current.factions.get(factionId);
  if (exposureFaction) {
    // Collect unique enemy native domains seen by friendly units within distance 2
    const seenEnemyDomains = new Map<string, number>(); // domainId -> contact count
    for (const fid of exposureFaction.unitIds) {
      const fUnit = current.units.get(fid as UnitId);
      if (!fUnit || fUnit.hp <= 0) continue;
      for (const [enemyId, enemyUnit] of current.units) {
        if (enemyUnit.factionId === factionId || enemyUnit.hp <= 0) continue;
        if (hexDistance(fUnit.position, enemyUnit.position) <= 2) {
          const enemyFaction = current.factions.get(enemyUnit.factionId);
          if (enemyFaction) {
            const domain = enemyFaction.nativeDomain;
            seenEnemyDomains.set(domain, (seenEnemyDomains.get(domain) ?? 0) + 1);
          }
        }
      }
    }
    for (const [domainId, contactCount] of seenEnemyDomains) {
      // No cap — rapid domain learning during heavy combat (H-2-4-5)
      const amount = contactCount;
      current = gainExposure(current, factionId, domainId, amount, trace, registry);
    }
  }

  current = evaluateAndSpawnVillage(current, factionId, registry);

  let siegeCities = new Map(current.cities);
  for (const [cityId, city] of siegeCities) {
    if (city.factionId !== factionId) continue;

    if (city.besieged) {
      if (isEncirclementBroken(city, current)) {
        const brokenCity = { ...city, besieged: false, turnsUnderSiege: 0 };
        siegeCities.set(cityId, brokenCity);
        recordSiegeEvent(trace, {
          round: current.round,
          cityId,
          cityName: city.name,
          factionId: city.factionId,
          eventType: 'siege_broken',
          wallHP: brokenCity.wallHP,
          maxWallHP: brokenCity.maxWallHP,
          turnsUnderSiege: brokenCity.turnsUnderSiege,
        });
        log(trace, `${city.name} siege broken`);
      } else {
        const isCoastalWalls = city.factionId === ('coral_people' as FactionId);
        const degradedCity = degradeWalls(city, isCoastalWalls);
        const updatedSiegeCity = {
          ...degradedCity,
          turnsUnderSiege: city.turnsUnderSiege + 1,
        };
        siegeCities.set(cityId, updatedSiegeCity);
        if (updatedSiegeCity.wallHP !== city.wallHP) {
          recordSiegeEvent(trace, {
            round: current.round,
            cityId,
            cityName: city.name,
            factionId: city.factionId,
            eventType: 'wall_damaged',
            wallHP: updatedSiegeCity.wallHP,
            maxWallHP: updatedSiegeCity.maxWallHP,
            turnsUnderSiege: updatedSiegeCity.turnsUnderSiege,
          });
        }
        log(trace, `${city.name} walls at ${degradedCity.wallHP}/${degradedCity.maxWallHP}`);

        if (isCityVulnerable(degradedCity, current)) {
          const capturingFaction = getCapturingFaction(degradedCity, current);
          if (capturingFaction) {
            const captureResult = captureCityWithResult(degradedCity, capturingFaction, current);
            current = captureResult.state;
            const capturedCity = current.cities.get(cityId);
            if (capturedCity) {
              recordSiegeEvent(trace, {
                round: current.round,
                cityId,
                cityName: city.name,
                factionId: capturedCity.factionId,
                eventType: 'city_captured',
                wallHP: capturedCity.wallHP,
                maxWallHP: capturedCity.maxWallHP,
                turnsUnderSiege: capturedCity.turnsUnderSiege,
                attackerFactionId: capturingFaction,
              });
            }
            log(trace, `${city.name} captured by ${capturingFaction}!`);
            if (captureResult.learnedDomain) {
              log(trace, `  → ${captureResult.learnedDomain.unitId} learned ${captureResult.learnedDomain.domainId} from capturing ${city.name}`);
            }
            siegeCities = new Map(current.cities);
            continue;
          }
        }
      }

    } else {
      const repairedCity = repairWalls(city);
      if (repairedCity.wallHP !== city.wallHP) {
        siegeCities.set(cityId, repairedCity);
        recordSiegeEvent(trace, {
          round: current.round,
          cityId,
          cityName: city.name,
          factionId: city.factionId,
          eventType: 'wall_repaired',
          wallHP: repairedCity.wallHP,
          maxWallHP: repairedCity.maxWallHP,
          turnsUnderSiege: repairedCity.turnsUnderSiege,
        });
      }

      if (isCityEncircled(city, current)) {
        const besiegedCity = { ...(siegeCities.get(cityId) ?? city), besieged: true, turnsUnderSiege: 1 };
        siegeCities.set(cityId, besiegedCity);
        recordSiegeEvent(trace, {
          round: current.round,
          cityId,
          cityName: city.name,
          factionId: city.factionId,
          eventType: 'siege_started',
          wallHP: besiegedCity.wallHP,
          maxWallHP: besiegedCity.maxWallHP,
          turnsUnderSiege: besiegedCity.turnsUnderSiege,
        });
        log(trace, `${city.name} is now besieged!`);
      }
    }
  }
  current = { ...current, cities: siegeCities };

  // Hill engineering dig-in: stationary hill_clan units accumulate defense stacks
  if (faction.identityProfile?.passiveTrait === 'hill_engineering') {
    const hillUnits = new Map(current.units);
    for (const unitIdStr of faction.unitIds) {
      const unit = hillUnits.get(unitIdStr as UnitId);
      if (!unit || unit.hp <= 0 || getTerrainAt(current, unit.position) !== 'hill') continue;
      if (unit.movesRemaining === unit.maxMoves) {
        // Stationary — increment stacks (cap 3)
        const newStacks = Math.min((unit.digInStacks ?? 0) + 1, 3);
        hillUnits.set(unitIdStr as UnitId, {
          ...unit,
          digInStacks: newStacks,
          hillDugIn: newStacks > 0,
        });
      } else {
        // Moved — reset stacks
        hillUnits.set(unitIdStr as UnitId, {
          ...unit,
          digInStacks: 0,
          hillDugIn: false,
        });
      }
    }
    current = { ...current, units: hillUnits };
  }

  return current;
}
