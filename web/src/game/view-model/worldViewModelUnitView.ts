import type { RulesRegistry } from '../../../../src/data/registry/types.js';
import type { GameState, Unit } from '../../../../src/game/types.js';
import { getFaction, getPrototype, getResearch } from '../stateAccess.js';
import type { ResearchNodeId, CityId } from '../../../../src/types.js';
import { canUseAmbush, canUseBrace, getTerrainAt, hasAdjacentEnemy } from '../../../../src/systems/abilitySystem.js';
import { resolveCapabilityDoctrine } from '../../../../src/systems/capabilityDoctrine.js';
import { isUnitEffectivelyStealthed } from '../../../../src/systems/fogSystem.js';
import { isUnlockPrototype } from '../../../../src/systems/knowledgeSystem.js';
import { getUnitSupplyCost } from '../../../../src/systems/productionSystem.js';
import { canPriestSummon } from '../../../../src/systems/summonSystem.js';
import { getVeteranDefenseBonus } from '../../../../src/systems/combatSystem.js';
import { canBoardTransport, getUnitTransport, getValidDisembarkHexes, getEmbarkedUnits, isTransportUnit } from '../../../../src/systems/transportSystem.js';
import { getSpriteKeyForUnit, inferChassisId } from './spriteKeys.js';
import { hexToKey, hexDistance, getNeighbors } from '../../../../src/core/grid.js';
import { getImprovementBonus } from '../../../../src/systems/combat-action/helpers.js';
import { isWaterTerrain, isLandTerrain } from '../../../../src/systems/terrainUtils.js';
import { getConnectedWaterway } from '../../../../src/systems/submergeSystem.js';

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
  const improvementBonus = getImprovementBonus(state, unit.position, unit.factionId);
  const veteranDefBonus = getVeteranDefenseBonus(registry, unit.veteranLevel ?? '');
  // Note: situationalDefenseModifier (from brace, flanking, etc.) is combat-context-dependent
  // and cannot be precomputed here. The backend calculateDefense() includes it on a per-combat basis.
  const effectiveDefense = Math.max(1, Math.round(baseDefense * (1 + terrainMod + improvementBonus + veteranDefBonus)));
  const tileTerrain = tile?.terrain;

  // Precompute Bastion build eligibility — Hill Engineers (hill_clan) only,
  // gated on fortress native T3 + the 3-per-game bastionsBuilt cap.
  const unitFaction = state.factions.get(unit.factionId);
  const isHillClan = unitFaction?.id === 'hill_clan';
  const atFullMoves = unit.movesRemaining === unit.maxMoves;
  const hasExistingImprovement = getImprovementBonus(state, unit.position) > 0;
  const isInfantryOrRanged = prototype
    ? (thisChassisMovementClass(prototype?.chassisId, registry) === 'infantry' || prototype?.derivedStats?.role === 'ranged')
    : false;
  const canBuildBastion = !!factionDoctrine?.canBuildBastion
    && !!isHillClan && atFullMoves && !hasExistingImprovement && isInfantryOrRanged;

  const canDeclareMaelstrom = !!factionDoctrine?.canDeclareMaelstrom
    && isWaterTerrain(tileTerrain) && unit.status === 'ready' && unit.hp > 0;

  const canDeclareOasis = !!factionDoctrine?.canDeclareOasis
    && isLandTerrain(tileTerrain) && unit.status === 'ready' && unit.hp > 0;

  const submergeEligible = !!factionDoctrine?.submergeEnabled
    && isWaterTerrain(tileTerrain) && unit.status === 'ready' && unit.hp > 0;
  const submergeHexes = submergeEligible ? getConnectedWaterway(state, unit.position) : [];

  const canDestroyFort = !!isHillClan && atFullMoves && improvementBonus > 0
    && !!prototype?.tags?.includes('engineer');

  // Precompute sacrifice eligibility (has learned abilities, home city not besieged, adjacent to home city)
  const learnedCount = unit.learnedAbilities?.length ?? 0;
  const homeCity = unitFaction?.homeCityId
    ? state.cities.get(unitFaction.homeCityId as CityId)
    : undefined;
  const adjacentToHome = homeCity
    ? hexDistance(unit.position, { q: homeCity.position.q, r: homeCity.position.r }) <= 1
    : false;
  const canSacrifice = !!(unitFaction && learnedCount > 0 && homeCity
    && homeCity.factionId === unit.factionId && !homeCity.besieged && adjacentToHome);

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
    canBuildBastion: canBuildBastion || undefined,
    canDeclareMaelstrom: canDeclareMaelstrom || undefined,
    canDeclareOasis: canDeclareOasis || undefined,
    canSubmerge: (submergeEligible && submergeHexes.length > 0) || undefined,
    submergeHexes: submergeHexes.length > 0 ? submergeHexes : undefined,
    canDestroyFort: canDestroyFort || undefined,
    canSacrifice: canSacrifice || undefined,
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
    ...(() => {
      if (!prototype || !isTransportUnit(prototype, registry)) return {};
      const embarked = getEmbarkedUnits(unit.id, state.transportMap);
      if (embarked.length === 0) return {};
      const validDisembark = getValidDisembarkHexes(state, unit.id, registry, state.transportMap);
      return {
        embarkedUnitIds: embarked,
        embarkedValidDisembarkHexes: validDisembark.length > 0 ? validDisembark : undefined,
      };
    })(),
    supplyCost: prototype ? getUnitSupplyCost(prototype, registry) : 1,
    isPrototype: prototype ? isUnlockPrototype(prototype) : false,
    summonTurnsRemaining: (() => {
      const fs = unit.factionId ? state.factions.get(unit.factionId)?.summonState : undefined;
      return fs?.summoned && fs.unitId === unit.id ? fs.turnsRemaining : undefined;
    })(),
  };
}

export { thisChassisMovementClass };
