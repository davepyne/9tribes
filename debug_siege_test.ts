import { buildMvpScenario } from './src/game/buildMvpScenario';
import { loadRulesRegistry } from './src/data/loader/loadRulesRegistry';
import { createSimulationTrace, runWarEcologySimulation } from './src/systems/warEcologySimulation';
import { updateFogState } from './src/systems/fogSystem';

const registry = loadRulesRegistry();
let state = buildMvpScenario(42);
const keepFactions = new Set(['hill_clan', 'steppe_clan']);
const keepUnits = new Set(Array.from(state.units.values()).filter(u => keepFactions.has(u.factionId)).map(u => u.id));
const keepCities = new Set(Array.from(state.cities.values()).filter(c => keepFactions.has(c.factionId)).map(c => c.id));
state.factions = new Map(Array.from(state.factions.entries()).filter(([id]) => keepFactions.has(id)));
state.units = new Map(Array.from(state.units.entries()).filter(([id]) => keepUnits.has(id)));
state.cities = new Map(Array.from(state.cities.entries()).filter(([id]) => keepCities.has(id)));
state.villages = new Map();
state.improvements = new Map();
state.economy = new Map(Array.from(state.economy.entries()).filter(([id]) => keepFactions.has(id)));
state.research = new Map(Array.from(state.research.entries()).filter(([id]) => keepFactions.has(id)));
state.warExhaustion = new Map(Array.from(state.warExhaustion.entries()).filter(([id]) => keepFactions.has(id)));
state.factionStrategies = new Map();
for (const [fid, f] of state.factions) {
  state.factions.set(fid, { ...f, unitIds: f.unitIds.filter(id => state.units.has(id)), cityIds: f.cityIds.filter(id => state.cities.has(id)), villageIds: [] });
}

const hillUnitId = state.factions.get('hill_clan')!.unitIds[0];
const supportUnitId = state.factions.get('hill_clan')!.unitIds[1];
const steppeCityId = state.factions.get('steppe_clan')!.cityIds[0];
const steppeUnitId = state.factions.get('steppe_clan')!.unitIds[0];

console.log('BEFORE SIM:');
console.log('  hill unit:', state.units.get(hillUnitId)!.position);
console.log('  support unit:', state.units.get(supportUnitId)!.position);
console.log('  steppe unit:', state.units.get(steppeUnitId)!.position);
console.log('  steppe city:', state.cities.get(steppeCityId)!.position);

state.units.set(hillUnitId, { ...state.units.get(hillUnitId)!, position: { q: 5, r: 5 } });
state.units.set(supportUnitId, { ...state.units.get(supportUnitId)!, position: { q: 6, r: 5 } });
state.units.set(steppeUnitId, { ...state.units.get(steppeUnitId)!, position: { q: 7, r: 5 } });
state.cities.set(steppeCityId, { ...state.cities.get(steppeCityId)!, position: { q: 9, r: 5 } });

state = updateFogState(state, 'hill_clan');
state = updateFogState(state, 'steppe_clan');

console.log('AFTER REPOSITION + FOG UPDATE:');
console.log('  hill unit:', state.units.get(hillUnitId)!.position);

const trace = createSimulationTrace();
const result = runWarEcologySimulation(state, registry, 1, trace);

const movedUnit = result.units.get(hillUnitId);
const supportUnit = result.units.get(supportUnitId);
const steppeUnit = result.units.get(steppeUnitId);
const steppeUnit2 = result.units.get('unit_9');
console.log('\nAFTER SIM:');
console.log('  hill unit alive?', !!movedUnit, 'position:', movedUnit?.position, 'hp:', movedUnit?.hp, 'movesRemaining:', movedUnit?.movesRemaining);
console.log('  hill unit prototype:', result.prototypes.get(movedUnit?.prototypeId ?? '')?.derivedStats);
console.log('  support unit alive?', !!supportUnit, 'position:', supportUnit?.position, 'hp:', supportUnit?.hp);
console.log('  steppe unit alive?', !!steppeUnit, 'position:', steppeUnit?.position, 'hp:', steppeUnit?.hp);
console.log('  steppe unit2 alive?', !!steppeUnit2, 'position:', steppeUnit2?.position, 'hp:', steppeUnit2?.hp);
console.log('  hill_clan units:', result.factions.get('hill_clan')?.unitIds);
console.log('  steppe_clan units:', result.factions.get('steppe_clan')?.unitIds);

console.log('\nALL TRACE LINES:');
for (const line of trace.lines) {
  console.log('  ', line);
}

console.log('\nAI INTENT EVENTS for hillUnit:');
const events = trace.aiIntentEvents?.filter(e => e.unitId === hillUnitId);
console.log('  ', events);

console.log('\nFACTION STRATEGY EVENTS:');
for (const evt of trace.factionStrategyEvents ?? []) {
  console.log('  ', JSON.stringify(evt));
}
