// Maelstrom System — Tidal Warfare T3 mechanic.
//
// A Maelstrom is a ZoneEffect (type: 'maelstrom') that covers a radius of hexes
// centered on a water hex (coast/river/ocean). It deals 2 dmg/turn and imposes
// a +1 movement penalty on non-owner units inside the zone.
//
//   - Foreign tidal_warfare T3: 3-hex radius, 3-turn duration.
//   - Native Pirate Lords (coral_people): 5-hex radius, 5-turn duration,
//     plus naval kills inside the Maelstrom auto-capture regardless of HP.
//
// Once-per-game per faction, tracked on faction.maelstromsDeclared.

import type { GameState, ZoneEffect } from '../game/types.js';
import type { FactionId, HexCoord } from '../types.js';
import { hexToKey } from '../core/grid.js';
import { createZoneEffectId } from '../core/ids.js';
import { resolveResearchDoctrine } from './capabilityDoctrine.js';
import { addZoneEffect } from './zoneEffectSystem.js';
import { isWaterTerrain } from './terrainUtils.js';

const MAELSTROM_DAMAGE_PER_TURN = 2;
const MAELSTROM_MOVEMENT_PENALTY = 1;

export interface DeclareMaelstromResult {
  state: GameState;
  declared: boolean;
  reason?: string;
}

export function declareMaelstrom(
  state: GameState,
  factionId: FactionId,
  centerHex: HexCoord,
): DeclareMaelstromResult {
  const faction = state.factions.get(factionId);
  if (!faction) {
    return { state, declared: false, reason: 'no faction' };
  }

  const research = state.research.get(factionId);
  const doctrine = resolveResearchDoctrine(research, faction);

  if (!doctrine.canDeclareMaelstrom) {
    return { state, declared: false, reason: 'doctrine not met or already declared' };
  }

  const terrainId = state.map?.tiles.get(hexToKey(centerHex))?.terrain;
  if (!terrainId || !isWaterTerrain(terrainId)) {
    return { state, declared: false, reason: 'center hex must be water terrain' };
  }

  const maelstrom: ZoneEffect = {
    id: createZoneEffectId(),
    type: 'maelstrom',
    center: centerHex,
    radius: doctrine.maelstromRadius,
    ownerFactionId: factionId,
    damagePerTurn: MAELSTROM_DAMAGE_PER_TURN,
    movementPenalty: MAELSTROM_MOVEMENT_PENALTY,
    turnsRemaining: doctrine.maelstromDuration,
    createdRound: state.round,
  };

  let nextState = addZoneEffect(state, maelstrom);

  const factions = new Map(nextState.factions);
  factions.set(factionId, {
    ...faction,
    maelstromsDeclared: faction.maelstromsDeclared + 1,
  });
  nextState = { ...nextState, factions };

  return { state: nextState, declared: true };
}
