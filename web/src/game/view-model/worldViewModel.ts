import civilizationsData from '../../../../src/content/base/civilizations.json';
import { getNeighbors, hexDistance, hexToKey } from '../../../../src/core/grid.js';
import type { RulesRegistry } from '../../../../src/data/registry/types.js';
import type { FactionId, GameState, Unit } from '../../../../src/game/types.js';
import { getPrototype } from '../stateAccess.js';
import { deriveResourceIncome, getSupplyDeficit } from '../../../../src/systems/economySystem.js';
import { getUnitSupplyCost } from '../../../../src/systems/productionSystem.js';
import { getValidMoves } from '../../../../src/systems/movementSystem.js';
import { SIEGE_CONFIG } from '../../../../src/systems/siegeSystem.js';
import { getVictoryStatus } from '../../../../src/systems/warEcologySimulation.js';
import { getHexOwner } from '../../../../src/systems/territorySystem.js';
import { getSpriteKeyForImprovement } from './spriteKeys.js';
import { buildSettlementPreview } from './inspectors/cityInspectorViewModel.js';
import { buildResearchInspectorViewModel } from './inspectors/researchInspectorViewModel.js';
import { buildUnitView } from './worldViewModelUnitView.js';
import { buildResearchChip, describePlaySelection } from './worldViewModelSelection.js';
import type {
  ClientSelection,
  DebugViewModel,
  HudViewModel,
  ResearchInspectorViewModel,
} from '../types/clientState';
import type { ReplayCombatEvent } from '../types/replay';
import type {
  AttackTargetView,
  BorderSide,
  FactionView,
  HexCoord,
  PathPreviewNodeView,
  ReachableHexView,
  WorldViewModel,
} from '../types/worldView';
import { getResearch, getFaction } from '../stateAccess.js';
import { isUnitEmbarked } from '../../../../src/systems/transportSystem.js';

type PlayWorldSource = {
  kind: 'play';
  state: GameState;
  registry: RulesRegistry;
  playerFactionId: string | null;
  reachableHexes: ReachableHexView[];
  attackHexes: AttackTargetView[];
  disembarkHexes: ReachableHexView[];
  pathPreview: PathPreviewNodeView[];
  queuedPath: PathPreviewNodeView[];
  lastMove: { unitId: string; destination: HexCoord } | null;
};

type CivilizationPalette = Record<string, {
  color?: string;
}>;

const CIVILIZATIONS = civilizationsData as CivilizationPalette;
const BORDER_DIRECTIONS: Array<{ side: BorderSide; dq: number; dr: number }> = [
  { side: 'nw', dq: -1, dr: 0 },
  { side: 'n',  dq: -1, dr: -1 },
  { side: 'ne', dq: 0,  dr: -1 },
  { side: 'se', dq: 1,  dr: 0 },
  { side: 's',  dq: 1,  dr: 1 },
  { side: 'sw', dq: 0,  dr: 1 },
];

export function buildWorldViewModel(source: PlayWorldSource): WorldViewModel {
  return buildPlayWorldViewModel(source);
}

export function buildHudViewModel(
  source: GameState,
  selected: ClientSelection,
  hoveredKey: string | null,
  world: WorldViewModel,
  registry?: RulesRegistry,
  liveCombatEvents?: ReplayCombatEvent[],
  playerFactionId?: string | null,
): HudViewModel {
  return buildPlayHudViewModel(source, selected, hoveredKey, world, registry, liveCombatEvents, playerFactionId);
}

export function buildDebugViewModel(
  events: Array<{ round: number; message: string }> = [],
): DebugViewModel {
  return {
    turnEvents: events.slice(0, 10),
  };
}

export function getCombatSummary(event: ReplayCombatEvent) {
  const effects = event.breakdown.triggeredEffects.map((effect) => effect.label).join(', ');
  return `${event.attackerPrototypeName} vs ${event.defenderPrototypeName} · ${effects || 'no triggers'}`;
}

export { buildResearchInspectorViewModel };

