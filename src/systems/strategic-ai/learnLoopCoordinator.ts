import type { GameState } from '../../game/types.js';
import type { City } from '../../game/types.js';
import type { FactionId, HexCoord } from '../../types.js';
import type { UnitStrategicIntent } from '../factionStrategy.js';
import type { AiDifficultyProfile } from '../aiDifficulty.js';
import type { UnitWithPrototype } from './types.js';
import { hexDistance } from '../../core/grid.js';
import abilityDomainsData from '../../content/base/ability-domains.json' with { type: 'json' };
import emergentRulesData from '../../content/base/emergent-rules.json' with { type: 'json' };
import type { EmergentRuleConfig } from '../synergyEngine.js';
import { getNearestEnemyCity } from './objectives.js';

const ALL_ABILITY_DOMAIN_IDS = new Set(Object.keys(abilityDomainsData.domains));
const EMERGENT_RULES = emergentRulesData.rules as EmergentRuleConfig[];

export function applyDifficultyLearnAndSacrificeCoordinator(
  state: GameState,
  factionId: FactionId,
  friendlyUnits: UnitWithPrototype[],
  intents: Record<string, UnitStrategicIntent>,
  targetCity: City | undefined,
  difficultyProfile: AiDifficultyProfile,
): string[] {
  const learnLoopLabel = `${difficultyProfile.difficulty}_learn_loop`;
  const faction = state.factions.get(factionId);
  const homeCity = faction?.homeCityId ? state.cities.get(faction.homeCityId) : undefined;
  if (!faction || !homeCity) {
    return [`${learnLoopLabel}=skipped:no_home_city`];
  }

  const minAbilitiesToReturn = difficultyProfile.strategy.learnLoopMinAbilitiesToReturn;
  const maxAbilitiesToLearn = difficultyProfile.strategy.learnLoopMaxAbilitiesToLearn;
  const farFromHomeDistance = difficultyProfile.strategy.learnLoopFarFromHomeDistance;
  const idleHomeRadius = difficultyProfile.strategy.learnLoopIdleHomeRadius;
  const minFieldForce = difficultyProfile.strategy.learnLoopMinFieldForce;
  const maxReturnShare = difficultyProfile.strategy.learnLoopMaxReturnShare;

  const fieldArmy = friendlyUnits.filter((entry) => {
    const intent = intents[entry.unit.id];
    return intent && intent.assignment !== 'defender' && intent.assignment !== 'recovery';
  });
  void minAbilitiesToReturn;
  void farFromHomeDistance;
  void minFieldForce;
  void maxReturnShare;

  const fallbackTargetCity = targetCity ?? getNearestEnemyCity(state, factionId, homeCity.position);
  const learnerTargetCity = difficultyProfile.strategy.learnLoopDomainTargetingEnabled
    ? getLearnLoopTargetCity(
        state,
        factionId,
        faction.learnedDomains,
        homeCity.position,
        fallbackTargetCity,
        difficultyProfile,
      )
    : fallbackTargetCity;
  const learnerPool = fieldArmy
    .filter((entry) => (entry.unit.learnedAbilities?.length ?? 0) <= maxAbilitiesToLearn)
    .filter((entry) => entry.unit.status === 'ready')
    .filter((entry) => hexDistance(entry.unit.position, homeCity.position) <= idleHomeRadius)
    .filter((entry) => {
      const assignment = intents[entry.unit.id]?.assignment;
      return assignment !== 'defender' && assignment !== 'main_army';
    });

  for (const learner of learnerPool) {
    const currentIntent = intents[learner.unit.id];
    intents[learner.unit.id] = {
      ...currentIntent,
      assignment: 'main_army',
      waypointKind: learnerTargetCity ? 'enemy_city' : currentIntent?.waypointKind ?? 'front_anchor',
      waypoint: learnerTargetCity?.position ?? currentIntent?.waypoint ?? learner.unit.position,
      objectiveCityId: learnerTargetCity?.id,
      objectiveUnitId: undefined,
      anchor: learnerTargetCity?.position ?? currentIntent?.anchor ?? learner.unit.position,
      isolated: false,
      reason: learnerTargetCity
        ? difficultyProfile.strategy.learnLoopDomainTargetingEnabled && learnerTargetCity.id !== fallbackTargetCity?.id
          ? `${difficultyProfile.difficulty} learn loop sending low-knowledge unit to hunt needed domains at ${learnerTargetCity.id}`
          : `${difficultyProfile.difficulty} learn loop sending low-knowledge unit to fight toward ${learnerTargetCity.id}`
        : `${difficultyProfile.difficulty} learn loop promoting idle unit to seek combat`,
    };
  }

  return [
    `${learnLoopLabel}=returners:0,learners:${learnerPool.length}`,
  ];
}

