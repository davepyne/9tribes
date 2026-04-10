// Validate prototype assembly - check chassis, components, and compatibility
import { getDomainProgression, meetsLearnedDomainRequirement, } from '../systems/domainProgression.js';
/**
 * Validate that a prototype can be assembled from the given chassis and components
 */
export function validatePrototype(chassisId, componentIds, registry, capabilityLevels = {}, researchState, faction, options = {}) {
    const errors = [];
    void capabilityLevels;
    const progression = !options.ignoreProgressionRequirements && faction
        ? getDomainProgression(faction, researchState)
        : null;
    // Check chassis exists
    const chassis = registry.getChassis(chassisId);
    if (!chassis) {
        errors.push(`Chassis '${chassisId}' not found`);
        return { valid: false, errors };
    }
    if (progression && !meetsLearnedDomainRequirement(progression, chassis)) {
        errors.push(`Chassis '${chassisId}' requires more learned domains`);
    }
    // Check all components exist and are compatible
    const seenSlotTypes = new Map();
    for (const componentId of componentIds) {
        const component = registry.getComponent(componentId);
        if (!component) {
            errors.push(`Component '${componentId}' not found`);
            continue;
        }
        // Check compatibility with chassis
        if (!component.compatibleChassis.includes(chassisId)) {
            errors.push(`Component '${componentId}' (${component.slotType}) is not compatible with chassis '${chassisId}'`);
        }
        if (progression && !meetsLearnedDomainRequirement(progression, component)) {
            errors.push(`Component '${componentId}' requires more learned domains`);
        }
        // Check for duplicate slot types (optional for MVP)
        if (seenSlotTypes.has(component.slotType)) {
            errors.push(`Duplicate slot type '${component.slotType}' - can only have one ${component.slotType} component`);
        }
        else {
            seenSlotTypes.set(component.slotType, componentId);
        }
    }
    return {
        valid: errors.length === 0,
        errors,
    };
}
