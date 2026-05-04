import type { RulesRegistry } from '../../../../src/data/registry/types.js';
import type { GameState, Unit } from '../../../../src/game/types.js';
import { getFaction, getPrototype, getResearch } from '../stateAccess.js';
import { canUseAmbush, canUseBrace, getTerrainAt, hasAdjacentEnemy } from '../../../../src/systems/abilitySystem.js';
import { resolveCapabilityDoctrine } from '../../../../src/systems/capabilityDoctrine.js';
import { isUnitEffectivelyStealthed } from '../../../../src/systems/fogSystem.js';
import { isUnlockPrototype } from '../../../../src/systems/knowledgeSystem.js';
import { getUnitSupplyCost } from '../../../../src/systems/productionSystem.js';
import { canPriestSummon } from '../../../../src/systems/summonSystem.js';
import { canBoardTransport, getUnitTransport, getValidDisembarkHexes } from '../../../../src/systems/transportSystem.js';
import { getSpriteKeyForUnit, inferChassisId } from './spriteKeys.js';
import { hexToKey, getNeighbors } from '../../../../src/core/grid.js';

function thisChassisMovementClass(chassisId: string | undefined, registry: RulesRegistry): string | undefined {
  return chassisId ? registry.getChassis(chassisId)?.movementClass : undefined;
}

