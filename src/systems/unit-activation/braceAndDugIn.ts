// Brace and Hill-Dug-In logic. Both are unit-stance mechanics that used to
// live alongside the field-fort builder; with field forts retired in favor of
// Bastion (see ./bastion.ts), they live on their own here.

import { hexDistance } from '../../core/grid.js';
import type { GameState, UnitId } from '../../game/types.js';
import type { FactionId } from '../../types.js';
import { resolveResearchDoctrine } from '../capabilityDoctrine.js';
import { canUseBrace } from '../abilitySystem.js';

import { getTerrainAt } from './helpers.js';

export function shouldBrace(
  unit: import('../../features/units/types.js').Unit,
  prototype: { tags?: string[] },
  state: GameState,
  canUniversalBrace: boolean = false,
): boolean {
  if ((!canUseBrace(prototype as any) && !canUniversalBrace) || hasAdjacentEnemy(state, unit) === false) {
    return false;
  }

  return Array.from(state.units.values()).some((other) => {
    if (other.hp <= 0 || other.factionId === unit.factionId) {
      return false;
    }
    const enemyPrototype = state.prototypes.get(other.prototypeId);
    if (!enemyPrototype) {
      return false;
    }
    return hexDistance(unit.position, other.position) === 1 && canUseCharge(enemyPrototype);
  });
}

function canUseCharge(prototype: { tags?: string[] }): boolean {
  return prototype.tags?.includes('charge') ?? false;
}

function hasAdjacentEnemy(state: GameState, unit: import('../../features/units/types.js').Unit): boolean {
  for (const other of state.units.values()) {
    if (other.hp <= 0 || other.factionId === unit.factionId) continue;
    if (hexDistance(unit.position, other.position) === 1) return true;
  }
  return false;
}

export function applyHillDugInIfEligible(
  state: GameState,
  factionId: FactionId,
  unitId: UnitId
): GameState {
  const faction = state.factions.get(factionId);
  const research = state.research.get(factionId);
  const unit = state.units.get(unitId);
  if (!faction || !unit || unit.hp <= 0) {
    return state;
  }

  const doctrine = resolveResearchDoctrine(research, faction);
  if (!doctrine.rapidEntrenchEnabled || getTerrainAt(state, unit.position) !== 'hill') {
    return state;
  }

  const units = new Map(state.units);
  units.set(unitId, { ...unit, hillDugIn: true });
  return { ...state, units };
}
