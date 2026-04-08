import { buildMvpScenario } from './src/game/buildMvpScenario';
import { computeFactionStrategy } from './src/systems/strategicAi';
import { loadRegistry } from './src/data/registry/loadRegistry';
import { updateFogState } from './src/systems/fogSystem';
import type { FactionId } from './src/types';

function trimState(state: ReturnType<typeof buildMvpScenario>, factionIds: string[]) {
  for (const [id, f] of state.factions) {
    if (!factionIds.includes(id)) {
      for (const uid of f.unitIds) state.units.delete(uid);
      for (const cid of f.cityIds) state.cities.delete(cid);
      state.factions.delete(id);
    }
  }
}

async function main() {
  const registry = await loadRegistry();
  const state = buildMvpScenario(42);
  trimState(state, ['hill_clan', 'steppe_clan']);

  const hillId = 'hill_clan' as FactionId;
  const steppeId = 'steppe_clan' as FactionId;
  const hillUnitId = state.factions.get(hillId)!.unitIds[0];
  const supportUnitId = state.factions.get(hillId)!.unitIds[1];
  const steppeCityId = state.factions.get(steppeId)!.cityIds[0];
  const steppeUnitId = state.factions.get(steppeId)!.unitIds[0];

  state.units.set(hillUnitId, { ...state.units.get(hillUnitId)!, position: { q: 5, r: 5 } });
  state.units.set(supportUnitId, { ...state.units.get(supportUnitId)!, position: { q: 6, r: 5 } });
  state.units.set(steppeUnitId, { ...state.units.get(steppeUnitId)!, position: { q: 7, r: 5 } });
  state.cities.set(steppeCityId, { ...state.cities.get(steppeCityId)!, position: { q: 9, r: 5 } });

  // Update fog first (like the simulation does)
  let current = state;
  current = updateFogState(current, hillId);

  const strategy = computeFactionStrategy(current, hillId, registry);
  console.log('=== SIEGE TEST DEBUG ===');
  console.log('Posture:', strategy.posture);
  console.log('Fronts:', JSON.stringify(strategy.fronts));
  console.log('Threatened cities:', JSON.stringify(strategy.threatenedCities));
  console.log('Primary city objective:', strategy.primaryCityObjectiveId);
  console.log('Focus targets:', strategy.focusTargetUnitIds);
  console.log('Hill unit intent:', JSON.stringify(strategy.unitIntents[hillUnitId], null, 2));
  console.log('Support unit intent:', JSON.stringify(strategy.unitIntents[supportUnitId], null, 2));
  console.log('Exhaustion:', JSON.stringify(state.warExhaustion.get(hillId)));

  // Check fog visibility of enemy
  const fog = current.fogStates.get(hillId);
  const enemyKey = `7,5`;
  console.log('Fog at enemy pos:', fog?.hexVisibility.get(enemyKey));
  console.log('Hill unit learned abilities:', state.units.get(hillUnitId)?.learnedAbilities);
  console.log('Hill unit veteran level:', state.units.get(hillUnitId)?.veteranLevel);
}

main().catch(e => console.error(e));
