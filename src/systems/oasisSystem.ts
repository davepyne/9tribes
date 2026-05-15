// Oasis System — Camel Adaptation T3 native mechanic.
//
// Once per game, a Desert Nomad unit may proclaim an Oasis: the chosen hex
// and all hexes within a 2-hex radius are permanently converted to desert.
// No ZoneEffect — this is a pure terrain mutation.
//
// Once-per-game per faction, tracked on faction.oasisDeclared.

import type { GameState } from '../game/types.js';
import type { FactionId, HexCoord } from '../types.js';
import { hexToKey } from '../core/grid.js';
import { resolveResearchDoctrine } from './capabilityDoctrine.js';
import { setTerrainInRadius } from './terrainMutationSystem.js';
import { isLandTerrain } from './terrainUtils.js';

const OASIS_RADIUS = 2;

export interface DeclareOasisResult {
  state: GameState;
  declared: boolean;
  reason?: string;
}

export function declareOasis(
  state: GameState,
  factionId: FactionId,
  centerHex: HexCoord,
): DeclareOasisResult {
  const faction = state.factions.get(factionId);
  if (!faction) {
    return { state, declared: false, reason: 'no faction' };
  }

  const research = state.research.get(factionId);
  const doctrine = resolveResearchDoctrine(research, faction);

  if (!doctrine.canDeclareOasis) {
    return { state, declared: false, reason: 'doctrine not met or already declared' };
  }

  const terrainId = state.map?.tiles.get(hexToKey(centerHex))?.terrain;
  if (!terrainId || !isLandTerrain(terrainId)) {
    return { state, declared: false, reason: 'center hex must be land terrain' };
  }

  let nextState = setTerrainInRadius(state, centerHex, OASIS_RADIUS, 'desert');

  const factions = new Map(nextState.factions);
  factions.set(factionId, {
    ...faction,
    oasisDeclared: faction.oasisDeclared + 1,
  });
  nextState = { ...nextState, factions };

  return { state: nextState, declared: true };
}