export function buildUnitView(
  unit: Unit,
  state: GameState,
  registry: RulesRegistry,
  hexVisibility: Map<string, 'visible' | 'explored' | 'hidden'>,
  moveCount: number,
  attackCount: number,
  unitsByPosition: Map<string, Unit[]>,
  playerFactionId: string | null,
) {
  const prototype = getPrototype(state, unit.prototypeId);
  const chassisId = prototype?.chassisId ?? inferChassisId(prototype?.name ?? unit.prototypeId);
  const canAct = unit.factionId === state.activeFactionId
    && unit.status === 'ready'
    && unit.hp > 0
    && (moveCount > 0 || attackCount > 0);
  const faction = state.factions.get(unit.factionId);
  const factionDoctrine = faction
    ? resolveCapabilityDoctrine(getResearch(state, unit.factionId), faction)
    : undefined;
  const unitTransport = getUnitTransport(unit.id, state.transportMap);
  const boardableTransportIds = unit.factionId === state.activeFactionId && unit.hp > 0
    ? getNeighbors(unit.position)
      .flatMap((adj) => unitsByPosition.get(hexToKey(adj)) ?? [])
      .filter((candidate) => candidate.id !== unit.id)
      .filter((candidate) => canBoardTransport(state, unit.id, candidate.id, registry, state.transportMap))
      .map((candidate) => candidate.id)
    : [];
  const validDisembarkHexes = unitTransport
    ? getValidDisembarkHexes(state, unitTransport.transportId, registry, state.transportMap)
    : [];
  const canBrace = !!prototype
    && canAct
    && (canUseBrace(prototype) || factionDoctrine?.fortressTranscendenceEnabled === true)
    && hasAdjacentEnemy(state, unit);
  const canAmbush = !!prototype
    && canAct
    && canUseAmbush(prototype, getTerrainAt(state, unit.position))
    && !hasAdjacentEnemy(state, unit);
  const baseDefense = prototype?.derivedStats.defense ?? 0;
  const tile = state.map?.tiles.get(`${unit.position.q},${unit.position.r}`);
  const terrainDef = tile ? registry.getTerrain(tile.terrain) : undefined;
  const terrainMod = terrainDef?.defenseModifier ?? 0;
  let improvementBonus = 0;
  for (const [, improvement] of state.improvements) {
    if (improvement.position.q === unit.position.q && improvement.position.r === unit.position.r) {
      improvementBonus = improvement.defenseBonus ?? 0;
      break;
    }
  }
  if (improvementBonus === 0) {
    for (const [, city] of state.cities) {
      if (city.position.q === unit.position.q && city.position.r === unit.position.r) {
        improvementBonus = 1;
        break;
      }
    }
  }
  if (improvementBonus === 0) {
    for (const [, village] of state.villages) {
      if (village.position.q === unit.position.q && village.position.r === unit.position.r) {
        improvementBonus = 0.5;
        break;
      }
    }
  }
  const effectiveDefense = Math.max(1, Math.round(baseDefense * (1 + terrainMod + improvementBonus)));
  const tileTerrain = tile?.terrain;

  return {
    id: unit.id,
    factionId: unit.factionId,
    factionName: faction?.name ?? unit.factionId,
    q: unit.position.q,
    r: unit.position.r,
    hp: unit.hp,
    maxHp: unit.maxHp,
    attack: prototype?.derivedStats.attack ?? 0,
    defense: baseDefense,
    effectiveDefense,
    range: prototype?.derivedStats.range ?? 1,
    movesRemaining: unit.movesRemaining,
    movesMax: unit.maxMoves,
    acted: unit.factionId === state.activeFactionId ? !canAct : false,
    canAct,
    isActiveFaction: unit.factionId === state.activeFactionId,
    status: unit.factionId === state.activeFactionId
      ? (unit.status === 'fortified' ? 'fortified' as const : canAct ? 'ready' as const : 'spent' as const)
      : 'inactive' as const,
    prototypeId: unit.prototypeId,
    prototypeName: prototype?.name ?? unit.prototypeId,
    chassisId,
    movementClass: thisChassisMovementClass(prototype?.chassisId, registry),
    role: prototype?.derivedStats.role,
    spriteKey: getSpriteKeyForUnit(unit.factionId, prototype?.name ?? unit.prototypeId, chassisId, prototype?.sourceRecipeId),
    facing: unit.facing ?? 0,
    visible: unit.factionId === playerFactionId
      ? (hexVisibility.get(hexToKey(unit.position)) ?? 'hidden') !== 'hidden' ||
        tileTerrain === 'oasis'
      : (hexVisibility.get(hexToKey(unit.position)) ?? 'hidden') === 'visible',
    veteranLevel: unit.veteranLevel,
    xp: unit.xp,
    nativeDomain: faction?.nativeDomain,
    learnedAbilities: unit.learnedAbilities?.map((a) => a.domainId),
    isStealthed: isUnitEffectivelyStealthed(state, unit),
    poisoned: (unit.poisoned || (unit.poisonStacks ?? 0) > 0) || undefined,
    morale: unit.morale,
    routed: unit.routed || undefined,
    preparedAbility: unit.preparedAbility,
    isSettler: prototype?.tags?.includes('settler') || undefined,
    isEngineer: prototype?.tags?.includes('engineer') || undefined,
    canBrace: canBrace || undefined,
    canAmbush: canAmbush || undefined,
    ...(() => {
      const isPriestOrEngineer = prototype?.tags?.includes('priest') || prototype?.tags?.includes('engineer');
      if (!isPriestOrEngineer) return {};
      const check = canPriestSummon(state, unit, registry);
      return {
        canSummon: check.canSummon || undefined,
        summonName: check.summonName ?? undefined,
        summonBlockedReason: check.blockedReason ?? undefined,
      };
    })(),
    isEmbarked: unitTransport !== undefined || undefined,
    transportId: unitTransport?.transportId ?? null,
    boardableTransportIds: boardableTransportIds.length > 0 ? boardableTransportIds : undefined,
    validDisembarkHexes: validDisembarkHexes.length > 0 ? validDisembarkHexes : undefined,
    supplyCost: prototype ? getUnitSupplyCost(prototype, registry) : 1,
    isPrototype: prototype ? isUnlockPrototype(prototype) : false,
    summonTurnsRemaining: (() => {
      const fs = unit.factionId ? state.factions.get(unit.factionId)?.summonState : undefined;
      return fs?.summoned && fs.unitId === unit.id ? fs.turnsRemaining : undefined;
    })(),
  };
}

export { thisChassisMovementClass };
