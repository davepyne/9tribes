import type { RulesRegistry } from '../../../../src/data/registry/types.js';
import type { GameState } from '../../../../src/game/types.js';
import { getFaction, getResearch } from '../stateAccess.js';
import { buildCityInspectorViewModel } from './inspectors/cityInspectorViewModel.js';
import type {
  CityInspectorViewModel,
  ClientSelection,
} from '../types/clientState';
import type { WorldViewModel } from '../types/worldView';

type SelectionInfo = {
  title: string;
  description: string;
  meta: Array<{ label: string; value: string }>;
  city: CityInspectorViewModel | null;
};

export function describePlaySelection(
  state: GameState,
  selected: ClientSelection,
  hoveredKey: string | null,
  world: WorldViewModel,
  registry?: RulesRegistry,
): SelectionInfo {
  if (!selected && hoveredKey) {
    const hoveredHex = world.map.hexes.find((hex) => hex.key === hoveredKey);
    return {
      title: hoveredHex ? `Tile ${hoveredHex.key}` : 'No selection',
      description: hoveredHex ? `Terrain: ${hoveredHex.terrain}.` : 'Select a unit or tile to issue movement orders.',
      meta: hoveredHex ? [
        { label: 'Owner', value: hoveredHex.ownerFactionId ?? 'Neutral' },
        { label: 'Visibility', value: hoveredHex.visibility },
      ] : [],
      city: null,
    };
  }

  const activeFactionName = state.activeFactionId
    ? state.factions.get(state.activeFactionId)?.name ?? 'Unknown'
    : 'Unknown';

  return describeSelectionFromWorld(selected, world, {
    emptyTitle: 'No selection',
    emptyDescription: `Active faction: ${activeFactionName}. Select a friendly unit to show legal moves.`,
    state,
    registry,
  });
}

function describeSelectionFromWorld(
  selected: ClientSelection,
  world: WorldViewModel,
  empty: { emptyTitle: string; emptyDescription: string; state?: GameState; registry?: RulesRegistry },
): SelectionInfo {
  if (!selected) {
    return {
      title: empty.emptyTitle,
      description: empty.emptyDescription,
      meta: [],
      city: null,
    };
  }

  if (selected.type === 'hex') {
    const hex = world.map.hexes.find((entry) => entry.key === selected.key);
    return {
      title: `Tile ${selected.key}`,
      description: `Terrain: ${hex?.terrain ?? 'unknown'}.`,
      meta: [
        { label: 'Coordinate', value: `${selected.q}, ${selected.r}` },
        { label: 'Owner', value: hex?.ownerFactionId ?? 'Neutral' },
        { label: 'Visibility', value: hex?.visibility ?? 'unknown' },
      ],
      city: null,
    };
  }

  if (selected.type === 'unit') {
    const unit = world.units.find((entry) => entry.id === selected.unitId);
    const faction = unit ? world.factions.find((entry) => entry.id === unit.factionId) : null;
    return {
      title: unit?.prototypeName ?? 'Unit',
      description: unit?.prototypeName ?? `${faction?.name ?? 'Unknown'} unit.`,
      meta: [
        { label: 'Position', value: unit ? `${unit.q}, ${unit.r}` : 'n/a' },
        { label: 'Health', value: unit ? `${unit.hp}/${unit.maxHp}` : 'n/a' },
        { label: 'Moves', value: unit ? `${unit.movesRemaining}/${unit.movesMax}` : 'n/a' },
        { label: 'Acted', value: unit?.acted ? 'Yes' : 'No' },
        ...(unit?.veteranLevel
          ? [{ label: 'Veterancy', value: `${unit.veteranLevel}${unit.xp != null ? ` (${unit.xp} XP)` : ''}` }]
          : []),
      ],
      city: null,
    };
  }

  if (selected.type === 'city') {
    const city = world.cities.find((entry) => entry.id === selected.cityId);
    const faction = city ? world.factions.find((entry) => entry.id === city.factionId) : null;
    const cityInspector = empty.state && empty.registry
      ? buildCityInspectorViewModel(empty.state, selected.cityId, empty.registry)
      : null;
    return {
      title: city?.name ?? 'City',
      description: `${faction?.name ?? 'Unknown faction'} settlement.`,
      meta: [
        { label: 'Position', value: city ? `${city.q}, ${city.r}` : 'n/a' },
        { label: 'Walls', value: city ? `${city.wallHp ?? 0}/${city.maxWallHp ?? 0}` : 'n/a' },
        { label: 'Besieged', value: city?.besieged ? 'Yes' : 'No' },
      ],
      city: cityInspector,
    };
  }

  const village = world.villages.find((entry) => entry.id === selected.villageId);
  const faction = village ? world.factions.find((entry) => entry.id === village.factionId) : null;
  return {
    title: village?.name ?? 'Village',
    description: `${faction?.name ?? 'Unknown faction'} village outpost.`,
    meta: [
      { label: 'Position', value: village ? `${village.q}, ${village.r}` : 'n/a' },
    ],
    city: null,
  };
}

export function buildResearchChip(
  state: GameState,
  registry: RulesRegistry,
): { activeNodeName: string | null; progress: number | null; totalCompleted: number; nextTierName: string | null; nextTierProgress: number | null } | null {
  const factionId = state.activeFactionId;
  if (!factionId) return null;
  const research = getResearch(state, factionId);
  const faction = getFaction(state, factionId);
  if (!research || !faction) return null;

  let activeNodeName: string | null = null;
  let activeNodeCost = 0;
  const activeProgress = research.activeNodeId
    ? (research.progressByNodeId[research.activeNodeId] ?? 0)
    : null;

  let nextTierName: string | null = null;
  let nextTierProgress: number | null = null;

  if (research.activeNodeId) {
    const domainId = research.activeNodeId.split('_t')[0];
    const domain = registry.getResearchDomain(domainId);
    if (domain) {
      activeNodeName = domain.nodes[research.activeNodeId]?.name ?? research.activeNodeId;
      activeNodeCost = domain.nodes[research.activeNodeId]?.xpCost ?? 0;

      const nodes = Object.values(domain.nodes).sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0));
      const completed = new Set<string>(research.completedNodes);
      let nextNode = null;
      for (const node of nodes) {
        if (!completed.has(node.id) && node.id !== research.activeNodeId) {
          nextNode = node;
          break;
        }
      }
      if (nextNode) {
        nextTierName = nextNode.name;
        const cumulativeXp = Object.entries(research.progressByNodeId)
          .filter(([id]) => nodes.some((n) => n.id === id))
          .reduce((sum, [, xp]) => sum + (xp ?? 0), 0);
        const nextNodeCost = nextNode.xpCost;
        nextTierProgress = nextNodeCost > 0 ? Math.min(1, cumulativeXp / nextNodeCost) : null;
      }
    }
  }

  return {
    activeNodeName,
    progress: activeProgress !== null && activeNodeCost > 0 ? activeProgress / activeNodeCost : null,
    totalCompleted: research.completedNodes.length,
    nextTierName,
    nextTierProgress,
  };
}
