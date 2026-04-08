import {
  buildActivationQueue,
  nextUnitActivation,
  resetAllUnitsForRound,
} from './turnSystem.js';
import { moveUnit, getValidMoves, canMoveTo } from './movementSystem.js';
import { getUnitAtHex } from './occupancySystem.js';
import {
  resolveCombat,
  getVeteranStatBonus,
  getVeteranDefenseBonus,
  getVeteranMoraleBonus,
} from './combatSystem.js';
import {
  canUseAmbush,
  canUseBrace,
  canUseCharge,
  clearPreparedAbility,
  getTerrainAt as getAbilityTerrainAt,
  hasAdjacentEnemy,
  prepareAbility,
  shouldClearAmbush,
} from './abilitySystem.js';
import { awardCombatXP, canPromote } from './xpSystem.js';
import { tryPromoteUnit } from './veterancySystem.js';
import {
  recordBattleFought,
  recordEnemyKilled,
  recordPromotion,
  getBattleCount,
  getKillCount,
  updateCombatRecordOnWin,
  updateCombatRecordOnLoss,
  updateCombatRecordOnElimination,
  resetCombatRecordStreaks,
} from './historySystem.js';
import {
  addCapabilityProgress,
  applyContactTransfer,
  applyEcologyPressure,
  applyForceCompositionPressure,
  describeCapabilityLevels,
} from './capabilitySystem.js';
import { applyCombatSignals } from './combatSignalSystem.js';
import {
  resolveResearchDoctrine,
  prototypeHasComponent,
} from './capabilityDoctrine.js';
import { recoverMorale, checkRally, findFleeHex, applyMoraleLoss } from './moraleSystem.js';
import { hasCaptureAbility, attemptCapture, attemptNonCombatCapture, getCaptureParams } from './captureSystem.js';
import { isTransportUnit, updateEmbarkedPositions, isUnitEmbarked, destroyTransport, canBoardTransport, boardTransport, getValidDisembarkHexes, disembarkUnit, getEmbarkedUnits } from './transportSystem.js';
import { getRoleEffectiveness } from '../data/roleEffectiveness.js';
import { getWeaponEffectiveness } from '../data/weaponEffectiveness.js';
import { unlockHybridRecipes } from './hybridSystem.js';
import { addResearchProgress, startResearch } from './researchSystem.js';
import { evaluateAndSpawnVillage, getVillageCount, destroyVillage } from './villageSystem.js';
import { deriveResourceIncome, getSupplyDeficit, advanceCaptureTimers } from './economySystem.js';
import {
  advanceProduction,
  canCompleteCurrentProduction,
  completeProduction,
  getAvailableProductionPrototypes,
  getUnitCost,
  queueUnit,
} from './productionSystem.js';
import { chooseStrategicProduction } from './aiProductionStrategy.js';
import { chooseStrategicResearch } from './aiResearchStrategy.js';
import { calculateFlankingBonus, isRearAttack } from './zocSystem.js';
import type { RNGState } from '../core/rng.js';
import {
  findRetreatHex,
  applyKnockback,
  applyPoisonDoT,
  breakStealth,
  tickStealthCooldown,
  enterStealth,
  getStealthAmbushBonus,
  getNatureHealingAura,
  getTidalCoastDebuff,
  getBulwarkDefenseBonus,
} from './signatureAbilitySystem.js';
import { isCityEncircled, isEncirclementBroken, getHexOwner } from './territorySystem.js';
import {
  degradeWalls,
  repairWalls,
  getWallDefenseBonus,
  isCityVulnerable,
  getCapturingFaction,
  captureCity,
} from './siegeSystem.js';
import {
  addExhaustion,
  tickWarExhaustion,
  applyDecay,
  calculateMoralePenalty,
  EXHAUSTION_CONFIG,
  createWarExhaustion,
  applySupplyDeficitPenalties,
} from './warExhaustionSystem.js';
import {
  getFactionCityIds,
  syncAllFactionSettlementIds,
} from './factionOwnershipSystem.js';
import {
  getCombatAttackModifier,
  getCombatDefenseModifier,
  getDesertSwarmBonus,
  getHealingBonus,
  getTerrainPreferenceScore,
  isUnitRiverStealthed,
} from './factionIdentitySystem.js';
import type { GameState, Unit } from '../game/types.js';
import type { RulesRegistry } from '../data/registry/types.js';
import type { FactionId, HexCoord, UnitId, ChassisId } from '../types.js';
import { createImprovementId, createUnitId } from '../core/ids.js';
import { isHexOccupied } from './occupancySystem.js';
import { getDirectionIndex, hexDistance, hexToKey, getNeighbors, getHexesInRange } from '../core/grid.js';
import type { PrototypeId } from '../types.js';
import type { Prototype } from '../features/prototypes/types.js';
import type { VeteranLevel, UnitStatus } from '../core/enums.js';
import { SynergyEngine, type PairSynergyConfig, type EmergentRuleConfig, type DomainConfig, type ActiveTripleStack, type ActiveSynergy } from './synergyEngine.js';
import {
  applyCombatSynergies,
  applyMovementSynergies,
  applyHealingSynergies,
  type CombatContext,
  type CombatResult,
  type MovementContext,
  type HealingContext,
} from './synergyEffects.js';
import { getPrototypeCostModifier } from './knowledgeSystem.js';
import { tryLearnFromKill } from './learnByKillSystem.js';
import { canSacrifice, performSacrifice } from './sacrificeSystem.js';
import { getDomainProgression } from './domainProgression.js';
import {
  computeFactionStrategy,
  getNearbySupportScore,
  getNearestFriendlyCity,
  getUnitIntent,
  scoreStrategicTerrain,
} from './strategicAi.js';
import {
  computeRetreatRisk,
  scoreAttackCandidate,
  scoreMoveCandidate,
  scoreStrategicTarget,
  shouldEngageTarget,
} from './aiTactics.js';
import { updateFogState, getHexVisibility } from './fogSystem.js';
import type { FactionStrategy, UnitStrategicIntent } from './factionStrategy.js';
import pairSynergiesData from '../content/base/pair-synergies.json' with { type: 'json' };
import abilityDomainsData from '../content/base/ability-domains.json' with { type: 'json' };
import emergentRulesData from '../content/base/emergent-rules.json' with { type: 'json' };
import type { DifficultyLevel } from './aiDifficulty.js';

// Create synergy engine instance (lazily initialized)
let synergyEngine: SynergyEngine | null = null;

function getSynergyEngine(): SynergyEngine {
  if (!synergyEngine) {
    synergyEngine = new SynergyEngine(
      pairSynergiesData.pairSynergies as PairSynergyConfig[],
      emergentRulesData.rules as EmergentRuleConfig[],
      Object.values(abilityDomainsData.domains) as DomainConfig[],
    );
  }
  return synergyEngine;
}

function calculateSynergyAttackBonus(result: CombatResult): number {
  let bonus = 0;
  // Pack bonus adds to attack
  if (result.additionalEffects.some(e => e.includes('pack_bonus'))) {
    bonus += 0.25;
  }
  // Multiplier stack effects
  const multiplierEffect = result.additionalEffects.find(e => e.includes('poison_multiplier'));
  if (multiplierEffect) {
    const match = multiplierEffect.match(/(\d+\.?\d*)x/);
    if (match) {
      bonus += parseFloat(match[1]) - 1;
    }
  }
  return bonus;
}

function calculateSynergyDefenseBonus(result: CombatResult): number {
  let bonus = 0;
  // Dug in bonus
  if (result.additionalEffects.includes('dug_in')) {
    bonus += 0.75;
  }
  // Frost defense bonus
  if (result.additionalEffects.includes('frost_defense')) {
    bonus += 0.50;
  }
  // Bear cover bonus
  if (result.additionalEffects.includes('bear_cover')) {
    bonus += 0.25;
  }
  // Aura overlap bonus
  if (result.additionalEffects.includes('aura_overlap')) {
    bonus += 0.50;
  }
  return bonus;
}

function formatPercent(value: number): string {
  return `${value > 0 ? '+' : ''}${Math.round(value * 100)}%`;
}

function pushCombatEffect(
  effects: TraceCombatEffect[],
  label: string,
  detail: string,
  category: TraceCombatEffect['category']
): void {
  effects.push({ label, detail, category });
}

function tryResolveRetreatCapture(
  state: GameState,
  attacker: Unit,
  defender: Unit,
  enabled: boolean,
  registry: RulesRegistry,
  rngState: RNGState
): { state: GameState; captured: boolean } {
  if (!enabled || attacker.hp <= 0 || defender.hp <= 0 || defender.hp >= defender.maxHp) {
    return { state, captured: false };
  }

  return attemptNonCombatCapture(
    state,
    attacker.id,
    defender.id,
    registry,
    0.15,
    0.25,
    0,
    rngState,
  );
}

function describeCombatOutcome(result: {
  defenderDestroyed: boolean;
  attackerDestroyed: boolean;
  defenderFled: boolean;
  attackerFled: boolean;
  defenderRouted: boolean;
  attackerRouted: boolean;
}): string {
  if (result.defenderDestroyed) return 'Defender destroyed';
  if (result.attackerDestroyed) return 'Attacker destroyed';
  if (result.defenderFled) return 'Defender fled';
  if (result.defenderRouted) return 'Defender routed';
  if (result.attackerFled) return 'Attacker fled';
  if (result.attackerRouted) return 'Attacker routed';
  return 'Exchange';
}

function formatCombatSummary(
  attackerName: string,
  defenderName: string,
  defenderDamage: number,
  attackerDamage: number,
  outcome: string,
  effects: TraceCombatEffect[]
): string {
  const highlights = effects.slice(0, 3).map((effect) => effect.label.toLowerCase());
  const highlightText = highlights.length > 0 ? `; ${highlights.join(', ')}` : '';
  return `${attackerName} dealt ${defenderDamage}, took ${attackerDamage}. ${outcome}${highlightText}.`;
}

function humanizeCombatEffect(effect: string): { label: string; detail: string } | null {
  const poisonAura = effect.match(/^poison_aura_radius_(\d+)$/);
  if (poisonAura) {
    return { label: 'Poison Aura', detail: `Applied poison pressure in radius ${poisonAura[1]}.` };
  }
  const landAura = effect.match(/^land_aura_radius_(\d+)$/);
  if (landAura) {
    return { label: 'Land Aura', detail: `Granted a defensive aura in radius ${landAura[1]}.` };
  }
  const healingRadius = effect.match(/^extended_healing_radius_(\d+)$/);
  if (healingRadius) {
    return { label: 'Extended Healing', detail: `Healing aura extended to radius ${healingRadius[1]}.` };
  }
  const stealthReveal = effect.match(/^stealth_aura_reveal_(\d+)$/);
  if (stealthReveal) {
    return { label: 'Stealth Aura', detail: `Threatened hidden enemies within radius ${stealthReveal[1]}.` };
  }
  const combatHealing = effect.match(/^combat_healing_(\d+)%$/);
  if (combatHealing) {
    return { label: 'Combat Healing', detail: `Converted ${combatHealing[1]}% of dealt damage into healing.` };
  }
  const sandstorm = effect.match(/^sandstorm_damage_(\d+)_accuracy_debuff_(\d+\.?\d*)$/);
  if (sandstorm) {
    return { label: 'Sandstorm', detail: `Dealt ${sandstorm[1]} area damage and reduced accuracy by ${formatPercent(-Number(sandstorm[2]))}.` };
  }
  const withering = effect.match(/^withering_healing_reduction_(\d+)%$/);
  if (withering) {
    return { label: 'Withering', detail: `Reduced incoming healing by ${withering[1]}%.` };
  }
  const poisonMultiplier = effect.match(/^poison_multiplier_(\d+\.?\d*)x$/);
  if (poisonMultiplier) {
    return { label: 'Poison Multiplier', detail: `Amplified attack output by ${poisonMultiplier[1]}x.` };
  }
  const frostSpeed = effect.match(/^frost_speed_movement_(\d+)$/);
  if (frostSpeed) {
    return { label: 'Frost Speed', detail: `Adjusted movement by ${frostSpeed[1]} on frozen ground.` };
  }
  const healOnRetreat = effect.match(/^heal_on_retreat_(\d+)$/);
  if (healOnRetreat) {
    return { label: 'Heal On Retreat', detail: `Recovered ${healOnRetreat[1]} HP after disengaging.` };
  }
  const swarmSpeed = effect.match(/^swarm_speed_(\d+)$/);
  if (swarmSpeed) {
    return { label: 'Swarm Speed', detail: `Reduced movement cost by ${swarmSpeed[1]}.` };
  }
  const adaptiveMultiplier = effect.match(/^adaptive_multiplier_(\d+\.?\d*)x$/);
  if (adaptiveMultiplier) {
    return { label: 'Adaptive Multiplier', detail: `Triple-stack multiplier boosted combat by ${adaptiveMultiplier[1]}x.` };
  }

  const labels: Record<string, string> = {
    charge_shield: 'Charge Shield',
    anti_displacement: 'Anti-Displacement',
    dug_in: 'Dug In',
    terrain_fortress: 'Terrain Fortress',
    charge_cooldown_reset: 'Charge Reset',
    ram_attack: 'Ram Attack',
    stealth_charge: 'Stealth Charge',
    double_charge: 'Double Charge',
    poison_trap: 'Poison Trap',
    contaminate_coastal: 'Contaminate',
    stealth_healing: 'Stealth Healing',
    terrain_poison: 'Terrain Poison',
    aura_overlap: 'Aura Overlap',
    wave_cavalry_amphibious: 'Wave Cavalry',
    stealth_recharge: 'Stealth Recharge',
    desert_fortress: 'Desert Fortress',
    frostbite: 'Frostbite',
    frost_defense: 'Frost Defense',
    bear_charge: 'Bear Charge',
    bear_cover: 'Bear Cover',
    ice_zone_difficult_terrain: 'Ice Zone',
    bear_mount: 'Bear Mount',
    terrain_share: 'Terrain Share',
    pack_bonus: 'Pack Bonus',
    oasis_neutral_terrain: 'Oasis',
    permanent_stealth_terrain: 'Permanent Stealth Terrain',
    shadow_network: 'Shadow Network',
    nomad_network: 'Nomad Network',
    impassable_retreat: 'Impassable Retreat',
    paladin_sustain: 'Paladin Sustain',
    juggernaut_doubled: 'Juggernaut Doubled',
    ambush_damage: 'Ambush Damage',
  };

  const label = labels[effect];
  if (!label) {
    return null;
  }

  return { label, detail: label };
}

export interface TurnSnapshot {
  round: number;
  phase: 'start' | 'end';
  factions: {
    id: FactionId;
    name: string;
    livingUnits: number;
    cities: number;
    villages: number;
  }[];
  units: {
    id: UnitId;
    factionId: FactionId;
    prototypeId: string;
    q: number;
    r: number;
    hp: number;
    maxHp: number;
    facing?: number;
  }[];
  cities: {
    id: string;
    factionId: FactionId;
    q: number;
    r: number;
    besieged: boolean;
    wallHP: number;
    maxWallHP: number;
    turnsUnderSiege: number;
  }[];
  villages: {
    id: string;
    factionId: FactionId;
    q: number;
    r: number;
  }[];
  factionTripleStacks?: {
    factionId: FactionId;
    domains: string[];
    tripleName: string;
    emergentRule: string;
  }[];
}

export interface TraceLogEvent {
  round: number;
  message: string;
}

export interface TraceCombatEvent {
  round: number;
  attackerUnitId: UnitId;
  defenderUnitId: UnitId;
  attackerFactionId: FactionId;
  defenderFactionId: FactionId;
  attackerPrototypeId: PrototypeId;
  defenderPrototypeId: PrototypeId;
  attackerPrototypeName: string;
  defenderPrototypeName: string;
  attackerDamage: number;
  defenderDamage: number;
  attackerHpAfter: number;
  defenderHpAfter: number;
  attackerDestroyed: boolean;
  defenderDestroyed: boolean;
  attackerRouted: boolean;
  defenderRouted: boolean;
  attackerFled: boolean;
  defenderFled: boolean;
  summary: string;
  breakdown: TraceCombatBreakdown;
}

export interface TraceCombatBreakdown {
  attacker: TraceCombatUnitBreakdown;
  defender: TraceCombatUnitBreakdown;
  modifiers: TraceCombatModifiers;
  morale: TraceCombatMoraleBreakdown;
  outcome: TraceCombatOutcomeBreakdown;
  triggeredEffects: TraceCombatEffect[];
}

export interface TraceCombatUnitBreakdown {
  unitId: UnitId;
  factionId: FactionId;
  prototypeId: PrototypeId;
  prototypeName: string;
  position: HexCoord;
  terrain: string;
  hpBefore: number;
  hpAfter: number;
  maxHp: number;
  baseStat: number;
}

export interface TraceCombatModifiers {
  roleModifier: number;
  weaponModifier: number;
  flankingBonus: number;
  rearAttackBonus: number;
  chargeBonus: number;
  braceDefenseBonus: number;
  ambushBonus: number;
  hiddenAttackBonus: number;
  stealthAmbushBonus: number;
  situationalAttackModifier: number;
  situationalDefenseModifier: number;
  synergyAttackModifier: number;
  synergyDefenseModifier: number;
  improvementDefenseBonus: number;
  wallDefenseBonus: number;
  finalAttackStrength: number;
  finalDefenseStrength: number;
  baseMultiplier: number;
  positionalMultiplier: number;
  damageVarianceMultiplier: number;
  retaliationVarianceMultiplier: number;
}

export interface TraceCombatMoraleBreakdown {
  attackerLoss: number;
  defenderLoss: number;
  attackerRouted: boolean;
  defenderRouted: boolean;
  attackerFled: boolean;
  defenderFled: boolean;
}

export interface TraceCombatOutcomeBreakdown {
  attackerDamage: number;
  defenderDamage: number;
  attackerDestroyed: boolean;
  defenderDestroyed: boolean;
  defenderKnockedBack: boolean;
  knockbackDistance: number;
}

export interface TraceCombatEffect {
  label: string;
  detail: string;
  category: 'positioning' | 'ability' | 'synergy' | 'aftermath';
}

export interface TraceSiegeEvent {
  round: number;
  cityId: string;
  cityName: string;
  factionId: FactionId;
  eventType: 'siege_started' | 'siege_broken' | 'wall_damaged' | 'wall_repaired' | 'city_captured';
  wallHP: number;
  maxWallHP: number;
  turnsUnderSiege: number;
  attackerFactionId?: FactionId;
}

export interface TraceAiIntentEvent {
  round: number;
  factionId: FactionId;
  unitId: UnitId;
  intent: 'retreat' | 'regroup' | 'advance' | 'siege' | 'support';
  from: HexCoord;
  to?: HexCoord;
  reason: string;
  targetUnitId?: UnitId;
  targetCityId?: string;
}

export interface TraceFactionStrategyEvent {
  round: number;
  factionId: FactionId;
  posture: FactionStrategy['posture'];
  primaryObjective: string;
  primaryEnemyFactionId?: FactionId;
  primaryCityObjectiveId?: string;
  threatenedCityIds: string[];
  frontAnchors: HexCoord[];
  focusTargetUnitIds: UnitId[];
  reasons: string[];
}

export interface TraceAbilityLearnedEvent {
  round: number;
  unitId: UnitId;
  factionId: FactionId;
  domainId: string;
  fromFactionId: FactionId;
}

export interface TraceUnitSacrificedEvent {
  round: number;
  unitId: UnitId;
  factionId: FactionId;
  learnedDomains: string[];
}

export interface SimulationTrace {
  lines: string[];
  snapshots?: TurnSnapshot[];
  events?: TraceLogEvent[];
  combatEvents?: TraceCombatEvent[];
  siegeEvents?: TraceSiegeEvent[];
  aiIntentEvents?: TraceAiIntentEvent[];
  factionStrategyEvents?: TraceFactionStrategyEvent[];
  abilityLearnedEvents?: TraceAbilityLearnedEvent[];
  unitSacrificedEvents?: TraceUnitSacrificedEvent[];
  currentRound?: number;
}

export type VictoryType = 'elimination' | 'domination' | 'unresolved';

export interface VictoryStatus {
  winnerFactionId: FactionId | null;
  victoryType: VictoryType;
  controlledCities: number | null;
  dominationThreshold: number | null;
}

const HEALING_CONFIG = {
  OWNED_TERRITORY: 0.10, // 10% of max HP in faction-owned territory
  CITY_GARRISON: 0.50,   // 50% of max HP in friendly city
  VILLAGE: 0.50,         // 50% of max HP in friendly village
  FIELD: 0.05,          // 5% base fallback
} as const;

function getHealRate(unit: { position: HexCoord; maxHp: number }, state: GameState, factionId: FactionId): number {
  const faction = state.factions.get(factionId);
  const terrainId = getTerrainAt(state, unit.position);

  // Check city healing first
  for (const [, city] of state.cities) {
    if (city.factionId !== factionId) continue;
    if (city.besieged) continue;
    const dist = hexDistance(unit.position, city.position);
    if (dist === 0) return Math.floor(unit.maxHp * HEALING_CONFIG.CITY_GARRISON) + getHealingBonus(faction, terrainId);
    if (dist === 1) {
      // Adjacent to city = still in owned territory
      const hexOwner = getHexOwner(unit.position, state);
      if (hexOwner === factionId) return Math.floor(unit.maxHp * HEALING_CONFIG.OWNED_TERRITORY) + getHealingBonus(faction, terrainId);
    }
  }

  // Check village healing
  for (const [, village] of state.villages) {
    if (village.factionId !== factionId) continue;
    if (hexDistance(unit.position, village.position) === 0) {
      return Math.floor(unit.maxHp * HEALING_CONFIG.VILLAGE) + getHealingBonus(faction, terrainId);
    }
  }

  // Check if in owned territory (hex claimed by a friendly city)
  const hexOwner = getHexOwner(unit.position, state);
  if (hexOwner === factionId) {
    return Math.floor(unit.maxHp * HEALING_CONFIG.OWNED_TERRITORY) + getHealingBonus(faction, terrainId);
  }

  return Math.floor(unit.maxHp * HEALING_CONFIG.FIELD) + getHealingBonus(faction, terrainId);
}

export function createSimulationTrace(recordSnapshots: boolean = false): SimulationTrace {
  return {
    lines: [],
    snapshots: recordSnapshots ? [] : undefined,
    events: [],
    combatEvents: [],
    siegeEvents: [],
    aiIntentEvents: [],
    factionStrategyEvents: [],
    abilityLearnedEvents: [],
    unitSacrificedEvents: [],
    currentRound: 0,
  };
}

