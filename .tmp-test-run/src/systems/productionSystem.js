// Production System - Unit production pipeline for war-civ-2
// Handles queuing, advancing, and completing unit production in cities
import { createUnitId } from '../core/ids.js';
import { getNeighbors, hexDistance, hexToKey } from '../core/grid.js';
import { recordUnitCreated } from './historySystem.js';
import { isHexOccupied } from './occupancySystem.js';
import { getDomainIdsByTags, incrementPrototypeMastery } from './knowledgeSystem.js';
import { getDomainProgression, meetsLearnedDomainRequirement } from './domainProgression.js';
import { destroyVillage } from './villageSystem.js';
export const SETTLER_VILLAGE_COST = 4;
// Unit production costs (in production points)
export const UNIT_COSTS = {
    infantry_frame: 20,
    ranged_frame: 24,
    cavalry_frame: 36,
    naval_frame: 30,
    ranged_naval_frame: 32,
    galley_frame: 40,
    camel_frame: 24,
    elephant_frame: 36,
};
// City base production yield per turn
const CITY_BASE_PRODUCTION = 3;
/**
 * Queue a unit for production in a city.
 */
export function queueUnit(city, prototypeId, chassisId, cost, costType = 'production') {
    const item = {
        type: 'unit',
        id: prototypeId,
        cost,
        costType,
    };
    // If no current production, start immediately
    if (!city.currentProduction) {
        return {
            ...city,
            currentProduction: {
                item,
                progress: 0,
                cost,
                costType,
            },
        };
    }
    // Otherwise add to queue
    return {
        ...city,
        productionQueue: [...city.productionQueue, item],
    };
}
/**
 * Advance production for a city by its production income.
 * Returns updated city state.
 */
export function advanceProduction(city, productionIncome) {
    if (!city.currentProduction || city.currentProduction.costType === 'villages') {
        return city;
    }
    const updated = {
        ...city,
        currentProduction: {
            ...city.currentProduction,
            progress: city.currentProduction.progress + productionIncome,
        },
    };
    return updated;
}
/**
 * Check if a city's current production is complete.
 */
export function isProductionComplete(city) {
    if (!city.currentProduction)
        return false;
    if (city.currentProduction.costType === 'villages')
        return false;
    return city.currentProduction.progress >= city.currentProduction.cost;
}
export function isSettlerPrototype(prototype) {
    if (!prototype)
        return false;
    return prototype.tags?.includes('settler') === true
        || prototype.sourceRecipeId === 'settler'
        || prototype.name.toLowerCase() === 'settler';
}
export function getPrototypeCostType(prototype) {
    return isSettlerPrototype(prototype) ? 'villages' : 'production';
}
export function getPrototypeVillageCost(prototype) {
    return isSettlerPrototype(prototype) ? SETTLER_VILLAGE_COST : 0;
}
export function getPrototypeQueueCost(prototype) {
    return isSettlerPrototype(prototype) ? SETTLER_VILLAGE_COST : getUnitCost(prototype.chassisId);
}
export function canPaySettlerVillageCost(state, factionId, villageCost = SETTLER_VILLAGE_COST) {
    const faction = state.factions.get(factionId);
    return (faction?.villageIds.length ?? 0) >= villageCost;
}
export function getNearestFactionVillageIds(state, factionId, origin, limit = SETTLER_VILLAGE_COST) {
    return Array.from(state.villages.values())
        .filter((village) => village.factionId === factionId)
        .sort((left, right) => hexDistance(left.position, origin) - hexDistance(right.position, origin)
        || left.foundedRound - right.foundedRound
        || left.id.localeCompare(right.id))
        .slice(0, limit)
        .map((village) => village.id);
}
export function canCompleteCurrentProduction(state, cityId, registry) {
    const city = state.cities.get(cityId);
    if (!city?.currentProduction)
        return false;
    if (city.currentProduction.costType !== 'villages') {
        return isProductionComplete(city);
    }
    const prototype = state.prototypes.get(city.currentProduction.item.id);
    if (!isSettlerPrototype(prototype)) {
        return false;
    }
    return canPaySettlerVillageCost(state, city.factionId, city.currentProduction.cost)
        && findSpawnHex(state, city.position, registry) !== null;
}
/**
 * Complete production and spawn a unit adjacent to the city.
 * Returns updated GameState or null if spawn fails.
 */
