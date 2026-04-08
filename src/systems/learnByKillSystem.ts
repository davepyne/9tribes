// Learn-by-Kill System - Units learn enemy faction domains by killing them
// Part of the Learn by Killing + Sacrifice to Codify mechanic

import type { GameState } from '../game/types.js';
import type { Unit, LearnedAbility } from '../features/units/types.js';

import type { SimulationTrace } from './warEcologySimulation.js';
import type { RNGState } from '../core/rng.js';
import { rngNextFloat } from '../core/rng.js';

const LEARN_CHANCE_BY_VETERAN_LEVEL: Record<string, number> = {
  green: 0.10,
  seasoned: 0.18,
  veteran: 0.24,
  elite: 0.35,
};
const MAX_LEARNED_ABILITIES = 3;

export interface LearnFromKillResult {
  unit: Unit;
  learned: boolean;
  domainId?: string;
  fromFactionId?: string;
}

/**
 * Calculate the learn chance based on veteran's level.
 * Green: 10%, Seasoned: 18%, Veteran: 24%, Elite: 35%
 */
function calculateLearnChance(veteranLevel: string): number {
  return LEARN_CHANCE_BY_VETERAN_LEVEL[veteranLevel] ?? LEARN_CHANCE_BY_VETERAN_LEVEL.green;
}

/**
 * Check if a unit already has a learned ability from a specific domain.
 */
function alreadyHasDomain(learnedAbilities: LearnedAbility[], domainId: string): boolean {
  return learnedAbilities.some(ability => ability.domainId === domainId);
}

/**
 * Try to learn a domain from killing an enemy unit.
 * This is called after combat when a defender is destroyed.
 * 
 * @param attacker - The unit that killed the enemy
 * @param defender - The destroyed enemy unit
 * @param state - Current game state
 * @param rngState - RNG state for roll
 * @param trace - Optional trace for logging
 * @returns Updated attacker unit and whether learning succeeded
 */
export function tryLearnFromKill(
  attacker: Unit,
  defender: Unit,
  state: GameState,
  rngState: RNGState,
  trace?: SimulationTrace
): LearnFromKillResult {
  // Get defender's faction to find its native domain
  const defenderFaction = state.factions.get(defender.factionId);
  if (!defenderFaction) {
    return { unit: attacker, learned: false };
  }

  const nativeDomain = defenderFaction.nativeDomain;
  const fromFactionId = defender.factionId;

  // Skip if attacker already has this domain learned
  if (alreadyHasDomain(attacker.learnedAbilities ?? [], nativeDomain)) {
    return { unit: attacker, learned: false };
  }

  // Skip if attacker is already at cap
  if ((attacker.learnedAbilities?.length ?? 0) >= MAX_LEARNED_ABILITIES) {
    log(trace, `${getUnitName(attacker, state)} already knows ${MAX_LEARNED_ABILITIES} abilities — cannot learn more`);
    return { unit: attacker, learned: false };
  }

  // Skip if attacker and defender are same faction
  if (attacker.factionId === defender.factionId) {
    return { unit: attacker, learned: false };
  }

  // Calculate learn chance based on veterancy
  const learnChance = calculateLearnChance(attacker.veteranLevel);
  const roll = rngNextFloat(rngState);

  if (roll >= learnChance) {
    log(trace, `${getUnitName(attacker, state)} failed to learn ${nativeDomain} from ${defenderFaction.name} (roll: ${roll.toFixed(2)} vs chance: ${learnChance.toFixed(2)})`);
    return { unit: attacker, learned: false };
  }

  // Success! Add the learned ability
  const newAbility: LearnedAbility = {
    domainId: nativeDomain,
    fromFactionId: fromFactionId,
    learnedOnRound: state.round,
  };

  const updatedUnit: Unit = {
    ...attacker,
    learnedAbilities: [...(attacker.learnedAbilities ?? []), newAbility],
  };

  log(trace, `${getUnitName(attacker, state)} LEARNED ${nativeDomain} from ${defenderFaction.name}! (${updatedUnit.learnedAbilities.length}/${MAX_LEARNED_ABILITIES} abilities)`);

  return {
    unit: updatedUnit,
    learned: true,
    domainId: nativeDomain,
    fromFactionId: fromFactionId,
  };
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
