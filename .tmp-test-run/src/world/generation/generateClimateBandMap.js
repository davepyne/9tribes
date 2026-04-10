import { getHexesInRange, getNeighbors, hexDistance, hexToKey } from '../../core/grid.js';
import { rngInt, rngNextFloat, rngShuffle } from '../../core/rng.js';
import { createMap } from '../map/createMap.js';
const DEFAULT_OPTIONS = {
    width: 40,
    height: 30,
    mode: 'randomClimateBands',
    startSeparation: 12,
    rerollCap: 8,
    allowRepairs: true,
    lakeChance: 0.15,
    riverCountMin: 2,
    riverCountMax: 3,
};
const WATER_TERRAINS = new Set(['coast', 'river', 'ocean']);
const CLUSTER_BIOMES = new Set(['jungle', 'hill']);
export function generateClimateBandMap(rng, requests, inputOptions = {}) {
    const options = { ...DEFAULT_OPTIONS, ...inputOptions };
    let lastFailure = 'unknown';
    for (let attempt = 0; attempt <= options.rerollCap; attempt++) {
        const climateProfile = buildClimateProfile(options.width, options.height);
        const map = createMap(options.width, options.height);
        generateBaseClimateTerrain(map, rng, climateProfile);
        carveCoasts(map, rng, climateProfile, options.lakeChance);
        carveHills(map, rng);
        carveJungles(map, rng, climateProfile);
        carveRivers(map, rng, options);
        carveSwamps(map, rng, climateProfile);
        normalizeClimateBands(map, climateProfile);
        const placement = placeStarts(map, rng, requests, options, climateProfile);
        if (placement) {
            const validation = validateGeneratedMap(map, requests, placement.startPositions, climateProfile);
            if (!validation.valid) {
                lastFailure = validation.reasons.join('; ');
                continue;
            }
            map.metadata = {
                mode: options.mode,
                climateProfile,
                startPlacements: placement.validations,
                repairsApplied: placement.validations.filter((item) => item.repaired).length,
                rerollsUsed: attempt,
            };
            return { map, startPositions: placement.startPositions, validations: placement.validations };
        }
        lastFailure = `failed to place starts on attempt ${attempt + 1}`;
    }
    throw new Error(`generateClimateBandMap: ${lastFailure}`);
}
function buildClimateProfile(width, height) {
    void width;
    const arcticRowCount = Math.max(2, Math.floor(height * 0.16));
    const tundraBandEndRow = Math.max(arcticRowCount + 1, Math.floor(height * 0.28));
    const temperateBandEndRow = Math.max(tundraBandEndRow + 2, Math.floor(height * 0.56));
    const warmBandStartRow = Math.max(temperateBandEndRow - 1, Math.floor(height * 0.62));
    const desertBandStartRow = Math.max(warmBandStartRow + 1, Math.floor(height * 0.72));
    return {
        arcticRowCount,
        tundraBandEndRow,
        temperateBandEndRow,
        warmBandStartRow,
        desertBandStartRow,
    };
}
function generateBaseClimateTerrain(map, rng, climate) {
    const moistureOffset = rngNextFloat(rng) * 100;
    const heatOffset = rngNextFloat(rng) * 100;
    for (let q = 0; q < map.width; q++) {
        for (let r = 0; r < map.height; r++) {
            const tile = map.tiles.get(hexToKey({ q, r }));
            if (!tile)
                continue;
            const latitude = r / Math.max(1, map.height - 1);
            const heat = latitude + Math.sin((q + heatOffset) / 3.4) * 0.08 + Math.cos((r + heatOffset) / 5.1) * 0.04;
            const moisture = 0.5
                + Math.sin((q + moistureOffset) / 2.8) * 0.24
                + Math.cos((r + moistureOffset) / 3.8) * 0.18
                + (rngNextFloat(rng) - 0.5) * 0.12;
            tile.terrain = pickClimateTerrain(r, heat, moisture, climate);
        }
    }
}
function pickClimateTerrain(row, heat, moisture, climate) {
    if (row < climate.arcticRowCount) {
        return 'tundra';
    }
    if (row <= climate.tundraBandEndRow) {
        return moisture > 0.55 ? 'forest' : 'tundra';
    }
    if (row <= climate.temperateBandEndRow) {
        if (moisture > 0.72)
            return 'forest';
        if (moisture > 0.42)
            return 'plains';
        return 'hill';
    }
    if (row >= climate.desertBandStartRow) {
        if (moisture > 0.72)
            return 'jungle';
        if (moisture > 0.45)
            return 'savannah';
        return 'desert';
    }
    if (heat > 0.72 && moisture > 0.7)
        return 'jungle';
    if (moisture > 0.62)
        return 'forest';
    if (moisture < 0.3)
        return 'savannah';
    return 'plains';
}
function carveCoasts(map, rng, climate, lakeChance) {
    // Island mode: outer two rings are solid ocean/coast with no gaps
    for (let q = 0; q < map.width; q++) {
        for (let r = 0; r < map.height; r++) {
            const tile = map.tiles.get(hexToKey({ q, r }));
            if (!tile)
                continue;
            const edgeDistance = Math.min(q, r, map.width - 1 - q, map.height - 1 - r);
            if (edgeDistance === 0) {
                tile.terrain = 'ocean';
                continue;
            }
            if (edgeDistance === 1) {
                tile.terrain = 'coast';
                continue;
            }
        }
    }
    const lakeCount = Math.max(1, Math.floor(map.width * map.height / 180));
    for (let i = 0; i < lakeCount; i++) {
        if (rngNextFloat(rng) > lakeChance)
            continue;
        const edge = rngInt(rng, 0, 3);
        const center = edge === 0 ? { q: rngInt(rng, 1, map.width - 2), r: rngInt(rng, 1, Math.min(3, map.height - 2)) } :
            edge === 1 ? { q: rngInt(rng, 1, map.width - 2), r: rngInt(rng, Math.max(1, map.height - 4), map.height - 2) } :
                edge === 2 ? { q: rngInt(rng, 1, Math.min(3, map.width - 2)), r: rngInt(rng, climate.arcticRowCount + 1, map.height - 2) } :
                    { q: rngInt(rng, Math.max(1, map.width - 4), map.width - 2), r: rngInt(rng, climate.arcticRowCount + 1, map.height - 2) };
        for (const hex of getHexesInRange(center, 1)) {
            const tile = map.tiles.get(hexToKey(hex));
            if (!tile)
                continue;
            if (edgeDistance(map, tile.position) > 3)
                continue;
            tile.terrain = 'coast';
        }
    }
}
function carveHills(map, rng) {
    const clusterCount = Math.max(2, Math.floor(map.width * map.height / 120));
    for (let i = 0; i < clusterCount; i++) {
        const center = { q: rngInt(rng, 2, map.width - 3), r: rngInt(rng, 2, map.height - 4) };
        const radius = rngInt(rng, 1, 2);
        for (const hex of getHexesInRange(center, radius)) {
            const tile = map.tiles.get(hexToKey(hex));
            if (!tile || WATER_TERRAINS.has(tile.terrain))
                continue;
            if (rngNextFloat(rng) < 0.78) {
                tile.terrain = 'hill';
            }
        }
    }
}
function carveJungles(map, rng, climate) {
    const clusterCount = Math.max(2, Math.floor(map.width * map.height / 280));
    for (let i = 0; i < clusterCount; i++) {
        const center = {
            q: rngInt(rng, 2, map.width - 3),
            r: rngInt(rng, Math.max(climate.temperateBandEndRow, 4), map.height - 3),
        };
        const radius = rngInt(rng, 1, 2);
        for (const hex of getHexesInRange(center, radius)) {
            const tile = map.tiles.get(hexToKey(hex));
            if (!tile || WATER_TERRAINS.has(tile.terrain))
                continue;
            if (rngNextFloat(rng) < 0.5) {
                tile.terrain = 'jungle';
            }
        }
    }
}
function carveRivers(map, rng, options) {
    const riverCount = rngInt(rng, options.riverCountMin, options.riverCountMax);
    for (let index = 0; index < riverCount; index++) {
        let q = rngInt(rng, 2, map.width - 3);
        let r = rngInt(rng, 1, Math.max(2, Math.floor(map.height * 0.45)));
        const riverLength = rngInt(rng, Math.floor(map.height * 0.5), Math.floor(map.height * 0.9));
        for (let step = 0; step < riverLength; step++) {
            const key = hexToKey({ q, r });
            const tile = map.tiles.get(key);
            if (tile && tile.terrain !== 'coast') {
                tile.terrain = 'river';
            }
            const southBias = rngNextFloat(rng);
            if (southBias < 0.65 && r < map.height - 2) {
                r += 1;
            }
            const lateral = rngNextFloat(rng);
            if (lateral < 0.28 && q > 1) {
                q -= 1;
            }
            else if (lateral > 0.72 && q < map.width - 2) {
                q += 1;
            }
            if (r >= map.height - 2 || q <= 1 || q >= map.width - 2) {
                const edgeTile = map.tiles.get(hexToKey({ q, r }));
                if (edgeTile) {
                    edgeTile.terrain = 'coast';
                }
                break;
            }
        }
    }
}
function normalizeClimateBands(map, climate) {
    for (const tile of map.tiles.values()) {
        const row = tile.position.r;
        if (row <= climate.tundraBandEndRow && tile.terrain === 'desert') {
            tile.terrain = row < climate.arcticRowCount ? 'tundra' : 'plains';
            continue;
        }
        if (row >= climate.desertBandStartRow && tile.terrain === 'tundra') {
            tile.terrain = 'savannah';
            continue;
        }
        if (row < climate.arcticRowCount && tile.terrain === 'jungle') {
            tile.terrain = 'forest';
            continue;
        }
        if (row >= climate.desertBandStartRow && tile.terrain === 'forest') {
            tile.terrain = 'savannah';
        }
    }
}
function carveSwamps(map, rng, climate) {
    const clusterCount = Math.max(2, Math.floor(map.width * map.height / 300));
    for (let i = 0; i < clusterCount; i++) {
        const center = {
            q: rngInt(rng, 2, map.width - 3),
            r: rngInt(rng, Math.max(climate.temperateBandEndRow, 4), map.height - 3),
        };
        const radius = rngInt(rng, 1, 2);
        for (const hex of getHexesInRange(center, radius)) {
            const tile = map.tiles.get(hexToKey(hex));
            if (!tile || WATER_TERRAINS.has(tile.terrain))
                continue;
            if (tile.terrain === 'swamp')
                continue;
            if (rngNextFloat(rng) < 0.55) {
                tile.terrain = 'swamp';
            }
        }
    }
}
function placeStarts(map, rng, requests, options, climate) {
    const ordered = orderStartRequests(requests);
    const chosen = [];
    const validations = [];
    const effectiveStartSeparation = Math.min(options.startSeparation, Math.max(2, Math.floor(Math.min(map.width, map.height) / 3)));
    for (const request of ordered) {
        let candidate = findBestCandidate(map, rng, request, chosen, effectiveStartSeparation, climate, false);
        if (!candidate && options.allowRepairs) {
            candidate = findBestCandidate(map, rng, request, chosen, effectiveStartSeparation, climate, true);
        }
        if (!candidate) {
            return null;
        }
        chosen.push(candidate);
        validations.push({
            factionId: request.factionId,
            position: candidate.position,
            nearbyBiomeShare: candidate.nearbyBiomeShare,
            checks: candidate.checks,
            repaired: candidate.repaired,
            repairActions: candidate.repairActions,
        });
    }
    return {
        startPositions: Object.fromEntries(validations.map((item) => [item.factionId, item.position])),
        validations,
    };
}
function orderStartRequests(requests) {
    const priorities = {
        frost_wardens: 1,
        coral_people: 2,
        plains_riders: 3,
        jungle_clan: 4,
        hill_clan: 5,
        druid_circle: 5,
        desert_nomads: 6,
        savannah_lions: 7,
        steppe_clan: 8,
    };
    return [...requests].sort((a, b) => (priorities[a.factionId] ?? 10) - (priorities[b.factionId] ?? 10));
}
function findBestCandidate(map, rng, request, chosen, startSeparation, climate, allowRepair) {
    const positions = rngShuffle(rng, Array.from(map.tiles.values()).map((tile) => tile.position));
    let bestRelaxed = null;
    for (const position of positions) {
        if (!isInteriorEnough(map, position))
            continue;
        if (chosen.some((existing) => hexDistance(existing.position, position) < startSeparation))
            continue;
        const baseCandidate = scoreCandidate(map, request, position, climate);
        if (areChecksPassing(baseCandidate.checks)) {
            return baseCandidate;
        }
        if (!bestRelaxed || baseCandidate.score > bestRelaxed.score) {
            bestRelaxed = baseCandidate;
        }
    }
    if (!allowRepair || !bestRelaxed) {
        return null;
    }
    const repaired = repairCandidate(map, request, bestRelaxed.position, climate);
    if (!repaired) {
        return null;
    }
    const rescored = scoreCandidate(map, request, bestRelaxed.position, climate);
    if (!areChecksPassing(rescored.checks)) {
        return null;
    }
    rescored.repaired = true;
    rescored.repairActions = repaired;
    return rescored;
}
function scoreCandidate(map, request, position, climate) {
    const homeShare = getNearbyBiomeShare(map, position, request.homeBiome, request.factionId === 'coral_people' ? 3 : 2);
    const riverTileCount = countTerrainWithinRange(map, position, 'river', 3);
    const openness = countPassableNeighbors(map, position, 1);
    const riverAccess = hasTerrainNearby(map, position, 'river', 1);
    const steppeRiverAccess = hasTerrainNearby(map, position, 'river', 2);
    const coastAccess = hasTerrainNearby(map, position, 'coast', 1);
    const checks = {
        openness: openness >= getMinimumOpenings(request),
    };
    if (request.factionId !== 'plains_riders') {
        checks.minHomeBiomeShare = homeShare >= getMinimumHomeShare(request);
    }
    if (request.factionId === 'frost_wardens') {
        checks.northArctic = position.r <= Math.floor(map.height / 3);
        checks.tundraShare = getNearbyBiomeShare(map, position, 'tundra', 2) >= 0.35;
        checks.lowAccess = countPassableNeighbors(map, position, 2) <= 24;
    }
    if (request.factionId === 'coral_people') {
        checks.waterAccess = coastAccess || riverAccess;
        checks.noDeadEnd = countNonWaterNeighbors(map, position) >= 2;
    }
    if (request.factionId === 'plains_riders') {
        checks.riverCluster = riverTileCount >= 3;
        checks.riverAccess = riverAccess;
        checks.riverCorridor = getRiverReach(map, position) >= 4;
    }
    if (request.factionId === 'jungle_clan') {
        checks.jungleCluster = countTerrainWithinRange(map, position, 'jungle', 2) >= 5;
    }
    if (request.factionId === 'hill_clan') {
        checks.hillCluster = countTerrainWithinRange(map, position, 'hill', 2) >= 5;
    }
    if (request.factionId === 'druid_circle') {
        checks.forestCluster = countTerrainWithinRange(map, position, 'forest', 2) >= 5;
    }
    if (request.factionId === 'desert_nomads') {
        checks.desertCluster = countTerrainWithinRange(map, position, 'desert', 2) >= 5;
    }
    if (request.factionId === 'savannah_lions') {
        checks.savannahCluster = countTerrainWithinRange(map, position, 'savannah', 2) >= 5;
    }
    if (request.factionId === 'steppe_clan') {
        checks.riverAccess = steppeRiverAccess;
    }
    let score = request.factionId === 'plains_riders' ? riverTileCount * 12 : homeShare * 100;
    score += Math.min(openness, 6) * 3;
    score += Math.max(0, edgeDistance(map, position) - 1) * 2;
    if (position.r < climate.tundraBandEndRow && request.factionId === 'frost_wardens') {
        score += 18;
    }
    if (coastAccess && request.factionId === 'coral_people') {
        score += 14;
    }
    if (riverAccess && request.factionId === 'plains_riders') {
        score += 14;
    }
    return {
        position,
        score,
        checks,
        nearbyBiomeShare: homeShare,
        repaired: false,
        repairActions: [],
    };
}
function getMinimumHomeShare(request) {
    switch (request.factionId) {
        case 'frost_wardens':
            return 0.35;
        case 'coral_people':
            return 0.15;
        case 'jungle_clan':
        case 'hill_clan':
        case 'druid_circle':
        case 'desert_nomads':
        case 'savannah_lions':
            return 0.24;
        case 'plains_riders':
            return 0;
        default:
            return 0.28;
    }
}
function getMinimumOpenings(request) {
    return request.factionId === 'frost_wardens' ? 2 : 3;
}
function areChecksPassing(checks) {
    return Object.values(checks).every(Boolean);
}
function isInteriorEnough(map, position) {
    return position.q >= 1
        && position.q < map.width - 1
        && position.r >= 1
        && position.r < map.height - 1;
}
function edgeDistance(map, position) {
    return Math.min(position.q, position.r, map.width - 1 - position.q, map.height - 1 - position.r);
}
function validateGeneratedMap(map, requests, startPositions, climate) {
    const reasons = [];
    const northRows = Array.from(map.tiles.values()).filter((tile) => tile.position.r <= climate.tundraBandEndRow);
    if (northRows.some((tile) => tile.terrain === 'desert')) {
        reasons.push('north band contains desert');
    }
    const southRows = Array.from(map.tiles.values()).filter((tile) => tile.position.r >= climate.desertBandStartRow);
    if (southRows.some((tile) => tile.terrain === 'tundra')) {
        reasons.push('southern hot band contains tundra');
    }
    if (!coastIsCoherent(map)) {
        reasons.push('coast coherence failed');
    }
    if (!riversAreCoherent(map)) {
        reasons.push('river coherence failed');
    }
    for (const terrain of ['forest', 'jungle', 'hill', 'tundra']) {
        if (!hasMinimumContiguousRegion(map, terrain, 5)) {
            reasons.push(`missing contiguous ${terrain} region`);
        }
    }
    for (const request of requests) {
        const start = startPositions[request.factionId];
        if (!start) {
            reasons.push(`missing start for ${request.factionId}`);
            continue;
        }
        const share = getNearbyBiomeShare(map, start, request.homeBiome, request.factionId === 'coral_people' ? 3 : 2);
        if (share < getMinimumHomeShare(request)) {
            reasons.push(`${request.factionId} start biome share failed`);
        }
    }
    return { valid: reasons.length === 0, reasons };
}
function coastIsCoherent(map) {
    const visited = new Set();
    for (const tile of map.tiles.values()) {
        if (tile.terrain !== 'coast')
            continue;
        const key = hexToKey(tile.position);
        if (visited.has(key))
            continue;
        const cluster = collectTerrainCluster(map, tile.position, new Set(['coast']));
        for (const clusterKey of cluster) {
            visited.add(clusterKey);
        }
        const touchesEdge = cluster.some((clusterKey) => {
            const coord = keyToCoord(clusterKey);
            return edgeDistance(map, coord) <= 1;
        });
        if (!touchesEdge) {
            return false;
        }
    }
    return true;
}
function riversAreCoherent(map) {
    for (const tile of map.tiles.values()) {
        if (tile.terrain !== 'river')
            continue;
        const riverOrCoastNeighbors = getNeighbors(tile.position)
            .map((neighbor) => map.tiles.get(hexToKey(neighbor)))
            .filter((neighborTile) => neighborTile?.terrain === 'river' || neighborTile?.terrain === 'coast');
        if (riverOrCoastNeighbors.length === 0) {
            return false;
        }
    }
    return true;
}
function hasMinimumContiguousRegion(map, terrain, minClusterSize) {
    const terrainTiles = Array.from(map.tiles.values()).filter((tile) => tile.terrain === terrain);
    if (terrainTiles.length < minClusterSize) {
        return false;
    }
    const visited = new Set();
    let largestCluster = 0;
    for (const tile of terrainTiles) {
        const key = hexToKey(tile.position);
        if (visited.has(key))
            continue;
        const cluster = collectTerrainCluster(map, tile.position, new Set([terrain]));
        for (const clusterKey of cluster) {
            visited.add(clusterKey);
        }
        largestCluster = Math.max(largestCluster, cluster.length);
    }
    return largestCluster >= minClusterSize;
}
function collectTerrainCluster(map, start, terrains) {
    const startTile = map.tiles.get(hexToKey(start));
    if (!startTile || !terrains.has(startTile.terrain)) {
        return [];
    }
    const queue = [start];
    const visited = new Set();
    const cluster = [];
    while (queue.length > 0) {
        const current = queue.shift();
        const key = hexToKey(current);
        if (visited.has(key))
            continue;
        visited.add(key);
        const tile = map.tiles.get(key);
        if (!tile || !terrains.has(tile.terrain))
            continue;
        cluster.push(key);
        for (const neighbor of getNeighbors(current)) {
            if (!visited.has(hexToKey(neighbor))) {
                queue.push(neighbor);
            }
        }
    }
    return cluster;
}
function keyToCoord(key) {
    const [q, r] = key.split(',').map(Number);
    return { q, r };
}
function getNearbyBiomeShare(map, center, terrain, range) {
    const nearby = getHexesInRange(center, range)
        .map((hex) => map.tiles.get(hexToKey(hex)))
        .filter((tile) => Boolean(tile));
    if (nearby.length === 0)
        return 0;
    const matching = nearby.filter((tile) => tile.terrain === terrain).length;
    return matching / nearby.length;
}
function countTerrainWithinRange(map, center, terrain, range) {
    return getHexesInRange(center, range)
        .map((hex) => map.tiles.get(hexToKey(hex)))
        .filter((tile) => Boolean(tile && tile.terrain === terrain))
        .length;
}
function countPassableNeighbors(map, center, range) {
    return getHexesInRange(center, range)
        .map((hex) => map.tiles.get(hexToKey(hex)))
        .filter((tile) => Boolean(tile))
        .length;
}
function countNonWaterNeighbors(map, center) {
    return getNeighbors(center)
        .map((hex) => map.tiles.get(hexToKey(hex)))
        .filter((tile) => Boolean(tile && !WATER_TERRAINS.has(tile.terrain)))
        .length;
}
function hasTerrainNearby(map, center, terrain, range) {
    return countTerrainWithinRange(map, center, terrain, range) > 0;
}
function getRiverReach(map, center) {
    const riverTiles = getHexesInRange(center, 2)
        .map((hex) => map.tiles.get(hexToKey(hex)))
        .filter((tile) => Boolean(tile && tile.terrain === 'river'));
    return riverTiles.length;
}
function repairCandidate(map, request, position, climate) {
    const actions = [];
    switch (request.factionId) {
        case 'frost_wardens':
            if (position.r > Math.floor(map.height / 3))
                return null;
            stampTerrain(map, position, 'tundra', 2, true);
            actions.push('reinforced_arctic_tundra');
            break;
        case 'coral_people': {
            stampTerrain(map, position, 'coast', 2, false);
            actions.push('carved_lagoon');
            break;
        }
        case 'plains_riders':
            carveLocalRiver(map, position);
            actions.push('carved_river_corridor');
            break;
        case 'jungle_clan':
            stampTerrain(map, position, 'jungle', 1, true);
            actions.push('stamped_jungle_cluster');
            break;
        case 'hill_clan':
            stampTerrain(map, position, 'hill', 1, true);
            actions.push('raised_hill_cluster');
            break;
        case 'druid_circle':
            stampTerrain(map, position, 'forest', 1, true);
            actions.push('stamped_forest_cluster');
            break;
        case 'desert_nomads':
            stampTerrain(map, position, 'desert', 1, true);
            actions.push('stamped_desert_cluster');
            break;
        case 'savannah_lions':
            stampTerrain(map, position, 'savannah', 1, true);
            actions.push('stamped_savannah_cluster');
            break;
        default:
            if (CLUSTER_BIOMES.has(request.homeBiome)) {
                stampTerrain(map, position, request.homeBiome, 1, true);
            }
            else {
                stampTerrain(map, position, request.homeBiome, 1, false);
            }
            actions.push(`reinforced_${request.homeBiome}`);
            break;
    }
    if (request.factionId === 'frost_wardens') {
        for (const neighbor of getNeighbors(position)) {
            const tile = map.tiles.get(hexToKey(neighbor));
            if (tile && tile.position.r < climate.tundraBandEndRow) {
                tile.terrain = 'tundra';
            }
        }
    }
    return actions;
}
function stampTerrain(map, center, terrain, radius, skipWater) {
    for (const hex of getHexesInRange(center, radius)) {
        const tile = map.tiles.get(hexToKey(hex));
        if (!tile)
            continue;
        if (skipWater && WATER_TERRAINS.has(tile.terrain))
            continue;
        tile.terrain = terrain;
    }
}
function carveLocalRiver(map, center) {
    const offsets = [
        { q: 0, r: -2 },
        { q: 0, r: -1 },
        { q: 0, r: 0 },
        { q: 0, r: 1 },
        { q: 0, r: 2 },
    ];
    for (const offset of offsets) {
        const tile = map.tiles.get(hexToKey({ q: center.q + offset.q, r: center.r + offset.r }));
        if (tile && tile.terrain !== 'coast') {
            tile.terrain = 'river';
        }
    }
}
