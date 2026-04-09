import { createImprovementId } from '../core/ids.js';
import { getDirectionIndex, getHexesInRange, getNeighbors, hexDistance, hexToKey } from '../core/grid.js';
import type { RulesRegistry } from '../data/registry/types.js';
import { getRoleEffectiveness } from '../data/roleEffectiveness.js';
import { getWeaponEffectiveness } from '../data/weaponEffectiveness.js';
import type { GameState, Unit } from '../game/types.js';
import type { FactionId, HexCoord, UnitId } from '../types.js';
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
import {
  applyCombatAction,
  createCombatActionPreview,
  type CombatActionPreview,
} from './combatActionSystem.js';
import { resolveResearchDoctrine } from './capabilityDoctrine.js';
import { describeCapabilityLevels } from './capabilitySystem.js';
import {
  resolveCombat,
  getVeteranStatBonus,
  getVeteranDefenseBonus,
  getVeteranMoraleBonus,
} from './combatSystem.js';
import { getHexVisibility } from './fogSystem.js';
import { recordBattleFought, recordEnemyKilled, recordPromotion } from './historySystem.js';
import { findFleeHex } from './moraleSystem.js';
import { moveUnit, getValidMoves, canMoveTo } from './movementSystem.js';
import { getUnitAtHex } from './occupancySystem.js';
import {
  canBoardTransport,
  boardTransport,
  disembarkUnit,
  getEmbarkedUnits,
  getValidDisembarkHexes,
  isTransportUnit,
  isUnitEmbarked,
  updateEmbarkedPositions,
} from './transportSystem.js';
import { tryPromoteUnit } from './veterancySystem.js';
import { calculateFlankingBonus, isRearAttack } from './zocSystem.js';
import {
  applyKnockback,
  applyPoisonDoT,
  breakStealth,
  enterStealth,
  getBulwarkDefenseBonus,
  getTidalCoastDebuff,
} from './signatureAbilitySystem.js';
import { getWallDefenseBonus } from './siegeSystem.js';
import {
  getCombatAttackModifier,
  getCombatDefenseModifier,
  getDesertSwarmBonus,
  isUnitRiverStealthed,
} from './factionIdentitySystem.js';
import { applyCombatSynergies, type CombatContext } from './synergyEffects.js';
import type { ActiveSynergy, ActiveTripleStack } from './synergyEngine.js';
import {
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
import type { UnitStrategicIntent } from './factionStrategy.js';
import {
  calculateSynergyAttackBonus,
  calculateSynergyDefenseBonus,
  getSynergyEngine,
  log,
  recordAiIntent,
  recordCombatEvent,
  type SimulationTrace,
  type TraceAiIntentEvent,
  type TraceCombatEffect,
} from './warEcologySimulation.js';
import { attemptNonCombatCapture, getCaptureParams, hasCaptureAbility } from './captureSystem.js';

export type UnitActivationCombatMode = 'apply' | 'preview';

export interface UnitActivationOptions {
  trace?: SimulationTrace;
  fortsBuiltThisRound?: Set<FactionId>;
  combatMode?: UnitActivationCombatMode;
}

export interface UnitActivationResult {
  state: GameState;
  pendingCombat: CombatActionPreview | null;
}

function getTerrainAt(state: GameState, pos: HexCoord): string {
  return getAbilityTerrainAt(state, pos);
}

function canInflictPoison(state: GameState, unit: Unit): boolean {
  const prototype = state.prototypes.get(unit.prototypeId);
  return Boolean(prototype?.tags?.includes('poison'));
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

export function maybeExpirePreparedAbility(unit: Unit, round: number, state: GameState): Unit {
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

export function activateUnit(
  state: GameState,
  unitId: UnitId,
  registry: RulesRegistry,
  options: UnitActivationOptions = {},
): UnitActivationResult {
  const { trace, fortsBuiltThisRound, combatMode = 'apply' } = options;
  const unit = state.units.get(unitId);
  if (!unit || unit.hp <= 0 || !state.map) {
    return { state, pendingCombat: null };
  }

  const factionId = unit.factionId;
  const faction = state.factions.get(factionId);
  const prototype = state.prototypes.get(unit.prototypeId);
  if (!faction || !prototype) {
    return { state: setUnitActivated(state, unitId), pendingCombat: null };
  }

  let current: GameState = {
    ...state,
    activeFactionId: factionId,
    turnNumber: state.turnNumber + 1,
  };

  const map = current.map!;
  const actingUnit = current.units.get(unitId);
  if (!actingUnit || actingUnit.hp <= 0) {
    return { state: current, pendingCombat: null };
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
    return { state: setUnitActivated(current, unitId), pendingCombat: null };
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
        return { state: setUnitActivated(current, unitId), pendingCombat: null };
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
    return { state: current, pendingCombat: null };
  }

  if (enemy && activeUnit.attacksRemaining > 0) {
    const enemyPrototype = current.prototypes.get(enemy.prototypeId);
    if (!enemyPrototype) {
      return { state: setUnitActivated(current, unitId), pendingCombat: null };
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

    const combatPreview = createCombatActionPreview(
      current,
      activeUnit.id,
      enemy.id,
      result,
      {
        round: current.round,
        attackerFactionId: activeUnit.factionId,
        defenderFactionId: enemy.factionId,
        attackerPrototypeName: prototype.name,
        defenderPrototypeName: enemyPrototype.name,
        braceTriggered,
        attackerWasStealthed: attackerIsStealthed,
      },
    );
    if (!combatPreview) {
      return { state: setUnitActivated(current, unitId), pendingCombat: null };
    }
    if (combatMode === 'preview') {
      return { state: current, pendingCombat: combatPreview };
    }

    const appliedCombat = applyCombatAction(current, registry, combatPreview);
    current = appliedCombat.state;

    const writeUnit = (unit: Unit | undefined) => {
      if (!unit) {
        return;
      }
      const unitsMap = new Map(current.units);
      if (unit.hp <= 0) {
        unitsMap.delete(unit.id);
      } else {
        unitsMap.set(unit.id, unit);
      }
      current = { ...current, units: unitsMap };
    };

    let updatedAttacker = current.units.get(activeUnit.id);
    let updatedDefender = current.units.get(enemy.id);

    if (updatedAttacker) {
      updatedAttacker = recordBattleFought(
        updatedAttacker,
        enemy.id,
        result.defenderDestroyed,
        result.attackerDamage,
        result.defenderDamage,
      );
      if (result.defenderDestroyed) {
        updatedAttacker = recordEnemyKilled(updatedAttacker, enemy.id);
      }
      if (updatedAttacker.veteranLevel !== activeUnit.veteranLevel) {
        updatedAttacker = recordPromotion(updatedAttacker, activeUnit.veteranLevel, updatedAttacker.veteranLevel);
      }
      writeUnit(updatedAttacker);
    }

    updatedAttacker = current.units.get(activeUnit.id);
    updatedDefender = current.units.get(enemy.id);

    const captured = Boolean(
      result.defenderDestroyed
      && updatedDefender
      && updatedDefender.factionId === activeUnit.factionId,
    );
    const retreatCaptured = Boolean(
      !result.defenderDestroyed
      && result.defenderFled
      && updatedDefender
      && updatedDefender.factionId === activeUnit.factionId,
    );

    if (captured) {
      log(trace, `${faction.name} ${prototype.name} CAPTURED ${enemyPrototype.name}!`);
    }
    if (retreatCaptured) {
      log(trace, `${faction.name} ${prototype.name} captured retreating ${enemyPrototype.name}.`);
    }

    if (!result.defenderDestroyed && result.defenderDamage > 0 && canInflictPoison(current, activeUnit) && updatedDefender) {
      const extraStacks = attackerDoctrine.poisonPersistenceEnabled ? 1 : 0;
      updatedDefender = applyPoisonDoT(
        updatedDefender,
        attackerDoctrine.poisonStacksOnHit + extraStacks,
        attackerDoctrine.poisonDamagePerStack,
        3,
      );
      updatedDefender = { ...updatedDefender, poisonedBy: activeUnit.factionId } as Unit;
      writeUnit(updatedDefender);
      poisonApplied = true;
    }

    if (result.defenderDestroyed && attackerDoctrine.contaminateTerrainEnabled && canInflictPoison(current, activeUnit)) {
      const hexKey = hexToKey(enemy.position);
      const newContaminatedHexes = new Set(current.contaminatedHexes);
      newContaminatedHexes.add(hexKey);
      current = { ...current, contaminatedHexes: newContaminatedHexes };
      contaminatedHexApplied = true;
    }

    updatedAttacker = current.units.get(activeUnit.id);
    updatedDefender = current.units.get(enemy.id);

    if (updatedAttacker) {
      updatedAttacker = rotateUnitToward(updatedAttacker, enemy.position);
      writeUnit(updatedAttacker);
    }
    if (updatedDefender && !result.defenderDestroyed) {
      updatedDefender = rotateUnitToward(updatedDefender, updatedAttacker?.position ?? activeUnit.position);
      writeUnit(updatedDefender);
    }

    updatedAttacker = current.units.get(activeUnit.id);
    updatedDefender = current.units.get(enemy.id);

    if (defenderDoctrine.damageReflectionEnabled && result.defenderDamage > 0 && updatedAttacker) {
      reflectionDamageApplied = Math.max(1, Math.floor(result.defenderDamage * 0.25));
      updatedAttacker = {
        ...updatedAttacker,
        hp: Math.max(0, updatedAttacker.hp - reflectionDamageApplied),
      };
      writeUnit(updatedAttacker);
    }

    updatedAttacker = current.units.get(activeUnit.id);
    updatedDefender = current.units.get(enemy.id);

    if (
      totalKnockbackDistance > result.knockbackDistance
      && updatedAttacker
      && updatedDefender
      && !result.defenderDestroyed
      && !retreatCaptured
    ) {
      const extraKnockback = applyKnockback(
        current,
        updatedAttacker,
        updatedDefender,
        totalKnockbackDistance - result.knockbackDistance,
      );
      if (extraKnockback) {
        updatedDefender = { ...updatedDefender, position: extraKnockback };
        writeUnit(updatedDefender);
        log(trace, `${faction.name} ${prototype.name} knocked back ${enemyPrototype.name} to ${JSON.stringify(extraKnockback)}`);
      }
    }

    updatedAttacker = current.units.get(activeUnit.id);
    updatedDefender = current.units.get(enemy.id);

    if (stampedeTriggered && updatedAttacker) {
      updatedAttacker = {
        ...updatedAttacker,
        movesRemaining: updatedAttacker.movesRemaining + 1,
      };
      writeUnit(updatedAttacker);
      log(trace, `${faction.name} ${prototype.name} stampede grants +1 extra move`);
    }

    updatedAttacker = current.units.get(activeUnit.id);
    updatedDefender = current.units.get(enemy.id);

    if (attackerSynergyResult.knockbackDistance > 0 && updatedAttacker && updatedDefender && !result.defenderDestroyed && !retreatCaptured) {
      const extendedKnockback = applyKnockback(current, updatedAttacker, updatedDefender, attackerSynergyResult.knockbackDistance);
      if (extendedKnockback) {
        updatedDefender = { ...updatedDefender, position: extendedKnockback };
        writeUnit(updatedDefender);
        log(trace, `${faction.name} ${prototype.name} synergy knockback pushed ${enemyPrototype.name}`);
        totalKnockbackDistance += attackerSynergyResult.knockbackDistance;
      }
    }

    updatedAttacker = current.units.get(activeUnit.id);
    updatedDefender = current.units.get(enemy.id);

    if (attackerSynergyResult.poisonTrapPositions.length > 0 && updatedAttacker) {
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

    hitAndRunTriggered = appliedCombat.feedback.hitAndRunRetreat !== null;

    updatedAttacker = current.units.get(activeUnit.id);
    if (
      updatedAttacker
      && (
        attackerSynergyResult.additionalEffects.includes('stealth_recharge')
        || (attackerDoctrine.stealthRechargeEnabled && prototype.tags?.includes('stealth'))
      )
      && !hasAdjacentEnemy(current, updatedAttacker)
    ) {
      updatedAttacker = { ...updatedAttacker, isStealthed: true };
      writeUnit(updatedAttacker);
      log(trace, `${faction.name} ${prototype.name} re-entered stealth`);
      reStealthTriggered = true;
    }

    updatedAttacker = current.units.get(activeUnit.id);
    if (hitAndRunTriggered && attackerSynergyResult.healOnRetreatAmount > 0 && updatedAttacker) {
      updatedAttacker = {
        ...updatedAttacker,
        hp: Math.min(updatedAttacker.maxHp, updatedAttacker.hp + attackerSynergyResult.healOnRetreatAmount),
      };
      writeUnit(updatedAttacker);
      log(trace, `${faction.name} ${prototype.name} healed ${attackerSynergyResult.healOnRetreatAmount} HP on retreat`);
      healOnRetreatApplied = attackerSynergyResult.healOnRetreatAmount;
    }

    updatedAttacker = current.units.get(activeUnit.id);
    const combatHealMatch = attackerSynergyResult.additionalEffects.find((effectCode) => effectCode.includes('combat_healing'));
    if (combatHealMatch && updatedAttacker) {
      const healMatch = combatHealMatch.match(/combat_healing_(\d+)%/);
      if (healMatch) {
        const healPercent = parseInt(healMatch[1], 10) / 100;
        const healAmount = Math.floor(result.defenderDamage * healPercent);
        if (healAmount > 0) {
          updatedAttacker = {
            ...updatedAttacker,
            hp: Math.min(updatedAttacker.maxHp, updatedAttacker.hp + healAmount),
          };
          writeUnit(updatedAttacker);
          log(trace, `${faction.name} ${prototype.name} healed ${healAmount} HP from combat`);
          combatHealingApplied = healAmount;
        }
      }
    }

    updatedDefender = current.units.get(enemy.id);
    if (attackerSynergyResult.sandstormDamage > 0 && updatedDefender && !result.defenderDestroyed && !retreatCaptured) {
      const sandstormUnits = new Map(current.units);
      const defenderNeighbors = getNeighbors(updatedDefender.position);
      for (const adjHex of defenderNeighbors) {
        const adjUnitId = getUnitAtHex(current, adjHex);
        if (!adjUnitId) {
          continue;
        }
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
      current = { ...current, units: sandstormUnits };
    }

    updatedDefender = current.units.get(enemy.id);
    if (attackerSynergyResult.contaminateActive && updatedDefender && !result.defenderDestroyed && !retreatCaptured) {
      const newContaminated = new Set(current.contaminatedHexes);
      newContaminated.add(hexToKey(updatedDefender.position));
      current = { ...current, contaminatedHexes: newContaminated };
      log(trace, `${faction.name} ${prototype.name} contaminated ${JSON.stringify(updatedDefender.position)}`);
      contaminatedHexApplied = true;
    }

    updatedDefender = current.units.get(enemy.id);
    if (attackerSynergyResult.frostbiteColdDoT > 0 && updatedDefender && !result.defenderDestroyed && !retreatCaptured) {
      updatedDefender = {
        ...updatedDefender,
        frozen: true,
        frostbiteStacks: attackerSynergyResult.frostbiteColdDoT,
        frostbiteDoTDuration: 3,
        movesRemaining: Math.max(0, updatedDefender.movesRemaining - attackerSynergyResult.frostbiteSlow),
      };
      writeUnit(updatedDefender);
      log(trace, `${faction.name} ${prototype.name} applied frostbite (${attackerSynergyResult.frostbiteColdDoT} DoT, ${attackerSynergyResult.frostbiteSlow} slow) to ${enemyPrototype.name}`);
      frostbiteApplied = true;
    }

    updatedAttacker = current.units.get(activeUnit.id) ?? { ...activeUnit, hp: 0, morale: 0, routed: true };
    updatedDefender = current.units.get(enemy.id) ?? { ...enemy, hp: 0, morale: 0, routed: true };

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
    return { state: current, pendingCombat: null };
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
    return { state: current, pendingCombat: null };
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
        return { state: setUnitActivated(current, unitId), pendingCombat: null };
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
      return { state: setUnitActivated(current, unitId), pendingCombat: null };
    }
  }

  current = buildFieldFortIfEligible(current, factionId, unitId, registry, fortsBuiltThisRound);
  current = applyHillDugInIfEligible(current, factionId, unitId);

  return { state: setUnitActivated(current, unitId), pendingCombat: null };
}

export function activateAiUnit(
  state: GameState,
  unitId: UnitId,
  registry: RulesRegistry,
  options: UnitActivationOptions = {},
): UnitActivationResult {
  return activateUnit(state, unitId, registry, options);
}

