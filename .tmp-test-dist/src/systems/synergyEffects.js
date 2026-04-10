// Apply synergy effects to combat, movement, healing
// This is where the mechanical effects are implemented
export function applyCombatSynergies(context, synergies, tripleStack) {
    const result = {
        damage: 0,
        defense: 0,
        knockbackDistance: 0,
        strikeFirst: false,
        noRetaliation: false,
        poisonStacks: 0,
        frostbiteStacks: 0,
        slowDuration: 0,
        poisonTrapPositions: [],
        routTriggered: false,
        additionalEffects: [],
        // Phase 3: real game-mechanic fields
        chargeShield: false,
        antiDisplacement: false,
        healOnRetreatAmount: 0,
        swarmSpeedBonus: 0,
        sandstormDamage: 0,
        sandstormAccuracyDebuff: 0,
        witheringReduction: 0,
        poisonTrapDamage: 0,
        poisonTrapSlow: 0,
        contaminateActive: false,
        frostbiteColdDoT: 0,
        frostbiteSlow: 0,
        stealthChargeMultiplier: 0,
        routThresholdOverride: null,
        aoeDamage: 0,
        damageReflection: 0,
    };
    // Apply each active synergy effect
    for (const synergy of synergies) {
        applySynergyEffect(synergy.effect, context, result);
    }
    // Apply triple stack emergent effects
    if (tripleStack) {
        applyEmergentCombatEffects(tripleStack.emergentRule, context, result);
    }
    // Apply stealth ambush bonus
    if (context.isStealthAttack && context.attackerTags.includes('stealth')) {
        result.damage = Math.floor(result.damage * 1.5);
        result.additionalEffects.push('ambush_damage');
    }
    return result;
}
function applySynergyEffect(effect, context, result) {
    switch (effect.type) {
        case 'poison_aura':
            result.poisonStacks += effect.damagePerTurn;
            result.additionalEffects.push(`poison_aura_radius_${effect.radius}`);
            break;
        case 'charge_shield':
            result.chargeShield = true;
            result.additionalEffects.push('charge_shield');
            break;
        case 'anti_displacement':
            result.antiDisplacement = true;
            result.additionalEffects.push('anti_displacement');
            break;
        case 'dug_in':
            result.defense += effect.defenseBonus;
            result.additionalEffects.push('dug_in');
            break;
        case 'land_aura':
            result.defense += effect.defenseBonus;
            result.additionalEffects.push(`land_aura_radius_${effect.radius}`);
            break;
        case 'extended_healing':
            result.additionalEffects.push(`extended_healing_radius_${effect.radius}`);
            break;
        case 'stealth_aura':
            result.additionalEffects.push(`stealth_aura_reveal_${effect.revealRadius}`);
            break;
        case 'terrain_fortress':
            result.defense += effect.defenseBonus;
            result.additionalEffects.push('terrain_fortress');
            break;
        case 'charge_cooldown_reset':
            result.additionalEffects.push('charge_cooldown_reset');
            break;
        case 'rout_threshold':
            result.routThresholdOverride = effect.threshold;
            if (context.defenderHp < context.attackerHp * effect.threshold) {
                result.routTriggered = true;
            }
            break;
        case 'ram_attack':
            result.knockbackDistance = Math.max(result.knockbackDistance, effect.knockbackDistance);
            result.additionalEffects.push('ram_attack');
            break;
        case 'combat_healing':
            result.additionalEffects.push(`combat_healing_${effect.healPercent * 100}%`);
            break;
        case 'stealth_charge':
            // Always store the multiplier; let the caller decide when to apply it
            result.stealthChargeMultiplier = effect.damageBonus;
            if (context.isCharge && context.isStealthAttack) {
                result.damage = Math.floor(result.damage * (1 + effect.damageBonus));
                result.additionalEffects.push('stealth_charge');
            }
            break;
        case 'sandstorm':
            result.sandstormDamage = effect.aoeDamage;
            result.sandstormAccuracyDebuff = effect.accuracyDebuff;
            result.aoeDamage = effect.aoeDamage;
            result.knockbackDistance = Math.max(result.knockbackDistance, 1);
            result.additionalEffects.push(`sandstorm_damage_${effect.aoeDamage}_accuracy_debuff_${effect.accuracyDebuff}`);
            break;
        case 'double_charge':
            result.additionalEffects.push('double_charge');
            break;
        case 'poison_trap':
            if (context.isRetreat) {
                result.poisonTrapPositions.push(context.attackerPosition);
                result.additionalEffects.push('poison_trap');
            }
            result.poisonTrapDamage = effect.damagePerTurn;
            result.poisonTrapSlow = effect.slowAmount;
            break;
        case 'contaminate':
            result.contaminateActive = true;
            result.additionalEffects.push('contaminate_coastal');
            break;
        case 'withering':
            result.witheringReduction = effect.healingReduction;
            result.additionalEffects.push(`withering_healing_reduction_${effect.healingReduction * 100}%`);
            break;
        case 'stealth_healing':
            if (context.isStealthed) {
                result.additionalEffects.push('stealth_healing');
            }
            break;
        case 'terrain_poison':
            result.poisonStacks += effect.damagePerTurn;
            result.additionalEffects.push('terrain_poison');
            break;
        case 'multiplier_stack':
            result.damage = Math.floor(result.damage * effect.multiplier);
            result.additionalEffects.push(`poison_multiplier_${effect.multiplier}x`);
            break;
        case 'aura_overlap':
            result.defense += effect.stackingBonus;
            result.additionalEffects.push('aura_overlap');
            break;
        case 'wave_cavalry':
            result.additionalEffects.push('wave_cavalry_amphibious');
            break;
        case 'stealth_recharge':
            result.additionalEffects.push('stealth_recharge');
            break;
        case 'desert_fortress':
            result.defense += 0.30;
            result.additionalEffects.push('desert_fortress');
            break;
        case 'frostbite':
            result.frostbiteColdDoT = effect.coldDamagePerTurn;
            result.frostbiteSlow = effect.slowAmount;
            result.frostbiteStacks += effect.coldDamagePerTurn;
            result.slowDuration = Math.max(result.slowDuration, effect.slowAmount);
            result.additionalEffects.push('frostbite');
            break;
        case 'frost_defense':
            result.defense += effect.defenseBonus;
            result.additionalEffects.push('frost_defense');
            break;
        case 'bear_charge':
            result.knockbackDistance = Math.max(result.knockbackDistance, effect.knockbackDistance);
            result.additionalEffects.push('bear_charge');
            break;
        case 'frost_speed':
            result.additionalEffects.push(`frost_speed_movement_${effect.movementBonus}`);
            break;
        case 'bear_cover':
            result.defense += effect.defenseBonus;
            result.additionalEffects.push('bear_cover');
            break;
        case 'ice_zone':
            result.additionalEffects.push('ice_zone_difficult_terrain');
            break;
        case 'frost_regen':
            result.additionalEffects.push(`frost_regen_${effect.regenAmount}`);
            break;
        case 'bear_mount':
            result.additionalEffects.push('bear_mount');
            break;
        case 'terrain_share':
            result.additionalEffects.push('terrain_share');
            break;
        case 'pack_bonus':
            result.damage = Math.floor(result.damage * (1 + effect.attackBonus));
            result.defense += effect.defenseBonus;
            result.additionalEffects.push('pack_bonus');
            break;
        case 'oasis':
            result.additionalEffects.push('oasis_neutral_terrain');
            break;
        case 'permanent_stealth_terrain':
            result.additionalEffects.push('permanent_stealth_terrain');
            break;
        case 'shadow_network':
            result.additionalEffects.push('shadow_network');
            break;
        case 'nomad_network':
            result.additionalEffects.push('nomad_network');
            break;
        case 'heal_on_retreat':
            result.healOnRetreatAmount = effect.healAmount;
            if (context.isRetreat) {
                result.additionalEffects.push(`heal_on_retreat_${effect.healAmount}`);
            }
            break;
        case 'impassable_retreat':
            result.additionalEffects.push('impassable_retreat');
            break;
        case 'swarm_speed':
            result.swarmSpeedBonus = effect.speedBonus;
            result.additionalEffects.push(`swarm_speed_${effect.speedBonus}`);
            break;
    }
}
function applyEmergentCombatEffects(emergentRule, context, result) {
    switch (emergentRule.effect.type) {
        case 'sustain':
            result.additionalEffects.push('paladin_sustain');
            break;
        case 'terrain_charge':
            if (context.isCharge) {
                result.damage = Math.floor(result.damage * (1 + emergentRule.effect.nativeTerrainDamageBonus));
                result.additionalEffects.push('terrain_charge_penetration');
            }
            break;
        case 'permanent_stealth':
            result.additionalEffects.push('permanent_stealth');
            break;
        case 'zone_of_control':
            result.defense += emergentRule.effect.defenseBonus;
            result.additionalEffects.push(`zone_of_control_radius_${emergentRule.effect.radius}`);
            break;
        case 'mobility_unit':
            result.additionalEffects.push('mobility_unit_ignore_terrain');
            break;
        case 'combat_unit':
            if (emergentRule.effect.doubleCombatBonuses) {
                result.damage = Math.floor(result.damage * 2);
                result.defense *= 2;
                result.additionalEffects.push('combat_unit_doubled');
            }
            break;
        case 'slave_empire':
            result.additionalEffects.push(`slave_empire_capture_aura_${emergentRule.effect.captureAuraRadius}`);
            break;
        case 'desert_raider':
            result.additionalEffects.push('desert_raider_capture_bonus');
            break;
        case 'poison_shadow':
            if (context.isStealthAttack) {
                result.poisonStacks += emergentRule.effect.stealthPoisonStacks;
                result.additionalEffects.push('poison_shadow_stealth_attack');
            }
            if (context.isRetreat && emergentRule.effect.retreatPoisonCloud) {
                result.poisonTrapPositions.push(context.attackerPosition);
                result.poisonTrapDamage = emergentRule.effect.poisonCloudDamage;
                result.additionalEffects.push('poison_shadow_retreat_cloud');
            }
            break;
        case 'iron_turtle':
            result.damageReflection = emergentRule.effect.damageReflection;
            result.additionalEffects.push(`iron_turtle_crushing_zone_${emergentRule.effect.crushingZoneDamage}`);
            break;
        case 'multiplier': {
            const multiplier = emergentRule.effect.pairSynergyMultiplier;
            result.damage = Math.floor(result.damage * multiplier);
            result.additionalEffects.push(`adaptive_multiplier_${multiplier}x`);
            break;
        }
    }
}
export function applyMovementSynergies(context, synergies) {
    let movementCost = 1;
    let canTraverse = true;
    let ignoreTerrain = context.unitTags.includes('camel');
    const finalPosition = { ...context.to };
    for (const synergy of synergies) {
        const effect = synergy.effect;
        // Terrain ignore from camel adaptation
        if (effect.type === 'terrain_poison' || effect.type === 'oasis') {
            ignoreTerrain = true;
        }
        // Swarm speed bonus
        if (effect.type === 'swarm_speed') {
            movementCost = Math.max(0, movementCost - effect.speedBonus);
        }
        // Ghost army ignores all terrain (handled via emergent effects in triple stack)
        // For pair synergies, terrain_share and nomad_network handle terrain ignore
    }
    return {
        movementCost,
        canTraverse,
        finalPosition,
        ignoreTerrain,
    };
}
export function applyHealingSynergies(context, synergies) {
    let healAmount = context.baseHeal;
    for (const synergy of synergies) {
        const effect = synergy.effect;
        // Stealth healing - doesn't break stealth
        if (effect.type === 'stealth_healing' && context.isStealthed) {
            healAmount = context.baseHeal;
        }
        // Extended healing aura
        if (effect.type === 'extended_healing') {
            const ext = effect;
            healAmount = Math.max(healAmount, ext.selfHeal);
        }
        // Frost regen
        if (effect.type === 'frost_regen') {
            healAmount += effect.regenAmount;
        }
        // Oasis effect
        if (effect.type === 'oasis') {
            // Oasis neutralizes terrain penalties for allies
            healAmount += 1;
        }
    }
    return healAmount;
}
