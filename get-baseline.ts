import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { runBalanceHarness, SMOKE_HARNESS_SEEDS, DEFAULT_HARNESS_TURNS } from '../src/systems/balanceHarness';

const registry = loadRulesRegistry();
const result = runBalanceHarness(registry, SMOKE_HARNESS_SEEDS, DEFAULT_HARNESS_TURNS);
console.log(JSON.stringify(result, null, 2));