function buildPlayWorldViewModel(source: PlayWorldSource): WorldViewModel {
  const { state } = source;
  if (!state.map) {
    throw new Error('Cannot build play-mode world view without a map.');
  }

  const factions = buildPlayFactions(state);
  const hexVisibility = buildHexVisibilityMap(state, source.playerFactionId);
  const hexes = Array.from(state.map.tiles.values()).map((tile) => {
    const key = hexToKey(tile.position);
    const ownerFactionId = getHexOwner(tile.position, state) ?? null;
    const ownerFaction = ownerFactionId ? state.factions.get(ownerFactionId) : null;
    const visibility = hexVisibility.get(key) ?? 'hidden';
    let effectiveTerrain = tile.terrain;
    let effectiveResource = tile.resource;
    if (effectiveTerrain === 'oasis' && visibility !== 'visible' && visibility !== 'explored') {
      effectiveTerrain = 'desert';
    }
    if (effectiveResource === 'fish' && visibility !== 'visible' && visibility !== 'explored') {
      effectiveResource = undefined;
    }
    return {
      key,
      q: tile.position.q,
      r: tile.position.r,
      terrain: effectiveTerrain,
      resource: effectiveResource,
      visibility,
      ownerFactionId,
      ownerFactionName: ownerFaction?.name ?? ownerFactionId,
    };
  });

  const moveCounts = new Map<string, number>();
  const attackCounts = new Map<string, number>();
  for (const unit of state.units.values()) {
    moveCounts.set(
      unit.id,
      unit.factionId === state.activeFactionId && unit.status === 'ready'
        ? getPlayableMoves(state, unit, source.registry).length
        : 0,
    );
    attackCounts.set(
      unit.id,
      unit.factionId === state.activeFactionId && unit.status === 'ready'
        ? getAttackableEnemies(state, unit).length
        : 0,
    );
  }

  const unitsByPosition = new Map<string, Unit[]>();
  for (const unit of state.units.values()) {
    if (unit.hp <= 0) continue;
    const key = hexToKey(unit.position);
    const bucket = unitsByPosition.get(key);
    if (bucket) bucket.push(unit);
    else unitsByPosition.set(key, [unit]);
  }

  return {
    activeFactionId: state.activeFactionId,
    map: {
      width: state.map.width,
      height: state.map.height,
      hexes,
    },
    factions,
    units: Array.from(state.units.values())
      .filter((unit) => unit.hp > 0 && !isUnitEmbarked(unit.id, state.transportMap))
      .map((unit) =>
        buildUnitView(unit, state, source.registry, hexVisibility, moveCounts.get(unit.id) ?? 0, attackCounts.get(unit.id) ?? 0, unitsByPosition, source.playerFactionId),
      ),
    cities: Array.from(state.cities.values()).map((city) => ({
      id: city.id,
      name: city.name,
      factionId: city.factionId,
      q: city.position.q,
      r: city.position.r,
      visible: city.factionId === source.playerFactionId
        ? (hexVisibility.get(hexToKey(city.position)) ?? 'hidden') !== 'hidden'
        : (hexVisibility.get(hexToKey(city.position)) ?? 'hidden') === 'visible',
      remembered: true,
      besieged: city.besieged,
      siegeTurnsUntilCapture: city.besieged
        ? Math.ceil(city.wallHP / SIEGE_CONFIG.WALL_DAMAGE_PER_TURN)
        : undefined,
      wallHp: city.wallHP,
      maxWallHp: city.maxWallHP,
      turnsSinceCapture: city.turnsSinceCapture,
    })),
    villages: Array.from(state.villages.values()).map((village) => ({
      id: village.id,
      name: village.name,
      factionId: village.factionId,
      q: village.position.q,
      r: village.position.r,
      visible: village.factionId === source.playerFactionId
        ? (hexVisibility.get(hexToKey(village.position)) ?? 'hidden') !== 'hidden'
        : (hexVisibility.get(hexToKey(village.position)) ?? 'hidden') === 'visible',
      remembered: true,
    })),
    improvements: Array.from(state.improvements.values()).map((improvement) => ({
      id: improvement.id,
      type: improvement.type,
      q: improvement.position.q,
      r: improvement.position.r,
      ownerFactionId: improvement.ownerFactionId,
      spriteKey: getSpriteKeyForImprovement(improvement.ownerFactionId, improvement.type),
      visible: improvement.ownerFactionId === source.playerFactionId
        ? (hexVisibility.get(hexToKey(improvement.position)) ?? 'hidden') !== 'hidden'
        : (hexVisibility.get(hexToKey(improvement.position)) ?? 'hidden') === 'visible',
    })),
    overlays: {
      borders: buildBorderEdges(hexes, factions),
      reachableHexes: source.reachableHexes,
      attackHexes: source.attackHexes,
      disembarkHexes: source.disembarkHexes,
      pathPreview: source.pathPreview,
      queuedPath: source.queuedPath,
      lastMove: source.lastMove,
    },
    visibility: {
      mode: 'fogged',
      activeFactionId: state.activeFactionId,
    },
  };
}

