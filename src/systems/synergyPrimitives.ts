// ---------------------------------------------------------------------------
// 9 Tribes — Composable Synergy Primitives
// ---------------------------------------------------------------------------
//
// 12 primitive effect types. Future synergies are declarative records, not
// new discriminated-union branches.
// ---------------------------------------------------------------------------

// --- String literal unions ---

export type StatName =
  | 'damage' | 'defense' | 'knockbackDistance' | 'poisonStacks'
  | 'armorPiercing' | 'stunDuration' | 'damageReflection'
  | 'healOnRetreatAmount' | 'sandstormDamage'
  | 'sandstormAccuracyDebuff' | 'aoeDamage' | 'witheringReduction'
  | 'poisonTrapDamage' | 'poisonTrapSlow' | 'chargeCaptureChance'
  | 'retreatCaptureChance' | 'navalCaptureBonus' | 'stealthCaptureBonus'
  | 'coastalNomadDefense'
  | 'heavyNavalRamDamage' | 'slaveHealAmount'
  | 'heavyRegenPercent' | 'sandstormAuraRadius'
  | 'sandstormAuraDebuff' | 'slaveArmyDamageBonus'
  | 'slaveArmyDefensePenalty' | 'slaveCoercionDamageBonus'
  | 'heavyMassStacks' | 'multiplierStackValue' | 'dugInDefense'
  | 'auraOverlapDefense' | 'stealthChargeMultiplier'
  | 'formationCrushStacks' | 'formationFocusBonus'
  | 'formationChainBonus' | 'bloomPulseHeal' | 'bloomPulseSelfHeal'
  | 'bloomPulseAuraRadius' | 'bloomPulseMovementBonus'
  | 'bombardmentRange' | 'bombardmentDamageMultiplier'
  | 'bombardmentLandAuraDefense' | 'mobileStrongholdDefenseBonus'
  | 'mobileStrongholdAlliedDefenseBonus' | 'beachRaidDamageBonus'
  | 'vampiricStrikeHealPercent' | 'fightingRetreatDamageMultiplier'
  | 'tidalCleanseHealPerTurn' | 'amphibiousMovementBonus'
  | 'stealthAuraShareRadius' | 'slaveEconomyHealPerTurn'
  | 'slaveEconomyResourceBonus' | 'toxicSpreadTransferRadius'
  | 'toxicSpreadTransferStacks' | 'formationWallRangedReduction'
  | 'formationPinballCollisionDamage' | 'caravanRelayVisionRange'
  | 'slaveHordeDamageBonus' | 'slaveHordeDefensePenalty'
  | 'capturePoisonDamage' | 'capturePoisonStacks'
  | 'slaveDamageBonus' | 'slaveHealPenalty'
  // Status-derived numeric scalars (written by dispatchApplyStatus)
  | 'frostbiteStacks' | 'frostbiteColdDoT' | 'frostbiteSlow'
  // Heal-primitive accumulators (written by dispatchHeal)
  | 'synergyFlatHeal' | 'synergyPercentHealMaxHp'
  // Emergent stat fields
  | 'emergentSustainHealPercent' | 'emergentSustainMinHp'
  | 'emergentSmiteBonus' | 'emergentCaptureBonus'
  | 'emergentDesertCaptureBonus' | 'emergentPoisonPerHit'
  | 'emergentDamageReflection' | 'emergentKnockbackOnKill'
  | 'emergentDamageBehindPercent' | 'emergentFreeReposition'
  | 'emergentArmorPierce' | 'emergentCaptureBelowHpPercent'
  | 'emergentBonusDamageAdjacentWater' | 'emergentCrushZoneRadius'
  | 'emergentCrushZoneMovementPenalty' | 'emergentManyFacedDefense'
  | 'emergentManyFacedReflection' | 'emergentManyFacedDamage'
  | 'emergentManyFacedRangeBonus' | 'emergentManyFacedMovementBonus'
  | 'emergentKillChainRedeployRange'
  | 'lethalAmbushPoison';

export type FlagName =
  | 'chargeShield' | 'antiDisplacement' | 'contaminateActive'
  | 'instantKill' | 'chargeCooldownWaived' | 'captureEscapePrevented'
  | 'formationWallActive' | 'positionSwapAvailable'
  | 'beachRaidRetreatToWater' | 'ghostPassActive'
  | 'fightingRetreatFreeStrike' | 'caravanPassengerActive'
  | 'mobileStrongholdFortUp' | 'formationFocusIgnoresDefense'
  | 'emergentUndying' | 'emergentIgnoreZoc'
  | 'emergentPermanentStealth' | 'emergentPoisonCloudPreventsHealing'
  | 'reEnterStealthAfterCombat'
  | 'countsAsCity' | 'transportedTroopsStealth';

export type StatusName =
  | 'poison' | 'stun' | 'slow' | 'stealth' | 'bleed'
  | 'armorBroken' | 'rage' | 'corruptionAura' | 'cleanse'
  | 'decoy' | 'frostbite' | 'formationCrush';

export type ActionName =
  | 'displacement' | 'retreat' | 'attackSource' | 'zoc'
  | 'instantKill' | 'movementThrough' | 'pursue'
  | 'captureEscape' | 'terrainPenalty' | 'retaliation'
  | 'retreatThroughImpassable' | 'impassableBlocksRetreat'
  | 'revealNetworkOnKill' | 'heal';

