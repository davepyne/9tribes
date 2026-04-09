import { describe, expect, it } from 'vitest';
import { assemblePrototype } from '../src/design/assemblePrototype';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import type { GameState } from '../src/game/types';
import { applyCombatAction, previewCombatAction } from '../src/systems/combatActionSystem';
import { startResearch } from '../src/systems/researchSystem';
import { runFactionPhase } from '../src/systems/factionPhaseSystem';
import { GameSession } from '../web/src/game/controller/GameSession';
import { deserializeGameState, serializeGameState } from '../web/src/game/types/playState';

const registry = loadRulesRegistry();

function cloneState(state: GameState): GameState {
  return deserializeGameState(serializeGameState(state));
}

function trimStateToFactions(state: GameState, factionIds: string[]) {
  const factionSet = new Set(factionIds);
  const unitEntries = Array.from(state.units.entries()).filter(([, unit]) => factionSet.has(unit.factionId));
  const cityEntries = Array.from(state.cities.entries()).filter(([, city]) => factionSet.has(city.factionId));
  const villageEntries = Array.from(state.villages.entries()).filter(([, village]) => factionSet.has(village.factionId));

  state.factions = new Map(
    Array.from(state.factions.entries())
      .filter(([id]) => factionSet.has(id))
      .map(([id, faction]) => [
        id,
        {
          ...faction,
          unitIds: faction.unitIds.filter((unitId) => unitEntries.some(([entryId]) => entryId === unitId)),
          cityIds: faction.cityIds.filter((cityId) => cityEntries.some(([entryId]) => entryId === cityId)),
          villageIds: faction.villageIds.filter((villageId) => villageEntries.some(([entryId]) => entryId === villageId)),
        },
      ]),
  );
  state.factionResearch = new Map(Array.from(state.factionResearch.entries()).filter(([id]) => factionSet.has(id)));
  state.units = new Map(unitEntries);
  state.cities = new Map(cityEntries);
  state.villages = new Map(villageEntries);
  state.economy = new Map(Array.from(state.economy.entries()).filter(([id]) => factionSet.has(id)));
  state.research = new Map(Array.from(state.research.entries()).filter(([id]) => factionSet.has(id)));
  state.warExhaustion = new Map(Array.from(state.warExhaustion.entries()).filter(([id]) => factionSet.has(id)));
  state.factionStrategies = new Map(Array.from(state.factionStrategies.entries()).filter(([id]) => factionSet.has(id)));
  state.fogState = new Map(Array.from(state.fogState.entries()).filter(([id]) => factionSet.has(id)));
}

function runLiveEndTurn(state: GameState, humanControlledFactionIds: string[]): GameState {
  const session = new GameSession(
    { type: 'serialized', payload: serializeGameState(state) },
    registry,
    { humanControlledFactionIds },
  );

  session.dispatch({ type: 'end_turn' });
  return session.getState();
}

function runSimFactionPhase(state: GameState, factionId: string): GameState {
  return runFactionPhase(cloneState(state), factionId as never, registry);
}

function runLiveCombat(state: GameState, attackerId: string, defenderId: string, humanControlledFactionIds: string[]) {
  const session = new GameSession(
    { type: 'serialized', payload: serializeGameState(state) },
    registry,
    { humanControlledFactionIds },
  );
  session.dispatch({ type: 'attack_unit', attackerId, defenderId });
  const pending = session.getPendingCombat();
  expect(pending).toBeTruthy();
  if (pending) {
    session.applyResolvedCombat(pending);
  }
  return session.getState();
}

function runSharedCombat(state: GameState, attackerId: string, defenderId: string, humanControlledFactionIds: string[]) {
  const session = new GameSession(
    { type: 'serialized', payload: serializeGameState(state) },
    registry,
    { humanControlledFactionIds },
  );
  const preparedState = session.getState();
  const preview = previewCombatAction(preparedState, registry, attackerId as never, defenderId as never);
  expect(preview).toBeTruthy();
  if (!preview) {
    return preparedState;
  }
  return applyCombatAction(preparedState, registry, preview).state;
}

