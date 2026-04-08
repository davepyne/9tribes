import type { GameState } from '../game/types.js';
import type {
  CapabilityGain,
  CapabilitySourceType,
  CapabilityState,
  Faction,
} from '../features/factions/types.js';
import type { FactionId } from '../types.js';
import type { HybridRecipeDef, RulesRegistry } from '../data/registry/types.js';
import { hexToKey } from '../core/grid.js';

const HISTORY_LIMIT = 20;

export function createCapabilityState(
  seeds: Record<string, number> = {}
): CapabilityState {
  return {
    domainLevels: { ...seeds },
    gainHistory: [],
    learnedSources: [],
    codifiedDomains: [],
    unlockedChassis: [],
    unlockedComponents: [],
    unlockedRecipeIds: [],
  };
}

export function getCapabilityLevel(faction: Faction, domainId: string): number {
  return faction.capabilities?.domainLevels[domainId] ?? 0;
}

function updateFaction(game: GameState, faction: Faction): GameState {
  const factions = new Map(game.factions);
  factions.set(faction.id, faction);
  return { ...game, factions };
}

function withCapabilityGain(
  faction: Faction,
  domainId: string,
  amount: number,
  sourceType: CapabilitySourceType,
  sourceDetail: string,
  round: number,
  fromFactionId?: FactionId
): Faction {
  if (amount <= 0) {
    return faction;
  }

  const capabilities = faction.capabilities ?? createCapabilityState();
  const nextLevel = (capabilities.domainLevels[domainId] ?? 0) + amount;
  const entry: CapabilityGain = {
    round,
    domainId,
    amount,
    sourceType,
    sourceDetail,
    fromFactionId,
  };

  return {
    ...faction,
    capabilities: {
      ...capabilities,
      domainLevels: {
        ...capabilities.domainLevels,
        [domainId]: Number(nextLevel.toFixed(2)),
      },
      gainHistory: [entry, ...capabilities.gainHistory].slice(0, HISTORY_LIMIT),
    },
  };
}

export function addCapabilityProgress(
  game: GameState,
  factionId: FactionId,
  domainId: string,
  amount: number,
  sourceType: CapabilitySourceType,
  sourceDetail: string,
  fromFactionId?: FactionId
): GameState {
  const faction = game.factions.get(factionId);
  if (!faction) {
    return game;
  }

  return updateFaction(
    game,
    withCapabilityGain(
      {
        ...faction,
        capabilities: faction.capabilities ?? createCapabilityState(),
      },
      domainId,
      amount,
      sourceType,
      sourceDetail,
      game.round,
      fromFactionId
    )
  );
}

function addCapabilityBundle(
  game: GameState,
  factionId: FactionId,
  bundle: Record<string, number> | undefined,
  sourceType: CapabilitySourceType,
  sourceDetail: string,
  fromFactionId?: FactionId
): GameState {
  let current = game;
  for (const [domainId, amount] of Object.entries(bundle ?? {})) {
    current = addCapabilityProgress(
      current,
      factionId,
      domainId,
      amount,
      sourceType,
      sourceDetail,
      fromFactionId
    );
  }
  return current;
}

export function applyEcologyPressure(
  game: GameState,
  factionId: FactionId,
  registry: RulesRegistry
): GameState {
  const faction = game.factions.get(factionId);
  const map = game.map;
  if (!faction || !map) {
    return game;
  }

  const claimedHexes = new Set<string>();
  for (const cityId of faction.cityIds) {
    const city = game.cities.get(cityId as never);
    if (city) claimedHexes.add(hexToKey(city.position));
  }
  for (const unitId of faction.unitIds) {
    const unit = game.units.get(unitId as never);
    if (unit) claimedHexes.add(hexToKey(unit.position));
  }

  let current = game;
  for (const key of claimedHexes) {
    const tile = map.tiles.get(key);
    if (!tile) continue;
    const terrain = registry.getTerrain(tile.terrain);
    current = addCapabilityBundle(
      current,
      factionId,
      terrain?.capabilityPressure,
      'ecology',
      `${terrain?.id ?? 'unknown'} exposure`
    );
  }

  return current;
}

export function applyForceCompositionPressure(
  game: GameState,
  factionId: FactionId,
  registry: RulesRegistry
): GameState {
  const faction = game.factions.get(factionId);
  if (!faction) {
    return game;
  }

  let current = game;
  for (const unitId of faction.unitIds) {
    const unit = current.units.get(unitId as never);
    if (!unit) continue;
    const prototype = current.prototypes.get(unit.prototypeId);
    if (!prototype) continue;
    const chassis = registry.getChassis(prototype.chassisId);
    current = addCapabilityBundle(
      current,
      factionId,
      chassis?.capabilityPressure,
      'force',
      `${prototype.name} chassis drill`
    );

    for (const componentId of prototype.componentIds) {
      const component = registry.getComponent(componentId);
      current = addCapabilityBundle(
        current,
        factionId,
        component?.capabilityPressure,
        'force',
        `${prototype.name} component practice`
      );
    }
  }

  return current;
}

