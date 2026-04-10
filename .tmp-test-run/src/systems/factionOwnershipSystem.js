function uniqueIds(ids) {
    return [...new Set(ids)];
}
export function getFactionCityIds(state, factionId) {
    return Array.from(state.cities.values())
        .filter((city) => city.factionId === factionId)
        .map((city) => city.id);
}
export function getFactionVillageIds(state, factionId) {
    return Array.from(state.villages.values())
        .filter((village) => village.factionId === factionId)
        .map((village) => village.id);
}
export function getFactionCityCount(state, factionId) {
    return getFactionCityIds(state, factionId).length;
}
export function getFactionVillageCount(state, factionId) {
    return getFactionVillageIds(state, factionId).length;
}
export function syncFactionSettlementIds(state, factionId) {
    const faction = state.factions.get(factionId);
    if (!faction) {
        return state;
    }
    const factions = new Map(state.factions);
    factions.set(factionId, {
        ...faction,
        cityIds: uniqueIds(getFactionCityIds(state, factionId)),
        villageIds: uniqueIds(getFactionVillageIds(state, factionId)),
    });
    return { ...state, factions };
}
export function syncAllFactionSettlementIds(state) {
    const factions = new Map(state.factions);
    for (const [factionId, faction] of state.factions) {
        factions.set(factionId, {
            ...faction,
            cityIds: uniqueIds(getFactionCityIds(state, factionId)),
            villageIds: uniqueIds(getFactionVillageIds(state, factionId)),
        });
    }
    return { ...state, factions };
}
export function getSettlementOwnershipSnapshot(state) {
    const authoritativeCityCounts = {};
    const authoritativeVillageCounts = {};
    const listedCityCounts = {};
    const listedVillageCounts = {};
    for (const city of state.cities.values()) {
        authoritativeCityCounts[city.factionId] = (authoritativeCityCounts[city.factionId] ?? 0) + 1;
    }
    for (const village of state.villages.values()) {
        authoritativeVillageCounts[village.factionId] = (authoritativeVillageCounts[village.factionId] ?? 0) + 1;
    }
    for (const [factionId, faction] of state.factions) {
        listedCityCounts[factionId] = uniqueIds(faction.cityIds).length;
        listedVillageCounts[factionId] = uniqueIds(faction.villageIds).length;
    }
    return {
        authoritativeCityCounts,
        authoritativeVillageCounts,
        listedCityCounts,
        listedVillageCounts,
        totalAuthoritativeCities: Object.values(authoritativeCityCounts).reduce((sum, count) => sum + count, 0),
        totalAuthoritativeVillages: Object.values(authoritativeVillageCounts).reduce((sum, count) => sum + count, 0),
        totalListedCities: Object.values(listedCityCounts).reduce((sum, count) => sum + count, 0),
        totalListedVillages: Object.values(listedVillageCounts).reduce((sum, count) => sum + count, 0),
    };
}
export function assertSettlementOwnershipConsistency(state) {
    const snapshot = getSettlementOwnershipSnapshot(state);
    const mismatchedFactions = [];
    for (const factionId of state.factions.keys()) {
        const authoritativeCities = snapshot.authoritativeCityCounts[factionId] ?? 0;
        const listedCities = snapshot.listedCityCounts[factionId] ?? 0;
        const authoritativeVillages = snapshot.authoritativeVillageCounts[factionId] ?? 0;
        const listedVillages = snapshot.listedVillageCounts[factionId] ?? 0;
        if (authoritativeCities !== listedCities || authoritativeVillages !== listedVillages) {
            mismatchedFactions.push(`${factionId}(cities ${listedCities}/${authoritativeCities}, villages ${listedVillages}/${authoritativeVillages})`);
        }
    }
    if (snapshot.totalAuthoritativeCities !== state.cities.size ||
        snapshot.totalAuthoritativeVillages !== state.villages.size ||
        snapshot.totalListedCities > state.cities.size ||
        snapshot.totalListedVillages > state.villages.size ||
        mismatchedFactions.length > 0) {
        throw new Error([
            'Settlement ownership mismatch detected.',
            `cities listed/authoritative/world=${snapshot.totalListedCities}/${snapshot.totalAuthoritativeCities}/${state.cities.size}`,
            `villages listed/authoritative/world=${snapshot.totalListedVillages}/${snapshot.totalAuthoritativeVillages}/${state.villages.size}`,
            mismatchedFactions.length > 0 ? `factions=${mismatchedFactions.join(', ')}` : '',
        ].filter(Boolean).join(' '));
    }
}
