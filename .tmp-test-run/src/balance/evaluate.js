import { loadRulesRegistry } from '../data/loader/loadRulesRegistry.js';
import { DEFAULT_HARNESS_TURNS, SMOKE_HARNESS_SEEDS, STRATIFIED_HARNESS_SEEDS, runBalanceHarness, } from '../systems/balanceHarness.js';
import { scoreBalanceSummary } from './objective.js';
import { assertValidBalanceOverrides, } from './types.js';
const REQUEST_KEYS = new Set(['overrides', 'seeds', 'maxTurns', 'mapMode', 'stratified']);
const OVERRIDE_SECTION_KEYS = new Set(['terrainYields', 'chassis', 'components', 'factions', 'scenario', 'signatureAbilities']);
function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
export function normalizeEvaluationRequest(input) {
    if (input === undefined || input === null || input === '') {
        return {};
    }
    if (!isRecord(input)) {
        throw new Error('Evaluation request must be a JSON object');
    }
    const keys = Object.keys(input);
    const looksLikeOverrides = keys.some((key) => OVERRIDE_SECTION_KEYS.has(key))
        && !keys.some((key) => REQUEST_KEYS.has(key));
    if (looksLikeOverrides) {
        return { overrides: input };
    }
    for (const key of keys) {
        if (!REQUEST_KEYS.has(key)) {
            throw new Error(`Unknown evaluation request key "${key}"`);
        }
    }
    const request = input;
    if (request.seeds !== undefined) {
        if (!Array.isArray(request.seeds) || request.seeds.some((seed) => typeof seed !== 'number' || !Number.isFinite(seed))) {
            throw new Error('seeds must be an array of numbers');
        }
    }
    if (request.maxTurns !== undefined && (typeof request.maxTurns !== 'number' || !Number.isFinite(request.maxTurns))) {
        throw new Error('maxTurns must be a finite number');
    }
    if (request.mapMode !== undefined && request.mapMode !== 'fixed' && request.mapMode !== 'randomClimateBands') {
        throw new Error(`Unsupported mapMode "${request.mapMode}"`);
    }
    if (request.stratified !== undefined && typeof request.stratified !== 'boolean') {
        throw new Error('stratified must be a boolean');
    }
    assertValidBalanceOverrides(request.overrides);
    return request;
}
export function evaluateBalanceRequest(request) {
    const normalized = normalizeEvaluationRequest(request);
    const overrides = normalized.overrides ?? {};
    const maxTurns = normalized.maxTurns ?? overrides.scenario?.roundsToWin ?? DEFAULT_HARNESS_TURNS;
    const mapMode = normalized.mapMode ?? 'fixed';
    const stratified = normalized.stratified ?? false;
    const seeds = stratified
        ? [...STRATIFIED_HARNESS_SEEDS]
        : normalized.seeds ?? [...SMOKE_HARNESS_SEEDS];
    const registry = loadRulesRegistry(overrides);
    const summary = runBalanceHarness(registry, seeds, maxTurns, mapMode, overrides);
    const objective = scoreBalanceSummary(summary);
    return {
        overrides,
        seeds,
        maxTurns,
        mapMode,
        stratified,
        summary,
        objective,
    };
}
