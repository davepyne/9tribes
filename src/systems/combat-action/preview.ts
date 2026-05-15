import { getNeighbors, hexDistance, hexLineAwayFrom, hexToKey } from '../../core/grid.js';
import type { RulesRegistry } from '../../data/registry/types.js';
import type { Unit } from '../../features/units/types.js';
import type { GameState, UnitId } from '../../game/types.js';
import {
  getCombatAttackModifier,
  getCombatDefenseModifier,
  getDesertSwarmBonus,
  isUnitRiverStealthed,
} from '../factionIdentitySystem.js';
import {
  resolveCombat,
  type CombatResult,
} from '../combatSystem.js';
import { resolveCapabilityDoctrine } from '../capabilityDoctrine.js';
import { canUseCharge } from '../abilitySystem.js';
import { getBulwarkDefenseBonus, getTidalCoastDebuff } from '../signatureAbilitySystem.js';
import { calculateFlankingBonus, isRearAttack } from '../zocSystem.js';
import { getUnitAtHex } from '../occupancySystem.js';
import { getWallDefenseBonus } from '../siegeSystem.js';
import { getPrototype } from '../../game/stateAccess.js';
import {
  applyCombatSynergies,
  type CombatContext,
} from '../synergyEffects.js';
import { isUnitEffectivelyStealthed } from '../fogSystem.js';
import {
  calculateSynergyAttackBonus,
  calculateSynergyDefenseBonus,
  resolveEffectiveSynergies,
} from '../synergyRuntime.js';
import { isCoverTerrain, isWaterTerrain } from '../terrainUtils.js';
import { getZoneEffectsAtHex } from '../zoneEffectSystem.js';

import type {
  CombatActionEffect,
  CombatActionPreview,
  CombatActionPreviewDetails,
} from './types.js';
import { formatPercent, humanizeCombatEffect, pushCombatEffect } from './labeling.js';
import { getImprovementBonus, canAttackTarget, createCombatActionPreviewRecord } from './helpers.js';