function sortRecord(record: Record<string, number>) {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
}

function normalizeTransportMap(state: GameState) {
  return Array.from(state.transportMap.entries())
    .map(([transportId, transportState]) => ({
      transportId,
      embarkedUnitIds: [...transportState.embarkedUnitIds].sort(),
    }))
    .sort((left, right) => left.transportId.localeCompare(right.transportId));
}

function normalizePoisonTraps(state: GameState) {
  return Array.from(state.poisonTraps.entries())
    .map(([hex, trap]) => ({
      hex,
      damage: trap.damage,
      slow: trap.slow,
      ownerFactionId: trap.ownerFactionId,
    }))
    .sort((left, right) => left.hex.localeCompare(right.hex));
}

function normalizeUnit(state: GameState, unitId: string) {
  const unit = state.units.get(unitId as never);
  if (!unit) {
    return null;
  }

  return {
    hp: unit.hp,
    morale: unit.morale,
    routed: unit.routed,
    preparedAbility: unit.preparedAbility ?? null,
    isStealthed: unit.isStealthed ?? false,
    poisoned: unit.poisoned ?? false,
    poisonStacks: unit.poisonStacks ?? 0,
    frostbiteStacks: unit.frostbiteStacks ?? 0,
    frostbiteDoTDuration: unit.frostbiteDoTDuration ?? 0,
    position: { q: unit.position.q, r: unit.position.r },
  };
}

function normalizeCity(state: GameState, cityId: string) {
  const city = state.cities.get(cityId as never);
  if (!city) {
    return null;
  }

  return {
    factionId: city.factionId,
    besieged: city.besieged,
    wallHP: city.wallHP,
    maxWallHP: city.maxWallHP,
    turnsUnderSiege: city.turnsUnderSiege,
  };
}

function buildParitySlice(
  state: GameState,
  options: {
    factionIds: string[];
    unitIds?: string[];
    cityIds?: string[];
  },
) {
  const units = Object.fromEntries((options.unitIds ?? []).map((unitId) => [unitId, normalizeUnit(state, unitId)]));
  const cities = Object.fromEntries((options.cityIds ?? []).map((cityId) => [cityId, normalizeCity(state, cityId)]));
  const factions = Object.fromEntries(
    options.factionIds.map((factionId) => {
      const faction = state.factions.get(factionId as never);
      const research = state.research.get(factionId as never);
      const warExhaustion = state.warExhaustion.get(factionId as never);
      return [
        factionId,
        {
          learnedDomains: [...(faction?.learnedDomains ?? [])].sort(),
          unlockedRecipeIds: [...(faction?.capabilities?.unlockedRecipeIds ?? [])].sort(),
          research: research
            ? {
                activeNodeId: research.activeNodeId,
                completedNodes: [...research.completedNodes].sort(),
                progressByNodeId: sortRecord({ ...research.progressByNodeId } as Record<string, number>),
              }
            : null,
          warExhaustion: warExhaustion
            ? {
                exhaustionPoints: warExhaustion.exhaustionPoints,
                turnsWithoutLoss: warExhaustion.turnsWithoutLoss,
              }
            : null,
        },
      ];
    }),
  );

  return {
    units,
    cities,
    factions,
    transportMap: normalizeTransportMap(state),
    poisonTraps: normalizePoisonTraps(state),
    contaminatedHexes: [...state.contaminatedHexes].sort(),
  };
}

