import { activateUnit, maybeExpirePreparedAbility } from './unitActivationSystem.js';
import { buildActivationQueue, nextUnitActivation, resetAllUnitsForRound, } from './turnSystem.js';
import { getUnitAtHex } from './occupancySystem.js';
import { getBattleCount, getKillCount, resetCombatRecordStreaks, } from './historySystem.js';
import { applyEcologyPressure, applyForceCompositionPressure, describeCapabilityLevels, } from './capabilitySystem.js';
import { resolveResearchDoctrine, prototypeHasComponent, } from './capabilityDoctrine.js';
import { recoverMorale, checkRally } from './moraleSystem.js';
import { unlockHybridRecipes } from './hybridSystem.js';
import { addResearchProgress, startResearch } from './researchSystem.js';
import { evaluateAndSpawnVillage, getVillageCount } from './villageSystem.js';
import { deriveResourceIncome, getSupplyDeficit, advanceCaptureTimers } from './economySystem.js';
import { advanceProduction, canCompleteCurrentProduction, completeProduction, getAvailableProductionPrototypes, queueUnit, } from './productionSystem.js';
import { chooseStrategicProduction } from './aiProductionStrategy.js';
import { chooseStrategicResearch } from './aiResearchStrategy.js';
import { tickStealthCooldown, enterStealth, getNatureHealingAura, } from './signatureAbilitySystem.js';
import { isCityEncircled, isEncirclementBroken, getHexOwner } from './territorySystem.js';
import { degradeWalls, repairWalls, isCityVulnerable, getCapturingFaction, captureCity, } from './siegeSystem.js';
import { addExhaustion, tickWarExhaustion, applyDecay, calculateMoralePenalty, EXHAUSTION_CONFIG, applySupplyDeficitPenalties, } from './warExhaustionSystem.js';
import { getFactionCityIds, } from './factionOwnershipSystem.js';
import { getHealingBonus, } from './factionIdentitySystem.js';
import { createUnitId } from '../core/ids.js';
import { isHexOccupied } from './occupancySystem.js';
import { hexDistance, hexToKey, getNeighbors } from '../core/grid.js';
import { SynergyEngine } from './synergyEngine.js';
import { applyHealingSynergies, } from './synergyEffects.js';
import { canSacrifice, performSacrifice } from './sacrificeSystem.js';
import { getDomainProgression } from './domainProgression.js';
import { computeFactionStrategy, } from './strategicAi.js';
import { updateFogState } from './fogSystem.js';
import pairSynergiesData from '../content/base/pair-synergies.json' with { type: 'json' };
import abilityDomainsData from '../content/base/ability-domains.json' with { type: 'json' };
import emergentRulesData from '../content/base/emergent-rules.json' with { type: 'json' };
// Create synergy engine instance (lazily initialized)
let synergyEngine = null;
export function getSynergyEngine() {
    if (!synergyEngine) {
        synergyEngine = new SynergyEngine(pairSynergiesData.pairSynergies, emergentRulesData.rules, Object.values(abilityDomainsData.domains));
    }
    return synergyEngine;
}
export function calculateSynergyAttackBonus(result) {
    let bonus = 0;
    // Pack bonus adds to attack
    if (result.additionalEffects.some(e => e.includes('pack_bonus'))) {
        bonus += 0.25;
    }
    // Multiplier stack effects
    const multiplierEffect = result.additionalEffects.find(e => e.includes('poison_multiplier'));
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
    // Dug in bonus
    if (result.additionalEffects.includes('dug_in')) {
        bonus += 0.75;
    }
    // Frost defense bonus
    if (result.additionalEffects.includes('frost_defense')) {
        bonus += 0.50;
    }
    // Bear cover bonus
    if (result.additionalEffects.includes('bear_cover')) {
        bonus += 0.25;
    }
    // Aura overlap bonus
    if (result.additionalEffects.includes('aura_overlap')) {
        bonus += 0.50;
    }
    return bonus;
}
const HEALING_CONFIG = {
    OWNED_TERRITORY: 0.10, // 10% of max HP in faction-owned territory
    CITY_GARRISON: 0.50, // 50% of max HP in friendly city
    VILLAGE: 0.50, // 50% of max HP in friendly village
    FIELD: 0.05, // 5% base fallback
};
function getHealRate(unit, state, factionId) {
    const faction = state.factions.get(factionId);
    const terrainId = getTerrainAt(state, unit.position);
    // Check city healing first
    for (const [, city] of state.cities) {
        if (city.factionId !== factionId)
            continue;
        if (city.besieged)
            continue;
        const dist = hexDistance(unit.position, city.position);
        if (dist === 0)
            return Math.floor(unit.maxHp * HEALING_CONFIG.CITY_GARRISON) + getHealingBonus(faction, terrainId);
        if (dist === 1) {
            // Adjacent to city = still in owned territory
            const hexOwner = getHexOwner(unit.position, state);
            if (hexOwner === factionId)
                return Math.floor(unit.maxHp * HEALING_CONFIG.OWNED_TERRITORY) + getHealingBonus(faction, terrainId);
        }
    }
    // Check village healing
    for (const [, village] of state.villages) {
        if (village.factionId !== factionId)
            continue;
        if (hexDistance(unit.position, village.position) === 0) {
            return Math.floor(unit.maxHp * HEALING_CONFIG.VILLAGE) + getHealingBonus(faction, terrainId);
        }
    }
    // Check if in owned territory (hex claimed by a friendly city)
    const hexOwner = getHexOwner(unit.position, state);
    if (hexOwner === factionId) {
        return Math.floor(unit.maxHp * HEALING_CONFIG.OWNED_TERRITORY) + getHealingBonus(faction, terrainId);
    }
    return Math.floor(unit.maxHp * HEALING_CONFIG.FIELD) + getHealingBonus(faction, terrainId);
}
export function createSimulationTrace(recordSnapshots = false) {
    return {
        lines: [],
        snapshots: recordSnapshots ? [] : undefined,
        events: [],
        combatEvents: [],
        siegeEvents: [],
        aiIntentEvents: [],
        factionStrategyEvents: [],
        abilityLearnedEvents: [],
        unitSacrificedEvents: [],
        currentRound: 0,
    };
}
function recordSnapshot(state, trace, phase) {
    if (!trace?.snapshots)
        return;
    const factions = [];
    for (const [id, faction] of state.factions) {
        const livingUnits = faction.unitIds.filter((uid) => state.units.has(uid));
        factions.push({
            id,
            name: faction.name,
            livingUnits: livingUnits.length,
            cities: faction.cityIds.length,
            villages: faction.villageIds.length,
        });
    }
    const units = [];
    for (const [id, unit] of state.units) {
        if (unit.hp <= 0)
            continue;
        units.push({
            id,
            factionId: unit.factionId,
            prototypeId: unit.prototypeId,
            q: unit.position.q,
            r: unit.position.r,
            hp: unit.hp,
            maxHp: unit.maxHp,
            facing: unit.facing,
        });
    }
    const cities = [];
    for (const [id, city] of state.cities) {
        cities.push({
            id,
            factionId: city.factionId,
            q: city.position.q,
            r: city.position.r,
            besieged: city.besieged,
            wallHP: city.wallHP,
            maxWallHP: city.maxWallHP,
            turnsUnderSiege: city.turnsUnderSiege,
        });
    }
    const villages = [];
    for (const [id, village] of state.villages) {
        villages.push({
            id,
            factionId: village.factionId,
            q: village.position.q,
            r: village.position.r,
        });
    }
    const factionTripleStacks = [];
    for (const [id, faction] of state.factions) {
        if (faction.activeTripleStack) {
            factionTripleStacks.push({
                factionId: id,
                domains: faction.activeTripleStack.domains,
                tripleName: faction.activeTripleStack.name,
                emergentRule: faction.activeTripleStack.emergentRule.name,
            });
        }
    }
    trace.snapshots.push({ round: state.round, phase, factions, units, cities, villages, factionTripleStacks });
}
export function log(trace, line) {
    trace?.lines.push(line);
    if (trace?.events) {
        trace.events.push({
            round: trace.currentRound ?? 0,
            message: line,
        });
    }
}
export function recordCombatEvent(trace, event) {
    trace?.combatEvents?.push(event);
}
function recordSiegeEvent(trace, event) {
    trace?.siegeEvents?.push(event);
}
export function recordAiIntent(trace, event) {
    trace?.aiIntentEvents?.push(event);
}
function recordFactionStrategy(trace, event) {
    trace?.factionStrategyEvents?.push(event);
}
function maybeRecordEndSnapshot(state, trace) {
    if (!trace?.snapshots)
        return;
    const lastSnapshot = trace.snapshots[trace.snapshots.length - 1];
    if (lastSnapshot?.round === state.round && lastSnapshot.phase === 'end') {
        return;
    }
    recordSnapshot(state, trace, 'end');
}
function getTerrainAt(state, pos) {
    return state.map?.tiles.get(hexToKey(pos))?.terrain ?? 'plains';
}
function occupiesFriendlySettlement(state, unit) {
    for (const city of state.cities.values()) {
        if (city.factionId === unit.factionId &&
            city.position.q === unit.position.q &&
            city.position.r === unit.position.r) {
            return true;
        }
    }
    for (const village of state.villages.values()) {
        if (village.factionId === unit.factionId &&
            village.position.q === unit.position.q &&
            village.position.r === unit.position.r) {
            return true;
        }
    }
    return false;
}
function isJungleImmune(state, unit) {
    const faction = state.factions.get(unit.factionId);
    return faction?.identityProfile.passiveTrait === 'jungle_stalkers';
}
function canInflictPoison(state, unit) {
    const prototype = state.prototypes.get(unit.prototypeId);
    return Boolean(prototype?.tags?.includes('poison'));
}
function applyEnvironmentalDamage(state, factionId, registry, trace) {
    const faction = state.factions.get(factionId);
    if (!faction) {
        return state;
    }
    const units = new Map(state.units);
    let current = state;
    // Faction-level doctrine (resolved once for faction-wide effects like toxic_bulwark)
    const factionResearch = state.research.get(factionId);
    const doctrine = resolveResearchDoctrine(factionResearch, faction);
    for (const unitId of faction.unitIds) {
        const unit = units.get(unitId);
        if (!unit || unit.hp <= 0) {
            continue;
        }
        const safeInSettlement = occupiesFriendlySettlement(current, unit);
        let updatedUnit = unit;
        let died = false;
        if (unit.poisoned && safeInSettlement) {
            updatedUnit = { ...updatedUnit, poisoned: false, poisonedBy: undefined, poisonStacks: 0 };
        }
        if (unit.poisoned && !safeInSettlement) {
            // Poison DoT: damage based on poisonStacks (2 dmg per stack per turn)
            const poisonDamage = unit.poisonStacks > 0 ? unit.poisonStacks * doctrine.poisonDamagePerStack : (unit.poisonedBy
                ? registry.getSignatureAbility(unit.poisonedBy)?.venomDamagePerTurn ?? 1
                : 1);
            updatedUnit = { ...updatedUnit, hp: Math.max(0, updatedUnit.hp - poisonDamage) };
            log(trace, `${faction.name} ${current.prototypes.get(unit.prototypeId)?.name ?? 'unit'} suffers poison (${poisonDamage} dmg, ${unit.poisonStacks} stacks)`);
            died = updatedUnit.hp <= 0;
        }
        const terrainId = getTerrainAt(current, unit.position);
        if (!died && terrainId === 'jungle' && !safeInSettlement && !isJungleImmune(current, updatedUnit)) {
            // Jungle attrition: 1 damage per turn in jungle (no research-based reduction)
            updatedUnit = { ...updatedUnit, hp: Math.max(0, updatedUnit.hp - 1) };
            log(trace, `${faction.name} ${current.prototypes.get(unit.prototypeId)?.name ?? 'unit'} suffers jungle attrition`);
            died = updatedUnit.hp <= 0;
        }
        // Contamination damage: units on contaminated hexes take 1 damage
        if (!died && !safeInSettlement && current.contaminatedHexes.has(hexToKey(unit.position))) {
            // Contamination: 1 damage per turn (no research-based reduction)
            updatedUnit = { ...updatedUnit, hp: Math.max(0, updatedUnit.hp - 1) };
            log(trace, `${faction.name} ${current.prototypes.get(unit.prototypeId)?.name ?? 'unit'} suffers contamination (1 dmg)`);
            died = updatedUnit.hp <= 0;
        }
        // Frostbite DoT: frozen units take frostbiteStacks damage, decrement duration
        if (!died && updatedUnit.frozen && (updatedUnit.frostbiteDoTDuration ?? 0) > 0 && (updatedUnit.frostbiteStacks ?? 0) > 0) {
            updatedUnit = { ...updatedUnit, hp: Math.max(0, updatedUnit.hp - (updatedUnit.frostbiteStacks ?? 0)) };
            const newDuration = (updatedUnit.frostbiteDoTDuration ?? 0) - 1;
            if (newDuration <= 0) {
                updatedUnit = { ...updatedUnit, frozen: false, frostbiteStacks: 0, frostbiteDoTDuration: 0 };
            }
            else {
                updatedUnit = { ...updatedUnit, frostbiteDoTDuration: newDuration };
            }
            log(trace, `${faction.name} ${current.prototypes.get(unit.prototypeId)?.name ?? 'unit'} suffers frostbite (${updatedUnit.frostbiteStacks ?? 0} dmg)`);
            died = updatedUnit.hp <= 0;
        }
        if (safeInSettlement && updatedUnit.poisoned) {
            updatedUnit = { ...updatedUnit, poisoned: false, poisonedBy: undefined, poisonStacks: 0 };
            log(trace, `${faction.name} ${current.prototypes.get(unit.prototypeId)?.name ?? 'unit'} is cleansed of poison`);
        }
        if (died) {
            units.delete(unitId);
            current = removeUnitFromFaction({ ...current, units }, factionId, unitId);
            log(trace, `${faction.name} ${current.prototypes.get(unit.prototypeId)?.name ?? 'unit'} succumbed to attrition`);
            continue;
        }
        units.set(unitId, updatedUnit);
    }
    // Toxic bulwark (venom Tier 3): each alive unit with this doctrine deals 1 poison damage
    // to each adjacent enemy unit per turn.
    if (doctrine.toxicBulwarkEnabled) {
        for (const unitIdStr of faction.unitIds) {
            const bulwarkUnit = units.get(unitIdStr);
            if (!bulwarkUnit || bulwarkUnit.hp <= 0)
                continue;
            for (const neighbor of getNeighbors(bulwarkUnit.position)) {
                const neighborId = getUnitAtHex({ ...current, units }, neighbor);
                if (!neighborId)
                    continue;
                const neighborUnit = units.get(neighborId) ?? current.units.get(neighborId);
                if (!neighborUnit || neighborUnit.factionId === factionId || neighborUnit.hp <= 0)
                    continue;
                units.set(neighborId, {
                    ...neighborUnit,
                    hp: Math.max(0, neighborUnit.hp - 1),
                });
            }
        }
    }
    return { ...current, units };
}
function chooseBestChassis(state, factionId, registry) {
    const faction = state.factions.get(factionId);
    const availablePrototypes = getAvailableProductionPrototypes(state, factionId, registry);
    if (!faction || availablePrototypes.length === 0)
        return null;
    const livingSteppeScreens = factionId === 'steppe_clan'
        ? faction.unitIds.reduce((count, unitId) => {
            const unit = state.units.get(unitId);
            if (!unit || unit.hp <= 0) {
                return count;
            }
            const prototype = state.prototypes.get(unit.prototypeId);
            if (!prototype || prototype.derivedStats.role === 'mounted') {
                return count;
            }
            const tags = new Set(prototype.tags ?? []);
            return tags.has('spear') || tags.has('formation') ? count + 1 : count;
        }, 0)
        : 0;
    const missingSteppeScreens = Math.max(0, 2 - livingSteppeScreens);
    const chassisCounts = {};
    const totalUnits = faction.unitIds.length;
    for (const unitId of faction.unitIds) {
        const unit = state.units.get(unitId);
        if (!unit || unit.hp <= 0)
            continue;
        const proto = state.prototypes.get(unit.prototypeId);
        if (proto) {
            chassisCounts[proto.chassisId] = (chassisCounts[proto.chassisId] ?? 0) + 1;
        }
    }
    const infantryFactionBonus = factionId === 'hill_clan'
        ? 2
        : factionId === 'druid_circle'
            ? 0.75
            : 0;
    const rangedFactionBonus = factionId === 'jungle_clan'
        ? 1.5
        : factionId === 'hill_clan'
            ? 1.0
            : factionId === 'druid_circle'
                ? 0.75
                : 0;
    const cavalryFactionBonus = factionId === 'steppe_clan' ? 2 : 0;
    const elephantFactionBonus = factionId === 'savannah_lions' ? 2 : 0;
    const navalFactionBonus = factionId === 'coral_people'
        ? 1.0
        : factionId === 'plains_riders'
            ? 1.5
            : 0;
    const steppeInfantryScreenBonus = missingSteppeScreens * 8;
    const steppeCavalryScreenPenalty = missingSteppeScreens * 3;
    const prototypeScores = availablePrototypes.map((prototype) => {
        const tags = new Set(prototype.tags ?? []);
        let score = 0;
        if (prototype.chassisId === 'infantry_frame' || prototype.chassisId === 'heavy_infantry_frame') {
            score += infantryFactionBonus + steppeInfantryScreenBonus;
            if (tags.has('fortress') || tags.has('formation'))
                score += 2;
        }
        if (prototype.chassisId === 'ranged_frame' || prototype.chassisId === 'ranged_naval_frame') {
            score += rangedFactionBonus;
            if (tags.has('ranged') || tags.has('skirmish'))
                score += 1.5;
        }
        if (prototype.chassisId === 'cavalry_frame' || prototype.chassisId === 'heavy_cavalry' || prototype.chassisId === 'chariot_frame') {
            score += cavalryFactionBonus - steppeCavalryScreenPenalty;
            if (tags.has('mobility') || tags.has('shock'))
                score += 2;
        }
        if (prototype.chassisId === 'camel_frame') {
            score += factionId === 'desert_nomads' ? 2 : 0;
            if (tags.has('camel') || tags.has('desert'))
                score += 2;
        }
        if (prototype.chassisId === 'naval_frame' || prototype.chassisId === 'galley_frame') {
            score += navalFactionBonus;
            if (tags.has('naval') || tags.has('amphibious'))
                score += 2;
        }
        if (prototype.chassisId === 'elephant_frame') {
            score += elephantFactionBonus;
            if (tags.has('elephant') || tags.has('shock'))
                score += 2;
        }
        score -= (chassisCounts[prototype.chassisId] ?? 0) / Math.max(1, totalUnits) * 3;
        return { prototypeId: prototype.id, score };
    });
    prototypeScores.sort((a, b) => b.score - a.score);
    for (const { prototypeId } of prototypeScores) {
        const prototype = availablePrototypes.find((entry) => entry.id === prototypeId);
        if (prototype) {
            return { chassisId: prototype.chassisId, prototypeId: prototype.id };
        }
    }
    const fallbackProto = availablePrototypes[0];
    if (fallbackProto) {
        return { chassisId: fallbackProto.chassisId, prototypeId: fallbackProto.id };
    }
    return null;
}
export function getVictoryStatus(state) {
    const factionsWithUnits = new Set(Array.from(state.units.values())
        .filter((unit) => unit.hp > 0)
        .map((unit) => unit.factionId));
    const factionsWithCities = new Set(Array.from(state.cities.values())
        .filter((city) => !city.besieged)
        .map((city) => city.factionId));
    const aliveFactionIds = new Set([...factionsWithUnits, ...factionsWithCities]);
    if (aliveFactionIds.size === 1) {
        return {
            winnerFactionId: [...aliveFactionIds][0],
            victoryType: 'elimination',
            controlledCities: null,
            dominationThreshold: null,
        };
    }
    const totalCities = state.cities.size;
    if (totalCities > 0) {
        const dominationThreshold = Math.ceil(totalCities * 0.55);
        const cityControl = new Map();
        for (const city of state.cities.values()) {
            cityControl.set(city.factionId, (cityControl.get(city.factionId) ?? 0) + 1);
        }
        for (const [factionId, controlledCities] of cityControl) {
            if (controlledCities >= dominationThreshold) {
                return {
                    winnerFactionId: factionId,
                    victoryType: 'domination',
                    controlledCities,
                    dominationThreshold,
                };
            }
        }
        return {
            winnerFactionId: null,
            victoryType: 'unresolved',
            controlledCities: Math.max(0, ...cityControl.values()),
            dominationThreshold,
        };
    }
    return {
        winnerFactionId: null,
        victoryType: 'unresolved',
        controlledCities: null,
        dominationThreshold: null,
    };
}
function removeUnitFromFaction(state, factionId, unitId) {
    const faction = state.factions.get(factionId);
    if (!faction) {
        return state;
    }
    const factions = new Map(state.factions);
    factions.set(factionId, {
        ...faction,
        unitIds: faction.unitIds.filter((id) => id !== unitId),
    });
    return { ...state, factions };
}
function startOrAdvanceCodification(state, factionId, registry, trace, strategy, difficulty) {
    const faction = state.factions.get(factionId);
    const research = state.research.get(factionId);
    if (!faction || !research) {
        return state;
    }
    let currentResearch = research;
    if (!currentResearch.activeNodeId) {
        const decision = strategy ? chooseStrategicResearch(state, factionId, strategy, registry, difficulty) : null;
        if (decision) {
            const decisionNode = registry.getAllResearchDomains()
                .flatMap((domain) => Object.values(domain.nodes))
                .find((node) => node.id === decision.nodeId);
            const prerequisitesMet = (decisionNode?.prerequisites ?? []).every((prereqId) => currentResearch.completedNodes.includes(prereqId));
            if (prerequisitesMet) {
                currentResearch = startResearch(currentResearch, decision.nodeId, decisionNode?.prerequisites, faction.learnedDomains);
                const nodeName = decisionNode?.name ?? decision.nodeId;
                log(trace, `${faction.name} starts research on ${nodeName} (${decision.reason})`);
            }
        }
    }
    if (!currentResearch.activeNodeId) {
        return state;
    }
    const activeDomain = registry.getAllResearchDomains().find((domain) => Boolean(domain.nodes[currentResearch.activeNodeId]));
    const activeNode = activeDomain?.nodes[currentResearch.activeNodeId];
    if (!activeNode) {
        return state;
    }
    const updatedResearch = addResearchProgress(currentResearch, activeNode.xpCost, currentResearch.researchPerTurn);
    const researchMap = new Map(state.research);
    researchMap.set(factionId, updatedResearch);
    const current = { ...state, research: researchMap };
    if (!updatedResearch.activeNodeId) {
        log(trace, `${faction.name} completed research: ${activeNode.name}`);
    }
    return current;
}
function getAliveFactions(state) {
    const factionsWithUnits = new Set(Array.from(state.units.values())
        .filter((u) => u.hp > 0)
        .map((unit) => unit.factionId));
    const factionsWithCities = new Set(Array.from(state.cities.values())
        .filter((city) => !city.besieged)
        .map((city) => city.factionId));
    return new Set([...factionsWithUnits, ...factionsWithCities]);
}
/**
 * Summon Ability (generic): Manages summon lifecycle
 * - If summon exists, decrement turnsRemaining
 * - If turnsRemaining expires, remove summon and start cooldown
 * - If cooldown active, decrement it
 * - If no summon and no cooldown, spawn new summon on valid terrain
 */