function recordSnapshot(
  state: GameState,
  trace: SimulationTrace | undefined,
  phase: 'start' | 'end'
): void {
  if (!trace?.snapshots) return;

  const factions: TurnSnapshot['factions'] = [];
  for (const [id, faction] of state.factions) {
    const livingUnits = faction.unitIds.filter((uid) => state.units.has(uid as never));
    factions.push({
      id,
      name: faction.name,
      livingUnits: livingUnits.length,
      cities: faction.cityIds.length,
      villages: faction.villageIds.length,
    });
  }

  const units: TurnSnapshot['units'] = [];
  for (const [id, unit] of state.units) {
    if (unit.hp <= 0) continue;
    units.push({
      id,
      factionId: unit.factionId,
      prototypeId: unit.prototypeId,
      q: unit.position.q,
      r: unit.position.r,
      hp: unit.hp,
      maxHp: unit.maxHp,
      facing: unit.facing,
    });
  }

  const cities: TurnSnapshot['cities'] = [];
  for (const [id, city] of state.cities) {
    cities.push({
      id,
      factionId: city.factionId,
      q: city.position.q,
      r: city.position.r,
      besieged: city.besieged,
      wallHP: city.wallHP,
      maxWallHP: city.maxWallHP,
      turnsUnderSiege: city.turnsUnderSiege,
    });
  }

  const villages: TurnSnapshot['villages'] = [];
  for (const [id, village] of state.villages) {
    villages.push({
      id,
      factionId: village.factionId,
      q: village.position.q,
      r: village.position.r,
    });
  }

  const factionTripleStacks: TurnSnapshot['factionTripleStacks'] = [];
  for (const [id, faction] of state.factions) {
    if (faction.activeTripleStack) {
      factionTripleStacks.push({
        factionId: id,
        domains: faction.activeTripleStack.domains,
        tripleName: faction.activeTripleStack.name,
        emergentRule: faction.activeTripleStack.emergentRule.name,
      });
    }
  }

  trace.snapshots.push({ round: state.round, phase, factions, units, cities, villages, factionTripleStacks });
}

function log(trace: SimulationTrace | undefined, line: string): void {
  trace?.lines.push(line);
  if (trace?.events) {
    trace.events.push({
      round: trace.currentRound ?? 0,
      message: line,
    });
  }
}

function recordCombatEvent(trace: SimulationTrace | undefined, event: TraceCombatEvent): void {
  trace?.combatEvents?.push(event);
}

function recordSiegeEvent(trace: SimulationTrace | undefined, event: TraceSiegeEvent): void {
  trace?.siegeEvents?.push(event);
}

function recordAiIntent(trace: SimulationTrace | undefined, event: TraceAiIntentEvent): void {
  trace?.aiIntentEvents?.push(event);
}

function recordFactionStrategy(trace: SimulationTrace | undefined, event: TraceFactionStrategyEvent): void {
  trace?.factionStrategyEvents?.push(event);
}



function maybeRecordEndSnapshot(state: GameState, trace: SimulationTrace | undefined): void {
  if (!trace?.snapshots) return;
  const lastSnapshot = trace.snapshots[trace.snapshots.length - 1];
  if (lastSnapshot?.round === state.round && lastSnapshot.phase === 'end') {
    return;
  }
  recordSnapshot(state, trace, 'end');
}

function getTerrainAt(state: GameState, pos: HexCoord): string {
  return state.map?.tiles.get(hexToKey(pos))?.terrain ?? 'plains';
}

function occupiesFriendlySettlement(state: GameState, unit: Unit): boolean {
  for (const city of state.cities.values()) {
    if (
      city.factionId === unit.factionId &&
      city.position.q === unit.position.q &&
      city.position.r === unit.position.r
    ) {
      return true;
    }
  }

  for (const village of state.villages.values()) {
    if (
      village.factionId === unit.factionId &&
      village.position.q === unit.position.q &&
      village.position.r === unit.position.r
    ) {
      return true;
    }
  }

  return false;
}

function isJungleImmune(state: GameState, unit: Unit): boolean {
  const faction = state.factions.get(unit.factionId);
  return faction?.identityProfile.passiveTrait === 'jungle_stalkers';
}

function canInflictPoison(state: GameState, unit: Unit): boolean {
  const prototype = state.prototypes.get(unit.prototypeId);
  return Boolean(prototype?.tags?.includes('poison'));
}

function applyEnvironmentalDamage(
  state: GameState,
  factionId: FactionId,
  registry: RulesRegistry,
  trace?: SimulationTrace
): GameState {
  const faction = state.factions.get(factionId);
  if (!faction) {
    return state;
  }

  const units = new Map(state.units);
  let current = state;
  // Faction-level doctrine (resolved once for faction-wide effects like toxic_bulwark)
  const factionResearch = state.research.get(factionId);
  const doctrine = resolveResearchDoctrine(factionResearch, faction);

  for (const unitId of faction.unitIds) {
    const unit = units.get(unitId);
    if (!unit || unit.hp <= 0) {
      continue;
    }

    const safeInSettlement = occupiesFriendlySettlement(current, unit);
    let updatedUnit = unit;
    let died = false;

    if (unit.poisoned && safeInSettlement) {
      updatedUnit = { ...updatedUnit, poisoned: false, poisonedBy: undefined, poisonStacks: 0 };
    }

    if (unit.poisoned && !safeInSettlement) {
      // Poison DoT: damage based on poisonStacks (2 dmg per stack per turn)
      const poisonDamage = unit.poisonStacks > 0 ? unit.poisonStacks * doctrine.poisonDamagePerStack : (
        unit.poisonedBy 
          ? registry.getSignatureAbility(unit.poisonedBy)?.venomDamagePerTurn ?? 1 
          : 1
      );
      updatedUnit = { ...updatedUnit, hp: Math.max(0, updatedUnit.hp - poisonDamage) };
      log(trace, `${faction.name} ${current.prototypes.get(unit.prototypeId)?.name ?? 'unit'} suffers poison (${poisonDamage} dmg, ${unit.poisonStacks} stacks)`);
      died = updatedUnit.hp <= 0;
    }

    const terrainId = getTerrainAt(current, unit.position);
    if (!died && terrainId === 'jungle' && !safeInSettlement && !isJungleImmune(current, updatedUnit)) {
      // Jungle attrition: 1 damage per turn in jungle (no research-based reduction)
      updatedUnit = { ...updatedUnit, hp: Math.max(0, updatedUnit.hp - 1) };
      log(trace, `${faction.name} ${current.prototypes.get(unit.prototypeId)?.name ?? 'unit'} suffers jungle attrition`);
      died = updatedUnit.hp <= 0;
    }

    // Contamination damage: units on contaminated hexes take 1 damage
    if (!died && !safeInSettlement && current.contaminatedHexes.has(hexToKey(unit.position))) {
      // Contamination: 1 damage per turn (no research-based reduction)
      updatedUnit = { ...updatedUnit, hp: Math.max(0, updatedUnit.hp - 1) };
      log(trace, `${faction.name} ${current.prototypes.get(unit.prototypeId)?.name ?? 'unit'} suffers contamination (1 dmg)`);
      died = updatedUnit.hp <= 0;
    }

    // Frostbite DoT: frozen units take frostbiteStacks damage, decrement duration
    if (!died && updatedUnit.frozen && (updatedUnit.frostbiteDoTDuration ?? 0) > 0 && (updatedUnit.frostbiteStacks ?? 0) > 0) {
      updatedUnit = { ...updatedUnit, hp: Math.max(0, updatedUnit.hp - (updatedUnit.frostbiteStacks ?? 0)) };
      const newDuration = (updatedUnit.frostbiteDoTDuration ?? 0) - 1;
      if (newDuration <= 0) {
        updatedUnit = { ...updatedUnit, frozen: false, frostbiteStacks: 0, frostbiteDoTDuration: 0 };
      } else {
        updatedUnit = { ...updatedUnit, frostbiteDoTDuration: newDuration };
      }
      log(trace, `${faction.name} ${current.prototypes.get(unit.prototypeId)?.name ?? 'unit'} suffers frostbite (${updatedUnit.frostbiteStacks ?? 0} dmg)`);
      died = updatedUnit.hp <= 0;
    }

    if (safeInSettlement && updatedUnit.poisoned) {
      updatedUnit = { ...updatedUnit, poisoned: false, poisonedBy: undefined, poisonStacks: 0 };
      log(trace, `${faction.name} ${current.prototypes.get(unit.prototypeId)?.name ?? 'unit'} is cleansed of poison`);
    }

    if (died) {
      units.delete(unitId);
      current = removeUnitFromFaction({ ...current, units }, factionId, unitId);
      log(trace, `${faction.name} ${current.prototypes.get(unit.prototypeId)?.name ?? 'unit'} succumbed to attrition`);
      continue;
    }

    units.set(unitId, updatedUnit);
  }

  // Toxic bulwark (venom Tier 3): each alive unit with this doctrine deals 1 poison damage
  // to each adjacent enemy unit per turn.
  if (doctrine.toxicBulwarkEnabled) {
    for (const unitIdStr of faction.unitIds) {
      const bulwarkUnit = units.get(unitIdStr as UnitId);
      if (!bulwarkUnit || bulwarkUnit.hp <= 0) continue;
      for (const neighbor of getNeighbors(bulwarkUnit.position)) {
        const neighborId = getUnitAtHex({ ...current, units }, neighbor);
        if (!neighborId) continue;
        const neighborUnit = units.get(neighborId) ?? current.units.get(neighborId);
        if (!neighborUnit || neighborUnit.factionId === factionId || neighborUnit.hp <= 0) continue;
        units.set(neighborId, {
          ...neighborUnit,
          hp: Math.max(0, neighborUnit.hp - 1),
        });
      }
    }
  }

  return { ...current, units };
}

function rotateUnitToward(unit: Unit, target: HexCoord): Unit {
  const facing = getDirectionIndex(unit.position, target);
  if (facing === null) {
    return unit;
  }
  return { ...unit, facing };
}

function shouldBrace(
  unit: Unit,
  prototype: { tags?: string[] },
  state: GameState,
  canUniversalBrace: boolean = false,
): boolean {
  if ((!canUseBrace(prototype as any) && !canUniversalBrace) || hasAdjacentEnemy(state, unit) === false) {
    return false;
  }

  return Array.from(state.units.values()).some((other) => {
    if (other.hp <= 0 || other.factionId === unit.factionId) {
      return false;
    }
    const enemyPrototype = state.prototypes.get(other.prototypeId);
    if (!enemyPrototype) {
      return false;
    }
    return hexDistance(unit.position, other.position) === 1 && canUseCharge(enemyPrototype);
  });
}

function maybeExpirePreparedAbility(unit: Unit, round: number, state: GameState): Unit {
  if (!unit.preparedAbility) {
    return unit;
  }

  if ((unit.preparedAbilityExpiresOnRound ?? round) < round) {
    return clearPreparedAbility(unit);
  }

  if (shouldClearAmbush(unit, state)) {
    return clearPreparedAbility(unit);
  }

  return unit;
}

/**
 * Choose the best available prototype based on current progression and faction context.
 * Returns [chassisId, prototypeId] or null if no valid choice.
 */
function chooseBestChassis(
  state: GameState,
  factionId: FactionId,
  registry: RulesRegistry
): { chassisId: string; prototypeId: string } | null {
  const faction = state.factions.get(factionId);
  const availablePrototypes = getAvailableProductionPrototypes(state, factionId, registry);
  if (!faction || availablePrototypes.length === 0) return null;

  const livingSteppeScreens = factionId === ('steppe_clan' as FactionId)
    ? faction.unitIds.reduce((count, unitId) => {
      const unit = state.units.get(unitId);
      if (!unit || unit.hp <= 0) {
        return count;
      }
      const prototype = state.prototypes.get(unit.prototypeId);
      if (!prototype || prototype.derivedStats.role === 'mounted') {
        return count;
      }
      const tags = new Set(prototype.tags ?? []);
      return tags.has('spear') || tags.has('formation') ? count + 1 : count;
    }, 0)
    : 0;
  const missingSteppeScreens = Math.max(0, 2 - livingSteppeScreens);

  const chassisCounts: Record<string, number> = {};
  const totalUnits = faction.unitIds.length;
  for (const unitId of faction.unitIds) {
    const unit = state.units.get(unitId);
    if (!unit || unit.hp <= 0) continue;
    const proto = state.prototypes.get(unit.prototypeId);
    if (proto) {
      chassisCounts[proto.chassisId] = (chassisCounts[proto.chassisId] ?? 0) + 1;
    }
  }

  const infantryFactionBonus =
    factionId === ('hill_clan' as FactionId)
      ? 2
      : factionId === ('druid_circle' as FactionId)
        ? 0.75
        : 0;
  const rangedFactionBonus =
    factionId === ('jungle_clan' as FactionId)
      ? 1.5
      : factionId === ('hill_clan' as FactionId)
        ? 1.0
        : factionId === ('druid_circle' as FactionId)
          ? 0.75
          : 0;
  const cavalryFactionBonus = factionId === ('steppe_clan' as FactionId) ? 2 : 0;
  const elephantFactionBonus = factionId === ('savannah_lions' as FactionId) ? 2 : 0;
  const navalFactionBonus = factionId === ('coral_people' as FactionId)
    ? 1.0
    : factionId === ('plains_riders' as FactionId)
      ? 1.5
      : 0;
  const steppeInfantryScreenBonus = missingSteppeScreens * 8;
  const steppeCavalryScreenPenalty = missingSteppeScreens * 3;

  const prototypeScores = availablePrototypes.map((prototype) => {
    const tags = new Set(prototype.tags ?? []);
    let score = 0;

    if (prototype.chassisId === 'infantry_frame' || prototype.chassisId === 'heavy_infantry_frame') {
      score += infantryFactionBonus + steppeInfantryScreenBonus;
      if (tags.has('fortress') || tags.has('formation')) score += 2;
    }

    if (prototype.chassisId === 'ranged_frame' || prototype.chassisId === 'ranged_naval_frame') {
      score += rangedFactionBonus;
      if (tags.has('ranged') || tags.has('skirmish')) score += 1.5;
    }

    if (prototype.chassisId === 'cavalry_frame' || prototype.chassisId === 'heavy_cavalry' || prototype.chassisId === 'chariot_frame') {
      score += cavalryFactionBonus - steppeCavalryScreenPenalty;
      if (tags.has('mobility') || tags.has('shock')) score += 2;
    }

    if (prototype.chassisId === 'camel_frame') {
      score += factionId === ('desert_nomads' as FactionId) ? 2 : 0;
      if (tags.has('camel') || tags.has('desert')) score += 2;
    }

    if (prototype.chassisId === 'naval_frame' || prototype.chassisId === 'galley_frame') {
      score += navalFactionBonus;
      if (tags.has('naval') || tags.has('amphibious')) score += 2;
    }

    if (prototype.chassisId === 'elephant_frame') {
      score += elephantFactionBonus;
      if (tags.has('elephant') || tags.has('shock')) score += 2;
    }

    score -= (chassisCounts[prototype.chassisId] ?? 0) / Math.max(1, totalUnits) * 3;
    return { prototypeId: prototype.id, score };
  });

  prototypeScores.sort((a, b) => b.score - a.score);

  for (const { prototypeId } of prototypeScores) {
    const prototype = availablePrototypes.find((entry) => entry.id === prototypeId);
    if (prototype) {
      return { chassisId: prototype.chassisId, prototypeId: prototype.id };
    }
  }

  const fallbackProto = availablePrototypes[0];
  if (fallbackProto) {
    return { chassisId: fallbackProto.chassisId, prototypeId: fallbackProto.id };
  }

  return null;
}

export function getVictoryStatus(state: GameState): VictoryStatus {
  const factionsWithUnits = new Set(
    Array.from(state.units.values())
      .filter((unit) => unit.hp > 0)
      .map((unit) => unit.factionId)
  );
  const factionsWithCities = new Set(
    Array.from(state.cities.values())
      .filter((city) => !city.besieged)
      .map((city) => city.factionId)
  );
  const aliveFactionIds = new Set([...factionsWithUnits, ...factionsWithCities]);

  if (aliveFactionIds.size === 1) {
    return {
      winnerFactionId: [...aliveFactionIds][0],
      victoryType: 'elimination',
      controlledCities: null,
      dominationThreshold: null,
    };
  }

  const totalCities = state.cities.size;
  if (totalCities > 0) {
    const dominationThreshold = Math.ceil(totalCities * 0.55);
    const cityControl = new Map<FactionId, number>();
    for (const city of state.cities.values()) {
      cityControl.set(city.factionId, (cityControl.get(city.factionId) ?? 0) + 1);
    }

    for (const [factionId, controlledCities] of cityControl) {
      if (controlledCities >= dominationThreshold) {
        return {
          winnerFactionId: factionId,
          victoryType: 'domination',
          controlledCities,
          dominationThreshold,
        };
      }
    }

    return {
      winnerFactionId: null,
      victoryType: 'unresolved',
      controlledCities: Math.max(0, ...cityControl.values()),
      dominationThreshold,
    };
  }

  return {
    winnerFactionId: null,
    victoryType: 'unresolved',
    controlledCities: null,
    dominationThreshold: null,
  };
}

function getImprovementBonus(state: GameState, pos: HexCoord): number {
  // Check improvements first (e.g. field forts)
  for (const [, improvement] of state.improvements) {
    if (improvement.position.q === pos.q && improvement.position.r === pos.r) {
      return improvement.defenseBonus ?? 0;
    }
  }
  // Cities give +100% defense
  for (const [, city] of state.cities) {
    if (city.position.q === pos.q && city.position.r === pos.r) {
      return 1;
    }
  }
  // Villages give +50% defense
  for (const [, village] of state.villages) {
    if (village.position.q === pos.q && village.position.r === pos.r) {
      return 0.5;
    }
  }
  return 0;
}

function getImprovementAtHex(state: GameState, pos: HexCoord) {
  for (const [, improvement] of state.improvements) {
    if (improvement.position.q === pos.q && improvement.position.r === pos.r) {
      return improvement;
    }
  }
  return null;
}

function isFortificationHex(state: GameState, pos: HexCoord): boolean {
  return getImprovementAtHex(state, pos)?.type === 'fortification';
}

function countFriendlyUnitsNearHex(
  state: GameState,
  factionId: FactionId,
  pos: HexCoord,
  radius: number,
  excludedUnitId?: UnitId,
): number {
  let count = 0;
  for (const unit of state.units.values()) {
    if (unit.hp <= 0 || unit.factionId !== factionId) continue;
    if (excludedUnitId && unit.id === excludedUnitId) continue;
    if (hexDistance(pos, unit.position) <= radius) {
      count += 1;
    }
  }
  return count;
}

function countFortificationsNearHex(state: GameState, pos: HexCoord, radius: number): number {
  let count = 0;
  for (const improvement of state.improvements.values()) {
    if (improvement.type !== 'fortification') continue;
    if (hexDistance(pos, improvement.position) <= radius) {
      count += 1;
    }
  }
  return count;
}

function countUnitsNearHex(
  state: GameState,
  pos: HexCoord,
  radius: number,
  predicate: (unit: Unit) => boolean,
): number {
  let count = 0;
  for (const unit of state.units.values()) {
    if (unit.hp <= 0) continue;
    if (!predicate(unit)) continue;
    if (hexDistance(pos, unit.position) <= radius) {
      count += 1;
    }
  }
  return count;
}

function startOrAdvanceCodification(
  state: GameState,
  factionId: FactionId,
  registry: RulesRegistry,
  trace?: SimulationTrace,
  strategy?: FactionStrategy,
  difficulty?: DifficultyLevel,
): GameState {
  const faction = state.factions.get(factionId);
  const research = state.research.get(factionId);
  if (!faction || !research) {
    return state;
  }

  let currentResearch = research;
  if (!currentResearch.activeNodeId) {
    const decision = strategy ? chooseStrategicResearch(state, factionId, strategy, registry, difficulty) : null;
    if (decision) {
      const decisionNode = registry.getAllResearchDomains()
        .flatMap((domain) => Object.values(domain.nodes))
        .find((node) => node.id === decision.nodeId);
      const prerequisitesMet = (decisionNode?.prerequisites ?? []).every(
        (prereqId) => currentResearch.completedNodes.includes(prereqId as never)
      );
      if (prerequisitesMet) {
        currentResearch = startResearch(
          currentResearch,
          decision.nodeId as never,
          decisionNode?.prerequisites,
          faction.learnedDomains,
        );
        const nodeName = decisionNode?.name ?? decision.nodeId;
        log(trace, `${faction.name} starts research on ${nodeName} (${decision.reason})`);
      }
    }
  }

  if (!currentResearch.activeNodeId) {
    return state;
  }

  const activeDomain = registry.getAllResearchDomains().find((domain) =>
    Boolean(domain.nodes[currentResearch.activeNodeId as string])
  );
  const activeNode = activeDomain?.nodes[currentResearch.activeNodeId as string];
  if (!activeNode) {
    return state;
  }

  const updatedResearch = addResearchProgress(
    currentResearch,
    activeNode.xpCost,
    currentResearch.researchPerTurn,
  );

  const researchMap = new Map(state.research);
  researchMap.set(factionId, updatedResearch);
  let current = { ...state, research: researchMap };

  if (!updatedResearch.activeNodeId) {
    log(trace, `${faction.name} completed research: ${activeNode.name}`);
  }

  return current;
}