describe('live session parity harness', () => {
  it('matches the shared faction phase for poison and environmental upkeep', () => {
    const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });
    const steppeId = 'steppe_clan';
    trimStateToFactions(state, [steppeId]);

    const unitId = state.factions.get(steppeId as never)!.unitIds[0];
    state.activeFactionId = steppeId as never;
    state.units.set(unitId as never, {
      ...state.units.get(unitId as never)!,
      position: { q: 14, r: 5 },
      hp: 6,
      poisoned: true,
      poisonStacks: 1,
      morale: 80,
      status: 'spent',
      movesRemaining: 0,
      attacksRemaining: 0,
    });

    const live = runLiveEndTurn(cloneState(state), [steppeId]);
    const sim = runSimFactionPhase(state, steppeId);

    expect(
      buildParitySlice(live, { factionIds: [steppeId], unitIds: [unitId] }),
    ).toEqual(
      buildParitySlice(sim, { factionIds: [steppeId], unitIds: [unitId] }),
    );
  });

  it('matches the shared faction phase for research progress and unlock refresh', () => {
    const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });
    const steppeId = 'steppe_clan';
    trimStateToFactions(state, [steppeId]);

    const faction = state.factions.get(steppeId as never)!;
    const research = state.research.get(steppeId as never)!;
    const nodeDef = registry.getResearchNode('charge', 'charge_t2');
    expect(nodeDef).toBeTruthy();

    research.completedNodes.push('charge_t1' as never);
    state.research.set(
      steppeId as never,
      startResearch(research, 'charge_t2' as never, nodeDef!.prerequisites, faction.learnedDomains),
    );
    state.activeFactionId = steppeId as never;

    const live = runLiveEndTurn(cloneState(state), [steppeId]);
    const sim = runSimFactionPhase(state, steppeId);

    expect(
      buildParitySlice(live, { factionIds: [steppeId] }),
    ).toEqual(
      buildParitySlice(sim, { factionIds: [steppeId] }),
    );
  });

  it('matches the shared faction phase for war-exhaustion ticking and morale penalties', () => {
    const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });
    const steppeId = 'steppe_clan';
    trimStateToFactions(state, [steppeId]);

    const unitId = state.factions.get(steppeId as never)!.unitIds[0];
    state.activeFactionId = steppeId as never;
    state.warExhaustion.set(steppeId as never, {
      factionId: steppeId as never,
      exhaustionPoints: 12,
      turnsWithoutLoss: 0,
    });
    state.units.set(unitId as never, {
      ...state.units.get(unitId as never)!,
      morale: 100,
      status: 'spent',
      movesRemaining: 0,
      attacksRemaining: 0,
    });

    const live = runLiveEndTurn(cloneState(state), [steppeId]);
    const sim = runSimFactionPhase(state, steppeId);

    expect(
      buildParitySlice(live, { factionIds: [steppeId], unitIds: [unitId] }),
    ).toEqual(
      buildParitySlice(sim, { factionIds: [steppeId], unitIds: [unitId] }),
    );
  });

  it('matches the shared faction phase for siege start on an encircled city', () => {
    const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });
    const attackerId = 'steppe_clan';
    const defenderId = 'hill_clan';
    trimStateToFactions(state, [attackerId, defenderId]);

    const attackerFaction = state.factions.get(attackerId as never)!;
    const defenderFaction = state.factions.get(defenderId as never)!;
    const cityId = defenderFaction.cityIds[0];
    const city = state.cities.get(cityId as never)!;
    const defenderCityPosition = { q: 8, r: 6 };
    const baseUnits = attackerFaction.unitIds.map((unitId) => state.units.get(unitId as never)!);
    const siegeUnits = [
      {
        ...baseUnits[0],
        position: { q: 9, r: 6 },
      },
      {
        ...baseUnits[1],
        position: { q: 9, r: 5 },
      },
      {
        ...baseUnits[0],
        id: 'parity_siege_attacker_3' as never,
        position: { q: 8, r: 5 },
      },
      {
        ...baseUnits[1],
        id: 'parity_siege_attacker_4' as never,
        position: { q: 7, r: 6 },
      },
    ];

    state.cities.set(cityId as never, {
      ...city,
      position: defenderCityPosition,
      besieged: false,
      turnsUnderSiege: 0,
    });
    state.units = new Map([
      ...siegeUnits.map((unit) => [unit.id, {
        ...unit,
        status: 'ready' as const,
        attacksRemaining: 1,
        movesRemaining: unit.maxMoves,
      }]),
    ]);
    state.factions.set(attackerId as never, {
      ...attackerFaction,
      unitIds: siegeUnits.map((unit) => unit.id),
    });
    state.factions.set(defenderId as never, {
      ...defenderFaction,
      unitIds: [],
      cityIds: [cityId],
    });
    state.activeFactionId = defenderId as never;

    const live = runLiveEndTurn(cloneState(state), [attackerId, defenderId]);
    const sim = runSimFactionPhase(state, defenderId);

    expect(
      buildParitySlice(live, { factionIds: [defenderId], cityIds: [cityId] }),
    ).toEqual(
      buildParitySlice(sim, { factionIds: [defenderId], cityIds: [cityId] }),
    );
  });

  it('matches the shared combat application for kill-capture resolution', () => {
    const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });
    const attackerId = 'coral_people';
    const defenderId = 'druid_circle';
    trimStateToFactions(state, [attackerId, defenderId]);

    const attackerFaction = state.factions.get(attackerId as never)!;
    const defenderFaction = state.factions.get(defenderId as never)!;
    const slaverProto = assemblePrototype(
      attackerFaction.id,
      'infantry_frame' as never,
      ['slaver_net', 'simple_armor'] as never,
      registry,
      Array.from(state.prototypes.keys()),
      {
        capabilityLevels: attackerFaction.capabilities?.domainLevels,
        validation: { ignoreResearchRequirements: true },
      },
    );
    state.prototypes.set(slaverProto.id, slaverProto);

    const combatAttackerId = 'parity_kill_capture_attacker';
    const combatDefenderId = defenderFaction.unitIds[0];
    const attackerBase = state.units.get(attackerFaction.unitIds[0] as never)!;
    const defenderBase = state.units.get(combatDefenderId as never)!;

    state.units = new Map([
      [
        combatAttackerId as never,
        {
          ...attackerBase,
          id: combatAttackerId as never,
          factionId: attackerFaction.id,
          prototypeId: slaverProto.id,
          position: { q: 10, r: 10 },
          hp: slaverProto.derivedStats.hp,
          maxHp: slaverProto.derivedStats.hp,
          movesRemaining: slaverProto.derivedStats.moves,
          maxMoves: slaverProto.derivedStats.moves,
          attacksRemaining: 1,
          status: 'ready' as const,
          history: [],
          poisonStacks: 0,
          isStealthed: false,
          turnsSinceStealthBreak: 0,
          learnedAbilities: [],
        },
      ],
      [
        combatDefenderId as never,
        {
          ...defenderBase,
          position: { q: 11, r: 10 },
          hp: 3,
          morale: 60,
          routed: false,
          attacksRemaining: 1,
          movesRemaining: defenderBase.maxMoves,
          maxMoves: defenderBase.maxMoves,
          status: 'ready' as const,
          history: [],
          poisonStacks: 0,
          isStealthed: false,
          turnsSinceStealthBreak: 0,
          learnedAbilities: [],
        },
      ],
    ]);
    state.factions.set(attackerFaction.id, {
      ...attackerFaction,
      unitIds: [combatAttackerId],
      cityIds: [],
      villageIds: [],
    });
    state.factions.set(defenderFaction.id, {
      ...defenderFaction,
      unitIds: [combatDefenderId],
      cityIds: [],
      villageIds: [],
    });
    state.cities = new Map();
    state.villages = new Map();
    state.improvements = new Map();
    state.activeFactionId = attackerFaction.id;
    state.rngState = { seed: 3, state: 3 };

    const live = runLiveCombat(cloneState(state), combatAttackerId, combatDefenderId, [attackerFaction.id]);
    const shared = runSharedCombat(state, combatAttackerId, combatDefenderId, [attackerFaction.id]);

    expect(
      buildParitySlice(live, { factionIds: [attackerId, defenderId], unitIds: [combatAttackerId, combatDefenderId] }),
    ).toEqual(
      buildParitySlice(shared, { factionIds: [attackerId, defenderId], unitIds: [combatAttackerId, combatDefenderId] }),
    );
  });

});
