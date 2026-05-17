import type { CombatContext } from './combatContext.js';
import { applyPoisonInRange } from './combatContext.js';
import { addZoneEffect } from '../zoneEffectSystem.js';
import { createZoneEffectId, createUnitId } from '../../core/ids.js';
import { EMERGENT_PARAMS } from '../emergentRuleParams.js';
import { isWaterTerrain, isCoverTerrain } from '../terrainUtils.js';
import { getNeighbors, hexDistance, hexToKey } from '../../core/grid.js';
import { applyPoisonDoT, enterStealth } from '../signatureAbilitySystem.js';
import { getPrototype } from '../../game/stateAccess.js';
import { createFreshUnit } from '../../features/units/createUnit.js';
import { getUnitAtHex } from '../occupancySystem.js';
import { getPoisonOnAttack } from '../factionIdentitySystem.js';
import { setTerrainAt } from '../terrainMutationSystem.js';
import { getHistoryByType, addHistoryEntry } from '../historySystem.js';
import { pushCombatEffect } from './labeling.js';
import { writeUnitToState, rotateUnitToward, healUnit, applyDamageToAdjacentEnemies } from './helpers.js';
import type { Unit } from '../../features/units/types.js';
import type { UnitId } from '../../types.js';

export function applyStatusEffects(ctx: CombatContext): void {
  const { preview, attacker, defender, attackerPrototype, attackerFaction,
    attackerDoctrine, defenderDoctrine, atk, def } = ctx;
  let current = ctx.current;
  let updatedAttacker = current.units.get(preview.attackerId);
  let updatedDefender = current.units.get(preview.defenderId);
  // Poison application
  const canInflictPoison = (attackerPrototype.tags?.includes('poison') ?? false)
    || (attackerDoctrine?.toxicBulwarkEnabled === true)
    || (attackerDoctrine?.venomousStrikesEnabled === true);
  let poisonApplied = false;
  if (!ctx.defenderActuallyDestroyed && preview.result.defenderDamage > 0 && canInflictPoison && updatedDefender) {
    updatedDefender = applyPoisonDoT(
      updatedDefender,
      attackerDoctrine?.poisonStacksOnHit ?? 1,
      attackerDoctrine?.poisonDamagePerStack ?? 1,
      3,
    );
    updatedDefender = { ...updatedDefender, poisonedBy: attacker.factionId, poisonSourcePrototypeId: attacker.prototypeId } as Unit;
    current = writeUnitToState(current, updatedDefender);
    poisonApplied = true;
  }
  // Synergy poison stacks
  const synergyPoisonStacks = atk.getStat('poisonStacks');
  if (synergyPoisonStacks > 0 && !ctx.defenderActuallyDestroyed && updatedDefender) {
    updatedDefender = current.units.get(preview.defenderId);
    if (updatedDefender && updatedDefender.hp > 0) {
      updatedDefender = applyPoisonDoT(updatedDefender, synergyPoisonStacks, 1, 3);
      updatedDefender = { ...updatedDefender, poisonedBy: attacker.factionId } as Unit;
      current = writeUnitToState(current, updatedDefender);
      poisonApplied = true;
    }
  }
  const emergentPoisonPerHit = atk.getStat('emergentPoisonPerHit');
  if (emergentPoisonPerHit > 0 && !ctx.defenderActuallyDestroyed) {
    updatedDefender = current.units.get(preview.defenderId);
    if (updatedDefender && updatedDefender.hp > 0) {
      updatedDefender = applyPoisonDoT(updatedDefender, emergentPoisonPerHit, 1, 3);
      updatedDefender = { ...updatedDefender, poisonedBy: attacker.factionId } as Unit;
      current = writeUnitToState(current, updatedDefender);
      poisonApplied = true;
    }
  }
  // Jungle Stalkers passive: extra poison stacks in native terrain (stacks with venom_t1)
  if (!ctx.defenderActuallyDestroyed) {
    const junglePoison = getPoisonOnAttack(attackerFaction, ctx.attackerTerrainId);
    if (junglePoison && junglePoison.stacks > 0) {
      updatedDefender = current.units.get(preview.defenderId);
      if (updatedDefender && updatedDefender.hp > 0) {
        updatedDefender = applyPoisonDoT(updatedDefender, junglePoison.stacks, 1, 3);
        updatedDefender = { ...updatedDefender, poisonedBy: attacker.factionId } as Unit;
        current = writeUnitToState(current, updatedDefender);
        poisonApplied = true;
      }
    }
  }
  // Contaminated hex
  let contaminatedHexApplied = false;
  if (ctx.defenderActuallyDestroyed && attackerDoctrine?.contaminateTerrainEnabled) {
    const contaminatedHexes = new Set(current.contaminatedHexes);
    contaminatedHexes.add(hexToKey(defender.position));
    current = { ...current, contaminatedHexes };
    contaminatedHexApplied = true;
  }
  // Spore-jump (venom_t2): when a poisoned enemy dies, jump poison stacks to nearby enemies.
  let sporeJumpTargets = 0;
  if (ctx.defenderActuallyDestroyed && attackerDoctrine?.sporeJumpEnabled
    && ctx.nextAttacker.hp > 0 && defender.poisonStacks > 0) {
    let sporeJumped = false;
    let sporeUnits = new Map(current.units);
    if (attackerDoctrine.sporeJumpAllEnemies) {
      const result = applyPoisonInRange(current.units, defender.position, 2, {
        factionFilter: 'enemies', filterFactionId: attacker.factionId,
        stacks: 1, damagePerStack: attackerDoctrine.poisonDamagePerStack, duration: 3,
        provenance: { factionId: attacker.factionId, prototypeId: attacker.prototypeId },
      });
      if (result.targetsHit > 0) { sporeUnits = result.units; sporeJumped = true; sporeJumpTargets = result.targetsHit; }
    } else {
      sporeUnits = new Map(current.units);
      const jumpPoison = (id: UnitId, u: Unit) => {
        const jumped = applyPoisonDoT(u, 1, attackerDoctrine.poisonDamagePerStack, 3);
        sporeUnits.set(id, { ...jumped, poisonedBy: attacker.factionId, poisonSourcePrototypeId: attacker.prototypeId });
      };
      let nearestId: UnitId | null = null;
      let nearestDist = Infinity;
      for (const [uid, u] of sporeUnits) {
        if (u.factionId === attacker.factionId || u.hp <= 0) continue;
        const dist = hexDistance(u.position, defender.position);
        if (dist <= 2 && dist < nearestDist) { nearestDist = dist; nearestId = uid; if (dist === 1) break; }
      }
      if (nearestId) { jumpPoison(nearestId, sporeUnits.get(nearestId)!); sporeJumped = true; sporeJumpTargets = 1; }
    }
    if (sporeJumped) { current = { ...current, units: sporeUnits }; ctx.resolution.sporeJumpApplied = true; }
  }
  // Toxic Spread (venom+venom): when a poisoned enemy dies, spread poison to adjacent enemies
  const toxicSpreadTransferRadius = atk.getStat('toxicSpreadTransferRadius');
  if (ctx.defenderActuallyDestroyed && toxicSpreadTransferRadius > 0
    && defender.poisonStacks > 0 && ctx.nextAttacker.hp > 0) {
    const spreadStacks = atk.getStat('toxicSpreadTransferStacks');
    const spreadResult = applyPoisonInRange(current.units, defender.position, toxicSpreadTransferRadius, {
      factionFilter: 'enemies', filterFactionId: attacker.factionId,
      stacks: spreadStacks, damagePerStack: attackerDoctrine?.poisonDamagePerStack ?? 1, duration: 3,
      provenance: { factionId: attacker.factionId, prototypeId: attacker.prototypeId },
    });
    if (spreadResult.targetsHit > 0) { current = { ...current, units: spreadResult.units }; }
  }
  // Sapling: Nature Healing T3 native — cap +3 lifetime
  let saplingMaxHpBonus = 0;
  if (ctx.defenderActuallyDestroyed && attackerDoctrine?.saplingOnKillEnabled && ctx.nextAttacker.hp > 0) {
    current = setTerrainAt(current, defender.position, 'forest');
    const saplingKillCount = getHistoryByType(ctx.nextAttacker, 'sapling_kill').length;
    if (saplingKillCount < 3) {
      updatedAttacker = addHistoryEntry(ctx.nextAttacker, 'sapling_kill', { hex: defender.position }, current.round);
      updatedAttacker = { ...updatedAttacker, maxHp: updatedAttacker.maxHp + 1, hp: updatedAttacker.hp + 1 };
      current = writeUnitToState(current, updatedAttacker);
      saplingMaxHpBonus = 1;
    }
    ctx.resolution.saplingApplied = true;
    ctx.resolution.saplingMaxHpBonus = saplingMaxHpBonus;
  }
  // Rotation
  updatedAttacker = current.units.get(preview.attackerId);
  updatedDefender = current.units.get(preview.defenderId);
  if (updatedAttacker) { current = writeUnitToState(current, rotateUnitToward(updatedAttacker, defender.position)); }
  updatedAttacker = current.units.get(preview.attackerId);
  if (updatedDefender && !ctx.defenderActuallyDestroyed) {
    current = writeUnitToState(current, rotateUnitToward(updatedDefender, updatedAttacker?.position ?? attacker.position));
  }
  // Reflection damage (doctrine + synergy)
  updatedAttacker = current.units.get(preview.attackerId);
  let reflectionDamageApplied = 0;
  if (defenderDoctrine?.damageReflectionEnabled && preview.result.defenderDamage > 0 && updatedAttacker) {
    const reflectionPct = defenderDoctrine.nativeDamageReflectionEnabled ? 0.5 : 0.25;
    reflectionDamageApplied = Math.max(1, Math.floor(preview.result.defenderDamage * reflectionPct));
    updatedAttacker = {
      ...updatedAttacker,
      hp: Math.max(0, updatedAttacker.hp - reflectionDamageApplied),
      ...(defenderDoctrine.nativeDamageReflectionEnabled ? { nextTurnMovePenalty: 1 } : {}),
    };
    current = writeUnitToState(current, updatedAttacker);
  }
  const totalReflection = def.getStat('damageReflection') + atk.getStat('emergentDamageReflection');
  if (totalReflection > 0 && preview.result.defenderDamage > 0 && updatedAttacker) {
    const synergyReflectedDmg = Math.max(1, Math.floor(preview.result.defenderDamage * totalReflection));
    updatedAttacker = { ...updatedAttacker, hp: Math.max(0, updatedAttacker.hp - synergyReflectedDmg) };
    current = writeUnitToState(current, updatedAttacker);
    reflectionDamageApplied += synergyReflectedDmg;
    ctx.resolution.synergyReflectionDamage = synergyReflectedDmg;
  }
  // Stampede bonus moves, charge cooldown waived
  updatedAttacker = current.units.get(preview.attackerId);
  if (preview.details.stampedeTriggered && updatedAttacker) {
    current = writeUnitToState(current, { ...updatedAttacker, movesRemaining: updatedAttacker.movesRemaining + 1 });
  }
  updatedAttacker = current.units.get(preview.attackerId);
  if (atk.hasFlag('chargeCooldownWaived') && updatedAttacker && updatedAttacker.hp > 0) {
    current = writeUnitToState(current, { ...updatedAttacker, attacksRemaining: Math.max(updatedAttacker.attacksRemaining, 1) });
  }
  // Stealth recharge
  updatedAttacker = current.units.get(preview.attackerId);
  let reStealthTriggered = false;
  if (updatedAttacker && attackerDoctrine?.stealthRechargeEnabled && isCoverTerrain(preview.details.attackerTerrainId)) {
    const hasAdjacentEnemy = getNeighbors(updatedAttacker.position).some((hex) => {
      const neighborUnitId = getUnitAtHex(current, hex);
      if (!neighborUnitId) return false;
      const neighbor = current.units.get(neighborUnitId);
      return Boolean(neighbor && neighbor.hp > 0 && neighbor.factionId !== updatedAttacker!.factionId);
    });
    if (!hasAdjacentEnemy) {
      updatedAttacker = enterStealth({ ...updatedAttacker, turnsSinceStealthBreak: 0 }, attackerPrototype.tags ?? []);
      current = writeUnitToState(current, updatedAttacker);
      reStealthTriggered = updatedAttacker.isStealthed ?? false;
    }
  }
  // Poison traps (+ poison cloud zone effect)
  const hitAndRunTriggered = ctx.feedback.hitAndRunRetreat !== null;
  const poisonTrapPositionsRaw =
    atk.getStat('poisonTrapDamage') > 0
      ? [{ q: attacker.position.q, r: attacker.position.r }]
      : (atk.data.get('poisonTrapPositions') as { x: number; y: number }[] | undefined ?? [])
          .map(p => ({ q: p.x, r: p.y }));
  if (hitAndRunTriggered && poisonTrapPositionsRaw.length > 0) {
    const poisonTraps = new Map(current.poisonTraps);
    for (const position of poisonTrapPositionsRaw) {
      poisonTraps.set(hexToKey(position), {
        damage: atk.getStat('poisonTrapDamage'),
        slow: atk.getStat('poisonTrapSlow'),
        ownerFactionId: attacker.factionId,
      });
    }
    current = { ...current, poisonTraps };
    // Poison Shadow: create a poison_cloud zone effect that prevents healing
    if (atk.hasFlag('emergentPoisonCloudPreventsHealing')) {
      const cloudCenter = poisonTrapPositionsRaw[0] ?? attacker.position;
      current = addZoneEffect(current, {
        id: createZoneEffectId(), type: 'poison_cloud',
        center: { q: cloudCenter.q, r: cloudCenter.r }, radius: 2,
        ownerFactionId: attacker.factionId,
        damagePerTurn: EMERGENT_PARAMS.poison_shadow.poisonCloudDamage,
        movementPenalty: 0, turnsRemaining: 3, createdRound: current.round, preventsHealing: true,
      });
    }
  }
  // Mirage Decoy: spawn a phantom unit at the attacker's hex from spawnOnMap decoy effect
  const decoySpawns = atk.getSpawns('decoy');
  if (decoySpawns.length > 0 && attacker.hp > 0) {
    const attackerProto = getPrototype(ctx.state, attacker.prototypeId);
    if (attackerProto) {
      const decoyPos = decoySpawns[0].position;
      const decoyDuration = decoySpawns[0].duration ?? 2;
      const decoyId = createUnitId();
      const baseDecoy = createFreshUnit(attacker.factionId, { q: decoyPos.x, r: decoyPos.y }, attackerProto, decoyId);
      const decoy: Unit = {
        ...baseDecoy, hp: attacker.hp, maxHp: attacker.maxHp, facing: attacker.facing,
        isDecoy: true, decoyTurnsRemaining: decoyDuration, attacksRemaining: 0, movesRemaining: 0, status: 'spent',
      };
      const unitsWithDecoy = new Map(current.units);
      unitsWithDecoy.set(decoyId, decoy);
      current = { ...current, units: unitsWithDecoy };
      pushCombatEffect(ctx.resolution.triggeredEffects, 'Mirage Decoy', `Phantom decoy spawned at ${decoyPos.x},${decoyPos.y} for ${decoyDuration} turns.`, 'synergy');
    }
  }
  // Heavy regen: heal attacker for % of damage dealt
  updatedAttacker = current.units.get(preview.attackerId);
  const heavyRegenPercent = atk.getStat('heavyRegenPercent');
  if (heavyRegenPercent > 0 && updatedAttacker && preview.result.defenderDamage > 0) {
    const regenAmount = Math.floor(preview.result.defenderDamage * heavyRegenPercent);
    if (regenAmount > 0) { current = healUnit(current, updatedAttacker, regenAmount); ctx.resolution.heavyRegenApplied = regenAmount; }
  }
  // Sandstorm splash + aura
  updatedDefender = current.units.get(preview.defenderId);
  let sandstormTargetsHit = 0;
  const sandstormDamage = atk.getStat('sandstormDamage');
  if (sandstormDamage > 0 && updatedDefender && !ctx.defenderActuallyDestroyed && !ctx.retreatCaptured) {
    const splash = applyDamageToAdjacentEnemies(current, updatedDefender.position, attacker.factionId, sandstormDamage);
    if (splash.hitCount > 0) {
      current = splash.state;
      sandstormTargetsHit = splash.hitCount;
    }
  }
  // Synergy AoE damage
  updatedDefender = current.units.get(preview.defenderId);
  const aoeDamage = atk.getStat('aoeDamage');
  if (aoeDamage > 0 && updatedDefender && !ctx.defenderActuallyDestroyed && !ctx.retreatCaptured) {
    const splash = applyDamageToAdjacentEnemies(current, updatedDefender.position, attacker.factionId, aoeDamage);
    if (splash.hitCount > 0) { current = splash.state; ctx.resolution.aoeTargetsHit = splash.hitCount; }
  }
  // Contaminate flag
  updatedDefender = current.units.get(preview.defenderId);
  if (atk.hasFlag('contaminateActive') && updatedDefender && !ctx.defenderActuallyDestroyed && !ctx.retreatCaptured) {
    const contaminatedHexes = new Set(current.contaminatedHexes);
    contaminatedHexes.add(hexToKey(updatedDefender.position));
    current = { ...current, contaminatedHexes };
    contaminatedHexApplied = true;
  }
  // Stun
  updatedDefender = current.units.get(preview.defenderId);
  const stunDuration = atk.getStat('stunDuration');
  if (stunDuration > 0 && updatedDefender && !ctx.defenderActuallyDestroyed && updatedDefender.hp > 0) {
    current = writeUnitToState(current, { ...updatedDefender, stunDuration, movesRemaining: 0 });
    ctx.resolution.stunApplied = stunDuration;
  }
  // Sandstorm aura: accuracy debuff on adjacent enemies
  updatedDefender = current.units.get(preview.defenderId);
  const sandstormAuraRadius = atk.getStat('sandstormAuraRadius');
  const sandstormAuraDebuff = atk.getStat('sandstormAuraDebuff');
  if (sandstormAuraRadius > 0 && updatedDefender && !ctx.defenderActuallyDestroyed && updatedDefender.hp > 0) {
    const auraUnits = new Map(current.units);
    for (const adjHex of getNeighbors(updatedDefender.position)) {
      const adjUnitId = getUnitAtHex(current, adjHex);
      if (!adjUnitId) continue;
      const adjUnit = auraUnits.get(adjUnitId);
      if (adjUnit && adjUnit.factionId !== attacker.factionId && adjUnit.hp > 0) {
        auraUnits.set(adjUnitId, { ...adjUnit, accuracyDebuff: (adjUnit.accuracyDebuff ?? 0) + sandstormAuraDebuff });
      }
    }
    current = { ...current, units: auraUnits };
  }
  // Lethal Ambush poison: splash poison on instant kill
  const lethalAmbushPoison = atk.getStat('lethalAmbushPoison');
  if (ctx.resolution.instantKillTriggered && lethalAmbushPoison > 0) {
    const result = applyPoisonInRange(current.units, defender.position, 1, {
      factionFilter: 'enemies', filterFactionId: attacker.factionId,
      stacks: lethalAmbushPoison, damagePerStack: 1, duration: 3,
      provenance: { factionId: attacker.factionId },
    });
    if (result.targetsHit > 0) { current = { ...current, units: result.units }; }
  }
  // Withering reduction
  const witheringReduction = atk.getStat('witheringReduction');
  if (witheringReduction > 0 && updatedDefender && !ctx.defenderActuallyDestroyed && updatedDefender.hp > 0) {
    current = writeUnitToState(current, { ...updatedDefender, witherReduction: witheringReduction });
  }
  // Synergy heals (flat + percent + vampiric)
  let combatHealingApplied = 0;
  updatedAttacker = current.units.get(preview.attackerId);
  const synergyFlatHeal = atk.getStat('synergyFlatHeal');
  const synergyPercentHealMaxHp = atk.getStat('synergyPercentHealMaxHp');
  if (updatedAttacker && updatedAttacker.hp > 0) {
    let healed = false;
    if (synergyFlatHeal > 0) {
      updatedAttacker = { ...updatedAttacker, hp: Math.min(updatedAttacker.maxHp, updatedAttacker.hp + synergyFlatHeal) };
      combatHealingApplied += synergyFlatHeal; healed = true;
    }
    if (synergyPercentHealMaxHp > 0) {
      const pctHeal = Math.floor(updatedAttacker.maxHp * synergyPercentHealMaxHp);
      if (pctHeal > 0) {
        updatedAttacker = { ...updatedAttacker, hp: Math.min(updatedAttacker.maxHp, updatedAttacker.hp + pctHeal) };
        combatHealingApplied += pctHeal; healed = true;
      }
    }
    if (healed) current = writeUnitToState(current, updatedAttacker);
  }
  // Vampiric Strike (hitrun+nature_healing): heal attacker for % of damage dealt
  updatedAttacker = current.units.get(preview.attackerId);
  const vampiricStrikeHealPercent = atk.getStat('vampiricStrikeHealPercent');
  if (vampiricStrikeHealPercent > 0 && updatedAttacker && preview.result.defenderDamage > 0) {
    const vampHeal = Math.floor(preview.result.defenderDamage * vampiricStrikeHealPercent);
    if (vampHeal > 0) { current = healUnit(current, updatedAttacker, vampHeal); combatHealingApplied += vampHeal; }
  }
  // Bombardment (fortress+tidal_warfare): naval attacker deals bonus damage to land defender
  let bombardmentDamageApplied = 0;
  updatedDefender = current.units.get(preview.defenderId);
  const bombardmentDamageMultiplier = atk.getStat('bombardmentDamageMultiplier');
  if (bombardmentDamageMultiplier > 0 && updatedDefender && !ctx.defenderActuallyDestroyed
    && isWaterTerrain(preview.details.attackerTerrainId) && !isWaterTerrain(preview.details.defenderTerrainId)) {
    bombardmentDamageApplied = Math.max(1, Math.floor(preview.result.defenderDamage * bombardmentDamageMultiplier));
    current = writeUnitToState(current, { ...updatedDefender, hp: Math.max(0, updatedDefender.hp - bombardmentDamageApplied) });
  }
  // Fighting Retreat (hitrun+heavy_hitter): free strike during hit-and-run
  let fightingRetreatDamage = 0;
  updatedDefender = current.units.get(preview.defenderId);
  if (hitAndRunTriggered && atk.hasFlag('fightingRetreatFreeStrike') && updatedDefender && updatedDefender.hp > 0) {
    fightingRetreatDamage = Math.max(1, Math.floor(preview.result.defenderDamage * (atk.getStat('fightingRetreatDamageMultiplier') || 1)));
    current = writeUnitToState(current, { ...updatedDefender, hp: Math.max(0, updatedDefender.hp - fightingRetreatDamage) });
  }
  // Re-enter stealth
  updatedAttacker = current.units.get(preview.attackerId);
  if (atk.hasFlag('reEnterStealthAfterCombat') && updatedAttacker && updatedAttacker.hp > 0 && !updatedAttacker.isStealthed) {
    updatedAttacker = enterStealth({ ...updatedAttacker, turnsSinceStealthBreak: 0 }, attackerPrototype.tags ?? []);
    current = writeUnitToState(current, updatedAttacker);
    reStealthTriggered = true;
  }
  // Capture aftermath: apply poison and modifiers to captured units
  if (ctx.capturedOnKill) {
    const capturedUnit = current.units.get(preview.defenderId);
    if (capturedUnit && capturedUnit.hp > 0) {
      let updated = { ...capturedUnit };
      const capturePoisonDamage = atk.getStat('capturePoisonDamage');
      const capturePoisonStacks = atk.getStat('capturePoisonStacks');
      const slaveDamageBonus = atk.getStat('slaveDamageBonus');
      const slaveHealPenalty = atk.getStat('slaveHealPenalty');
      if (capturePoisonDamage > 0) {
        updated = applyPoisonDoT(updated, capturePoisonStacks > 0 ? capturePoisonStacks : 1, capturePoisonDamage, 3);
        updated = { ...updated, poisonedBy: attacker.factionId } as Unit;
      }
      if (slaveDamageBonus > 0) { updated = { ...updated, slaveDamageBonus }; }
      if (slaveHealPenalty > 0) { updated = { ...updated, slaveHealPenalty }; }
      if (atk.hasFlag('captureEscapePrevented')) {
        updated = { ...updated, captureEscapePrevented: true };
        ctx.resolution.captureEscapePrevented = true;
      }
      current = writeUnitToState(current, updated);
    }
  }
  // Write back all tracking variables to ctx
  ctx.current = current;
  ctx.poisonApplied = poisonApplied;
  ctx.reStealthTriggered = reStealthTriggered;
  ctx.reflectionDamageApplied = reflectionDamageApplied;
  ctx.combatHealingApplied = combatHealingApplied;
  ctx.sandstormTargetsHit = sandstormTargetsHit;
  ctx.contaminatedHexApplied = contaminatedHexApplied;
  ctx.bombardmentDamageApplied = bombardmentDamageApplied;
  ctx.fightingRetreatDamage = fightingRetreatDamage;
  ctx.sporeJumpTargets = sporeJumpTargets;
  ctx.saplingMaxHpBonus = saplingMaxHpBonus;
  ctx.hitAndRunTriggered = hitAndRunTriggered;
  ctx.poisonTrapPositionsRaw = poisonTrapPositionsRaw;
}
