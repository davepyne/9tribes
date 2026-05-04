import civilizationsData from '../content/base/civilizations.json' assert { type: 'json' };
import type { GameState } from '../game/types.js';
import { getVictoryStatus, type SimulationTrace, type TurnSnapshot } from '../systems/warEcologySimulation.js';
import type {
  ReplayBundle,
  ReplayFactionSummary,
  ReplayTurn,
  ReplayTurnSnapshot,
  ReplayTurnUnit,
  ReplayTurnCity,
  ReplayTurnVillage,
} from './types.js';

type CivilizationConfig = {
  id: string;
  name: string;
  color?: string;
};

const CIVILIZATIONS = civilizationsData as Record<string, CivilizationConfig>;

export function exportReplayBundle(
  finalState: GameState,
  trace: SimulationTrace,
  maxTurns: number
): ReplayBundle {
  const map = finalState.map;
  if (!map) {
    throw new Error('Cannot export replay bundle without a map.');
  }

  const factions: ReplayFactionSummary[] = Array.from(finalState.factions.values()).map((faction) => {
    const civConfig = CIVILIZATIONS[faction.id as string];
    return {
      id: faction.id,
      name: faction.name,
      color: civConfig?.color ?? '#888888',
      nativeDomain: faction.nativeDomain,
      learnedDomains: faction.learnedDomains,
      homeBiome: faction.identityProfile.homeBiome,
      signatureUnit: faction.identityProfile.signatureUnit,
      passiveTrait: faction.identityProfile.passiveTrait,
      economyAngle: faction.identityProfile.economyAngle,
      terrainDependence: faction.identityProfile.terrainDependence,
      capabilities: faction.capabilities?.domainLevels ?? {},
    };
  });

  const snapshotsByRound = new Map<number, { start?: TurnSnapshot; end?: TurnSnapshot }>();
  for (const snapshot of trace.snapshots ?? []) {
    const entry = snapshotsByRound.get(snapshot.round) ?? {};
    entry[snapshot.phase] = snapshot;
    snapshotsByRound.set(snapshot.round, entry);
  }

  const groupedEvents = groupByRound(trace.events ?? []);
  const groupedCombatEvents = groupByRound(trace.combatEvents ?? []);
  const groupedSiegeEvents = groupByRound(trace.siegeEvents ?? []);
  const groupedAiEvents = groupByRound(trace.aiIntentEvents ?? []);
  const groupedStrategyEvents = groupByRound(trace.factionStrategyEvents ?? []);

  const turns: ReplayTurn[] = Array.from(snapshotsByRound.entries())
    .sort(([left], [right]) => left - right)
    .map(([round, snapshots]) => {
      const snapshotStart = snapshots.start ?? snapshots.end;
      const snapshotEnd = snapshots.end ?? snapshots.start;
      if (!snapshotStart || !snapshotEnd) {
        throw new Error(`Replay export missing snapshots for round ${round}.`);
      }

      return {
        round,
        snapshotStart: toReplaySnapshot(snapshotStart, finalState),
        snapshotEnd: toReplaySnapshot(snapshotEnd, finalState),
        events: groupedEvents.get(round) ?? [],
        combatEvents: groupedCombatEvents.get(round) ?? [],
        siegeEvents: groupedSiegeEvents.get(round) ?? [],
        aiIntentEvents: groupedAiEvents.get(round) ?? [],
        factionStrategyEvents: groupedStrategyEvents.get(round) ?? [],
      };
    });

  const victory = getVictoryStatus(finalState);

  return {
    version: 3,
    generatedAt: new Date().toISOString(),
    seed: finalState.seed,
    maxTurns,
    map: {
      width: map.width,
      height: map.height,
      hexes: Array.from(map.tiles.values()).map((tile) => ({
        key: `${tile.position.q},${tile.position.r}`,
        q: tile.position.q,
        r: tile.position.r,
        terrain: tile.terrain,
      })),
    },
    factions,
    turns,
    victory: {
      winnerFactionId: victory.winnerFactionId,
      victoryType: victory.victoryType,
      controlledCities: victory.controlledCities,
      dominationThreshold: victory.dominationThreshold,
    },
  };
}

function toReplaySnapshot(snapshot: TurnSnapshot, finalState: GameState): ReplayTurnSnapshot {
  return {
    round: snapshot.round,
    phase: snapshot.phase,
    factions: snapshot.factions.map((faction) => ({
      id: faction.id,
      name: faction.name,
      livingUnits: faction.livingUnits,
      cities: faction.cities,
      villages: faction.villages,
    })),
    units: snapshot.units.map((unit): ReplayTurnUnit => ({
      id: unit.id,
      factionId: unit.factionId,
      prototypeId: unit.prototypeId,
      prototypeName: finalState.prototypes.get(unit.prototypeId)?.name ?? unit.prototypeId,
      q: unit.q,
      r: unit.r,
      hp: unit.hp,
      maxHp: unit.maxHp,
      facing: unit.facing,
    })),
    cities: snapshot.cities.map((city): ReplayTurnCity => ({
      id: city.id,
      name: finalState.cities.get(city.id)?.name ?? city.id,
      factionId: city.factionId,
      q: city.q,
      r: city.r,
      besieged: city.besieged,
      wallHp: city.wallHP,
      maxWallHp: city.maxWallHP,
      turnsUnderSiege: city.turnsUnderSiege,
    })),
    villages: snapshot.villages.map((village): ReplayTurnVillage => ({
      id: village.id,
      name: finalState.villages.get(village.id)?.name ?? village.id,
      factionId: village.factionId,
      q: village.q,
      r: village.r,
    })),
    factionTripleStacks: (snapshot.factionTripleStacks ?? []).map((stack) => ({
      factionId: stack.factionId,
      domains: stack.domains,
      tripleName: stack.tripleName,
      emergentRule: stack.emergentRule,
    })),
  };
}

function groupByRound<T extends { round: number }>(items: T[]): Map<number, T[]> {
  const grouped = new Map<number, T[]>();
  for (const item of items) {
    const list = grouped.get(item.round) ?? [];
    list.push(item);
    grouped.set(item.round, list);
  }
  return grouped;
}
