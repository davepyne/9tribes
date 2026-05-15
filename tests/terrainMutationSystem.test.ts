// Terrain mutation utility — unit tests for runtime tile conversion.

import { describe, it, expect } from 'vitest';
import { createEmptyGameState } from '../src/game/createGameState';
import { setTerrainAt, setTerrainInRadius } from '../src/systems/terrainMutationSystem';
import { hexToKey } from '../src/core/grid';
import type { GameState } from '../src/game/types';
import type { Tile, TerrainType } from '../src/world/map/types';

function makeMapState(width: number, height: number, defaultTerrain: TerrainType = 'plains'): GameState {
  const state = createEmptyGameState(1);
  const tiles = new Map<string, Tile>();
  for (let q = 0; q < width; q++) {
    for (let r = 0; r < height; r++) {
      tiles.set(hexToKey({ q, r }), {
        position: { q, r },
        terrain: defaultTerrain,
      });
    }
  }
  return {
    ...state,
    map: { width, height, tiles },
  };
}

describe('terrain mutation — setTerrainAt', () => {
  it('changes a single hex terrain', () => {
    let state = makeMapState(5, 5);
    state = setTerrainAt(state, { q: 2, r: 2 }, 'desert');
    expect(state.map!.tiles.get(hexToKey({ q: 2, r: 2 }))?.terrain).toBe('desert');
  });

  it('preserves other tiles', () => {
    let state = makeMapState(5, 5);
    state = setTerrainAt(state, { q: 2, r: 2 }, 'desert');
    expect(state.map!.tiles.get(hexToKey({ q: 1, r: 2 }))?.terrain).toBe('plains');
    expect(state.map!.tiles.get(hexToKey({ q: 3, r: 2 }))?.terrain).toBe('plains');
  });

  it('is a no-op when the hex already has the target terrain', () => {
    const state = makeMapState(5, 5);
    expect(setTerrainAt(state, { q: 2, r: 2 }, 'plains')).toBe(state);
  });

  it('is a no-op when the hex does not exist on the map', () => {
    const state = makeMapState(5, 5);
    expect(setTerrainAt(state, { q: 99, r: 99 }, 'forest')).toBe(state);
  });

  it('is a no-op when there is no map', () => {
    const state = createEmptyGameState(1);
    expect(setTerrainAt(state, { q: 0, r: 0 }, 'forest')).toBe(state);
  });

  it('creates a new tiles map (no mutation of original)', () => {
    const before = makeMapState(5, 5);
    const originalTiles = before.map!.tiles;
    const after = setTerrainAt(before, { q: 2, r: 2 }, 'desert');
    expect(after.map!.tiles).not.toBe(originalTiles);
    expect(originalTiles.get(hexToKey({ q: 2, r: 2 }))?.terrain).toBe('plains');
  });
});

describe('terrain mutation — setTerrainInRadius', () => {
  it('converts all hexes within radius', () => {
    let state = makeMapState(10, 10);
    state = setTerrainInRadius(state, { q: 5, r: 5 }, 2, 'desert');

    // Center
    expect(state.map!.tiles.get(hexToKey({ q: 5, r: 5 }))?.terrain).toBe('desert');
    // Within radius 2
    expect(state.map!.tiles.get(hexToKey({ q: 6, r: 5 }))?.terrain).toBe('desert');
    expect(state.map!.tiles.get(hexToKey({ q: 7, r: 5 }))?.terrain).toBe('desert');
    expect(state.map!.tiles.get(hexToKey({ q: 5, r: 7 }))?.terrain).toBe('desert');
    // Outside radius 2
    expect(state.map!.tiles.get(hexToKey({ q: 8, r: 5 }))?.terrain).toBe('plains');
  });

  it('is a no-op when no hexes change (radius 0 + same terrain)', () => {
    const state = makeMapState(5, 5);
    expect(setTerrainInRadius(state, { q: 2, r: 2 }, 0, 'plains')).toBe(state);
  });

  it('radius 0 changes only the center hex', () => {
    let state = makeMapState(5, 5);
    state = setTerrainInRadius(state, { q: 2, r: 2 }, 0, 'forest');
    expect(state.map!.tiles.get(hexToKey({ q: 2, r: 2 }))?.terrain).toBe('forest');
    expect(state.map!.tiles.get(hexToKey({ q: 3, r: 2 }))?.terrain).toBe('plains');
  });
});
