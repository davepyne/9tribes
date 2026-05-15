import { describe, it, expect } from 'vitest';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { detectAndSpawnToxicBlooms, cleanseToxicBlooms } from '../src/systems/toxicBloomSystem';
import { tickZoneEffectLifetimes, addZoneEffect } from '../src/systems/zoneEffectSystem';
import { applyEnvironmentalDamage } from '../src/systems/simulation/environmentalEffects';
import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { createResearchState } from '../src/systems/researchSystem';
import { previewCombatAction } from '../src/systems/combat-action/preview';
import { applyCombatAction } from '../src/systems/combat-action/apply';
import type { GameState, Unit, ZoneEffect } from '../src/game/types';
import type { FactionId, UnitId } from '../src/types';
import { hexToKey } from '../src/core/grid';
import { createUnitId, createZoneEffectId } from '../src/core/ids';

const registry = loadRulesRegistry();

function addResearchNodes(state: GameState, factionId: string, nodes: string[]) {
  let research = state.research.get(factionId as never);
  if (!research) {
    research = createResearchState(factionId as never);
    state.research.set(factionId as never, research);
  }
  const newNodes = nodes.filter((n) => !research!.completedNodes.includes(n as never));
  if (newNodes.length > 0) {
    research.completedNodes = [...research.completedNodes, ...(newNodes as never[])];
  }
}

// Replace the live units map and detach every faction from its units so we
// can place exactly the poisoned units we want at known coordinates without
// MVP-scenario noise interfering with adjacency math.
function clearUnits(state: GameState): GameState {
  for (const faction of state.factions.values()) {
    faction.unitIds = [];
  }
  state.units = new Map();
  return state;
}

function placePoisonedUnit(
  state: GameState,
  factionId: FactionId,
  position: { q: number; r: number },
): UnitId {
  // Reuse an existing prototype from this faction so combat/heal queries can
  // resolve it. Default to whatever prototype the faction has registered.
  const faction = state.factions.get(factionId)!;
  const protoId = faction.prototypeIds[0];
  const unitId = createUnitId();
  const unit: Unit = {
    id: unitId,
    factionId,
    position,
    facing: 0,
    hp: 10,
    maxHp: 10,
    movesRemaining: 2,
    maxMoves: 2,
    attacksRemaining: 1,
    xp: 0,
    veteranLevel: 'green',
    status: 'ready',
    prototypeId: protoId,
    history: [],
    morale: 100,
    routed: false,
    poisoned: true,
    poisonStacks: 1,
    poisonTurnsRemaining: 3,
    enteredZoCThisActivation: false,
    isStealthed: false,
    turnsSinceStealthBreak: 0,
    learnedAbilities: [],
  };
  state.units.set(unitId, unit);
  faction.unitIds = [...faction.unitIds, unitId];
  return unitId;
}

function placeHealthyUnit(
  state: GameState,
  factionId: FactionId,
  position: { q: number; r: number },
): UnitId {
  const faction = state.factions.get(factionId)!;
  const protoId = faction.prototypeIds[0];
  const unitId = createUnitId();
  const unit: Unit = {
    id: unitId,
    factionId,
    position,
    facing: 0,
    hp: 10,
    maxHp: 10,
    movesRemaining: 2,
    maxMoves: 2,
    attacksRemaining: 1,
    xp: 0,
    veteranLevel: 'green',
    status: 'ready',
    prototypeId: protoId,
    history: [],
    morale: 100,
    routed: false,
    poisoned: false,
    poisonStacks: 0,
    poisonTurnsRemaining: 0,
    enteredZoCThisActivation: false,
    isStealthed: false,
    turnsSinceStealthBreak: 0,
    learnedAbilities: [],
  };
  state.units.set(unitId, unit);
  faction.unitIds = [...faction.unitIds, unitId];
  // Make sure terrain at the hex won't deal attrition damage in the
  // damage-test path.
  if (state.map) {
    state.map.tiles.set(hexToKey(position), { position, terrain: 'plains' });
  }
  return unitId;
}

const JUNGLE = 'jungle_clan' as FactionId; // nativeDomain = venom
const SAVANNAH = 'savannah_lions' as FactionId; // nativeDomain = charge (foreign venom target)