function buildPlayHudViewModel(
  state: GameState,
  selected: ClientSelection,
  hoveredKey: string | null,
  world: WorldViewModel,
  registry?: RulesRegistry,
  liveCombatEvents?: ReplayCombatEvent[],
  playerFactionId?: string | null,
): HudViewModel {
  const activeFaction = state.activeFactionId ? state.factions.get(state.activeFactionId) : null;
  const selectionInfo = describePlaySelection(state, selected, hoveredKey, world, registry);

  return {
    title: 'Live Session',
    subtitle: `Seed ${state.seed} · round ${state.round} · turn ${state.turnNumber}`,
    victoryLabel: describeVictoryLabel(state),
    activeFactionName: activeFaction?.name ?? 'No active faction',
    phaseLabel: 'Command',
    selectedTitle: selectionInfo.title,
    selectedDescription: selectionInfo.description,
    selectedMeta: selectionInfo.meta,
    selectedCity: selectionInfo.city,
    factionSummaries: Array.from(state.factions.values()).map((faction) => ({
      id: faction.id,
      name: faction.name,
      color: CIVILIZATIONS[faction.id]?.color ?? '#c8b68e',
      livingUnits: Array.from(state.units.values()).filter((unit) => unit.factionId === faction.id && unit.hp > 0).length,
      cities: Array.from(state.cities.values()).filter((city) => city.factionId === faction.id).length,
      villages: Array.from(state.villages.values()).filter((village) => village.factionId === faction.id).length,
      signatureUnit: faction.identityProfile.signatureUnit,
    })),
    recentCombat: (liveCombatEvents ?? []).filter(
      (e) => e.attackerFactionId === playerFactionId || e.defenderFactionId === playerFactionId,
    ),
    researchChip: registry
      ? buildResearchChip(state, registry)
      : null,
    settlementPreview: buildSettlementPreview(state, selected, hoveredKey, world),
    supply: registry && state.activeFactionId
      ? (() => {
          const economy = deriveResourceIncome(state, state.activeFactionId, registry);
          return {
            income: economy.supplyIncome,
            used: economy.supplyDemand,
            deficit: getSupplyDeficit(economy),
          };
        })()
      : null,
    summonTimer: (() => {
      const faction = state.activeFactionId ? state.factions.get(state.activeFactionId) : null;
      const ss = faction?.summonState;
      if (!ss) return null;
      const hasSummoner = Array.from(state.units.values()).some((u) => {
        if (u.factionId !== state.activeFactionId) return false;
        const proto = state.prototypes.get(u.prototypeId);
        return proto?.tags?.some((t) => t === 'priest' || t === 'engineer') ?? false;
      });
      if (!hasSummoner) return null;
      return {
        cooldownRemaining: ss.summoned ? null : ss.cooldownRemaining,
        turnsRemaining: ss.summoned ? ss.turnsRemaining : null,
        summonName: ss.summoned ? 'Summon Active' : null,
        isActive: ss.summoned,
      };
    })(),
  };
}

