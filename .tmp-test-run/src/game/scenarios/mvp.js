/**
 * War Ecology Scenario Configuration
 *
 * Civilizations are loaded from civilizations.json (the template system).
 * This file provides scenario-level config and helper functions.
 */
import civsData from '../../content/base/civilizations.json';
import { assertValidBalanceOverrides, cloneData } from '../../balance/types.js';
export const MVP_SCENARIO_CONFIG = {
    name: 'War Ecology Scenario',
    description: 'Nine tribal factions diverging through ecology and war pressure',
    mapMode: 'randomClimateBands',
    mapWidth: 40,
    mapHeight: 30,
    terrainDistribution: {
        plains: 0.25,
        forest: 0.15,
        jungle: 0.10,
        hill: 0.10,
        desert: 0.10,
        tundra: 0.10,
        savannah: 0.10,
        coast: 0.09,
        river: 0.08,
    },
    roundsToWin: 150,
};
// Load civilizations from JSON template system
export const MVP_FACTION_CONFIGS = Object.values(civsData);
export function getMvpScenarioConfig(overrides) {
    assertValidBalanceOverrides(overrides);
    return {
        ...MVP_SCENARIO_CONFIG,
        roundsToWin: overrides?.scenario?.roundsToWin ?? MVP_SCENARIO_CONFIG.roundsToWin,
        mapWidth: overrides?.scenario?.mapWidth ?? MVP_SCENARIO_CONFIG.mapWidth,
        mapHeight: overrides?.scenario?.mapHeight ?? MVP_SCENARIO_CONFIG.mapHeight,
    };
}
export function getMvpFactionConfigs(overrides) {
    assertValidBalanceOverrides(overrides);
    return MVP_FACTION_CONFIGS.map((config) => {
        const factionOverride = overrides?.factions?.[config.id];
        if (!factionOverride) {
            return cloneData(config);
        }
        return {
            ...cloneData(config),
            capabilitySeeds: {
                ...config.capabilitySeeds,
                ...(factionOverride.capabilitySeeds ?? {}),
            },
        };
    });
}
export function getStartingUnits(factionIndex, overrides) {
    const config = getMvpFactionConfigs(overrides)[factionIndex];
    return config?.startingUnits ?? [
        {
            chassisId: 'infantry_frame',
            componentIds: ['basic_spear', 'simple_armor'],
            positionOffset: { q: 0, r: -1 },
        },
    ];
}
export const MVP_IMPROVEMENTS = [];
export const MVP_RESEARCH_CONFIG = {
    domainId: 'river_stealth',
    initialNode: 'river_stealth_t2',
    initialProgress: 0,
};
