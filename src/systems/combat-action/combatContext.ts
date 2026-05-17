import type { GameState, Faction } from '../../game/types.js';
import type { Unit } from '../../features/units/types.js';
import type { RulesRegistry } from '../../data/registry/types.js';
import type { FactionId, TileCoord, UnitId } from '../../types.js';
import type { CombatActionPreview, CombatActionFeedback, CombatActionResolution } from './types.js';
import type { SynergyCombatResult } from '../synergyTypes.js';
import { hexDistance } from '../../core/grid.js';
import { applyPoisonDoT } from '../signatureAbilitySystem.js';
import { addResearchProgressToNode, getNextResearchNodeForDomain } from '../researchSystem.js';
import { getEffectiveXpCost } from '../knowledgeSystem.js';
import { resolveCapabilityDoctrine } from '../capabilityDoctrine.js';
import { getPrototype } from '../../game/stateAccess.js';

type Prototype = NonNullable<ReturnType<typeof getPrototype>>;
type DoctrineResult = ReturnType<typeof resolveCapabilityDoctrine>;

export interface CombatContext {
  // Immutable inputs
  readonly state: GameState;
  readonly registry: RulesRegistry;
  readonly preview: CombatActionPreview;
  readonly learnChanceScale: number;

  // Computed once during setup
  readonly attacker: Unit;
  readonly defender: Unit;
  readonly attackerPrototype: Prototype;
  readonly defenderPrototype: Prototype;
  readonly attackerIsRanged: boolean;
  readonly isNavalAttacker: boolean;
  readonly defenderTerrainId: string;
  readonly attackerTerrainId: string;
  readonly isDefenderOnWater: boolean;
  readonly attackerFaction: Faction | undefined;
  readonly defenderFaction: Faction | undefined;
  readonly attackerDoctrine: DoctrineResult | undefined;
  readonly defenderDoctrine: DoctrineResult | undefined;
  readonly atk: SynergyCombatResult;
  readonly def: SynergyCombatResult;

  // Mutable pipeline state
  current: GameState;
  resolution: CombatActionResolution;
  feedback: CombatActionFeedback;
  nextAttacker: Unit;
  nextDefender: Unit;
  defenderActuallyDestroyed: boolean;
  attackerActuallyDestroyed: boolean;

  // Tracking variables consumed by labels phase
  capturedOnKill: boolean;
  retreatCaptured: boolean;
  pressGangCaptured: boolean;
  poisonApplied: boolean;
  reStealthTriggered: boolean;
  reflectionDamageApplied: number;
  combatHealingApplied: number;
  sandstormTargetsHit: number;
  contaminatedHexApplied: boolean;
  pursuitDamageApplied: number;
  greedyLootGained: number;
  pursuitMovementRestored: number;
  chargeSplashDamage: number;
  chargeSplashTargetsHit: number;
  totalKnockbackDistance: number;
  minHpFloor: number;
  woundedEarthAbsorbed: number;
  woundedEarthAlliesHealed: number;
  sporeJumpTargets: number;
  myceliumTargets: number;
  bigChargeRoutTriggered: boolean;
  stampedeDamageApplied: number;
  bombardmentDamageApplied: number;
  fightingRetreatDamage: number;
  emergentSustainHealApplied: number;
  emergentSmiteApplied: number;
  armadaChainDamage: number;
  poisonDetonated: boolean;
  saplingMaxHpBonus: number;
  knockbackCollisionDamage: number;
  hitAndRunTriggered: boolean;
  poisonTrapPositionsRaw: { q: number; r: number }[];
}

export const COMBAT_RESEARCH_BONUS = 1.0;

export function applyCombatResearchBonus(
  state: GameState,
  learnerFactionId: FactionId,
  enemyFactionId: FactionId,
  registry: RulesRegistry,
): GameState {
  const learner = state.factions.get(learnerFactionId);
  const enemy = state.factions.get(enemyFactionId);
  if (!learner || !enemy) return state;

  const domainId = enemy.nativeDomain;
  if (!learner.learnedDomains.includes(domainId)) return state;

  const research = state.research.get(learnerFactionId);
  if (!research) return state;

  const nextNode = getNextResearchNodeForDomain(domainId, research.completedNodes);
  if (!nextNode) return state;

  const domain = registry.getAllResearchDomains().find(d => d.id === domainId);
  const nodeDef = domain?.nodes[nextNode.nodeId];
  if (!nodeDef) return state;

  const domainCost = getEffectiveXpCost(learner, domainId, nodeDef.xpCost);

  const { state: updatedResearch } = addResearchProgressToNode(
    research, nextNode.nodeId, domainCost, COMBAT_RESEARCH_BONUS,
  );

  const prevCombat = updatedResearch.combatResearchBonusThisTurn ?? {};
  updatedResearch.combatResearchBonusThisTurn = {
    ...prevCombat,
    [domainId]: (prevCombat[domainId] ?? 0) + COMBAT_RESEARCH_BONUS,
  };

  const researchMap = new Map(state.research);
  researchMap.set(learnerFactionId, updatedResearch);
  return { ...state, research: researchMap };
}

export interface PoisonInRangeOptions {
  factionFilter: 'friendlies' | 'enemies';
  filterFactionId: FactionId;
  stacks: number;
  damagePerStack: number;
  duration: number;
  provenance?: { factionId: FactionId; prototypeId?: string };
}

export function applyPoisonInRange(
  units: ReadonlyMap<UnitId, Unit>,
  center: TileCoord,
  radius: number,
  opts: PoisonInRangeOptions,
): { units: Map<UnitId, Unit>; targetsHit: number } {
  const newUnits = new Map(units);
  let targetsHit = 0;

  for (const [uid, u] of newUnits) {
    if (opts.factionFilter === 'friendlies' && u.factionId !== opts.filterFactionId) continue;
    if (opts.factionFilter === 'enemies' && u.factionId === opts.filterFactionId) continue;
    if (u.hp <= 0) continue;
    if (hexDistance(u.position, center) > radius) continue;

    let poisonedUnit = applyPoisonDoT(u, opts.stacks, opts.damagePerStack, opts.duration);
    if (opts.provenance) {
      poisonedUnit = { ...poisonedUnit, poisonedBy: opts.provenance.factionId };
      if (opts.provenance.prototypeId !== undefined) {
        poisonedUnit = { ...poisonedUnit, poisonSourcePrototypeId: opts.provenance.prototypeId };
      }
    }
    newUnits.set(uid, poisonedUnit);
    targetsHit++;
  }

  return { units: newUnits, targetsHit };
}
