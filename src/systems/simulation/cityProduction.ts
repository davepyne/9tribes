import type { GameState } from '../../game/types.js';
import type { FactionId } from '../../types.js';
import type { RulesRegistry } from '../../data/registry/types.js';
import type { FactionStrategy } from '../factionStrategy.js';
import type { DifficultyLevel } from '../aiDifficulty.js';
import type { SimulationTrace } from './traceTypes.js';
import { log } from './traceRecorder.js';
import { getFactionCityIds } from '../factionOwnershipSystem.js';
import { advanceProduction, canCompleteCurrentProduction, canSpawnAt, completeProduction, getProjectedSupplyDemandWithPrototype, isSettlerPrototype, queueUnit } from '../productionSystem.js';
import { rankProductionPriorities } from '../aiProductionStrategy.js';
import { getPrototype } from '../../game/stateAccess.js';
import { getDomainIdsByTags, calculatePrototypeCost } from '../knowledgeSystem.js';
import { getSupplyDeficit } from '../economySystem.js';
import { EMERGENT_PARAMS } from '../emergentRuleParams.js';

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
