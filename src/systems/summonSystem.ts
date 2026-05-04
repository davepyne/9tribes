import type { GameState, Unit, HexCoord } from '../game/types.js';
import type { RulesRegistry } from '../data/registry/types.js';
import type { FactionId, UnitId, PrototypeId, ChassisId } from '../types.js';
import type { Prototype } from '../features/prototypes/types.js';
import type { VeteranLevel, UnitStatus } from '../core/enums.js';
import { getNeighbors } from '../core/grid.js';
import { hexToKey } from '../core/grid.js';
import { isHexOccupied } from './occupancySystem.js';
import { getTerrainAt } from './abilitySystem.js';
import { createUnitId } from '../core/ids.js';

export interface PriestSummonCheck {
  canSummon: boolean;
  summonName: string | null;
  blockedReason: string | null;
}

/**
 * canPriestSummon — check if a priest unit can summon its faction's creature.
 * Requirements: priest tag, ready status, on matching terrain, summon not active,
 * cooldown expired, and an adjacent empty passable hex exists.
 */
export function canPriestSummon(
  state: GameState,
  unit: Unit,
  registry: RulesRegistry,
): PriestSummonCheck {
  const prototype = state.prototypes.get(unit.prototypeId);
  if (!prototype || (!prototype.tags?.includes('priest') && !prototype.tags?.includes('engineer'))) {
    return { canSummon: false, summonName: null, blockedReason: 'Not a summoner' };
  }

  if (unit.status !== 'ready') {
    return { canSummon: false, summonName: null, blockedReason: 'Already acted' };
  }

  const faction = state.factions.get(unit.factionId);
  if (!faction) {
    return { canSummon: false, summonName: null, blockedReason: 'No faction' };
  }

  const abilities = registry.getSignatureAbility(unit.factionId);
  if (!abilities?.summon) {
    return { canSummon: false, summonName: null, blockedReason: 'No summon ability' };
  }

  const summonConfig = abilities.summon;
  const summonState = faction.summonState;

  if (summonState?.summoned) {
    return { canSummon: false, summonName: summonConfig.name, blockedReason: `${summonConfig.name} already active` };
  }

  if ((summonState?.cooldownRemaining ?? 0) > 0) {
    return { canSummon: false, summonName: summonConfig.name, blockedReason: `Cooldown: ${summonState!.cooldownRemaining} turns` };
  }

  const terrainId = getTerrainAt(state, unit.position);
  if (!summonConfig.terrainTypes.includes(terrainId)) {
    return { canSummon: false, summonName: summonConfig.name, blockedReason: `Must be on ${summonConfig.terrainTypes.join('/')}` };
  }

  const neighbors = getNeighbors(unit.position);
  let hasSpawnHex = false;
  for (const hex of neighbors) {
    const tile = state.map?.tiles.get(hexToKey(hex));
    if (!tile) continue;
    const terrainDef = registry.getTerrain(tile.terrain);
    if (terrainDef?.passable === false) continue;
    if (isHexOccupied(state, hex)) continue;
    hasSpawnHex = true;
    break;
  }

  if (!hasSpawnHex) {
    return { canSummon: false, summonName: summonConfig.name, blockedReason: 'No space to spawn' };
  }

  return { canSummon: true, summonName: summonConfig.name, blockedReason: null };
}

/**
 * attemptPriestSummon — spawn the faction's summon creature adjacent to a priest unit.
 * Returns updated GameState. Does not check eligibility — caller must use canPriestSummon first.
 */
export function attemptPriestSummon(
  state: GameState,
  priestUnit: Unit,
  registry: RulesRegistry,
): GameState | null {
  const faction = state.factions.get(priestUnit.factionId);
  if (!faction || !state.map) return null;

  const abilities = registry.getSignatureAbility(priestUnit.factionId);
  if (!abilities?.summon) return null;

  const summonConfig = abilities.summon;
  const summonDuration = abilities.summonDuration ?? 5;

  const neighbors = getNeighbors(priestUnit.position);
  let spawnHex: HexCoord | null = null;
  for (const hex of neighbors) {
    const tile = state.map.tiles.get(hexToKey(hex));
    if (!tile) continue;
    const terrainDef = registry.getTerrain(tile.terrain);
    if (terrainDef?.passable === false) continue;
    if (isHexOccupied(state, hex)) continue;
    spawnHex = hex;
    break;
  }

  if (!spawnHex) return null;

  let current: GameState = { ...state };

  const prototypeId = `${priestUnit.factionId}_${summonConfig.chassisId}` as PrototypeId;
  if (!current.prototypes.has(prototypeId)) {
    const chassisDef = registry.getChassis(summonConfig.chassisId);
    const summonHp = chassisDef?.baseHp ?? 10;
    const summonAttack = chassisDef?.baseAttack ?? 2;
    const summonDefense = chassisDef?.baseDefense ?? 2;
    const summonMoves = chassisDef?.baseMoves ?? 2;
    const summonRange = chassisDef?.baseRange ?? 1;
    const summonRole = chassisDef?.role ?? 'melee';

    const summonPrototype: Prototype = {
      id: prototypeId,
      factionId: priestUnit.factionId,
      chassisId: summonConfig.chassisId as ChassisId,
      componentIds: [],
      version: 1,
      name: summonConfig.name,
      derivedStats: {
        attack: summonAttack,
        defense: summonDefense,
        hp: summonHp,
        moves: summonMoves,
        range: summonRange,
        role: summonRole,
      },
      tags: summonConfig.tags,
    };
    const prototypes = new Map(current.prototypes);
    prototypes.set(prototypeId, summonPrototype);
    current = { ...current, prototypes };
  }

  const chassisDef = registry.getChassis(summonConfig.chassisId);
  const summonHp = chassisDef?.baseHp ?? 10;
  const summonMoves = chassisDef?.baseMoves ?? 2;

  const summonUnitId = createUnitId() as UnitId;
  const summonUnit: Unit = {
    id: summonUnitId,
    factionId: priestUnit.factionId,
    position: spawnHex,
    facing: 0,
    hp: summonHp,
    maxHp: summonHp,
    movesRemaining: summonMoves,
    maxMoves: summonMoves,
    attacksRemaining: 1,
    xp: 0,
    veteranLevel: 'green' as VeteranLevel,
    status: 'ready' as UnitStatus,
    prototypeId: prototypeId,
    history: [],
    morale: 100,
    routed: false,
    poisoned: false,
    enteredZoCThisActivation: false,
    poisonStacks: 0,
    poisonTurnsRemaining: 0,
    isStealthed: false,
    turnsSinceStealthBreak: 0,
    learnedAbilities: [],
  };

  const units = new Map(current.units);
  units.set(summonUnitId, summonUnit);

  const spentPriest: Unit = {
    ...priestUnit,
    status: 'spent' as UnitStatus,
    movesRemaining: 0,
    attacksRemaining: 0,
  };
  units.set(priestUnit.id, spentPriest);

  const summonState = {
    summoned: true,
    turnsRemaining: summonDuration,
    cooldownRemaining: 0,
    unitId: summonUnitId,
  };

  const updatedFaction = {
    ...faction,
    unitIds: [...faction.unitIds, summonUnitId],
    summonState,
  };
  const factions = new Map(current.factions);
  factions.set(priestUnit.factionId, updatedFaction);

  return { ...current, units, factions };
}
