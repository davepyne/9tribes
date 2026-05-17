/**
 * resolveCapture.ts — Capture resolution and post-kill effects.
 *
 * Pure extraction from applyCombatAction (lines 570-989).
 * All cross-phase state is read/written via CombatContext.
 */

import type { CombatContext } from './combatContext.js';
import type { Unit } from '../../features/units/types.js';
import { hexDistance, getNeighbors, hexToKey } from '../../core/grid.js';
import { createUnitId } from '../../core/ids.js';
import { rngChance } from '../../core/rng.js';
import { buildSlaveOverrides } from '../capabilityDoctrine.js';
import { isWaterTerrain } from '../terrainUtils.js';
import { getZoneEffectsAtHex } from '../zoneEffectSystem.js';
import { getUnitAtHex } from '../occupancySystem.js';
import { getPrototype, getNearestFriendlyCity } from '../../game/stateAccess.js';
import { getGreedyLootOnKill, getPursuitMovementOnKill } from '../factionIdentitySystem.js';
import {
  attemptCapture, attemptNonCombatCapture, hasCaptureAbility,
  findOriginalFaction, liberationOverrides,
} from '../captureSystem.js';
import { applyPoisonInRange } from './combatContext.js';
import { removeDeadUnitsFromFactions, writeUnitToState, applyDamageToAdjacentEnemies } from './helpers.js';

/**
 * Phase A — Capture resolution.
 *
 * Computes auto-capture thresholds, attempts capture on kill,
 * handles press gang capture. Sets ctx tracking variables.
 */
