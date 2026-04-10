// Core resolution engine for ability domain synergies
export class SynergyEngine {
    pairSynergies;
    emergentRules;
    abilityDomains;
    constructor(pairSynergies, emergentRules, abilityDomains) {
        this.pairSynergies = pairSynergies;
        this.emergentRules = emergentRules;
        this.abilityDomains = abilityDomains;
    }
    /**
     * Get a synergy score (0-3) indicating how well two domains complement each other.
     * Higher = more strategic to pursue.
     * Based on emergent rules: if two domains appear together in any emergent rule condition,
     * they have synergy potential (score 2+). Score 3 = direct pair in a pair synergy.
     */
    getDomainSynergyScore(domainA, domainB) {
        // First check if there's a direct pair synergy between these two domains
        for (const synergy of this.pairSynergies) {
            const [d1, d2] = synergy.domains;
            if ((d1 === domainA && d2 === domainB) || (d1 === domainB && d2 === domainA)) {
                // Check if this pair forms part of an emergent triple (high value)
                for (const rule of this.emergentRules) {
                    if (this.ruleMentionsBothDomains(domainA, domainB, rule)) {
                        return 3; // Direct pair + emergent potential = highest synergy
                    }
                }
                return 2; // Direct pair synergy exists
            }
        }
        // Check if both domains appear together in any emergent rule
        for (const rule of this.emergentRules) {
            if (this.ruleMentionsBothDomains(domainA, domainB, rule)) {
                return 2; // Both appear in same emergent rule
            }
        }
        // Check if they share a category (both combat, both mobility, etc.)
        const categoryA = this.getDomainCategory(domainA);
        const categoryB = this.getDomainCategory(domainB);
        if (categoryA && categoryA === categoryB) {
            return 1; // Same category = minor synergy
        }
        return 0; // No synergy
    }
    /**
     * Get the category of a domain (combat, mobility, healing, terrain, summoning).
     */
    getDomainCategory(domainId) {
        for (const rule of this.emergentRules) {
            if (rule.domainSets) {
                for (const [category, domains] of Object.entries(rule.domainSets)) {
                    if (domains.includes(domainId)) {
                        return category;
                    }
                }
            }
            if (rule.mobilityDomains?.includes(domainId))
                return 'mobility';
            if (rule.combatDomains?.includes(domainId))
                return 'combat';
        }
        return null;
    }
    /**
     * Check if an emergent rule mentions both domains (in any of its domain sets).
     */
    ruleMentionsBothDomains(domainA, domainB, rule) {
        if (rule.domainSets) {
            const allRuleDomains = Object.values(rule.domainSets).flat();
            return allRuleDomains.includes(domainA) && allRuleDomains.includes(domainB);
        }
        if (rule.mobilityDomains) {
            return rule.mobilityDomains.includes(domainA) && rule.mobilityDomains.includes(domainB);
        }
        if (rule.combatDomains) {
            return rule.combatDomains.includes(domainA) && rule.combatDomains.includes(domainB);
        }
        return false;
    }
    /**
     * Get all domains that synergize well with a given domain (score >= 2).
     */
    getHighSynergyDomains(domainId) {
        const highSynergy = [];
        for (const abilityDomain of this.abilityDomains) {
            if (abilityDomain.id !== domainId) {
                const score = this.getDomainSynergyScore(domainId, abilityDomain.id);
                if (score >= 2) {
                    highSynergy.push(abilityDomain.id);
                }
            }
        }
        return highSynergy;
    }
    // Given a unit's tags, resolve all active pair synergies
    resolveUnitPairs(unitTags) {
        const active = [];
        const unitTagCounts = new Map();
        for (const tag of unitTags) {
            unitTagCounts.set(tag, (unitTagCounts.get(tag) ?? 0) + 1);
        }
        for (const synergy of this.pairSynergies) {
            const requiredTagCounts = new Map();
            for (const tag of synergy.requiredTags) {
                requiredTagCounts.set(tag, (requiredTagCounts.get(tag) ?? 0) + 1);
            }
            const hasAllTags = [...requiredTagCounts.entries()].every(([tag, count]) => (unitTagCounts.get(tag) ?? 0) >= count);
            if (hasAllTags) {
                active.push({
                    pairId: synergy.id,
                    name: synergy.name,
                    domains: synergy.domains,
                    effect: synergy.effect,
                });
            }
        }
        return active;
    }
    // Resolve the faction triple stack using tier-qualified domain sets.
    resolveFactionTriple(pairEligibleDomains, emergentEligibleDomains) {
        if (emergentEligibleDomains.length !== 3) {
            return null;
        }
        const pairIds = this.resolveFactionPairIds(pairEligibleDomains);
        const pairs = pairIds.map(id => this.pairSynergies.find(s => s.id === id)).filter(Boolean).map(s => ({
            pairId: s.id,
            name: s.name,
            domains: s.domains,
            effect: s.effect,
        }));
        const emergent = this.resolveEmergentRule(emergentEligibleDomains);
        if (!emergent) {
            return null;
        }
        const tripleName = this.generateTripleName(emergentEligibleDomains, pairIds);
        return {
            domains: [
                emergentEligibleDomains[0],
                emergentEligibleDomains[1],
                emergentEligibleDomains[2],
            ],
            pairs,
            emergentRule: emergent,
            name: tripleName,
        };
    }
    // Given a faction's learned domains, resolve ALL active pair IDs
    // (pairs activate when a unit has BOTH domain tags)
    resolveFactionPairIds(learnedDomains) {
        const activePairIds = [];
        for (const synergy of this.pairSynergies) {
            const [domain1, domain2] = synergy.domains;
            if (learnedDomains.includes(domain1) && learnedDomains.includes(domain2)) {
                activePairIds.push(synergy.id);
            }
        }
        return activePairIds;
    }
    resolveEmergentRule(domains) {
        for (const rule of this.emergentRules) {
            if (this.ruleMatches(domains, rule)) {
                return rule;
            }
        }
        return null;
    }
    ruleMatches(domains, rule) {
        switch (rule.condition) {
            case 'contains_terrain AND contains_combat AND contains_mobility': {
                if (!rule.domainSets)
                    return false;
                const hasTerrain = domains.some(d => rule.domainSets['terrain'].includes(d));
                const hasCombat = domains.some(d => rule.domainSets['combat'].includes(d));
                const hasMobility = domains.some(d => rule.domainSets['mobility'].includes(d));
                return hasTerrain && hasCombat && hasMobility;
            }
            case 'contains_healing AND contains_defensive AND contains_offensive': {
                if (!rule.domainSets)
                    return false;
                const hasHealing = domains.some(d => rule.domainSets['healing'].includes(d));
                const hasDefensive = domains.some(d => rule.domainSets['defensive'].includes(d));
                const hasOffensive = domains.some(d => rule.domainSets['offensive'].includes(d));
                return hasHealing && hasDefensive && hasOffensive;
            }
            case 'contains_stealth AND contains_combat AND contains_terrain': {
                if (!rule.domainSets)
                    return false;
                const hasStealth = domains.some(d => rule.domainSets['stealth'].includes(d));
                const hasCombat = domains.some(d => rule.domainSets['combat'].includes(d));
                const hasTerrain = domains.some(d => rule.domainSets['terrain'].includes(d));
                return hasStealth && hasCombat && hasTerrain;
            }
            case 'contains_fortress AND contains_healing AND contains_defensive': {
                if (!rule.domainSets)
                    return false;
                const hasFortress = domains.some(d => rule.domainSets['fortress'].includes(d));
                const hasHealing = domains.some(d => rule.domainSets['healing'].includes(d));
                const hasDefensive = domains.some(d => rule.domainSets['defensive'].includes(d));
                return hasFortress && hasHealing && hasDefensive;
            }
            case 'contains_slaving AND contains_heavy AND contains_fortress': {
                if (!rule.domainSets)
                    return false;
                const hasSlaving = domains.some(d => rule.domainSets['slaving'].includes(d));
                const hasHeavy = domains.some(d => rule.domainSets['heavy'].includes(d));
                const hasFortress = domains.some(d => rule.domainSets['fortress'].includes(d));
                return hasSlaving && hasHeavy && hasFortress;
            }
            case 'contains_camels AND contains_slaving AND contains_mobility': {
                if (!rule.domainSets)
                    return false;
                const hasCamels = domains.some(d => rule.domainSets['camels'].includes(d));
                const hasSlaving = domains.some(d => rule.domainSets['slaving'].includes(d));
                const hasMobility = domains.some(d => rule.domainSets['mobility'].includes(d));
                return hasCamels && hasSlaving && hasMobility;
            }
            case 'contains_venom AND contains_stealth AND contains_combat': {
                if (!rule.domainSets)
                    return false;
                const hasVenom = domains.some(d => rule.domainSets['venom'].includes(d));
                const hasStealth = domains.some(d => rule.domainSets['stealth'].includes(d));
                const hasCombat = domains.some(d => rule.domainSets['combat'].includes(d));
                return hasVenom && hasStealth && hasCombat;
            }
            case 'contains_fortress AND contains_heavy AND contains_terrain': {
                if (!rule.domainSets)
                    return false;
                const hasFortress = domains.some(d => rule.domainSets['fortress'].includes(d));
                const hasHeavy = domains.some(d => rule.domainSets['heavy'].includes(d));
                const hasTerrain = domains.some(d => rule.domainSets['terrain'].includes(d));
                return hasFortress && hasHeavy && hasTerrain;
            }
            case 'contains_3_mobility': {
                if (!rule.mobilityDomains)
                    return false;
                const mobilityCount = domains.filter(d => rule.mobilityDomains.includes(d)).length;
                return mobilityCount >= 3;
            }
            case 'contains_3_combat': {
                if (!rule.combatDomains)
                    return false;
                const combatCount = domains.filter(d => rule.combatDomains.includes(d)).length;
                return combatCount >= 3;
            }
            case 'default':
                return true;
            default:
                return false;
        }
    }
    generateTripleName(domains, pairs) {
        const domainSet = new Set(domains);
        // Withering Citadel: V+F+N
        if (domainSet.has('venom') && domainSet.has('fortress') && domainSet.has('nature_healing')) {
            return 'Withering Citadel';
        }
        // Ghost Army: 3 mobility domains
        const mobilityCount = domains.filter(d => ['charge', 'hitrun', 'camel_adaptation', 'river_stealth'].includes(d)).length;
        if (mobilityCount >= 3) {
            return 'Ghost Army';
        }
        // Terrain Rider: terrain + combat + mobility
        const hasTerrain = ['camel_adaptation', 'tidal_warfare', 'heavy_hitter'].some(d => domainSet.has(d));
        const hasCombat = ['venom', 'fortress', 'charge', 'hitrun', 'slaving', 'heavy_hitter'].some(d => domainSet.has(d));
        const hasMobility = ['camel_adaptation', 'charge', 'hitrun', 'river_stealth'].some(d => domainSet.has(d));
        if (hasTerrain && hasCombat && hasMobility) {
            return 'Terrain Rider';
        }
        // Slave Empire: slaving + heavy_hitter + fortress
        if (domainSet.has('slaving') && domainSet.has('heavy_hitter') && domainSet.has('fortress')) {
            return 'Slave Empire';
        }
        // Desert Raider: camel_adaptation + slaving + (charge | hitrun)
        if (domainSet.has('camel_adaptation') && domainSet.has('slaving') &&
            (domainSet.has('charge') || domainSet.has('hitrun'))) {
            return 'Desert Raider';
        }
        // Poison Shadow: venom + river_stealth + (charge | hitrun)
        if (domainSet.has('venom') && domainSet.has('river_stealth') &&
            (domainSet.has('charge') || domainSet.has('hitrun'))) {
            return 'Poison Shadow';
        }
        // Iron Turtle: fortress + heavy_hitter + (tidal_warfare | camel_adaptation)
        if (domainSet.has('fortress') && domainSet.has('heavy_hitter') &&
            (domainSet.has('tidal_warfare') || domainSet.has('camel_adaptation'))) {
            return 'Iron Turtle';
        }
        // Paladin: nature_healing + (fortress|tidal_warfare|heavy_hitter) + (venom|charge|hitrun|slaving)
        if (domainSet.has('nature_healing')) {
            const hasDefensive = ['fortress', 'tidal_warfare', 'heavy_hitter'].some(d => domainSet.has(d));
            const hasOffensive = ['venom', 'charge', 'hitrun', 'slaving'].some(d => domainSet.has(d));
            if (hasDefensive && hasOffensive) {
                return 'Paladin';
            }
        }
        // Generate name from pair names
        const pairNames = pairs.slice(0, 3).map(id => {
            const synergy = this.pairSynergies.find(s => s.id === id);
            return synergy ? synergy.name.split(' ')[0] : '';
        }).filter(Boolean);
        return pairNames.length > 0 ? pairNames.join(' ') + ' Force' : 'Unknown';
    }
}
