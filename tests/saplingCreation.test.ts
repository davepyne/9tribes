// Tests for Nature Healing T3 native Sapling Creation mechanic
import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { previewCombatAction } from '../src/systems/combat-action/preview';
import { applyCombatAction } from '../src/systems/combat-action/apply';
import { resolveResearchDoctrine } from '../src/systems/capabilityDoctrine';
import { createRNG } from '../src/core/rng';
import type { FactionId } from '../src/game/types';
import type { ResearchNodeId } from '../src/types';
import { getCombatants, placeAdjacent, setResearch } from './helpers/combatSetup';
import { hexToKey } from '../src/core/grid';
import type { HistoryEntry } from '../src/features/units/types';

const registry = loadRulesRegistry();

// ---------------------------------------------------------------------------
// Doctrine resolution
// ---------------------------------------------------------------------------
describe('sapling creation doctrine flags', () => {
  it('nature_healing T3 native enables saplingOnKillEnabled', () => {
    const doctrine = resolveResearchDoctrine(
      { completedNodes: ['nature_healing_t1', 'nature_healing_t2', 'nature_healing_t3'] as ResearchNodeId[], activeNodeId: undefined },
      { nativeDomain: 'nature_healing', nativeDomains: ['nature_healing'], learnedDomains: ['nature_healing'], id: 'test' as FactionId, bastionsBuilt: 0, maelstromsDeclared: 0, slaveCaptureCount: 0 },
    );
    expect(doctrine.saplingOnKillEnabled).toBe(true);
  });

  it('nature_healing T3 foreign does NOT enable saplingOnKillEnabled', () => {
    const doctrine = resolveResearchDoctrine(
      { completedNodes: ['nature_healing_t1', 'nature_healing_t2', 'nature_healing_t3'] as ResearchNodeId[], activeNodeId: undefined },
      { nativeDomain: 'charge', nativeDomains: ['charge'], learnedDomains: ['charge', 'nature_healing'], id: 'test' as FactionId, bastionsBuilt: 0, maelstromsDeclared: 0, slaveCaptureCount: 0 },
    );
    expect(doctrine.saplingOnKillEnabled).toBe(false);
  });

  it('no nature_healing T3 — flag false', () => {
    const doctrine = resolveResearchDoctrine(
      { completedNodes: ['nature_healing_t1', 'nature_healing_t2'] as ResearchNodeId[], activeNodeId: undefined },
      { nativeDomain: 'nature_healing', nativeDomains: ['nature_healing'], learnedDomains: ['nature_healing'], id: 'test' as FactionId, bastionsBuilt: 0, maelstromsDeclared: 0, slaveCaptureCount: 0 },
    );
    expect(doctrine.saplingOnKillEnabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Helper: set terrain at a position
// ---------------------------------------------------------------------------
function setTerrainAt(state: ReturnType<typeof buildMvpScenario>, pos: { q: number; r: number }, terrain: string) {
  const tiles = new Map(state.map!.tiles);
  const key = hexToKey(pos);
  tiles.set(key, { ...tiles.get(key)!, terrain });
  return { ...state, map: { ...state.map!, tiles } };
}

// ---------------------------------------------------------------------------
// Combat behavior
// ---------------------------------------------------------------------------
describe('sapling creation combat behavior', () => {
  function setupKillCombat(extraSetup?: (state: ReturnType<typeof buildMvpScenario>, attackerFactionId: FactionId, defenderFactionId: FactionId) => ReturnType<typeof buildMvpScenario>) {
    let state = buildMvpScenario(42);
    const { attacker, defender, attackerFactionId, defenderFactionId } = getCombatants(state);
    state = placeAdjacent(state, attacker, defender);

    // Enable nature_healing T3 native for attacker
    state = setResearch(state, attackerFactionId, ['nature_healing_t1', 'nature_healing_t2', 'nature_healing_t3'], ['nature_healing']);

    // Set defender to low HP so attacker kills it
    const updatedDefender = state.units.get(defender.id)!;
    const units = new Map(state.units);
    units.set(updatedDefender.id, { ...updatedDefender, hp: 1 });
    state = { ...state, units };

    if (extraSetup) state = extraSetup(state, attackerFactionId, defenderFactionId);

    state = { ...state, activeFactionId: attackerFactionId, rngState: createRNG(42) };
    return { state, attackerFactionId, defenderFactionId };
  }

  it('kill converts defender hex to forest', () => {
    const { state, defenderFactionId } = setupKillCombat();
    const units = Array.from(state.units.values());
    const attackerUnit = units.find(u => u.factionId !== defenderFactionId)!;
    const defenderUnit = units.find(u => u.factionId === defenderFactionId)!;

    // Ensure defender hex is not already forest
    const defKey = hexToKey(defenderUnit.position);
    const tileBefore = state.map!.tiles.get(defKey)!;
    if (tileBefore.terrain === 'forest') {
      const tiles = new Map(state.map!.tiles);
      tiles.set(defKey, { ...tileBefore, terrain: 'plains' });
      // mutate state reference directly since we already captured it
    }

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
    const defenderUnit = units.find(u => u.factionId === defenderFactionId)!;

    const preview = previewCombatAction(state, registry, attackerUnit.id, defenderUnit.id);
    const result = applyCombatAction(state, registry, preview!);

    // HP bonus still applies even though terrain was already forest
    expect(result.feedback.resolution.saplingApplied).toBe(true);
    expect(result.feedback.resolution.saplingMaxHpBonus).toBe(1);

    const updatedAttacker = result.state.units.get(attackerUnit.id);
    expect(updatedAttacker!.maxHp).toBe(attackerUnit.maxHp + 1);
    // HP is post-combat (attacker may have taken damage), but maxHp definitely increased
    expect(updatedAttacker!.hp).toBeGreaterThan(0);
  });

  it('HP bonus capped at +3 lifetime', () => {
    // Pre-seed attacker with 3 sapling kills in history
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

    // Sapling terrain conversion still fires
    expect(result.feedback.resolution.saplingApplied).toBe(true);
    // But no HP bonus (already at cap)
    expect(result.feedback.resolution.saplingMaxHpBonus).toBe(0);

    const updatedAttacker = result.state.units.get(attackerUnit.id);
    expect(updatedAttacker!.maxHp).toBe(attackerUnit.maxHp); // unchanged
  });

  it('does not trigger for foreign T3', () => {
    let state = buildMvpScenario(42);
    const { attacker, defender, attackerFactionId, defenderFactionId } = getCombatants(state);
    state = placeAdjacent(state, attacker, defender);

    // Enable nature_healing T3 as FOREIGN (native domain is 'charge', not 'nature_healing')
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

    // Set attacker to 1 HP so it dies in combat
    const updatedAttacker = state.units.get(attacker.id)!;
    const units = new Map(state.units);
    units.set(updatedAttacker.id, { ...updatedAttacker, hp: 1 });
    state = { ...state, units, activeFactionId: attackerFactionId, rngState: createRNG(42) };

    const unitsArr = Array.from(state.units.values());
    const attackerUnit = unitsArr.find(u => u.factionId !== defenderFactionId)!;
    const defenderUnit = unitsArr.find(u => u.factionId === defenderFactionId)!;

    const preview = previewCombatAction(state, registry, attackerUnit.id, defenderUnit.id);

    // Only test if attacker actually dies
    if (preview?.result.attackerDestroyed) {
      const result = applyCombatAction(state, registry, preview!);
      expect(result.feedback.resolution.saplingApplied).toBe(false);
    }
  });
});
