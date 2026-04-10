import civilizationsData from '../../../../src/content/base/civilizations.json' with { type: 'json' };
import { hexDistance, hexToKey } from '../../../../src/core/grid.js';
import { evaluateCitySiteBonuses, formatSettlementOccupancyBlocker, getCitySiteBonuses, getSettlementOccupancyBlocker, } from '../../../../src/systems/citySiteSystem.js';
import { canUseAmbush, canUseBrace, getTerrainAt, hasAdjacentEnemy } from '../../../../src/systems/abilitySystem.js';
import { resolveCapabilityDoctrine } from '../../../../src/systems/capabilityDoctrine.js';
import { deriveResourceIncome, getCaptureRampMultiplier, getSupplyDeficit } from '../../../../src/systems/economySystem.js';
import { getValidMoves } from '../../../../src/systems/movementSystem.js';
import { getDomainTier, } from '../../../../src/systems/researchSystem.js';
import { getDomainProgression } from '../../../../src/systems/domainProgression.js';
import { getHexOwner } from '../../../../src/systems/territorySystem.js';
import { canBoardTransport, getUnitTransport, getValidDisembarkHexes } from '../../../../src/systems/transportSystem.js';
import { calculateProductionPenalty, calculateMoralePenalty } from '../../../../src/systems/warExhaustionSystem.js';
import { getVillageSpawnReadinessWithRegistry } from '../../../../src/systems/villageSystem.js';
import { getFactionCityIds } from '../../../../src/systems/factionOwnershipSystem.js';
import { canPaySettlerVillageCost, getAvailableProductionPrototypes, getPrototypeCostType, getPrototypeQueueCost, SETTLER_VILLAGE_COST, } from '../../../../src/systems/productionSystem.js';
const CIVILIZATIONS = civilizationsData;
const BORDER_DIRECTIONS = [
    { side: 'north', dq: 0, dr: -1 },
    { side: 'east', dq: 1, dr: 0 },
    { side: 'south', dq: 0, dr: 1 },
    { side: 'west', dq: -1, dr: 0 },
];
// Derive CAPTURE_RAMP_TURNS from getCaptureRampMultiplier behavior
// The function returns 0 during the ramp period, then positive values after
function deriveCaptureRampTurns() {
    for (let turns = 0; turns < 50; turns++) {
        if (getCaptureRampMultiplier(turns) > 0) {
            return turns; // This equals CAPTURE_RAMP_TURNS + 1
        }
    }
    return 6; // fallback: CAPTURE_RAMP_TURNS + 1
}
const CAPTURE_RAMP_TURNS = deriveCaptureRampTurns() - 1;
export function buildWorldViewModel(source) {
    return source.kind === 'replay'
        ? buildReplayWorldViewModel(source)
        : buildPlayWorldViewModel(source);
}
export function buildHudViewModel(source, turnIndex, mode, selected, hoveredKey, world, registry, liveCombatEvents) {
    return mode === 'replay'
        ? buildReplayHudViewModel(source, turnIndex, selected, hoveredKey, world)
        : buildPlayHudViewModel(source, selected, hoveredKey, world, registry, liveCombatEvents);
}
export function buildDebugViewModel(turn, events = []) {
    return {
        turnEvents: turn ? turn.events.slice(0, 10) : events.slice(0, 10),
    };
}
export function getCombatSummary(event) {
    const effects = event.breakdown.triggeredEffects.map((effect) => effect.label).join(', ');
    return `${event.attackerPrototypeName} vs ${event.defenderPrototypeName} · ${effects || 'no triggers'}`;
}
export function getIntentSummary(intent, factions) {
    const faction = factions.find((entry) => entry.id === intent.factionId);
    return `${faction?.name ?? intent.factionId}: ${intent.intent} · ${intent.reason}`;
}
function buildReplayWorldViewModel(source) {
    const turn = source.replay.turns[source.turnIndex] ?? source.replay.turns[0];
    const board = turn.snapshotEnd;
    const factions = buildReplayFactions(source.replay);
    const ownership = new Map();
    for (const city of board.cities) {
        ownership.set(`${city.q},${city.r}`, city.factionId);
    }
    for (const village of board.villages) {
        ownership.set(`${village.q},${village.r}`, village.factionId);
    }
    const hexes = source.replay.map.hexes.map((hex) => ({
        key: hex.key,
        q: hex.q,
        r: hex.r,
        terrain: hex.terrain,
        visibility: 'visible',
        ownerFactionId: ownership.get(hex.key) ?? null,
    }));
    return {
        activeFactionId: board.factions[0]?.id ?? null,
        map: {
            width: source.replay.map.width,
            height: source.replay.map.height,
            hexes,
        },
        factions,
        units: board.units.map((unit) => {
            const chassisId = inferChassisId(unit.prototypeName);
            return {
                id: unit.id,
                factionId: unit.factionId,
                q: unit.q,
                r: unit.r,
                hp: unit.hp,
                maxHp: unit.maxHp,
                attack: unit.attack ?? 0,
                defense: unit.defense ?? 0,
                effectiveDefense: unit.defense ?? 0,
                range: unit.range ?? 1,
                movesRemaining: 0,
                movesMax: 0,
                acted: false,
                canAct: unit.id === source.selectedUnitId && source.reachableHexes.length > 0,
                isActiveFaction: unit.factionId === (board.factions[0]?.id ?? null),
                status: 'inactive',
                prototypeId: unit.prototypeId,
                prototypeName: unit.prototypeName,
                chassisId,
                role: chassisId,
                spriteKey: getSpriteKeyForUnit(unit.factionId, unit.prototypeName, chassisId, undefined),
                facing: unit.facing ?? 0,
                visible: true,
            };
        }),
        cities: board.cities.map((city) => ({
            id: city.id,
            name: city.name,
            factionId: city.factionId,
            q: city.q,
            r: city.r,
            visible: true,
            remembered: true,
            besieged: city.besieged,
            wallHp: city.wallHp,
            maxWallHp: city.maxWallHp,
            turnsSinceCapture: city.turnsSinceCapture,
        })),
        villages: board.villages.map((village) => ({
            id: village.id,
            name: village.name,
            factionId: village.factionId,
            q: village.q,
            r: village.r,
            visible: true,
            remembered: true,
        })),
        improvements: [],
        overlays: {
            borders: buildBorderEdges(hexes, factions),
            reachableHexes: source.reachableHexes,
            attackHexes: source.attackHexes,
            pathPreview: source.pathPreview,
            lastMove: null,
        },
        visibility: {
            mode: 'full',
            activeFactionId: board.factions[0]?.id ?? null,
        },
    };
}
function buildPlayWorldViewModel(source) {
    const { state } = source;
    if (!state.map) {
        throw new Error('Cannot build play-mode world view without a map.');
    }
    const factions = buildPlayFactions(state);
    const hexVisibility = buildHexVisibilityMap(state);
    const hexes = Array.from(state.map.tiles.values()).map((tile) => {
        const key = hexToKey(tile.position);
        return {
            key,
            q: tile.position.q,
            r: tile.position.r,
            terrain: tile.terrain,
            visibility: hexVisibility.get(key) ?? 'hidden',
            ownerFactionId: getHexOwner(tile.position, state) ?? null,
        };
    });
    const moveCounts = new Map();
    const attackCounts = new Map();
    for (const unit of state.units.values()) {
        moveCounts.set(unit.id, unit.factionId === state.activeFactionId && unit.status === 'ready'
            ? getPlayableMoves(state, unit, source.registry).length
            : 0);
        attackCounts.set(unit.id, unit.factionId === state.activeFactionId && unit.status === 'ready'
            ? getAttackableEnemies(state, unit).length
            : 0);
    }
    return {
        activeFactionId: state.activeFactionId,
        map: {
            width: state.map.width,
            height: state.map.height,
            hexes,
        },
        factions,
        units: Array.from(state.units.values()).map((unit) => {
            const prototype = state.prototypes.get(unit.prototypeId);
            const chassisId = prototype?.chassisId ?? inferChassisId(prototype?.name ?? unit.prototypeId);
            const canAct = unit.factionId === state.activeFactionId
                && unit.status === 'ready'
                && unit.hp > 0
                && ((moveCounts.get(unit.id) ?? 0) > 0 || (attackCounts.get(unit.id) ?? 0) > 0);
            const faction = state.factions.get(unit.factionId);
            const factionDoctrine = faction
                ? resolveCapabilityDoctrine(state.research.get(unit.factionId), faction)
                : undefined;
            const unitTransport = getUnitTransport(unit.id, state.transportMap);
            const boardableTransportIds = unit.factionId === state.activeFactionId && unit.hp > 0
                ? Array.from(state.units.values())
                    .filter((candidate) => candidate.factionId === unit.factionId && candidate.id !== unit.id)
                    .filter((candidate) => canBoardTransport(state, unit.id, candidate.id, source.registry, state.transportMap))
                    .map((candidate) => candidate.id)
                : [];
            const validDisembarkHexes = unitTransport
                ? getValidDisembarkHexes(state, unitTransport.transportId, source.registry, state.transportMap)
                : [];
            const canBrace = !!prototype
                && canAct
                && (canUseBrace(prototype) || factionDoctrine?.fortressTranscendenceEnabled === true)
                && hasAdjacentEnemy(state, unit);
            const canAmbush = !!prototype
                && canAct
                && canUseAmbush(prototype, getTerrainAt(state, unit.position))
                && !hasAdjacentEnemy(state, unit);
            const baseDefense = prototype?.derivedStats.defense ?? 0;
            // Compute effective defense including terrain, improvements, cities, villages
            const tile = state.map?.tiles.get(`${unit.position.q},${unit.position.r}`);
            const terrainDef = tile ? source.registry.getTerrain(tile.terrain) : undefined;
            const terrainMod = terrainDef?.defenseModifier ?? 0;
            let improvementBonus = 0;
            for (const [, improvement] of state.improvements) {
                if (improvement.position.q === unit.position.q && improvement.position.r === unit.position.r) {
                    improvementBonus = improvement.defenseBonus ?? 0;
                    break;
                }
            }
            if (improvementBonus === 0) {
                for (const [, city] of state.cities) {
                    if (city.position.q === unit.position.q && city.position.r === unit.position.r) {
                        improvementBonus = 1; // +100% in cities
                        break;
                    }
                }
            }
            if (improvementBonus === 0) {
                for (const [, village] of state.villages) {
                    if (village.position.q === unit.position.q && village.position.r === unit.position.r) {
                        improvementBonus = 0.5; // +50% in villages
                        break;
                    }
                }
            }
            const effectiveDefense = Math.max(1, Math.round(baseDefense * (1 + terrainMod + improvementBonus)));
            return {
                id: unit.id,
                factionId: unit.factionId,
                q: unit.position.q,
                r: unit.position.r,
                hp: unit.hp,
                maxHp: unit.maxHp,
                attack: prototype?.derivedStats.attack ?? 0,
                defense: baseDefense,
                effectiveDefense,
                range: prototype?.derivedStats.range ?? 1,
                movesRemaining: unit.movesRemaining,
                movesMax: unit.maxMoves,
                acted: unit.factionId === state.activeFactionId ? !canAct : false,
                canAct,
                isActiveFaction: unit.factionId === state.activeFactionId,
                status: unit.factionId === state.activeFactionId
                    ? (unit.status === 'fortified' ? 'fortified' : canAct ? 'ready' : 'spent')
                    : 'inactive',
                prototypeId: unit.prototypeId,
                prototypeName: prototype?.name ?? unit.prototypeId,
                chassisId,
                movementClass: thisChassisMovementClass(prototype?.chassisId, source.registry),
                role: prototype?.derivedStats.role,
                spriteKey: getSpriteKeyForUnit(unit.factionId, prototype?.name ?? unit.prototypeId, chassisId, prototype?.sourceRecipeId),
                facing: unit.facing ?? 0,
                visible: (hexVisibility.get(hexToKey(unit.position)) ?? 'hidden') !== 'hidden',
                veteranLevel: unit.veteranLevel,
                xp: unit.xp,
                nativeDomain: faction?.nativeDomain,
                learnedAbilities: unit.learnedAbilities?.map((a) => a.domainId),
                isStealthed: unit.isStealthed,
                poisoned: (unit.poisoned || (unit.poisonStacks ?? 0) > 0) || undefined,
                routed: unit.routed || undefined,
                preparedAbility: unit.preparedAbility,
                isSettler: prototype?.tags?.includes('settler') || undefined,
                canBrace: canBrace || undefined,
                canAmbush: canAmbush || undefined,
                isEmbarked: unitTransport !== undefined || undefined,
                transportId: unitTransport?.transportId ?? null,
                boardableTransportIds: boardableTransportIds.length > 0 ? boardableTransportIds : undefined,
                validDisembarkHexes: validDisembarkHexes.length > 0 ? validDisembarkHexes : undefined,
            };
        }),
        cities: Array.from(state.cities.values()).map((city) => ({
            id: city.id,
            name: city.name,
            factionId: city.factionId,
            q: city.position.q,
            r: city.position.r,
            visible: (hexVisibility.get(hexToKey(city.position)) ?? 'hidden') !== 'hidden',
            remembered: true,
            besieged: city.besieged,
            wallHp: city.wallHP,
            maxWallHp: city.maxWallHP,
            turnsSinceCapture: city.turnsSinceCapture,
        })),
        villages: Array.from(state.villages.values()).map((village) => ({
            id: village.id,
            name: village.name,
            factionId: village.factionId,
            q: village.position.q,
            r: village.position.r,
            visible: (hexVisibility.get(hexToKey(village.position)) ?? 'hidden') !== 'hidden',
            remembered: true,
        })),
        improvements: Array.from(state.improvements.values()).map((improvement) => ({
            id: improvement.id,
            type: improvement.type,
            q: improvement.position.q,
            r: improvement.position.r,
            ownerFactionId: improvement.ownerFactionId,
        })),
        overlays: {
            borders: buildBorderEdges(hexes, factions),
            reachableHexes: source.reachableHexes,
            attackHexes: source.attackHexes,
            pathPreview: source.pathPreview,
            lastMove: source.lastMove,
        },
        visibility: {
            mode: 'fogged',
            activeFactionId: state.activeFactionId,
        },
    };
}
function thisChassisMovementClass(chassisId, registry) {
    return chassisId ? registry.getChassis(chassisId)?.movementClass : undefined;
}
function buildReplayHudViewModel(replay, turnIndex, selected, hoveredKey, world) {
    const turn = replay.turns[turnIndex] ?? replay.turns[0];
    const board = turn.snapshotEnd;
    const selectionInfo = describeReplaySelection(replay, turnIndex, selected, world);
    const hoverTerrain = hoveredKey
        ? replay.map.hexes.find((hex) => hex.key === hoveredKey)?.terrain ?? 'map'
        : 'map';
    return {
        title: 'Replay Renderer',
        subtitle: `Seed ${replay.seed} · round ${turn.round} of ${replay.maxTurns} · hover ${hoverTerrain}`,
        victoryLabel: describeVictory(replay),
        activeFactionName: world.factions.find((faction) => faction.id === world.activeFactionId)?.name ?? 'All factions',
        phaseLabel: 'Replay',
        selectedTitle: selectionInfo.title,
        selectedDescription: selectionInfo.description,
        selectedMeta: selectionInfo.meta,
        selectedCity: null,
        factionSummaries: board.factions.map((factionState) => {
            const faction = replay.factions.find((entry) => entry.id === factionState.id);
            return {
                id: factionState.id,
                name: faction?.name ?? factionState.id,
                color: faction?.color ?? '#c8b68e',
                livingUnits: factionState.livingUnits,
                cities: factionState.cities,
                villages: factionState.villages,
                signatureUnit: faction?.signatureUnit ?? 'Unknown signature',
            };
        }),
        recentCombat: turn.combatEvents.slice(0, 4),
        recentSieges: turn.siegeEvents.slice(0, 4),
        recentIntents: turn.aiIntentEvents.slice(0, 6),
        researchChip: null,
        settlementPreview: null,
        supply: null,
        exhaustion: null,
    };
}
function buildPlayHudViewModel(state, selected, hoveredKey, world, registry, liveCombatEvents) {
    const activeFaction = state.activeFactionId ? state.factions.get(state.activeFactionId) : null;
    const selectionInfo = describePlaySelection(state, selected, hoveredKey, world, registry);
    return {
        title: 'Live Session',
        subtitle: `Seed ${state.seed} · round ${state.round} · turn ${state.turnNumber}`,
        victoryLabel: 'In progress',
        activeFactionName: activeFaction?.name ?? 'No active faction',
        phaseLabel: 'Command',
        selectedTitle: selectionInfo.title,
        selectedDescription: selectionInfo.description,
        selectedMeta: selectionInfo.meta,
        selectedCity: selectionInfo.city,
        factionSummaries: Array.from(state.factions.values()).map((faction) => ({
            id: faction.id,
            name: faction.name,
            color: CIVILIZATIONS[faction.id]?.color ?? '#c8b68e',
            livingUnits: Array.from(state.units.values()).filter((unit) => unit.factionId === faction.id && unit.hp > 0).length,
            cities: Array.from(state.cities.values()).filter((city) => city.factionId === faction.id).length,
            villages: Array.from(state.villages.values()).filter((village) => village.factionId === faction.id).length,
            signatureUnit: faction.identityProfile.signatureUnit,
        })),
        recentCombat: (liveCombatEvents ?? []).filter((e) => e.attackerFactionId === state.activeFactionId || e.defenderFactionId === state.activeFactionId),
        recentSieges: [],
        recentIntents: [],
        researchChip: registry
            ? buildResearchChip(state, registry)
            : null,
        settlementPreview: buildSettlementPreview(state, selected, hoveredKey, world),
        supply: registry && state.activeFactionId
            ? (() => {
                const economy = deriveResourceIncome(state, state.activeFactionId, registry);
                return {
                    income: economy.supplyIncome,
                    used: economy.supplyDemand,
                    deficit: getSupplyDeficit(economy),
                };
            })()
            : null,
        exhaustion: state.activeFactionId
            ? (() => {
                const ex = state.warExhaustion.get(state.activeFactionId);
                return ex
                    ? {
                        points: ex.exhaustionPoints,
                        productionPenalty: calculateProductionPenalty(ex.exhaustionPoints),
                        moralePenalty: calculateMoralePenalty(ex.exhaustionPoints),
                    }
                    : { points: 0, productionPenalty: 0, moralePenalty: 0 };
            })()
            : null,
    };
}
function buildResearchChip(state, registry) {
    const factionId = state.activeFactionId;
    if (!factionId)
        return null;
    const research = state.research.get(factionId);
    const faction = state.factions.get(factionId);
    if (!research || !faction)
        return null;
    // Find the active node across all domains
    let activeNodeName = null;
    let activeNodeCost = 0;
    const activeProgress = research.activeNodeId
        ? (research.progressByNodeId[research.activeNodeId] ?? 0)
        : null;
    if (research.activeNodeId) {
        const domainId = research.activeNodeId.split('_t')[0];
        const domain = registry.getResearchDomain(domainId);
        if (domain) {
            activeNodeName = domain.nodes[research.activeNodeId]?.name ?? research.activeNodeId;
            activeNodeCost = domain.nodes[research.activeNodeId]?.xpCost ?? 0;
        }
    }
    return {
        activeNodeName,
        progress: activeProgress !== null && activeNodeCost > 0 ? activeProgress / activeNodeCost : null,
        totalCompleted: research.completedNodes.length,
    };
}
function buildSettlementPreview(state, selected, hoveredKey, world) {
    if (!state.map || selected?.type !== 'unit') {
        return null;
    }
    const unit = state.units.get(selected.unitId);
    const prototype = unit ? state.prototypes.get(unit.prototypeId) : null;
    if (!unit || !prototype?.tags?.includes('settler')) {
        return null;
    }
    const currentKey = hexToKey(unit.position);
    const reachableKeys = new Set(world.overlays.reachableHexes.map((entry) => entry.key));
    const previewKey = hoveredKey && (hoveredKey === currentKey || reachableKeys.has(hoveredKey))
        ? hoveredKey
        : currentKey;
    const previewTile = state.map.tiles.get(previewKey);
    if (!previewTile) {
        return null;
    }
    const position = { q: previewTile.position.q, r: previewTile.position.r };
    const bonuses = evaluateCitySiteBonuses(state.map, position, 2);
    const requiresMove = previewKey !== currentKey;
    const blocker = getSettlementOccupancyBlocker(state, position);
    const unitCanFoundNow = unit.factionId === state.activeFactionId
        && unit.status === 'ready'
        && unit.movesRemaining === unit.maxMoves;
    const canFoundNow = !requiresMove && unitCanFoundNow && !blocker;
    let blockedReason;
    if (requiresMove) {
        blockedReason = 'Move the settler here to found a city.';
    }
    else if (blocker) {
        blockedReason = formatSettlementOccupancyBlocker(blocker);
    }
    else if (unit.factionId !== state.activeFactionId) {
        blockedReason = 'Only the active faction can found a city.';
    }
    else if (unit.status !== 'ready' || unit.movesRemaining !== unit.maxMoves) {
        blockedReason = 'Settlers need full moves to found a city.';
    }
    return {
        q: position.q,
        r: position.r,
        terrain: previewTile.terrain,
        canFoundNow,
        requiresMove,
        blockedReason,
        ...buildSettlementBonusSummary(bonuses),
    };
}
function buildSettlementBonusSummary(bonuses) {
    return {
        productionBonus: bonuses.productionBonus,
        supplyBonus: bonuses.supplyBonus,
        villageCooldownReduction: bonuses.villageCooldownReduction,
        traits: bonuses.traits.map((trait) => ({ ...trait })),
    };
}
function describeReplaySelection(replay, turnIndex, selected, world) {
    const turn = replay.turns[turnIndex] ?? replay.turns[0];
    if (!selected) {
        return {
            title: 'No selection',
            description: 'Click a tile, unit, city, or village to inspect the replay snapshot.',
            meta: [
                { label: 'Units', value: String(turn.snapshotEnd.units.length) },
                { label: 'Cities', value: String(turn.snapshotEnd.cities.length) },
            ],
        };
    }
    return describeSelectionFromWorld(selected, world, {
        emptyTitle: 'No selection',
        emptyDescription: 'Click a tile, unit, city, or village to inspect the replay snapshot.',
    });
}
function describePlaySelection(state, selected, hoveredKey, world, registry) {
    if (!selected && hoveredKey) {
        const hoveredHex = world.map.hexes.find((hex) => hex.key === hoveredKey);
        return {
            title: hoveredHex ? `Tile ${hoveredHex.key}` : 'No selection',
            description: hoveredHex ? `Terrain: ${hoveredHex.terrain}.` : 'Select a unit or tile to issue movement orders.',
            meta: hoveredHex ? [
                { label: 'Owner', value: hoveredHex.ownerFactionId ?? 'Neutral' },
                { label: 'Visibility', value: hoveredHex.visibility },
            ] : [],
            city: null,
        };
    }
    const activeFactionName = state.activeFactionId
        ? state.factions.get(state.activeFactionId)?.name ?? 'Unknown'
        : 'Unknown';
    return describeSelectionFromWorld(selected, world, {
        emptyTitle: 'No selection',
        emptyDescription: `Active faction: ${activeFactionName}. Select a friendly unit to show legal moves.`,
        state,
        registry,
    });
}
function describeSelectionFromWorld(selected, world, empty) {
    if (!selected) {
        return {
            title: empty.emptyTitle,
            description: empty.emptyDescription,
            meta: [],
            city: null,
        };
    }
    if (selected.type === 'hex') {
        const hex = world.map.hexes.find((entry) => entry.key === selected.key);
        return {
            title: `Tile ${selected.key}`,
            description: `Terrain: ${hex?.terrain ?? 'unknown'}.`,
            meta: [
                { label: 'Coordinate', value: `${selected.q}, ${selected.r}` },
                { label: 'Owner', value: hex?.ownerFactionId ?? 'Neutral' },
                { label: 'Visibility', value: hex?.visibility ?? 'unknown' },
            ],
            city: null,
        };
    }
    if (selected.type === 'unit') {
        const unit = world.units.find((entry) => entry.id === selected.unitId);
        const faction = unit ? world.factions.find((entry) => entry.id === unit.factionId) : null;
        return {
            title: unit?.prototypeName ?? 'Unit',
            description: `${faction?.name ?? 'Unknown faction'} field unit.`,
            meta: [
                { label: 'Position', value: unit ? `${unit.q}, ${unit.r}` : 'n/a' },
                { label: 'Health', value: unit ? `${unit.hp}/${unit.maxHp}` : 'n/a' },
                { label: 'Moves', value: unit ? `${unit.movesRemaining}/${unit.movesMax}` : 'n/a' },
                { label: 'Acted', value: unit?.acted ? 'Yes' : 'No' },
                ...(unit?.veteranLevel
                    ? [{ label: 'Veterancy', value: `${unit.veteranLevel}${unit.xp != null ? ` (${unit.xp} XP)` : ''}` }]
                    : []),
            ],
            city: null,
        };
    }
    if (selected.type === 'city') {
        const city = world.cities.find((entry) => entry.id === selected.cityId);
        const faction = city ? world.factions.find((entry) => entry.id === city.factionId) : null;
        const cityInspector = empty.state && empty.registry
            ? buildCityInspectorViewModel(empty.state, selected.cityId, empty.registry)
            : null;
        return {
            title: city?.name ?? 'City',
            description: `${faction?.name ?? 'Unknown faction'} settlement.`,
            meta: [
                { label: 'Position', value: city ? `${city.q}, ${city.r}` : 'n/a' },
                { label: 'Walls', value: city ? `${city.wallHp ?? 0}/${city.maxWallHp ?? 0}` : 'n/a' },
                { label: 'Besieged', value: city?.besieged ? 'Yes' : 'No' },
            ],
            city: cityInspector,
        };
    }
    const village = world.villages.find((entry) => entry.id === selected.villageId);
    const faction = village ? world.factions.find((entry) => entry.id === village.factionId) : null;
    return {
        title: village?.name ?? 'Village',
        description: `${faction?.name ?? 'Unknown faction'} village outpost.`,
        meta: [
            { label: 'Position', value: village ? `${village.q}, ${village.r}` : 'n/a' },
        ],
        city: null,
    };
}
function buildCityInspectorViewModel(state, cityId, registry) {
    const city = state.cities.get(cityId);
    if (!city) {
        return null;
    }
    const faction = state.factions.get(city.factionId);
    const economy = deriveResourceIncome(state, city.factionId, registry);
    const exhaustion = state.warExhaustion.get(city.factionId);
    const isFriendly = city.factionId === state.activeFactionId;
    const canManageProduction = isFriendly && !city.besieged;
    const cityCount = Math.max(1, getFactionCityIds(state, city.factionId).length);
    const perTurnIncome = Number((economy.productionPool / cityCount).toFixed(2));
    const readiness = getVillageSpawnReadinessWithRegistry(state, city.id, registry);
    const currentItem = city.currentProduction
        ? state.prototypes.get(city.currentProduction.item.id)
        : null;
    const currentCostType = city.currentProduction?.costType ?? city.currentProduction?.item.costType ?? 'production';
    const currentVillageCount = faction?.villageIds.length ?? 0;
    const currentProgress = city.currentProduction
        ? currentCostType === 'villages'
            ? Math.min(city.currentProduction.cost, currentVillageCount)
            : Number(city.currentProduction.progress.toFixed(2))
        : 0;
    const currentRemaining = city.currentProduction
        ? currentCostType === 'villages'
            ? Math.max(0, city.currentProduction.cost - currentVillageCount)
            : Number(Math.max(0, city.currentProduction.cost - city.currentProduction.progress).toFixed(2))
        : 0;
    return {
        cityId: city.id,
        cityName: city.name,
        factionId: city.factionId,
        factionName: faction?.name ?? city.factionId,
        isFriendly,
        isActiveFaction: city.factionId === state.activeFactionId,
        canManageProduction,
        production: {
            status: city.currentProduction ? 'producing' : 'idle',
            current: city.currentProduction ? {
                id: city.currentProduction.item.id,
                name: currentItem?.name ?? city.currentProduction.item.id,
                type: city.currentProduction.item.type,
                cost: city.currentProduction.cost,
                costType: currentCostType,
                costLabel: currentCostType === 'villages'
                    ? `${city.currentProduction.cost} villages`
                    : `${city.currentProduction.cost} production`,
                progress: currentProgress,
                remaining: currentRemaining,
                turnsRemaining: currentCostType === 'villages'
                    ? null
                    : perTurnIncome > 0
                        ? Math.ceil(Math.max(0, city.currentProduction.cost - city.currentProduction.progress) / perTurnIncome)
                        : null,
            } : null,
            queue: city.productionQueue.map((item) => {
                const prototype = state.prototypes.get(item.id);
                const costType = item.costType ?? 'production';
                return {
                    id: item.id,
                    name: prototype?.name ?? item.id,
                    type: item.type,
                    cost: item.cost,
                    costType,
                    costLabel: costType === 'villages' ? `${item.cost} villages` : `${item.cost} production`,
                };
            }),
            perTurnIncome,
        },
        productionOptions: (!faction ? [] : getAvailableProductionPrototypes(state, city.factionId, registry))
            .map((prototype) => {
            const costType = getPrototypeCostType(prototype);
            const cost = getPrototypeQueueCost(prototype);
            const villageCount = faction?.villageIds.length ?? 0;
            const disabledReason = !canManageProduction
                ? city.besieged
                    ? 'Cannot change production while besieged.'
                    : 'Only the active friendly city can change production.'
                : costType === 'villages' && !canPaySettlerVillageCost(state, city.factionId, SETTLER_VILLAGE_COST)
                    ? `Requires ${SETTLER_VILLAGE_COST} villages (${villageCount} available).`
                    : undefined;
            return {
                prototypeId: prototype.id,
                name: prototype.name,
                cost,
                costType,
                costLabel: costType === 'villages' ? `${cost} villages` : `${cost} production`,
                chassisId: prototype.chassisId,
                attack: prototype.derivedStats.attack,
                defense: prototype.derivedStats.defense,
                hp: prototype.derivedStats.hp,
                moves: prototype.derivedStats.moves,
                range: prototype.derivedStats.range,
                disabled: disabledReason !== undefined,
                disabledReason,
            };
        }),
        supply: {
            income: economy.supplyIncome,
            used: economy.supplyDemand,
            demand: economy.supplyDemand,
            balance: Number((economy.supplyIncome - economy.supplyDemand).toFixed(2)),
            deficit: getSupplyDeficit(economy),
        },
        turnsUntilNextVillage: readiness.roundsUntilCooldownReady,
        exhaustion: {
            points: exhaustion?.exhaustionPoints ?? 0,
            productionPenalty: calculateProductionPenalty(exhaustion?.exhaustionPoints ?? 0),
            moralePenalty: calculateMoralePenalty(exhaustion?.exhaustionPoints ?? 0),
        },
        villageReadiness: {
            eligible: readiness.eligible,
            latestVillageRound: readiness.latestVillageRound ?? 0,
            checklist: [
                {
                    key: 'city',
                    label: 'City can host villages',
                    met: readiness.cityExists,
                },
                {
                    key: 'cooldown',
                    label: 'Village cooldown ready',
                    met: readiness.cooldownMet,
                    detail: readiness.cooldownMet ? undefined : `${readiness.roundsUntilCooldownReady} round(s) remaining`,
                },
                {
                    key: 'hex',
                    label: 'Valid spawn hex available',
                    met: readiness.validSpawnHex,
                },
            ],
        },
        siteBonuses: buildSettlementBonusSummary(getCitySiteBonuses(city, state.map)),
        walls: {
            wallHp: city.wallHP,
            maxWallHp: city.maxWallHP,
            besieged: city.besieged,
        },
        captureRamp: (() => {
            if (city.turnsSinceCapture === undefined) {
                return undefined;
            }
            const rampMultiplier = getCaptureRampMultiplier(city.turnsSinceCapture);
            if (rampMultiplier >= 1) {
                return undefined; // No ramp in effect
            }
            // turnsUntilOutput: turns until production starts (> 0 means still at 0%)
            const turnsUntilOutput = rampMultiplier <= 0
                ? CAPTURE_RAMP_TURNS - city.turnsSinceCapture + 1
                : 0;
            // turnsUntilFull: turns until 100% output
            const turnsUntilFull = rampMultiplier < 1
                ? CAPTURE_RAMP_TURNS * 2 - city.turnsSinceCapture
                : 0;
            return {
                turnsSinceCapture: city.turnsSinceCapture,
                rampMultiplier,
                turnsUntilOutput: Math.max(0, turnsUntilOutput),
                turnsUntilFull: Math.max(0, turnsUntilFull),
            };
        })(),
    };
}
function describeVictory(replay) {
    const winner = replay.victory.winnerFactionId
        ? replay.factions.find((faction) => faction.id === replay.victory.winnerFactionId)?.name ?? replay.victory.winnerFactionId
        : 'Unresolved';
    if (replay.victory.victoryType === 'domination'
        && replay.victory.controlledCities !== null
        && replay.victory.dominationThreshold !== null) {
        return `${winner} ${replay.victory.controlledCities}/${replay.victory.dominationThreshold}`;
    }
    return `${winner} · ${replay.victory.victoryType}`;
}
function buildReplayFactions(replay) {
    return replay.factions.map((faction) => ({
        id: faction.id,
        name: faction.name,
        color: faction.color,
        nativeDomain: faction.nativeDomain,
        signatureUnit: faction.signatureUnit,
        economyAngle: faction.economyAngle,
    }));
}
function buildPlayFactions(state) {
    return Array.from(state.factions.values()).map((faction) => ({
        id: faction.id,
        name: faction.name,
        color: CIVILIZATIONS[faction.id]?.color ?? '#c8b68e',
        nativeDomain: faction.nativeDomain,
        signatureUnit: faction.identityProfile.signatureUnit,
        economyAngle: faction.identityProfile.economyAngle,
        homeCityId: faction.homeCityId,
        learnedDomains: faction.learnedDomains ?? [],
    }));
}
function buildHexVisibilityMap(state) {
    const map = new Map();
    if (!state.activeFactionId || !state.fogState) {
        return map;
    }
    const fog = state.fogState.get(state.activeFactionId);
    if (!fog) {
        return map;
    }
    for (const [key, level] of fog.hexVisibility) {
        map.set(key, level);
    }
    return map;
}
function buildBorderEdges(hexes, factions) {
    const factionColors = new Map(factions.map((faction) => [faction.id, faction.color]));
    const hexMap = new Map(hexes.map((hex) => [hex.key, hex]));
    const edges = [];
    for (const hex of hexes) {
        if (!hex.ownerFactionId || hex.visibility === 'hidden') {
            continue;
        }
        for (const direction of BORDER_DIRECTIONS) {
            const neighbor = hexMap.get(`${hex.q + direction.dq},${hex.r + direction.dr}`);
            if (neighbor?.ownerFactionId === hex.ownerFactionId) {
                continue;
            }
            edges.push({
                id: `${hex.key}:${direction.side}`,
                q: hex.q,
                r: hex.r,
                side: direction.side,
                factionId: hex.ownerFactionId,
                color: factionColors.get(hex.ownerFactionId) ?? '#f7e7bf',
            });
        }
    }
    return edges;
}
function getPlayableMoves(state, unit, registry) {
    if (!state.map) {
        return [];
    }
    return getValidMoves(state, unit.id, state.map, registry);
}
function getAttackableEnemies(state, unit) {
    if (unit.attacksRemaining <= 0) {
        return [];
    }
    const prototype = state.prototypes.get(unit.prototypeId);
    const attackRange = prototype?.derivedStats.range ?? 1;
    return Array.from(state.units.values()).filter((candidate) => candidate.hp > 0
        && candidate.factionId !== unit.factionId
        && hexDistance(unit.position, candidate.position) <= attackRange);
}
function inferChassisId(name) {
    const lowered = name.toLowerCase();
    if (lowered.includes('camel'))
        return 'camel';
    if (lowered.includes('elephant'))
        return 'elephant';
    if (lowered.includes('naval') || lowered.includes('marine') || lowered.includes('river'))
        return 'naval';
    if (lowered.includes('cavalry') || lowered.includes('horse'))
        return 'cavalry';
    if (lowered.includes('ranged') || lowered.includes('archer') || lowered.includes('bow'))
        return 'ranged';
    return 'infantry';
}
function normalizeSpriteKey(chassisId) {
    if (chassisId.includes('camel'))
        return 'camel';
    if (chassisId.includes('elephant'))
        return 'elephant';
    if (chassisId.includes('naval'))
        return 'naval';
    if (chassisId.includes('cavalry'))
        return 'cavalry';
    if (chassisId.includes('ranged'))
        return 'ranged';
    return 'infantry';
}
function getSpriteKeyForUnit(factionId, prototypeName, chassisId, sourceRecipeId) {
    if (sourceRecipeId === 'settler' || prototypeName.toLowerCase() === 'settler') {
        return 'settler';
    }
    // Hybrid units (identified by sourceRecipeId from hybrid-recipes.json)
    if (sourceRecipeId) {
        const map = {
            // Jungle
            'blowgun_skirmishers': 'jungle_blowgun',
            'serpent_priest': 'jungle_priest',
            // Druid
            'healing_druids': 'druid_healer',
            'druid_wizard': 'druid_wizard',
            // Steppe
            'steppe_raiders': 'steppe_raiders',
            'steppe_priest': 'steppe_priestess',
            // Hill
            'fortress_archer': 'hill_fortress_archer',
            'catapult': 'hill_catapult',
            // Pirate
            'slaver': 'pirate_slaver',
            'slave_galley': 'pirate_slaver_ship',
            // Desert
            'camel_lancers': 'desert_camel_lancers',
            'desert_immortals': 'desert_immortal',
            // Savannah
            'war_elephants': 'savannah_elephant',
            'war_chariot': 'savannah_chariot',
            // River
            'river_raiders': 'river_raiders',
            'river_priest': 'river_priestess',
            // Frost
            'ice_defenders': 'frost_ice_defenders',
            'polar_priest': 'frost_priest',
        };
        if (map[sourceRecipeId])
            return map[sourceRecipeId];
    }
    // Summon/signature units (identified by special chassis IDs)
    if (chassisId === 'serpent_frame')
        return 'jungle_serpent';
    if (chassisId === 'warlord_frame')
        return 'steppe_warlord';
    if (chassisId === 'galley_frame')
        return 'pirate_galley';
    if (chassisId === 'polar_bear_frame')
        return 'frost_polar_bear';
    if (chassisId === 'alligator_frame')
        return 'river_crocodile';
    // Starting units by faction
    const startingMap = {
        jungle_clan: {
            infantry_frame: 'jungle_spearman',
            ranged_frame: 'jungle_archer',
        },
        druid_circle: {
            infantry_frame: 'druid_spear_infantry',
            ranged_frame: 'druid_archer',
        },
        steppe_clan: {
            infantry_frame: 'steppe_spear_infantry',
            cavalry_frame: 'steppe_horse_archer',
        },
        hill_clan: {
            infantry_frame: 'hill_spear_infantry',
            ranged_frame: 'hill_archer',
        },
        coral_people: {
            infantry_frame: 'pirate_infantry',
            ranged_frame: 'pirate_ranged',
        },
        desert_nomads: {
            camel_frame: 'desert_camel',
            infantry_frame: 'desert_spearman',
        },
        savannah_lions: {
            infantry_frame: 'savannah_spearman',
            ranged_frame: 'savannah_javelin',
        },
        plains_riders: {
            infantry_frame: 'river_spearman',
            naval_frame: 'river_canoe',
        },
        frost_wardens: {
            infantry_frame: 'frost_spearman',
            ranged_frame: 'frost_archer',
        },
    };
    const factionUnits = startingMap[factionId];
    if (factionUnits) {
        const sprite = factionUnits[chassisId];
        if (sprite)
            return sprite;
    }
    // Ultimate fallback (should never hit if all units are mapped)
    return normalizeSpriteKey(chassisId);
}
export function buildResearchInspectorViewModel(state, registry) {
    const factionId = state.activeFactionId;
    if (!factionId)
        return null;
    const faction = state.factions.get(factionId);
    if (!faction)
        return null;
    const research = state.research.get(factionId);
    if (!research)
        return null;
    const nativeDomain = faction.nativeDomain ?? '';
    const learnedDomains = faction.learnedDomains ?? [nativeDomain];
    const allDomains = registry.getAllResearchDomains();
    const progression = getDomainProgression(faction, research);
    // Build node VMs across all research domains
    const nodes = [];
    for (const domainDef of allDomains) {
        const domainId = domainDef.id;
        const isNative = domainId === nativeDomain;
        const isUnlocked = learnedDomains.includes(domainId);
        for (const nodeDef of Object.values(domainDef.nodes)) {
            const isCompleted = research.completedNodes.includes(nodeDef.id);
            const isActive = research.activeNodeId === nodeDef.id;
            const progress = research.progressByNodeId[nodeDef.id] ?? 0;
            const prereqsMet = (nodeDef.prerequisites ?? []).every((prereqId) => research.completedNodes.includes(prereqId));
            let nodeState;
            if (!isUnlocked)
                nodeState = 'locked';
            else if (isCompleted)
                nodeState = 'completed';
            else if (isActive)
                nodeState = 'active';
            else if (!prereqsMet)
                nodeState = 'locked';
            else
                nodeState = 'available';
            const estimatedTurns = nodeState === 'active' && research.researchPerTurn > 0
                ? Math.ceil(Math.max(0, nodeDef.xpCost - progress) / research.researchPerTurn)
                : null;
            nodes.push({
                nodeId: nodeDef.id,
                name: nodeDef.name,
                tier: nodeDef.tier ?? 1,
                xpCost: nodeDef.xpCost,
                discountedXpCost: null,
                currentProgress: progress,
                state: nodeState,
                prerequisites: nodeDef.prerequisites ?? [],
                prerequisiteNames: [],
                unlocks: [],
                qualitativeEffect: nodeDef.qualitativeEffect?.description ?? null,
                estimatedTurns,
                domain: domainId,
                isNative,
                isLocked: !isUnlocked,
            });
        }
    }
    // Build domain pips for all 10 research domains
    const capabilitiesVms = allDomains.map((domainDef) => {
        const domainId = domainDef.id;
        const tier = getDomainTier(faction, domainId, research.completedNodes);
        return {
            domainId,
            domainName: domainDef.name,
            description: domainDef.name,
            level: tier,
            hasResearchTrack: true,
            codified: learnedDomains.includes(domainId),
            t1Ready: tier >= 1,
            t2Ready: tier >= 2,
        };
    });
    // Find active node info across domains
    let activeNodeName = null;
    let activeNodeCost = null;
    let activeNodeProgress = null;
    if (research.activeNodeId) {
        const domainId = research.activeNodeId.split('_t')[0];
        const domain = registry.getResearchDomain(domainId);
        if (domain?.nodes[research.activeNodeId]) {
            activeNodeName = domain.nodes[research.activeNodeId].name;
            activeNodeCost = domain.nodes[research.activeNodeId].xpCost;
            activeNodeProgress = research.progressByNodeId[research.activeNodeId] ?? 0;
        }
    }
    // Simplified rate breakdown — flat base rate only
    const totalRate = research.researchPerTurn;
    return {
        factionId,
        activeNodeId: research.activeNodeId,
        activeNodeName,
        activeNodeProgress,
        activeNodeXpCost: activeNodeCost,
        completedCount: research.completedNodes.length,
        totalNodes: nodes.length,
        nodes,
        capabilities: capabilitiesVms,
        rateBreakdown: {
            base: research.researchPerTurn,
            detail: progression.canBuildLateTier
                ? `${learnedDomains.length} domains unlocked · late-tier production available`
                : progression.canBuildMidTier
                    ? `${learnedDomains.length} domains unlocked · mid-tier production available`
                    : `${learnedDomains.length} domain unlocked · base production only`,
            total: totalRate,
        },
        hasKnowledgeDiscount: false,
    };
}
