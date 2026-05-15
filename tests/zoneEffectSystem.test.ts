// Zone Effect System — unit tests for lifetime ticking and hex queries.
//
// These tests exercise the infrastructure that Maelstrom and Toxic Bloom
// will build on. The mechanics themselves are tested in their own files
// once they ship.

import { describe, it, expect } from 'vitest';
import { createEmptyGameState } from '../src/game/createGameState';
import { createZoneEffectId } from '../src/core/ids';
import {
  addZoneEffect,
  removeZoneEffect,
  getZoneEffectsAtHex,
  getZoneEffectDamageOnHex,
  getZoneEffectMovementPenalty,
  tickZoneEffectLifetimes,
} from '../src/systems/zoneEffectSystem';
import type { FactionId, HexCoord } from '../src/types';
import type { ZoneEffect } from '../src/game/types';

function makeEffect(overrides: Partial<ZoneEffect> & { center: HexCoord }): ZoneEffect {
  return {
    id: createZoneEffectId(),
    type: 'maelstrom',
    radius: 0,
    ownerFactionId: 'attacker' as FactionId,
    damagePerTurn: 1,
    movementPenalty: 0,
    turnsRemaining: 3,
    createdRound: 1,
    ...overrides,
  };
}

describe('zone effects — query helpers', () => {
  it('getZoneEffectsAtHex returns effects covering the hex within radius', () => {
    let state = createEmptyGameState(1);
    const center: HexCoord = { q: 5, r: 5 };
    state = addZoneEffect(state, makeEffect({ center, radius: 2 }));

    // Center is covered
    expect(getZoneEffectsAtHex(state, { q: 5, r: 5 })).toHaveLength(1);
    // Hex 2 away is covered
    expect(getZoneEffectsAtHex(state, { q: 7, r: 5 })).toHaveLength(1);
    // Hex 3 away is not
    expect(getZoneEffectsAtHex(state, { q: 8, r: 5 })).toHaveLength(0);
  });

  it('radius 0 covers only the center hex', () => {
    let state = createEmptyGameState(1);
    state = addZoneEffect(state, makeEffect({ center: { q: 0, r: 0 }, radius: 0 }));

    expect(getZoneEffectsAtHex(state, { q: 0, r: 0 })).toHaveLength(1);
    expect(getZoneEffectsAtHex(state, { q: 1, r: 0 })).toHaveLength(0);
  });

  it('damage stacks additively across multiple effects on the same hex', () => {
    let state = createEmptyGameState(1);
    const center: HexCoord = { q: 0, r: 0 };
    state = addZoneEffect(state, makeEffect({ center, damagePerTurn: 2 }));
    state = addZoneEffect(state, makeEffect({ center, damagePerTurn: 3 }));

    expect(getZoneEffectDamageOnHex(state, center, 'other' as FactionId)).toBe(5);
  });

  it('damage is zero for the effect owner (no friendly fire)', () => {
    let state = createEmptyGameState(1);
    const owner = 'pirate_lords' as FactionId;
    state = addZoneEffect(state, makeEffect({
      center: { q: 0, r: 0 },
      damagePerTurn: 2,
      ownerFactionId: owner,
    }));

    expect(getZoneEffectDamageOnHex(state, { q: 0, r: 0 }, owner)).toBe(0);
    expect(getZoneEffectDamageOnHex(state, { q: 0, r: 0 }, 'enemy' as FactionId)).toBe(2);
  });

  it('movement penalty stacks additively for non-owners only', () => {
    let state = createEmptyGameState(1);
    state = addZoneEffect(state, makeEffect({
      center: { q: 0, r: 0 },
      movementPenalty: 1,
      ownerFactionId: 'owner' as FactionId,
    }));
    state = addZoneEffect(state, makeEffect({
      center: { q: 0, r: 0 },
      movementPenalty: 2,
      ownerFactionId: 'other_owner' as FactionId,
    }));

    expect(getZoneEffectMovementPenalty(state, { q: 0, r: 0 }, 'owner' as FactionId)).toBe(2); // skips own
    expect(getZoneEffectMovementPenalty(state, { q: 0, r: 0 }, 'third' as FactionId)).toBe(3); // sees both
  });
});

describe('zone effects — lifetime tick', () => {
  it('decrements turnsRemaining by 1 per tick', () => {
    let state = createEmptyGameState(1);
    const id = createZoneEffectId();
    state = addZoneEffect(state, makeEffect({
      id,
      center: { q: 0, r: 0 },
      turnsRemaining: 3,
    }));

    state = tickZoneEffectLifetimes(state);
    expect(state.zoneEffects.get(id)?.turnsRemaining).toBe(2);

    state = tickZoneEffectLifetimes(state);
    expect(state.zoneEffects.get(id)?.turnsRemaining).toBe(1);
  });

  it('removes an effect when its turnsRemaining reaches 0', () => {
    let state = createEmptyGameState(1);
    const id = createZoneEffectId();
    state = addZoneEffect(state, makeEffect({
      id,
      center: { q: 0, r: 0 },
      turnsRemaining: 1,
    }));

    state = tickZoneEffectLifetimes(state);
    expect(state.zoneEffects.has(id)).toBe(false);
  });

  it('does not tick permanent effects (turnsRemaining === -1)', () => {
    let state = createEmptyGameState(1);
    const id = createZoneEffectId();
    state = addZoneEffect(state, makeEffect({
      id,
      type: 'toxic_bloom',
      center: { q: 0, r: 0 },
      turnsRemaining: -1,
    }));

    state = tickZoneEffectLifetimes(state);
    state = tickZoneEffectLifetimes(state);
    expect(state.zoneEffects.get(id)?.turnsRemaining).toBe(-1);
  });

  it('returns the same state object when there are no effects', () => {
    const state = createEmptyGameState(1);
    expect(tickZoneEffectLifetimes(state)).toBe(state);
  });
});

describe('zone effects — add/remove', () => {
  it('addZoneEffect creates a new map (no mutation of original)', () => {
    const before = createEmptyGameState(1);
    const after = addZoneEffect(before, makeEffect({ center: { q: 0, r: 0 } }));

    expect(before.zoneEffects.size).toBe(0);
    expect(after.zoneEffects.size).toBe(1);
    expect(before.zoneEffects).not.toBe(after.zoneEffects);
  });

  it('removeZoneEffect drops the effect by id', () => {
    let state = createEmptyGameState(1);
    const id = createZoneEffectId();
    state = addZoneEffect(state, makeEffect({ id, center: { q: 0, r: 0 } }));
    expect(state.zoneEffects.has(id)).toBe(true);

    state = removeZoneEffect(state, id);
    expect(state.zoneEffects.has(id)).toBe(false);
  });

  it('removeZoneEffect on an unknown id returns the same state object', () => {
    const state = createEmptyGameState(1);
    expect(removeZoneEffect(state, createZoneEffectId())).toBe(state);
  });
});
