import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry.js';
import { buildMvpScenario } from '../src/game/buildMvpScenario.js';
import { exportReplayBundle } from '../src/replay/exportReplay.js';
import { createSimulationTrace, runWarEcologySimulation } from '../src/systems/warEcologySimulation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outputPath = path.join(repoRoot, 'web', 'public', 'replays', 'mvp-seed-42.json');
const seed = 42;
const maxTurns = 50;

async function main() {
  const registry = loadRulesRegistry();
  const initialState = buildMvpScenario(seed, { registry });
  const trace = createSimulationTrace(true);
  const finalState = runWarEcologySimulation(initialState, registry, maxTurns, trace);
  const bundle = exportReplayBundle(finalState, trace, maxTurns);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(bundle, null, 2) + '\n', 'utf8');

  console.log(`Replay written to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
