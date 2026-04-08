import { describe, expect, it } from 'vitest';
import { GameSession } from '../web/src/game/controller/GameSession';
import { buildWorldViewModel } from '../web/src/game/view-model/worldViewModel';

describe('worldViewModel play derivation', () => {
  it('includes active faction, reachable tiles, and unit action state', () => {
    const session = new GameSession({ type: 'fresh', seed: 42 });
    const state = session.getState();
    const activeUnit = Array.from(state.units.values()).find((unit) =>
      unit.factionId === state.activeFactionId && session.getLegalMoves(unit.id).length > 0,
    );

    expect(activeUnit).toBeTruthy();
    const legalMoves = session.getLegalMoves(activeUnit!.id);

    const world = buildWorldViewModel({
      kind: 'play',
      state,
      registry: session.getRegistry(),
      reachableHexes: legalMoves,
      pathPreview: legalMoves.length > 0
        ? [
            { key: `${activeUnit!.position.q},${activeUnit!.position.r}`, q: activeUnit!.position.q, r: activeUnit!.position.r, step: 0 },
            { key: legalMoves[0].key, q: legalMoves[0].q, r: legalMoves[0].r, step: 1 },
          ]
        : [],
    });

    expect(world.activeFactionId).toBe(state.activeFactionId);
    expect(world.overlays.reachableHexes).toHaveLength(legalMoves.length);

    const worldUnit = world.units.find((unit) => unit.id === activeUnit!.id);
    expect(worldUnit?.movesRemaining).toBe(activeUnit!.movesRemaining);
    expect(worldUnit?.isActiveFaction).toBe(true);
    expect(worldUnit?.acted).toBe(false);
  });

  it('marks a unit as acted once it is spent', () => {
    const session = new GameSession({ type: 'fresh', seed: 42 });
    const state = session.getState();
    const activeUnit = Array.from(state.units.values()).find((unit) =>
      unit.factionId === state.activeFactionId && session.getLegalMoves(unit.id).length > 0,
    );

    expect(activeUnit).toBeTruthy();
    const exhaustedState = {
      ...state,
      units: new Map(state.units).set(activeUnit!.id, {
        ...activeUnit!,
        movesRemaining: 0,
        status: 'spent',
      }),
    };
    const world = buildWorldViewModel({
      kind: 'play',
      state: exhaustedState,
      registry: session.getRegistry(),
      reachableHexes: [],
      pathPreview: [],
    });

    const exhaustedUnit = world.units.find((unit) => unit.id === activeUnit!.id);
    expect(exhaustedUnit?.acted).toBe(true);
  });
});