export function completeProduction(state, cityId, registry) {
    const city = state.cities.get(cityId);
    if (!city || !city.currentProduction)
        return state;
    const item = city.currentProduction.item;
    if (item.type !== 'unit')
        return state;
    const prototype = state.prototypes.get(item.id);
    if (!prototype)
        return state;
    if (city.currentProduction.costType === 'villages') {
        if (!isSettlerPrototype(prototype)) {
            return state;
        }
        if (!canPaySettlerVillageCost(state, city.factionId, city.currentProduction.cost)) {
            return state;
        }
    }
    // Find spawn position (adjacent empty hex)
    const spawnHex = findSpawnHex(state, city.position, registry);
    if (!spawnHex)
        return state; // No room to spawn
    // Create the unit
    const unitId = createUnitId();
    let unit = {
        id: unitId,
        factionId: city.factionId,
        position: spawnHex,
        facing: 0,
        hp: prototype.derivedStats.hp,
        maxHp: prototype.derivedStats.hp,
        movesRemaining: prototype.derivedStats.moves,
        maxMoves: prototype.derivedStats.moves,
        attacksRemaining: 1,
        xp: 0,
        veteranLevel: 'green',
        status: 'ready',
        prototypeId: prototype.id,
        history: [],
        morale: 100,
        routed: false,
        poisoned: false,
        enteredZoCThisActivation: false,
        poisonStacks: 0,
        isStealthed: false,
        turnsSinceStealthBreak: 0,
        learnedAbilities: [],
    };
    unit = recordUnitCreated(unit, city.factionId, prototype.id);
    // Update state
    const newUnits = new Map(state.units);
    newUnits.set(unitId, unit);
    const faction = state.factions.get(city.factionId);
    if (!faction)
        return state;
    const newFaction = {
        ...faction,
        unitIds: [...faction.unitIds, unitId],
    };
    const newFactions = new Map(state.factions);
    newFactions.set(city.factionId, newFaction);
    // Prototype mastery tracking: when a unit is built, track which domains it uses
    // Get domain IDs from the prototype's tags
    const prototypeDomainIds = getDomainIdsByTags(prototype.tags ?? []);
    let currentState = {
        ...state,
        units: newUnits,
        factions: newFactions,
    };
    if (city.currentProduction.costType === 'villages') {
        const villageIds = getNearestFactionVillageIds(currentState, city.factionId, city.position, city.currentProduction.cost);
        if (villageIds.length < city.currentProduction.cost) {
            return state;
        }
        for (const villageId of villageIds) {
            currentState = destroyVillage(currentState, villageId);
        }
    }
    // Increment prototypeMastery for each domain the faction has learned
    for (const domainId of prototypeDomainIds) {
        // Only track mastery for domains this faction has learned
        if (faction.learnedDomains.includes(domainId)) {
            currentState = incrementPrototypeMastery(currentState, city.factionId, domainId);
        }
    }
    // Clear current production, start next in queue if any
    let updatedCity;
    if (city.productionQueue.length > 0) {
        const nextItem = city.productionQueue[0];
        updatedCity = {
            ...city,
            currentProduction: {
                item: nextItem,
                progress: 0,
                cost: nextItem.cost,
                costType: nextItem.costType,
            },
            productionQueue: city.productionQueue.slice(1),
        };
    }
    else {
        updatedCity = {
            ...city,
            currentProduction: undefined,
        };
    }
    const newCities = new Map(currentState.cities);
    newCities.set(cityId, updatedCity);
    return {
        ...currentState,
        cities: newCities,
    };
}
/**
 * Find an empty adjacent hex to spawn a unit.
 */
function findSpawnHex(state, position, registry) {
    const neighbors = getNeighbors(position);
    for (const hex of neighbors) {
        // Check if hex is on the map
        if (!state.map)
            continue;
        const tile = state.map.tiles.get(hexToKey(hex));
        if (!tile)
            continue;
        // Check terrain passability
        const terrainDef = registry.getTerrain(tile.terrain);
        if (terrainDef && terrainDef.passable === false)
            continue;
        // Check if occupied by unit
        if (isHexOccupied(state, hex))
            continue;
        // Check if occupied by city
        let cityOccupied = false;
        for (const [, city] of state.cities) {
            if (city.position.q === hex.q && city.position.r === hex.r) {
                cityOccupied = true;
                break;
            }
        }
        if (cityOccupied)
            continue;
        // Check if occupied by village
        let villageOccupied = false;
        for (const [, village] of state.villages) {
            if (village.position.q === hex.q && village.position.r === hex.r) {
                villageOccupied = true;
                break;
            }
        }
        if (villageOccupied)
            continue;
        return hex;
    }
    return null;
}
/**
 * Get the production cost for a chassis type.
 */
