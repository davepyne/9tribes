export function getMinLearnedDomainsForTier(tier) {
    switch (tier) {
        case 'mid':
            return 2;
        case 'late':
            return 3;
        default:
            return 1;
    }
}
export function getMinLearnedDomainsRequirement(value) {
    return value.minLearnedDomains ?? getMinLearnedDomainsForTier(value.tier);
}
export function meetsLearnedDomainRequirement(progression, value) {
    return progression.learnedDomainCount >= getMinLearnedDomainsRequirement(value);
}
function getCompletedNodesSet(researchState) {
    return new Set(researchState?.completedNodes ?? []);
}
function getHighestCompletedTier(domainId, completedNodes) {
    if (completedNodes.has(`${domainId}_t3`))
        return 3;
    if (completedNodes.has(`${domainId}_t2`))
        return 2;
    if (completedNodes.has(`${domainId}_t1`))
        return 1;
    return 0;
}
export function getDomainProgression(faction, researchState) {
    const learnedDomains = Array.from(new Set(faction.learnedDomains ?? []));
    const completedNodes = getCompletedNodesSet(researchState);
    const t1Domains = [];
    const t2Domains = [];
    const t3Domains = [];
    const nativeT3Domains = [];
    const foreignT3Domains = [];
    for (const domainId of learnedDomains) {
        const tier = getHighestCompletedTier(domainId, completedNodes);
        if (tier >= 1)
            t1Domains.push(domainId);
        if (tier >= 2)
            t2Domains.push(domainId);
        if (tier >= 3) {
            t3Domains.push(domainId);
            if (domainId === faction.nativeDomain) {
                nativeT3Domains.push(domainId);
            }
            else {
                foreignT3Domains.push(domainId);
            }
        }
    }
    return {
        learnedDomainCount: learnedDomains.length,
        t1Domains,
        t2Domains,
        t3Domains,
        pairEligibleDomains: t1Domains,
        emergentEligibleDomains: t2Domains,
        nativeT3Domains,
        foreignT3Domains,
        canBuildMidTier: learnedDomains.length >= 2,
        canBuildLateTier: learnedDomains.length >= 3,
    };
}
export function isDomainUnlockedForFaction(faction, domainId) {
    return (faction.learnedDomains ?? []).includes(domainId);
}
export function getDomainTierFromProgression(faction, domainId, researchState) {
    const progression = getDomainProgression(faction, researchState);
    if (progression.t3Domains.includes(domainId))
        return 3;
    if (progression.t2Domains.includes(domainId))
        return 2;
    if (progression.t1Domains.includes(domainId))
        return 1;
    return 0;
}