export function processCapture(ctx: CombatContext): void {
  const {
    state, registry, preview, attacker, defender, attackerPrototype,
    attackerFaction, attackerDoctrine, attackerTerrainId, attackerIsRanged,
    isNavalAttacker, atk, defenderActuallyDestroyed, nextAttacker,
  } = ctx;

  let current = ctx.current;
  let baseResolution = ctx.resolution;
  let capturedOnKill = false;
  let retreatCaptured = false;
  let pressGangCaptured = false;

  const isGreedyCoastal = attackerFaction?.identityProfile.passiveTrait === 'greedy'
    && isWaterTerrain(attackerTerrainId);
  const autoCaptureThreshold = attackerDoctrine?.slaverTranscendenceEnabled ? 0.5
    : attackerDoctrine?.autoCaptureEnabled ? 0.25 : 0;
  const autoCaptureAbility = autoCaptureThreshold > 0 && defender.hp <= defender.maxHp * autoCaptureThreshold
    ? {
        greedyCaptureChance: 1,
        greedyCaptureCooldown: 0,
        greedyCaptureHpFraction: autoCaptureThreshold,
      }
    : null;
  // Maelstrom auto-capture: native tidal T3 — naval kills inside attacker's
  // own Maelstrom auto-capture regardless of HP threshold (slaving synergy).
  const maelstromAutoCapture = attackerDoctrine?.maelstromAutoCaptureEnabled
    && isNavalAttacker
    && getZoneEffectsAtHex(current, defender.position).some(
      e => e.type === 'maelstrom' && e.ownerFactionId === attacker.factionId,
    )
    ? { greedyCaptureChance: 1, greedyCaptureCooldown: 0, greedyCaptureHpFraction: 0.5 }
    : null;
  // Slaving T3 — Naval capture radius: friendly naval units within range extend
  // auto-capture to non-capture attackers (naval support aura).
  const navalRadius = attackerDoctrine?.navalCaptureRadius ?? 0;
  const hasNavalSupport = navalRadius > 0
    && !hasCaptureAbility(attackerPrototype, registry)
    && !autoCaptureAbility
    && !maelstromAutoCapture
    && Array.from(current.units.values()).some(unit => {
      if (unit.factionId !== attacker.factionId || unit.id === attacker.id) return false;
      if (hexDistance(unit.position, defender.position) > navalRadius) return false;
      const proto = current.prototypes.get(unit.prototypeId);
      const chassis = proto ? registry.getChassis(proto.chassisId) : undefined;
      return chassis?.movementClass === 'naval' && !unit.slaveStatFraction;
    });
  const navalSupportCapture = hasNavalSupport && defender.hp <= defender.maxHp * 0.5
    ? { greedyCaptureChance: 1, greedyCaptureCooldown: 0, greedyCaptureHpFraction: 0.5 }
    : null;
  // Juggernaut slaving signature: auto-capture below HP threshold
  const emergentCaptureBelowHpPercent = atk.getStat('emergentCaptureBelowHpPercent');
  const juggernautSlavingCapture = emergentCaptureBelowHpPercent > 0
    && !autoCaptureAbility && !maelstromAutoCapture && !navalSupportCapture
    && defender.hp <= defender.maxHp * emergentCaptureBelowHpPercent
    ? { greedyCaptureChance: 1, greedyCaptureCooldown: 0, greedyCaptureHpFraction: emergentCaptureBelowHpPercent }
    : null;
  // E3/E4 — emergent capture bonus from Slave Empire (+0.20)
  const emergentCaptureBonus = atk.getStat('emergentCaptureBonus');
  // Synergy capture bonuses
  let synergyCaptureBonus = 0;
  if (preview.details.isChargeAttack) synergyCaptureBonus += atk.getStat('chargeCaptureChance');
  if (isWaterTerrain(attackerTerrainId)) synergyCaptureBonus += atk.getStat('navalCaptureBonus');
  if (preview.attackerWasStealthed) synergyCaptureBonus += atk.getStat('stealthCaptureBonus');
  baseResolution.synergyCaptureBonus = synergyCaptureBonus;
  const totalCaptureBonus = emergentCaptureBonus + synergyCaptureBonus;
  // E5 — Paladin sustain overrides attackerDestroyed when minHp saved the unit
  // Juggernaut undying also prevents attacker destruction once per combat
  const attackerActuallyDestroyed = preview.result.attackerDestroyed && !baseResolution.emergentSustainMinHpSaved && !baseResolution.emergentUndyingSaved;
  if (
    defenderActuallyDestroyed
    && nextAttacker.hp > 0
    && (hasCaptureAbility(attackerPrototype, registry) || isGreedyCoastal || autoCaptureAbility || maelstromAutoCapture || navalSupportCapture || juggernautSlavingCapture)
  ) {
    const captureResult = attemptCapture(
      current,
      nextAttacker,
      defender,
      registry,
      autoCaptureAbility
        ?? maelstromAutoCapture
        ?? navalSupportCapture
        ?? juggernautSlavingCapture
        ?? (isGreedyCoastal && !hasCaptureAbility(attackerPrototype, registry)
          ? registry.getSignatureAbility(attacker.factionId)
          : null),
      current.rngState,
      totalCaptureBonus > 0 ? totalCaptureBonus : undefined,
      buildSlaveOverrides(attackerDoctrine),
    );
    current = captureResult.state;
    capturedOnKill = captureResult.captured;
  }
  // Phase A — Press gang capture (slaving_t1): capture chance on kill vs wounded
  if (
    defenderActuallyDestroyed
    && !capturedOnKill
    && attackerDoctrine?.pressGangCaptureEnabled
    && nextAttacker.hp > 0
  ) {
    // Use original `defender` (captured at function entry) because the defender
    // was already deleted from current.units when defenderDestroyed is true.
    if (defender) {
      if (rngChance(current.rngState, 0.3)) {
        const slaveHp = attackerDoctrine?.slaveHpFraction ?? 0.25;
        const overrides = buildSlaveOverrides(attackerDoctrine);
        const isReCapture = findOriginalFaction(defender, defender.factionId) === attacker.factionId;
        const liberation = liberationOverrides(isReCapture, overrides, defender.slaveStatFraction);
        const captured: Unit = {
          ...defender,
          factionId: attacker.factionId,
          hp: Math.max(1, Math.floor(defender.maxHp * slaveHp)),
          morale: 40,
          veteranLevel: 'green' as import('../../core/enums.js').VeteranLevel,
          status: 'ready' as import('../../core/enums.js').UnitStatus,
          slaveStatFraction: liberation.statFraction,
          slaveRoutImmune: liberation.routImmune,
        };
        const unitsAfterCapture = new Map(current.units);
        unitsAfterCapture.set(preview.defenderId, captured);
        const factionsAfterCapture = new Map(current.factions);
        const attackerFactionAfterCapture = factionsAfterCapture.get(attacker.factionId);
        if (attackerFactionAfterCapture) {
          factionsAfterCapture.set(attacker.factionId, {
            ...attackerFactionAfterCapture,
            unitIds: [...attackerFactionAfterCapture.unitIds, captured.id],
            slaveCaptureCount: attackerFactionAfterCapture.slaveCaptureCount + 1,
          });
        }
        current = { ...current, units: unitsAfterCapture, factions: factionsAfterCapture };
        pressGangCaptured = true;
        baseResolution.pressGangCaptured = true;
      }
    }
  }
  ctx.current = current;
  ctx.resolution = baseResolution;
  ctx.capturedOnKill = capturedOnKill;
  ctx.retreatCaptured = retreatCaptured;
  ctx.pressGangCaptured = pressGangCaptured;
  ctx.attackerActuallyDestroyed = attackerActuallyDestroyed;
}

