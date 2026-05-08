import { runBalanceHarness } from '../src/systems/balanceHarness.js';
import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry.js';

const registry = loadRulesRegistry();
const result = await runBalanceHarness(registry, [7, 13, 17, 19, 29, 31, 43, 47, 53, 61], 150, 'fixed');

for (const f of result.factions) {
  console.log(
    `${f.factionId.padEnd(16)} units:${f.avgLivingUnits.toFixed(1).padStart(5)}  kills:${f.avgKills.toFixed(1).padStart(5)}  survived:${f.survivedGames}/10  cities:${f.avgCities.toFixed(1)}`
  );
}
