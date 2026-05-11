import type { GameState } from '../../game/types.js';
import type { FactionId } from '../../types.js';
import type { RulesRegistry } from '../../data/registry/types.js';
import { applyContactTransfer } from '../capabilitySystem.js';
import { updateCombatRecordOnElimination } from '../historySystem.js';
import { getFactionCityIds, syncAllFactionSettlementIds } from '../factionOwnershipSystem.js';
import { destroyVillagesInCityTerritory } from '../villageSystem.js';

export function maybeAbsorbFaction(
  state: GameState,
  victorFactionId: FactionId,
  defeatedFactionId: FactionId,
  registry: RulesRegistry,
): { state: GameState; absorbedDomains: string[] } {
  const stillAlive = Array.from(state.units.values()).some(
    (unit) => unit.factionId === defeatedFactionId && unit.hp > 0,
  );
  if (stillAlive) {
    return { state, absorbedDomains: [] };
  }

  const defeatedFaction = state.factions.get(defeatedFactionId);
  const victorFaction = state.factions.get(victorFactionId);
  if (!defeatedFaction || !victorFaction) {
    return { state, absorbedDomains: [] };
  }

  let current = applyContactTransfer(state, victorFactionId, defeatedFactionId, 'absorption');
  current = updateCombatRecordOnElimination(current, victorFactionId);

  // Conqueror learns the defeated tribe's native domain and any learned domains
  // No cap — faction absorption is a conquest event, not ecology assimilation
  const domainsToAbsorb = [
    defeatedFaction.nativeDomain,
    ...defeatedFaction.learnedDomains,
  ];
  const newlyLearned = domainsToAbsorb.filter(
    (d) =>
      d !== victorFaction.nativeDomain &&
      !victorFaction.learnedDomains.includes(d) &&
      domainsToAbsorb.indexOf(d) === domainsToAbsorb.lastIndexOf(d),
  );

  let absorbedDomains: string[] = [];
  if (newlyLearned.length > 0) {
    absorbedDomains = newlyLearned;
    const newLearnedDomains = [...victorFaction.learnedDomains, ...newlyLearned];

    // Absorption grants domain awareness but NOT T1 auto-complete or synergy eligibility
    // The domain's T1 must be earned via ecology assimilation at scaled cost
    const updatedFaction = current.factions.get(victorFactionId);
    if (updatedFaction) {
      const absAcquisitionMethods = { ...updatedFaction.domainAcquisitionMethod };
      for (const d of newlyLearned) {
        absAcquisitionMethods[d] = 'absorption';
      }
      const newFactions = new Map(current.factions);
      newFactions.set(victorFactionId, {
        ...updatedFaction,
        learnedDomains: newLearnedDomains,
        domainAcquisitionMethod: absAcquisitionMethods,
      });
      current = { ...current, factions: newFactions };

      // Set recentCodifiedDomainIds so AI strategy can react
      const updatedResearch = current.research.get(victorFactionId);
      if (updatedResearch) {
        const researchMap = new Map(current.research);
        researchMap.set(victorFactionId, {
          ...updatedResearch,
          recentCodifiedDomainIds: newlyLearned,
          recentCodifiedRound: current.round,
        });
        current = { ...current, research: researchMap };
      }
    }
  }

  // Raze defeated faction's cities and destroy their villages
  let razeState = current;
  const newCities = new Map(current.cities);
  for (const cityId of getFactionCityIds(current, defeatedFactionId)) {
    const city = current.cities.get(cityId);
    if (city) {
      razeState = destroyVillagesInCityTerritory(razeState, city);
      newCities.delete(cityId);
    }
  }

  const newFactions = new Map(current.factions);
  newFactions.set(defeatedFactionId, {
    ...defeatedFaction,
    cityIds: [],
    villageIds: [],
  });

  return {
    state: syncAllFactionSettlementIds({
      ...razeState,
      cities: newCities,
      factions: newFactions,
    }),
    absorbedDomains,
  };
}