describe('toxic bloom — spawn detection', () => {
  it('spawns a Bloom when 3+ poisoned units cluster adjacent to a hex', () => {
    let state = buildMvpScenario(42);
    state = clearUnits(state);
    addResearchNodes(state, JUNGLE, ['venom_t1', 'venom_t2', 'venom_t3']);

    // Place 3 poisoned units around (0,0). Hex (0,0)'s 6 neighbors include
    // (1,0), (-1,0), (0,1). All three are at distance 1 from (0,0).
    placePoisonedUnit(state, JUNGLE, { q: 1, r: 0 });
    placePoisonedUnit(state, JUNGLE, { q: -1, r: 0 });
    placePoisonedUnit(state, JUNGLE, { q: 0, r: 1 });

    const after = detectAndSpawnToxicBlooms(state);

    const blooms = [...after.zoneEffects.values()].filter((e) => e.type === 'toxic_bloom');
    expect(blooms.length).toBeGreaterThanOrEqual(1);
    const centeredAtOrigin = blooms.find((b) => b.center.q === 0 && b.center.r === 0);
    expect(centeredAtOrigin).toBeTruthy();
    expect(centeredAtOrigin!.ownerFactionId).toBe(JUNGLE);
    expect(centeredAtOrigin!.damagePerTurn).toBe(2);
  });

  it('does NOT spawn when only 2 poisoned units are adjacent', () => {
    let state = buildMvpScenario(42);
    state = clearUnits(state);
    addResearchNodes(state, JUNGLE, ['venom_t1', 'venom_t2', 'venom_t3']);

    placePoisonedUnit(state, JUNGLE, { q: 1, r: 0 });
    placePoisonedUnit(state, JUNGLE, { q: -1, r: 0 });

    const after = detectAndSpawnToxicBlooms(state);
    const blooms = [...after.zoneEffects.values()].filter((e) => e.type === 'toxic_bloom');
    expect(blooms).toHaveLength(0);
  });

  it('does NOT double-spawn on a hex that already has an active Bloom', () => {
    let state = buildMvpScenario(42);
    state = clearUnits(state);
    addResearchNodes(state, JUNGLE, ['venom_t1', 'venom_t2', 'venom_t3']);

    placePoisonedUnit(state, JUNGLE, { q: 1, r: 0 });
    placePoisonedUnit(state, JUNGLE, { q: -1, r: 0 });
    placePoisonedUnit(state, JUNGLE, { q: 0, r: 1 });

    const after = detectAndSpawnToxicBlooms(state);
    const firstCount = [...after.zoneEffects.values()].filter(
      (e) => e.type === 'toxic_bloom' && e.center.q === 0 && e.center.r === 0,
    ).length;
    expect(firstCount).toBe(1);

    // Re-run detection without changing the cluster: the existing Bloom
    // suppresses respawn on the same center.
    const again = detectAndSpawnToxicBlooms(after);
    const secondCount = [...again.zoneEffects.values()].filter(
      (e) => e.type === 'toxic_bloom' && e.center.q === 0 && e.center.r === 0,
    ).length;
    expect(secondCount).toBe(1);
  });

  it('native Jungle Clans spawns permanent Blooms (turnsRemaining: -1)', () => {
    let state = buildMvpScenario(42);
    state = clearUnits(state);
    addResearchNodes(state, JUNGLE, ['venom_t1', 'venom_t2', 'venom_t3']);

    placePoisonedUnit(state, JUNGLE, { q: 1, r: 0 });
    placePoisonedUnit(state, JUNGLE, { q: -1, r: 0 });
    placePoisonedUnit(state, JUNGLE, { q: 0, r: 1 });

    const after = detectAndSpawnToxicBlooms(state);
    const bloom = [...after.zoneEffects.values()].find(
      (e) => e.type === 'toxic_bloom' && e.center.q === 0 && e.center.r === 0,
    );
    expect(bloom?.turnsRemaining).toBe(-1);
  });

  it('foreign Venom-T3 faction spawns 3-turn Blooms', () => {
    let state = buildMvpScenario(42);
    state = clearUnits(state);
    // Savannah Lions are nativeDomain = charge. Learn foreign venom_t3.
    addResearchNodes(state, SAVANNAH, ['venom_t1', 'venom_t2', 'venom_t3']);
    state.factions.get(SAVANNAH)!.learnedDomains = ['charge', 'venom'];

    placePoisonedUnit(state, SAVANNAH, { q: 1, r: 0 });
    placePoisonedUnit(state, SAVANNAH, { q: -1, r: 0 });
    placePoisonedUnit(state, SAVANNAH, { q: 0, r: 1 });

    const after = detectAndSpawnToxicBlooms(state);
    const bloom = [...after.zoneEffects.values()].find(
      (e) => e.type === 'toxic_bloom' && e.center.q === 0 && e.center.r === 0,
    );
    expect(bloom?.turnsRemaining).toBe(3);
    expect(bloom?.ownerFactionId).toBe(SAVANNAH);
  });

  it('foreign Bloom expires after 3 ticks but native Bloom persists', () => {
    let state = buildMvpScenario(42);
    state = clearUnits(state);
    addResearchNodes(state, JUNGLE, ['venom_t1', 'venom_t2', 'venom_t3']);
    addResearchNodes(state, SAVANNAH, ['venom_t1', 'venom_t2', 'venom_t3']);
    state.factions.get(SAVANNAH)!.learnedDomains = ['charge', 'venom'];

    // Native cluster at (0,0)
    placePoisonedUnit(state, JUNGLE, { q: 1, r: 0 });
    placePoisonedUnit(state, JUNGLE, { q: -1, r: 0 });
    placePoisonedUnit(state, JUNGLE, { q: 0, r: 1 });
    // Foreign cluster at (10, 10)
    placePoisonedUnit(state, SAVANNAH, { q: 11, r: 10 });
    placePoisonedUnit(state, SAVANNAH, { q: 9, r: 10 });
    placePoisonedUnit(state, SAVANNAH, { q: 10, r: 11 });

    state = detectAndSpawnToxicBlooms(state);

    const initialBlooms = [...state.zoneEffects.values()].filter((e) => e.type === 'toxic_bloom');
    expect(initialBlooms.length).toBeGreaterThanOrEqual(2);

    // Tick three rounds — foreign should be gone, native should remain
    state = tickZoneEffectLifetimes(state);
    state = tickZoneEffectLifetimes(state);
    state = tickZoneEffectLifetimes(state);

    const blooms = [...state.zoneEffects.values()].filter((e) => e.type === 'toxic_bloom');
    const nativeBloom = blooms.find((b) => b.ownerFactionId === JUNGLE);
    const foreignBloom = blooms.find((b) => b.ownerFactionId === SAVANNAH);
    expect(nativeBloom).toBeTruthy();
    expect(foreignBloom).toBeUndefined();
  });
});