// Smart targeting: score each adjacent enemy by matchup favorability
function findBestTargetChoice(
  state: GameState,
  unitId: UnitId,
  position: HexCoord,
  friendlyFactionId: FactionId,
  myPrototype: { role: string; tags?: string[] },
  registry: RulesRegistry
) {
  let bestTarget: typeof state.units extends Map<any, infer U> ? U : never = null as any;
  let bestScore = -Infinity;
  const strategy = state.factionStrategies.get(friendlyFactionId);
  const actingUnit = state.units.get(unitId);
  const unitIntent = actingUnit ? getUnitIntent(strategy, unitId) : undefined;
  const nearestFriendlyDist = actingUnit
    ? getNearestFriendlyDistanceToHex(state, friendlyFactionId, position)
    : 99;
  const anchorDistance = unitIntent ? hexDistance(position, unitIntent.anchor) : 0;

  for (const targetPos of getNeighbors(position)) {
    for (const [, unit] of state.units) {
      if (
        unit.factionId !== friendlyFactionId &&
        unit.hp > 0 &&
        unit.position.q === targetPos.q &&
        unit.position.r === targetPos.r
      ) {
        const targetPrototype = state.prototypes.get(unit.prototypeId);
        if (!targetPrototype) continue;

        // River-stealthed units (plains_riders on river) are invisible to AI targeting
        const targetTerrain = state.map?.tiles.get(hexToKey(unit.position))?.terrain ?? '';
        const targetFaction = state.factions.get(unit.factionId);
        if (isUnitRiverStealthed(targetFaction, targetTerrain)) continue;
        
        // Stealth-tagged units with isStealthed=true are invisible to AI targeting
        if (unit.isStealthed) continue;

        const targetRole = targetPrototype.derivedStats.role;
        const targetMovementClass = registry.getChassis(targetPrototype.chassisId)?.movementClass ?? 'infantry';

        const roleMod = getRoleEffectiveness(myPrototype.role, targetRole);
        const myWeaponTags: string[] = [];
        for (const compId of (myPrototype as any).componentIds ?? []) {
          const comp = registry.getComponent(compId);
          if (comp?.slotType === 'weapon' && comp.tags) myWeaponTags.push(...comp.tags);
        }
        const weaponMod = getWeaponEffectiveness(myWeaponTags, targetMovementClass);
        const reverseRoleMod = getRoleEffectiveness(targetRole, myPrototype.role);
        const strategicScore = scoreStrategicTarget({
          isFocusTarget: Boolean(strategy?.focusTargetUnitIds.includes(unit.id)),
          isAdjacentToPrimaryObjectiveCity: Boolean(
            strategy?.primaryCityObjectiveId
            && Array.from(state.cities.values()).some(
              (city) =>
                city.id === strategy.primaryCityObjectiveId
                && city.factionId !== friendlyFactionId
                && hexDistance(city.position, unit.position) <= 1,
            ),
          ),
          isRouted: unit.routed,
          hpRatio: unit.hp / Math.max(1, unit.maxHp),
          attacksFromThreatenedCityHex: Boolean(
            strategy?.threatenedCities.some((threat) => {
              const city = state.cities.get(threat.cityId);
              return city && city.position.q === position.q && city.position.r === position.r;
            }),
          ),
          finishOffPriorityTarget: strategy?.absorptionGoal.targetFactionId === unit.factionId
            && Boolean(strategy.absorptionGoal.finishOffPriority),
          isolatedFromAnchor: Boolean(unitIntent && nearestFriendlyDist > 3 && anchorDistance > 4),
        });

        // Pirate Lords: prefer targets on coast/water (their home terrain)
        let extraScore = 0;
        const attackerFaction = state.factions.get(friendlyFactionId);
        if (attackerFaction?.identityProfile.passiveTrait === 'greedy') {
          const targetTerrain = state.map?.tiles.get(hexToKey(unit.position))?.terrain ?? '';
          if (targetTerrain === 'coast' || targetTerrain === 'river' || targetTerrain === 'ocean') {
            extraScore += 3;
          }
        }

        const attackingIntoFort = isFortificationHex(state, unit.position);
        const friendlySupport = countFriendlyUnitsNearHex(state, friendlyFactionId, unit.position, 2, unitId);
        if (
          attackingIntoFort
          && friendlySupport === 0
          && unit.hp / Math.max(1, unit.maxHp) > 0.35
          && !unit.routed
        ) {
          continue;
        }
        if (attackingIntoFort) {
          extraScore += friendlySupport > 0 ? -4 : -18;
        }

        const score = scoreAttackCandidate({
          roleEffectiveness: roleMod,
          weaponEffectiveness: weaponMod,
          reverseRoleEffectiveness: reverseRoleMod,
          targetHpRatio: unit.hp / Math.max(1, unit.maxHp),
          targetRouted: unit.routed,
          strategicTargetScore: strategicScore,
          extraScore,
        });

        if (score > bestScore) {
          bestScore = score;
          bestTarget = unit;
        }
      }
    }
  }

  return { target: bestTarget, score: bestScore };
}

function findBestTarget(
  state: GameState,
  unitId: UnitId,
  position: HexCoord,
  friendlyFactionId: FactionId,
  myPrototype: { role: string; tags?: string[] },
  registry: RulesRegistry
) {
  return findBestTargetChoice(state, unitId, position, friendlyFactionId, myPrototype, registry).target;
}

/** Ranged targeting for units with range > 1. Scores all enemies within Chebyshev range. */
function findBestRangedTarget(
  state: GameState,
  unitId: UnitId,
  position: HexCoord,
  friendlyFactionId: FactionId,
  myPrototype: { role: string; tags?: string[]; derivedStats?: { range?: number } },
  registry: RulesRegistry,
  range: number
) {
  let bestTarget: typeof state.units extends Map<any, infer U> ? U : never = null as any;
  let bestScore = -Infinity;
  const strategy = state.factionStrategies.get(friendlyFactionId);
  const actingUnit = state.units.get(unitId);
  const unitIntent = actingUnit ? getUnitIntent(strategy, unitId) : undefined;
  const isSiege = myPrototype.tags?.includes('siege') ?? false;
  const nearestFriendlyDist = actingUnit
    ? getNearestFriendlyDistanceToHex(state, friendlyFactionId, position)
    : 99;
  const anchorDistance = unitIntent ? hexDistance(position, unitIntent.anchor) : 0;

  const hexesInRange = getHexesInRange(position, range);

  for (const hex of hexesInRange) {
    // Skip the unit's own hex
    if (hex.q === position.q && hex.r === position.r) continue;

    for (const [, unit] of state.units) {
      if (
        unit.factionId !== friendlyFactionId &&
        unit.hp > 0 &&
        unit.position.q === hex.q &&
        unit.position.r === hex.r
      ) {
        const targetPrototype = state.prototypes.get(unit.prototypeId);
        if (!targetPrototype) continue;

        // River-stealthed units are invisible to AI targeting
        const targetTerrain = state.map?.tiles.get(hexToKey(unit.position))?.terrain ?? '';
        const targetFaction = state.factions.get(unit.factionId);
        if (isUnitRiverStealthed(targetFaction, targetTerrain)) continue;

        // Stealth-tagged units with isStealthed=true are invisible
        if (unit.isStealthed) continue;

        const targetRole = targetPrototype.derivedStats.role;
        const targetMovementClass = registry.getChassis(targetPrototype.chassisId)?.movementClass ?? 'infantry';

        const dist = hexDistance(position, unit.position);
        const roleMod = getRoleEffectiveness(myPrototype.role, targetRole);
        const myWeaponTags: string[] = [];
        for (const compId of (myPrototype as any).componentIds ?? []) {
          const comp = registry.getComponent(compId);
          if (comp?.slotType === 'weapon' && comp.tags) myWeaponTags.push(...comp.tags);
        }
        const weaponMod = getWeaponEffectiveness(myWeaponTags, targetMovementClass);
        const reverseRoleMod = getRoleEffectiveness(targetRole, myPrototype.role);
        const strategicScore = scoreStrategicTarget({
          isFocusTarget: Boolean(strategy?.focusTargetUnitIds.includes(unit.id)),
          isAdjacentToPrimaryObjectiveCity: Boolean(
            strategy?.primaryCityObjectiveId
            && Array.from(state.cities.values()).some(
              (city) =>
                city.id === strategy.primaryCityObjectiveId
                && city.factionId !== friendlyFactionId
                && hexDistance(city.position, unit.position) <= 1,
            ),
          ),
          isRouted: unit.routed,
          hpRatio: unit.hp / Math.max(1, unit.maxHp),
          attacksFromThreatenedCityHex: Boolean(
            strategy?.threatenedCities.some((threat) => {
              const city = state.cities.get(threat.cityId);
              return city && city.position.q === position.q && city.position.r === position.r;
            }),
          ),
          finishOffPriorityTarget: strategy?.absorptionGoal.targetFactionId === unit.factionId
            && Boolean(strategy.absorptionGoal.finishOffPriority),
          isolatedFromAnchor: Boolean(unitIntent && nearestFriendlyDist > 3 && anchorDistance > 4),
        });

        // Pirate Lords: prefer targets on coast/water
        let extraScore = 0;
        const attackerFaction = state.factions.get(friendlyFactionId);
        if (attackerFaction?.identityProfile.passiveTrait === 'greedy') {
          const tTerrain = state.map?.tiles.get(hexToKey(unit.position))?.terrain ?? '';
          if (tTerrain === 'coast' || tTerrain === 'river' || tTerrain === 'ocean') {
            extraScore += 3;
          }
        }
        const isOnCity = [...state.cities.values()].some(
          (city) => city.position.q === unit.position.q && city.position.r === unit.position.r
        );
        const defenderOnFort = getImprovementBonus(state, unit.position) > 0;
        const friendlySupport = countFriendlyUnitsNearHex(state, friendlyFactionId, unit.position, 2, unitId);
        if (
          defenderOnFort
          && friendlySupport === 0
          && unit.hp / Math.max(1, unit.maxHp) > 0.35
          && !unit.routed
        ) {
          continue;
        }
        const score = scoreAttackCandidate({
          roleEffectiveness: roleMod,
          weaponEffectiveness: weaponMod,
          reverseRoleEffectiveness: reverseRoleMod,
          targetHpRatio: unit.hp / Math.max(1, unit.maxHp),
          targetRouted: unit.routed,
          strategicTargetScore: strategicScore,
          extraScore: extraScore + (defenderOnFort ? (friendlySupport > 0 ? -4 : -18) : 0),
          distancePenalty: dist * 0.5,
          isSiegeVsCity: isSiege && isOnCity,
          isSiegeVsFort: isSiege && defenderOnFort,
        });

        if (score > bestScore) {
          bestScore = score;
          bestTarget = unit;
        }
      }
    }
  }

  return { target: bestTarget, score: bestScore };
}

function getNearestFriendlyDistanceToHex(
  state: GameState,
  factionId: FactionId,
  hex: HexCoord,
  excludedUnitId?: UnitId,
): number {
  let nearest = Infinity;
  for (const unit of state.units.values()) {
    if (unit.factionId !== factionId || unit.hp <= 0) continue;
    if (excludedUnitId && unit.id === excludedUnitId) continue;
    nearest = Math.min(nearest, hexDistance(unit.position, hex));
  }
  return nearest === Infinity ? 99 : nearest;
}

function countNearbyUnitPressure(
  state: GameState,
  factionId: FactionId,
  hex: HexCoord,
  excludedUnitId?: UnitId,
): { nearbyEnemies: number; nearbyFriendlies: number } {
  let nearbyEnemies = 0;
  let nearbyFriendlies = 0;

  for (const unit of state.units.values()) {
    if (unit.hp <= 0) continue;
    if (excludedUnitId && unit.id === excludedUnitId) continue;
    if (hexDistance(hex, unit.position) > 2) continue;

    if (unit.factionId === factionId) {
      nearbyFriendlies += 1;
    } else {
      nearbyEnemies += 1;
    }
  }

  return { nearbyEnemies, nearbyFriendlies };
}

function maybeAbsorbFaction(
  state: GameState,
  victorFactionId: FactionId,
  defeatedFactionId: FactionId,
  trace?: SimulationTrace
): GameState {
  const stillAlive = Array.from(state.units.values()).some(
    (unit) => unit.factionId === defeatedFactionId && unit.hp > 0
  );
  if (stillAlive) {
    return state;
  }

  const defeatedFaction = state.factions.get(defeatedFactionId);
  const victorFaction = state.factions.get(victorFactionId);
  if (!defeatedFaction || !victorFaction) return state;

  log(trace, `${victorFaction.name} absorbed ${defeatedFaction.name}`);

  let current = applyContactTransfer(state, victorFactionId, defeatedFactionId, 'absorption');
  current = updateCombatRecordOnElimination(current, victorFactionId);

  // Transfer cities from defeated faction to victor.
  const newCities = new Map(current.cities);
  for (const cityId of getFactionCityIds(current, defeatedFactionId)) {
    const city = current.cities.get(cityId);
    if (city) {
      newCities.set(cityId, { ...city, factionId: victorFactionId, turnsSinceCapture: 0 });
    }
  }

  // Transfer villages from defeated faction to victor.
  const newVillages = new Map(current.villages);
  for (const villageId of Array.from(current.villages.values())
    .filter((village) => village.factionId === defeatedFactionId)
    .map((village) => village.id)) {
    const village = current.villages.get(villageId);
    if (village) {
      newVillages.set(villageId, { ...village, factionId: victorFactionId });
    }
  }

  const newFactions = new Map(current.factions);
  newFactions.set(defeatedFactionId, {
    ...defeatedFaction,
    cityIds: [],
    villageIds: [],
  });

  return syncAllFactionSettlementIds({
    ...current,
    cities: newCities,
    villages: newVillages,
    factions: newFactions,
  });
}

function getAliveFactions(state: GameState): Set<FactionId> {
  const factionsWithUnits = new Set(
    Array.from(state.units.values())
      .filter((u) => u.hp > 0)
      .map((unit) => unit.factionId)
  );
  const factionsWithCities = new Set(
    Array.from(state.cities.values())
      .filter((city) => !city.besieged)
      .map((city) => city.factionId)
  );

  return new Set([...factionsWithUnits, ...factionsWithCities]);
}

function removeUnitFromFaction(
  state: GameState,
  factionId: FactionId,
  unitId: UnitId
): GameState {
  const faction = state.factions.get(factionId);
  if (!faction) {
    return state;
  }

  const factions = new Map(state.factions);
  factions.set(factionId, {
    ...faction,
    unitIds: faction.unitIds.filter((id) => id !== unitId),
  });

  return { ...state, factions };
}

function setUnitActivated(state: GameState, unitId: UnitId): GameState {
  const unit = state.units.get(unitId);
  if (!unit) {
    return state;
  }

  const units = new Map(state.units);
  units.set(unitId, {
    ...unit,
    activatedThisRound: true,
    status: 'spent',
  });

  return { ...state, units };
}

function buildFieldFortIfEligible(
  state: GameState,
  factionId: FactionId,
  unitId: UnitId,
  registry: RulesRegistry,
  fortsBuiltThisRound?: Set<FactionId>
): GameState {
  const faction = state.factions.get(factionId);
  const unit = state.units.get(unitId);
  const research = state.research.get(factionId);
  const doctrine = resolveResearchDoctrine(research, faction);
  if (
    !faction ||
    !unit ||
    factionId !== ('hill_clan' as FactionId) ||
    unit.hp <= 0 ||
    fortsBuiltThisRound?.has(factionId) ||
    unit.movesRemaining !== unit.maxMoves ||
    unit.status !== 'ready'
  ) {
    return state;
  }

  // Field fort build eligibility: 
  // - zoCAuraEnabled (fortress_t2) indicates the faction has developed fortification doctrine
  // - Units with the right movement class can construct field forts
  if (!doctrine.canBuildFieldForts) {
    return state;
  }

  const prototype = state.prototypes.get(unit.prototypeId);
  const movementClass = prototype ? registry.getChassis(prototype.chassisId)?.movementClass : undefined;
  const role = prototype?.derivedStats.role;
  if (!(movementClass === 'infantry' || role === 'ranged')) {
    return state;
  }

  if (getImprovementAtHex(state, unit.position)) {
    return state;
  }

  const strategy = state.factionStrategies.get(factionId);
  const unitIntent = getUnitIntent(strategy, unitId);
  const nearbyEnemies = countUnitsNearHex(state, unit.position, 2, (other) => other.factionId !== factionId);
  const nearbyFriendlySupport = countFriendlyUnitsNearHex(state, factionId, unit.position, 2, unitId);
  const nearbyFortCount = countFortificationsNearHex(state, unit.position, 2);
  const nearestCity = getNearestFriendlyCity(state, factionId, unit.position);
  const cityDistance = nearestCity ? hexDistance(unit.position, nearestCity.position) : 99;
  const terrain = getTerrainAt(state, unit.position);
  const isDefensiveAssignment =
    unitIntent?.assignment === 'defender'
    || unitIntent?.assignment === 'recovery'
    || unitIntent?.assignment === 'reserve';
  const worthwhile =
    nearbyFriendlySupport > 0
    && nearbyFortCount === 0
    && (
      nearbyEnemies > 0
      || (isDefensiveAssignment && terrain === 'hill' && cityDistance <= 3)
    );
  if (!worthwhile) {
    return state;
  }

  const fortId = createImprovementId();
  const improvements = new Map(state.improvements);
  const fieldFort = registry.getImprovement('field_fort');
  improvements.set(fortId, {
    id: fortId,
    type: 'fortification',
    position: { ...unit.position },
    ownerFactionId: factionId,
    defenseBonus: fieldFort?.defenseBonus ?? 2,
  });
  fortsBuiltThisRound?.add(factionId);
  return { ...state, improvements };
}

function applyHillDugInIfEligible(
  state: GameState,
  factionId: FactionId,
  unitId: UnitId
): GameState {
  const faction = state.factions.get(factionId);
  const research = state.research.get(factionId);
  const unit = state.units.get(unitId);
  if (!faction || !unit || unit.hp <= 0) {
    return state;
  }

  const doctrine = resolveResearchDoctrine(research, faction);
  if (!doctrine.rapidEntrenchEnabled || getTerrainAt(state, unit.position) !== 'hill') {
    return state;
  }

  const units = new Map(state.units);
  units.set(unitId, { ...unit, hillDugIn: true });
  return { ...state, units };
}

/**
 * Summon Ability (generic): Manages summon lifecycle
 * - If summon exists, decrement turnsRemaining
 * - If turnsRemaining expires, remove summon and start cooldown
 * - If cooldown active, decrement it
 * - If no summon and no cooldown, spawn new summon on valid terrain
 */
function applySummonAbility(
  state: GameState,
  factionId: FactionId,
  registry: RulesRegistry,
  trace?: SimulationTrace
): GameState {
  const faction = state.factions.get(factionId);
  if (!faction || !state.map) return state;

  const abilities = registry.getSignatureAbility(factionId);
  if (!abilities) return state;

  const summonConfig = abilities.summon;
  if (!summonConfig) return state;

  const summonDuration = abilities.summonDuration ?? 5;
  const cooldownDuration = abilities.cooldownDuration ?? 5;

  // Initialize summonState if not exists
  let summonState = faction.summonState ?? {
    summoned: false,
    turnsRemaining: 0,
    cooldownRemaining: 0,
    unitId: null,
  };



  // If summon exists, decrement turnsRemaining
  if (summonState.summoned && summonState.unitId) {
    summonState = {
      ...summonState,
      turnsRemaining: summonState.turnsRemaining - 1,
    };

    // If turnsRemaining expired, remove the summon
    if (summonState.turnsRemaining <= 0 && summonState.unitId) {
      const units = new Map(state.units);
      units.delete(summonState.unitId);
      
      // Remove summon from faction's unitIds
      const updatedFaction = {
        ...faction,
        unitIds: faction.unitIds.filter(id => id !== summonState.unitId),
        summonState: {
          ...summonState,
          summoned: false,
          unitId: null,
          cooldownRemaining: cooldownDuration,
        },
      };
      const factions = new Map(state.factions);
      factions.set(factionId, updatedFaction);
      
      log(trace, `${faction.name}'s ${summonConfig.name} expired`);
      return { ...state, units, factions };
    }
  } 
  // If no summon but cooldown active, decrement cooldown
  else if (summonState.cooldownRemaining > 0) {
    summonState = {
      ...summonState,
      cooldownRemaining: summonState.cooldownRemaining - 1,
    };
  }
  // If no summon and no cooldown, try to spawn on valid terrain
  else {
    // Find a priest unit on valid terrain for this summon
    let validUnit: Unit | null = null;
    for (const unitId of faction.unitIds) {
      const unit = state.units.get(unitId);
      if (unit && unit.hp > 0) {
        const terrainId = getTerrainAt(state, unit.position);
        if (summonConfig.terrainTypes.includes(terrainId)) {
          // Only priests can trigger summoning
          const prototype = state.prototypes.get(unit.prototypeId);
          if (prototype && (prototype.tags ?? []).includes('priest')) {
            validUnit = unit;
            break;
          }
        }
      }
    }

    if (validUnit) {
      // Find adjacent empty hex for summon
      const neighbors = getNeighbors(validUnit.position);
      let spawnHex: HexCoord | null = null;
      
      for (const hex of neighbors) {
        const tile = state.map.tiles.get(hexToKey(hex));
        if (!tile) continue;
        const terrainDef = registry.getTerrain(tile.terrain);
        if (terrainDef?.passable === false) continue;
        if (isHexOccupied(state, hex)) continue;
        spawnHex = hex;
        break;
      }

      if (spawnHex) {
        // Create summon prototype if not exists
        const prototypeId = `${factionId}_${summonConfig.chassisId}` as PrototypeId;
        if (!state.prototypes.has(prototypeId)) {
          const summonPrototype: Prototype = {
            id: prototypeId,
            factionId: factionId,
            chassisId: summonConfig.chassisId as ChassisId,
            componentIds: [],
            version: 1,
            name: summonConfig.name,
            derivedStats: {
              attack: summonConfig.attack,
              defense: summonConfig.defense,
              hp: summonConfig.hp,
              moves: summonConfig.moves,
              range: 1,
              role: 'melee',
            },
            tags: summonConfig.tags,
          };
          const prototypes = new Map(state.prototypes);
          prototypes.set(prototypeId, summonPrototype);
          state = { ...state, prototypes };
        }

        // Create the summon unit
        const summonUnitId = createUnitId() as UnitId;
        const summonUnit: Unit = {
          id: summonUnitId,
          factionId: factionId,
          position: spawnHex,
          facing: 0,
          hp: summonConfig.hp,
          maxHp: summonConfig.hp,
          movesRemaining: summonConfig.moves,
          maxMoves: summonConfig.moves,
          attacksRemaining: 1,
          xp: 0,
          veteranLevel: 'green' as VeteranLevel,
          status: 'ready' as UnitStatus,
          prototypeId: prototypeId,
          history: [],
          morale: 100,
          routed: false,
          poisoned: false,
          enteredZoCThisActivation: false,
          poisonStacks: 0,
          isStealthed: false,
          turnsSinceStealthBreak: 0,
          learnedAbilities: [],
        };

        const units = new Map(state.units);
        units.set(summonUnitId, summonUnit);

        summonState = {
          summoned: true,
          turnsRemaining: summonDuration,
          cooldownRemaining: 0,
          unitId: summonUnitId,
        };

        const updatedFaction = {
          ...faction,
          unitIds: [...faction.unitIds, summonUnitId],
          summonState,
        };
        const factions = new Map(state.factions);
        factions.set(factionId, updatedFaction);

        log(trace, `${faction.name} summoned a ${summonConfig.name} at ${JSON.stringify(spawnHex)}`);
        return { ...state, units, factions };
      }
    }
  }

  // Update faction with current summonState if changed
  if (faction.summonState !== summonState) {
    const updatedFaction = { ...faction, summonState };
    const factions = new Map(state.factions);
    factions.set(factionId, updatedFaction);
    return { ...state, factions };
  }

  return state;
}

/**
 * Warlord Command (Steppe Clan): Applies aura buff to friendly cavalry/mounted units near warlord units.
 * - Finds all living warlord units belonging to the faction
 * - For each warlord, buffs friendly cavalry/mounted units within aura radius
 * - Morale boost is capped at 100
 */
function applyWarlordAura(
  state: GameState,
  factionId: FactionId,
  registry: RulesRegistry,
  trace?: SimulationTrace
): GameState {
  const faction = state.factions.get(factionId);
  if (!faction) return state;

  const auraRadius = 3;
  const moraleBoost = 10;

  // Find all living warlord units for this faction
  const warlordUnits: Unit[] = [];
  for (const unitId of faction.unitIds) {
    const unit = state.units.get(unitId);
    if (!unit || unit.hp <= 0) continue;
    const protoTags = state.prototypes.get(unit.prototypeId)?.tags ?? [];
    if (protoTags.includes('warlord')) {
      warlordUnits.push(unit);
    }
  }

  if (warlordUnits.length === 0) return state;

  // Find all friendly living cavalry/mounted units and apply aura buff
  const unitsMap = new Map(state.units);
  let anyBuffed = false;

  for (const warlord of warlordUnits) {
    for (const [unitId, unit] of unitsMap) {
      // Skip dead units, non-friendly units, and the warlord itself
      if (unit.hp <= 0 || unit.factionId !== factionId) continue;

      const dist = hexDistance(warlord.position, unit.position);
      if (dist > auraRadius) continue;

      const protoTags = state.prototypes.get(unit.prototypeId)?.tags ?? [];
      if (!protoTags.includes('cavalry') && !protoTags.includes('mounted')) continue;

      // Apply morale boost (cap at 100)
      const newMorale = Math.min(100, unit.morale + moraleBoost);
      if (newMorale !== unit.morale) {
        unitsMap.set(unitId, { ...unit, morale: newMorale });
        anyBuffed = true;
      }
    }
  }

  if (anyBuffed) {
    log(trace, `${faction.name}'s Warlord Command aura buffed nearby cavalry/mounted units`);
  }

  return { ...state, units: unitsMap };
}