function getLearnLoopTargetCity(
  state: GameState,
  factionId: FactionId,
  learnedDomains: string[],
  origin: HexCoord,
  fallbackTargetCity: City | undefined,
  difficultyProfile: AiDifficultyProfile,
): City | undefined {
  const neededDomains = new Set<string>();
  const knownDomains = new Set(learnedDomains);
  for (const domainId of ALL_ABILITY_DOMAIN_IDS) {
    if (!knownDomains.has(domainId)) {
      neededDomains.add(domainId);
    }
  }
  if (neededDomains.size === 0) {
    return fallbackTargetCity;
  }

  let bestCity: City | undefined;
  let bestDistance = Infinity;
  for (const city of state.cities.values()) {
    if (city.factionId === factionId) {
      continue;
    }
    const cityFaction = state.factions.get(city.factionId);
    if (!cityFaction || !neededDomains.has(cityFaction.nativeDomain)) {
      continue;
    }
    const distance = hexDistance(origin, city.position);
    const adjustedDistance =
      distance
      - getEmergentRuleSacrificeDistanceCredit(
        knownDomains,
        cityFaction.nativeDomain,
        difficultyProfile,
      );
    if (adjustedDistance < bestDistance || (adjustedDistance === bestDistance && distance < hexDistance(origin, bestCity?.position ?? city.position))) {
      bestDistance = adjustedDistance;
      bestCity = city;
    }
  }
  return bestCity ?? fallbackTargetCity;
}

function getRuleDomainGroups(rule: EmergentRuleConfig): string[][] {
  if (rule.domainSets) {
    return Object.values(rule.domainSets);
  }
  if (rule.mobilityDomains) {
    return [rule.mobilityDomains];
  }
  if (rule.combatDomains) {
    return [rule.combatDomains];
  }
  return [];
}

function getEmergentRuleSacrificeDistanceCredit(
  knownDomains: Set<string>,
  candidateDomainId: string,
  difficultyProfile: AiDifficultyProfile,
): number {
  const baseCredit = difficultyProfile.research.emergentRuleSacrificePriority * 2;
  if (baseCredit <= 0 || knownDomains.has(candidateDomainId)) {
    return 0;
  }

  let bestCredit = 0;
  for (const rule of EMERGENT_RULES) {
    if (rule.condition === 'default') {
      continue;
    }
    const groups = getRuleDomainGroups(rule);
    if (groups.length === 0) {
      continue;
    }

    if (groups.length === 1) {
      const knownCount = groups[0].filter((domainId) => knownDomains.has(domainId)).length;
      if (knownCount === 2 && groups[0].includes(candidateDomainId)) {
        bestCredit = Math.max(bestCredit, baseCredit);
      }
      continue;
    }

    const coveredGroups = groups.filter((domains) => domains.some((domainId) => knownDomains.has(domainId)));
    if (coveredGroups.length !== groups.length - 1) {
      continue;
    }

    const missingGroup = groups.find((domains) => !domains.some((domainId) => knownDomains.has(domainId)));
    if (missingGroup?.includes(candidateDomainId)) {
      bestCredit = Math.max(bestCredit, baseCredit);
    }
  }

  return bestCredit;
}
