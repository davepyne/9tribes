export function serializeGameState(state) {
    return {
        ...state,
        map: state.map
            ? {
                ...state.map,
                tiles: Array.from(state.map.tiles.entries()),
            }
            : undefined,
        factions: Array.from(state.factions.entries()),
        factionResearch: Array.from(state.factionResearch.entries()),
        units: Array.from(state.units.entries()),
        cities: Array.from(state.cities.entries()),
        villages: Array.from(state.villages.entries()),
        prototypes: Array.from(state.prototypes.entries()),
        improvements: Array.from(state.improvements.entries()),
        research: Array.from(state.research.entries()),
        economy: Array.from(state.economy.entries()),
        warExhaustion: Array.from(state.warExhaustion.entries()),
        factionStrategies: Array.from(state.factionStrategies.entries()),
        poisonTraps: Array.from(state.poisonTraps.entries()),
        contaminatedHexes: Array.from(state.contaminatedHexes.values()),
        transportMap: Array.from(state.transportMap.entries()),
        villageCaptureCooldowns: Array.from(state.villageCaptureCooldowns.entries()),
    };
}
export function deserializeGameState(payload) {
    const toTypedMap = (entries) => new Map(entries);
    return {
        ...payload,
        map: payload.map
            ? {
                ...payload.map,
                tiles: new Map(payload.map.tiles),
            }
            : undefined,
        factions: toTypedMap(payload.factions),
        factionResearch: toTypedMap(payload.factionResearch),
        units: toTypedMap(payload.units),
        cities: toTypedMap(payload.cities),
        villages: toTypedMap(payload.villages),
        prototypes: toTypedMap(payload.prototypes),
        improvements: toTypedMap(payload.improvements),
        research: toTypedMap(payload.research),
        economy: toTypedMap(payload.economy),
        warExhaustion: toTypedMap(payload.warExhaustion),
        factionStrategies: toTypedMap(payload.factionStrategies),
        poisonTraps: toTypedMap(payload.poisonTraps),
        contaminatedHexes: new Set(payload.contaminatedHexes),
        transportMap: toTypedMap(payload.transportMap),
        villageCaptureCooldowns: toTypedMap(payload.villageCaptureCooldowns),
    };
}