function setFactionTripleStack(state: GameState, factionId: FactionId, triple: ActiveTripleStack | null): GameState {
  const faction = state.factions.get(factionId);
  if (!faction) return state;
  const factions = new Map(state.factions);
  factions.set(factionId, { ...faction, activeTripleStack: triple ?? undefined });
  return { ...state, factions };
}

function applyGhostArmyMovement(state: GameState, factionId: FactionId, bonusMovement: number): GameState {
  const units = new Map(state.units);
  const faction = state.factions.get(factionId);
  if (!faction) return state;

  for (const unitId of faction.unitIds) {
    const unit = units.get(unitId as UnitId);
    if (unit && unit.hp > 0) {
      units.set(unitId as UnitId, {
        ...unit,
        maxMoves: unit.maxMoves + bonusMovement,
        movesRemaining: unit.movesRemaining + bonusMovement,
      });
    }
  }
  return { ...state, units };
}

function applyJuggernautBonus(state: GameState, factionId: FactionId): GameState {
  const faction = state.factions.get(factionId);
  if (!faction) return state;
  const factions = new Map(state.factions);
  factions.set(factionId, { ...faction, juggernautActive: true });
  return { ...state, factions };
}

function processFactionPhases(
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

  let current = state;
  current = updateFogState(current, factionId);
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

  // Resolve triple stack at start of faction's turn
  const engine = getSynergyEngine();
  const progression = getDomainProgression(faction, current.research.get(factionId));
  const tripleStack = engine.resolveFactionTriple(
    progression.pairEligibleDomains,
    progression.emergentEligibleDomains,
  );
  if (tripleStack) {
    log(trace, `${faction.name} activates ${tripleStack.name} — ${tripleStack.emergentRule.name} emergent!`);
  }

  // Apply emergent effects based on triple type
  if (tripleStack) {
    const emergent = tripleStack.emergentRule.effect;
    if (emergent.type === 'mobility_unit') {
      if (emergent.bonusMovement) {
        current = applyGhostArmyMovement(current, factionId, emergent.bonusMovement);
      }
    }
    if (emergent.type === 'combat_unit') {
      if (emergent.doubleCombatBonuses) {
        current = applyJuggernautBonus(current, factionId);
      }
    }
    // Store the triple stack in state for combat system to use
    current = setFactionTripleStack(current, factionId, tripleStack);
  } else {
    // Clear any previously active triple stack
    current = setFactionTripleStack(current, factionId, null);
  }

  current = applyEcologyPressure(current, factionId, registry);
  current = applyForceCompositionPressure(current, factionId, registry);
  current = startOrAdvanceCodification(current, factionId, registry, trace, strategy, difficulty);
  current = unlockHybridRecipes(current, factionId, registry);

  // Advance captured city ramp timers
  current = advanceCaptureTimers(current, factionId);

  // Economy: derive resource income and advance production
  const economy = deriveResourceIncome(current, factionId, registry);
  const economyMap = new Map(current.economy);
  economyMap.set(factionId, economy);
  current = { ...current, economy: economyMap };

  // Advance production for each city
  const citiesMap = new Map(current.cities);
  const factionCityIds = getFactionCityIds(current, factionId);
  const cityCount = Math.max(1, factionCityIds.length);
  for (const cityId of factionCityIds) {
    const city = current.cities.get(cityId);
    if (!city) continue;

    // Each city gets its share of production income
    const cityProductionIncome = economy.productionPool / cityCount;

    // Advance production
    let updatedCity = advanceProduction(city, cityProductionIncome);

    // Check if production is complete
    if (canCompleteCurrentProduction(current, cityId, registry)) {
      current = completeProduction(current, cityId, registry);
      // Re-fetch city after state update
      updatedCity = current.cities.get(cityId) ?? updatedCity;
      // Deduct spent production from economy pool
      const spentProduction = city.currentProduction?.costType === 'villages'
        ? 0
        : city.currentProduction?.cost ?? 0;
      const currentEconomy = current.economy.get(factionId);
      if (currentEconomy) {
        const updatedEconomy = {
          ...currentEconomy,
          productionPool: Math.max(0, currentEconomy.productionPool - spentProduction),
        };
        const newEconomyMap = new Map(current.economy);
        newEconomyMap.set(factionId, updatedEconomy);
        current = { ...current, economy: newEconomyMap };
      }
      log(trace, `${faction.name} completed unit production at ${updatedCity.name}`);
    }

    // Auto-queue preferred unit if no production (skip if besieged).
    // Supply pressure is handled by soft penalties in aiProductionStrategy.
    if (!updatedCity.currentProduction && updatedCity.productionQueue.length === 0 && !updatedCity.besieged) {
      const choice = chooseStrategicProduction(current, factionId, strategy, registry, difficulty);
      if (choice) {
        updatedCity = queueUnit(updatedCity, choice.prototypeId, choice.chassisId, choice.cost, choice.costType);
        log(trace, `${faction.name} queued ${choice.chassisId} at ${updatedCity.name} (${choice.reason})`);
      }
    }

    citiesMap.set(cityId, updatedCity);
  }
  current = { ...current, cities: citiesMap };
  // Supply deficit: apply morale penalty and accumulate exhaustion
  log(trace, `${faction.name} supply deficit: ${getSupplyDeficit(economy)}`);
  current = applySupplyDeficitPenalties(current, factionId, registry);
  current = applyEnvironmentalDamage(current, factionId, registry, trace);

  // Summon ability: Handle summon lifecycle for any faction with summon config
  const factionAbilities = registry.getSignatureAbility(factionId);
  if (factionAbilities?.summon) {
    current = applySummonAbility(current, factionId, registry, trace);
  }

  // Warlord Command: Apply aura from warlord units to nearby cavalry/mounted units
  current = applyWarlordAura(current, factionId, registry, trace);

  // Reset attacks and moves for this faction's units, recover morale
  const unitsMap = new Map(current.units);
  const refreshedFaction = current.factions.get(factionId) ?? faction;
  for (const unitIdStr of refreshedFaction.unitIds) {
    const unit = unitsMap.get(unitIdStr as UnitId);
    if (!unit || unit.hp <= 0) continue;

    // Calculate healing with Forest Mending bonus for Druid Circle
    const terrainId = getTerrainAt(current, unit.position);
    let healRate = getHealRate(unit, current, factionId);
    
    // Nature's Blessing + Synergy Healing
    const healPrototype = current.prototypes.get(unit.prototypeId);
    const healTags = healPrototype?.tags ?? [];
    const healEngine = getSynergyEngine();
    const unitSynergies = healEngine.resolveUnitPairs(healTags);

    // Create healing context
    const healingContext: HealingContext = {
      unitId: unitIdStr as string,
      unitTags: healTags,
      baseHeal: healRate,
      position: unit.position as unknown as { x: number; y: number },
      adjacentAllies: [],
      isStealthed: unit.isStealthed,
    };

    // Apply synergy healing effects
    const synergyHealRate = applyHealingSynergies(healingContext, unitSynergies);

    if (healTags.includes('druid') || healTags.includes('healing')) {
      const aura = getNatureHealingAura();
      // Use the synergy-enhanced heal rate which accounts for extended_healing, frost_regen, oasis
      healRate = Math.max(healRate, synergyHealRate);
    } else {
      // Non-healing units benefit from adjacent healing-tagged allies
      const neighbors = getNeighbors(unit.position);
      for (const hex of neighbors) {
        const neighborUnitId = getUnitAtHex(current, hex);
        if (neighborUnitId) {
          const neighborUnit = current.units.get(neighborUnitId);
          if (neighborUnit && neighborUnit.factionId === factionId && neighborUnit.hp > 0) {
            const neighborProto = current.prototypes.get(neighborUnit.prototypeId);
            const neighborTags = neighborProto?.tags ?? [];
            if (neighborTags.includes('druid') || neighborTags.includes('healing')) {
              const aura = getNatureHealingAura();
              healRate += aura.allyHeal;
              // Check for extended healing synergy
              const neighborSynergies = healEngine.resolveUnitPairs(neighborTags);
              const neighborHealContext: HealingContext = {
                unitId: neighborUnitId,
                unitTags: neighborTags,
                baseHeal: aura.allyHeal,
                position: neighborUnit.position as unknown as { x: number; y: number },
                adjacentAllies: [],
                isStealthed: neighborUnit.isStealthed,
              };
              const extendedHeal = applyHealingSynergies(neighborHealContext, neighborSynergies);
              healRate = Math.max(healRate, extendedHeal);
              break; // Only one healing aura applies
            }
          }
        }
      }
    }

    // Withering: nearby enemies with withering synergy reduce healing
    const healNeighbors = getNeighbors(unit.position);
    for (const hex of healNeighbors) {
      const neighborUnitId = getUnitAtHex(current, hex);
      if (neighborUnitId) {
        const neighborUnit = current.units.get(neighborUnitId);
        if (neighborUnit && neighborUnit.factionId !== factionId && neighborUnit.hp > 0) {
          const neighborProto = current.prototypes.get(neighborUnit.prototypeId);
          const neighborTags = neighborProto?.tags ?? [];
          const neighborSynergies = healEngine.resolveUnitPairs(neighborTags);
          for (const syn of neighborSynergies) {
            if (syn.effect.type === 'withering') {
              const reduction = (syn.effect as { healingReduction: number }).healingReduction;
              healRate = Math.floor(healRate * (1 - reduction));
              break;
            }
          }
        }
      }
    }

    const safeInSettlement = occupiesFriendlySettlement(current, unit);
    const research = current.research.get(factionId);
    const doctrine = resolveResearchDoctrine(research, faction);
    const prototype = current.prototypes.get(unit.prototypeId);
    const currentTerrainId = getTerrainAt(current, unit.position);
    // Cold provisions movement bonus - component-based, not research-based
    const coldProvisionMoveBonus =
      prototype &&
      prototypeHasComponent(prototype, 'cold_provisions') &&
      (currentTerrainId === 'tundra' || currentTerrainId === 'hill')
        ? 1  // Flat +1 move bonus in cold terrain with cold provisions
        : 0;
    const poisonMovePenalty = unit.poisoned ? doctrine.poisonMovePenalty : 0;
    const refreshedMoves = Math.max(0, unit.maxMoves + coldProvisionMoveBonus - poisonMovePenalty);
    const refreshedUnit = {
      ...unit,
      movesRemaining: refreshedMoves,
      attacksRemaining: 1,
      morale: recoverMorale(unit),
      hp: Math.min(unit.maxHp, unit.hp + healRate),
      poisoned: safeInSettlement ? false : unit.poisoned,
      poisonStacks: safeInSettlement ? 0 : unit.poisonStacks,
      enteredZoCThisActivation: false,
    };
    
    // Stealth: tick cooldown and attempt re-entry for stealth-tagged units
    let stealthUpdatedUnit = tickStealthCooldown(refreshedUnit);
    if (!stealthUpdatedUnit.isStealthed) {
      const protoTags = current.prototypes.get(unit.prototypeId)?.tags ?? [];
      stealthUpdatedUnit = enterStealth(stealthUpdatedUnit, protoTags);
    }
    
    const updatedUnit = maybeExpirePreparedAbility(stealthUpdatedUnit, current.round, current);

    // Check if routed unit can rally
    checkRally(updatedUnit);

    unitsMap.set(unitIdStr as UnitId, updatedUnit);
  }
  current = { ...current, units: unitsMap };

  // Sacrifice check: check for units with learned abilities at the home city
  // This happens after unit refresh so units can heal at home city before sacrificing
  const refreshedFactionForSacrifice = current.factions.get(factionId);
  if (refreshedFactionForSacrifice) {
    for (const unitIdStr of refreshedFactionForSacrifice.unitIds) {
      const unit = current.units.get(unitIdStr as UnitId);
      if (!unit || unit.hp <= 0) continue;
      
      // Check if unit can be sacrificed
      if (canSacrifice(unit, refreshedFactionForSacrifice, current)) {
        // Check if AI has assigned return_to_sacrifice intent or if it's player turn
        // For now, we auto-sacrifice AI units with return_to_sacrifice intent
        const unitIntent = strategy?.unitIntents[unitIdStr as UnitId];
        const hasReturnIntent = unitIntent?.assignment === 'return_to_sacrifice';
        
        // For AI factions, only sacrifice if they have the return_to_sacrifice intent
        // For player factions (or if no strategy), we could prompt - for now auto-sacrifice
        if (hasReturnIntent || !strategy) {
          current = performSacrifice(unitIdStr as UnitId, factionId, current, registry, trace);
          current = unlockHybridRecipes(current, factionId, registry);
          log(trace, `${refreshedFactionForSacrifice.name} sacrificed unit at home city`);
        }
      }
    }
  }

  /*
  // Defensive filter: remove stale unitIds (dead units not yet pruned)
  const liveUnitIds = faction.unitIds.filter(id => {
    const u = current.units.get(id as UnitId);
    return u && u.hp > 0;
  });

  // Action scaling: more units = more actions, capped at 8
  const maxActions = Math.min(8, 3 + Math.floor(liveUnitIds.length / 4));

  let actions = 0;
  const map = current.map!;
  for (const unitIdStr of liveUnitIds) {
    if (actions >= maxActions) break;
    const unitId = unitIdStr as UnitId;
    const unit = current.units.get(unitId);
    if (!unit || unit.hp <= 0 || unit.movesRemaining <= 0) continue;
    const prototype = current.prototypes.get(unit.prototypeId);
    if (!prototype) continue;

    // Routed units flee instead of attacking
    if (unit.routed) {
      const fleeHex = findFleeHex(unit, current);
      if (fleeHex && canMoveTo(current, unitId, fleeHex, map, registry)) {
        current = moveUnit(current, unitId, fleeHex, map, registry);
        // Update embarked unit positions if moving unit is a transport
        const movedUnit = current.units.get(unitId);
        if (movedUnit) {
          const movedProto = current.prototypes.get(movedUnit.prototypeId);
          if (movedProto && isTransportUnit(movedProto, registry)) {
            current = updateEmbarkedPositions(current, unitId, movedUnit.position, current.transportMap);
          }
        }
        log(trace, `${faction.name} ${prototype.name} routed and fled`);
        actions += 1;
      }
      continue;
    }

    // Smart targeting: find best adjacent enemy
    const enemy = findBestTarget(
      current,
      unitId,
      unit.position,
      factionId,
      prototype as any,
      registry
    );

    if (enemy && unit.attacksRemaining > 0) {
      const enemyPrototype = current.prototypes.get(enemy.prototypeId);
      if (!enemyPrototype) continue;

      const attackerVeteranBonus = getVeteranStatBonus(registry, unit.veteranLevel);
      const defenderVeteranBonus = getVeteranDefenseBonus(registry, enemy.veteranLevel);
      const defenderMoraleBonus = getVeteranMoraleBonus(registry, enemy.veteranLevel);
      const attackerTerrain = registry.getTerrain(getTerrainAt(current, unit.position));
      const defenderTerrain = registry.getTerrain(getTerrainAt(current, enemy.position));

      // Calculate flanking bonus from ZoC system
      const flanking = calculateFlankingBonus(unit, enemy, current);
      const attackerFaction = current.factions.get(unit.factionId);
      const defenderFaction = current.factions.get(enemy.factionId);
      let situationalAttackModifier = getCombatAttackModifier(attackerFaction, attackerTerrain, defenderTerrain);
      let situationalDefenseModifier = getCombatDefenseModifier(defenderFaction, defenderTerrain);

      // Desert Swarm (desert_logistics): N+ friendly units within distance 2 grants bonus
      const desertAbility = registry.getSignatureAbility('desert_nomads');
      const swarmConfig = desertAbility ? {
        threshold: desertAbility.desertSwarmThreshold ?? 3,
        attackBonus: desertAbility.desertSwarmAttackBonus ?? 1,
        defenseMultiplier: desertAbility.desertSwarmDefenseMultiplier ?? 1.1,
      } : undefined;
      const attackerSwarm = getDesertSwarmBonus(attackerFaction, unit, current, swarmConfig);
      if (attackerSwarm.attackBonus > 0) {
        situationalAttackModifier += attackerSwarm.attackBonus;
      }
      const defenderSwarm = getDesertSwarmBonus(defenderFaction, enemy, current, swarmConfig);
      if (defenderSwarm.defenseMultiplier > 1.0) {
        situationalDefenseModifier += (defenderSwarm.defenseMultiplier - 1.0);
      }

      // Camel Scare: camels get +30% attack vs cavalry, cavalry get -20% attacking camels
      let camelScareAttackMod = 0;
      const attackerTags = prototype?.tags ?? [];
      const defenderTags = enemyPrototype?.tags ?? [];
      if (attackerTags.includes('camel') && defenderTags.includes('cavalry')) {
        camelScareAttackMod += 0.3;
      }
      if (defenderTags.includes('camel') && !attackerTags.includes('camel') && attackerTags.includes('cavalry')) {
        camelScareAttackMod -= 0.2;
      }

      const result = resolveCombat(
        unit,
        enemy,
        prototype,
        enemyPrototype,
        attackerVeteranBonus,
        defenderVeteranBonus,
        attackerTerrain,
        defenderTerrain,
        getImprovementBonus(current, enemy.position) + getWallDefenseBonus(current, enemy.position, registry.getSignatureAbility('coral_people')?.wallDefenseMultiplier ?? 2),
        defenderMoraleBonus,
        registry,
        flanking,
        situationalAttackModifier + camelScareAttackMod,
        situationalDefenseModifier,
        current.rngState,
        0,
        0,
        0,
        0,
        0,
        0
      );

      // Apply HP and morale changes to attacker
      let updatedAttacker = {
        ...unit,
        hp: unit.hp - result.attackerDamage,
        morale: Math.max(0, unit.morale - result.attackerMoraleLoss),
        routed: result.attackerRouted || result.attackerFled,
        attacksRemaining: 0,
      };

      // Apply HP and morale changes to defender
      const updatedDefender = {
        ...enemy,
        hp: enemy.hp - result.defenderDamage,
        morale: Math.max(0, enemy.morale - result.defenderMoraleLoss),
        routed: result.defenderRouted || result.defenderFled,
      };

      updatedAttacker = recordBattleFought(
        updatedAttacker,
        enemy.id,
        result.defenderDestroyed,
        result.attackerDamage,
        result.defenderDamage
      );

      if (result.defenderDestroyed) {
        updatedAttacker = recordEnemyKilled(updatedAttacker, enemy.id);
      }
      if (result.attackerDestroyed) {
        // attacker destroyed — no extra tracking needed
      }

      updatedAttacker = awardCombatXP(
        updatedAttacker,
        result.defenderDestroyed,
        !result.attackerDestroyed
      );

      if (canPromote(updatedAttacker, registry)) {
        const oldLevel = updatedAttacker.veteranLevel;
        const promoted = tryPromoteUnit(updatedAttacker, registry);
        if (promoted.veteranLevel !== oldLevel) {
          updatedAttacker = recordPromotion(promoted, oldLevel, promoted.veteranLevel);
        } else {
          updatedAttacker = promoted;
        }
      }

      // Update units map
      const newUnits = new Map(current.units);
      newUnits.set(updatedAttacker.id, updatedAttacker);
      if (result.defenderDestroyed) {
        newUnits.delete(updatedDefender.id);
      } else {
        newUnits.set(updatedDefender.id, updatedDefender);
      }
      current = { ...current, units: newUnits };

      // Capture hook: check if attacker can capture destroyed defender
      let captured = false;
      const attackerTerrain = current.map?.tiles.get(hexToKey(updatedAttacker.position))?.terrain ?? '';
      const isGreedyCoastal = faction.identityProfile.passiveTrait === 'greedy'
        && (attackerTerrain === 'coast' || attackerTerrain === 'river' || attackerTerrain === 'ocean');
      if (result.defenderDestroyed && (hasCaptureAbility(prototype, registry) || isGreedyCoastal)) {
        const greedyAbility = isGreedyCoastal && !hasCaptureAbility(prototype, registry)
          ? registry.getSignatureAbility(factionId)
          : null;
        const captureResult = attemptCapture(
          current, updatedAttacker, updatedDefender, registry,
          greedyAbility, current.rngState
        );
        if (captureResult.captured) {
          current = captureResult.state;
          captured = true;
          log(trace, `${faction.name} ${prototype.name} CAPTURED ${enemyPrototype.name}!`);
        }
      }

      // Dead unit cleanup: prune destroyed units from faction.unitIds
      if (result.defenderDestroyed && !captured) {
        const defFaction = current.factions.get(updatedDefender.factionId);
        if (defFaction) {
          const newFactions = new Map(current.factions);
          newFactions.set(updatedDefender.factionId, {
            ...defFaction,
            unitIds: defFaction.unitIds.filter(id => id !== updatedDefender.id),
          });
          current = { ...current, factions: newFactions };
        }
      }
      if (result.attackerDestroyed) {
        const atkFaction = current.factions.get(updatedAttacker.factionId);
        if (atkFaction) {
          const newFactions = new Map(current.factions);
          newFactions.set(updatedAttacker.factionId, {
            ...atkFaction,
            unitIds: atkFaction.unitIds.filter(id => id !== updatedAttacker.id),
          });
          current = { ...current, factions: newFactions };
        }
      }

      // If destroyed defender was a transport, destroy all embarked units too
      if (result.defenderDestroyed && !captured) {
        const defProto = current.prototypes.get(updatedDefender.prototypeId);
        if (defProto && isTransportUnit(defProto, registry)) {
          const destroyResult = destroyTransport(current, updatedDefender.id, current.transportMap);
          current = destroyResult.state;
          current = { ...current, transportMap: destroyResult.transportMap };
        }
      }
      if (result.attackerDestroyed) {
        const atkProto = current.prototypes.get(updatedAttacker.prototypeId);
        if (atkProto && isTransportUnit(atkProto, registry)) {
          const destroyResult = destroyTransport(current, updatedAttacker.id, current.transportMap);
          current = destroyResult.state;
          current = { ...current, transportMap: destroyResult.transportMap };
        }
      }

      // Apply combat signals → capability gains (replaces hardcoded applyCombatPressure)
      current = applyCombatSignals(current, updatedAttacker.factionId, result.signals);
      current = applyContactTransfer(current, updatedAttacker.factionId, updatedDefender.factionId, 'contact');
      current = maybeAbsorbFaction(current, updatedAttacker.factionId, updatedDefender.factionId, trace);
      current = unlockHybridRecipes(current, updatedAttacker.factionId, registry);

      // Update combat records for village spawning evaluation
      if (result.defenderDestroyed && !captured) {
        current = updateCombatRecordOnWin(current, updatedAttacker.factionId, current.round);
        current = updateCombatRecordOnLoss(current, updatedDefender.factionId, current.round);
      } else if (result.attackerDestroyed) {
        current = updateCombatRecordOnLoss(current, updatedAttacker.factionId, current.round);
        current = updateCombatRecordOnWin(current, updatedDefender.factionId, current.round);
      }

      // War exhaustion from combat losses
      const attackerWE = current.warExhaustion.get(updatedAttacker.factionId);
      const defenderWE = current.warExhaustion.get(updatedDefender.factionId);
      if (result.defenderDestroyed && attackerWE) {
        const newWE = addExhaustion(attackerWE, EXHAUSTION_CONFIG.UNIT_KILLED);
        const weMap = new Map(current.warExhaustion);
        weMap.set(updatedAttacker.factionId, newWE);
        current = { ...current, warExhaustion: weMap };
      }
      if (result.attackerDestroyed && defenderWE) {
        const newWE = addExhaustion(defenderWE, EXHAUSTION_CONFIG.UNIT_KILLED);
        const weMap = new Map(current.warExhaustion);
        weMap.set(updatedDefender.factionId, newWE);
        current = { ...current, warExhaustion: weMap };
      }

      const roleInfo = result.roleModifier !== 0 ? ` role:${result.roleModifier > 0 ? '+' : ''}${(result.roleModifier * 100).toFixed(0)}%` : '';
      const weaponInfo = result.weaponModifier !== 0 ? ` weapon:${result.weaponModifier > 0 ? '+' : ''}${(result.weaponModifier * 100).toFixed(0)}%` : '';
      const moraleInfo = ` morale:${result.defenderMoraleLoss.toFixed(0)}lost${result.defenderRouted ? ' ROUTED' : ''}${result.defenderFled ? ' FLED' : ''}`;
      log(
        trace,
        `${faction.name} ${prototype.name} fought ${enemyPrototype.name}${roleInfo}${weaponInfo}${moraleInfo} | capabilities: ${describeCapabilityLevels(
          current.factions.get(factionId)!
        )}`
      );

      actions += 1;
      continue;
    }

    // Movement: check for retreat, reinforcement, or chase
    let bestMove: HexCoord | null = null;

    // 4b: Defensive retreat - check if outnumbered nearby
    let nearbyEnemies = 0;
    let nearbyFriendlies = 0;
    for (const [, other] of current.units) {
      if (other.hp <= 0) continue;
      const dist = hexDistance(unit.position, other.position);
      if (dist <= 2) {
        if (other.factionId !== factionId) nearbyEnemies++;
        else nearbyFriendlies++;
      }
    }

    const isOutnumbered = nearbyEnemies >= 2 && nearbyEnemies > nearbyFriendlies * 2;

    if (isOutnumbered) {
      // Retreat toward nearest friendly city
      let nearestCityHex: HexCoord | null = null;
      let nearestCityDist = Infinity;
      for (const cityId of getFactionCityIds(current, factionId)) {
        const city = current.cities.get(cityId);
        if (!city) continue;
        const dist = hexDistance(unit.position, city.position);
        if (dist < nearestCityDist) {
          nearestCityDist = dist;
          nearestCityHex = city.position;
        }
      }
      if (nearestCityHex) {
        let retreatScore = -Infinity;
        for (const move of getValidMoves(current, unitId, map, registry)) {
          const distToCity = hexDistance(move, nearestCityHex);
          const score = -distToCity; // closer to city = better
          if (score > retreatScore) {
            retreatScore = score;
            bestMove = move;
          }
        }
        if (bestMove) {
          current = moveUnit(current, unitId, bestMove, map, registry);
          // Update embarked unit positions if moving unit is a transport
          const movedUnit = current.units.get(unitId);
          if (movedUnit) {
            const movedProto = current.prototypes.get(movedUnit.prototypeId);
            if (movedProto && isTransportUnit(movedProto, registry)) {
              current = updateEmbarkedPositions(current, unitId, movedUnit.position, current.transportMap);
            }
          }
          log(trace, `${faction.name} ${prototype.name} retreating toward city`);
          actions += 1;
          bestMove = null; // prevent double-move
        }
      }
    }

    // 4c: Reinforcement - group up with friendlies if isolated
    if (!bestMove) {
      let nearestFriendlyDist = Infinity;
      for (const [, other] of current.units) {
        if (other.factionId !== factionId || other.hp <= 0 || other.id === unit.id) continue;
        const dist = hexDistance(unit.position, other.position);
        if (dist < nearestFriendlyDist) nearestFriendlyDist = dist;
      }

      if (nearestFriendlyDist > 3) {
        // Find nearest friendly unit and move toward it
        let nearestFriendlyPos: HexCoord | null = null;
        let nearestDist = Infinity;
        for (const [, other] of current.units) {
          if (other.factionId !== factionId || other.hp <= 0 || other.id === unit.id) continue;
          const dist = hexDistance(unit.position, other.position);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestFriendlyPos = other.position;
          }
        }
        if (nearestFriendlyPos) {
          let groupScore = -Infinity;
          for (const move of getValidMoves(current, unitId, map, registry)) {
            const score = -hexDistance(move, nearestFriendlyPos);
            if (score > groupScore) {
              groupScore = score;
              bestMove = move;
            }
          }
          if (bestMove) {
            current = moveUnit(current, unitId, bestMove, map, registry);
            // Update embarked unit positions if moving unit is a transport
            const movedUnit = current.units.get(unitId);
            if (movedUnit) {
              const movedProto = current.prototypes.get(movedUnit.prototypeId);
              if (movedProto && isTransportUnit(movedProto, registry)) {
                current = updateEmbarkedPositions(current, unitId, movedUnit.position, current.transportMap);
              }
            }
            log(trace, `${faction.name} ${prototype.name} moving to regroup`);
            actions += 1;
            bestMove = null;
          }
        }
      }
    }

    // Default: chase best target position (enemy units or enemy cities)
    if (!bestMove) {
      // Siege intent: find enemy cities with 2+ friendly units nearby
      let siegeTargetCity: { id: string; position: { q: number; r: number } } | null = null;
      let bestSiegeScore = 0;

      for (const [, enemyCity] of current.cities) {
        if (enemyCity.factionId === factionId) continue;

        let friendliesNearby = 0;
        for (const [, friendlyUnit] of current.units) {
          if (friendlyUnit.factionId !== factionId || friendlyUnit.hp <= 0) continue;
          const dist = hexDistance(friendlyUnit.position, enemyCity.position);
          if (dist <= 3) friendliesNearby++;
        }

        const siegeScore = friendliesNearby >= 2 ? friendliesNearby : 0;
        if (siegeScore > bestSiegeScore) {
          bestSiegeScore = siegeScore;
          siegeTargetCity = { id: enemyCity.id, position: enemyCity.position };
        }
      }

      let bestScore = -Infinity;
      for (const move of getValidMoves(current, unitId, map, registry)) {
        // Score against enemy units
        for (const [, enemyUnit] of current.units) {
          if (enemyUnit.factionId === factionId || enemyUnit.hp <= 0) continue;
          // River-stealthed units are invisible to movement AI
          const enemyTerrain = current.map?.tiles.get(hexToKey(enemyUnit.position))?.terrain ?? '';
          const enemyFaction = current.factions.get(enemyUnit.factionId);
          if (isUnitRiverStealthed(enemyFaction, enemyTerrain)) continue;
          const distance = hexDistance(move, enemyUnit.position);
          // Closer to enemy = better, but prefer favorable matchups
          let moveScore = -distance;
          const enemyProto = current.prototypes.get(enemyUnit.prototypeId);
          if (enemyProto) {
            const roleMod = getRoleEffectiveness(prototype.derivedStats.role, enemyProto.derivedStats.role);
            moveScore += roleMod * 3;
          }
          moveScore += getTerrainPreferenceScore(faction, getTerrainAt(current, move));
          if (moveScore > bestScore) {
            bestScore = moveScore;
            bestMove = move;
          }
        }
        // Score against enemy cities (weaker pull, but gives siege direction)
        for (const [, enemyCity] of current.cities) {
          if (enemyCity.factionId === factionId) continue;
          const distance = hexDistance(move, enemyCity.position);

          let cityScore = -distance * 0.5; // base half-weight
          cityScore += getTerrainPreferenceScore(faction, getTerrainAt(current, move)) * 0.5;

          // Siege intent bonus when 2+ friendlies already near this city
          if (siegeTargetCity && siegeTargetCity.id === enemyCity.id) {
            cityScore += bestSiegeScore * 2; // +2 per friendly already near
          }

          if (cityScore > bestScore) {
            bestScore = cityScore;
            bestMove = move;
          }
        }
      }

      if (bestMove) {
        current = moveUnit(current, unitId, bestMove, map, registry);
        actions += 1;
      }
    }
  */

  // Field fort construction: units with fortification ≥ 8 build forts when holding position
  // Limited to 1 fort per faction per turn to prevent fort spam
  /*
  const fortLevel = faction.capabilities?.domainLevels?.['fortification'] ?? 0;
  if (fortLevel >= 8) {
    let fortsBuilt = 0;
    for (const unitIdStr of faction.unitIds) {
      if (fortsBuilt >= 1) break;
      const unit = current.units.get(unitIdStr as UnitId);
      if (!unit || unit.hp <= 0) continue;
      // Unit must not have moved this turn
      if (unit.movesRemaining !== unit.maxMoves) continue;
      // Check no existing improvement at this position
      const hasImprovement = Array.from(current.improvements.values()).some(
        imp => imp.position.q === unit.position.q && imp.position.r === unit.position.r
      );
      if (hasImprovement) continue;
      // Build field fort
      const fortId = createImprovementId();
      current.improvements.set(fortId, {
        id: fortId,
        type: 'fortification',
        position: { ...unit.position },
        ownerFactionId: factionId,
        defenseBonus: 1,
      });
      fortsBuilt++;
    }
  }

  // Village destruction: raze enemy villages adjacent to our units
  for (const [, village] of current.villages) {
    if (village.factionId === factionId) continue;
    const neighbors = getNeighbors(village.position);
    let isThreatened = false;
    for (const neighbor of neighbors) {
      for (const unitId of liveUnitIds) {
        const unit = current.units.get(unitId as UnitId);
        if (unit && unit.hp > 0 &&
            unit.position.q === neighbor.q &&
            unit.position.r === neighbor.r) {
          isThreatened = true;
          break;
        }
      }
      if (isThreatened) break;
    }
    if (isThreatened) {
      const victimFactionId = village.factionId;
      log(trace, `${faction.name} razed ${village.name}`);
      current = destroyVillage(current, village.id);
      // War exhaustion to victim
      const victimWE = current.warExhaustion.get(victimFactionId);
      if (victimWE) {
        const weMap = new Map(current.warExhaustion);
        weMap.set(victimFactionId, addExhaustion(victimWE, EXHAUSTION_CONFIG.VILLAGE_LOST));
        current = { ...current, warExhaustion: weMap };
      }
    }
  }

  */

  // Village expansion: spawn villages when militarily stable (after combat)
  current = evaluateAndSpawnVillage(current, factionId, registry);

  // Siege check: evaluate encirclement for all cities
  let siegeCities = new Map(current.cities);
  for (const [cityId, city] of siegeCities) {
    if (city.factionId !== factionId) continue;

    if (city.besieged) {
      // Check if encirclement is broken
      if (isEncirclementBroken(city, current)) {
        const brokenCity = { ...city, besieged: false, turnsUnderSiege: 0 };
        siegeCities.set(cityId, brokenCity);
        recordSiegeEvent(trace, {
          round: current.round,
          cityId,
          cityName: city.name,
          factionId: city.factionId,
          eventType: 'siege_broken',
          wallHP: brokenCity.wallHP,
          maxWallHP: brokenCity.maxWallHP,
          turnsUnderSiege: brokenCity.turnsUnderSiege,
        });
        log(trace, `${city.name} siege broken`);
      } else {
        // Degrade walls (Pirate Lords have Coastal Walls: half damage)
        const isCoastalWalls = city.factionId === ('coral_people' as FactionId);
        const degradedCity = degradeWalls(city, isCoastalWalls);
        const updatedSiegeCity = {
          ...degradedCity,
          turnsUnderSiege: city.turnsUnderSiege + 1,
        };
        siegeCities.set(cityId, updatedSiegeCity);
        if (updatedSiegeCity.wallHP !== city.wallHP) {
          recordSiegeEvent(trace, {
            round: current.round,
            cityId,
            cityName: city.name,
            factionId: city.factionId,
            eventType: 'wall_damaged',
            wallHP: updatedSiegeCity.wallHP,
            maxWallHP: updatedSiegeCity.maxWallHP,
            turnsUnderSiege: updatedSiegeCity.turnsUnderSiege,
          });
        }
        log(trace, `${city.name} walls at ${degradedCity.wallHP}/${degradedCity.maxWallHP}`);

        // Check for capture: walls breached + still encircled
        if (isCityVulnerable(degradedCity, current)) {
          const capturingFaction = getCapturingFaction(degradedCity, current);
          if (capturingFaction) {
            current = captureCity(degradedCity, capturingFaction, current);
            const capturedCity = current.cities.get(cityId);
            if (capturedCity) {
              recordSiegeEvent(trace, {
                round: current.round,
                cityId,
                cityName: city.name,
                factionId: capturedCity.factionId,
                eventType: 'city_captured',
                wallHP: capturedCity.wallHP,
                maxWallHP: capturedCity.maxWallHP,
                turnsUnderSiege: capturedCity.turnsUnderSiege,
                attackerFactionId: capturingFaction,
              });
            }
            log(trace, `${city.name} captured by ${capturingFaction}!`);
            siegeCities = new Map(current.cities);
            continue;
          }
        }

        // Besieged cities add war exhaustion
        const we = current.warExhaustion.get(factionId);
        if (we) {
          const newWE = addExhaustion(we, EXHAUSTION_CONFIG.BESIEGED_CITY_PER_TURN);
          const weMap = new Map(current.warExhaustion);
          weMap.set(factionId, newWE);
          current = { ...current, warExhaustion: weMap };
        }
      }
    } else {
      // Repair walls when not besieged
      const repairedCity = repairWalls(city);
      if (repairedCity.wallHP !== city.wallHP) {
        siegeCities.set(cityId, repairedCity);
        recordSiegeEvent(trace, {
          round: current.round,
          cityId,
          cityName: city.name,
          factionId: city.factionId,
          eventType: 'wall_repaired',
          wallHP: repairedCity.wallHP,
          maxWallHP: repairedCity.maxWallHP,
          turnsUnderSiege: repairedCity.turnsUnderSiege,
        });
      }

      // Check if city just became encircled
      if (isCityEncircled(city, current)) {
        const besiegedCity = { ...(siegeCities.get(cityId) ?? city), besieged: true, turnsUnderSiege: 1 };
        siegeCities.set(cityId, besiegedCity);
        recordSiegeEvent(trace, {
          round: current.round,
          cityId,
          cityName: city.name,
          factionId: city.factionId,
          eventType: 'siege_started',
          wallHP: besiegedCity.wallHP,
          maxWallHP: besiegedCity.maxWallHP,
          turnsUnderSiege: besiegedCity.turnsUnderSiege,
        });
        log(trace, `${city.name} is now besieged!`);
      }
    }
  }
  current = { ...current, cities: siegeCities };

  // War exhaustion: tick turn counters and apply morale penalty
  const weState = current.warExhaustion.get(factionId);
  if (weState) {
    const hadLoss = faction.combatRecord.lastLossRound === current.round;
    const tickedWE = tickWarExhaustion(weState, hadLoss);
    const weMap = new Map(current.warExhaustion);
    weMap.set(factionId, tickedWE);
    current = { ...current, warExhaustion: weMap };

    // Apply WE morale penalty to all living units
    // Marching stamina: ignore the first exhaustion point for morale calculation
    const weResearch = current.research.get(factionId);
    const weDoctrine = resolveResearchDoctrine(weResearch, faction);
    const effectiveExhaustionPoints = weDoctrine.marchingStaminaEnabled
      ? Math.max(0, tickedWE.exhaustionPoints - 1)
      : tickedWE.exhaustionPoints;
    const moralePenalty = calculateMoralePenalty(effectiveExhaustionPoints);
    if (moralePenalty > 0) {
      const unitsWithWE = new Map(current.units);
      for (const unitIdStr of faction.unitIds) {
        const unit = unitsWithWE.get(unitIdStr as UnitId);
        if (!unit || unit.hp <= 0) continue;
        unitsWithWE.set(unitIdStr as UnitId, {
          ...unit,
          morale: Math.max(0, unit.morale - moralePenalty),
        });
      }
      current = { ...current, units: unitsWithWE };
    }
  }

  // PROXIMITY EXPOSURE: For each enemy faction within 3 hexes of our units,
  // gain exposure to their native domain (3 per turn)
  const currentFaction = current.factions.get(factionId);
  if (currentFaction) {
    for (const [otherFactionId, otherFaction] of current.factions) {
      if (otherFactionId === factionId) continue;
      if (otherFaction.unitIds.length === 0) continue;
      
      // Passive proximity no longer unlocks foreign domains.
    }
  }

  return current;
}

