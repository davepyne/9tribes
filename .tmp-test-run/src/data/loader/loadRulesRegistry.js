// Rules Registry Loader - Loads content from JSON files
// Import JSON data (ESM requires .js extension in imports)
import terrainsData from '../../content/base/terrains.json';
import chassisData from '../../content/base/chassis.json';
import componentsData from '../../content/base/components.json';
import veteranLevelsData from '../../content/base/veteran-levels.json';
import improvementsData from '../../content/base/improvements.json';
import researchData from '../../content/base/research.json';
import capabilityDomainsData from '../../content/base/capability-domains.json';
import hybridRecipesData from '../../content/base/hybrid-recipes.json';
import economyData from '../../content/base/economy.json';
import aiProfilesData from '../../content/base/ai-profiles.json';
import signatureAbilitiesData from '../../content/base/signatureAbilities.json';
import { assertValidBalanceOverrides, cloneData } from '../../balance/types.js';
export function loadRulesRegistry(overrides) {
    assertValidBalanceOverrides(overrides);
    // Cast imported JSON to typed objects
    const terrains = cloneData(terrainsData);
    const chassis = cloneData(chassisData);
    const components = cloneData(componentsData);
    const veteranLevels = cloneData(veteranLevelsData);
    const improvements = cloneData(improvementsData);
    const research = cloneData(researchData);
    const capabilityDomains = cloneData(capabilityDomainsData);
    const hybridRecipes = cloneData(hybridRecipesData);
    const terrainYields = cloneData(economyData);
    const aiProfiles = cloneData(aiProfilesData);
    let signatureAbilities = cloneData(signatureAbilitiesData);
    // Apply signature ability overrides from balance system
    for (const [factionId, override] of Object.entries(overrides?.signatureAbilities ?? {})) {
        if (signatureAbilities[factionId]) {
            const original = signatureAbilities[factionId];
            // Deep merge the 'summon' field to avoid replacing the entire nested object
            if (override.summon && original.summon) {
                signatureAbilities[factionId] = {
                    ...original,
                    ...override,
                    summon: { ...original.summon, ...override.summon },
                };
            }
            else {
                // Safe: override has been validated; original provides all required fields
                signatureAbilities[factionId] = { ...original, ...override };
            }
        }
    }
    for (const [terrainId, override] of Object.entries(overrides?.terrainYields ?? {})) {
        terrainYields[terrainId] = {
            ...terrainYields[terrainId],
            ...override,
        };
    }
    for (const [chassisId, override] of Object.entries(overrides?.chassis ?? {})) {
        chassis[chassisId] = {
            ...chassis[chassisId],
            ...override,
        };
    }
    for (const [componentId, override] of Object.entries(overrides?.components ?? {})) {
        components[componentId] = {
            ...components[componentId],
            ...override,
        };
    }
    return {
        // Terrain
        getTerrain(id) {
            return terrains[id];
        },
        getAllTerrains() {
            return Object.values(terrains);
        },
        // Chassis
        getChassis(id) {
            return chassis[id];
        },
        getAllChassis() {
            return Object.values(chassis);
        },
        // Components
        getComponent(id) {
            return components[id];
        },
        getAllComponents() {
            return Object.values(components);
        },
        // Veteran levels
        getVeteranLevel(id) {
            return veteranLevels[id];
        },
        getAllVeteranLevels() {
            return Object.values(veteranLevels);
        },
        // Improvements
        getImprovement(id) {
            return improvements[id];
        },
        getAllImprovements() {
            return Object.values(improvements);
        },
        // Research
        getResearchDomain(domainId) {
            return research[domainId];
        },
        getResearchNode(domainId, nodeId) {
            const domain = research[domainId];
            return domain?.nodes[nodeId];
        },
        getAllResearchDomains() {
            return Object.values(research);
        },
        // Capabilities
        getCapabilityDomain(domainId) {
            return capabilityDomains[domainId];
        },
        getAllCapabilityDomains() {
            return Object.values(capabilityDomains);
        },
        // Hybrid recipes
        getHybridRecipe(recipeId) {
            return hybridRecipes[recipeId];
        },
        getAllHybridRecipes() {
            return Object.values(hybridRecipes);
        },
        // Economy
        getTerrainYield(terrainId) {
            return terrainYields[terrainId];
        },
        getAllTerrainYields() {
            return Object.values(terrainYields);
        },
        // AI profiles
        getFactionAiBaseline(factionId) {
            return aiProfiles.factionBaselines[factionId];
        },
        getAllFactionAiBaselines() {
            return Object.values(aiProfiles.factionBaselines);
        },
        getDomainAiDoctrine(domainId) {
            return aiProfiles.domainDoctrines[domainId];
        },
        getAllDomainAiDoctrines() {
            return Object.values(aiProfiles.domainDoctrines);
        },
        // Signature abilities
        getSignatureAbilities() {
            return signatureAbilities;
        },
        getSignatureAbility(factionId) {
            return signatureAbilities[factionId];
        },
    };
}
