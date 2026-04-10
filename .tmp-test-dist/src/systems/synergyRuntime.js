import { SynergyEngine, } from './synergyEngine.js';
import pairSynergiesData from '../content/base/pair-synergies.json' with { type: 'json' };
import abilityDomainsData from '../content/base/ability-domains.json' with { type: 'json' };
import emergentRulesData from '../content/base/emergent-rules.json' with { type: 'json' };
let synergyEngine = null;
export function getSynergyEngine() {
    if (!synergyEngine) {
        synergyEngine = new SynergyEngine(pairSynergiesData.pairSynergies, emergentRulesData.rules, Object.values(abilityDomainsData.domains));
    }
    return synergyEngine;
}
export function calculateSynergyAttackBonus(result) {
    let bonus = 0;
    if (result.additionalEffects.some((effect) => effect.includes('pack_bonus'))) {
        bonus += 0.25;
    }
    const multiplierEffect = result.additionalEffects.find((effect) => effect.includes('poison_multiplier'));
    if (multiplierEffect) {
        const match = multiplierEffect.match(/(\d+\.?\d*)x/);
        if (match) {
            bonus += parseFloat(match[1]) - 1;
        }
    }
    return bonus;
}
export function calculateSynergyDefenseBonus(result) {
    let bonus = 0;
    if (result.additionalEffects.includes('dug_in')) {
        bonus += 0.75;
    }
    if (result.additionalEffects.includes('frost_defense')) {
        bonus += 0.5;
    }
    if (result.additionalEffects.includes('bear_cover')) {
        bonus += 0.25;
    }
    if (result.additionalEffects.includes('aura_overlap')) {
        bonus += 0.5;
    }
    return bonus;
}
