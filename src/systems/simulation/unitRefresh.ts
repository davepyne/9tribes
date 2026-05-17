import type { GameState } from '../../game/types.js';
import type { FactionId, UnitId } from '../../types.js';
import type { RulesRegistry } from '../../data/registry/types.js';
import type { SimulationTrace } from './traceTypes.js';
import { log } from './traceRecorder.js';
import { getTerrainAt, getHealRate, occupiesFriendlySettlement } from './environmentalEffects.js';
import { getNeighbors, hexDistance } from '../../core/grid.js';
import { resolveResearchDoctrine, prototypeHasComponent } from '../capabilityDoctrine.js';
import { recoverMorale, checkRally } from '../moraleSystem.js';
import { tickStealthCooldown, enterStealth, getNatureHealingAura } from '../signatureAbilitySystem.js';
import { maybeExpirePreparedAbility } from '../unitActivationSystem.js';
import { resolveEffectiveSynergies } from '../synergyRuntime.js';
import { applyHealingSynergies, type HealingContext } from '../synergyEffects.js';
import { getUnitAtHex } from '../occupancySystem.js';
import { isWetlandTerrain } from '../terrainUtils.js';
import { isPassiveWetlandStealth } from '../factionIdentitySystem.js';

export function refreshFactionUnits(
  state: GameState,
  factionId: FactionId,
  registry: RulesRegistry,
  trace?: SimulationTrace,
): GameState {
  const refreshedFaction = state.factions.get(factionId);
  if (!refreshedFaction) return state;

  let current = state;
  const unitsMap = new Map(current.units);

  for (const unitIdStr of refreshedFaction.unitIds) {
    const unit = unitsMap.get(unitIdStr as UnitId);
    if (!unit || unit.hp <= 0) continue;

    const terrainId = getTerrainAt(current, unit.position);
    let healRate = getHealRate(unit, current, factionId, true);

    const healPrototype = current.prototypes.get(unit.prototypeId);
    const healTags = healPrototype?.tags ?? [];
    const unitSynergies = resolveEffectiveSynergies(refreshedFaction, healTags);

    const healingContext: HealingContext = {
      unitId: unitIdStr as string,
      unitTags: healTags,
      baseHeal: healRate,
      position: unit.position,
      adjacentAllies: [],
      isStealthed: unit.isStealthed,
    };

    const synergyHealRate = applyHealingSynergies(healingContext, unitSynergies);

    if (healTags.includes('druid') || healTags.includes('healing')) {
      const aura = getNatureHealingAura();
      healRate = Math.max(healRate, synergyHealRate);
    } else {
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
              const neighborSynergies = resolveEffectiveSynergies(refreshedFaction, neighborTags);
              const neighborHealContext: HealingContext = {
                unitId: neighborUnitId,
                unitTags: neighborTags,
                baseHeal: aura.allyHeal,
                position: neighborUnit.position,
                adjacentAllies: [],
                isStealthed: neighborUnit.isStealthed,
              };
              const extendedHeal = applyHealingSynergies(neighborHealContext, neighborSynergies);
              healRate = Math.max(healRate, extendedHeal);
              break;
            }
          }
        }
      }
    }

    const healNeighbors = getNeighbors(unit.position);
    for (const hex of healNeighbors) {
      const neighborUnitId = getUnitAtHex(current, hex);
      if (neighborUnitId) {
        const neighborUnit = current.units.get(neighborUnitId);
        if (neighborUnit && neighborUnit.factionId !== factionId && neighborUnit.hp > 0) {
          const neighborProto = current.prototypes.get(neighborUnit.prototypeId);
          const neighborTags = neighborProto?.tags ?? [];
          const enemyFaction = current.factions.get(neighborUnit.factionId);
          const neighborSynergies = resolveEffectiveSynergies(enemyFaction, neighborTags);
          for (const syn of neighborSynergies) {
            const witheringMod = syn.effects.find(
              (e): e is Extract<typeof e, { kind: 'statMod' }> =>
                e.kind === 'statMod' && e.stat === 'witheringReduction',
            );
            if (witheringMod) {
              healRate = Math.floor(healRate * (1 - witheringMod.value));
              break;
            }
          }
        }
      }
    }

    const safeInSettlement = occupiesFriendlySettlement(current, unit);
    const research = current.research.get(factionId);
    const doctrine = resolveResearchDoctrine(research, refreshedFaction);
    const prototype = current.prototypes.get(unit.prototypeId);
    const currentTerrainId = getTerrainAt(current, unit.position);
    const coldProvisionMoveBonus =
      prototype &&
      prototypeHasComponent(prototype, 'cold_provisions') &&
      (currentTerrainId === 'tundra' || currentTerrainId === 'hill')
        ? 1
        : 0;
    if (doctrine.natureHealingRegenBonus > 0) {
      if (doctrine.forestRegenBonus > 0 && (terrainId === 'forest' || terrainId === 'jungle')) {
        healRate += doctrine.forestRegenBonus;
      } else {
        healRate += doctrine.natureHealingRegenBonus;
      }
    }

    const poisonMovePenalty = unit.poisoned ? doctrine.poisonMovePenalty : 0;
    let tidalCleanseHeal = 0;
    let bloomPulseHeal = 0;
    let bloomPulseSelfHeal = 0;
    let bloomPulseAuraRadius = 0;
    let bloomPulseMovementBonus = 0;
    let slaveEconomyHeal = 0;
    for (const syn of unitSynergies) {
      for (const eff of syn.effects) {
        if (eff.kind === 'statMod') {
          const sm = eff as Extract<typeof eff, { kind: 'statMod' }>;
          if (sm.stat === 'tidalCleanseHealPerTurn') tidalCleanseHeal = Math.max(tidalCleanseHeal, sm.value);
          if (sm.stat === 'bloomPulseHeal') bloomPulseHeal = Math.max(bloomPulseHeal, sm.value);
          if (sm.stat === 'bloomPulseSelfHeal') bloomPulseSelfHeal = Math.max(bloomPulseSelfHeal, sm.value);
          if (sm.stat === 'bloomPulseAuraRadius') bloomPulseAuraRadius = Math.max(bloomPulseAuraRadius, sm.value);
          if (sm.stat === 'bloomPulseMovementBonus') bloomPulseMovementBonus = Math.max(bloomPulseMovementBonus, sm.value);
          if (sm.stat === 'slaveEconomyHealPerTurn') slaveEconomyHeal = Math.max(slaveEconomyHeal, sm.value);
        }
      }
    }

    if (tidalCleanseHeal > 0 && (healTags.includes('healing') || healTags.includes('druid'))) {
      healRate += tidalCleanseHeal;
    }
    if (bloomPulseHeal > 0 && (healTags.includes('healing') || healTags.includes('druid'))) {
      healRate += bloomPulseSelfHeal;
    }
    if (slaveEconomyHeal > 0 && unit.slaveStatFraction) {
      healRate += slaveEconomyHeal;
    }

    const staggerPenalty = unit.nextTurnMovePenalty ?? 0;
    const harshTerrainBonus = doctrine.heatResistanceEnabled && (currentTerrainId === 'desert' || currentTerrainId === 'tundra') ? 1 : 0;
    const bloodtrailBonus = doctrine.bloodtrailMomentumEnabled && (unit.woundsReceivedThisTurn ?? 0) > 0
      ? unit.woundsReceivedThisTurn!
      : 0;
    const refreshedMoves = Math.min(
      unit.maxMoves + 1 + bloodtrailBonus,
      Math.max(0, unit.maxMoves + coldProvisionMoveBonus + harshTerrainBonus + bloodtrailBonus + bloomPulseMovementBonus - poisonMovePenalty - staggerPenalty),
      unit.maxMoves + 3,
    );
    const tidalCleanseActive = tidalCleanseHeal > 0 && (healTags.includes('healing') || healTags.includes('druid'));
    const refreshedUnit = {
      ...unit,
      movesRemaining: refreshedMoves,
      attacksRemaining: 1,
      morale: recoverMorale(unit),
      hp: Math.min(unit.maxHp, unit.hp + healRate),
      poisoned: safeInSettlement || tidalCleanseActive ? false : unit.poisoned,
      poisonStacks: safeInSettlement || tidalCleanseActive ? 0 : unit.poisonStacks,
      poisonTurnsRemaining: safeInSettlement || tidalCleanseActive ? 0 : unit.poisonTurnsRemaining,
      stunDuration: tidalCleanseActive ? 0 : unit.stunDuration,
      enteredZoCThisActivation: false,
      nextTurnMovePenalty: undefined,
      attackedTargetsThisTurn: [],
      lastStandUsedThisTurn: undefined,
      killChainCountThisTurn: undefined,
      woundsReceivedThisTurn: undefined,
    };

    let stealthUpdatedUnit = tickStealthCooldown(refreshedUnit);
    if (!stealthUpdatedUnit.isStealthed) {
      const protoTags = current.prototypes.get(unit.prototypeId)?.tags ?? [];
      stealthUpdatedUnit = enterStealth(stealthUpdatedUnit, protoTags);
    }

    if (!stealthUpdatedUnit.isStealthed && (doctrine.wetlandStealthEnabled || isPassiveWetlandStealth(refreshedFaction))) {
      const unitTerrain = getTerrainAt(current, unit.position);
      if (isWetlandTerrain(unitTerrain)) {
        stealthUpdatedUnit = { ...stealthUpdatedUnit, isStealthed: true };
      }
    }

    const updatedUnit = maybeExpirePreparedAbility(stealthUpdatedUnit, current.round, current);

    checkRally(updatedUnit);

    unitsMap.set(unitIdStr as UnitId, updatedUnit);
  }
  current = { ...current, units: unitsMap };

  // Bloom aura pass
  const bloomAuraUnits = new Map(current.units);
  for (const unitIdStr of refreshedFaction.unitIds) {
    const bloomUnit = bloomAuraUnits.get(unitIdStr as UnitId);
    if (!bloomUnit || bloomUnit.hp <= 0) continue;
    const bloomProto = current.prototypes.get(bloomUnit.prototypeId);
    const bloomTags = bloomProto?.tags ?? [];
    if (!(bloomTags.includes('healing') || bloomTags.includes('druid'))) continue;
    const bloomSynergies = resolveEffectiveSynergies(refreshedFaction, bloomTags);
    let auraHeal = 0;
    let auraRadius = 0;
    for (const syn of bloomSynergies) {
      for (const eff of syn.effects) {
        if (eff.kind === 'statMod') {
          const sm = eff as Extract<typeof eff, { kind: 'statMod' }>;
          if (sm.stat === 'bloomPulseHeal') auraHeal = Math.max(auraHeal, sm.value);
          if (sm.stat === 'bloomPulseAuraRadius') auraRadius = Math.max(auraRadius, sm.value);
        }
      }
    }
    if (auraHeal > 0 && auraRadius > 0) {
      for (const [uid, ally] of bloomAuraUnits) {
        if (ally.factionId !== factionId || ally.hp <= 0 || ally.id === bloomUnit.id) continue;
        if (hexDistance(bloomUnit.position, ally.position) <= auraRadius) {
          bloomAuraUnits.set(uid, {
            ...ally,
            hp: Math.min(ally.maxHp, ally.hp + auraHeal),
          });
        }
      }
    }
  }
  current = { ...current, units: bloomAuraUnits };

  // Slave economy resource bonus pass
  for (const unitIdStr of refreshedFaction.unitIds) {
    const slaveUnit = current.units.get(unitIdStr as UnitId);
    if (!slaveUnit || slaveUnit.hp <= 0 || !slaveUnit.slaveStatFraction) continue;
    const slaveProto = current.prototypes.get(slaveUnit.prototypeId);
    const slaveTags = slaveProto?.tags ?? [];
    const slaveSynergies = resolveEffectiveSynergies(refreshedFaction, slaveTags);
    for (const syn of slaveSynergies) {
      for (const eff of syn.effects) {
        if (eff.kind === 'statMod') {
          const sm = eff as Extract<typeof eff, { kind: 'statMod' }>;
          if (sm.stat === 'slaveEconomyResourceBonus' && sm.value > 0) {
            const economy = current.economy.get(factionId);
            if (economy) {
              const updatedEconomy = {
                ...economy,
                productionPool: economy.productionPool + sm.value,
              };
              const economyMap = new Map(current.economy);
              economyMap.set(factionId, updatedEconomy);
              current = { ...current, economy: economyMap };
            }
          }
        }
      }
    }
    break;
  }

  return current;
}
