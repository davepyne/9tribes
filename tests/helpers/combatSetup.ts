import type { GameState, Unit, HexCoord, FactionId, Faction } from '../../src/game/types';
import type { ResearchNodeId } from '../../src/types';
import type { VeteranLevel } from '../../src/core/enums';
import { createUnitId } from '../../src/core/ids';

export function getCombatants(state: GameState) {
  const factionIds = Array.from(state.factions.keys()) as FactionId[];
  const attackerFactionId = factionIds[0];
  const defenderFactionId = factionIds[1];
  const attFaction = state.factions.get(attackerFactionId)!;
  const defFaction = state.factions.get(defenderFactionId)!;
  const attacker = state.units.get(attFaction.unitIds[0])!;
  const defender = state.units.get(defFaction.unitIds[0])!;
  return { attacker, defender, attackerFactionId, defenderFactionId, attFaction, defFaction };
}

export function placeAdjacent(state: GameState, attacker: Unit, defender: Unit): GameState {
  const adjacentPos: HexCoord = { q: attacker.position.q + 1, r: attacker.position.r };
  const units = new Map(state.units);
  units.set(defender.id, { ...defender, position: adjacentPos });
  return { ...state, units };
}

let extraUnitCounter = 0;

export function addExtraUnit(
  state: GameState,
  position: HexCoord,
  factionId: FactionId,
  template: Unit,
  prefix = 'test',
): { state: GameState; unitId: Unit['id'] } {
  const uid = createUnitId(`${prefix}-${++extraUnitCounter}`);
  const extra: Unit = {
    ...template,
    id: uid,
    hp: 50,
    maxHp: 100,
    factionId,
    position,
    history: [],
    morale: 100,
    veteranLevel: 'green' as VeteranLevel,
    learnedAbilities: [],
  };
  const units = new Map(state.units);
  units.set(uid, extra);
  return { state: { ...state, units }, unitId: uid };
}

export function setResearch(
  state: GameState,
  factionId: FactionId,
  completedNodes: string[],
  nativeDomains: string[],
): GameState {
  const factions = new Map(state.factions);
  const f = factions.get(factionId)!;
  factions.set(factionId, {
    ...f,
    nativeDomain: nativeDomains[0],
    nativeDomains,
    learnedDomains: nativeDomains,
  });

  const research = new Map(state.research);
  const existing = research.get(factionId);
  research.set(factionId, {
    factionId,
    activeNodeId: null,
    progressByNodeId: {},
    completedNodes: completedNodes as ResearchNodeId[],
    researchPerTurn: existing?.researchPerTurn ?? 1,
  });

  return { ...state, factions, research };
}

export const fakeFaction = (nativeDomains: string[]): Faction => ({
  id: 'test' as FactionId,
  nativeDomain: nativeDomains[0],
  nativeDomains,
  learnedDomains: nativeDomains,
  bastionsBuilt: 0,
  maelstromsDeclared: 0,
  oasisDeclared: 0,
  slaveCaptureCount: 0,
} as Faction);