function applySummonAbility(state, factionId, registry, trace) {
    const faction = state.factions.get(factionId);
    if (!faction || !state.map)
        return state;
    const abilities = registry.getSignatureAbility(factionId);
    if (!abilities)
        return state;
    const summonConfig = abilities.summon;
    if (!summonConfig)
        return state;
    const summonDuration = abilities.summonDuration ?? 5;
    const cooldownDuration = abilities.cooldownDuration ?? 5;
    // Initialize summonState if not exists
    let summonState = faction.summonState ?? {
        summoned: false,
        turnsRemaining: 0,
        cooldownRemaining: 0,
        unitId: null,
    };
    // If summon exists, decrement turnsRemaining
    if (summonState.summoned && summonState.unitId) {
        summonState = {
            ...summonState,
            turnsRemaining: summonState.turnsRemaining - 1,
        };
        // If turnsRemaining expired, remove the summon
        if (summonState.turnsRemaining <= 0 && summonState.unitId) {
            const units = new Map(state.units);
            units.delete(summonState.unitId);
            // Remove summon from faction's unitIds
            const updatedFaction = {
                ...faction,
                unitIds: faction.unitIds.filter(id => id !== summonState.unitId),
                summonState: {
                    ...summonState,
                    summoned: false,
                    unitId: null,
                    cooldownRemaining: cooldownDuration,
                },
            };
            const factions = new Map(state.factions);
            factions.set(factionId, updatedFaction);
            log(trace, `${faction.name}'s ${summonConfig.name} expired`);
            return { ...state, units, factions };
        }
    }
    // If no summon but cooldown active, decrement cooldown
    else if (summonState.cooldownRemaining > 0) {
        summonState = {
            ...summonState,
            cooldownRemaining: summonState.cooldownRemaining - 1,
        };
    }
    // If no summon and no cooldown, try to spawn on valid terrain
    else {
        // Find a priest unit on valid terrain for this summon
        let validUnit = null;
        for (const unitId of faction.unitIds) {
            const unit = state.units.get(unitId);
            if (unit && unit.hp > 0) {
                const terrainId = getTerrainAt(state, unit.position);
                if (summonConfig.terrainTypes.includes(terrainId)) {
                    // Only priests can trigger summoning
                    const prototype = state.prototypes.get(unit.prototypeId);
                    if (prototype && (prototype.tags ?? []).includes('priest')) {
                        validUnit = unit;
                        break;
                    }
                }
            }
        }
        if (validUnit) {
            // Find adjacent empty hex for summon
            const neighbors = getNeighbors(validUnit.position);
            let spawnHex = null;
            for (const hex of neighbors) {
                const tile = state.map.tiles.get(hexToKey(hex));
                if (!tile)
                    continue;
                const terrainDef = registry.getTerrain(tile.terrain);
                if (terrainDef?.passable === false)
                    continue;
                if (isHexOccupied(state, hex))
                    continue;
                spawnHex = hex;
                break;
            }
            if (spawnHex) {
                // Create summon prototype if not exists
                const prototypeId = `${factionId}_${summonConfig.chassisId}`;
                if (!state.prototypes.has(prototypeId)) {
                    const summonPrototype = {
                        id: prototypeId,
                        factionId: factionId,
                        chassisId: summonConfig.chassisId,
                        componentIds: [],
                        version: 1,
                        name: summonConfig.name,
                        derivedStats: {
                            attack: summonConfig.attack,
                            defense: summonConfig.defense,
                            hp: summonConfig.hp,
                            moves: summonConfig.moves,
                            range: 1,
                            role: 'melee',
                        },
                        tags: summonConfig.tags,
                    };
                    const prototypes = new Map(state.prototypes);
                    prototypes.set(prototypeId, summonPrototype);
                    state = { ...state, prototypes };
                }
                // Create the summon unit
                const summonUnitId = createUnitId();
                const summonUnit = {
                    id: summonUnitId,
                    factionId: factionId,
                    position: spawnHex,
                    facing: 0,
                    hp: summonConfig.hp,
                    maxHp: summonConfig.hp,
                    movesRemaining: summonConfig.moves,
                    maxMoves: summonConfig.moves,
                    attacksRemaining: 1,
                    xp: 0,
                    veteranLevel: 'green',
                    status: 'ready',
                    prototypeId: prototypeId,
                    history: [],
                    morale: 100,
                    routed: false,
                    poisoned: false,
                    enteredZoCThisActivation: false,
                    poisonStacks: 0,
                    isStealthed: false,
                    turnsSinceStealthBreak: 0,
                    learnedAbilities: [],
                };
                const units = new Map(state.units);
                units.set(summonUnitId, summonUnit);
                summonState = {
                    summoned: true,
                    turnsRemaining: summonDuration,
                    cooldownRemaining: 0,
                    unitId: summonUnitId,
                };
                const updatedFaction = {
                    ...faction,
                    unitIds: [...faction.unitIds, summonUnitId],
                    summonState,
                };
                const factions = new Map(state.factions);
                factions.set(factionId, updatedFaction);
                log(trace, `${faction.name} summoned a ${summonConfig.name} at ${JSON.stringify(spawnHex)}`);
                return { ...state, units, factions };
            }
        }
    }
    // Update faction with current summonState if changed
    if (faction.summonState !== summonState) {
        const updatedFaction = { ...faction, summonState };
        const factions = new Map(state.factions);
        factions.set(factionId, updatedFaction);
        return { ...state, factions };
    }
    return state;
}
/**
 * Warlord Command (Steppe Clan): Applies aura buff to friendly cavalry/mounted units near warlord units.
 * - Finds all living warlord units belonging to the faction
 * - For each warlord, buffs friendly cavalry/mounted units within aura radius
 * - Morale boost is capped at 100
 */