export type VerbName =
  | 'secondCharge' | 'positionSwap' | 'reEnterStealth'
  | 'retreatThroughImpassable' | 'waiveChargeCooldown'
  | 'fortUp' | 'decamp' | 'terraform' | 'submerge'
  | 'declareOasis' | 'carryCaptured' | 'relayMarch'
  | 'phase' | 'redeployOnKill' | 'repositionAfterKill'
  | 'opportunityStrikeOnDisengage' | 'shareVision'
  | 'retreatToWater' | 'instantRetreatWithCaptive';

export type EffectTypeName =
  | 'poisonTrap' | 'sandstorm' | 'contamination' | 'decoy'
  | 'raidCamp' | 'poisonCloud';

// --- Shared sub-types ---

export type TargetSpec =
  | 'self' | 'attacker' | 'defender'
  | { alliesInRadius: number }
  | { enemiesInRadius: number }
  | { role: string }
  | 'position';

export type TriggerSpec =
  | 'onKill' | 'onDeath' | 'onHit' | 'onCapture'
  | 'onKillFromStealth' | 'onAdjacentAllyDeath'
  | 'onExecution' | 'mercyKillOfCaptive'
  | 'onEnterAura' | 'onTurnEnd' | 'onPhase'
  | { event: string; filter?: string };

export type SimpleCondition =
  | 'isCharge'
  | 'isStealthAttack'
  | 'isRetreat'
  | 'isStealthed'
  | 'isWater';

export type ConditionSpec =
  | SimpleCondition
  | `tag:${string}`
  | `terrain:${string}`
  | `domain:${string}`
  | `targetHp${'<' | '<=' | '>' | '>='}${number}`
  | `${string} AND ${string}`
  | `${string} OR ${string}`
  | `!${string}`;

export interface PrimitiveBase {
  condition?: ConditionSpec;
  target?: TargetSpec;
  trigger?: TriggerSpec;
}

export type ScalingAxis =
  | 'stackingAttacker' | 'chainedUnit' | 'runUpHex'
  | 'poisonStack' | 'woundsReceived' | 'hpLost';

// --- 1. statMod ---

export interface StatMod extends PrimitiveBase {
  kind: 'statMod';
  stat: StatName;
  op: 'add' | 'multiply' | 'set' | 'min' | 'max';
  value: number;
  scaling?: {
    per: ScalingAxis;
    max?: number;
  };
  permanent?: boolean;
}

// --- 2. setFlag ---

export interface SetFlag extends PrimitiveBase {
  kind: 'setFlag';
  flag: FlagName;
}

// --- 3. applyStatus ---

export interface ApplyStatus extends PrimitiveBase {
  kind: 'applyStatus';
  status: StatusName;
  stacks?: number;
  duration?: number | 'permanent';
  radius?: number;
  fields?: Record<string, unknown>;
}

// --- 4. knockback ---

export interface Knockback extends PrimitiveBase {
  kind: 'knockback';
  distance: number;
  collisionDamage?: number;
  collisionStun?: number;
  randomDrift?: number;
  extendMultiplier?: number;
}

// --- 5. heal ---

export interface Heal extends PrimitiveBase {
  kind: 'heal';
  amount: number;
  mode: 'flat' | 'percentDamage' | 'percentMaxHp';
}

// --- 6. projectAura ---
// (Forward-referenced by PrimitiveEffect — defined first as an interface
// so the circular reference resolves correctly.)

export interface ProjectAura extends PrimitiveBase {
  kind: 'projectAura';
  radius: number;
  effects: PrimitiveEffect[];
  damagePerTurn?: number;
  movementPenalty?: number;
  terrain?: string;
  globalApply?: boolean;
  pulse?: {
    interval: number;
    effects: PrimitiveEffect[];
  };
}

// --- 7. capture ---

export interface Capture extends PrimitiveBase {
  kind: 'capture';
  chanceBonus?: number;
  countMultiplier?: number;
  hpThreshold?: number;
  silent?: boolean;
  instantRetreat?: boolean;
  rangeFromWater?: number;
  instantEmbark?: boolean;
  doubleDelivery?: boolean;
}

// --- 8. preventAction ---

export interface PreventAction extends PrimitiveBase {
  kind: 'preventAction';
  action: ActionName;
}

// --- 9. spawnOnMap ---

export interface SpawnOnMap extends PrimitiveBase {
  kind: 'spawnOnMap';
  effectType: EffectTypeName;
  position: 'attacker' | 'defender' | 'path' | 'coastal';
  radius?: number;
  duration?: number;
  fields?: Record<string, unknown>;
}

// --- 10. grantVerb ---

export interface GrantVerb extends PrimitiveBase {
  kind: 'grantVerb';
  verb: VerbName;
  range?: number;
  uses?: number | 'unlimited';
  cooldown?: number;
  fields?: Record<string, unknown>;
}

// --- 11. instantKill ---

export interface InstantKill extends PrimitiveBase {
  kind: 'instantKill';
  apCostToVictim?: number;
}

// --- 12. modeSelect ---

export interface ModeSelect extends PrimitiveBase {
  kind: 'modeSelect';
  selector: string;
  collectMode: 'pickOne' | 'collectAll';
  modes: Record<string, PrimitiveEffect[]>;
}

// --- Union ---

export type PrimitiveEffect =
  | StatMod | SetFlag | ApplyStatus | Knockback | Heal
  | ProjectAura | Capture | PreventAction | SpawnOnMap
  | GrantVerb | InstantKill | ModeSelect;