/**
 * Phase A — Post-kill effects.
 *
 * Greedy loot, mycelium network, poison detonate, charge splash,
 * armada chain, pursuit movement, melee advance, kill chain,
 * retreat capture, captive champion, slave market.
 */
export function applyPostKillEffects(ctx: CombatContext): void {
  const {
    state, registry, preview, attacker, defender, attackerPrototype,
    attackerFaction, attackerDoctrine, attackerIsRanged, isNavalAttacker,
    atk, defenderActuallyDestroyed, nextAttacker, nextDefender,
  } = ctx;

  let current = ctx.current;
  let baseResolution = ctx.resolution;
  let feedback = ctx.feedback;
  const capturedOnKill = ctx.capturedOnKill;
  const retreatCaptured = ctx.retreatCaptured;
  const pressGangCaptured = ctx.pressGangCaptured;
  const attackerActuallyDestroyed = ctx.attackerActuallyDestroyed;
  // Phase A — Greedy loot on kill (Pirate Lords passive)
  let greedyLootGained = 0;
  if (defenderActuallyDestroyed && nextAttacker.hp > 0) {
    const loot = getGreedyLootOnKill(attackerFaction);
    if (loot) {
      const attackerEconomy = current.economy.get(attacker.factionId);
      if (attackerEconomy) {
        const updatedEconomy = new Map(current.economy);
        updatedEconomy.set(attacker.factionId, {
          ...attackerEconomy,
          productionPool: attackerEconomy.productionPool + loot.gold + loot.supplies,
        });
        current = { ...current, economy: updatedEconomy };
        greedyLootGained = loot.gold;
        baseResolution.greedyLootGained = loot.gold;
      }
    }
  }
  // Mycelium Network (venom_t3 native): a kill on a hex covered by an
  // attacker-owned Toxic Bloom propagates 2 fresh poison stacks to ALL
  // friendly units within 3 hexes of that bloom's center.
  let myceliumTargets = 0;
  if (
    defenderActuallyDestroyed
    && attackerDoctrine?.myceliumNetworkOnKillEnabled
    && nextAttacker.hp > 0
  ) {
    let ownedBloom: import('../../game/types.js').ZoneEffect | null = null;
    for (const effect of current.zoneEffects.values()) {
      if (effect.type !== 'toxic_bloom') continue;
      if (effect.ownerFactionId !== attacker.factionId) continue;
      if (hexDistance(defender.position, effect.center) > effect.radius) continue;
      ownedBloom = effect;
      break;
    }
    if (ownedBloom) {
      const result = applyPoisonInRange(current.units, ownedBloom.center, 3, {
        factionFilter: 'friendlies', filterFactionId: attacker.factionId,
        stacks: 2, damagePerStack: attackerDoctrine.poisonDamagePerStack, duration: 3,
        provenance: { factionId: attacker.factionId, prototypeId: attacker.prototypeId },
      });
      if (result.targetsHit > 0) {
        current = { ...current, units: result.units };
        baseResolution.myceliumNetworkApplied = true;
        myceliumTargets = result.targetsHit;
      }
    }
  }
  // Phase A — Poison detonate (venom_t3 native): AoE poison on adjacent enemies after kill
  let poisonDetonated = false;
  if (defenderActuallyDestroyed && attackerDoctrine?.nativePoisonDetonateEnabled && nextAttacker.hp > 0) {
    const detonateUnits = new Map(current.units);
    let detonateCount = 0;
    for (const adjHex of getNeighbors(defender.position)) {
      const adjUnitId = getUnitAtHex(current, adjHex);
      if (!adjUnitId) continue;
      const adjUnit = detonateUnits.get(adjUnitId);
      if (adjUnit && adjUnit.factionId !== attacker.factionId && adjUnit.hp > 0) {
        detonateUnits.set(adjUnitId, {
          ...adjUnit,
          hp: Math.max(0, adjUnit.hp - 3),
          poisonedBy: attacker.factionId,
          poisonStacks: (adjUnit.poisonStacks ?? 0) + 2,
          poisonTurnsRemaining: Math.max(adjUnit.poisonTurnsRemaining ?? 0, 3),
        });
        detonateCount++;
      }
    }
    if (detonateCount > 0) {
      current = { ...current, units: detonateUnits };
      poisonDetonated = true;
      baseResolution.poisonDetonated = true;
    }
  }
  // Charge T3 native — splash: 50% of charge damage to enemies adjacent to defender
  let chargeSplashDamage = 0;
  let chargeSplashTargetsHit = 0;
  if (
    preview.details.isChargeAttack
    && preview.details.chargeSplashEnabled
    && preview.result.defenderDamage > 0
    && nextAttacker.hp > 0
  ) {
    chargeSplashDamage = Math.max(1, Math.floor(preview.result.defenderDamage * 0.5));
    const splash = applyDamageToAdjacentEnemies(current, defender.position, attacker.factionId, chargeSplashDamage);
    if (splash.hitCount > 0) {
      current = splash.state;
      chargeSplashTargetsHit = splash.hitCount;
      baseResolution.chargeSplashTargetsHit = splash.hitCount;
    }
  }
  // Armada chain damage: naval units deal +1 damage per friendly naval unit within 2 hexes (cap +4)
  let armadaChainDamage = 0;
  const chainBonus = atk.getStat('formationChainBonus');
  if (chainBonus > 0 && isNavalAttacker && nextDefender.hp > 0) {
    let chainCount = 0;
    for (const unit of current.units.values()) {
      if (unit.factionId !== attacker.factionId || unit.id === attacker.id || unit.hp <= 0) continue;
      if (hexDistance(unit.position, attacker.position) > 2) continue;
      const proto = current.prototypes.get(unit.prototypeId);
      const chassis = proto ? registry.getChassis(proto.chassisId) : undefined;
      if (chassis?.movementClass === 'naval') chainCount++;
    }
    const cappedCount = Math.min(chainCount, 4);
    if (cappedCount > 0) {
      armadaChainDamage = chainBonus * cappedCount;
      const chainDefender = current.units.get(preview.defenderId);
      if (chainDefender && chainDefender.hp > 0) {
        const newHp = Math.max(0, chainDefender.hp - armadaChainDamage);
        const chainUnits = new Map(current.units);
        chainUnits.set(preview.defenderId, { ...chainDefender, hp: newHp });
        current = { ...current, units: chainUnits };
        baseResolution.armadaChainDamage = armadaChainDamage;
      }
    }
  }
  // Phase A — Pursuit movement (foraging_riders): restore movement after kill
  let pursuitMovementRestored = 0;
  if (defenderActuallyDestroyed && nextAttacker.hp > 0) {
    const pursuitMoves = getPursuitMovementOnKill(attackerFaction);
    if (pursuitMoves > 0) {
      const pursuitUnit = current.units.get(preview.attackerId);
      if (pursuitUnit && pursuitUnit.hp > 0) {
        const unitsAfterPursuit = new Map(current.units);
        unitsAfterPursuit.set(preview.attackerId, {
          ...pursuitUnit,
          movesRemaining: pursuitUnit.movesRemaining + pursuitMoves,
        });
        current = { ...current, units: unitsAfterPursuit };
        pursuitMovementRestored = pursuitMoves;
        baseResolution.pursuitMovementRestored = pursuitMoves;
      }
    }
  }
  // Melee advance: melee attacker occupies defender's hex on kill (not capture)
  if (
    defenderActuallyDestroyed
    && !attackerActuallyDestroyed
    && !capturedOnKill
    && !attackerIsRanged
  ) {
    const advancingUnit = current.units.get(preview.attackerId);
    if (advancingUnit) {
      const advancedUnits = new Map(current.units);
      advancedUnits.set(preview.attackerId, {
        ...advancingUnit,
        position: defender.position,
      });
      current = { ...current, units: advancedUnits };
    }
  }
  // Hitrun T3 — Killing Chain: follow-up attack after kill
  if (
    defenderActuallyDestroyed
    && !attackerActuallyDestroyed
    && (attackerDoctrine?.killChainEnabled || attackerDoctrine?.nativeKillChainEnabled)
  ) {
    const chainUnit = current.units.get(preview.attackerId);
    if (chainUnit && chainUnit.hp > 0) {
      const attackRange = attackerPrototype.derivedStats.range ?? 1;
      const maxChains = attackerDoctrine.nativeKillChainEnabled ? 3 : 1;
      const currentChainCount = chainUnit.killChainCountThisTurn ?? 0;
      if (currentChainCount < maxChains) {
        // Find nearest enemy within attack range (excluding the already-killed defender)
        let nearestEnemy: Unit | null = null;
        let nearestDist = Infinity;
        for (const [uid, u] of current.units) {
          if (u.factionId === attacker.factionId || u.hp <= 0 || uid === preview.defenderId) continue;
          const dist = hexDistance(chainUnit.position, u.position);
          if (dist <= attackRange && dist < nearestDist) {
            nearestDist = dist;
            nearestEnemy = u;
          }
        }
        if (nearestEnemy) {
          const damageMultiplier = attackerDoctrine.nativeKillChainEnabled ? 1.0 : 0.6;
          const chainDamage = Math.max(1, Math.floor(preview.result.defenderDamage * damageMultiplier));
          const newHp = Math.max(0, nearestEnemy.hp - chainDamage);
          const chainUnits = new Map(current.units);
          chainUnits.set(nearestEnemy.id, { ...nearestEnemy, hp: newHp });
          // If the chain killed the target, remove from factions
          if (newHp <= 0) {
            chainUnits.delete(nearestEnemy.id);
            current = { ...current, units: chainUnits, factions: removeDeadUnitsFromFactions(current.factions, chainUnits) };
          } else {
            current = { ...current, units: chainUnits };
          }
          // Increment chain counter on attacker
          const updatedChainUnit = current.units.get(preview.attackerId);
          if (updatedChainUnit) {
            current = writeUnitToState(current, {
              ...updatedChainUnit,
              killChainCountThisTurn: (updatedChainUnit.killChainCountThisTurn ?? 0) + 1,
            });
          }
          baseResolution.killChainApplied = true;
        }
      }
    }
  }
  // Retreat capture
  const retreatCaptureChance = atk.getStat('retreatCaptureChance');
  let updatedRetreatCaptured = retreatCaptured;
  if (!defenderActuallyDestroyed && preview.result.defenderFled && nextAttacker.hp > 0 && (attackerDoctrine?.captureRetreatEnabled || retreatCaptureChance > 0)) {
    const retreatChance = (attackerDoctrine?.captureRetreatEnabled ? 0.15 : 0) + retreatCaptureChance;
    const retreatSlaveHp = attackerDoctrine?.slaveHpFraction ?? 0.25;
    const retreatSlaveOverrides = buildSlaveOverrides(attackerDoctrine);
    const retreatCapture = attemptNonCombatCapture(
      current,
      preview.attackerId,
      preview.defenderId,
      registry,
      retreatChance,
      retreatSlaveHp,
      0,
      current.rngState,
      retreatSlaveOverrides,
    );
    current = retreatCapture.state;
    updatedRetreatCaptured = retreatCapture.captured;
  }
  // Slaving T3 native — Captive Champion: every 5 captures spawn a promoted unit
  const anyCapture = capturedOnKill || pressGangCaptured || updatedRetreatCaptured;
  if (anyCapture && attackerDoctrine?.slaverTranscendenceEnabled && nextAttacker.hp > 0) {
    const captorFaction = current.factions.get(attacker.factionId);
    if (captorFaction && captorFaction.slaveCaptureCount > 0 && captorFaction.slaveCaptureCount % 5 === 0) {
      const championPrototype = current.prototypes.get(defender.prototypeId);
      if (championPrototype) {
        const spawnHex = getNeighbors(nextAttacker.position).find(hex => {
          const tile = current.map?.tiles.get(hexToKey(hex));
          if (!tile) return false;
          return !getUnitAtHex(current, hex);
        });
        if (spawnHex) {
          const stats = championPrototype.derivedStats;
          const championUnit: Unit = {
            id: createUnitId(),
            factionId: attacker.factionId,
            position: spawnHex,
            facing: nextAttacker.facing,
            hp: stats.hp,
            maxHp: stats.hp,
            movesRemaining: stats.moves,
            maxMoves: stats.moves,
            attacksRemaining: 1,
            xp: 0,
            veteranLevel: 'seasoned' as import('../../core/enums.js').VeteranLevel,
            status: 'ready' as import('../../core/enums.js').UnitStatus,
            prototypeId: defender.prototypeId,
            history: [{ type: 'captive_champion', timestamp: current.round, details: { round: current.round, fromCaptureOf: defender.id } }],
            morale: 75,
            routed: false,
            poisonStacks: 0,
            poisonTurnsRemaining: 0,
            isStealthed: false,
            turnsSinceStealthBreak: 0,
            learnedAbilities: [],
          };
          const champUnits = new Map(current.units);
          champUnits.set(championUnit.id, championUnit);
          const champFactions = new Map(current.factions);
          champFactions.set(attacker.factionId, {
            ...captorFaction,
            unitIds: [...captorFaction.unitIds, championUnit.id],
          });
          current = { ...current, units: champUnits, factions: champFactions };
          baseResolution.captiveChampionSpawned = true;
        }
      }
    }
  }
  // Slaving T2 — Slave market: +1 production to nearest city on capture
  if (anyCapture && attackerDoctrine?.captureRetreatEnabled && nextAttacker.hp > 0) {
    const nearestCity = getNearestFriendlyCity(current, attacker.factionId, defender.position);
    if (nearestCity) {
      const updatedCities = new Map(current.cities);
      updatedCities.set(nearestCity.id, {
        ...nearestCity,
        productionProgress: nearestCity.productionProgress + 1,
      });
      current = { ...current, cities: updatedCities };
    }
  }
  ctx.current = current;
  ctx.resolution = baseResolution;
  ctx.feedback = feedback;
  ctx.greedyLootGained = greedyLootGained;
  ctx.pursuitMovementRestored = pursuitMovementRestored;
  ctx.chargeSplashDamage = chargeSplashDamage;
  ctx.chargeSplashTargetsHit = chargeSplashTargetsHit;
  ctx.armadaChainDamage = armadaChainDamage;
  ctx.poisonDetonated = poisonDetonated;
  ctx.myceliumTargets = myceliumTargets;
  ctx.retreatCaptured = updatedRetreatCaptured;
  ctx.sporeJumpTargets = 0; // not set in this phase, but ctx tracks it
}