describe('toxic bloom — damage application', () => {
  it('a non-owner unit on a Bloom takes 2 dmg at start of its faction turn', () => {
    let state = buildMvpScenario(42);
    state = clearUnits(state);
    addResearchNodes(state, JUNGLE, ['venom_t1', 'venom_t2', 'venom_t3']);

    // Spawn a Bloom at (0,0)
    placePoisonedUnit(state, JUNGLE, { q: 1, r: 0 });
    placePoisonedUnit(state, JUNGLE, { q: -1, r: 0 });
    placePoisonedUnit(state, JUNGLE, { q: 0, r: 1 });
    state = detectAndSpawnToxicBlooms(state);

    // Now place a healthy Savannah unit on (0,0).
    const victimId = placeHealthyUnit(state, SAVANNAH, { q: 0, r: 0 });
    const hpBefore = state.units.get(victimId)!.hp;

    state = applyEnvironmentalDamage(state, SAVANNAH, registry);

    const hpAfter = state.units.get(victimId)!.hp;
    expect(hpBefore - hpAfter).toBe(2);
  });

  it('an owner-faction unit on its own Bloom takes 0 dmg (no friendly fire)', () => {
    let state = buildMvpScenario(42);
    state = clearUnits(state);
    addResearchNodes(state, JUNGLE, ['venom_t1', 'venom_t2', 'venom_t3']);

    placePoisonedUnit(state, JUNGLE, { q: 1, r: 0 });
    placePoisonedUnit(state, JUNGLE, { q: -1, r: 0 });
    placePoisonedUnit(state, JUNGLE, { q: 0, r: 1 });
    state = detectAndSpawnToxicBlooms(state);

    const ownerUnitId = placeHealthyUnit(state, JUNGLE, { q: 0, r: 0 });
    const unitBefore = state.units.get(ownerUnitId)!;
    // Strip poison so we isolate Bloom damage (placeHealthyUnit already
    // does, but be explicit).
    state.units.set(ownerUnitId, { ...unitBefore, poisoned: false, poisonStacks: 0 });
    const hpBefore = state.units.get(ownerUnitId)!.hp;

    state = applyEnvironmentalDamage(state, JUNGLE, registry);

    const hpAfter = state.units.get(ownerUnitId)!.hp;
    // No Bloom damage AND no other attrition (plains terrain, no poison).
    expect(hpAfter).toBe(hpBefore);
  });
});

