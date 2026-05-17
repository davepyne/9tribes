import type { GameState } from '../../game/types.js';
import type { FactionId } from '../../types.js';
import type { SimulationTrace } from './traceTypes.js';
import { log, recordSiegeEvent } from './traceRecorder.js';
import { degradeWalls, repairWalls, isCityVulnerable, getCapturingFaction, captureCityWithResult } from '../siegeSystem.js';
import { isCityEncircled, isEncirclementBroken } from '../territorySystem.js';

export function processSiegePhase(
  state: GameState,
  factionId: FactionId,
  trace?: SimulationTrace,
): GameState {
  let current = state;
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
  return { ...current, cities: siegeCities };
}
