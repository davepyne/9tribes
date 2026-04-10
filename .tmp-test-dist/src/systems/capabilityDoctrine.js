import { getDomainProgression } from './domainProgression.js';
/**
 * Check if a faction has completed specific research nodes.
 */
export function hasCompletedResearchNodes(researchState, requiredResearchNodes) {
    return (requiredResearchNodes ?? []).every((nodeId) => researchState?.completedNodes.includes(nodeId));
}
/**
 * Check if a recipe's research requirements are met.
 */
export function meetsRecipeResearchRequirements(recipe, researchState) {
    void recipe;
    void researchState;
    return true;
}
/**
 * Resolve the research doctrine for a faction based on completed research nodes.
 * This is the single source of truth for all qualitative combat effects.
 */
export function resolveResearchDoctrine(researchState, faction) {
    function hasNode(nodeId) {
        return (researchState?.completedNodes ?? []).includes(nodeId);
    }
    const progression = faction ? getDomainProgression(faction, researchState) : null;
    const hasNativeT3 = (domainId) => progression?.nativeT3Domains.includes(domainId) ?? hasNode(`${domainId}_t3`);
    const hasForeignT3 = (domainId) => progression?.foreignT3Domains.includes(domainId) ?? false;
    return {
        // Quantitative effects
        poisonStacksOnHit: hasNode('venom_t1') ? 2 : 1,
        poisonDamagePerStack: hasNode('venom_t2') ? 4 : 3,
        poisonMovePenalty: hasNode('venom_t3') ? 1 : 0,
        // Tier 1 qualitative effects
        forestAmbushEnabled: hasNode('nature_healing_t1'),
        shieldWallEnabled: hasNode('fortress_t1'),
        riverCrossingEnabled: hasNode('tidal_warfare_t1'),
        marchingStaminaEnabled: hasNode('hitrun_t1'),
        poisonPersistenceEnabled: hasNode('venom_t1'),
        forcedMarchEnabled: hasNode('charge_t1'),
        rapidEntrenchEnabled: hasNode('fortress_t1') || hasNativeT3('fortress'),
        // Tier 2 qualitative effects
        canopyCoverEnabled: hasNode('nature_healing_t2'),
        elephantStampede2Enabled: hasNode('charge_t2'),
        amphibiousAssaultEnabled: hasNode('tidal_warfare_t2'),
        winterCampaignEnabled: hasNode('camel_adaptation_t2'),
        contaminateTerrainEnabled: hasNode('venom_t2'),
        zoCAuraEnabled: hasNode('fortress_t2'),
        canBuildFieldForts: hasNode('fortress_t2'),
        // Tier 3 qualitative effects
        toxicBulwarkEnabled: hasNativeT3('venom'),
        fortressTranscendenceEnabled: hasNativeT3('fortress'),
        chargeTranscendenceEnabled: hasNativeT3('charge'),
        universalHitAndRunEnabled: hasNativeT3('hitrun'),
        amphibiousMovementEnabled: hasNativeT3('tidal_warfare'),
        undyingEnabled: hasNativeT3('nature_healing'),
        // Additional qualitative effects
        heatResistanceEnabled: hasNode('camel_adaptation_t1'),
        forestMovementEnabled: hasNode('river_stealth_t1'),
        greedyCaptureEnabled: hasNode('slaving_t1'),
        antiFortificationEnabled: hasNode('heavy_hitter_t1'),
        permanentStealthEnabled: hasNode('camel_adaptation_t2'),
        stealthRechargeEnabled: hasNode('river_stealth_t2'),
        captureRetreatEnabled: hasNode('slaving_t2'),
        damageReflectionEnabled: hasNode('heavy_hitter_t2'),
        hitAndRunEnabled: hasNode('hitrun_t2'),
        // T3 upgrades (shared for foreign domains)
        poisonBonusEnabled: hasForeignT3('venom'),
        fortressAuraUpgradeEnabled: hasForeignT3('fortress'),
        chargeRoutedBonusEnabled: hasForeignT3('charge'),
        hitrunZocIgnoreEnabled: hasForeignT3('hitrun'),
        healingAuraUpgradeEnabled: hasForeignT3('nature_healing'),
        roughTerrainDefenseEnabled: hasForeignT3('camel_adaptation'),
        navalCoastalBonusEnabled: hasForeignT3('tidal_warfare'),
        stealthRevealEnabled: hasForeignT3('river_stealth'),
        autoCaptureEnabled: hasForeignT3('slaving'),
        armorPenetrationEnabled: hasForeignT3('heavy_hitter') || hasNativeT3('heavy_hitter'),
        natureHealingRegenBonus: hasNativeT3('nature_healing')
            ? 3
            : hasNode('nature_healing_t1')
                ? 1
                : 0,
        // Hill combat modifiers
        hillDefenseModifier: 0.15,
        hillAttackDefensePierce: 0.25,
    };
}
/**
 * Legacy alias for backwards compatibility during migration.
 * @deprecated Use resolveResearchDoctrine instead.
 */
export const resolveCapabilityDoctrine = resolveResearchDoctrine;
/**
 * Check if a prototype has a specific component.
 */
export function prototypeHasComponent(prototype, componentId) {
    return prototype.componentIds.includes(componentId);
}
