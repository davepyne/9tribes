// Sacrifice System - Units can sacrifice learned abilities at the home city
// Part of the Learn by Killing + Sacrifice to Codify mechanic

import type { GameState } from '../game/types.js';
import type { Unit } from '../features/units/types.js';
import type { Faction, FactionId } from '../game/types.js';
import type { RulesRegistry } from '../data/registry/types.js';
import type { SimulationTrace } from './warEcologySimulation.js';
import type { UnitId } from '../types.js';
import { hexDistance } from '../core/grid.js';
import { getSynergyEngine } from './synergyRuntime.js';

/**
 * Check if a unit can be sacrificed at the home city.
 * 
 * Conditions:
 * - Unit has at least one learned ability
 * - Unit is standing on the faction's home city hex
 * - Home city exists and belongs to this faction
 * - Home city is not besieged
 */
export function canSacrifice(unit: Unit, faction: Faction, state: GameState): boolean {
  // Unit must have learned abilities to sacrifice
  if ((unit.learnedAbilities?.length ?? 0) === 0) {
    return false;
  }

  // Get the home city
  const homeCity = faction.homeCityId ? state.cities.get(faction.homeCityId) : undefined;
  if (!homeCity) {
    return false;
  }

  // Home city must belong to this faction
  if (homeCity.factionId !== faction.id) {
    return false;
  }

  // Unit must be within hex distance 1 of home city
  if (hexDistance(unit.position, homeCity.position) > 1) {
    return false;
  }

  // Home city must not be besieged
  if (homeCity.besieged) {
    return false;
  }

  return true;
}

/**
 * Perform the sacrifice: strip learned abilities and grant synergy eligibility.
 *
 * Effects:
 * 1. Strip learned abilities from the unit (non-destructive)
 * 2. Grant synergy eligibility for learned domains (pair/triple activation)
 * 3. Does NOT add domains to learnedDomains or auto-complete T1 research
 * 4. Evaluate triple stack from synergy-eligible domains
 * 5. Log the sacrifice event
 */
export function performSacrifice(
  unitId: UnitId,
  factionId: FactionId,
  state: GameState,
  registry: RulesRegistry,
  trace?: SimulationTrace
): GameState {
  const unit = state.units.get(unitId);
  const faction = state.factions.get(factionId);
  
  if (!unit || !faction) {
    log(trace, `Sacrifice failed: unit or faction not found`);
    return state;
  }

  if (!canSacrifice(unit, faction, state)) {
    log(trace, `Sacrifice failed: conditions not met for ${getUnitName(unit, state)}`);
    return state;
  }

  const learnedAbilities = unit.learnedAbilities;
  const learnedDomains = learnedAbilities.map(a => a.domainId);
  const newlyUnlockedDomains = learnedDomains.filter((domainId, index) =>
    !faction.learnedDomains.includes(domainId) && learnedDomains.indexOf(domainId) === index
  );
  
  log(trace, `${getUnitName(unit, state)} SACRIFICED at ${faction.name} capital!`);
  log(trace, `  Transferred domains: ${learnedDomains.join(', ')}`);

  // Step 1: Keep unit but strip learned abilities (non-destructive sacrifice)
  const units = new Map(state.units);
  units.set(unitId, {
    ...unit,
    learnedAbilities: [],
  });
  let current: GameState = { ...state, units };
  current = codifyDomainsForFaction(current, factionId, learnedDomains, registry, trace);

  // Log to trace
  if (trace) {
    const refreshedFaction = current.factions.get(factionId);
    trace.lines.push(`[SACRIFICE] ${getUnitName(unit, state)} sacrificed at ${faction.name} capital`);
    trace.lines.push(`  Learned abilities lost: ${learnedDomains.join(', ')}`);
    trace.lines.push(`  Synergy-eligible domains: ${(refreshedFaction?.synergyEligibleDomains ?? faction.synergyEligibleDomains).join(', ')}`);
    if (refreshedFaction?.activeTripleStack) {
      trace.lines.push(`  Triple synergy activated: ${refreshedFaction.activeTripleStack.name}`);
    }
  }

  return current;
}

export function codifyDomainsForFaction(
  state: GameState,
  factionId: FactionId,
  domainIds: string[],
  registry: RulesRegistry,
  trace?: SimulationTrace,
): GameState {
  const faction = state.factions.get(factionId);
  if (!faction || domainIds.length === 0) {
    return state;
  }

  // Sacrifice grants SYNERGY ELIGIBILITY only — not technology/research
  // The domain's T1 must still be earned via ecology assimilation at scaled cost
  const currentSynergyEligible = [...faction.synergyEligibleDomains];
  const newlySynergyEligible: string[] = [];
  for (const domainId of domainIds) {
    if (domainId === faction.nativeDomain || currentSynergyEligible.includes(domainId)) {
      continue;
    }
    currentSynergyEligible.push(domainId);
    newlySynergyEligible.push(domainId);
  }

  if (newlySynergyEligible.length === 0) return state;

  // Evaluate triple stack from synergy-eligible domains (not learnedDomains)
  const tripleStack = getSynergyEngine().resolveFactionTriple(
    currentSynergyEligible,
    currentSynergyEligible,
  );

  log(trace, `Sacrifice grants synergy eligibility for: ${newlySynergyEligible.join(', ')}`);
  if (tripleStack) {
    log(trace, `  Triple synergy activated: ${tripleStack.name}`);
  }

  const factions = new Map(state.factions);
  factions.set(factionId, {
    ...faction,
    synergyEligibleDomains: currentSynergyEligible,
    activeTripleStack: tripleStack ?? undefined,
  });

  // Set recent codified domains so AI strategy can react
  const research = state.research.get(factionId);
  if (research && newlySynergyEligible.length > 0) {
    const researchMap = new Map(state.research);
    researchMap.set(factionId, {
      ...research,
      recentSacrificeDomainIds: newlySynergyEligible,
      recentSacrificeRound: state.round,
    });
    return { ...state, research: researchMap, factions };
  }

  return { ...state, factions };
}

/**
 * Remove a unit from the game state.
 */
function removeUnit(state: GameState, unitId: UnitId, factionId: FactionId): GameState {
  // Remove from units map
  const units = new Map(state.units);
  units.delete(unitId);

  // Remove from faction's unitIds
  const faction = state.factions.get(factionId);
  if (!faction) {
    return { ...state, units };
  }

  const factions = new Map(state.factions);
  factions.set(factionId, {
    ...faction,
    unitIds: faction.unitIds.filter(id => id !== unitId),
  });

  return { ...state, units, factions };
}

/**
 * Get a human-readable name for a unit.
 */
function getUnitName(unit: Unit, state: GameState): string {
  const prototype = state.prototypes.get(unit.prototypeId);
  const faction = state.factions.get(unit.factionId);
  return `${faction?.name ?? 'Unknown'} ${prototype?.name ?? 'unit'}`;
}

/**
 * Log a message to the trace if trace is provided.
 */
function log(trace: SimulationTrace | undefined, message: string): void {
  if (trace) {
    trace.lines.push(message);
  }
}
