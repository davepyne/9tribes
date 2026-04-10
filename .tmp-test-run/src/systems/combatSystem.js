// Combat System - War Engine v2
// Multi-factor combat resolution with role/weapon effectiveness, morale, and combat signals
import { getRoleEffectiveness } from '../data/roleEffectiveness.js';
import { getWeaponEffectiveness } from '../data/weaponEffectiveness.js';
import { calculateMoraleLoss, TRIUMPH_MORALE_BONUS } from './moraleSystem.js';
import { collectCombatSignals } from './combatSignalSystem.js';
import { rngNextFloat } from '../core/rng.js';
// Calculate attack stat: base × (1 + veteranBonus)
function calculateAttack(unit, prototype, veteranBonus) {
    const base = prototype.derivedStats.attack;
    return Math.max(1, Math.round(base * (1 + veteranBonus)));
}
// Calculate defense stat: base × (1 + terrainModifier + improvementBonus + veteranBonus)
function calculateDefense(unit, prototype, veteranBonus, terrain, improvementBonus, situationalDefenseModifier) {
    const base = prototype.derivedStats.defense;
    const terrainMod = terrain?.defenseModifier ?? 0;
    return Math.max(1, Math.round(base * (1 + terrainMod + improvementBonus + veteranBonus + situationalDefenseModifier)));
}
// Calculate damage: max(floor, attackStrength - defense/3)
function calculateDamage(attackStrength, defenseStrength, minDamage) {
    return Math.max(minDamage, attackStrength - Math.floor(defenseStrength / 3));
}
function applyDamageVariance(rngState, baseDamage, minDamage) {
    const multiplier = 0.9 + rngNextFloat(rngState) * 0.2;
    return {
        damage: Math.max(minDamage, Math.round(baseDamage * multiplier)),
        multiplier,
    };
}
// Get weapon tags from weapon components only.
function getWeaponTags(prototype, registry) {
    const tags = [];
    for (const componentId of prototype.componentIds) {
        const component = registry.getComponent(componentId);
        if (component && component.slotType === 'weapon' && component.tags) {
            tags.push(...component.tags);
        }
    }
    return tags;
}
function isRangedAttack(prototype, registry) {
    if (prototype.derivedStats.role === 'ranged') {
        return true;
    }
    const weaponTags = getWeaponTags(prototype, registry);
    return weaponTags.includes('ranged');
}
// Execute a combat round between two units
export function resolveCombat(attacker, defender, attackerPrototype, defenderPrototype, attackerVeteranBonus, defenderVeteranBonus, attackerTerrain, defenderTerrain, defenderImprovementBonus, defenderVeteranMoraleBonus, registry, flankingBonus = 0, situationalAttackModifier = 0, situationalDefenseModifier = 0, rngState, rearAttackBonus = 0, braceDefenseBonus = 0, ambushAttackBonus = 0, bonusDefenderMoraleLoss = 0, retaliationDamageMultiplier = 1, hiddenAttackBonus = 0, isCharge = false, isStealthed = false, chargeShield = false, antiDisplacement = false, stealthChargeMultiplier = 0, accuracyDebuff = 0, forestFirstStrike = false) {
    // 1. Calculate base stats
    const attackerAttack = calculateAttack(attacker, attackerPrototype, attackerVeteranBonus);
    const defenderDefense = calculateDefense(defender, defenderPrototype, defenderVeteranBonus, defenderTerrain, defenderImprovementBonus, situationalDefenseModifier);
    // 2. Role effectiveness (rock-paper-scissors)
    const attackerRole = attackerPrototype.derivedStats.role;
    const defenderRole = defenderPrototype.derivedStats.role;
    const roleMod = getRoleEffectiveness(attackerRole, defenderRole);
    // 3. Weapon effectiveness (spear vs cavalry, etc.)
    const attackerWeaponTags = getWeaponTags(attackerPrototype, registry);
    const defenderMovementClass = registry.getChassis(defenderPrototype.chassisId)?.movementClass ?? 'infantry';
    const weaponMod = getWeaponEffectiveness(attackerWeaponTags, defenderMovementClass);
    // 4. Calculate attack strength with multipliers
    //    Flanking and rear attacks are multiplicative (compounding) to reward
    //    positional play — a flanked rear attack is devastating, not just additive.
    //    Role, weapon, and other situational bonuses remain additive.
    const stealthAmbushBonus = isStealthed ? 0.50 : 0;
    const baseMultiplier = 1 + roleMod + weaponMod + situationalAttackModifier + ambushAttackBonus + hiddenAttackBonus + stealthAmbushBonus + stealthChargeMultiplier;
    const positionalMultiplier = (1 + flankingBonus) * (1 + rearAttackBonus);
    const attackStrength = Math.round(attackerAttack * baseMultiplier * positionalMultiplier);
    const defenseStrength = Math.round(defenderDefense * (1 + braceDefenseBonus) * (1 - accuracyDebuff));
    // 6. Calculate defender damage (attacker hits defender first)
    // charge_shield: if attacker has charge shield, defender takes 0 damage from first hit
    const defenderBaseDamage = chargeShield ? 0 : calculateDamage(attackStrength, defenseStrength, 3);
    const defenderVariance = applyDamageVariance(rngState, defenderBaseDamage, 3);
    const defenderDamage = defenderVariance.damage;
    // 7. Calculate if defender is destroyed from the initial hit
    const defenderNewHp = defender.hp - defenderDamage;
    const defenderDestroyed = defenderNewHp <= 0;
    // 8. Ranged attacks take no retaliation
    const attackerIsRanged = isRangedAttack(attackerPrototype, registry);
    let attackerDamage = 0;
    let retaliationVarianceMultiplier = 1;
    // Strike-first (cavalry charge): cavalry deals damage before defender retaliates
    // If defender is killed by the strike-first attack, attacker takes 0 damage
    const attackerHasCavalryTag = attackerPrototype.tags?.includes('cavalry') ?? false;
    const strikeFirstApplies = (isCharge && attackerHasCavalryTag) || forestFirstStrike;
    const noRetaliationOnKill = strikeFirstApplies && defenderDestroyed;
    if (!attackerIsRanged && !noRetaliationOnKill) {
        const retaliationBaseDamage = calculateDamage(Math.round(defenderDefense * 0.6 * retaliationDamageMultiplier), calculateAttack(attacker, attackerPrototype, attackerVeteranBonus), 1);
        const retaliationVariance = applyDamageVariance(rngState, retaliationBaseDamage, 1);
        attackerDamage = retaliationVariance.damage;
        retaliationVarianceMultiplier = retaliationVariance.multiplier;
    }
    // 8b. Determine knockback (elephant stampede)
    const attackerHasElephantTag = attackerPrototype.tags?.includes('elephant') ?? false;
    const defenderKnockedBack = isCharge && attackerHasElephantTag && !antiDisplacement;
    const knockbackDistance = defenderKnockedBack ? 1 : 0;
    // 9. Apply HP changes (attacker)
    const attackerNewHp = attacker.hp - attackerDamage;
    const attackerDestroyed = attackerNewHp <= 0;
    // 8. Calculate morale impact
    let defenderMoraleLoss = calculateMoraleLoss(defenderDamage, defender.maxHp, defenderVeteranMoraleBonus);
    defenderMoraleLoss += bonusDefenderMoraleLoss;
    let attackerMoraleLoss = calculateMoraleLoss(attackerDamage, attacker.maxHp, 0 // attacker doesn't get defensive morale bonus
    );
    // Triumph bonus: killing enemy restores some morale
    if (defenderDestroyed) {
        attackerMoraleLoss -= TRIUMPH_MORALE_BONUS;
    }
    if (attackerDestroyed) {
        defenderMoraleLoss -= TRIUMPH_MORALE_BONUS;
    }
    // 9. Check for rout
    const defenderNewMorale = defender.morale - defenderMoraleLoss;
    const attackerNewMorale = attacker.morale - attackerMoraleLoss;
    const defenderRouted = !defenderDestroyed && defenderNewMorale <= 25;
    const attackerRouted = !attackerDestroyed && attackerNewMorale <= 25;
    // 9b. Cavalry flee: mounted units route at 50% HP (can run away faster)
    // Elephants flee at 35% HP — stubborn war animals but not invincible
    const attackerMovementClass = registry.getChassis(attackerPrototype.chassisId)?.movementClass ?? 'infantry';
    const defenderIsElephant = defenderPrototype.tags?.includes('elephant') ?? false;
    const attackerIsElephant = attackerPrototype.tags?.includes('elephant') ?? false;
    const defenderElephantFleeThreshold = defenderIsElephant ? 0.35 : 0.5;
    const attackerElephantFleeThreshold = attackerIsElephant ? 0.35 : 0.5;
    const defenderIsSummoned = defenderPrototype.tags?.includes('summon') ?? false;
    const attackerIsSummoned = attackerPrototype.tags?.includes('summon') ?? false;
    const defenderFled = !defenderDestroyed && !defenderRouted && !defenderIsSummoned
        && (defenderMovementClass === 'cavalry' || defenderMovementClass === 'camel' || defenderMovementClass === 'beast') && defenderNewHp <= defender.maxHp * defenderElephantFleeThreshold;
    const attackerFled = !attackerDestroyed && !attackerRouted && !attackerIsSummoned
        && (attackerMovementClass === 'cavalry' || attackerMovementClass === 'camel' || attackerMovementClass === 'beast') && attackerNewHp <= attacker.maxHp * attackerElephantFleeThreshold;
    // 10. Collect combat signals for capability feedback
    const signals = collectCombatSignals(attackerTerrain, defenderTerrain, attackerRole, attackerWeaponTags, defenderMovementClass, attackerPrototype.tags ?? []);
    return {
        attackerId: attacker.id,
        defenderId: defender.id,
        attackerBaseAttack: attackerAttack,
        defenderBaseDefense: defenderDefense,
        attackerDamage,
        defenderDamage,
        attackerDestroyed,
        defenderDestroyed,
        attackerMoraleLoss: Math.max(0, attackerMoraleLoss),
        defenderMoraleLoss: Math.max(0, defenderMoraleLoss),
        attackerRouted,
        defenderRouted,
        attackerFled,
        defenderFled,
        roleModifier: roleMod,
        weaponModifier: weaponMod,
        flankingBonus,
        rearAttackBonus,
        braceDefenseBonus,
        ambushAttackBonus,
        hiddenAttackBonus,
        situationalAttackModifier,
        situationalDefenseModifier,
        baseMultiplier,
        positionalMultiplier,
        attackStrength,
        defenseStrength,
        damageVarianceMultiplier: defenderVariance.multiplier,
        retaliationVarianceMultiplier,
        signals,
        rngState,
        defenderKnockedBack,
        knockbackDistance,
        // Phase 3: synergy-driven fields
        chargeShield,
        antiDisplacement,
        stealthChargeMultiplier,
        witheringReduction: 0,
        aoeDamage: 0,
        sandstormAccuracyDebuff: accuracyDebuff,
    };
}
// Get veteran stat bonus (percentage) from registry
export function getVeteranStatBonus(registry, veteranLevel) {
    const veteranDef = registry.getVeteranLevel(veteranLevel);
    return veteranDef?.attackBonus ?? 0;
}
// Get veteran defense bonus (percentage) from registry
export function getVeteranDefenseBonus(registry, veteranLevel) {
    const veteranDef = registry.getVeteranLevel(veteranLevel);
    return veteranDef?.defenseBonus ?? 0;
}
// Get veteran morale bonus from registry
export function getVeteranMoraleBonus(registry, veteranLevel) {
    const veteranDef = registry.getVeteranLevel(veteranLevel);
    return veteranDef?.moraleBonus ?? 0;
}
// Add history entry to unit
export function addBattleHistory(unit, opponentId, won) {
    unit.history.push({
        type: 'battle_fought',
        timestamp: Date.now(),
        details: { opponentId, outcome: won ? 'victory' : 'defeat' },
    });
}
