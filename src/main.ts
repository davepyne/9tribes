import { buildMvpScenario } from './game/buildMvpScenario.js';
import { loadRulesRegistry } from './data/loader/loadRulesRegistry.js';
import {
  createSimulationTrace,
  runWarEcologySimulation,
  summarizeFaction,
} from './systems/warEcologySimulation.js';
import type { GameMap } from './world/map/types.js';

const SEED = 42;
const MAX_TURNS = 50;

function printMapSummary(map: GameMap) {
  const terrainCounts: Record<string, number> = {};
  for (const [, tile] of map.tiles) {
    terrainCounts[tile.terrain] = (terrainCounts[tile.terrain] || 0) + 1;
  }

  const total = map.tiles.size;
  console.log('\nMap summary');
  console.log(`  Size: ${map.width}x${map.height} (${total} hexes)`);
  for (const [terrain, count] of Object.entries(terrainCounts).sort((a, b) => b[1] - a[1])) {
    const pct = ((count / total) * 100).toFixed(1);
    console.log(`  ${terrain}: ${count} (${pct}%)`);
  }
}

function main() {
  console.log('\n' + '='.repeat(72));
  console.log('WAR-CIV-2 WAR / ECOLOGY SIMULATION');
  console.log('='.repeat(72));
  console.log(`Seed: ${SEED}`);

  const registry = loadRulesRegistry();
  const initialState = buildMvpScenario(SEED, { registry });
  const trace = createSimulationTrace();

  printMapSummary(initialState.map as GameMap);

  console.log('\nInitial factions');
  for (const [factionId] of initialState.factions) {
    console.log(`- ${summarizeFaction(initialState, factionId)}`);
  }

  const finalState = runWarEcologySimulation(initialState, registry, MAX_TURNS, trace);

  console.log('\nTrace highlights');
  for (const line of trace.lines.slice(0, 20)) {
    console.log(`- ${line}`);
  }

  console.log('\nFinal factions');
  for (const [factionId] of finalState.factions) {
    console.log(`- ${summarizeFaction(finalState, factionId)}`);
  }

  console.log('\nSimulation complete\n');
}

main();
