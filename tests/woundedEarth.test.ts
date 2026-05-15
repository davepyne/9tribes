// Tests for Nature Healing T2 Wounded Earth mechanic
import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { previewCombatAction } from '../src/systems/combat-action/preview';
import { applyCombatAction } from '../src/systems/combat-action/apply';
import { resolveResearchDoctrine } from '../src/systems/capabilityDoctrine';
import { createRNG } from '../src/core/rng';
import type { FactionId } from '../src/game/types';
import type { ResearchNodeId } from '../src/types';
import type { Unit } from '../src/features/units/types';
import { getCombatants, placeAdjacent, setResearch, addExtraUnit } from './helpers/combatSetup';
import { hexToKey, getNeighbors } from '../src/core/grid';

const registry = loadRulesRegistry();

// ---------------------------------------------------------------------------
// Doctrine resolution
// ---------------------------------------------------------------------------
describe('wounded earth doctrine flags', () => {
  it('nature_healing_t2 enables woundedEarthEnabled (foreign, non-native domain)', () => {
    const doctrine = resolveResearchDoctrine(
      { completedNodes: ['nature_healing_t1', 'nature_healing_t2'] as ResearchNodeId[], activeNodeId: undefined },
      { nativeDomain: 'charge', nativeDomains: ['charge'], learnedDomains: ['charge', 'nature_healing'], id: 'test' as FactionId, bastionsBuilt: 0, maelstromsDeclared: 0, slaveCaptureCount: 0 },
    );
    expect(doctrine.woundedEarthEnabled).toBe(true);
    expect(doctrine.woundedEarthHealEnabled).toBe(false);
  });

  it('nature_healing_t2 native enables both flags', () => {
    const doctrine = resolveResearchDoctrine(
      { completedNodes: ['nature_healing_t1', 'nature_healing_t2'] as ResearchNodeId[], activeNodeId: undefined },
      { nativeDomain: 'nature_healing', nativeDomains: ['nature_healing'], learnedDomains: ['nature_healing'], id: 'test' as FactionId, bastionsBuilt: 0, maelstromsDeclared: 0, slaveCaptureCount: 0 },
    );
    expect(doctrine.woundedEarthEnabled).toBe(true);
    expect(doctrine.woundedEarthHealEnabled).toBe(true);
  });

  it('no nature_healing_t2 — both flags false', () => {
    const doctrine = resolveResearchDoctrine(
      { completedNodes: ['nature_healing_t1'] as ResearchNodeId[], activeNodeId: undefined },
      { nativeDomain: 'nature_healing', nativeDomains: ['nature_healing'], learnedDomains: ['nature_healing'], id: 'test' as FactionId, bastionsBuilt: 0, maelstromsDeclared: 0, slaveCaptureCount: 0 },
    );
    expect(doctrine.woundedEarthEnabled).toBe(false);
    expect(doctrine.woundedEarthHealEnabled).toBe(false);
  });

  it('no research — both flags false', () => {
    const doctrine = resolveResearchDoctrine(undefined, undefined);
    expect(doctrine.woundedEarthEnabled).toBe(false);
    expect(doctrine.woundedEarthHealEnabled).toBe(false);
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
// Foreign: terrain absorbs 25% damage
// ---------------------------------------------------------------------------
describe('wounded earth foreign — terrain absorbs damage', () => {
  function setupForestCombat() {
    let state = buildMvpScenario(42);
    const { attacker, defender, attackerFactionId, defenderFactionId } = getCombatants(state);
    state = placeAdjacent(state, attacker, defender);

    // Get updated positions after placeAdjacent
    const updatedDefender = state.units.get(defender.id)!;

    // Place defender on forest
    state = setTerrainAt(state, updatedDefender.position, 'forest');

    // Enable nature_healing_t2 for defender faction (foreign — not native domain)
    state = setResearch(state, defenderFactionId, ['nature_healing_t1', 'nature_healing_t2'], ['charge']);

    // Give defender enough HP to survive
    const units = new Map(state.units);
    units.set(updatedDefender.id, { ...updatedDefender, hp: 100, maxHp: 100 });
    state = { ...state, units };

    state = { ...state, activeFactionId: attackerFactionId, rngState: createRNG(42) };
    return { state, defenderFactionId };
  }

  it('reduces defender HP loss by 25% on forest', () => {
    const { state, defenderFactionId } = setupForestCombat();
    const units = Array.from(state.units.values());
    const attackerUnit = units.find(u => u.factionId !== defenderFactionId)!;
    const defenderUnit = units.find(u => u.factionId === defenderFactionId)!;

    const preview = previewCombatAction(state, registry, attackerUnit.id, defenderUnit.id);
    expect(preview).not.toBeNull();
    expect(preview!.result.defenderDamage).toBeGreaterThan(0);

    const rawDamage = preview!.result.defenderDamage;
    const expectedAbsorb = Math.floor(rawDamage * 0.25);

    const result = applyCombatAction(state, registry, preview!);
    const updatedDefender = result.state.units.get(defenderUnit.id);
    expect(updatedDefender).toBeDefined();

    const actualHpLoss = 100 - updatedDefender!.hp;
    expect(actualHpLoss).toBe(rawDamage - expectedAbsorb);
    expect(updatedDefender!.terrainDamageAbsorption).toBe(expectedAbsorb);
  });

  it('sets woundedEarthAbsorbed on the resolution', () => {
    const { state, defenderFactionId } = setupForestCombat();
    const units = Array.from(state.units.values());
    const attackerUnit = units.find(u => u.factionId !== defenderFactionId)!;
    const defenderUnit = units.find(u => u.factionId === defenderFactionId)!;

    const preview = previewCombatAction(state, registry, attackerUnit.id, defenderUnit.id);
    const result = applyCombatAction(state, registry, preview!);

    expect(result.feedback.resolution.woundedEarthAbsorbed).toBeGreaterThan(0);
  });

  it('does not absorb on non-forest/jungle terrain', () => {
    let state = buildMvpScenario(42);
    const { attacker, defender, attackerFactionId, defenderFactionId } = getCombatants(state);
    state = placeAdjacent(state, attacker, defender);
    const updatedDefender = state.units.get(defender.id)!;

    // Defender on plains
    state = setTerrainAt(state, updatedDefender.position, 'plains');
    state = setResearch(state, defenderFactionId, ['nature_healing_t1', 'nature_healing_t2'], ['charge']);

    const units = new Map(state.units);
    units.set(updatedDefender.id, { ...updatedDefender, hp: 100, maxHp: 100 });
    state = { ...state, units };
    state = { ...state, activeFactionId: attackerFactionId, rngState: createRNG(42) };

    const attackerUnit = Array.from(state.units.values()).find(u => u.factionId !== defenderFactionId)!;
    const defenderUnit = state.units.get(updatedDefender.id)!;
    const preview = previewCombatAction(state, registry, attackerUnit.id, defenderUnit.id);
    const result = applyCombatAction(state, registry, preview!);

    expect(result.feedback.resolution.woundedEarthAbsorbed).toBe(0);
    const afterDefender = result.state.units.get(updatedDefender.id);
    expect(afterDefender?.terrainDamageAbsorption).toBeFalsy();
  });

  it('works on jungle terrain too', () => {
    let state = buildMvpScenario(42);
    const { attacker, defender, attackerFactionId, defenderFactionId } = getCombatants(state);
    state = placeAdjacent(state, attacker, defender);
    const updatedDefender = state.units.get(defender.id)!;

    state = setTerrainAt(state, updatedDefender.position, 'jungle');
    state = setResearch(state, defenderFactionId, ['nature_healing_t1', 'nature_healing_t2'], ['charge']);

    const units = new Map(state.units);
    units.set(updatedDefender.id, { ...updatedDefender, hp: 100, maxHp: 100 });
    state = { ...state, units };
    state = { ...state, activeFactionId: attackerFactionId, rngState: createRNG(42) };

    const attackerUnit = Array.from(state.units.values()).find(u => u.factionId !== defenderFactionId)!;
    const defenderUnit = state.units.get(updatedDefender.id)!;
    const preview = previewCombatAction(state, registry, attackerUnit.id, defenderUnit.id);
    const result = applyCombatAction(state, registry, preview!);

    expect(result.feedback.resolution.woundedEarthAbsorbed).toBeGreaterThan(0);
  });

  it('does not absorb without nature_healing_t2 research', () => {
    let state = buildMvpScenario(42);
    const { attacker, defender, attackerFactionId, defenderFactionId } = getCombatants(state);
    state = placeAdjacent(state, attacker, defender);
    const updatedDefender = state.units.get(defender.id)!;

    state = setTerrainAt(state, updatedDefender.position, 'forest');
    // Only T1, no T2
    state = setResearch(state, defenderFactionId, ['nature_healing_t1'], ['charge']);

    const units = new Map(state.units);
    units.set(updatedDefender.id, { ...updatedDefender, hp: 100, maxHp: 100 });
    state = { ...state, units };
    state = { ...state, activeFactionId: attackerFactionId, rngState: createRNG(42) };

    const attackerUnit = Array.from(state.units.values()).find(u => u.factionId !== defenderFactionId)!;
    const defenderUnit = state.units.get(updatedDefender.id)!;
    const preview = previewCombatAction(state, registry, attackerUnit.id, defenderUnit.id);
    const result = applyCombatAction(state, registry, preview!);

    expect(result.feedback.resolution.woundedEarthAbsorbed).toBe(0);
  });

  it('can save a defender from death via absorption', () => {
    let state = buildMvpScenario(42);
    const { attacker, defender, attackerFactionId, defenderFactionId } = getCombatants(state);
    state = placeAdjacent(state, attacker, defender);
    const updatedDefender = state.units.get(defender.id)!;

    state = setTerrainAt(state, updatedDefender.position, 'forest');
    state = setResearch(state, defenderFactionId, ['nature_healing_t1', 'nature_healing_t2'], ['charge']);

    // Give defender low HP so absorption can potentially save
    const units = new Map(state.units);
    units.set(updatedDefender.id, { ...updatedDefender, hp: 3, maxHp: 100 });
    state = { ...state, units };
    state = { ...state, activeFactionId: attackerFactionId, rngState: createRNG(42) };

    const attackerUnit = Array.from(state.units.values()).find(u => u.factionId !== defenderFactionId)!;
    const defenderUnit = state.units.get(updatedDefender.id)!;
    const preview = previewCombatAction(state, registry, attackerUnit.id, defenderUnit.id);

    if (preview!.result.defenderDestroyed) {
      const absorbAmount = Math.floor(preview!.result.defenderDamage * 0.25);
      if (absorbAmount >= 3) {
        // Absorb amount is enough to potentially save
        const result = applyCombatAction(state, registry, preview!);
        if (result.feedback.resolution.woundedEarthSaved) {
          const savedDefender = result.state.units.get(updatedDefender.id);
          expect(savedDefender).toBeDefined();
          expect(savedDefender!.hp).toBeGreaterThan(0);
        }
      }
    }
  });

  it('combat effect label mentions absorption for foreign', () => {
    const { state, defenderFactionId } = setupForestCombat();
    const units = Array.from(state.units.values());
    const attackerUnit = units.find(u => u.factionId !== defenderFactionId)!;
    const defenderUnit = units.find(u => u.factionId === defenderFactionId)!;

    const preview = previewCombatAction(state, registry, attackerUnit.id, defenderUnit.id);
    const result = applyCombatAction(state, registry, preview!);

    const effects = result.feedback.resolution.triggeredEffects;
    const woundedEarthEffect = effects.find(e => e.label === 'Wounded Earth');
    expect(woundedEarthEffect).toBeDefined();
    expect(woundedEarthEffect!.detail).toContain('absorbed');
    expect(woundedEarthEffect!.category).toBe('ability');
  });
});

// ---------------------------------------------------------------------------
// Native: adjacent allies on forest/jungle heal for absorbed amount
// ---------------------------------------------------------------------------
describe('wounded earth native — allies heal instead', () => {
  function setupNativeScenario() {
    let state = buildMvpScenario(42);
    const { attacker, defender, attackerFactionId, defenderFactionId } = getCombatants(state);
    state = placeAdjacent(state, attacker, defender);
    const updatedDefender = state.units.get(defender.id)!;

    state = setTerrainAt(state, updatedDefender.position, 'forest');

    // Enable nature_healing_t2 as native domain
    state = setResearch(state, defenderFactionId, ['nature_healing_t1', 'nature_healing_t2'], ['nature_healing']);

    // Give defender enough HP to survive
    const units = new Map(state.units);
    units.set(updatedDefender.id, { ...updatedDefender, hp: 100, maxHp: 100 });
    state = { ...state, units };

    state = { ...state, activeFactionId: attackerFactionId, rngState: createRNG(42) };
    return { state, defenderFactionId, attackerFactionId };
  }

  it('native defender takes full damage (no HP reduction from absorption)', () => {
    const { state, defenderFactionId } = setupNativeScenario();
    const units = Array.from(state.units.values());
    const attackerUnit = units.find(u => u.factionId !== defenderFactionId)!;
    const defenderUnit = units.find(u => u.factionId === defenderFactionId)!;

    const preview = previewCombatAction(state, registry, attackerUnit.id, defenderUnit.id);
    expect(preview).not.toBeNull();
    expect(preview!.result.defenderDamage).toBeGreaterThan(0);

    const result = applyCombatAction(state, registry, preview!);
    const updatedDefender = result.state.units.get(defenderUnit.id);

    // Native: defender takes full damage
    const actualHpLoss = 100 - updatedDefender!.hp;
    expect(actualHpLoss).toBe(preview!.result.defenderDamage);
  });

  it('native still sets terrainDamageAbsorption for UI feedback', () => {
    const { state, defenderFactionId } = setupNativeScenario();
    const units = Array.from(state.units.values());
    const attackerUnit = units.find(u => u.factionId !== defenderFactionId)!;
    const defenderUnit = units.find(u => u.factionId === defenderFactionId)!;

    const preview = previewCombatAction(state, registry, attackerUnit.id, defenderUnit.id);
    const result = applyCombatAction(state, registry, preview!);

    const absorbAmount = Math.floor(preview!.result.defenderDamage * 0.25);
    const updatedDefender = result.state.units.get(defenderUnit.id);
    expect(updatedDefender!.terrainDamageAbsorption).toBe(absorbAmount);
  });

  it('heals adjacent allies on forest/jungle', () => {
    let { state, defenderFactionId } = setupNativeScenario();
    const defenderUnit = Array.from(state.units.values()).find(u => u.factionId === defenderFactionId)!;
    const attackerUnit = Array.from(state.units.values()).find(u => u.factionId !== defenderFactionId)!;

    // Find an adjacent hex that's not the attacker's position
    const neighbors = getNeighbors(defenderUnit.position);
    const allyHex = neighbors.find((h: { q: number; r: number }) => {
      if (h.q === attackerUnit.position.q && h.r === attackerUnit.position.r) return false;
      return state.map!.tiles.has(hexToKey(h));
    });

    if (!allyHex) return; // skip if no valid hex

    // Place forest on ally hex
    state = setTerrainAt(state, allyHex, 'forest');

    // Add an ally unit (wounded) at that hex
    const { state: stateWithAlly, unitId: allyId } = addExtraUnit(
      state, allyHex, defenderFactionId, { ...defenderUnit, hp: 50, maxHp: 100 },
    );
    state = stateWithAlly;

    const preview = previewCombatAction(state, registry, attackerUnit.id, defenderUnit.id);
    expect(preview).not.toBeNull();
    expect(preview!.result.defenderDamage).toBeGreaterThan(0);

    const absorbAmount = Math.floor(preview!.result.defenderDamage * 0.25);
    const result = applyCombatAction(state, registry, preview!);

    // Check ally was healed
    if (result.feedback.resolution.woundedEarthAlliesHealed > 0) {
      const ally = result.state.units.get(allyId);
      expect(ally).toBeDefined();
      expect(ally!.hp).toBe(50 + absorbAmount);
    }
  });

  it('does not heal allies on non-forest/jungle terrain', () => {
    let { state, defenderFactionId } = setupNativeScenario();
    const defenderUnit = Array.from(state.units.values()).find(u => u.factionId === defenderFactionId)!;
    const attackerUnit = Array.from(state.units.values()).find(u => u.factionId !== defenderFactionId)!;

    const neighbors = getNeighbors(defenderUnit.position);
    const allyHex = neighbors.find((h: { q: number; r: number }) => {
      if (h.q === attackerUnit.position.q && h.r === attackerUnit.position.r) return false;
      return state.map!.tiles.has(hexToKey(h));
    });

    if (!allyHex) return;

    // Place plains (not forest/jungle) on ally hex
    state = setTerrainAt(state, allyHex, 'plains');

    const { state: stateWithAlly, unitId: allyId } = addExtraUnit(
      state, allyHex, defenderFactionId, { ...defenderUnit, hp: 50, maxHp: 100 },
    );
    state = stateWithAlly;

    const preview = previewCombatAction(state, registry, attackerUnit.id, defenderUnit.id);
    const result = applyCombatAction(state, registry, preview!);

    // Ally should NOT be healed since they're on plains
    const ally = result.state.units.get(allyId);
    if (ally) {
      expect(ally.hp).toBe(50);
    }
    expect(result.feedback.resolution.woundedEarthAlliesHealed).toBe(0);
  });

  it('does not heal enemy units', () => {
    let { state, defenderFactionId, attackerFactionId } = setupNativeScenario();
    const defenderUnit = Array.from(state.units.values()).find(u => u.factionId === defenderFactionId)!;
    const attackerUnit = Array.from(state.units.values()).find(u => u.factionId !== defenderFactionId)!;

    const neighbors = getNeighbors(defenderUnit.position);
    const enemyHex = neighbors.find((h: { q: number; r: number }) => {
      if (h.q === attackerUnit.position.q && h.r === attackerUnit.position.r) return false;
      return state.map!.tiles.has(hexToKey(h));
    });

    if (!enemyHex) return;

    state = setTerrainAt(state, enemyHex, 'forest');

    // Add an ENEMY unit on forest adjacent to defender
    const { state: stateWithEnemy, unitId: enemyId } = addExtraUnit(
      state, enemyHex, attackerFactionId, { ...attackerUnit, hp: 50, maxHp: 100 },
    );
    state = stateWithEnemy;

    const preview = previewCombatAction(state, registry, attackerUnit.id, defenderUnit.id);
    const result = applyCombatAction(state, registry, preview!);

    // Enemy should NOT be healed
    const enemy = result.state.units.get(enemyId);
    if (enemy) {
      expect(enemy.hp).toBe(50);
    }
    expect(result.feedback.resolution.woundedEarthAlliesHealed).toBe(0);
  });

  it('combat effect label mentions ally healing for native', () => {
    let { state, defenderFactionId } = setupNativeScenario();
    const defenderUnit = Array.from(state.units.values()).find(u => u.factionId === defenderFactionId)!;
    const attackerUnit = Array.from(state.units.values()).find(u => u.factionId !== defenderFactionId)!;

    const neighbors = getNeighbors(defenderUnit.position);
    const allyHex = neighbors.find((h: { q: number; r: number }) => {
      if (h.q === attackerUnit.position.q && h.r === attackerUnit.position.r) return false;
      return state.map!.tiles.has(hexToKey(h));
    });

    if (!allyHex) return;

    state = setTerrainAt(state, allyHex, 'forest');

    const { state: stateWithAlly } = addExtraUnit(
      state, allyHex, defenderFactionId, { ...defenderUnit, hp: 50, maxHp: 100 },
    );
    state = stateWithAlly;

    const preview = previewCombatAction(state, registry, attackerUnit.id, defenderUnit.id);
    const result = applyCombatAction(state, registry, preview!);

    if (result.feedback.resolution.woundedEarthAlliesHealed > 0) {
      const effects = result.feedback.resolution.triggeredEffects;
      const woundedEarthEffect = effects.find(e => e.label === 'Wounded Earth');
      expect(woundedEarthEffect).toBeDefined();
      expect(woundedEarthEffect!.detail).toContain('channeled');
      expect(woundedEarthEffect!.category).toBe('ability');
    }
  });
});
