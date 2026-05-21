import type { GameState } from '../../game/types.js';
import type { RulesRegistry } from '../../data/registry/types.js';
import type { FactionId, UnitId } from '../../types.js';
import type { SimulationTrace } from './traceTypes.js';
import { log, recordFactionStrategy } from './traceRecorder.js';
import { getTerrainAt } from './environmentalEffects.js';
import { deriveResourceIncome, advanceCaptureTimers } from '../economySystem.js';
import { applyEcologyPressure, applyForceCompositionPressure } from '../capabilitySystem.js';
import { unlockHybridRecipes } from '../hybridSystem.js';
import { evaluateAndSpawnVillage } from '../villageSystem.js';
import { computeFactionStrategy } from '../strategicAi.js';
import { updateFogState, applyStealthRevealPenalty } from '../fogSystem.js';
import { gainExposure } from '../knowledgeSystem.js';
import { hexDistance } from '../../core/grid.js';
import { isWildFaction } from '../wildCyclopsConstants.js';
import { processWildFactionPhases } from './wildFactionTurn.js';
import { resolveFactionSynergies } from './emergentTurnEffects.js';
import { processCityProduction } from './cityProduction.js';
import { tickSummonState } from './summonTick.js';
import { applyWarlordAura, applyHillEngineering } from './factionAuraSystem.js';
import { refreshFactionUnits } from './unitRefresh.js';
import { applyEnvironmentalDamage } from './environmentalEffects.js';
import { processSiegePhase } from './siegePhase.js';
import { startOrAdvanceCodification } from './codificationPhase.js';
import { applyEcologyResearchPass } from './ecologyResearch.js';
import type { DifficultyLevel } from '../aiDifficulty.js';

export { tickDecoyState } from './decoyTick.js';

export function processFactionPhases(
  state: GameState,
  factionId: FactionId,
  registry: RulesRegistry,
  trace?: SimulationTrace,
  difficulty?: DifficultyLevel,
): GameState {
  const faction = state.factions.get(factionId);
  if (!faction || !state.map) {
    return state;
  }

  if (isWildFaction(factionId)) {
    return processWildFactionPhases(state, factionId);
  }

  let current = state;

  // Reset per-turn research bonus accumulators
  const research = current.research.get(factionId);
  if (research?.combatResearchBonusThisTurn || research?.ecologyBonusesThisTurn || research?.ecologyBreakdownThisTurn) {
    const updatedResearch = { ...research, combatResearchBonusThisTurn: undefined, ecologyBonusesThisTurn: undefined, ecologyBreakdownThisTurn: undefined };
    const researchMap = new Map(current.research);
    researchMap.set(factionId, updatedResearch);
    current = { ...current, research: researchMap };
  }

  current = updateFogState(current, factionId);

  // River Stealth T3 (foreign): slow enemy stealthed units this faction has revealed.
  current = applyStealthRevealPenalty(current, factionId);

  // Derive economy before strategy so the coordinator has current-turn supply data
  current = advanceCaptureTimers(current, factionId);
  const economy = deriveResourceIncome(current, factionId, registry);
  const economyMap = new Map(current.economy);
  economyMap.set(factionId, economy);
  current = { ...current, economy: economyMap };

  const strategy = computeFactionStrategy(current, factionId, registry, difficulty);
  const factionStrategies = new Map(current.factionStrategies);
  factionStrategies.set(factionId, strategy);
  current = { ...current, factionStrategies };
  recordFactionStrategy(trace, {
    round: current.round,
    factionId,
    posture: strategy.posture,
    primaryObjective: strategy.primaryObjective,
    primaryEnemyFactionId: strategy.primaryEnemyFactionId,
    primaryCityObjectiveId: strategy.primaryCityObjectiveId,
    threatenedCityIds: strategy.threatenedCities.map((threat) => threat.cityId),
    frontAnchors: strategy.fronts.map((front) => front.anchor),
    focusTargetUnitIds: strategy.focusTargetUnitIds,
    reasons: strategy.debugReasons,
  });
  log(trace, `${faction.name} strategy: ${strategy.posture} | ${strategy.primaryObjective}`);

  current = resolveFactionSynergies(current, factionId, registry, trace);
  current = applyEcologyPressure(current, factionId, registry);
  current = applyForceCompositionPressure(current, factionId, registry);
  current = startOrAdvanceCodification(current, factionId, registry, trace, strategy, difficulty);
  current = applyEcologyResearchPass(current, factionId, registry, trace);
  current = unlockHybridRecipes(current, factionId, registry);
  current = processCityProduction(current, factionId, registry, trace, difficulty);

  const factionAbilities = registry.getSignatureAbility(factionId);
  if (factionAbilities?.summon) {
    current = tickSummonState(current, factionId, registry, trace);
  }

  current = applyWarlordAura(current, factionId, trace);
  current = refreshFactionUnits(current, factionId, registry, trace);
  current = applyEnvironmentalDamage(current, factionId, registry, trace);

  // H-1-2-2: Gain exposure from proximity to enemy units
  const exposureFaction = current.factions.get(factionId);
  if (exposureFaction) {
    const seenEnemyDomains = new Map<string, number>();
    for (const fid of exposureFaction.unitIds) {
      const fUnit = current.units.get(fid as UnitId);
      if (!fUnit || fUnit.hp <= 0) continue;
      for (const [, enemyUnit] of current.units) {
        if (enemyUnit.factionId === factionId || enemyUnit.hp <= 0) continue;
        if (hexDistance(fUnit.position, enemyUnit.position) <= 2) {
          const enemyFaction = current.factions.get(enemyUnit.factionId);
          if (enemyFaction) {
            const domain = enemyFaction.nativeDomain;
            seenEnemyDomains.set(domain, (seenEnemyDomains.get(domain) ?? 0) + 1);
          }
        }
      }
    }
    for (const [domainId, contactCount] of seenEnemyDomains) {
      current = gainExposure(current, factionId, domainId, contactCount, trace, registry);
    }
  }

  current = evaluateAndSpawnVillage(current, factionId, registry);
  current = processSiegePhase(current, factionId, trace);
  current = applyHillEngineering(current, factionId);

  return current;
}
