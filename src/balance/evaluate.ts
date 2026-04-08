import { loadRulesRegistry } from '../data/loader/loadRulesRegistry.js';
import type { MapGenerationMode } from '../world/map/types.js';
import {
  DEFAULT_HARNESS_TURNS,
  SMOKE_HARNESS_SEEDS,
  STRATIFIED_HARNESS_SEEDS,
  runBalanceHarness,
} from '../systems/balanceHarness.js';
import { type BalanceObjectiveBreakdown, scoreBalanceSummary } from './objective.js';
import {
  assertValidBalanceOverrides,
  type BalanceOverrides,
} from './types.js';
import type { BatchBalanceSummary } from '../systems/balanceHarness.js';

export interface BalanceEvaluationRequest {
  overrides?: BalanceOverrides;
  seeds?: number[];
  maxTurns?: number;
  mapMode?: MapGenerationMode;
  stratified?: boolean;
}

export interface BalanceEvaluationResult {
  overrides: BalanceOverrides;
  seeds: number[];
  maxTurns: number;
  mapMode: MapGenerationMode;
  stratified: boolean;
  summary: BatchBalanceSummary;
  objective: BalanceObjectiveBreakdown;
}

const REQUEST_KEYS = new Set(['overrides', 'seeds', 'maxTurns', 'mapMode', 'stratified']);
const OVERRIDE_SECTION_KEYS = new Set(['terrainYields', 'chassis', 'components', 'factions', 'scenario', 'signatureAbilities']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeEvaluationRequest(input: unknown): BalanceEvaluationRequest {
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
    return { overrides: input as BalanceOverrides };
  }

  for (const key of keys) {
    if (!REQUEST_KEYS.has(key)) {
      throw new Error(`Unknown evaluation request key "${key}"`);
    }
  }

  const request = input as BalanceEvaluationRequest;
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

export function evaluateBalanceRequest(request: BalanceEvaluationRequest): BalanceEvaluationResult {
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
