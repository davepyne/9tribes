import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry.js';
import { buildMvpScenario } from '../src/game/buildMvpScenario.js';
import { runWarEcologySimulation } from '../src/systems/warEcologySimulation.js';
import type { SimulationTrace } from '../src/systems/simulation/traceTypes.js';

const registry = loadRulesRegistry();
const state = buildMvpScenario(37, { registry });
const trace: SimulationTrace = { lines: [], factionStrategyEvents: [] };
const finalState = runWarEcologySimulation(state, registry, 50, trace, 'normal');

// Check ALL intents in final state
for (const [fid, strat] of finalState.factionStrategies) {
  const entries = Object.entries(strat.unitIntents);
  const withSquad = entries.filter(([, i]: [string, any]) => i.squadId);
  if (withSquad.length > 0) {
    console.log(`${fid}: ${withSquad.length}/${entries.length} with squadId`);
    for (const [uid, intent] of withSquad.slice(0, 3)) {
      console.log(`  ${uid}: squadId=${(intent as any).squadId} assignment=${(intent as any).assignment} reason=${(intent as any).reason?.slice(0, 80)}`);
    }
  }
}

// Check coordinator reasons at the squad stamping point
const events = trace.factionStrategyEvents ?? [];
const allReasons = events.flatMap(e => e.reasons);
const rendezvousReasons = allReasons.filter(r => r.includes('rendezvous'));
console.log(`\nRendezvous reasons: ${rendezvousReasons.length}`);
rendezvousReasons.slice(0, 5).forEach(r => console.log(`  ${r}`));

// Active coordinator
const activeCoord = allReasons.filter(r => r.includes('coordinator=active') || r.includes('multi_axis'));
console.log(`\nActive/multi-axis reasons: ${activeCoord.length}`);
activeCoord.slice(0, 5).forEach(r => console.log(`  ${r}`));