describe('toxic bloom — mycelium network on kill', () => {
  function setupAttackOnBloom(attackerFaction: FactionId) {
    const state = buildMvpScenario(42);

    // Pick an attacker unit (from attackerFaction) and a defender from a
    // different faction. Strip everyone else's units so adjacency math is
    // clean.
    const defenderFaction = (attackerFaction === JUNGLE ? SAVANNAH : JUNGLE) as FactionId;
    const attackerUnitId = state.factions.get(attackerFaction)!.unitIds[0];
    const defenderUnitId = state.factions.get(defenderFaction)!.unitIds[0];

    // Friendly Jungle units that should receive propagation (when attacker
    // is Jungle Clans). We borrow another faction-mate's unit if available;
    // otherwise we fabricate one. For simplicity, fabricate two extras.
    const attackerProtoId = state.factions.get(attackerFaction)!.prototypeIds[0];
    function fabricateFriendly(position: { q: number; r: number }): UnitId {
      const uid = createUnitId();
      const unit: Unit = {
        id: uid,
        factionId: attackerFaction,
        position,
        facing: 0,
        hp: 10,
        maxHp: 10,
        movesRemaining: 2,
        maxMoves: 2,
        attacksRemaining: 1,
        xp: 0,
        veteranLevel: 'green',
        status: 'ready',
        prototypeId: attackerProtoId,
        history: [],
        morale: 100,
        routed: false,
        poisoned: false,
        poisonStacks: 0,
        poisonTurnsRemaining: 0,
        enteredZoCThisActivation: false,
        isStealthed: false,
        turnsSinceStealthBreak: 0,
        learnedAbilities: [],
      };
      state.units.set(uid, unit);
      state.factions.get(attackerFaction)!.unitIds.push(uid);
      return uid;
    }

    const attackerPos = { q: 5, r: 5 };
    const defenderPos = { q: 6, r: 5 };

    state.units.set(attackerUnitId, {
      ...state.units.get(attackerUnitId)!,
      position: attackerPos,
      status: 'ready',
      attacksRemaining: 1,
      movesRemaining: 1,
      hp: 100,
      maxHp: 100,
    });
    state.units.set(defenderUnitId, {
      ...state.units.get(defenderUnitId)!,
      position: defenderPos,
      status: 'ready',
      attacksRemaining: 1,
      movesRemaining: 1,
      hp: 1, // ensure one-shot kill
      maxHp: 100,
      poisoned: false,
      poisonStacks: 0,
    });

    if (state.map) {
      state.map.tiles.set(hexToKey(attackerPos), { position: attackerPos, terrain: 'plains' });
      state.map.tiles.set(hexToKey(defenderPos), { position: defenderPos, terrain: 'plains' });
    }

    // Friendlies within 3 hexes of bloom center (defenderPos)
    const friendlyNearId = fabricateFriendly({ q: 7, r: 5 }); // dist 1
    const friendlyMidId = fabricateFriendly({ q: 8, r: 5 });  // dist 2

    // Friendly OUTSIDE the 3-hex propagation radius
    const friendlyFarId = fabricateFriendly({ q: 10, r: 5 }); // dist 4

    // Grant attacker faction Venom T3 (so doctrine flags fire correctly).
    addResearchNodes(state, attackerFaction, ['venom_t1', 'venom_t2', 'venom_t3']);
    state.factions.get(attackerFaction)!.learnedDomains = Array.from(
      new Set([...state.factions.get(attackerFaction)!.learnedDomains, 'venom']),
    );

    // Place a toxic_bloom owned by the attacker at defenderPos.
    const bloom: ZoneEffect = {
      id: createZoneEffectId(),
      type: 'toxic_bloom',
      center: defenderPos,
      radius: 0,
      ownerFactionId: attackerFaction,
      damagePerTurn: 2,
      movementPenalty: 0,
      turnsRemaining: -1,
      createdRound: 1,
    };
    const stated = addZoneEffect(state, bloom);

    return {
      state: stated,
      attackerUnitId,
      defenderUnitId,
      friendlyNearId,
      friendlyMidId,
      friendlyFarId,
    };
  }

  it('Jungle attacker killing on own Bloom propagates 2 poison stacks to friendlies within 3 hexes', () => {
    const { state, attackerUnitId, defenderUnitId, friendlyNearId, friendlyMidId, friendlyFarId } =
      setupAttackOnBloom(JUNGLE);

    state.activeFactionId = JUNGLE;
    const preview = previewCombatAction(state, registry, attackerUnitId, defenderUnitId);
    expect(preview).toBeTruthy();
    expect(preview!.result.defenderDestroyed).toBe(true);

    const { state: afterState } = applyCombatAction(state, registry, preview!);

    const friendlyNear = afterState.units.get(friendlyNearId);
    const friendlyMid = afterState.units.get(friendlyMidId);
    const friendlyFar = afterState.units.get(friendlyFarId);

    // friendlies within 3 hexes are poisoned with 2 stacks
    expect(friendlyNear?.poisoned).toBe(true);
    expect(friendlyNear?.poisonStacks).toBe(2);
    expect(friendlyMid?.poisoned).toBe(true);
    expect(friendlyMid?.poisonStacks).toBe(2);

    // friendly beyond 3 hexes is untouched
    expect(friendlyFar?.poisoned).toBeFalsy();
    expect(friendlyFar?.poisonStacks ?? 0).toBe(0);
  });

  it('non-native Venom-T3 attacker (Savannah Lions) does NOT propagate via mycelium network', () => {
    const { state, attackerUnitId, defenderUnitId, friendlyNearId, friendlyMidId } =
      setupAttackOnBloom(SAVANNAH);

    state.activeFactionId = SAVANNAH;
    const preview = previewCombatAction(state, registry, attackerUnitId, defenderUnitId);
    expect(preview).toBeTruthy();
    expect(preview!.result.defenderDestroyed).toBe(true);

    const { state: afterState } = applyCombatAction(state, registry, preview!);

    const friendlyNear = afterState.units.get(friendlyNearId);
    const friendlyMid = afterState.units.get(friendlyMidId);

    // No mycelium propagation for foreign Venom-T3 — friendlies stay clean
    expect(friendlyNear?.poisoned).toBeFalsy();
    expect(friendlyNear?.poisonStacks ?? 0).toBe(0);
    expect(friendlyMid?.poisoned).toBeFalsy();
    expect(friendlyMid?.poisonStacks ?? 0).toBe(0);
  });
});