export function previewCombatAction(
  state: GameState,
  registry: RulesRegistry,
  attackerId: UnitId,
  defenderId: UnitId,
): CombatActionPreview | null {
  const attacker = state.units.get(attackerId);
  const defender = state.units.get(defenderId);
  if (!attacker || !defender || attacker.hp <= 0 || defender.hp <= 0 || !state.map) {
    return null;
  }

  if (attacker.factionId !== state.activeFactionId || defender.factionId === attacker.factionId || attacker.attacksRemaining <= 0) {
    return null;
  }

  if (!canAttackTarget(state, registry, attacker, defender)) {
    return null;
  }

  const attackerPrototype = getPrototype(state, attacker.prototypeId);
  const defenderPrototype = getPrototype(state, defender.prototypeId);
  if (!attackerPrototype || !defenderPrototype) {
    return null;
  }

  const attackerTerrainId = state.map.tiles.get(hexToKey(attacker.position))?.terrain ?? 'plains';
  const defenderTerrainId = state.map.tiles.get(hexToKey(defender.position))?.terrain ?? 'plains';
  const attackerTerrain = registry.getTerrain(attackerTerrainId);
  const defenderTerrain = registry.getTerrain(defenderTerrainId);
  const attackerFaction = state.factions.get(attacker.factionId);
  const defenderFaction = state.factions.get(defender.factionId);
  const attackerDoctrine = attackerFaction
    ? resolveCapabilityDoctrine(state.research.get(attacker.factionId), attackerFaction)
    : undefined;
  const defenderDoctrine = defenderFaction
    ? resolveCapabilityDoctrine(state.research.get(defender.factionId), defenderFaction)
    : undefined;
  const canChargeAttack =
    (attackerPrototype.derivedStats.range ?? 1) <= 1
    && (canUseCharge(attackerPrototype) || attackerDoctrine?.chargeTranscendenceEnabled === true);
  const isChargeAttack = canChargeAttack
    && (
      attackerDoctrine?.chargeTranscendenceEnabled === true
      || attackerDoctrine?.forcedMarchEnabled === true
      || attacker.movesRemaining < attacker.maxMoves
    );
  const attackerOnFort = getImprovementBonus(state, attacker.position) > 0;
  const defenderOnFort = getImprovementBonus(state, defender.position) > 0;
  const flankingBonus = defenderOnFort ? 0 : calculateFlankingBonus(attacker, defender, state);
  const rearAttackBonus = (defenderOnFort ? false : isRearAttack(attacker, defender)) ? 0.2 : 0;
  const braceTriggered = defender.preparedAbility === 'brace'
    && (attackerPrototype.derivedStats.role === 'mounted' || (attackerPrototype.derivedStats.range ?? 1) <= 1);
  const ambushAttackBonus = attacker.preparedAbility === 'ambush' ? 0.15 : 0;
  const attackerWasStealthed = isUnitEffectivelyStealthed(state, attacker);
  let chargeAttackBonus = isChargeAttack && !braceTriggered ? 0.15 : 0;
  let sneakAttackTriggered = false;
  let stampedeTriggered = false;
  if (
    isChargeAttack
    && !braceTriggered
    && (attackerPrototype.tags?.includes('elephant') || attackerPrototype.tags?.includes('chariot'))
  ) {
    chargeAttackBonus += registry.getSignatureAbility('savannah_lions')?.stampedeBonus ?? 0.3;
    stampedeTriggered = true;
  }
  const braceDefenseBonus = defender.preparedAbility === 'brace'
    ? (defenderDoctrine?.fortressTranscendenceEnabled ? 0.4 : 0.2)
    : 0;
  let situationalAttackModifier = getCombatAttackModifier(attackerFaction, attackerTerrain, defenderTerrain);
  let situationalDefenseModifier = getCombatDefenseModifier(defenderFaction, defenderTerrain);

  if (isUnitRiverStealthed(attackerFaction, attackerTerrainId)) {
    situationalAttackModifier += registry.getSignatureAbility('river_people')?.sneakAttackBonus ?? 0;
    sneakAttackTriggered = true;
  }

  // Ancient Alligator: apex ambush predator — bigger bonus when attacking from stealth
  const summonSneakAbility = registry.getSignatureAbility('river_people');
  if (
    summonSneakAbility?.summonSneakAttackBonus
    && attackerPrototype.chassisId === 'alligator_frame'
    && attackerWasStealthed
  ) {
    situationalAttackModifier += summonSneakAbility.summonSneakAttackBonus;
    sneakAttackTriggered = true;
  }

  const desertAbility = registry.getSignatureAbility('desert_nomads');
  const desertSwarmConfig = desertAbility
    ? {
        threshold: desertAbility.desertSwarmThreshold ?? 3,
        attackBonus: desertAbility.desertSwarmAttackBonus ?? 1,
        defenseMultiplier: desertAbility.desertSwarmDefenseMultiplier ?? 1.1,
      }
    : undefined;
  const attackerSwarm = getDesertSwarmBonus(attackerFaction, attacker, state, desertSwarmConfig);
  if (attackerSwarm.attackBonus > 0) {
    situationalAttackModifier += attackerSwarm.attackBonus;
  }
  const defenderSwarm = getDesertSwarmBonus(defenderFaction, defender, state, desertSwarmConfig);
  if (defenderSwarm.defenseMultiplier > 1) {
    situationalDefenseModifier += defenderSwarm.defenseMultiplier - 1;
  }

  let tidalAssaultTriggered = false;
  if (attackerPrototype.tags?.includes('naval') && (attackerPrototype.tags?.includes('shock') || attackerPrototype.tags?.includes('ranged'))) {
    const isWaterToLand = ['coast', 'river'].includes(attackerTerrainId) && !['coast', 'river'].includes(defenderTerrainId);
    if (isWaterToLand) {
      situationalAttackModifier += registry.getSignatureAbility('coral_people')?.tidalAssaultBonus ?? 0.2;
      situationalDefenseModifier -= getTidalCoastDebuff();
      tidalAssaultTriggered = true;
    }
  }

  const attackerIsCamel = attackerPrototype.tags?.includes('camel') ?? false;
  const defenderIsCavalry = defenderPrototype.tags?.includes('cavalry') ?? false;
  if (attackerIsCamel && defenderIsCavalry) {
    situationalAttackModifier += 0.3;
  }
  if (defenderIsCavalry && !attackerIsCamel && (defenderPrototype.tags?.includes('camel') ?? false)) {
    situationalAttackModifier -= 0.2;
  }

  let bulwarkTriggered = false;
  for (const hex of getNeighbors(defender.position)) {
    const neighborUnitId = getUnitAtHex(state, hex);
    if (!neighborUnitId) {
      continue;
    }
    const neighborUnit = state.units.get(neighborUnitId);
    if (!neighborUnit || neighborUnit.factionId !== defender.factionId || neighborUnit.hp <= 0) {
      continue;
    }
    const neighborPrototype = state.prototypes.get(neighborUnit.prototypeId);
    if (neighborPrototype?.tags?.includes('fortress')) {
      situationalDefenseModifier += getBulwarkDefenseBonus(defender, state, registry);
      bulwarkTriggered = true;
      break;
    }
  }

  let fortifiedVolleyTriggered = false;
  let fortifiedCoverTriggered = false;
  const attackerIsRanged = attackerPrototype.derivedStats.role === 'ranged' || (attackerPrototype.derivedStats.range ?? 1) > 1;
  if (attackerIsRanged && attackerOnFort) {
    const attackerIsFortress = attackerPrototype.tags?.includes('fortress') ?? false;
    const attackerIsSiege = attackerPrototype.tags?.includes('siege') ?? false;
    const volleyBonus = attackerIsSiege ? 0.4 : attackerIsFortress ? 0.3 : 0.15;
    situationalAttackModifier += volleyBonus;
    fortifiedVolleyTriggered = true;
  }
  const defenderIsRanged = defenderPrototype.derivedStats.role === 'ranged' || (defenderPrototype.derivedStats.range ?? 1) > 1;
  if (defenderIsRanged && defenderOnFort) {
    const defenderIsFortress = defenderPrototype.tags?.includes('fortress') ?? false;
    situationalDefenseModifier += defenderIsFortress ? 0.3 : 0.15;
    fortifiedCoverTriggered = true;
  }

  const defenderOnCity = Array.from(state.cities.values()).some(
    (city) => city.position.q === defender.position.q && city.position.r === defender.position.r,
  );
  if ((attackerPrototype.tags?.includes('siege') ?? false) && defenderOnCity) {
    situationalAttackModifier += 0.25;
  }

  const retaliationDamageMultiplier = braceTriggered && isChargeAttack ? 1.1 : 1;

  // Hill engineering dig-in: each stack = +5% defense, cap 3 stacks = +15%
  // Backward compat: hillDugIn boolean treated as 1 stack
  const defenderDigInStacks = defender.digInStacks ?? (defender.hillDugIn ? 1 : 0);
  const digInDefenseBonus = Math.min(defenderDigInStacks, 3) * 0.05;
  if (digInDefenseBonus > 0) {
    situationalDefenseModifier += digInDefenseBonus;
  }
  if (attackerDoctrine?.greedyCaptureEnabled && defender.hp < defender.maxHp * 0.5) {
    situationalAttackModifier += 0.15;
  }
  if (attackerDoctrine?.antiFortificationEnabled && (defender.preparedAbility === 'brace' || defenderOnFort)) {
    situationalAttackModifier += 0.2;
  }
  if (attackerDoctrine?.damageBonusVsElevationEnabled && (defenderTerrainId === 'hill' || defenderTerrainId === 'mountain')) {
    situationalAttackModifier += 0.2;
  }
  if (attackerDoctrine?.chargeRoutedBonusEnabled && isChargeAttack && defender.routed) {
    situationalAttackModifier += 0.5;
  }
  let skirmishStepTriggered = false;
  if (attackerDoctrine?.skirmishStepEnabled && attacker.movesRemaining < attacker.maxMoves) {
    situationalAttackModifier += 0.1;
    skirmishStepTriggered = true;
  }
  let chargeMomentumTriggered = false;
  if (attackerFaction?.identityProfile.passiveTrait === 'charge_momentum') {
    const hexesMoved = attacker.maxMoves - attacker.movesRemaining;
    if (hexesMoved >= 2) {
      situationalAttackModifier += 0.15;
      chargeMomentumTriggered = true;
    }
  }
  // Charge T3 native — chain amplification: +10% damage per friendly unit in charge line
  let chargeChainBonusAmount = 0;
  if (isChargeAttack && attackerDoctrine?.chargeChainEnabled) {
    const hexesMoved = attacker.maxMoves - attacker.movesRemaining;
    if (hexesMoved > 0) {
      const chargePath = hexLineAwayFrom(attacker.position, defender.position, hexesMoved);
      let chainAllies = 0;
      for (const pathHex of chargePath) {
        const pathUnitId = getUnitAtHex(state, pathHex);
        if (!pathUnitId || pathUnitId === attackerId) continue;
        const pathUnit = state.units.get(pathUnitId);
        if (pathUnit && pathUnit.factionId === attacker.factionId && pathUnit.hp > 0) {
          chainAllies++;
        }
      }
      chainAllies = Math.min(chainAllies, 5);
      chargeChainBonusAmount = chainAllies * 0.1;
      situationalAttackModifier += chargeChainBonusAmount;
    }
  }
  // Charge T1 first-attack bonus: +20% on first attack of combat (foreign) or per-target (native)
  let firstAttackTriggered = false;
  if (attackerDoctrine?.forcedMarchEnabled && isChargeAttack) {
    const alreadyAttacked = attacker.attackedTargetsThisTurn ?? [];
    const isFreshTarget = !alreadyAttacked.includes(defenderId);
    const isFirstAttack = alreadyAttacked.length === 0;
    if (attackerDoctrine.firstAttackPerTargetEnabled ? isFreshTarget : isFirstAttack) {
      situationalAttackModifier += 0.2;
      firstAttackTriggered = true;
    }
  }
  if (defenderDoctrine?.shieldWallEnabled) {
    const defenderIsInfantry = defenderPrototype.derivedStats.role === 'melee'
      && !(defenderPrototype.tags?.includes('cavalry') || defenderPrototype.tags?.includes('elephant'));
    if (attackerIsRanged && defenderIsInfantry) {
      const supportRadius = defenderDoctrine.fortressTranscendenceEnabled ? 2 : 1;
      let adjacentAllyCount = 0;
      for (const neighbor of state.units.values()) {
        if (neighbor.id !== defender.id
          && neighbor.factionId === defender.factionId
          && neighbor.hp > 0
          && hexDistance(neighbor.position, defender.position) <= supportRadius) {
          adjacentAllyCount++;
        }
      }
      if (adjacentAllyCount > 0) {
        const shieldwallBonus = adjacentAllyCount >= 2 ? 0.25 : 0.15;
        situationalDefenseModifier += defenderDoctrine.fortressAuraUpgradeEnabled ? 0.25 : shieldwallBonus;
      }
    }
  }
  if (
    defenderDoctrine?.canopyCoverEnabled
    && defenderPrototype.derivedStats.role === 'ranged'
    && (defenderTerrain?.id === 'forest' || defenderTerrain?.id === 'jungle')
  ) {
    situationalDefenseModifier += 0.3;
  }
  if (defenderDoctrine?.roughTerrainDefenseEnabled && isCoverTerrain(defenderTerrain?.id)) {
    situationalDefenseModifier += 0.2;
  }
  if (defenderDoctrine?.undyingEnabled && defender.hp < defender.maxHp * 0.2) {
    situationalDefenseModifier += 0.5;
  }
  let coldHardenedTriggered = false;
  if (defenderFaction?.identityProfile.passiveTrait === 'cold_hardened_growth') {
    situationalDefenseModifier += 0.1;
    coldHardenedTriggered = true;
  }

  const forestFirstStrike = attackerDoctrine?.forestAmbushEnabled === true && attackerTerrain?.id === 'forest';

  const resolveSynergies = (unit: Unit, prototype: typeof attackerPrototype, faction: typeof attackerFaction, enemyUnit: Unit, enemyPrototype: typeof defenderPrototype) => {
    const synergies = resolveEffectiveSynergies(faction, prototype.tags ?? []);
    const triple = faction?.activeTripleStack ?? null;

    const context: CombatContext = {
      attackerId: unit.id,
      defenderId: enemyUnit.id,
      attackerTags: prototype.tags ?? [],
      defenderTags: enemyPrototype.tags ?? [],
      attackerHp: unit.hp,
      defenderHp: enemyUnit.hp,
      terrain: state.map?.tiles.get(hexToKey(unit.position))?.terrain ?? 'plains',
      isCharge: unit.id === attacker.id ? isChargeAttack : false,
      isStealthAttack: unit.id === attacker.id ? attackerWasStealthed : isUnitEffectivelyStealthed(state, unit),
      isRetreat: false,
      isStealthed: isUnitEffectivelyStealthed(state, unit),
      position: { x: unit.position.q, y: unit.position.r },
      attackerPosition: { x: unit.position.q, y: unit.position.r },
      defenderPosition: { x: enemyUnit.position.q, y: enemyUnit.position.r },
      attackerLearnedDomains: faction?.learnedDomains ?? [],
    };

    return applyCombatSynergies(context, synergies, triple);
  };

  const attackerSynergyResult = resolveSynergies(attacker, attackerPrototype, attackerFaction, defender, defenderPrototype);
  const defenderSynergyResult = resolveSynergies(defender, defenderPrototype, defenderFaction, attacker, attackerPrototype);
  const synergyAttackModifier = calculateSynergyAttackBonus(attackerSynergyResult);
  const synergyDefenseModifier = calculateSynergyDefenseBonus(defenderSynergyResult);
  situationalAttackModifier += synergyAttackModifier + attackerSynergyResult.damage;
  situationalDefenseModifier += synergyDefenseModifier + defenderSynergyResult.defense;
  if (attackerSynergyResult.coastalNomadDefense > 0 && ['coast', 'river'].includes(attackerTerrainId)) {
    situationalDefenseModifier += attackerSynergyResult.coastalNomadDefense;
  }
  if (attackerSynergyResult.beachRaidDamageBonus > 0 && isWaterTerrain(attackerTerrainId)) {
    situationalAttackModifier += attackerSynergyResult.beachRaidDamageBonus;
  }

  // Layered Defense (fortress+fortress): two adjacent fortress units halve ranged attacks against them
  if (defenderSynergyResult.formationWallActive && attackerIsRanged) {
    for (const hex of getNeighbors(defender.position)) {
      const neighborUnitId = getUnitAtHex(state, hex);
      if (!neighborUnitId || neighborUnitId === defenderId) continue;
      const neighborUnit = state.units.get(neighborUnitId);
      if (!neighborUnit || neighborUnit.factionId !== defender.factionId || neighborUnit.hp <= 0) continue;
      const neighborProto = state.prototypes.get(neighborUnit.prototypeId);
      if (neighborProto?.tags?.includes('fortress')) {
        situationalAttackModifier -= defenderSynergyResult.formationWallRangedReduction;
        break;
      }
    }
  }

  // Mobile Stronghold aura (fortress+camel_adaptation): adjacent allies gain defense
  if (defenderSynergyResult.mobileStrongholdAlliedDefenseBonus > 0) {
    for (const hex of getNeighbors(defender.position)) {
      const neighborUnitId = getUnitAtHex(state, hex);
      if (!neighborUnitId || neighborUnitId === defenderId) continue;
      const neighborUnit = state.units.get(neighborUnitId);
      if (!neighborUnit || neighborUnit.factionId !== defender.factionId || neighborUnit.hp <= 0) continue;
      const neighborProto = state.prototypes.get(neighborUnit.prototypeId);
      if (neighborProto?.tags?.includes('fortress') || neighborProto?.tags?.includes('camel')) {
        situationalDefenseModifier += defenderSynergyResult.mobileStrongholdAlliedDefenseBonus;
        break;
      }
    }
  }

  // Raid camp: defender in a raid_camp zone owned by attacker's faction takes defense penalty
  const raidCampEffects = getZoneEffectsAtHex(state, defender.position);
  const inRaidCamp = raidCampEffects.some(
    (e: { type: string; ownerFactionId: string }) => e.type === 'raid_camp' && e.ownerFactionId === attacker.factionId,
  );
  if (inRaidCamp) {
    situationalDefenseModifier -= 0.25;
  }

  const attackerChassis = registry.getChassis(attackerPrototype.chassisId);
  if (attackerDoctrine?.navalCoastalBonusEnabled && attackerChassis?.movementClass === 'naval' && ['coast', 'river'].includes(attackerTerrain?.id ?? '')) {
    situationalAttackModifier += 0.25;
  }

  // Tidal Warfare T2 — Tidal Surge: +15% attack on coast/river terrain
  if (attackerDoctrine?.amphibiousAssaultEnabled) {
    if (attackerTerrainId === 'coast' || attackerTerrainId === 'river') {
      situationalAttackModifier += 0.15;
    }
  }

  // Juggernaut tidal_warfare signature: bonus damage when adjacent to water
  if (attackerSynergyResult.emergentBonusDamageAdjacentWater > 0) {
    const adjacentHexes = getNeighbors(attacker.position);
    const adjacentToWater = adjacentHexes.some(h => {
      const t = state.map?.tiles.get(hexToKey(h))?.terrain;
      return t === 'coast' || t === 'river' || isWaterTerrain(t ?? 'plains');
    }) || isWaterTerrain(attackerTerrainId);
    if (adjacentToWater) {
      situationalAttackModifier += attackerSynergyResult.emergentBonusDamageAdjacentWater * 0.1;
    }
  }

  const improvementDefenseBonus = getImprovementBonus(state, defender.position, defender.factionId);
  const wallDefenseBonus = getWallDefenseBonus(
    state,
    defender.position,
    registry.getSignatureAbility('coral_people')?.wallDefenseMultiplier ?? 2,
  );
  const result = resolveCombat({
    attacker,
    defender,
    attackerPrototype,
    defenderPrototype,
    registry,
    rngState: state.rngState,
    attackerTerrain,
    defenderTerrain,
    defenderImprovementBonus: improvementDefenseBonus + wallDefenseBonus,
    flankingBonus,
    situationalAttackModifier: situationalAttackModifier + chargeAttackBonus,
    situationalDefenseModifier,
    rearAttackBonus,
    braceDefenseBonus,
    ambushAttackBonus,
    bonusDefenderMoraleLoss: (rearAttackBonus > 0 ? 18 : 0) + (attacker.preparedAbility === 'ambush' ? 10 : 0),
    retaliationDamageMultiplier,
    isCharge: isChargeAttack,
    isStealthed: attackerWasStealthed,
    chargeShield: attackerSynergyResult.chargeShield,
    antiDisplacement: defenderSynergyResult.antiDisplacement || defenderDoctrine?.armorPenetrationEnabled === true || defenderDoctrine?.heavyTranscendenceEnabled === true,
    stealthChargeMultiplier: attackerSynergyResult.stealthChargeMultiplier,
    accuracyDebuff: attackerSynergyResult.sandstormAccuracyDebuff,
    forestFirstStrike,
    // Heavy Hitter native T3 (Arctic Wardens) — 100% armor pen. Foreign T3 — 50%.
    // Previously cross-wired to chargeTranscendenceEnabled; corrected here.
    armorPenetration: (attackerDoctrine?.heavyTranscendenceEnabled ? 1.0 : attackerDoctrine?.armorPenetrationEnabled ? 0.5 : 0) + attackerSynergyResult.armorPiercing + attackerSynergyResult.emergentArmorPierce,
  });

  let totalKnockbackDistance = result.defenderKnockedBack ? result.knockbackDistance : 0;
  if (result.defenderKnockedBack && attackerDoctrine?.elephantStampede2Enabled) {
    totalKnockbackDistance = 2;
  }
  totalKnockbackDistance += attackerSynergyResult.knockbackDistance;

  const triggeredEffects: CombatActionEffect[] = [];

  if (flankingBonus > 0) {
    pushCombatEffect(triggeredEffects, 'Flanking', `Attack gained ${formatPercent(flankingBonus)} from adjacent allied pressure.`, 'positioning');
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
  if (attackerWasStealthed) {
    pushCombatEffect(triggeredEffects, 'Stealth Ambush', 'Attacker opened from stealth for a major burst bonus.', 'ability');
  }
  if (tidalAssaultTriggered) {
    pushCombatEffect(triggeredEffects, 'Tidal Assault', 'Naval shock force attacked from water and reduced the defender\'s footing.', 'ability');
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
  if (sneakAttackTriggered) {
    pushCombatEffect(triggeredEffects, 'Sneak Attack', 'River stealth ambush from water terrain for massive damage.', 'ability');
  }
  if (stampedeTriggered) {
    pushCombatEffect(triggeredEffects, 'Stampede', 'Elephant momentum stacked extra charge damage.', 'ability');
  }
  if (skirmishStepTriggered) {
    pushCombatEffect(triggeredEffects, 'Skirmish Step', 'Moved before attacking for 10% bonus damage.', 'ability');
  }
  if (chargeMomentumTriggered) {
    pushCombatEffect(triggeredEffects, 'Charge Momentum', 'Long charge added 15% bonus damage.', 'ability');
  }
  if (firstAttackTriggered) {
    pushCombatEffect(triggeredEffects, 'First Strike', 'First attack bonus dealt +20% damage.', 'ability');
  }
  if (chargeChainBonusAmount > 0) {
    pushCombatEffect(triggeredEffects, 'Chain Charge', `Allies in charge line amplified damage by ${formatPercent(chargeChainBonusAmount)}.`, 'ability');
  }
  if (coldHardenedTriggered) {
    pushCombatEffect(triggeredEffects, 'Cold Hardened', 'Arctic defender hardened stance for 10% defense.', 'ability');
  }
  if (result.roleModifier !== 0) {
    const sign = result.roleModifier > 0 ? '+' : '';
    pushCombatEffect(
      triggeredEffects,
      'Role Effectiveness',
      `${attackerPrototype.derivedStats.role ?? 'unknown'} vs ${defenderPrototype.derivedStats.role ?? 'unknown'}: ${sign}${(result.roleModifier * 100).toFixed(0)}%`,
      'positioning',
    );
  }
  if (result.weaponModifier !== 0) {
    const sign = result.weaponModifier > 0 ? '+' : '';
    pushCombatEffect(triggeredEffects, 'Weapon Effectiveness', `${sign}${(result.weaponModifier * 100).toFixed(0)}%`, 'ability');
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
  if (attackerSynergyResult.damage > 0) {
    pushCombatEffect(triggeredEffects, 'Synergy Damage', `Synergy added ${formatPercent(attackerSynergyResult.damage)} to attack power.`, 'synergy');
  }
  if (defenderSynergyResult.defense > 0) {
    pushCombatEffect(triggeredEffects, 'Synergy Defense', `Synergy added ${formatPercent(defenderSynergyResult.defense)} to defense.`, 'synergy');
  }
  if (attackerSynergyResult.armorPiercing > 0) {
    pushCombatEffect(triggeredEffects, 'Armor Pierce', `Synergy pierced ${(attackerSynergyResult.armorPiercing * 100).toFixed(0)}% of defender armor.`, 'synergy');
  }
  if (attackerSynergyResult.instantKill) {
    pushCombatEffect(triggeredEffects, 'Lethal Ambush', 'Synergy enables a lethal strike bypassing all defenses.', 'synergy');
  }
  if (attackerSynergyResult.stunDuration > 0) {
    pushCombatEffect(triggeredEffects, 'Stun', `Synergy stuns the target for ${attackerSynergyResult.stunDuration} turn(s).`, 'synergy');
  }
  if (defenderSynergyResult.damageReflection > 0) {
    pushCombatEffect(triggeredEffects, 'Damage Reflection', `Synergy reflects ${(defenderSynergyResult.damageReflection * 100).toFixed(0)}% of damage.`, 'synergy');
  }
  if (attackerSynergyResult.aoeDamage > 0) {
    pushCombatEffect(triggeredEffects, 'AoE Burst', `Synergy area damage: ${attackerSynergyResult.aoeDamage} to adjacent enemies.`, 'synergy');
  }
  if (attackerSynergyResult.formationCrushStacks > 0) {
    pushCombatEffect(triggeredEffects, 'Formation Crush', `Synergy adds ${attackerSynergyResult.formationCrushStacks} crush stack(s).`, 'synergy');
  }
  if (attackerSynergyResult.sandstormAuraRadius > 0) {
    pushCombatEffect(triggeredEffects, 'Sandstorm Aura', `Synergy creates a ${attackerSynergyResult.sandstormAuraRadius}-hex accuracy debuff aura.`, 'synergy');
  }

  return createCombatActionPreviewRecord(
    state,
    attackerId,
    defenderId,
    result,
    triggeredEffects,
    braceTriggered,
    attackerWasStealthed,
    {
      attackerTerrainId,
      defenderTerrainId,
      isChargeAttack,
      chargeAttackBonus,
      chargeChainBonusAmount,
      chargeSplashEnabled: attackerDoctrine?.chargeSplashEnabled ?? false,
      synergyAttackModifier,
      synergyDefenseModifier,
      improvementDefenseBonus,
      wallDefenseBonus,
      totalKnockbackDistance,
      poisonTrapPositions: attackerSynergyResult.poisonTrapDamage > 0
        ? [{ q: attacker.position.q, r: attacker.position.r }]
        : attackerSynergyResult.poisonTrapPositions.map((position) => ({ q: position.x, r: position.y })),
      poisonTrapDamage: attackerSynergyResult.poisonTrapDamage,
      poisonTrapSlow: attackerSynergyResult.poisonTrapSlow,
      healOnRetreatAmount: attackerSynergyResult.healOnRetreatAmount,
      sandstormDamage: attackerSynergyResult.sandstormDamage,
      contaminateActive: attackerSynergyResult.contaminateActive,
      frostbiteColdDoT: attackerSynergyResult.frostbiteColdDoT,
      frostbiteSlow: attackerSynergyResult.frostbiteSlow,
      attackerSynergyEffects: attackerSynergyResult.additionalEffects,
      defenderSynergyEffects: defenderSynergyResult.additionalEffects,
      sneakAttackTriggered,
      stampedeTriggered,
      // Phase 4: emergent rule fields
      emergentSustainHealPercent: attackerSynergyResult.emergentSustainHealPercent,
      emergentSustainMinHp: attackerSynergyResult.emergentSustainMinHp,
      emergentSmiteBonus: attackerSynergyResult.emergentSmiteBonus,
      emergentPermanentStealthTerrains: attackerSynergyResult.emergentPermanentStealthTerrains,
      emergentCaptureBonus: attackerSynergyResult.emergentCaptureBonus,
      emergentDesertCaptureBonus: attackerSynergyResult.emergentDesertCaptureBonus,
      // Juggernaut per-domain signature fields
      emergentPoisonPerHit: attackerSynergyResult.emergentPoisonPerHit,
      emergentDamageReflection: attackerSynergyResult.emergentDamageReflection,
      emergentKnockbackOnKill: attackerSynergyResult.emergentKnockbackOnKill,
      emergentDamageBehindPercent: attackerSynergyResult.emergentDamageBehindPercent,
      emergentFreeReposition: attackerSynergyResult.emergentFreeReposition,
      emergentArmorPierce: attackerSynergyResult.emergentArmorPierce,
      emergentCaptureBelowHpPercent: attackerSynergyResult.emergentCaptureBelowHpPercent,
      emergentBonusDamageAdjacentWater: attackerSynergyResult.emergentBonusDamageAdjacentWater,
      emergentUndying: attackerSynergyResult.emergentUndying,
      emergentIgnoreZoc: attackerSynergyResult.emergentIgnoreZoc,
      // Iron Turtle expanded
      emergentCrushZoneRadius: attackerSynergyResult.emergentCrushZoneRadius,
      emergentCrushZoneMovementPenalty: attackerSynergyResult.emergentCrushZoneMovementPenalty,
      // Many-Faced stance
      emergentManyFacedStance: attackerSynergyResult.emergentManyFacedStance,
      emergentManyFacedDefense: attackerSynergyResult.emergentManyFacedDefense,
      emergentManyFacedReflection: attackerSynergyResult.emergentManyFacedReflection,
      emergentManyFacedDamage: attackerSynergyResult.emergentManyFacedDamage,
      emergentManyFacedRangeBonus: attackerSynergyResult.emergentManyFacedRangeBonus,
      emergentManyFacedMovementBonus: attackerSynergyResult.emergentManyFacedMovementBonus,
      // Phase 3A: direct combat effects
      instantKill: attackerSynergyResult.instantKill,
      lethalAmbushPoison: attackerSynergyResult.lethalAmbushPoison,
      chargeCooldownWaived: attackerSynergyResult.chargeCooldownWaived,
      formationCrushStacks: attackerSynergyResult.formationCrushStacks,
      stunDuration: attackerSynergyResult.stunDuration,
      armorPiercing: attackerSynergyResult.armorPiercing,
      // Phase 3B: capture synergy modifiers
      capturePoisonDamage: attackerSynergyResult.capturePoisonDamage,
      capturePoisonStacks: attackerSynergyResult.capturePoisonStacks,
      slaveDamageBonus: attackerSynergyResult.slaveDamageBonus,
      slaveHealPenalty: attackerSynergyResult.slaveHealPenalty,
      chargeCaptureChance: attackerSynergyResult.chargeCaptureChance,
      retreatCaptureChance: attackerSynergyResult.retreatCaptureChance,
      navalCaptureBonus: attackerSynergyResult.navalCaptureBonus,
      stealthCaptureBonus: attackerSynergyResult.stealthCaptureBonus,
      // Phase 3C: buff/aura/retreat effects
      captureEscapePrevented: attackerSynergyResult.captureEscapePrevented,
      heavyRetreatDamageReduction: attackerSynergyResult.heavyRetreatDamageReduction,
      coastalNomadDefense: attackerSynergyResult.coastalNomadDefense,
      coastalNomadSpeed: attackerSynergyResult.coastalNomadSpeed,
      heavyNavalRamDamage: attackerSynergyResult.heavyNavalRamDamage,
      slaveHealAmount: attackerSynergyResult.slaveHealAmount,
      heavyRegenPercent: attackerSynergyResult.heavyRegenPercent,
      terrainSlaveSpeed: attackerSynergyResult.terrainSlaveSpeed,
      sandstormAuraRadius: attackerSynergyResult.sandstormAuraRadius,
      sandstormAuraDebuff: attackerSynergyResult.sandstormAuraDebuff,
      slaveArmyDamageBonus: attackerSynergyResult.slaveArmyDamageBonus,
      slaveArmyDefensePenalty: attackerSynergyResult.slaveArmyDefensePenalty,
      slaveCoercionDamageBonus: attackerSynergyResult.slaveCoercionDamageBonus,
      heavyMassStacks: attackerSynergyResult.heavyMassStacks,
      // Top-level synergy modifiers
      synergyDamageBonus: attackerSynergyResult.damage,
      synergyDefenseBonus: defenderSynergyResult.defense,
      poisonStacks: attackerSynergyResult.poisonStacks,
      damageReflection: defenderSynergyResult.damageReflection,
      aoeDamage: attackerSynergyResult.aoeDamage,
      witheringReduction: attackerSynergyResult.witheringReduction,
      // Heal primitive wiring
      synergyFlatHeal: attackerSynergyResult.synergyFlatHeal,
      synergyPercentHealMaxHp: attackerSynergyResult.synergyPercentHealMaxHp,
      // Post-combat re-stealth
      reEnterStealthAfterCombat: attackerSynergyResult.reEnterStealthAfterCombat,
      // Previously dead pair synergy fields — now wired
      vampiricStrikeHealPercent: attackerSynergyResult.vampiricStrikeHealPercent,
      bombardmentRange: attackerSynergyResult.bombardmentRange,
      bombardmentDamageMultiplier: attackerSynergyResult.bombardmentDamageMultiplier,
      bombardmentLandAuraDefense: attackerSynergyResult.bombardmentLandAuraDefense,
      mobileStrongholdFortUp: attackerSynergyResult.mobileStrongholdFortUp,
      mobileStrongholdDefenseBonus: attackerSynergyResult.mobileStrongholdDefenseBonus,
      mobileStrongholdAlliedDefenseBonus: attackerSynergyResult.mobileStrongholdAlliedDefenseBonus,
      beachRaidDamageBonus: attackerSynergyResult.beachRaidDamageBonus,
      beachRaidRetreatToWater: attackerSynergyResult.beachRaidRetreatToWater,
      ghostPassActive: attackerSynergyResult.ghostPassActive,
      fightingRetreatFreeStrike: attackerSynergyResult.fightingRetreatFreeStrike,
      fightingRetreatDamageMultiplier: attackerSynergyResult.fightingRetreatDamageMultiplier,
      tidalCleanseHealPerTurn: attackerSynergyResult.tidalCleanseHealPerTurn,
      amphibiousMovementBonus: attackerSynergyResult.amphibiousMovementBonus,
      stealthAuraShareRadius: attackerSynergyResult.stealthAuraShareRadius,
      slaveEconomyHealPerTurn: attackerSynergyResult.slaveEconomyHealPerTurn,
      slaveEconomyResourceBonus: attackerSynergyResult.slaveEconomyResourceBonus,
      caravanPassengerActive: attackerSynergyResult.caravanPassengerActive,
      countsAsCity: attackerSynergyResult.countsAsCity,
      transportedTroopsStealth: attackerSynergyResult.transportedTroopsStealth,
      positionSwapAvailable: attackerSynergyResult.positionSwapAvailable,
      caravanRelayVisionRange: attackerSynergyResult.caravanRelayVisionRange,
      formationWallActive: attackerSynergyResult.formationWallActive,
      formationWallRangedReduction: attackerSynergyResult.formationWallRangedReduction,
      formationPinballCollisionDamage: attackerSynergyResult.formationPinballCollisionDamage,
      formationFocusBonus: attackerSynergyResult.formationFocusBonus,
      formationFocusIgnoresDefense: attackerSynergyResult.formationFocusIgnoresDefense,
      formationChainBonus: attackerSynergyResult.formationChainBonus,
      bloomPulseHeal: attackerSynergyResult.bloomPulseHeal,
      bloomPulseSelfHeal: attackerSynergyResult.bloomPulseSelfHeal,
      bloomPulseAuraRadius: attackerSynergyResult.bloomPulseAuraRadius,
      bloomPulseMovementBonus: attackerSynergyResult.bloomPulseMovementBonus,
      toxicSpreadTransferRadius: attackerSynergyResult.toxicSpreadTransferRadius,
      toxicSpreadTransferStacks: attackerSynergyResult.toxicSpreadTransferStacks,
      // New emergent wiring fields
      emergentPermanentStealth: attackerSynergyResult.emergentPermanentStealth,
      emergentTerraformCharges: attackerSynergyResult.emergentTerraformCharges,
      emergentPhaseDistance: attackerSynergyResult.emergentPhaseDistance,
      emergentKillChainRedeployRange: attackerSynergyResult.emergentKillChainRedeployRange,
      emergentPoisonCloudPreventsHealing: attackerSynergyResult.emergentPoisonCloudPreventsHealing,
    },
  );
}
