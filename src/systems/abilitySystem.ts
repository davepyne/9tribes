import type { Prototype } from '../features/prototypes/types.js';
import type { Unit } from '../features/units/types.js';
import type { GameState } from '../game/types.js';
import type { HexCoord } from '../types.js';
import { getNeighbors, hexToKey } from '../core/grid.js';
import { isUnitVisibleTo } from './fogSystem.js';

export type TacticalAbility = 'charge' | 'brace' | 'ambush';

function getPrototypeTags(prototype: Prototype): Set<string> {
  return new Set([prototype.chassisId, ...(prototype.tags ?? [])]);
}

export function canUseCharge(prototype: Prototype): boolean {
  const tags = getPrototypeTags(prototype);
  return prototype.derivedStats.role === 'mounted' || tags.has('shock') || tags.has('mounted');
}

export function canUseBrace(prototype: Prototype): boolean {
  const tags = getPrototypeTags(prototype);
  return tags.has('formation') || tags.has('spear') || tags.has('defensive');
}

export function canUseAmbush(prototype: Prototype, terrainId: string): boolean {
  const tags = getPrototypeTags(prototype);
  return (terrainId === 'forest' || terrainId === 'hill')
    && (prototype.derivedStats.role === 'ranged' || tags.has('skirmish') || tags.has('forest'));
}

export function hasAdjacentEnemy(state: GameState, unit: Unit): boolean {
  for (const hex of getNeighbors(unit.position)) {
    for (const [, other] of state.units) {
      if (
        other.hp > 0 &&
        other.factionId !== unit.factionId &&
        other.position.q === hex.q &&
        other.position.r === hex.r &&
        isUnitVisibleTo(state, unit.factionId, other)
      ) {
        return true;
      }
    }
  }
  return false;
}

export function shouldClearAmbush(unit: Unit, state: GameState): boolean {
  return unit.preparedAbility === 'ambush' && hasAdjacentEnemy(state, unit);
}

export function prepareAbility(
  unit: Unit,
  ability: 'brace' | 'ambush',
  round: number
): Unit {
  return {
    ...unit,
    preparedAbility: ability,
    preparedAbilityExpiresOnRound: round + 1,
    attacksRemaining: 0,
    status: 'spent',
    activatedThisRound: true,
  };
}

export function clearPreparedAbility(unit: Unit): Unit {
  return {
    ...unit,
    preparedAbility: undefined,
    preparedAbilityExpiresOnRound: undefined,
  };
}

export function getTerrainAt(state: GameState, pos: HexCoord): string {
  return state.map?.tiles.get(hexToKey(pos))?.terrain ?? 'plains';
}