function performStrategicMovement(
  state: GameState,
  unitId: UnitId,
  registry: RulesRegistry,
  trace?: SimulationTrace
): GameState {
  const unit = state.units.get(unitId);
  if (!unit || unit.hp <= 0 || !state.map) {
    return state;
  }

  const faction = state.factions.get(unit.factionId);
  const prototype = state.prototypes.get(unit.prototypeId);
  const strategy = state.factionStrategies.get(unit.factionId);
  if (!faction || !prototype) {
    return state;
  }

  // Skip embarked units — they move with their transport
  if (isUnitEmbarked(unitId, state.transportMap)) {
    return state;
  }

  const unitIntent = getUnitIntent(strategy, unitId) ?? buildFallbackIntent(state, unit);
  const waypoint = resolveWaypoint(state, unit, unitIntent);

  // Transport units with embarked troops: move toward waypoint, then auto-disembark
  if (isTransportUnit(prototype, registry)) {
    const embarked = getEmbarkedUnits(unitId, state.transportMap);
    if (embarked.length > 0) {
      return moveTransportAndDisembark(state, unitId, registry, waypoint, unitIntent, trace);
    }
  }

  const validMoves = getValidMoves(state, unitId, state.map, registry);

  // Pirate Lords: score boarding a transport as a move option alongside regular moves
  const isGreedyInfantry = faction.identityProfile.passiveTrait === 'greedy'
    && !isTransportUnit(prototype, registry)
    && !isUnitEmbarked(unitId, state.transportMap);

  let bestBoardTransportId: UnitId | null = null;
  let bestBoardScore = -Infinity;

  if (isGreedyInfantry) {
    for (const [, candidate] of state.units) {
      if (candidate.factionId !== unit.factionId) continue;
      if (candidate.hp <= 0) continue;
      if (hexDistance(unit.position, candidate.position) !== 1) continue;

      const candidatePrototype = state.prototypes.get(candidate.prototypeId);
      if (!candidatePrototype) continue;
      const chassis = registry.getChassis(candidatePrototype.chassisId);
      if (!chassis?.tags?.includes('transport')) continue;

      if (canBoardTransport(state, unitId, candidate.id, registry, state.transportMap)) {
        // Score boarding: how much closer would the transport get us to the waypoint?
        const transportToWaypoint = hexDistance(candidate.position, waypoint);
        const selfToWaypoint = hexDistance(unit.position, waypoint);
        // Board if transport is closer to waypoint, or if we have no good moves
        let boardScore = (selfToWaypoint - transportToWaypoint) * 6;
        // Bonus for offensive posture — prioritize raiding
        if (unitIntent.assignment === 'raider' || unitIntent.assignment === 'siege_force') {
          boardScore += 4;
        }
        if (boardScore > bestBoardScore) {
          bestBoardScore = boardScore;
          bestBoardTransportId = candidate.id;
        }
      }
    }
  }

  if (validMoves.length === 0) {
    // No regular moves — board transport if available
    if (bestBoardTransportId) {
      const result = boardTransport(state, unitId, bestBoardTransportId, state.transportMap);
      log(trace, `${faction.name} infantry boarded transport (no moves)`);
      return { ...result.state, transportMap: result.transportMap };
    }
    return state;
  }

  const originSupport = getNearbySupportScore(state, unit.factionId, unit.position);
  const originAnchorDistance = hexDistance(unit.position, unitIntent.anchor);
  let bestMove: HexCoord | null = null;
  let bestScore = -Infinity;
  let bestTargetCityId = unitIntent.objectiveCityId;
  let bestTargetUnitId = unitIntent.objectiveUnitId;

  for (const move of validMoves) {
    const waypointDistance = hexDistance(move, waypoint);
    const originWaypointDistance = hexDistance(unit.position, waypoint);
    const supportScore = getNearbySupportScore(state, unit.factionId, move);
    let terrainScore = scoreStrategicTerrain(state, unit.factionId, move);
    const anchorDistance = hexDistance(move, unitIntent.anchor);
    const nearestCity = getNearestFriendlyCity(state, unit.factionId, move);
    const cityDistance = nearestCity ? hexDistance(move, nearestCity.position) : 99;
    const moveVisibility = getHexVisibility(state, unit.factionId, move);
    if (isFortificationHex(state, move)) {
      const isDefensiveAssignment =
        unitIntent.assignment === 'defender'
        || unitIntent.assignment === 'recovery'
        || unitIntent.assignment === 'reserve';
      terrainScore += isDefensiveAssignment ? 8 : 4;
    }
    const score = scoreMoveCandidate({
      assignment: unitIntent.assignment,
      originWaypointDistance,
      waypointDistance,
      terrainScore,
      supportScore,
      originSupport,
      originAnchorDistance,
      anchorDistance,
      cityDistance,
      hiddenExplorationBonus: moveVisibility === 'hidden' && !['siege_force', 'main_army', 'raider'].includes(unitIntent.assignment),
      unsafeAfterMove: wouldBeUnsafeAfterMove(state, unit, move, unitIntent),
    });

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  // Compare best regular move against boarding
  if (bestBoardTransportId && bestBoardScore > bestScore) {
    const result = boardTransport(state, unitId, bestBoardTransportId, state.transportMap);
    log(trace, `${faction.name} infantry boarded transport (scored ${bestBoardScore.toFixed(1)} vs move ${bestScore.toFixed(1)})`);
    return { ...result.state, transportMap: result.transportMap };
  }

  if (!bestMove || bestScore <= 0) {
    return state;
  }

  const moved = moveUnit(state, unitId, bestMove, state.map, registry);
  recordAiIntent(trace, {
    round: moved.round,
    factionId: moved.units.get(unitId)?.factionId ?? unit.factionId,
    unitId,
    intent: mapAssignmentToIntent(unitIntent),
    from: unit.position,
    to: bestMove,
    reason: unitIntent.reason,
    targetUnitId: bestTargetUnitId,
    targetCityId: bestTargetCityId,
  });
  return moved;
}

/**
 * Transport with embarked troops: move toward waypoint, then auto-disembark
 * if near enemy objectives (villages, cities, or units).
 */
function moveTransportAndDisembark(
  state: GameState,
  transportId: UnitId,
  registry: RulesRegistry,
  waypoint: HexCoord,
  unitIntent: UnitStrategicIntent,
  trace?: SimulationTrace
): GameState {
  if (!state.map) return autoDisembark(state, transportId, registry, trace);
  const validMoves = getValidMoves(state, transportId, state.map, registry);
  if (validMoves.length === 0) {
    // Can't move — try to disembark anyway if near objectives
    return autoDisembark(state, transportId, registry, trace);
  }

  // Score moves toward waypoint
  let bestMove: HexCoord | null = null;
  let bestScore = -Infinity;
  const originWaypointDistance = hexDistance(
    (state.units.get(transportId) ?? { position: waypoint }).position,
    waypoint
  );

  for (const move of validMoves) {
    const waypointDistance = hexDistance(move, waypoint);
    let score = (originWaypointDistance - waypointDistance) * 8;
    // Prefer coast near enemy objectives
    const terrainId = state.map?.tiles.get(hexToKey(move))?.terrain ?? '';
    if (terrainId === 'coast' || terrainId === 'river') score += 1;
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  if (!bestMove || bestScore <= 0) {
    return autoDisembark(state, transportId, registry, trace);
  }

  const moved = moveUnit(state, transportId, bestMove, state.map!, registry);
  // Update embarked positions after transport moves
  const updated = updateEmbarkedPositions(moved, transportId, bestMove, moved.transportMap);
  log(trace, `transport ${transportId} moved to ${hexToKey(bestMove)} with embarked troops`);

  // After moving, check if we should disembark
  return autoDisembark(updated, transportId, registry, trace);
}

/**
 * Auto-disembark embarked units if transport is near enemy objectives.
 */
function autoDisembark(
  state: GameState,
  transportId: UnitId,
  registry: RulesRegistry,
  trace?: SimulationTrace
): GameState {
  const transport = state.units.get(transportId);
  if (!transport) return state;

  const factionId = transport.factionId;
  const embarked = getEmbarkedUnits(transportId, state.transportMap);
  if (embarked.length === 0) return state;

  // Check if there's an enemy village, city, or unit nearby worth disembarking for
  let nearObjective = false;
  for (const [, village] of state.villages) {
    if (village.factionId === factionId) continue;
    if (hexDistance(transport.position, village.position) <= 2) {
      nearObjective = true;
      break;
    }
  }
  if (!nearObjective) {
    for (const [, city] of state.cities) {
      if (city.factionId === factionId) continue;
      if (hexDistance(transport.position, city.position) <= 3) {
        nearObjective = true;
        break;
      }
    }
  }
  if (!nearObjective) {
    for (const [, enemy] of state.units) {
      if (enemy.factionId === factionId || enemy.hp <= 0) continue;
      if (hexDistance(transport.position, enemy.position) <= 2) {
        nearObjective = true;
        break;
      }
    }
  }

  if (!nearObjective) return state;

  // Disembark all embarked units
  const disembarkHexes = getValidDisembarkHexes(state, transportId, registry, state.transportMap);
  if (disembarkHexes.length === 0) return state;

  let current = state;
  let currentTransportMap = new Map(state.transportMap);

  for (const embarkedId of embarked) {
    if (disembarkHexes.length === 0) break;
    // Pick the hex closest to nearest enemy objective
    let bestHex = disembarkHexes[0];
    let bestDist = Infinity;
    for (const hex of disembarkHexes) {
      let minDist = Infinity;
      for (const [, village] of current.villages) {
        if (village.factionId === factionId) continue;
        minDist = Math.min(minDist, hexDistance(hex, village.position));
      }
      for (const [, city] of current.cities) {
        if (city.factionId === factionId) continue;
        minDist = Math.min(minDist, hexDistance(hex, city.position));
      }
      if (minDist < bestDist) {
        bestDist = minDist;
        bestHex = hex;
      }
    }

    const result = disembarkUnit(current, transportId, embarkedId, bestHex, registry, currentTransportMap);
    current = result.state;
    currentTransportMap = result.transportMap;
    // Remove used hex from options
    disembarkHexes.splice(disembarkHexes.indexOf(bestHex), 1);
    log(trace, `${factionId} disembarked unit ${embarkedId} at ${hexToKey(bestHex)}`);
  }

  return current;
}

function buildFallbackIntent(state: GameState, unit: Unit): UnitStrategicIntent {
  const city = getNearestFriendlyCity(state, unit.factionId, unit.position);
  const waypoint = city?.position ?? unit.position;
  return {
    assignment: 'reserve',
    waypointKind: 'friendly_city',
    waypoint,
    anchor: waypoint,
    isolationScore: 0,
    isolated: false,
    reason: 'fallback movement toward the nearest friendly city',
  };
}

function resolveWaypoint(state: GameState, unit: Unit, intent: UnitStrategicIntent): HexCoord {
  if (intent.objectiveUnitId) {
    const liveTarget = state.units.get(intent.objectiveUnitId);
    if (liveTarget && liveTarget.hp > 0) {
      return liveTarget.position;
    }
  }
  if (intent.objectiveCityId) {
    const city = state.cities.get(intent.objectiveCityId);
    if (city) {
      return city.position;
    }
  }
  return intent.waypoint;
}

function wouldBeUnsafeAfterMove(
  state: GameState,
  unit: Unit,
  move: HexCoord,
  intent: UnitStrategicIntent
): boolean {
  let nearestFriendly = Infinity;
  let nearbyEnemies = 0;
  for (const other of state.units.values()) {
    if (other.id === unit.id || other.hp <= 0) continue;
    const dist = hexDistance(move, other.position);
    if (other.factionId === unit.factionId) {
      nearestFriendly = Math.min(nearestFriendly, dist);
    } else if (dist <= 2) {
      nearbyEnemies += 1;
    }
  }
  return nearestFriendly > 3 && hexDistance(move, intent.anchor) > 4 && nearbyEnemies > 0;
}

function mapAssignmentToIntent(intent: UnitStrategicIntent): TraceAiIntentEvent['intent'] {
  if (intent.assignment === 'recovery') return 'retreat';
  if (intent.assignment === 'defender' || intent.assignment === 'reserve') return 'regroup';
  if (intent.assignment === 'siege_force') return 'siege';
  if (intent.assignment === 'raider') return 'support';
  return 'advance';
}

function activateUnit(
  state: GameState,
  unitId: UnitId,
  registry: RulesRegistry,
  trace?: SimulationTrace,
  fortsBuiltThisRound?: Set<FactionId>
): GameState {
  const unit = state.units.get(unitId);
  if (!unit || unit.hp <= 0 || !state.map) {
    return state;
  }

  const factionId = unit.factionId;
  const faction = state.factions.get(factionId);
  const prototype = state.prototypes.get(unit.prototypeId);
  if (!faction || !prototype) {
    return setUnitActivated(state, unitId);
  }

  let current: GameState = {
    ...state,
    activeFactionId: factionId,
    turnNumber: state.turnNumber + 1,
  };

  const map = current.map!;
  const actingUnit = current.units.get(unitId);
  if (!actingUnit || actingUnit.hp <= 0) {
    return current;
  }

  if (actingUnit.preparedAbility === 'ambush' && hasAdjacentEnemy(current, actingUnit)) {
    const units = new Map(current.units);
    units.set(unitId, clearPreparedAbility(actingUnit));
    current = { ...current, units };
  }

  if (actingUnit.routed) {
    const fleeHex = findFleeHex(actingUnit, current);
    if (fleeHex && canMoveTo(current, unitId, fleeHex, map, registry)) {
      current = moveUnit(current, unitId, fleeHex, map, registry);
      // Update embarked unit positions if moving unit is a transport
      const movedUnit = current.units.get(unitId);
      if (movedUnit) {
        const movedProto = current.prototypes.get(movedUnit.prototypeId);
        if (movedProto && isTransportUnit(movedProto, registry)) {
          current = updateEmbarkedPositions(current, unitId, movedUnit.position, current.transportMap);
        }
      }
      log(trace, `${faction.name} ${prototype.name} routed and fled`);
    }
    return setUnitActivated(current, unitId);
  }

  let activeUnit = current.units.get(unitId)!;
  const unitRange = prototype.derivedStats.range ?? 1;
  const factionDoctrine = resolveResearchDoctrine(current.research.get(factionId), faction);
  const canChargeAttack =
    unitRange <= 1 && (canUseCharge(prototype) || factionDoctrine.chargeTranscendenceEnabled);
  const shouldEngageFromPosition = (unitAtPosition: Unit, attackScore: number): boolean => {
    const strategy = current.factionStrategies.get(factionId);
    const unitIntent = getUnitIntent(strategy, unitId);
    const nearestFriendlyDist = getNearestFriendlyDistanceToHex(current, factionId, unitAtPosition.position);
    const nearbyPressure = countNearbyUnitPressure(current, factionId, unitAtPosition.position, unitId);
    const anchorDistance = unitIntent ? hexDistance(unitAtPosition.position, unitIntent.anchor) : 0;
    const retreatRisk = computeRetreatRisk({
      hpRatio: unitAtPosition.hp / Math.max(1, unitAtPosition.maxHp),
      nearbyEnemies: nearbyPressure.nearbyEnemies,
      nearbyFriendlies: nearbyPressure.nearbyFriendlies,
      nearestFriendlyDistance: nearestFriendlyDist,
      anchorDistance,
    });
    return shouldEngageTarget(strategy?.personality, { attackScore, retreatRisk });
  };

  let enemyChoice = unitRange > 1
    ? findBestRangedTarget(current, unitId, activeUnit.position, factionId, prototype as any, registry, unitRange)
    : findBestTargetChoice(current, unitId, activeUnit.position, factionId, prototype as any, registry);
  let enemy: typeof enemyChoice.target | undefined = enemyChoice.target;
  if (enemy && !shouldEngageFromPosition(activeUnit, enemyChoice.score)) {
    enemy = undefined;
  }

  // Ranged units (range > 1) attack from their current position — no need to charge/move adjacent
  if (!enemy && activeUnit.movesRemaining > 0 && canChargeAttack) {
    let chargeMove: HexCoord | null = null;
    let bestChargeScore = -Infinity;

    for (const move of getValidMoves(current, unitId, map, registry)) {
      const choice = findBestTargetChoice(current, unitId, move, factionId, prototype as any, registry);
      if (!choice.target) continue;
      const score = choice.score + (registry.getTerrain(getTerrainAt(current, move))?.defenseModifier ?? 0);
      if (score > bestChargeScore) {
        bestChargeScore = score;
        chargeMove = move;
      }
    }

    if (chargeMove && bestChargeScore > 0) {
      current = moveUnit(current, unitId, chargeMove, map, registry);
      // Update embarked unit positions if moving unit is a transport
      const movedUnit = current.units.get(unitId);
      if (movedUnit) {
        const movedProto = current.prototypes.get(movedUnit.prototypeId);
        if (movedProto && isTransportUnit(movedProto, registry)) {
          current = updateEmbarkedPositions(current, unitId, movedUnit.position, current.transportMap);
        }
      }
      activeUnit = current.units.get(unitId)!;
      // Unit may have been destroyed by an opportunity attack during the charge move.
      if (!activeUnit) {
        return setUnitActivated(current, unitId);
      }
      enemyChoice = findBestTargetChoice(current, unitId, activeUnit.position, factionId, prototype as any, registry);
      enemy = enemyChoice.target;
      if (enemy && !shouldEngageFromPosition(activeUnit, enemyChoice.score)) {
        enemy = undefined;
      }
      log(trace, `${faction.name} ${prototype.name} charged into position`);
    }
  }

  if (
    enemy &&
    activeUnit.attacksRemaining > 0 &&
    shouldBrace(
      activeUnit,
      prototype,
      current,
      factionDoctrine.fortressTranscendenceEnabled,
    ) &&
    enemyChoice.score <= 0
  ) {
    const units = new Map(current.units);
    units.set(unitId, prepareAbility(activeUnit, 'brace', current.round));
    log(trace, `${faction.name} ${prototype.name} braced`);
    current = { ...current, units };
    current = buildFieldFortIfEligible(current, factionId, unitId, registry, fortsBuiltThisRound);
    current = applyHillDugInIfEligible(current, factionId, unitId);
    return current;
  }

  if (enemy && activeUnit.attacksRemaining > 0) {
    const enemyPrototype = current.prototypes.get(enemy.prototypeId);
    if (!enemyPrototype) {
      return setUnitActivated(current, unitId);
    }

    // Resolve active synergies for attacker and defender
    const engine = getSynergyEngine();
    const attackerFaction = current.factions.get(activeUnit.factionId);

    // Get triple stack pair synergies for attacker faction
    let attackerSynergies: ActiveSynergy[];
    let attackerTriple: ActiveTripleStack | null = null;
    if (attackerFaction?.activeTripleStack) {
      // Triple exists: all pair synergies from the triple apply to ALL faction units
      attackerSynergies = attackerFaction.activeTripleStack.pairs;
      attackerTriple = attackerFaction.activeTripleStack;
    } else {
      // Normal: only unit's own tag-based synergies
      attackerSynergies = prototype.tags ? engine.resolveUnitPairs(prototype.tags) : [];
    }

    const defenderFaction = current.factions.get(enemy.factionId);
    let defenderSynergies: ActiveSynergy[];
    let defenderTriple: ActiveTripleStack | null = null;
    if (defenderFaction?.activeTripleStack) {
      defenderSynergies = defenderFaction.activeTripleStack.pairs;
      defenderTriple = defenderFaction.activeTripleStack;
    } else {
      defenderSynergies = enemyPrototype.tags ? engine.resolveUnitPairs(enemyPrototype.tags) : [];
    }

    // Create combat contexts for synergy resolution
    const attackerPos = activeUnit.position as unknown as { x: number; y: number };
    const defenderPos = enemy.position as unknown as { x: number; y: number };
    const attackerContext: CombatContext = {
      attackerId: activeUnit.id,
      defenderId: enemy.id,
      attackerTags: prototype.tags ?? [],
      defenderTags: enemyPrototype.tags ?? [],
      attackerHp: activeUnit.hp,
      defenderHp: enemy.hp,
      terrain: getTerrainAt(current, activeUnit.position),
      isCharge: false, // set properly below after charge is determined
      isStealthAttack: false, // set properly below
      isRetreat: false,
      isStealthed: activeUnit.isStealthed,
      position: attackerPos,
      attackerPosition: attackerPos,
      defenderPosition: defenderPos,
    };

    const defenderContext: CombatContext = {
      attackerId: enemy.id,
      defenderId: activeUnit.id,
      attackerTags: enemyPrototype.tags ?? [],
      defenderTags: prototype.tags ?? [],
      attackerHp: enemy.hp,
      defenderHp: activeUnit.hp,
      terrain: getTerrainAt(current, enemy.position),
      isCharge: false,
      isStealthAttack: enemy.isStealthed ?? false,
      isRetreat: false,
      isStealthed: enemy.isStealthed ?? false,
      position: defenderPos,
      attackerPosition: defenderPos,
      defenderPosition: attackerPos,
    };

    const attackerVeteranBonus = getVeteranStatBonus(registry, activeUnit.veteranLevel);
    const defenderVeteranBonus = getVeteranDefenseBonus(registry, enemy.veteranLevel);
    const defenderMoraleBonus = getVeteranMoraleBonus(registry, enemy.veteranLevel);
    const attackerTerrainId = getTerrainAt(current, activeUnit.position);
    const defenderTerrainId = getTerrainAt(current, enemy.position);
    const attackerTerrain = registry.getTerrain(attackerTerrainId);
    const defenderTerrain = registry.getTerrain(defenderTerrainId);
    // Check if either unit is standing in a field fort
    const defenderOnFort = getImprovementBonus(current, enemy.position) > 0;
    const attackerOnFort = getImprovementBonus(current, activeUnit.position) > 0;
    // Units in field forts are unflankable — every attack is frontal
    const flanking = defenderOnFort ? 0 : calculateFlankingBonus(activeUnit, enemy, current);
    let situationalAttackModifier = getCombatAttackModifier(attackerFaction, attackerTerrain, defenderTerrain);
    let situationalDefenseModifier = getCombatDefenseModifier(defenderFaction, defenderTerrain);

    // Desert Swarm (desert_logistics): N+ friendly units within distance 2 grants bonus
    const desertAbilityPlayer = registry.getSignatureAbility('desert_nomads');
    const swarmConfigPlayer = desertAbilityPlayer ? {
      threshold: desertAbilityPlayer.desertSwarmThreshold ?? 3,
      attackBonus: desertAbilityPlayer.desertSwarmAttackBonus ?? 1,
      defenseMultiplier: desertAbilityPlayer.desertSwarmDefenseMultiplier ?? 1.1,
    } : undefined;
    const attackerSwarm = getDesertSwarmBonus(attackerFaction, activeUnit, current, swarmConfigPlayer);
    if (attackerSwarm.attackBonus > 0) {
      situationalAttackModifier += attackerSwarm.attackBonus;
    }
    const defenderSwarm = getDesertSwarmBonus(defenderFaction, enemy, current, swarmConfigPlayer);
    if (defenderSwarm.defenseMultiplier > 1.0) {
      situationalDefenseModifier += (defenderSwarm.defenseMultiplier - 1.0);
    }

    let tidalAssaultTriggered = false;
    
    // Tidal Assault: Amphibious assault — naval units attack from water to land;
    // enemies on coast get -25% defense (from ability-domains.json tidal_warfare)
    if (prototype.tags?.includes('naval') && (prototype.tags?.includes('shock') || prototype.tags?.includes('ranged'))) {
      const isWaterToLand = (attackerTerrainId === 'coast' || attackerTerrainId === 'river') 
        && defenderTerrainId !== 'coast' && defenderTerrainId !== 'river';
      if (isWaterToLand) {
        // Attack bonus from water-to-land
        const tidalAssaultBonus = registry.getSignatureAbility('coral_people')?.tidalAssaultBonus ?? 0.2;
        situationalAttackModifier += tidalAssaultBonus;
        // Defense debuff on coastal enemies
        const coastDebuff = getTidalCoastDebuff();
        situationalDefenseModifier -= coastDebuff;
        tidalAssaultTriggered = true;
      }
    }
    
    // Camel Scare: Camel units get +30% attack vs cavalry/heavy_cavalry
    // Horses are historically terrified of camels
    const attackerIsCamel = prototype.tags?.includes('camel') ?? false;
    const defenderIsCavalry = enemyPrototype.tags?.includes('cavalry') ?? false;
    if (attackerIsCamel && defenderIsCavalry) {
      situationalAttackModifier += 0.3;
    }
    // Cavalry are also scared attacking camels (-20% attack)
    if (defenderIsCavalry && attackerIsCamel === false) {
      const defenderPrototype = current.prototypes.get(enemy.prototypeId);
      const defenderIsCamel = defenderPrototype?.tags?.includes('camel') ?? false;
      if (defenderIsCamel) {
        situationalAttackModifier -= 0.2;
      }
    }
    
    // Bulwark (Hill Clan): Adjacent fortress units grant defense bonus to defender
    // Uses ability-domains.json fortress: +30% defense aura
    let bulwarkTriggered = false;
    const defenderNeighbors = getNeighbors(enemy.position);
    for (const hex of defenderNeighbors) {
      const neighborUnitId = getUnitAtHex(current, hex);
      if (neighborUnitId) {
        const neighborUnit = current.units.get(neighborUnitId);
        if (neighborUnit && neighborUnit.factionId === enemy.factionId && neighborUnit.hp > 0) {
          const neighborPrototype = current.prototypes.get(neighborUnit.prototypeId);
          if (neighborPrototype) {
            const hasFortress = neighborPrototype.tags?.includes('fortress') ?? false;
            if (hasFortress) {
              const bulwarkBonus = getBulwarkDefenseBonus(enemy, current, registry);
              situationalDefenseModifier += bulwarkBonus;
              bulwarkTriggered = true;
              break; // Only apply once per combat
            }
          }
        }
      }
    }
    
    // Fortified Volley: Ranged units standing IN a field fort gain attack bonus
    // "Bows from barricades" — archers fire from fortified positions
    // Fortress-tagged ranged units (Fortress Archers) get double the bonus
    let fortifiedVolleyTriggered = false;
    let fortifiedCoverTriggered = false;
    const attackerIsRanged = prototype.derivedStats.role === 'ranged' || (prototype.derivedStats.range ?? 1) > 1;
    if (attackerIsRanged && attackerOnFort) {
      const attackerIsFortress = prototype.tags?.includes('fortress') ?? false;
      const attackerIsSiege = prototype.tags?.includes('siege') ?? false;
      const volleyBonus = attackerIsSiege ? 0.40 : attackerIsFortress ? 0.30 : 0.15;
      situationalAttackModifier += volleyBonus;
      fortifiedVolleyTriggered = true;
    }
    // Fortified Cover: Ranged defenders in a field fort gain defense bonus
    // Unlike infantry (who only get the flat improvement defense), ranged get a % modifier
    const defenderIsRanged = enemyPrototype.derivedStats.role === 'ranged' || (enemyPrototype.derivedStats.range ?? 1) > 1;
    if (defenderIsRanged && defenderOnFort) {
      const defenderIsFortress = enemyPrototype.tags?.includes('fortress') ?? false;
      const coverBonus = defenderIsFortress ? 0.30 : 0.15;
      situationalDefenseModifier += coverBonus;
      fortifiedCoverTriggered = true;
    }

    // Siege damage bonus: siege-tagged units get +25% attack against defenders on city hexes
    if (prototype.tags?.includes('siege') ?? false) {
      const defenderOnCity = [...current.cities.values()].some(
        (city) => city.position.q === enemy.position.q && city.position.r === enemy.position.r
      );
      if (defenderOnCity) {
        situationalAttackModifier += 0.25;
      }
    }
    
    const attackerDoctrine = factionDoctrine;
    const defenderDoctrine = resolveResearchDoctrine(current.research.get(enemy.factionId), defenderFaction);
    // Units in forts cannot be attacked from the rear — every approach is frontal
    const rearAttackBonus = (defenderOnFort ? 0 : isRearAttack(activeUnit, enemy)) ? 0.2 : 0;
    const isChargeAttack = canChargeAttack
      && (
        attackerDoctrine.chargeTranscendenceEnabled
        || activeUnit.movesRemaining < activeUnit.maxMoves
      );
    const braceTriggered = enemy.preparedAbility === 'brace'
      && (prototype.derivedStats.role === 'mounted' || prototype.derivedStats.range <= 1);
    const ambushAttackBonus = activeUnit.preparedAbility === 'ambush' ? 0.15 : 0;
    const bonusDefenderMoraleLoss = (rearAttackBonus > 0 ? 18 : 0) + (activeUnit.preparedAbility === 'ambush' ? 10 : 0);
    
    // Stealth ambush: stealthed units get +50% bonus (handled inside resolveCombat via isStealthed param)
    const attackerIsStealthed = activeUnit.isStealthed;
    
    // Calculate charge bonus with signature ability overrides
    let chargeAttackBonus = isChargeAttack && !braceTriggered ? 0.15 : 0;
    
    // Swift Charge: Higher charge bonus for cavalry units
    let swiftChargeTriggered = false;
    if (isChargeAttack && !braceTriggered && prototype.tags?.includes('cavalry')) {
      const swiftChargeBonus = registry.getSignatureAbility('plains_riders')?.swiftChargeBonus ?? 0.3;
      chargeAttackBonus = swiftChargeBonus;
      swiftChargeTriggered = true;
    }
    
    // Stampede: Extra bonus when elephants or chariots charge (savannah_lions)
    let stampedeTriggered = false;
    if (isChargeAttack && !braceTriggered && (prototype.tags?.includes('elephant') || prototype.tags?.includes('chariot'))) {
      const stampedeBonus = registry.getSignatureAbility('savannah_lions')?.stampedeBonus ?? 0.3;
      chargeAttackBonus += stampedeBonus;
      stampedeTriggered = true;
    }
    const retaliationDamageMultiplier = braceTriggered && isChargeAttack ? 1.1 : 1;
    const braceDefenseBonus = enemy.preparedAbility === 'brace'
      ? (defenderDoctrine.fortressTranscendenceEnabled ? 0.4 : 0.2)
      : 0;

    // Hill defense: terrain.defenseModifier is already applied in terrain lookup
    // No research-based hill fighting modifiers in new system
    if (enemy.hillDugIn) {
      situationalDefenseModifier += 0.2;
    }

    if (attackerDoctrine.greedyCaptureEnabled && enemy.hp < enemy.maxHp * 0.5) {
      situationalAttackModifier += 0.15;
    }

    if (attackerDoctrine.antiFortificationEnabled && (enemy.preparedAbility === 'brace' || getImprovementBonus(current, enemy.position) > 0)) {
      situationalAttackModifier += 0.2;
    }

    if (attackerDoctrine.chargeRoutedBonusEnabled && isChargeAttack && enemy.routed) {
      situationalAttackModifier += 0.5;
    }

    // Shield wall (fortress Tier 1): +15% defense with ally support, or +25% with foreign T3 upgrade.
    if (defenderDoctrine.shieldWallEnabled) {
      const attackerIsRanged = prototype.derivedStats.role === 'ranged' || (prototype.derivedStats.range ?? 1) > 1;
      const defenderIsInfantry = enemyPrototype.derivedStats.role === 'melee' && !(enemyPrototype.tags?.includes('cavalry') || enemyPrototype.tags?.includes('elephant'));
      if (attackerIsRanged && defenderIsInfantry) {
        const supportRadius = defenderDoctrine.fortressTranscendenceEnabled ? 2 : 1;
        const hasSupportAlly = Array.from(current.units.values()).some((neighbor) =>
          neighbor.id !== enemy.id &&
          neighbor.factionId === enemy.factionId &&
          neighbor.hp > 0 &&
          hexDistance(neighbor.position, enemy.position) <= supportRadius
        );
        if (hasSupportAlly) {
          situationalDefenseModifier += defenderDoctrine.fortressAuraUpgradeEnabled ? 0.25 : 0.15;
        }
      }
    }

    // Canopy cover (nature_healing Tier 2): ranged units +30% defense in forest/jungle
    if (defenderDoctrine.canopyCoverEnabled) {
      const defenderIsRanged = enemyPrototype.derivedStats.role === 'ranged';
      if (defenderIsRanged && (defenderTerrain?.id === 'forest' || defenderTerrain?.id === 'jungle')) {
        situationalDefenseModifier += 0.3;
      }
    }

    if (defenderDoctrine.roughTerrainDefenseEnabled && ['forest', 'jungle', 'hill', 'swamp'].includes(defenderTerrain?.id ?? '')) {
      situationalDefenseModifier += 0.2;
    }

    // Undying (native nature_healing Tier 3): units below 20% HP gain +50% defense
    if (defenderDoctrine.undyingEnabled && enemy.hp < enemy.maxHp * 0.2) {
      situationalDefenseModifier += 0.5;
    }

    // Forest ambush doctrine: first strike when attacking from forest hex
    const forestFirstStrike = attackerDoctrine.forestAmbushEnabled && attackerTerrain?.id === 'forest';

    // Update attacker context with resolved charge/stealth values
    attackerContext.isCharge = isChargeAttack;
    attackerContext.isStealthAttack = attackerIsStealthed;

    // Apply synergy effects to combat contexts
    const attackerSynergyResult = applyCombatSynergies(attackerContext, attackerSynergies, attackerTriple);
    const defenderSynergyResult = applyCombatSynergies(defenderContext, defenderSynergies, defenderTriple);

    // Modify combat parameters based on synergies
    const synergyAttackModifier = calculateSynergyAttackBonus(attackerSynergyResult);
    const synergyDefenseModifier = calculateSynergyDefenseBonus(defenderSynergyResult);
    situationalAttackModifier += synergyAttackModifier;
    situationalDefenseModifier += synergyDefenseModifier;
    const attackerChassis = registry.getChassis(prototype.chassisId);
    const attackerIsNaval = attackerChassis?.movementClass === 'naval';
    if (attackerDoctrine.navalCoastalBonusEnabled && attackerIsNaval && ['coast', 'river'].includes(attackerTerrain?.id ?? '')) {
      situationalAttackModifier += 0.25;
    }
    const improvementDefenseBonus = getImprovementBonus(current, enemy.position);
    const wallDefenseBonus = getWallDefenseBonus(current, enemy.position, registry.getSignatureAbility('coral_people')?.wallDefenseMultiplier ?? 2);

    const result = resolveCombat(
      activeUnit,
      enemy,
      prototype,
      enemyPrototype,
      attackerVeteranBonus,
      defenderVeteranBonus,
      attackerTerrain,
      defenderTerrain,
      improvementDefenseBonus + wallDefenseBonus,
      defenderMoraleBonus,
      registry,
      flanking,
      situationalAttackModifier + chargeAttackBonus,
      situationalDefenseModifier,
      current.rngState,
      rearAttackBonus,
      braceDefenseBonus,
      ambushAttackBonus,
      bonusDefenderMoraleLoss,
      retaliationDamageMultiplier,
      0, // hiddenAttackBonus
      isChargeAttack,
      attackerIsStealthed,
      attackerSynergyResult.chargeShield,
      defenderSynergyResult.antiDisplacement || defenderDoctrine.armorPenetrationEnabled,
      attackerSynergyResult.stealthChargeMultiplier,
      attackerSynergyResult.sandstormAccuracyDebuff,
      forestFirstStrike,
    );
    current = { ...current, rngState: result.rngState };

    let updatedAttacker: Unit = {
      ...activeUnit,
      hp: activeUnit.hp - result.attackerDamage,
      morale: Math.max(0, activeUnit.morale - result.attackerMoraleLoss),
      routed: result.attackerRouted || result.attackerFled,
      hillDugIn: false,
      attacksRemaining: 0,
      activatedThisRound: true,
      status: 'spent' as const,
    };

    let updatedDefender: Unit = {
      ...enemy,
      hp: enemy.hp - result.defenderDamage,
      morale: Math.max(0, enemy.morale - result.defenderMoraleLoss),
      routed: result.defenderRouted || result.defenderFled,
      hillDugIn: false,
    };

    // Synergy: routThresholdOverride — replace default flee threshold for beasts/cavalry/camel
    if (attackerSynergyResult.routThresholdOverride !== null && !result.defenderDestroyed) {
      const defenderChassis = registry.getChassis(enemyPrototype.chassisId);
      const defenderMovementClass = defenderChassis?.movementClass ?? 'infantry';
      if (defenderMovementClass === 'cavalry' || defenderMovementClass === 'camel' || defenderMovementClass === 'beast') {
        const shouldFlee = updatedDefender.hp <= updatedDefender.maxHp * attackerSynergyResult.routThresholdOverride;
        updatedDefender = { ...updatedDefender, routed: result.defenderRouted || shouldFlee };
      }
    }

    let poisonApplied = false;
    let reStealthTriggered = false;
    let reflectionDamageApplied = 0;
    let combatHealingApplied = 0;
    let sandstormTargetsHit = 0;
    let contaminatedHexApplied = false;
    let frostbiteApplied = false;
    let hitAndRunTriggered = false;
    let healOnRetreatApplied = 0;
    // Stampede2 (charge Tier 2): elephant charges knock back 2 hexes instead of 1
    let totalKnockbackDistance = result.defenderKnockedBack ? result.knockbackDistance : 0;
    if (result.defenderKnockedBack && attackerDoctrine.elephantStampede2Enabled && prototype.tags?.includes('elephant')) {
      totalKnockbackDistance = 2;
    }

    // Poisoncraft doctrine increases the number and severity of poison stacks.
    // Poison persistence (venom Tier 1): apply +1 extra stack on hit.
    if (!result.defenderDestroyed && result.defenderDamage > 0 && canInflictPoison(current, activeUnit)) {
      const extraStacks = attackerDoctrine.poisonPersistenceEnabled ? 1 : 0;
      updatedDefender = applyPoisonDoT(
        updatedDefender,
        attackerDoctrine.poisonStacksOnHit + extraStacks,
        attackerDoctrine.poisonDamagePerStack,
        3
      );
      updatedDefender = { ...updatedDefender, poisonedBy: activeUnit.factionId };
      poisonApplied = true;
    }

    // Contaminate terrain (venom Tier 2): killing a poisoned enemy contaminates their hex.
    if (result.defenderDestroyed && attackerDoctrine.contaminateTerrainEnabled && canInflictPoison(current, activeUnit)) {
      const hexKey = hexToKey(enemy.position);
      const newContaminatedHexes = new Set(current.contaminatedHexes);
      newContaminatedHexes.add(hexKey);
      current = { ...current, contaminatedHexes: newContaminatedHexes };
      contaminatedHexApplied = true;
    }
    
    // Stealth ambush: break stealth after attacking
    if (attackerIsStealthed && !result.attackerDestroyed) {
      updatedAttacker = { ...updatedAttacker, isStealthed: false, turnsSinceStealthBreak: 1 };
    }
    
    updatedAttacker = rotateUnitToward(updatedAttacker, enemy.position);
    if (!result.defenderDestroyed) {
      updatedDefender = rotateUnitToward(updatedDefender, updatedAttacker.position);
    }
    if (updatedAttacker.preparedAbility) {
      updatedAttacker = clearPreparedAbility(updatedAttacker);
    }
    if (braceTriggered) {
      updatedDefender = clearPreparedAbility(updatedDefender);
    }

    if (defenderDoctrine.damageReflectionEnabled && result.defenderDamage > 0 && !result.attackerDestroyed) {
      reflectionDamageApplied = Math.max(1, Math.floor(result.defenderDamage * 0.25));
      updatedAttacker = {
        ...updatedAttacker,
        hp: Math.max(0, updatedAttacker.hp - reflectionDamageApplied),
      };
    }

    updatedAttacker = recordBattleFought(
      updatedAttacker,
      enemy.id,
      result.defenderDestroyed,
      result.attackerDamage,
      result.defenderDamage
    );

    if (result.defenderDestroyed) {
      updatedAttacker = recordEnemyKilled(updatedAttacker, enemy.id);
    }

    // Learn-by-kill: if defender was destroyed and attacker survived, try to learn from the kill
    if (result.defenderDestroyed && !result.attackerDestroyed) {
      const learnResult = tryLearnFromKill(updatedAttacker, enemy, current, current.rngState, trace);
      updatedAttacker = learnResult.unit;
      // Update the units map with the modified attacker
      const unitsAfterLearn = new Map(current.units);
      unitsAfterLearn.set(updatedAttacker.id, updatedAttacker);
      current = { ...current, units: unitsAfterLearn };
    }

    updatedAttacker = awardCombatXP(
      updatedAttacker,
      result.defenderDestroyed,
      !result.attackerDestroyed
    );

    if (canPromote(updatedAttacker, registry)) {
      const oldLevel = updatedAttacker.veteranLevel;
      const promoted = tryPromoteUnit(updatedAttacker, registry);
      updatedAttacker = promoted.veteranLevel !== oldLevel
        ? recordPromotion(promoted, oldLevel, promoted.veteranLevel)
        : promoted;
    }

    const units = new Map(current.units);
    if (result.attackerDestroyed || updatedAttacker.hp <= 0) {
      units.delete(updatedAttacker.id);
    } else {
      units.set(updatedAttacker.id, updatedAttacker);
    }
    if (result.defenderDestroyed) {
      units.delete(updatedDefender.id);
    } else {
      units.set(updatedDefender.id, updatedDefender);
    }
    current = { ...current, units };

    // Capture hook: check if attacker can capture destroyed defender
    let captured = false;
    let retreatCaptured = false;
    const attackerTerrainAbil = current.map?.tiles.get(hexToKey(updatedAttacker.position))?.terrain ?? '';
    const isGreedyCoastalAbil = faction.identityProfile.passiveTrait === 'greedy'
      && (attackerTerrainAbil === 'coast' || attackerTerrainAbil === 'river' || attackerTerrainAbil === 'ocean');
    const autoCaptureAbility = attackerDoctrine.autoCaptureEnabled && enemy.hp <= enemy.maxHp * 0.25
      ? {
          greedyCaptureChance: 1,
          greedyCaptureCooldown: 0,
          greedyCaptureHpFraction: 0.25,
        }
      : null;
    if (result.defenderDestroyed && updatedAttacker.hp > 0 && (hasCaptureAbility(prototype, registry) || isGreedyCoastalAbil || autoCaptureAbility)) {
      const greedyAbilityAbil = autoCaptureAbility
        ?? (isGreedyCoastalAbil && !hasCaptureAbility(prototype, registry)
          ? registry.getSignatureAbility(factionId)
          : null);
      const captureResult = attemptCapture(
        current, updatedAttacker, updatedDefender, registry,
        greedyAbilityAbil, current.rngState
      );
      if (captureResult.captured) {
        current = captureResult.state;
        captured = true;
        log(trace, `${faction.name} ${prototype.name} CAPTURED ${enemyPrototype.name}!`);
      }
    }
    if (!result.defenderDestroyed && result.defenderFled && updatedAttacker.hp > 0) {
      const retreatCaptureResult = tryResolveRetreatCapture(
        current,
        updatedAttacker,
        updatedDefender,
        attackerDoctrine.captureRetreatEnabled,
        registry,
        current.rngState,
      );
      if (retreatCaptureResult.captured) {
        current = retreatCaptureResult.state;
        retreatCaptured = true;
        log(trace, `${faction.name} ${prototype.name} captured retreating ${enemyPrototype.name}.`);
      }
    }

    // Knockback resolution: elephant stampede pushes defender (1 hex; 2 with charge Tier 2)
    if (result.defenderKnockedBack && !result.defenderDestroyed && !retreatCaptured) {
      const knockbackHex = applyKnockback(current, updatedAttacker, updatedDefender, totalKnockbackDistance);
      if (knockbackHex) {
        const unitsAfterKnockback = new Map(current.units);
        const knockedDefender = current.units.get(updatedDefender.id);
        if (knockedDefender) {
          unitsAfterKnockback.set(updatedDefender.id, {
            ...knockedDefender,
            position: knockbackHex,
          });
          current = { ...current, units: unitsAfterKnockback };
          log(trace, `${faction.name} ${prototype.name} knocked back ${enemyPrototype.name} to ${JSON.stringify(knockbackHex)}`);
        }
      }
    }

    // Stampede extra move: after a stampede charge, elephant gets +1 move to keep momentum
    if (stampedeTriggered && !result.attackerDestroyed) {
      const unitsAfterStampede = new Map(current.units);
      const stampedeUnit = unitsAfterStampede.get(updatedAttacker.id);
      if (stampedeUnit) {
        unitsAfterStampede.set(stampedeUnit.id, {
          ...stampedeUnit,
          movesRemaining: stampedeUnit.movesRemaining + 1,
        });
        current = { ...current, units: unitsAfterStampede };
        log(trace, `${faction.name} ${prototype.name} stampede grants +1 extra move`);
      }
    }

    // Apply synergy post-combat effects
    // 1. Extended knockback from synergy effects (ram_attack, bear_charge)
    if (attackerSynergyResult.knockbackDistance > 0 && !result.defenderDestroyed && !retreatCaptured) {
      const extendedKnockback = applyKnockback(current, updatedAttacker, updatedDefender, attackerSynergyResult.knockbackDistance);
      if (extendedKnockback) {
        const unitsAfterKnockback = new Map(current.units);
        const knockedDefender = unitsAfterKnockback.get(updatedDefender.id);
        if (knockedDefender) {
          unitsAfterKnockback.set(updatedDefender.id, {
            ...knockedDefender,
            position: extendedKnockback,
          });
          current = { ...current, units: unitsAfterKnockback };
          log(trace, `${faction.name} ${prototype.name} synergy knockback pushed ${enemyPrototype.name}`);
          totalKnockbackDistance += attackerSynergyResult.knockbackDistance;
        }
      }
    }

    // 2. Poison trap from V+H synergy (Poisoned Skirmish) — place trap at attacker's position
    if (attackerSynergyResult.poisonTrapPositions.length > 0 && !result.attackerDestroyed) {
      const trapKey = hexToKey(updatedAttacker.position);
      const newTraps = new Map(current.poisonTraps);
      newTraps.set(trapKey, {
        damage: attackerSynergyResult.poisonTrapDamage,
        slow: attackerSynergyResult.poisonTrapSlow,
        ownerFactionId: factionId,
      });
      current = { ...current, poisonTraps: newTraps };
      log(trace, `${faction.name} ${prototype.name} left a poison trap at ${JSON.stringify(updatedAttacker.position)}`);
    }

    // 3. Stealth recharge - re-enter stealth after combat from doctrine or synergy.
    if ((attackerSynergyResult.additionalEffects.includes('stealth_recharge') || (attackerDoctrine.stealthRechargeEnabled && prototype.tags?.includes('stealth'))) && !result.attackerDestroyed) {
      const canReStealth = !hasAdjacentEnemy(current, updatedAttacker);
      if (canReStealth) {
        const unitsMap = new Map(current.units);
        unitsMap.set(updatedAttacker.id, { ...updatedAttacker, isStealthed: true });
        current = { ...current, units: unitsMap };
        log(trace, `${faction.name} ${prototype.name} re-entered stealth`);
        reStealthTriggered = true;
      }
    }

    // 4. Combat healing (Stampeding Growth, Healing Charge)
    const combatHealMatch = attackerSynergyResult.additionalEffects.find(e => e.includes('combat_healing'));
    if (combatHealMatch && !result.attackerDestroyed) {
      const healMatch = combatHealMatch.match(/combat_healing_(\d+)%/);
      if (healMatch) {
        const healPercent = parseInt(healMatch[1]) / 100;
        const healAmount = Math.floor(result.defenderDamage * healPercent);
        if (healAmount > 0) {
          const unitsMap = new Map(current.units);
          const currentAttacker = unitsMap.get(updatedAttacker.id);
          if (currentAttacker) {
            unitsMap.set(updatedAttacker.id, {
              ...currentAttacker,
              hp: Math.min(currentAttacker.maxHp, currentAttacker.hp + healAmount),
            });
            current = { ...current, units: unitsMap };
            log(trace, `${faction.name} ${prototype.name} healed ${healAmount} HP from combat`);
            combatHealingApplied = healAmount;
          }
        }
      }
    }

    // 5. Sandstorm AoE damage to enemy units within 1 hex of defender
    if (attackerSynergyResult.sandstormDamage > 0 && !result.defenderDestroyed && !retreatCaptured) {
      const sandstormUnits = new Map(current.units);
      const defenderNeighbors = getNeighbors(updatedDefender.position);
      for (const adjHex of defenderNeighbors) {
        const adjUnitId = getUnitAtHex(current, adjHex);
        if (adjUnitId) {
          const adjUnit = sandstormUnits.get(adjUnitId);
          if (adjUnit && adjUnit.factionId !== factionId && adjUnit.hp > 0) {
            sandstormUnits.set(adjUnitId, {
              ...adjUnit,
              hp: Math.max(0, adjUnit.hp - attackerSynergyResult.sandstormDamage),
            });
            log(trace, `${faction.name} sandstorm dealt ${attackerSynergyResult.sandstormDamage} AoE damage to ${current.prototypes.get(adjUnit.prototypeId)?.name ?? 'unit'}`);
            sandstormTargetsHit += 1;
          }
        }
      }
      current = { ...current, units: sandstormUnits };
    }

    // 6. Contaminate — add defender's position to contaminated hexes
    if (attackerSynergyResult.contaminateActive && !result.defenderDestroyed && !retreatCaptured) {
      const newContaminated = new Set(current.contaminatedHexes);
      newContaminated.add(hexToKey(updatedDefender.position));
      current = { ...current, contaminatedHexes: newContaminated };
      log(trace, `${faction.name} ${prototype.name} contaminated ${JSON.stringify(updatedDefender.position)}`);
      contaminatedHexApplied = true;
    }

    // 7. Frostbite DoT and slow — apply to defender
    if (attackerSynergyResult.frostbiteColdDoT > 0 && !result.defenderDestroyed && !retreatCaptured) {
      const frostbiteUnits = new Map(current.units);
      const currentDefender = frostbiteUnits.get(updatedDefender.id);
      if (currentDefender) {
        frostbiteUnits.set(updatedDefender.id, {
          ...currentDefender,
          frozen: true,
          frostbiteStacks: attackerSynergyResult.frostbiteColdDoT,
          frostbiteDoTDuration: 3,
          movesRemaining: Math.max(0, currentDefender.movesRemaining - attackerSynergyResult.frostbiteSlow),
        });
        current = { ...current, units: frostbiteUnits };
        log(trace, `${faction.name} ${prototype.name} applied frostbite (${attackerSynergyResult.frostbiteColdDoT} DoT, ${attackerSynergyResult.frostbiteSlow} slow) to ${enemyPrototype.name}`);
        frostbiteApplied = true;
      }
    }

    if (result.defenderDestroyed && !captured) {
      current = removeUnitFromFaction(current, updatedDefender.factionId, updatedDefender.id);
    }
    if (result.attackerDestroyed) {
      current = removeUnitFromFaction(current, updatedAttacker.factionId, updatedAttacker.id);
    }

    // If destroyed defender was a transport, destroy all embarked units too
    if (result.defenderDestroyed && !captured) {
      const defProto = current.prototypes.get(updatedDefender.prototypeId);
      if (defProto && isTransportUnit(defProto, registry)) {
        const destroyResult = destroyTransport(current, updatedDefender.id, current.transportMap);
        current = destroyResult.state;
        current = { ...current, transportMap: destroyResult.transportMap };
      }
    }
    if (result.attackerDestroyed) {
      const atkProto = current.prototypes.get(updatedAttacker.prototypeId);
      if (atkProto && isTransportUnit(atkProto, registry)) {
        const destroyResult = destroyTransport(current, updatedAttacker.id, current.transportMap);
        current = destroyResult.state;
        current = { ...current, transportMap: destroyResult.transportMap };
      }
    }

    current = applyCombatSignals(current, updatedAttacker.factionId, result.signals);
    current = applyContactTransfer(current, updatedAttacker.factionId, updatedDefender.factionId, 'contact');
    current = maybeAbsorbFaction(current, updatedAttacker.factionId, updatedDefender.factionId, trace);
    current = unlockHybridRecipes(current, updatedAttacker.factionId, registry);

    if (result.defenderDestroyed && !captured) {
      current = updateCombatRecordOnWin(current, updatedAttacker.factionId, current.round);
      current = updateCombatRecordOnLoss(current, updatedDefender.factionId, current.round);
    } else if (result.attackerDestroyed) {
      current = updateCombatRecordOnLoss(current, updatedAttacker.factionId, current.round);
      current = updateCombatRecordOnWin(current, updatedDefender.factionId, current.round);
    }

    const attackerWE = current.warExhaustion.get(updatedAttacker.factionId);
    const defenderWE = current.warExhaustion.get(updatedDefender.factionId);
    if (result.defenderDestroyed && attackerWE) {
      const weMap = new Map(current.warExhaustion);
      weMap.set(updatedAttacker.factionId, addExhaustion(attackerWE, EXHAUSTION_CONFIG.UNIT_KILLED));
      current = { ...current, warExhaustion: weMap };
    }
    if (result.attackerDestroyed && defenderWE) {
      const weMap = new Map(current.warExhaustion);
      weMap.set(updatedDefender.factionId, addExhaustion(defenderWE, EXHAUSTION_CONFIG.UNIT_KILLED));
      current = { ...current, warExhaustion: weMap };
    }

    // Hit and Run: T2 enables cavalry skirmishers; native T3 upgrades it to all units.
    const hitAndRunEligible =
      attackerDoctrine.universalHitAndRunEnabled
      || (attackerDoctrine.hitAndRunEnabled && prototype.tags?.includes('cavalry') && prototype.tags?.includes('skirmish'));
    if (updatedAttacker.hp > 0 && hitAndRunEligible) {
        const retreatHex = findRetreatHex(updatedAttacker, current);
        if (retreatHex) {
          const unitsAfterRetreat = new Map(current.units);
          const retreatedUnit: Unit = {
            ...updatedAttacker,
            position: retreatHex,
            status: 'ready',
            movesRemaining: Math.max(0, updatedAttacker.movesRemaining - 1),
          };
          unitsAfterRetreat.set(retreatedUnit.id, retreatedUnit);
          current = { ...current, units: unitsAfterRetreat };
          log(trace, `${faction.name} ${prototype.name} hit and ran to ${JSON.stringify(retreatHex)}`);
          hitAndRunTriggered = true;

          // Synergy: heal_on_retreat — heal retreating unit
          if (attackerSynergyResult.healOnRetreatAmount > 0) {
            const healRetreatMap = new Map(current.units);
            const retreatingUnit = healRetreatMap.get(retreatedUnit.id);
            if (retreatingUnit) {
              healRetreatMap.set(retreatedUnit.id, {
                ...retreatingUnit,
                hp: Math.min(retreatingUnit.maxHp, retreatingUnit.hp + attackerSynergyResult.healOnRetreatAmount),
              });
              current = { ...current, units: healRetreatMap };
              log(trace, `${faction.name} ${prototype.name} healed ${attackerSynergyResult.healOnRetreatAmount} HP on retreat`);
              healOnRetreatApplied = attackerSynergyResult.healOnRetreatAmount;
            }
          }
        }
    }

    const triggeredEffects: TraceCombatEffect[] = [];
    if (flanking > 0) {
      pushCombatEffect(triggeredEffects, 'Flanking', `Attack gained ${formatPercent(flanking)} from adjacent allied pressure.`, 'positioning');
    }
    if (rearAttackBonus > 0) {
      pushCombatEffect(triggeredEffects, 'Rear Attack', `Hit from behind for ${formatPercent(rearAttackBonus)} and extra morale damage.`, 'positioning');
    }
    if (chargeAttackBonus > 0) {
      pushCombatEffect(triggeredEffects, 'Charge', `Attack gained ${formatPercent(chargeAttackBonus)} from momentum.`, 'ability');
    }
    if (braceTriggered) {
      pushCombatEffect(triggeredEffects, 'Brace', `Defender braced for ${formatPercent(braceDefenseBonus)} defense and stronger retaliation.`, 'ability');
    }
    if (ambushAttackBonus > 0) {
      pushCombatEffect(triggeredEffects, 'Ambush', `Prepared ambush added ${formatPercent(ambushAttackBonus)} attack.`, 'ability');
    }
    if (attackerIsStealthed) {
      pushCombatEffect(triggeredEffects, 'Stealth Ambush', 'Attacker opened from stealth for a major burst bonus.', 'ability');
    }
    if (tidalAssaultTriggered) {
      pushCombatEffect(triggeredEffects, 'Tidal Assault', 'Naval shock force attacked from water and reduced the defender’s footing.', 'ability');
    }
    if (bulwarkTriggered) {
      pushCombatEffect(triggeredEffects, 'Bulwark', 'Adjacent fortress support hardened the defender.', 'ability');
    }
    if (fortifiedVolleyTriggered) {
      pushCombatEffect(triggeredEffects, 'Fortified Volley', 'Ranged unit fired from a field fort for bonus attack.', 'ability');
    }
    if (fortifiedCoverTriggered) {
      pushCombatEffect(triggeredEffects, 'Fortified Cover', 'Ranged defender in a field fort gained fortified cover.', 'ability');
    }
    if (swiftChargeTriggered) {
      pushCombatEffect(triggeredEffects, 'Swift Charge', 'Cavalry signature charge replaced the baseline charge bonus.', 'ability');
    }
    if (stampedeTriggered) {
      pushCombatEffect(triggeredEffects, 'Stampede', 'Elephant momentum stacked extra charge damage.', 'ability');
    }
    if (synergyAttackModifier !== 0) {
      pushCombatEffect(triggeredEffects, 'Synergy Attack Bonus', `Pair or triple synergies added ${formatPercent(synergyAttackModifier)} attack pressure.`, 'synergy');
    }
    if (synergyDefenseModifier !== 0) {
      pushCombatEffect(triggeredEffects, 'Synergy Defense Bonus', `Pair or triple synergies added ${formatPercent(synergyDefenseModifier)} defense.`, 'synergy');
    }
    for (const effectCode of [...attackerSynergyResult.additionalEffects, ...defenderSynergyResult.additionalEffects]) {
      const effect = humanizeCombatEffect(effectCode);
      if (effect) {
        pushCombatEffect(triggeredEffects, effect.label, effect.detail, 'synergy');
      }
    }
    if (poisonApplied) {
      pushCombatEffect(triggeredEffects, 'Poisoned', `Defender was poisoned for ${updatedDefender.poisonStacks} stack damage over time.`, 'aftermath');
    }
    if (reflectionDamageApplied > 0) {
      pushCombatEffect(triggeredEffects, 'Reflection', `Defender reflected ${reflectionDamageApplied} damage back to the attacker.`, 'aftermath');
    }
    if (totalKnockbackDistance > 0 && !result.defenderDestroyed) {
      pushCombatEffect(triggeredEffects, 'Knockback', `Defender was displaced ${totalKnockbackDistance} hex${totalKnockbackDistance === 1 ? '' : 'es'}.`, 'aftermath');
    }
    if (reStealthTriggered) {
      pushCombatEffect(triggeredEffects, 'Stealth Recharge', 'Attacker slipped back into stealth after the exchange.', 'aftermath');
    }
    if (combatHealingApplied > 0) {
      pushCombatEffect(triggeredEffects, 'Combat Healing', `Attacker recovered ${combatHealingApplied} HP from dealt damage.`, 'aftermath');
    }
    if (sandstormTargetsHit > 0) {
      pushCombatEffect(triggeredEffects, 'Sandstorm Splash', `Area damage hit ${sandstormTargetsHit} nearby unit${sandstormTargetsHit === 1 ? '' : 's'}.`, 'aftermath');
    }
    if (contaminatedHexApplied) {
      pushCombatEffect(triggeredEffects, 'Contamination', 'The defender hex became contaminated after the strike.', 'aftermath');
    }
    if (frostbiteApplied) {
      pushCombatEffect(triggeredEffects, 'Frostbite', `Defender took ${attackerSynergyResult.frostbiteColdDoT} cold DoT and ${attackerSynergyResult.frostbiteSlow} slow.`, 'aftermath');
    }
    if (hitAndRunTriggered) {
      pushCombatEffect(triggeredEffects, 'Hit And Run', 'Attacker disengaged after combat to avoid being pinned.', 'aftermath');
    }
    if (healOnRetreatApplied > 0) {
      pushCombatEffect(triggeredEffects, 'Retreat Heal', `Attacker recovered ${healOnRetreatApplied} HP while withdrawing.`, 'aftermath');
    }

    const roleInfo = result.roleModifier !== 0 ? ` role:${result.roleModifier > 0 ? '+' : ''}${(result.roleModifier * 100).toFixed(0)}%` : '';
    const weaponInfo = result.weaponModifier !== 0 ? ` weapon:${result.weaponModifier > 0 ? '+' : ''}${(result.weaponModifier * 100).toFixed(0)}%` : '';
    const rearInfo = result.rearAttackBonus > 0 ? ' rear:+20%' : '';
    const abilityInfo = `${ambushAttackBonus > 0 ? ' ambush' : ''}${chargeAttackBonus > 0 ? ' charge' : ''}${braceTriggered ? ' counter-braced' : ''}`;
    const stealthInfo = attackerIsStealthed ? ' stealth-ambush' : '';
    const poisonInfo = !result.defenderDestroyed && result.defenderDamage > 0 && canInflictPoison(current, activeUnit) ? ` poisoned(${updatedDefender.poisonStacks})` : '';
    const knockbackInfo = result.defenderKnockedBack && !result.defenderDestroyed ? ' knocked-back' : '';
    const strikeFirstInfo = isChargeAttack && prototype.tags?.includes('cavalry') && result.defenderDestroyed && result.attackerDamage === 0 ? ' strike-first-kill' : '';
    const moraleInfo = ` morale:${result.defenderMoraleLoss.toFixed(0)}lost${result.defenderRouted ? ' ROUTED' : ''}${result.defenderFled ? ' FLED' : ''}`;
    log(
      trace,
      `${faction.name} ${prototype.name} fought ${enemyPrototype.name}${roleInfo}${weaponInfo}${rearInfo}${abilityInfo}${stealthInfo}${poisonInfo}${knockbackInfo}${strikeFirstInfo}${moraleInfo} | capabilities: ${describeCapabilityLevels(
        current.factions.get(factionId)!
      )}`
    );
    const outcomeLabel = describeCombatOutcome(result);
    const summary = formatCombatSummary(
      prototype.name,
      enemyPrototype.name,
      result.defenderDamage,
      result.attackerDamage,
      outcomeLabel,
      triggeredEffects
    );
    recordCombatEvent(trace, {
      round: current.round,
      attackerUnitId: updatedAttacker.id,
      defenderUnitId: updatedDefender.id,
      attackerFactionId: updatedAttacker.factionId,
      defenderFactionId: updatedDefender.factionId,
      attackerPrototypeId: updatedAttacker.prototypeId,
      defenderPrototypeId: updatedDefender.prototypeId,
      attackerPrototypeName: prototype.name,
      defenderPrototypeName: enemyPrototype.name,
      attackerDamage: result.attackerDamage,
      defenderDamage: result.defenderDamage,
      attackerHpAfter: updatedAttacker.hp,
      defenderHpAfter: updatedDefender.hp,
      attackerDestroyed: result.attackerDestroyed,
      defenderDestroyed: result.defenderDestroyed,
      attackerRouted: result.attackerRouted,
      defenderRouted: result.defenderRouted,
      attackerFled: result.attackerFled,
      defenderFled: result.defenderFled,
      summary,
      breakdown: {
        attacker: {
          unitId: activeUnit.id,
          factionId: activeUnit.factionId,
          prototypeId: activeUnit.prototypeId,
          prototypeName: prototype.name,
          position: activeUnit.position,
          terrain: attackerTerrainId,
          hpBefore: activeUnit.hp,
          hpAfter: updatedAttacker.hp,
          maxHp: activeUnit.maxHp,
          baseStat: result.attackerBaseAttack,
        },
        defender: {
          unitId: enemy.id,
          factionId: enemy.factionId,
          prototypeId: enemy.prototypeId,
          prototypeName: enemyPrototype.name,
          position: enemy.position,
          terrain: defenderTerrainId,
          hpBefore: enemy.hp,
          hpAfter: updatedDefender.hp,
          maxHp: enemy.maxHp,
          baseStat: result.defenderBaseDefense,
        },
        modifiers: {
          roleModifier: result.roleModifier,
          weaponModifier: result.weaponModifier,
          flankingBonus: result.flankingBonus,
          rearAttackBonus: result.rearAttackBonus,
          chargeBonus: chargeAttackBonus,
          braceDefenseBonus: result.braceDefenseBonus,
          ambushBonus: result.ambushAttackBonus,
          hiddenAttackBonus: result.hiddenAttackBonus,
          stealthAmbushBonus: attackerIsStealthed ? 0.5 : 0,
          situationalAttackModifier: result.situationalAttackModifier,
          situationalDefenseModifier: result.situationalDefenseModifier,
          synergyAttackModifier,
          synergyDefenseModifier,
          improvementDefenseBonus,
          wallDefenseBonus,
          finalAttackStrength: result.attackStrength,
          finalDefenseStrength: result.defenseStrength,
          baseMultiplier: result.baseMultiplier,
          positionalMultiplier: result.positionalMultiplier,
          damageVarianceMultiplier: result.damageVarianceMultiplier,
          retaliationVarianceMultiplier: result.retaliationVarianceMultiplier,
        },
        morale: {
          attackerLoss: result.attackerMoraleLoss,
          defenderLoss: result.defenderMoraleLoss,
          attackerRouted: result.attackerRouted,
          defenderRouted: result.defenderRouted,
          attackerFled: result.attackerFled,
          defenderFled: result.defenderFled,
        },
        outcome: {
          attackerDamage: result.attackerDamage,
          defenderDamage: result.defenderDamage,
          attackerDestroyed: result.attackerDestroyed,
          defenderDestroyed: result.defenderDestroyed,
          defenderKnockedBack: totalKnockbackDistance > 0 && !result.defenderDestroyed,
          knockbackDistance: totalKnockbackDistance,
        },
        triggeredEffects,
      },
    });

    current = buildFieldFortIfEligible(current, factionId, unitId, registry, fortsBuiltThisRound);
    current = applyHillDugInIfEligible(current, factionId, unitId);
    return current;
  }

  if (
    !enemy &&
    canUseAmbush(prototype, getAbilityTerrainAt(current, activeUnit.position)) &&
    !hasAdjacentEnemy(current, activeUnit)
  ) {
    const units = new Map(current.units);
    units.set(unitId, prepareAbility(activeUnit, 'ambush', current.round));
    log(trace, `${faction.name} ${prototype.name} prepared an ambush`);
    current = { ...current, units };
    current = buildFieldFortIfEligible(current, factionId, unitId, registry, fortsBuiltThisRound);
    current = applyHillDugInIfEligible(current, factionId, unitId);
    return current;
  }

  // Slave Galley: non-combat capture — attempt to enslave enemies within range 3
  // (Unit-based, not faction passive — only fires when unit has capture ability via slaver_net component)
  if (isTransportUnit(prototype, registry)
    && hasCaptureAbility(prototype, registry)
    && (activeUnit?.attacksRemaining ?? 0) > 0) {
    const greedyAbility = registry.getSignatureAbility(factionId);
    const captureParams = getCaptureParams(prototype, registry);
    // Use component's capture chance; fall back to signature ability for non-component sources
    const nonCombatChance = captureParams?.chance ?? greedyAbility?.greedyNonCombatCaptureChance ?? 0.5;
    const hpFraction = captureParams?.hpFraction ?? greedyAbility?.greedyCaptureHpFraction ?? 0.5;
    const captureCooldown = captureParams?.cooldown ?? greedyAbility?.greedyCaptureCooldown ?? 4;

    let bestCaptureTarget: UnitId | null = null;
    let bestCaptureDist = Infinity;
    // Find enemy units within range 3 (prioritize weaker, closer targets)
    for (const [, enemy] of current.units) {
      if (enemy.factionId === factionId || enemy.hp <= 0) continue;
      const dist = hexDistance(activeUnit.position, enemy.position);
      if (dist > 3) continue;
      // Prefer lower HP targets
      const currentBest = bestCaptureTarget ? current.units.get(bestCaptureTarget) : null;
      if (dist < bestCaptureDist || (dist === bestCaptureDist && enemy.hp < (currentBest?.hp ?? Infinity))) {
        bestCaptureDist = dist;
        bestCaptureTarget = enemy.id as UnitId;
      }
    }

    if (bestCaptureTarget) {
      const captureResult = attemptNonCombatCapture(
        current, unitId, bestCaptureTarget, registry, nonCombatChance, hpFraction, captureCooldown, current.rngState
      );
      if (captureResult.captured) {
        const capturedUnit = captureResult.state.units.get(bestCaptureTarget);
        const capturedProto = capturedUnit ? captureResult.state.prototypes.get(capturedUnit.prototypeId) : null;
        log(trace, `${faction.name} ${prototype.name} ENSLAVED ${capturedProto?.name ?? 'unit'} (non-combat capture)`);
        current = captureResult.state;
        current = buildFieldFortIfEligible(current, factionId, unitId, registry, fortsBuiltThisRound);
        current = applyHillDugInIfEligible(current, factionId, unitId);
        return setUnitActivated(current, unitId);
      } else {
        // Failed capture — spend the attack anyway
        const units = new Map(current.units);
        const failedUnit = current.units.get(unitId);
        if (failedUnit) {
          units.set(unitId, { ...failedUnit, attacksRemaining: 0 });
          current = { ...current, units };
        }
      }
    }
  }

  current = performStrategicMovement(current, unitId, registry, trace);

  const movedUnit = current.units.get(unitId);
  if (movedUnit) {
    if (movedUnit.attacksRemaining <= 0) {
      current = buildFieldFortIfEligible(current, factionId, unitId, registry, fortsBuiltThisRound);
      current = applyHillDugInIfEligible(current, factionId, unitId);
      return setUnitActivated(current, unitId);
    }
  }

  current = buildFieldFortIfEligible(current, factionId, unitId, registry, fortsBuiltThisRound);
  current = applyHillDugInIfEligible(current, factionId, unitId);

  return setUnitActivated(current, unitId);
}

export function runWarEcologySimulation(
  initialState: GameState,
  registry: RulesRegistry,
  maxTurns: number,
  trace?: SimulationTrace,
  difficulty?: DifficultyLevel,
): GameState {
  let current = { ...initialState };
  let roundsCompleted = 0;

  while (roundsCompleted < maxTurns && getAliveFactions(current).size > 1) {
    const roundStartVictory = getVictoryStatus(current);
    if (roundStartVictory.victoryType !== 'unresolved') {
      return current;
    }

    if (trace) {
      trace.currentRound = current.round;
    }

    current = resetAllUnitsForRound(current);
    recordSnapshot(current, trace, 'start');

    for (const factionId of current.factions.keys()) {
      if (!getAliveFactions(current).has(factionId)) {
        continue;
      }
      current = processFactionPhases(current, factionId, registry, trace, difficulty);
      const phaseVictory = getVictoryStatus(current);
      if (phaseVictory.victoryType !== 'unresolved') {
        maybeRecordEndSnapshot(current, trace);
        return current;
      }
    }

    if (getVictoryStatus(current).victoryType !== 'unresolved') {
      maybeRecordEndSnapshot(current, trace);
      break;
    }

    const activation = buildActivationQueue(current);
    const fortsBuiltThisRound = new Set<FactionId>();

    while (true) {
      const nextActivation = nextUnitActivation(current, activation);
      if (!nextActivation) {
        break;
      }

      current = activateUnit(
        current,
        nextActivation.unitId,
        registry,
        trace,
        fortsBuiltThisRound
      );

      if (getVictoryStatus(current).victoryType !== 'unresolved') {
        maybeRecordEndSnapshot(current, trace);
        return current;
      }
    }

    for (const factionId of current.factions.keys()) {
      current = resetCombatRecordStreaks(current, factionId);
      const we = current.warExhaustion.get(factionId);
      if (!we) {
        continue;
      }

      const decayedWE = applyDecay(we, {
        noLossTurns: we.turnsWithoutLoss,
        territoryClear: false,
      });
      const weMap = new Map(current.warExhaustion);
      weMap.set(factionId, decayedWE);
      current = { ...current, warExhaustion: weMap };
    }

    // Clear poison at friendly settlements (also reset poison stacks)
    for (const [, unit] of current.units) {
      if (unit.poisoned && occupiesFriendlySettlement(current, unit)) {
        const unitsMap = new Map(current.units);
        unitsMap.set(unit.id, { ...unit, poisoned: false, poisonStacks: 0 });
        current = { ...current, units: unitsMap };
      }
    }

    maybeRecordEndSnapshot(current, trace);

    current = {
      ...current,
      round: current.round + 1,
    };
    if (trace) {
      trace.currentRound = current.round;
    }
    roundsCompleted += 1;
  }

  return current;
}

export function summarizeFaction(state: GameState, factionId: FactionId): string {
  const faction = state.factions.get(factionId);
  if (!faction) return '';
  const livingUnits = faction.unitIds.filter((id) => state.units.has(id as never));
  const prototypeNames = faction.prototypeIds
    .map((id) => state.prototypes.get(id as never)?.name)
    .filter((name): name is string => Boolean(name));

  const economy = state.economy.get(factionId);
  const economyInfo = economy
    ? `prod=${economy.productionPool.toFixed(1)} supply=${economy.supplyIncome.toFixed(1)}/${economy.supplyDemand}`
    : '';

  const we = state.warExhaustion.get(factionId);
  const weInfo = we && we.exhaustionPoints > 0 ? `WE=${we.exhaustionPoints}` : '';

  const besiegedCities = getFactionCityIds(state, factionId).filter((id) => state.cities.get(id)?.besieged);
  const siegeInfo = besiegedCities.length > 0 ? `besieged=${besiegedCities.length}` : '';

  return [
    `${faction.name}`,
    `units=${livingUnits.length}`,
    `villages=${getVillageCount(state, factionId)}`,
    economyInfo,
    weInfo,
    siegeInfo,
    `battles=${livingUnits.reduce((sum, id) => sum + getBattleCount(state.units.get(id as never)!), 0)}`,
    `kills=${livingUnits.reduce((sum, id) => sum + getKillCount(state.units.get(id as never)!), 0)}`,
    `capabilities=${describeCapabilityLevels(faction)}`,
    `prototypes=${prototypeNames.join(', ')}`,
  ].filter(Boolean).join(' | ');
}
