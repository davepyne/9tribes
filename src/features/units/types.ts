// Unit entity types
import type { UnitId, FactionId, PrototypeId } from '../../types.js';
import type { HexCoord } from '../../types.js';
import type { VeteranLevel, UnitStatus } from '../../core/enums.js';

export interface HistoryEntry {
  type: string;
  timestamp: number;
  details: Record<string, unknown>;
}

/**
 * Represents a domain ability learned by killing an enemy unit.
 * When a unit kills an enemy, it has a chance to learn the enemy's faction's native domain.
 */
export interface LearnedAbility {
  domainId: string;       // The domain ID learned (e.g., 'venom', 'frost')
  fromFactionId: FactionId; // The faction ID this domain was learned from
  learnedOnRound: number;  // The round when this ability was learned
}

export interface Unit {
  id: UnitId;
  factionId: FactionId;
  position: HexCoord;
  facing: number;
  hp: number;
  maxHp: number;
  movesRemaining: number;
  maxMoves: number;
  attacksRemaining: number;
  xp: number;
  veteranLevel: VeteranLevel;
  status: UnitStatus;
  prototypeId: PrototypeId;
  history: HistoryEntry[];
  morale: number;
  routed: boolean;
  poisoned?: boolean;
  poisonedBy?: FactionId; // Track which faction inflicted the poison
  poisonSourcePrototypeId?: string; // Track which specific unit/prototype inflicted the poison (for per-unit poison overrides)
  activatedThisRound?: boolean;
  preparedAbility?: 'brace' | 'ambush';
  preparedAbilityExpiresOnRound?: number;
  enteredZoCThisActivation?: boolean;
  poisonStacks: number;
  poisonTurnsRemaining: number; // Turns left before poison expires; 0 = not poisoned
  isStealthed: boolean;
  turnsSinceStealthBreak: number;
  hillDugIn?: boolean;
  digInStacks?: number;  // Hill engineering: stacks from stationary turns (cap 3, each = +5% defense)
  entrenching?: boolean;  // Turn 1 of 2-turn dig-in process
  frozen?: boolean;
  frostbiteStacks?: number;
  frostbiteDoTDuration?: number;
  stunDuration?: number;
  formationCrushStacks?: number;
  accuracyDebuff?: number;
  witherReduction?: number;
  slaveArmyDamageBonus?: number;
  slaveArmyDefensePenalty?: number;
  slaveDamageBonus?: number;
  slaveHealPenalty?: number;
  captureEscapePrevented?: boolean;
  slaveStatFraction?: number;         // captured unit stat multiplier (0.6 T1/T2, 0.7 T3, cleared on re-capture by original faction)
  slaveRoutImmune?: boolean;          // slaving_t2: captured slaves cannot be routed
  nextTurnMovePenalty?: number;
  attackedTargetsThisTurn?: UnitId[];
  lastStandUsedThisTurn?: boolean;
  bleeding?: boolean;
  bleedTurnsRemaining?: number;
  killChainCountThisTurn?: number;
  woundsReceivedThisTurn?: number;
  // Learn-by-kill system: abilities learned from killing enemy faction units
  learnedAbilities: LearnedAbility[];
  // Multi-turn move queue target; undefined = no active queue
  moveQueueDestination?: HexCoord;
}