export function getUnitCost(chassisId) {
    return UNIT_COSTS[chassisId] ?? 10;
}
export function getUnitSupplyCost(prototype, registry) {
    if (isSettlerPrototype(prototype))
        return 2;
    const chassis = registry.getChassis(prototype.chassisId);
    return chassis?.supplyCost ?? 1;
}
export function getPrototypeEconomicProfile(prototype, registry) {
    return {
        productionCost: getUnitCost(prototype.chassisId),
        supplyCost: getUnitSupplyCost(prototype, registry),
    };
}
export function getFactionProjectedSupplyDemand(state, factionId, registry) {
    let total = 0;
    for (const unit of state.units.values()) {
        if (unit.factionId !== factionId || unit.hp <= 0)
            continue;
        const prototype = state.prototypes.get(unit.prototypeId);
        if (!prototype)
            continue;
        total += getUnitSupplyCost(prototype, registry);
    }
    return Number(total.toFixed(2));
}
export function getProjectedSupplyDemandWithPrototype(state, factionId, prototype, registry) {
    return Number((getFactionProjectedSupplyDemand(state, factionId, registry) + getUnitSupplyCost(prototype, registry)).toFixed(2));
}
export function canProducePrototype(state, factionId, prototypeId, registry) {
    const faction = state.factions.get(factionId);
    const research = state.research.get(factionId);
    const prototype = state.prototypes.get(prototypeId);
    if (!faction || !prototype || prototype.factionId !== factionId) {
        return false;
    }
    const progression = getDomainProgression(faction, research);
    const chassis = registry.getChassis(prototype.chassisId);
    if (!chassis) {
        return false;
    }
    if (chassis.nativeFaction && chassis.nativeFaction !== factionId) {
        return false;
    }
    // If faction already has a prototype using this chassis (e.g. starting unit),
    // they've proven they can build it — skip domain gate.
    const hasExistingChassisPrototype = Array.from(state.prototypes.values()).some((p) => p.factionId === factionId && p.chassisId === prototype.chassisId);
    if (!hasExistingChassisPrototype && !meetsLearnedDomainRequirement(progression, chassis)) {
        return false;
    }
    for (const componentId of prototype.componentIds) {
        const component = registry.getComponent(componentId);
        if (!component) {
            return false;
        }
        if (!meetsLearnedDomainRequirement(progression, component)) {
            return false;
        }
    }
    return true;
}
export function getAvailableProductionPrototypes(state, factionId, registry) {
    return Array.from(state.prototypes.values())
        .filter((prototype) => canProducePrototype(state, factionId, prototype.id, registry))
        .sort((left, right) => getPrototypeQueueCost(left) - getPrototypeQueueCost(right)
        || left.name.localeCompare(right.name)
        || left.id.localeCompare(right.id));
}
/**
 * Cancel the current production item and start the next queued item (if any).
 * Returns progress-lost info so UI can display it.
 */
export function cancelCurrentProduction(city) {
    const lostProgress = city.currentProduction?.progress ?? 0;
    let updatedCity;
    if (city.productionQueue.length > 0) {
        const nextItem = city.productionQueue[0];
        updatedCity = {
            ...city,
            currentProduction: {
                item: nextItem,
                progress: 0,
                cost: nextItem.cost,
                costType: nextItem.costType,
            },
            productionQueue: city.productionQueue.slice(1),
        };
    }
    else {
        updatedCity = {
            ...city,
            currentProduction: undefined,
        };
    }
    return { city: updatedCity, lostProgress };
}
/**
 * Remove an item from the production queue by index.
 */
export function removeFromQueue(city, index) {
    if (index < 0 || index >= city.productionQueue.length)
        return city;
    return {
        ...city,
        productionQueue: city.productionQueue.filter((_, i) => i !== index),
    };
}
/**
 * Get the city's total production yield per turn.
 */
export function getCityProductionYield(city) {
    return CITY_BASE_PRODUCTION;
}