function buildPlayFactions(state: GameState): FactionView[] {
  return Array.from(state.factions.values()).map((faction) => ({
    id: faction.id,
    name: faction.name,
    color: CIVILIZATIONS[faction.id]?.color ?? '#c8b68e',
    nativeDomain: faction.nativeDomain,
    signatureUnit: faction.identityProfile.signatureUnit,
    economyAngle: faction.identityProfile.economyAngle,
    homeCityId: faction.homeCityId,
    learnedDomains: faction.learnedDomains ?? [],
    synergyEligibleDomains: faction.synergyEligibleDomains ?? [],
    activeNativePairId: faction.activeNativeSelfPair?.pairId,
    activeDoubleStackPairIds: faction.activeDoubleStack?.pairs.map(p => p.pairId),
    hasActiveTriple: faction.activeTripleStack != null,
    activeTriplePairIds: faction.activeTripleStack?.pairs.map(p => p.pairId),
    activeTripleEmergentRuleId: faction.activeTripleStack?.emergentRule?.id,
  }));
}

function describeVictoryLabel(state: GameState): string {
  const victory = getVictoryStatus(state);
  if (victory.victoryType === 'unresolved') return 'In progress';
  if (victory.victoryType === 'elimination') return `${state.factions.get(victory.winnerFactionId!)?.name ?? 'Unknown'} — Elimination`;
  if (victory.victoryType === 'domination') return `${state.factions.get(victory.winnerFactionId!)?.name ?? 'Unknown'} — Domination`;
  return 'In progress';
}

function buildHexVisibilityMap(state: GameState, playerFactionId: string | null): Map<string, 'visible' | 'explored' | 'hidden'> {
  const map = new Map<string, 'visible' | 'explored' | 'hidden'>();
  if (!playerFactionId || !state.fogState) {
    return map;
  }

  const fog = state.fogState.get(playerFactionId as FactionId);
  if (!fog) {
    return map;
  }

  for (const [key, level] of fog.hexVisibility) {
    map.set(key, level);
  }

  return map;
}

function buildBorderEdges(
  hexes: Array<{ key: string; q: number; r: number; ownerFactionId: string | null; visibility: 'visible' | 'explored' | 'hidden' }>,
  factions: FactionView[],
) {
  const factionColors = new Map(factions.map((faction) => [faction.id, faction.color]));
  const hexMap = new Map(hexes.map((hex) => [hex.key, hex]));
  const edges: Array<{
    id: string;
    q: number;
    r: number;
    side: BorderSide;
    factionId: string;
    color: string;
  }> = [];

  for (const hex of hexes) {
    if (!hex.ownerFactionId || hex.visibility === 'hidden') {
      continue;
    }

    for (const direction of BORDER_DIRECTIONS) {
      const neighbor = hexMap.get(`${hex.q + direction.dq},${hex.r + direction.dr}`);
      if (neighbor?.ownerFactionId === hex.ownerFactionId) {
        continue;
      }

      edges.push({
        id: `${hex.key}:${direction.side}`,
        q: hex.q,
        r: hex.r,
        side: direction.side,
        factionId: hex.ownerFactionId,
        color: factionColors.get(hex.ownerFactionId) ?? '#f7e7bf',
      });
    }
  }

  return edges;
}

function getPlayableMoves(state: GameState, unit: Unit, registry: RulesRegistry) {
  if (!state.map) {
    return [];
  }

  return getValidMoves(state, unit.id, state.map, registry);
}

function getAttackableEnemies(state: GameState, unit: Unit) {
  if (unit.attacksRemaining <= 0) {
    return [];
  }

  const prototype = getPrototype(state, unit.prototypeId);
  const attackRange = prototype?.derivedStats.range ?? 1;
  return Array.from(state.units.values()).filter((candidate) =>
    candidate.hp > 0
    && candidate.factionId !== unit.factionId
    && !isUnitEmbarked(candidate.id, state.transportMap)
    && hexDistance(unit.position, candidate.position) <= attackRange
  );
}
