import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry.js';
import {
  DEFAULT_HARNESS_TURNS,
  SMOKE_HARNESS_SEEDS,
  runBalanceHarness,
  runStratifiedBalanceHarness,
} from '../src/systems/balanceHarness.js';
import type { BalanceOverrides } from '../src/balance/types.js';

const registry = loadRulesRegistry();
const mapMode = process.argv.includes('--random') ? 'randomClimateBands' : 'fixed';
const turnsIdx = process.argv.indexOf('--turns');
const maxTurns = turnsIdx !== -1 && process.argv[turnsIdx + 1] ? Number(process.argv[turnsIdx + 1]) : DEFAULT_HARNESS_TURNS;

const widthIdx = process.argv.indexOf('--width');
const heightIdx = process.argv.indexOf('--height');
const overrides: BalanceOverrides | undefined =
  widthIdx !== -1 || heightIdx !== -1
    ? {
        scenario: {
          mapWidth: widthIdx !== -1 ? Number(process.argv[widthIdx + 1]) : undefined,
          mapHeight: heightIdx !== -1 ? Number(process.argv[heightIdx + 1]) : undefined,
        },
      }
    : undefined;

const summary = process.argv.includes('--stratified')
  ? runStratifiedBalanceHarness(registry, maxTurns, mapMode, overrides)
  : runBalanceHarness(registry, SMOKE_HARNESS_SEEDS, maxTurns, mapMode, overrides);

console.log(JSON.stringify(summary, null, 2));
