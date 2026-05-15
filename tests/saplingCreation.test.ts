import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { previewCombatAction } from '../src/systems/combat-action/preview';
import { applyCombatAction } from '../src/systems/combat-action/apply';
import { resolveResearchDoctrine } from '../src/systems/capabilityDoctrine';
import { createRNG } from '../src/core/rng';
import type { FactionId } from '../src/game/types';
import type { ResearchNodeId } from '../src/types';
import { fakeFaction, getCombatants, placeAdjacent, setResearch } from './helpers/combatSetup';
import { hexToKey } from '../src/core/grid';
import { setTerrainAt } from '../src/systems/terrainMutationSystem';
import type { HistoryEntry } from '../src/features/units/types';

const registry = loadRulesRegistry();

describe('sapling creation doctrine flags', () => {
  it('nature_healing T3 native enables saplingOnKillEnabled', () => {
    const doctrine = resolveResearchDoctrine(
      { completedNodes: ['nature_healing_t1', 'nature_healing_t2', 'nature_healing_t3'] as ResearchNodeId[], activeNodeId: undefined },
      fakeFaction(['nature_healing']),
    );
    expect(doctrine.saplingOnKillEnabled).toBe(true);
  });

  it('nature_healing T3 foreign does NOT enable saplingOnKillEnabled', () => {
    const doctrine = resolveResearchDoctrine(
      { completedNodes: ['nature_healing_t1', 'nature_healing_t2', 'nature_healing_t3'] as ResearchNodeId[], activeNodeId: undefined },
      fakeFaction(['charge']),
    );
    expect(doctrine.saplingOnKillEnabled).toBe(false);
  });

  it('no nature_healing T3 — flag false', () => {
    const doctrine = resolveResearchDoctrine(
      { completedNodes: ['nature_healing_t1', 'nature_healing_t2'] as ResearchNodeId[], activeNodeId: undefined },
      fakeFaction(['nature_healing']),
    );
    expect(doctrine.saplingOnKillEnabled).toBe(false);
  });
});

