import type { GameState } from '../../game/types.js';
import type { FactionId, UnitId } from '../../types.js';
import type { Unit } from '../../features/units/types.js';
import type { RulesRegistry } from '../../data/registry/types.js';
import type { SimulationTrace } from './traceTypes.js';
import { log, recordTripleStack } from './traceRecorder.js';
import { getSynergyEngine } from '../synergyRuntime.js';
import type { ActiveTripleStack, ActiveDoubleStack, ActiveSynergy } from '../synergyEngine.js';
import { getDomainProgression } from '../domainProgression.js';
import { EMERGENT_PARAMS } from '../emergentRuleParams.js';
import { addZoneEffect, removeZoneEffectsByOwner } from '../zoneEffectSystem.js';
import { createZoneEffectId } from '../../core/ids.js';
import { hexDistance } from '../../core/grid.js';
import { findMeatiestUnit } from './wildFactionTurn.js';

export function applyGhostArmyMovement(state: GameState, factionId: FactionId, bonusMovement: number): GameState {
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

export function applyJuggernautBonus(state: GameState, factionId: FactionId): GameState {
  const faction = state.factions.get(factionId);
  if (!faction) return state;
  const factions = new Map(state.factions);
  factions.set(factionId, { ...faction, juggernautActive: true });
  return { ...state, factions };
}

export function applyIronTurtleCrushingZone(state: GameState, factionId: FactionId): GameState {
  const anchor = findMeatiestUnit(state, factionId);
  if (!anchor) return state;
  const params = EMERGENT_PARAMS.iron_turtle;
  return addZoneEffect(state, {
    id: createZoneEffectId(),
    type: 'crushing_zone',
    center: anchor.position,
    radius: params.crushingZoneRadius,
    ownerFactionId: factionId,
    damagePerTurn: params.crushingZoneDamage,
    movementPenalty: params.crushingZoneMovementPenalty,
    turnsRemaining: -1,
    createdRound: state.round,
  });
}

export function setFactionSynergyFields(
  state: GameState,
  factionId: FactionId,
  fields: { activeTripleStack?: ActiveTripleStack; activeDoubleStack?: ActiveDoubleStack | null; activeNativeSelfPair?: ActiveSynergy | null },
): GameState {
  const faction = state.factions.get(factionId);
  if (!faction) return state;
  const factions = new Map(state.factions);
  factions.set(factionId, {
    ...faction,
    ...(fields.activeTripleStack !== undefined && { activeTripleStack: fields.activeTripleStack }),
    ...(fields.activeDoubleStack !== undefined && { activeDoubleStack: fields.activeDoubleStack ?? undefined }),
    ...(fields.activeNativeSelfPair !== undefined && { activeNativeSelfPair: fields.activeNativeSelfPair ?? undefined }),
  });
  return { ...state, factions };
}

export function resolveFactionSynergies(
  state: GameState,
  factionId: FactionId,
  registry: RulesRegistry,
  trace?: SimulationTrace,
): GameState {
  const faction = state.factions.get(factionId);
  if (!faction) return state;

  const engine = getSynergyEngine();
  const progression = getDomainProgression(faction, state.research.get(factionId));
  const pairEligible = progression.pairEligibleDomains;
  const emergentEligible = progression.emergentEligibleDomains;
  const nativeT3 = progression.nativeT3Domains.includes(faction.nativeDomain);

  const nativeSelfPair = nativeT3 ? engine.resolveNativeSelfPair(faction.nativeDomain) : null;

  const tripleStack = engine.resolveFactionTriple(pairEligible, emergentEligible);
  if (tripleStack) {
    log(trace, `${faction.name} activates ${tripleStack.name} — ${tripleStack.emergentRule.name} emergent!`);
    recordTripleStack(trace, {
      round: state.round,
      factionId,
      phase: 'activated',
      name: tripleStack.name,
      domains: tripleStack.domains,
      emergentRule: tripleStack.emergentRule.name,
    });
  }

  let current = state;
  let tripleResult: ActiveTripleStack | undefined;
  let doubleResult: ActiveDoubleStack | null | undefined;

  if (tripleStack) {
    const emergentId = tripleStack.emergentRule.id;
    if (emergentId === 'ghost_army') {
      current = applyGhostArmyMovement(current, factionId, EMERGENT_PARAMS.ghost_army.phaseAlliesMovementBonus);
    }
    if (emergentId === 'juggernaut') {
      current = applyJuggernautBonus(current, factionId);
    }
    if (emergentId === 'iron_turtle') {
      current = applyIronTurtleCrushingZone(current, factionId);
    }
    if (emergentId === 'terrain_lord') {
      const tlFaction = current.factions.get(factionId);
      if (tlFaction && (tlFaction.terrainLordTerraformCharges ?? 0) <= 0) {
        const factionsTL = new Map(current.factions);
        factionsTL.set(factionId, { ...tlFaction, terrainLordTerraformCharges: EMERGENT_PARAMS.terrain_lord.terraformCharges });
        current = { ...current, factions: factionsTL };
      }
    }
    if (emergentId === 'standing_stone') {
      const ssFaction = current.factions.get(factionId);
      const stance = ssFaction?.standingStoneStance ?? 'anchored';
      if (stance === 'anchored') {
        const anchor = findMeatiestUnit(current, factionId);
        if (anchor) {
          const ssParams = EMERGENT_PARAMS.standing_stone;
          current = addZoneEffect(current, {
            id: createZoneEffectId(),
            type: 'crushing_zone',
            center: anchor.position,
            radius: ssParams.anchoredAuraRadius,
            ownerFactionId: factionId,
            damagePerTurn: ssParams.anchoredAdjacentDamage,
            movementPenalty: ssParams.tarPitMovementPenalty,
            turnsRemaining: -1,
            createdRound: current.round,
          });
        }
      }
    }
    if (emergentId === 'raid_camp') {
      const rcFaction = current.factions.get(factionId);
      const enemyPositions: { q: number; r: number }[] = [];
      for (const [, eu] of current.units) {
        if (eu.factionId !== factionId && eu.hp > 0) enemyPositions.push(eu.position);
      }
      let forwardUnit: Unit | undefined;
      let minEnemyDist = Infinity;
      for (const uid of (rcFaction?.unitIds ?? [])) {
        const u = current.units.get(uid as UnitId);
        if (!u || u.hp <= 0) continue;
        let closestEnemy = Infinity;
        for (const ep of enemyPositions) {
          closestEnemy = Math.min(closestEnemy, hexDistance(u.position, ep));
        }
        if (closestEnemy < minEnemyDist) {
          minEnemyDist = closestEnemy;
          forwardUnit = u;
        }
      }
      if (forwardUnit) {
        const rcParams = EMERGENT_PARAMS.raid_camp;
        current = addZoneEffect(current, {
          id: createZoneEffectId(),
          type: 'raid_camp',
          center: forwardUnit.position,
          radius: rcParams.campEnemyRadius,
          ownerFactionId: factionId,
          damagePerTurn: 0,
          movementPenalty: 0,
          turnsRemaining: rcParams.campDuration,
          createdRound: current.round,
        });
      }
    }
    if (emergentId === 'many_faced') {
      const stance = current.factions.get(factionId)?.manyFacedLastStance;
      if (stance === 'phantom') {
        current = applyGhostArmyMovement(current, factionId, EMERGENT_PARAMS.many_faced.phantomMovementBonus);
      }
    }
    tripleResult = tripleStack;
  } else {
    const prevTriple = faction.activeTripleStack;
    if (prevTriple) {
      recordTripleStack(trace, {
        round: current.round,
        factionId,
        phase: 'lost',
        name: prevTriple.name,
        domains: prevTriple.domains,
        emergentRule: prevTriple.emergentRule.name,
      });
      if (prevTriple.emergentRule.id === 'iron_turtle' || prevTriple.emergentRule.id === 'standing_stone') {
        current = removeZoneEffectsByOwner(current, 'crushing_zone', factionId);
      }
      if (prevTriple.emergentRule.id === 'raid_camp') {
        current = removeZoneEffectsByOwner(current, 'raid_camp', factionId);
      }
    }

    const doubleStack = engine.resolveFactionDouble(faction.nativeDomain, pairEligible);
    if (doubleStack) {
      log(trace, `${faction.name} double stack: ${doubleStack.pairs.map(p => p.name).join(', ')} [${doubleStack.domains.join('+')}]`);
    }
    doubleResult = doubleStack;
  }

  return setFactionSynergyFields(current, factionId, {
    activeTripleStack: tripleResult,
    activeDoubleStack: doubleResult,
    activeNativeSelfPair: nativeSelfPair,
  });
}