export function applyCombatPressure(
  game: GameState,
  attackerFactionId: FactionId,
  defenderFactionId: FactionId,
  attackerTags: string[],
  defenderTags: string[],
  attackerWon: boolean
): GameState {
  let current = addCapabilityProgress(
    game,
    attackerFactionId,
    'formation_warfare',
    attackerWon ? 1.5 : 1,
    'combat',
    attackerWon ? 'won battle' : 'fought battle'
  );
  current = addCapabilityProgress(
    current,
    defenderFactionId,
    'formation_warfare',
    attackerWon ? 1 : 1.25,
    'combat',
    attackerWon ? 'survived enemy strike' : 'won battle'
  );

  if (attackerTags.includes('mounted')) {
    current = addCapabilityProgress(current, attackerFactionId, 'horsemanship', 1, 'combat', 'mounted combat use');
  }
  if (defenderTags.includes('mounted')) {
    current = addCapabilityProgress(current, defenderFactionId, 'horsemanship', 1, 'combat', 'mounted combat use');
  }
  if (attackerTags.includes('poison')) {
    current = addCapabilityProgress(current, attackerFactionId, 'poisoncraft', 0.75, 'combat', 'poisoned attacks');
  }
  if (defenderTags.includes('poison')) {
    current = addCapabilityProgress(current, defenderFactionId, 'poisoncraft', 0.75, 'combat', 'poisoned attacks');
  }
  if (attackerTags.includes('ranged')) {
    current = addCapabilityProgress(current, attackerFactionId, 'woodcraft', 0.5, 'combat', 'ranged battlefield use');
  }
  if (defenderTags.includes('ranged')) {
    current = addCapabilityProgress(current, defenderFactionId, 'woodcraft', 0.5, 'combat', 'ranged battlefield use');
  }

  return current;
}

function getTopCapabilities(faction: Faction, limit = 2): Array<[string, number]> {
  return Object.entries(faction.capabilities?.domainLevels ?? {})
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

export function applyContactTransfer(
  game: GameState,
  learnerFactionId: FactionId,
  sourceFactionId: FactionId,
  method: 'contact' | 'absorption'
): GameState {
  const learner = game.factions.get(learnerFactionId);
  const source = game.factions.get(sourceFactionId);
  if (!learner || !source) {
    return game;
  }

  const transferScale = method === 'absorption' ? 1.5 : 0.15;
  let current = game;
  let updatedLearner = current.factions.get(learnerFactionId)!;

  for (const [domainId, value] of getTopCapabilities(source)) {
    const amount = Number((value * transferScale).toFixed(2));
    current = addCapabilityProgress(
      current,
      learnerFactionId,
      domainId,
      amount,
      method,
      method === 'absorption' ? `absorbed ${source.name}` : `contact with ${source.name}`,
      sourceFactionId
    );
    updatedLearner = current.factions.get(learnerFactionId)!;
    updatedLearner = {
      ...updatedLearner,
      capabilities: {
        ...(updatedLearner.capabilities ?? createCapabilityState()),
        learnedSources: [
          {
            domainId,
            amount,
            fromFactionId: sourceFactionId,
            method,
            note: `${domainId} learned from ${source.name}`,
          },
          ...((updatedLearner.capabilities?.learnedSources) ?? []),
        ].slice(0, HISTORY_LIMIT),
      },
    };
    current = updateFaction(current, updatedLearner);
  }

  return current;
}

export function meetsCapabilityRequirements(
  levels: Record<string, number>,
  requirements?: Record<string, number>
): boolean {
  for (const [domainId, threshold] of Object.entries(requirements ?? {})) {
    if ((levels[domainId] ?? 0) < threshold) {
      return false;
    }
  }
  return true;
}

export function canUseRecipe(faction: Faction, recipe: HybridRecipeDef): boolean {
  return meetsCapabilityRequirements(
    faction.capabilities?.domainLevels ?? {},
    recipe.requiredCapabilityLevels
  );
}

export function describeCapabilityLevels(faction: Faction): string {
  return Object.entries(faction.capabilities?.domainLevels ?? {})
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([domainId, value]) => `${domainId}:${value.toFixed(1)}`)
    .join(', ');
}
