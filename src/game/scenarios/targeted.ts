import type { GameState } from '../../game/types.js';
import type { RulesRegistry } from '../../data/registry/types.js';
import type { FactionId, ChassisId, ComponentId, PrototypeId, CityId } from '../../types.js';
import type { Unit } from '../../features/units/types.js';
import { assemblePrototype } from '../../design/assemblePrototype.js';
import { createUnitId } from '../../core/ids.js';
import { recordUnitCreated } from '../../systems/historySystem.js';
import { hexToKey } from '../../core/grid.js';
import type { VeteranLevel } from '../../core/enums.js';

export interface UnitPlacement {
  chassisId: string;
  componentIds: string[];
  offset: { q: number; r: number };
}

export interface PlaceEnemyNearCityOptions {
  targetFactionId: FactionId;
  enemyFactionId: FactionId;
  cityIndex?: number;
  enemyUnits: UnitPlacement[];
  defenderUnits?: UnitPlacement[];
}

function spawnUnit(
  state: GameState,
  registry: RulesRegistry,
  factionId: FactionId,
  chassisId: string,
  componentIds: string[],
  position: { q: number; r: number },
): Unit {
  const faction = state.factions.get(factionId)!;
  const existingIds = faction.prototypeIds as unknown as PrototypeId[];
  const prototype = assemblePrototype(
    factionId,
    chassisId as ChassisId,
    componentIds as unknown as ComponentId[],
    registry,
    existingIds,
    {
      faction,
      validation: { ignoreResearchRequirements: true, ignoreProgressionRequirements: true },
    },
  );
  state.prototypes.set(prototype.id, prototype);
  faction.prototypeIds.push(prototype.id);

  const unitId = createUnitId();
  let unit: Unit = {
    id: unitId,
    factionId,
    position,
    facing: 0,
    hp: prototype.derivedStats.hp,
    maxHp: prototype.derivedStats.hp,
    movesRemaining: prototype.derivedStats.moves + (prototype.movesBonus ?? 0),
    maxMoves: prototype.derivedStats.moves + (prototype.movesBonus ?? 0),
    attacksRemaining: 1,
    xp: 0,
    veteranLevel: 'green' as VeteranLevel,
    status: 'ready',
    prototypeId: prototype.id,
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
  unit = recordUnitCreated(unit, factionId, prototype.id);
  state.units.set(unitId, unit);
  faction.unitIds.push(unitId);
  return unit;
}

export function placeEnemyNearCity(
  state: GameState,
  registry: RulesRegistry,
  opts: PlaceEnemyNearCityOptions,
): GameState {
  const targetFaction = state.factions.get(opts.targetFactionId)!;
  const cityId = targetFaction.cityIds[opts.cityIndex ?? 0] as CityId | undefined;
  if (!cityId) throw new Error(`No city at index ${opts.cityIndex ?? 0} for faction ${opts.targetFactionId}`);
  const city = state.cities.get(cityId)!;
  const cityPos = city.position;

  for (const eu of opts.enemyUnits) {
    spawnUnit(
      state, registry, opts.enemyFactionId,
      eu.chassisId, eu.componentIds,
      { q: cityPos.q + eu.offset.q, r: cityPos.r + eu.offset.r },
    );
  }

  if (opts.defenderUnits) {
    for (const du of opts.defenderUnits) {
      spawnUnit(
        state, registry, opts.targetFactionId,
        du.chassisId, du.componentIds,
        { q: cityPos.q + du.offset.q, r: cityPos.r + du.offset.r },
      );
    }
  }

  return state;
}