function applyWarlordAura(state, factionId, registry, trace) {
    const faction = state.factions.get(factionId);
    if (!faction)
        return state;
    const auraRadius = 3;
    const moraleBoost = 10;
    // Find all living warlord units for this faction
    const warlordUnits = [];
    for (const unitId of faction.unitIds) {
        const unit = state.units.get(unitId);
        if (!unit || unit.hp <= 0)
            continue;
        const protoTags = state.prototypes.get(unit.prototypeId)?.tags ?? [];
        if (protoTags.includes('warlord')) {
            warlordUnits.push(unit);
        }
    }
    if (warlordUnits.length === 0)
        return state;
    // Find all friendly living cavalry/mounted units and apply aura buff
    const unitsMap = new Map(state.units);
    let anyBuffed = false;
    for (const warlord of warlordUnits) {
        for (const [unitId, unit] of unitsMap) {
            // Skip dead units, non-friendly units, and the warlord itself
            if (unit.hp <= 0 || unit.factionId !== factionId)
                continue;
            const dist = hexDistance(warlord.position, unit.position);
            if (dist > auraRadius)
                continue;
            const protoTags = state.prototypes.get(unit.prototypeId)?.tags ?? [];
            if (!protoTags.includes('cavalry') && !protoTags.includes('mounted'))
                continue;
            // Apply morale boost (cap at 100)
            const newMorale = Math.min(100, unit.morale + moraleBoost);
            if (newMorale !== unit.morale) {
                unitsMap.set(unitId, { ...unit, morale: newMorale });
                anyBuffed = true;
            }
        }
    }
    if (anyBuffed) {
        log(trace, `${faction.name}'s Warlord Command aura buffed nearby cavalry/mounted units`);
    }
    return { ...state, units: unitsMap };
}
function setFactionTripleStack(state, factionId, triple) {
    const faction = state.factions.get(factionId);
    if (!faction)
        return state;
    const factions = new Map(state.factions);
    factions.set(factionId, { ...faction, activeTripleStack: triple ?? undefined });
    return { ...state, factions };
}
function applyGhostArmyMovement(state, factionId, bonusMovement) {
    const units = new Map(state.units);
    const faction = state.factions.get(factionId);
    if (!faction)
        return state;
    for (const unitId of faction.unitIds) {
        const unit = units.get(unitId);
        if (unit && unit.hp > 0) {
            units.set(unitId, {
                ...unit,
                maxMoves: unit.maxMoves + bonusMovement,
                movesRemaining: unit.movesRemaining + bonusMovement,
            });
        }
    }
    return { ...state, units };
}
function applyJuggernautBonus(state, factionId) {
    const faction = state.factions.get(factionId);
    if (!faction)
        return state;
    const factions = new Map(state.factions);
    factions.set(factionId, { ...faction, juggernautActive: true });
    return { ...state, factions };
}
export function processFactionPhases(state, factionId, registry, trace, difficulty) {
    const faction = state.factions.get(factionId);
    if (!faction || !state.map) {
        return state;
    }
    let current = state;
    current = updateFogState(current, factionId);
    const strategy = computeFactionStrategy(current, factionId, registry, difficulty);
    const factionStrategies = new Map(current.factionStrategies);
    factionStrategies.set(factionId, strategy);
    current = { ...current, factionStrategies };
    recordFactionStrategy(trace, {
        round: current.round,
        factionId,
        posture: strategy.posture,
        primaryObjective: strategy.primaryObjective,
        primaryEnemyFactionId: strategy.primaryEnemyFactionId,
        primaryCityObjectiveId: strategy.primaryCityObjectiveId,
        threatenedCityIds: strategy.threatenedCities.map((threat) => threat.cityId),
        frontAnchors: strategy.fronts.map((front) => front.anchor),
        focusTargetUnitIds: strategy.focusTargetUnitIds,
        reasons: strategy.debugReasons,
    });
    log(trace, `${faction.name} strategy: ${strategy.posture} | ${strategy.primaryObjective}`);
    // Resolve triple stack at start of faction's turn
    const engine = getSynergyEngine();
    const progression = getDomainProgression(faction, current.research.get(factionId));
    const tripleStack = engine.resolveFactionTriple(progression.pairEligibleDomains, progression.emergentEligibleDomains);
    if (tripleStack) {
        log(trace, `${faction.name} activates ${tripleStack.name} — ${tripleStack.emergentRule.name} emergent!`);
    }
    // Apply emergent effects based on triple type
    if (tripleStack) {
        const emergent = tripleStack.emergentRule.effect;
        if (emergent.type === 'mobility_unit') {
            if (emergent.bonusMovement) {
                current = applyGhostArmyMovement(current, factionId, emergent.bonusMovement);
            }
        }
        if (emergent.type === 'combat_unit') {
            if (emergent.doubleCombatBonuses) {
                current = applyJuggernautBonus(current, factionId);
            }
        }
        // Store the triple stack in state for combat system to use
        current = setFactionTripleStack(current, factionId, tripleStack);
    }
    else {
        // Clear any previously active triple stack
        current = setFactionTripleStack(current, factionId, null);
    }
    current = applyEcologyPressure(current, factionId, registry);
    current = applyForceCompositionPressure(current, factionId, registry);
    current = startOrAdvanceCodification(current, factionId, registry, trace, strategy, difficulty);
    current = unlockHybridRecipes(current, factionId, registry);
    // Advance captured city ramp timers
    current = advanceCaptureTimers(current, factionId);
    // Economy: derive resource income and advance production
    const economy = deriveResourceIncome(current, factionId, registry);
    const economyMap = new Map(current.economy);
    economyMap.set(factionId, economy);
    current = { ...current, economy: economyMap };
    // Advance production for each city
    const citiesMap = new Map(current.cities);
    const factionCityIds = getFactionCityIds(current, factionId);
    const cityCount = Math.max(1, factionCityIds.length);
    for (const cityId of factionCityIds) {
        const city = current.cities.get(cityId);
        if (!city)
            continue;
        // Each city gets its share of production income
        const cityProductionIncome = economy.productionPool / cityCount;
        // Advance production
        let updatedCity = advanceProduction(city, cityProductionIncome);
        // Check if production is complete
        if (canCompleteCurrentProduction(current, cityId, registry)) {
            current = completeProduction(current, cityId, registry);
            // Re-fetch city after state update
            updatedCity = current.cities.get(cityId) ?? updatedCity;
            // Deduct spent production from economy pool
            const spentProduction = city.currentProduction?.costType === 'villages'
                ? 0
                : city.currentProduction?.cost ?? 0;
            const currentEconomy = current.economy.get(factionId);
            if (currentEconomy) {
                const updatedEconomy = {
                    ...currentEconomy,
                    productionPool: Math.max(0, currentEconomy.productionPool - spentProduction),
                };
                const newEconomyMap = new Map(current.economy);
                newEconomyMap.set(factionId, updatedEconomy);
                current = { ...current, economy: newEconomyMap };
            }
            log(trace, `${faction.name} completed unit production at ${updatedCity.name}`);
        }
        // Auto-queue preferred unit if no production (skip if besieged).
        // Supply pressure is handled by soft penalties in aiProductionStrategy.
        if (!updatedCity.currentProduction && updatedCity.productionQueue.length === 0 && !updatedCity.besieged) {
            const choice = chooseStrategicProduction(current, factionId, strategy, registry, difficulty);
            if (choice) {
                updatedCity = queueUnit(updatedCity, choice.prototypeId, choice.chassisId, choice.cost, choice.costType);
                log(trace, `${faction.name} queued ${choice.chassisId} at ${updatedCity.name} (${choice.reason})`);
            }
        }
        citiesMap.set(cityId, updatedCity);
    }
    current = { ...current, cities: citiesMap };
    // Supply deficit: apply morale penalty and accumulate exhaustion
    log(trace, `${faction.name} supply deficit: ${getSupplyDeficit(economy)}`);
    current = applySupplyDeficitPenalties(current, factionId, registry);
    current = applyEnvironmentalDamage(current, factionId, registry, trace);
    // Summon ability: Handle summon lifecycle for any faction with summon config
    const factionAbilities = registry.getSignatureAbility(factionId);
    if (factionAbilities?.summon) {
        current = applySummonAbility(current, factionId, registry, trace);
    }
    // Warlord Command: Apply aura from warlord units to nearby cavalry/mounted units
    current = applyWarlordAura(current, factionId, registry, trace);
    // Reset attacks and moves for this faction's units, recover morale
    const unitsMap = new Map(current.units);
    const refreshedFaction = current.factions.get(factionId) ?? faction;
    for (const unitIdStr of refreshedFaction.unitIds) {
        const unit = unitsMap.get(unitIdStr);
        if (!unit || unit.hp <= 0)
            continue;
        // Calculate healing with Forest Mending bonus for Druid Circle
        const terrainId = getTerrainAt(current, unit.position);
        let healRate = getHealRate(unit, current, factionId);
        // Nature's Blessing + Synergy Healing
        const healPrototype = current.prototypes.get(unit.prototypeId);
        const healTags = healPrototype?.tags ?? [];
        const healEngine = getSynergyEngine();
        const unitSynergies = healEngine.resolveUnitPairs(healTags);
        // Create healing context
        const healingContext = {
            unitId: unitIdStr,
            unitTags: healTags,
            baseHeal: healRate,
            position: unit.position,
            adjacentAllies: [],
            isStealthed: unit.isStealthed,
        };
        // Apply synergy healing effects
        const synergyHealRate = applyHealingSynergies(healingContext, unitSynergies);
        if (healTags.includes('druid') || healTags.includes('healing')) {
            const aura = getNatureHealingAura();
            // Use the synergy-enhanced heal rate which accounts for extended_healing, frost_regen, oasis
            healRate = Math.max(healRate, synergyHealRate);
        }
        else {
            // Non-healing units benefit from adjacent healing-tagged allies
            const neighbors = getNeighbors(unit.position);
            for (const hex of neighbors) {
                const neighborUnitId = getUnitAtHex(current, hex);
                if (neighborUnitId) {
                    const neighborUnit = current.units.get(neighborUnitId);
                    if (neighborUnit && neighborUnit.factionId === factionId && neighborUnit.hp > 0) {
                        const neighborProto = current.prototypes.get(neighborUnit.prototypeId);
                        const neighborTags = neighborProto?.tags ?? [];
                        if (neighborTags.includes('druid') || neighborTags.includes('healing')) {
                            const aura = getNatureHealingAura();
                            healRate += aura.allyHeal;
                            // Check for extended healing synergy
                            const neighborSynergies = healEngine.resolveUnitPairs(neighborTags);
                            const neighborHealContext = {
                                unitId: neighborUnitId,
                                unitTags: neighborTags,
                                baseHeal: aura.allyHeal,
                                position: neighborUnit.position,
                                adjacentAllies: [],
                                isStealthed: neighborUnit.isStealthed,
                            };
                            const extendedHeal = applyHealingSynergies(neighborHealContext, neighborSynergies);
                            healRate = Math.max(healRate, extendedHeal);
                            break; // Only one healing aura applies
                        }
                    }
                }
            }
        }
        // Withering: nearby enemies with withering synergy reduce healing
        const healNeighbors = getNeighbors(unit.position);
        for (const hex of healNeighbors) {
            const neighborUnitId = getUnitAtHex(current, hex);
            if (neighborUnitId) {
                const neighborUnit = current.units.get(neighborUnitId);
                if (neighborUnit && neighborUnit.factionId !== factionId && neighborUnit.hp > 0) {
                    const neighborProto = current.prototypes.get(neighborUnit.prototypeId);
                    const neighborTags = neighborProto?.tags ?? [];
                    const neighborSynergies = healEngine.resolveUnitPairs(neighborTags);
                    for (const syn of neighborSynergies) {
                        if (syn.effect.type === 'withering') {
                            const reduction = syn.effect.healingReduction;
                            healRate = Math.floor(healRate * (1 - reduction));
                            break;
                        }
                    }
                }
            }
        }
        const safeInSettlement = occupiesFriendlySettlement(current, unit);
        const research = current.research.get(factionId);
        const doctrine = resolveResearchDoctrine(research, faction);
        const prototype = current.prototypes.get(unit.prototypeId);
        const currentTerrainId = getTerrainAt(current, unit.position);
        // Cold provisions movement bonus - component-based, not research-based
        const coldProvisionMoveBonus = prototype &&
            prototypeHasComponent(prototype, 'cold_provisions') &&
            (currentTerrainId === 'tundra' || currentTerrainId === 'hill')
            ? 1 // Flat +1 move bonus in cold terrain with cold provisions
            : 0;
        const poisonMovePenalty = unit.poisoned ? doctrine.poisonMovePenalty : 0;
        const refreshedMoves = Math.max(0, unit.maxMoves + coldProvisionMoveBonus - poisonMovePenalty);
        const refreshedUnit = {
            ...unit,
            movesRemaining: refreshedMoves,
            attacksRemaining: 1,
            morale: recoverMorale(unit),
            hp: Math.min(unit.maxHp, unit.hp + healRate),
            poisoned: safeInSettlement ? false : unit.poisoned,
            poisonStacks: safeInSettlement ? 0 : unit.poisonStacks,
            enteredZoCThisActivation: false,
        };
        // Stealth: tick cooldown and attempt re-entry for stealth-tagged units
        let stealthUpdatedUnit = tickStealthCooldown(refreshedUnit);
        if (!stealthUpdatedUnit.isStealthed) {
            const protoTags = current.prototypes.get(unit.prototypeId)?.tags ?? [];
            stealthUpdatedUnit = enterStealth(stealthUpdatedUnit, protoTags);
        }
        const updatedUnit = maybeExpirePreparedAbility(stealthUpdatedUnit, current.round, current);
        // Check if routed unit can rally
        checkRally(updatedUnit);
        unitsMap.set(unitIdStr, updatedUnit);
    }
    current = { ...current, units: unitsMap };
    // Sacrifice check: check for units with learned abilities at the home city
    // This happens after unit refresh so units can heal at home city before sacrificing
    const refreshedFactionForSacrifice = current.factions.get(factionId);
    if (refreshedFactionForSacrifice) {
        for (const unitIdStr of refreshedFactionForSacrifice.unitIds) {
            const unit = current.units.get(unitIdStr);
            if (!unit || unit.hp <= 0)
                continue;
            // Check if unit can be sacrificed
            if (canSacrifice(unit, refreshedFactionForSacrifice, current)) {
                // Check if AI has assigned return_to_sacrifice intent or if it's player turn
                // For now, we auto-sacrifice AI units with return_to_sacrifice intent
                const unitIntent = strategy?.unitIntents[unitIdStr];
                const hasReturnIntent = unitIntent?.assignment === 'return_to_sacrifice';
                // For AI factions, only sacrifice if they have the return_to_sacrifice intent
                // For player factions (or if no strategy), we could prompt - for now auto-sacrifice
                if (hasReturnIntent || !strategy) {
                    current = performSacrifice(unitIdStr, factionId, current, registry, trace);
                    current = unlockHybridRecipes(current, factionId, registry);
                    log(trace, `${refreshedFactionForSacrifice.name} sacrificed unit at home city`);
                }
            }
        }
    }
    // Village expansion: spawn villages when militarily stable (after combat)
    current = evaluateAndSpawnVillage(current, factionId, registry);
    // Siege check: evaluate encirclement for all cities
    let siegeCities = new Map(current.cities);
    for (const [cityId, city] of siegeCities) {
        if (city.factionId !== factionId)
            continue;
        if (city.besieged) {
            // Check if encirclement is broken
            if (isEncirclementBroken(city, current)) {
                const brokenCity = { ...city, besieged: false, turnsUnderSiege: 0 };
                siegeCities.set(cityId, brokenCity);
                recordSiegeEvent(trace, {
                    round: current.round,
                    cityId,
                    cityName: city.name,
                    factionId: city.factionId,
                    eventType: 'siege_broken',
                    wallHP: brokenCity.wallHP,
                    maxWallHP: brokenCity.maxWallHP,
                    turnsUnderSiege: brokenCity.turnsUnderSiege,
                });
                log(trace, `${city.name} siege broken`);
            }
            else {
                // Degrade walls (Pirate Lords have Coastal Walls: half damage)
                const isCoastalWalls = city.factionId === 'coral_people';
                const degradedCity = degradeWalls(city, isCoastalWalls);
                const updatedSiegeCity = {
                    ...degradedCity,
                    turnsUnderSiege: city.turnsUnderSiege + 1,
                };
                siegeCities.set(cityId, updatedSiegeCity);
                if (updatedSiegeCity.wallHP !== city.wallHP) {
                    recordSiegeEvent(trace, {
                        round: current.round,
                        cityId,
                        cityName: city.name,
                        factionId: city.factionId,
                        eventType: 'wall_damaged',
                        wallHP: updatedSiegeCity.wallHP,
                        maxWallHP: updatedSiegeCity.maxWallHP,
                        turnsUnderSiege: updatedSiegeCity.turnsUnderSiege,
                    });
                }
                log(trace, `${city.name} walls at ${degradedCity.wallHP}/${degradedCity.maxWallHP}`);
                // Check for capture: walls breached + still encircled
                if (isCityVulnerable(degradedCity, current)) {
                    const capturingFaction = getCapturingFaction(degradedCity, current);
                    if (capturingFaction) {
                        current = captureCity(degradedCity, capturingFaction, current);
                        const capturedCity = current.cities.get(cityId);
                        if (capturedCity) {
                            recordSiegeEvent(trace, {
                                round: current.round,
                                cityId,
                                cityName: city.name,
                                factionId: capturedCity.factionId,
                                eventType: 'city_captured',
                                wallHP: capturedCity.wallHP,
                                maxWallHP: capturedCity.maxWallHP,
                                turnsUnderSiege: capturedCity.turnsUnderSiege,
                                attackerFactionId: capturingFaction,
                            });
                        }
                        log(trace, `${city.name} captured by ${capturingFaction}!`);
                        siegeCities = new Map(current.cities);
                        continue;
                    }
                }
                // Besieged cities add war exhaustion
                const we = current.warExhaustion.get(factionId);
                if (we) {
                    const newWE = addExhaustion(we, EXHAUSTION_CONFIG.BESIEGED_CITY_PER_TURN);
                    const weMap = new Map(current.warExhaustion);
                    weMap.set(factionId, newWE);
                    current = { ...current, warExhaustion: weMap };
                }
            }
        }
        else {
            // Repair walls when not besieged
            const repairedCity = repairWalls(city);
            if (repairedCity.wallHP !== city.wallHP) {
                siegeCities.set(cityId, repairedCity);
                recordSiegeEvent(trace, {
                    round: current.round,
                    cityId,
                    cityName: city.name,
                    factionId: city.factionId,
                    eventType: 'wall_repaired',
                    wallHP: repairedCity.wallHP,
                    maxWallHP: repairedCity.maxWallHP,
                    turnsUnderSiege: repairedCity.turnsUnderSiege,
                });
            }
            // Check if city just became encircled
            if (isCityEncircled(city, current)) {
                const besiegedCity = { ...(siegeCities.get(cityId) ?? city), besieged: true, turnsUnderSiege: 1 };
                siegeCities.set(cityId, besiegedCity);
                recordSiegeEvent(trace, {
                    round: current.round,
                    cityId,
                    cityName: city.name,
                    factionId: city.factionId,
                    eventType: 'siege_started',
                    wallHP: besiegedCity.wallHP,
                    maxWallHP: besiegedCity.maxWallHP,
                    turnsUnderSiege: besiegedCity.turnsUnderSiege,
                });
                log(trace, `${city.name} is now besieged!`);
            }
        }
    }
    current = { ...current, cities: siegeCities };
    // War exhaustion: tick turn counters and apply morale penalty
    const weState = current.warExhaustion.get(factionId);
    if (weState) {
        const hadLoss = faction.combatRecord.lastLossRound === current.round;
        const tickedWE = tickWarExhaustion(weState, hadLoss);
        const weMap = new Map(current.warExhaustion);
        weMap.set(factionId, tickedWE);
        current = { ...current, warExhaustion: weMap };
        // Apply WE morale penalty to all living units
        // Marching stamina: ignore the first exhaustion point for morale calculation
        const weResearch = current.research.get(factionId);
        const weDoctrine = resolveResearchDoctrine(weResearch, faction);
        const effectiveExhaustionPoints = weDoctrine.marchingStaminaEnabled
            ? Math.max(0, tickedWE.exhaustionPoints - 1)
            : tickedWE.exhaustionPoints;
        const moralePenalty = calculateMoralePenalty(effectiveExhaustionPoints);
        if (moralePenalty > 0) {
            const unitsWithWE = new Map(current.units);
            for (const unitIdStr of faction.unitIds) {
                const unit = unitsWithWE.get(unitIdStr);
                if (!unit || unit.hp <= 0)
                    continue;
                unitsWithWE.set(unitIdStr, {
                    ...unit,
                    morale: Math.max(0, unit.morale - moralePenalty),
                });
            }
            current = { ...current, units: unitsWithWE };
        }
    }
    // PROXIMITY EXPOSURE: For each enemy faction within 3 hexes of our units,
    // gain exposure to their native domain (3 per turn)
    const currentFaction = current.factions.get(factionId);
    if (currentFaction) {
        for (const [otherFactionId, otherFaction] of current.factions) {
            if (otherFactionId === factionId)
                continue;
            if (otherFaction.unitIds.length === 0)
                continue;
            // Passive proximity no longer unlocks foreign domains.
        }
    }
    return current;
}
export function runWarEcologySimulation(initialState, registry, maxTurns, trace, difficulty) {
    let current = { ...initialState };
    let roundsCompleted = 0;
    while (roundsCompleted < maxTurns && getAliveFactions(current).size > 1) {
        const roundStartVictory = getVictoryStatus(current);
        if (roundStartVictory.victoryType !== 'unresolved') {
            return current;
        }
        if (trace) {
            trace.currentRound = current.round;
        }
        current = resetAllUnitsForRound(current);
        recordSnapshot(current, trace, 'start');
        for (const factionId of current.factions.keys()) {
            if (!getAliveFactions(current).has(factionId)) {
                continue;
            }
            current = processFactionPhases(current, factionId, registry, trace, difficulty);
            const phaseVictory = getVictoryStatus(current);
            if (phaseVictory.victoryType !== 'unresolved') {
                maybeRecordEndSnapshot(current, trace);
                return current;
            }
        }
        if (getVictoryStatus(current).victoryType !== 'unresolved') {
            maybeRecordEndSnapshot(current, trace);
            break;
        }
        const activation = buildActivationQueue(current);
        const fortsBuiltThisRound = new Set();
        while (true) {
            const nextActivation = nextUnitActivation(current, activation);
            if (!nextActivation) {
                break;
            }
            current = activateUnit(current, nextActivation.unitId, registry, {
                trace,
                fortsBuiltThisRound,
                combatMode: 'apply',
            }).state;
            if (getVictoryStatus(current).victoryType !== 'unresolved') {
                maybeRecordEndSnapshot(current, trace);
                return current;
            }
        }
        for (const factionId of current.factions.keys()) {
            current = resetCombatRecordStreaks(current, factionId);
            const we = current.warExhaustion.get(factionId);
            if (!we) {
                continue;
            }
            const decayedWE = applyDecay(we, {
                noLossTurns: we.turnsWithoutLoss,
                territoryClear: false,
            });
            const weMap = new Map(current.warExhaustion);
            weMap.set(factionId, decayedWE);
            current = { ...current, warExhaustion: weMap };
        }
        // Clear poison at friendly settlements (also reset poison stacks)
        for (const [, unit] of current.units) {
            if (unit.poisoned && occupiesFriendlySettlement(current, unit)) {
                const unitsMap = new Map(current.units);
                unitsMap.set(unit.id, { ...unit, poisoned: false, poisonStacks: 0 });
                current = { ...current, units: unitsMap };
            }
        }
        maybeRecordEndSnapshot(current, trace);
        current = {
            ...current,
            round: current.round + 1,
        };
        if (trace) {
            trace.currentRound = current.round;
        }
        roundsCompleted += 1;
    }
    return current;
}
export function summarizeFaction(state, factionId) {
    const faction = state.factions.get(factionId);
    if (!faction)
        return '';
    const livingUnits = faction.unitIds.filter((id) => state.units.has(id));
    const prototypeNames = faction.prototypeIds
        .map((id) => state.prototypes.get(id)?.name)
        .filter((name) => Boolean(name));
    const economy = state.economy.get(factionId);
    const economyInfo = economy
        ? `prod=${economy.productionPool.toFixed(1)} supply=${economy.supplyIncome.toFixed(1)}/${economy.supplyDemand}`
        : '';
    const we = state.warExhaustion.get(factionId);
    const weInfo = we && we.exhaustionPoints > 0 ? `WE=${we.exhaustionPoints}` : '';
    const besiegedCities = getFactionCityIds(state, factionId).filter((id) => state.cities.get(id)?.besieged);
    const siegeInfo = besiegedCities.length > 0 ? `besieged=${besiegedCities.length}` : '';
    return [
        `${faction.name}`,
        `units=${livingUnits.length}`,
        `villages=${getVillageCount(state, factionId)}`,
        economyInfo,
        weInfo,
        siegeInfo,
        `battles=${livingUnits.reduce((sum, id) => sum + getBattleCount(state.units.get(id)), 0)}`,
        `kills=${livingUnits.reduce((sum, id) => sum + getKillCount(state.units.get(id)), 0)}`,
        `capabilities=${describeCapabilityLevels(faction)}`,
        `prototypes=${prototypeNames.join(', ')}`,
    ].filter(Boolean).join(' | ');
}
