// Economy types - resource production and supply for war-civ-2
export function createFactionEconomy(factionId) {
    return {
        factionId,
        productionPool: 0,
        supplyIncome: 0,
        supplyDemand: 0,
    };
}
export function emptyResourceYield() {
    return { production: 0, supply: 0 };
}
