import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry.js';
import { buildMvpScenario } from '../src/game/buildMvpScenario.js';
import { runWarEcologySimulation, createSimulationTrace } from '../src/systems/warEcologySimulation.js';
import { generateTraceReport, type ReportFocus } from '../src/systems/simulation/traceReport.js';
import type { DifficultyLevel } from '../src/systems/aiDifficulty.js';

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : undefined;
}

function hasFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

if (hasFlag('help') || hasFlag('h')) {
  console.log(`Usage: npx tsx scripts/runScenario.ts [options]

Options:
  --seed <N>           RNG seed (default: 37)
  --turns <N>          Max turns to simulate (default: 50)
  --difficulty <level> AI difficulty: easy|normal|hard (default: normal)
  --focus <type>       Report focus: siege|combat|ai|strategy|research|synergy|full (default: full)
  --factions <ids>     Comma-separated faction IDs to filter
  --turn-range <a-b>   Only show turns a through b (e.g. 20-30)
  --json               Dump raw trace as JSON instead of text report
  --help               Show this help
`);
  process.exit(0);
}

const seed = Number(getArg('seed') ?? 37);
const turns = Number(getArg('turns') ?? 50);
const difficulty = (getArg('difficulty') ?? 'normal') as DifficultyLevel;
const focus = (getArg('focus') ?? 'full') as ReportFocus;
const factionsStr = getArg('factions');
const factions = factionsStr ? factionsStr.split(',') : undefined;
const turnRangeStr = getArg('turn-range');
const turnRange = turnRangeStr ? turnRangeStr.split('-').map(Number) as [number, number] : undefined;
const jsonMode = hasFlag('json');

const registry = loadRulesRegistry();
const state = buildMvpScenario(seed, { registry });
const trace = createSimulationTrace(true);

const finalState = runWarEcologySimulation(state, registry, turns, trace, difficulty);

if (jsonMode) {
  const output: Record<string, unknown> = {
    seed,
    turns,
    difficulty,
    finalRound: finalState.round,
    lines: trace.lines,
    combatEvents: trace.combatEvents,
    siegeEvents: trace.siegeEvents,
    aiIntentEvents: trace.aiIntentEvents,
    factionStrategyEvents: trace.factionStrategyEvents,
    abilityLearnedEvents: trace.abilityLearnedEvents,
    unitSacrificedEvents: trace.unitSacrificedEvents,
    researchEvents: trace.researchEvents,
    domainLearnedEvents: trace.domainLearnedEvents,
    tripleStackEvents: trace.tripleStackEvents,
    synergyPairEvents: trace.synergyPairEvents,
  };
  if (trace.snapshots) output.snapshots = trace.snapshots;
  console.log(JSON.stringify(output, null, 2));
} else {
  const report = generateTraceReport(trace, finalState, { focus, factions, turnRange, seed, turns, difficulty });
  console.log(report);
}
