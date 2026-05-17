import type { GameState } from '../../game/types.js';
import type { FactionId, UnitId } from '../../types.js';
import type { Unit } from '../../features/units/types.js';
import type { RulesRegistry } from '../../data/registry/types.js';
import type { FactionStrategy } from '../factionStrategy.js';
import type { DifficultyLevel } from '../aiDifficulty.js';
import type { SimulationTrace } from './traceTypes.js';
import { log } from './traceRecorder.js';
import { getFactionCityIds } from '../factionOwnershipSystem.js';
import { advanceProduction, canCompleteCurrentProduction, canSpawnAt, completeProduction, getAvailableProductionPrototypes, getProjectedSupplyDemandWithPrototype, isSettlerPrototype, queueUnit } from '../productionSystem.js';
import { rankProductionPriorities } from '../aiProductionStrategy.js';
import { getPrototype } from '../../game/stateAccess.js';
import { getDomainIdsByTags, calculatePrototypeCost } from '../knowledgeSystem.js';
import { getSupplyDeficit } from '../economySystem.js';
import { EMERGENT_PARAMS } from '../emergentRuleParams.js';

function chooseBestChassis(
  state: GameState,
  factionId: FactionId,
  registry: RulesRegistry,
): { chassisId: string; prototypeId: string } | null {
  const faction = state.factions.get(factionId);
  const availablePrototypes = getAvailableProductionPrototypes(state, factionId, registry);
  if (!faction || availablePrototypes.length === 0) return null;

  const livingSteppeScreens = factionId === ('steppe_clan' as FactionId)
    ? faction.unitIds.reduce((count, unitId) => {
      const unit = state.units.get(unitId);
      if (!unit || unit.hp <= 0) return count;
      const prototype = state.prototypes.get(unit.prototypeId);
      if (!prototype || prototype.derivedStats.role === 'mounted') return count;
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
    factionId === ('hill_clan' as FactionId) ? 2
      : factionId === ('druid_circle' as FactionId) ? 0.75
        : 0;
  const rangedFactionBonus =
    factionId === ('jungle_clan' as FactionId) ? 1.5
      : factionId === ('hill_clan' as FactionId) ? 1.0
        : factionId === ('druid_circle' as FactionId) ? 0.75
          : 0;
  const cavalryFactionBonus = factionId === ('steppe_clan' as FactionId) ? 2 : 0;
  const elephantFactionBonus = factionId === ('savannah_lions' as FactionId) ? 2 : 0;
  const navalFactionBonus = factionId === ('coral_people' as FactionId) ? 1.0
    : factionId === ('river_people' as FactionId) ? 1.5
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

export function processCityProduction(
  state: GameState,
  factionId: FactionId,
  registry: RulesRegistry,
  trace?: SimulationTrace,
  difficulty?: DifficultyLevel,
): GameState {
  const faction = state.factions.get(factionId);
  if (!faction) return state;

  const economy = state.economy.get(factionId);
  const strategy = state.factionStrategies.get(factionId);
  const tripleStack = faction.activeTripleStack;

  const citiesMap = new Map(state.cities);
  const factionCityIds = getFactionCityIds(state, factionId);
  const cityCount = Math.max(1, factionCityIds.length);

  let current = state;

  for (const cityId of factionCityIds) {
    const city = current.cities.get(cityId);
    if (!city) continue;

    const cityProductionIncome = (economy?.productionPool ?? 0) / cityCount;
    let slaveProductionBonus = 0;
    if (tripleStack?.emergentRule.id === 'slave_empire') {
      slaveProductionBonus = cityProductionIncome * EMERGENT_PARAMS.slave_empire.slaveProductionBonus;
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
      const rankedChoices = strategy
        ? rankProductionPriorities(current, factionId, strategy, registry, difficulty)
        : [];
      let queued = false;
      for (const priority of rankedChoices) {
        const proto = getPrototype(current, priority.prototypeId);
        if (!proto) continue;
        if (!canSpawnAt(current, updatedCity.position, registry, proto)) {
          log(trace, `${faction.name} skipped ${proto.chassisId} at ${updatedCity.name} — no valid spawn hex`);
          continue;
        }
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

        const factionCityCount = faction.cityIds.length;
        const domains = getDomainIdsByTags(proto.tags ?? []);
        const cost = isSettler
          ? (factionCityCount >= 3 ? 6 : 6)
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

  if (economy) {
    log(trace, `${faction.name} supply deficit: ${getSupplyDeficit(economy)}`);
  }

  return { ...current, cities: citiesMap };
}