describe('sapling creation combat behavior', () => {
  function setupKillCombat(extraSetup?: (state: ReturnType<typeof buildMvpScenario>, attackerFactionId: FactionId, defenderFactionId: FactionId) => ReturnType<typeof buildMvpScenario>) {
    let state = buildMvpScenario(42);
    const { attacker, defender, attackerFactionId, defenderFactionId } = getCombatants(state);
    state = placeAdjacent(state, attacker, defender);

    state = setResearch(state, attackerFactionId, ['nature_healing_t1', 'nature_healing_t2', 'nature_healing_t3'], ['nature_healing']);

    const updatedDefender = state.units.get(defender.id)!;
    const units = new Map(state.units);
    units.set(updatedDefender.id, { ...updatedDefender, hp: 1 });
    state = { ...state, units };

    if (extraSetup) state = extraSetup(state, attackerFactionId, defenderFactionId);

    state = { ...state, activeFactionId: attackerFactionId, rngState: createRNG(42) };
    return { state, attackerFactionId, defenderFactionId };
  }

  it('kill converts defender hex to forest', () => {
    const { state, defenderFactionId } = setupKillCombat((s, _afid, dfid) => {
      const units = Array.from(s.units.values());
      const defenderUnit = units.find(u => u.factionId === dfid)!;
      const defKey = hexToKey(defenderUnit.position);
      const tile = s.map!.tiles.get(defKey)!;
      if (tile.terrain === 'forest') {
        return setTerrainAt(s, defenderUnit.position, 'plains');
      }
      return s;
    });
    const units = Array.from(state.units.values());
    const attackerUnit = units.find(u => u.factionId !== defenderFactionId)!;
    const defenderUnit = units.find(u => u.factionId === defenderFactionId)!;

    const defKey = hexToKey(defenderUnit.position);
    expect(state.map!.tiles.get(defKey)!.terrain).not.toBe('forest');

    const preview = previewCombatAction(state, registry, attackerUnit.id, defenderUnit.id);
    expect(preview).not.toBeNull();
    expect(preview!.result.defenderDestroyed).toBe(true);

    const result = applyCombatAction(state, registry, preview!);
    const tileAfter = result.state.map!.tiles.get(defKey);
    expect(tileAfter!.terrain).toBe('forest');
    expect(result.feedback.resolution.saplingApplied).toBe(true);
  });

  it('kill on already-forest hex still grants HP bonus', () => {
    const { state, defenderFactionId } = setupKillCombat((s, _afid, dfid) => {
      const units = Array.from(s.units.values());
      const defenderUnit = units.find(u => u.factionId === dfid)!;
      return setTerrainAt(s, defenderUnit.position, 'forest');
    });

    const units = Array.from(state.units.values());
    const attackerUnit = units.find(u => u.factionId !== defenderFactionId)!;

    const preview = previewCombatAction(state, registry, attackerUnit.id, units.find(u => u.factionId === defenderFactionId)!.id);
    const result = applyCombatAction(state, registry, preview!);

    expect(result.feedback.resolution.saplingApplied).toBe(true);
    expect(result.feedback.resolution.saplingMaxHpBonus).toBe(1);

    const updatedAttacker = result.state.units.get(attackerUnit.id);
    expect(updatedAttacker!.maxHp).toBe(attackerUnit.maxHp + 1);
    expect(updatedAttacker!.hp).toBeGreaterThan(0);
  });

  it('HP bonus capped at +3 lifetime', () => {
    const { state, defenderFactionId } = setupKillCombat((s, afid, _dfid) => {
      const units = new Map(s.units);
      const attacker = Array.from(units.values()).find(u => u.factionId === afid)!;
      const saplingKills: HistoryEntry[] = [
        { type: 'sapling_kill', timestamp: 0, details: {} },
        { type: 'sapling_kill', timestamp: 1, details: {} },
        { type: 'sapling_kill', timestamp: 2, details: {} },
      ];
      units.set(attacker.id, { ...attacker, history: [...attacker.history, ...saplingKills] });
      return { ...s, units };
    });

    const units = Array.from(state.units.values());
    const attackerUnit = units.find(u => u.factionId !== defenderFactionId)!;
    const defenderUnit = units.find(u => u.factionId === defenderFactionId)!;

    const preview = previewCombatAction(state, registry, attackerUnit.id, defenderUnit.id);
    const result = applyCombatAction(state, registry, preview!);

    expect(result.feedback.resolution.saplingApplied).toBe(true);
    expect(result.feedback.resolution.saplingMaxHpBonus).toBe(0);

    const updatedAttacker = result.state.units.get(attackerUnit.id);
    expect(updatedAttacker!.maxHp).toBe(attackerUnit.maxHp);
  });

  it('does not trigger for foreign T3', () => {
    let state = buildMvpScenario(42);
    const { attacker, defender, attackerFactionId, defenderFactionId } = getCombatants(state);
    state = placeAdjacent(state, attacker, defender);

    state = setResearch(state, attackerFactionId, ['nature_healing_t1', 'nature_healing_t2', 'nature_healing_t3'], ['charge']);

    const updatedDefender = state.units.get(defender.id)!;
    const units = new Map(state.units);
    units.set(updatedDefender.id, { ...updatedDefender, hp: 1 });
    state = { ...state, units, activeFactionId: attackerFactionId, rngState: createRNG(42) };

    const unitsArr = Array.from(state.units.values());
    const attackerUnit = unitsArr.find(u => u.factionId !== defenderFactionId)!;
    const defenderUnit = unitsArr.find(u => u.factionId === defenderFactionId)!;

    const preview = previewCombatAction(state, registry, attackerUnit.id, defenderUnit.id);
    const result = applyCombatAction(state, registry, preview!);

    expect(result.feedback.resolution.saplingApplied).toBe(false);
    expect(result.feedback.resolution.saplingMaxHpBonus).toBe(0);
  });

  it('does not trigger when attacker dies', () => {
    let state = buildMvpScenario(42);
    const { attacker, defender, attackerFactionId, defenderFactionId } = getCombatants(state);
    state = placeAdjacent(state, attacker, defender);

    state = setResearch(state, attackerFactionId, ['nature_healing_t1', 'nature_healing_t2', 'nature_healing_t3'], ['nature_healing']);

    const updatedAttacker = state.units.get(attacker.id)!;
    const units = new Map(state.units);
    units.set(updatedAttacker.id, { ...updatedAttacker, hp: 1 });
    state = { ...state, units, activeFactionId: attackerFactionId, rngState: createRNG(42) };

    const unitsArr = Array.from(state.units.values());
    const attackerUnit = unitsArr.find(u => u.factionId !== defenderFactionId)!;
    const defenderUnit = unitsArr.find(u => u.factionId === defenderFactionId)!;

    const preview = previewCombatAction(state, registry, attackerUnit.id, defenderUnit.id);

    if (preview?.result.attackerDestroyed) {
      const result = applyCombatAction(state, registry, preview!);
      expect(result.feedback.resolution.saplingApplied).toBe(false);
    }
  });
});