describe('toxic bloom — cleansing (Druid Circle native T3)', () => {
  it('removes a Bloom whose center is occupied by a Druid Circle unit', () => {
    let state = buildMvpScenario(42);
    state = clearUnits(state);
    addResearchNodes(state, JUNGLE, ['venom_t1', 'venom_t2', 'venom_t3']);

    placePoisonedUnit(state, JUNGLE, { q: 1, r: 0 });
    placePoisonedUnit(state, JUNGLE, { q: -1, r: 0 });
    placePoisonedUnit(state, JUNGLE, { q: 0, r: 1 });
    state = detectAndSpawnToxicBlooms(state);

    const beforeBlooms = [...state.zoneEffects.values()].filter((e) => e.type === 'toxic_bloom');
    expect(beforeBlooms.length).toBeGreaterThanOrEqual(1);

    // Druid Circle has nativeDomain = nature_healing. Grant them T3 and
    // park a unit on the bloom center.
    const druids = 'druid_circle' as FactionId;
    addResearchNodes(state, druids, ['nature_healing_t1', 'nature_healing_t2', 'nature_healing_t3']);
    placeHealthyUnit(state, druids, { q: 0, r: 0 });

    state = cleanseToxicBlooms(state);

    const afterBlooms = [...state.zoneEffects.values()].filter(
      (e) => e.type === 'toxic_bloom' && e.center.q === 0 && e.center.r === 0,
    );
    expect(afterBlooms).toHaveLength(0);
  });
});
