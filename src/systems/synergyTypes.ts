// Shared types for the synergy system.
// Extracted from synergyEngine.ts and synergyEffects.ts to break circular deps
// and provide a single import site for all synergy-related types.

// --- From synergyEngine.ts ---

export interface DomainConfig {
  id: string;
  name: string;
  nativeFaction: string;
  tags: string[];
  baseEffect: unknown;
}

export interface PairSynergyConfig {
  id: string;
  name: string;
  domains: [string, string];
  requiredTags: string[];
  effect: SynergyEffect;
  description: string;
}

export interface EmergentRuleConfig {
  id: string;
  name: string;
  condition: string;
  domainSets?: Record<string, string[]>;
  mobilityDomains?: string[];
  combatDomains?: string[];
  effect: EmergentEffect;
}

export type SynergyEffect =
  | { type: 'poison_aura'; damagePerTurn: number; radius: number }
  | { type: 'charge_shield' }
  | { type: 'dug_in'; defenseBonus: number }
  | { type: 'land_aura'; defenseBonus: number; radius: number }
  | { type: 'extended_healing'; radius: number; selfHeal: number; allyHeal: number }
  | { type: 'stealth_aura'; revealRadius: number }
  | { type: 'terrain_fortress'; terrainTypes: string[]; defenseBonus: number }
  | { type: 'ram_attack'; knockbackDistance: number }
  | { type: 'combat_healing'; healPercent: number }
  | { type: 'sandstorm'; aoeDamage: number; accuracyDebuff: number }
  | { type: 'double_charge' }
  | { type: 'poison_trap'; damagePerTurn: number; slowAmount: number }
  | { type: 'contaminate'; coastalDamage: number }
  | { type: 'withering'; healingReduction: number }
  | { type: 'stealth_healing' }
  | { type: 'terrain_poison'; damagePerTurn: number; terrainTypes: string[] }
  | { type: 'multiplier_stack'; multiplier: number }
  | { type: 'aura_overlap'; stackingBonus: number }
  | { type: 'stealth_recharge' }
  | { type: 'oasis' }
  | { type: 'permanent_stealth_terrain'; terrainTypes: string[] }
  | { type: 'shadow_network' }
  | { type: 'nomad_network' }
  | { type: 'heal_on_retreat'; healAmount: number }
  | { type: 'impassable_retreat' }
  | { type: 'swarm_speed'; speedBonus: number }
  | { type: 'formation_crush'; knockbackDistance: number; stunDuration: number }
  | { type: 'coastal_nomad'; defenseBonus: number; speedBonus: number }
  | { type: 'sandstorm_aura'; auraRadius: number; enemyAccuracyDebuff: number }
  | { type: 'poison_capture'; damagePerTurn: number; slaveDamageBonus: number; slaveHealPenalty: number }
  | { type: 'heavy_poison'; armorPiercing: number }
  | { type: 'prison_fortress'; defenseBonus: number }
  | { type: 'heavy_fortress'; damageReflection: number }
  | { type: 'capture_charge'; knockbackDistance: number }
  | { type: 'heavy_charge'; stunDuration: number }
  | { type: 'capture_retreat'; captureChance: number }
  | { type: 'heavy_retreat'; damageReduction: number }
  | { type: 'naval_capture'; coastalCaptureBonus: number }
  | { type: 'heavy_naval'; ramDamage: number }
  | { type: 'slave_healing'; slaveHeal: number }
  | { type: 'heavy_regen'; regenPercent: number }
  | { type: 'stealth_capture'; captureChance: number }
  | { type: 'armor_shred'; armorPiercing: number; permanent: boolean }
  | { type: 'lethal_ambush'; poisonStacks: number; actionPointCost: number }
  | { type: 'ambush_charge'; damageBonus: number; revealUntilNextTurn: boolean }
  | { type: 'terrain_slave'; speedBonus: number }
  | { type: 'slave_army'; slaveDamageBonus: number; slaveDefensePenalty: number }
  | { type: 'slave_coercion'; damageBonus: number }
  | { type: 'heavy_mass'; knockbackDistance: number };

export type EmergentEffect =
  // Terrain Lord (was terrain_rider/terrain_charge)
  | { type: 'terrain_lord'; nativeTerrainDamageBonus: number; doubleChargeRangeInNativeTerrain: boolean; terraformCharges: number; description: string }
  // Paladin (was sustain — added smite)
  | { type: 'paladin'; healPercentOfDamage: number; minHp: number; smiteBonusAtFullHp: number; description: string }
  // Terrain Assassin (unchanged)
  | { type: 'permanent_stealth'; terrainTypes: string[]; description: string }
  // Standing Stone (was zone_of_control/anchor)
  | { type: 'standing_stone'; anchoredAuraRadius: number; anchoredDefenseBonus: number; anchoredHealPerTurn: number; anchoredSelfRegen: number; anchoredAdjacentDamage: number; damageSharePercent: number; tarPitMovementPenalty: number; marchAuraRadius: number; marchDefenseBonus: number; marchHealPerTurn: number; description: string }
  // Ghost Army (was mobility_unit)
  | { type: 'ghost_army'; phaseDistance: number; killChainRedeployRange: number; phaseAlliesMovementBonus: number; description: string }
  // Juggernaut (was combat_unit — per-domain signatures)
  | { type: 'juggernaut'; domainSignatures: Record<string, Record<string, number | boolean>>; undyingOncePerCombat: boolean; ignoreZoc: boolean; description: string }
  // Slave Empire (unchanged)
  | { type: 'slave_empire'; captureAuraRadius: number; captureChanceBonus: number; slaveProductionBonus: number; description: string }
  // Raid Camp (was desert_raider)
  | { type: 'raid_camp'; campPlacementRange: number; campDuration: number; campStealthDuration: number; campMovementBonus: number; campEnemyRadius: number; campEnemyDefensePenalty: number; captureBonus: number; description: string }
  // Poison Shadow (unchanged)
  | { type: 'poison_shadow'; stealthPoisonStacks: number; retreatPoisonCloud: boolean; poisonCloudDamage: number; description: string }
  // Iron Turtle (expanded)
  | { type: 'iron_turtle'; crushingZoneRadius: number; crushingZoneDamage: number; crushingZoneMovementPenalty: number; damageReflection: number; ignoreZoc: boolean; description: string }
  // Many-Faced (was adaptive/multiplier)
  | { type: 'many_faced'; bulwarkDefense: number; bulwarkReflection: number; predatorDamage: number; predatorRangeBonus: number; phantomMovementBonus: number; description: string };

export interface ActiveSynergy {
  pairId: string;
  name: string;
  domains: [string, string];
  effect: SynergyEffect;
}

export interface ActiveTripleStack {
  domains: [string, string, string];
  pairs: ActiveSynergy[];
  emergentRule: EmergentRuleConfig;
  name: string;
}

// --- From synergyEffects.ts (renamed CombatResult → SynergyCombatResult) ---

export interface CombatContext {
  attackerId: string;
  defenderId: string;
  attackerTags: string[];
  defenderTags: string[];
  attackerHp: number;
  defenderHp: number;
  terrain: string;
  isCharge: boolean;
  isStealthAttack: boolean;
  isRetreat: boolean;
  isStealthed: boolean;
  position: { x: number; y: number };
  attackerPosition: { x: number; y: number };
  defenderPosition: { x: number; y: number };
}

export interface SynergyCombatResult {
  damage: number;
  defense: number;
  knockbackDistance: number;
  strikeFirst: boolean;
  noRetaliation: boolean;
  poisonStacks: number;
  frostbiteStacks: number;
  slowDuration: number;
  poisonTrapPositions: { x: number; y: number }[];
  routTriggered: boolean;
  additionalEffects: string[];
  chargeShield: boolean;
  antiDisplacement: boolean;
  healOnRetreatAmount: number;
  swarmSpeedBonus: number;
  sandstormDamage: number;
  sandstormAccuracyDebuff: number;
  witheringReduction: number;
  poisonTrapDamage: number;
  poisonTrapSlow: number;
  contaminateActive: boolean;
  frostbiteColdDoT: number;
  frostbiteSlow: number;
  stealthChargeMultiplier: number;
  routThresholdOverride: number | null;
  aoeDamage: number;
  damageReflection: number;
  instantKill: boolean;
  lethalAmbushPoison: number;
  chargeCooldownWaived: boolean;
  formationCrushStacks: number;
  stunDuration: number;
  armorPiercing: number;
  capturePoisonDamage: number;
  capturePoisonStacks: number;
  slaveDamageBonus: number;
  slaveHealPenalty: number;
  chargeCaptureChance: number;
  retreatCaptureChance: number;
  navalCaptureBonus: number;
  stealthCaptureBonus: number;
  captureEscapePrevented: boolean;
  heavyRetreatDamageReduction: number;
  coastalNomadDefense: number;
  coastalNomadSpeed: number;
  heavyNavalRamDamage: number;
  slaveHealAmount: number;
  heavyRegenPercent: number;
  terrainSlaveSpeed: number;
  sandstormAuraRadius: number;
  sandstormAuraDebuff: number;
  slaveArmyDamageBonus: number;
  slaveArmyDefensePenalty: number;
  slaveCoercionDamageBonus: number;
  heavyMassStacks: number;
  // Emergent combat result fields
  emergentSustainHealPercent: number;
  emergentSustainMinHp: number;
  emergentSmiteBonus: number;
  emergentPermanentStealthTerrains: string[];
  emergentCaptureBonus: number;
  emergentDesertCaptureBonus: number;
  // Juggernaut per-domain signature fields
  emergentPoisonPerHit: number;
  emergentDamageReflection: number;
  emergentKnockbackOnKill: number;
  emergentDamageBehindPercent: number;
  emergentFreeReposition: number;
  emergentArmorPierce: number;
  emergentCaptureBelowHpPercent: number;
  emergentBonusDamageAdjacentWater: number;
  emergentUndying: boolean;
  emergentIgnoreZoc: boolean;
  // Iron Turtle expanded
  emergentCrushZoneRadius: number;
  emergentCrushZoneMovementPenalty: number;
  // Many-Faced stance
  emergentManyFacedStance: string;
  emergentManyFacedDefense: number;
  emergentManyFacedReflection: number;
  emergentManyFacedDamage: number;
  emergentManyFacedRangeBonus: number;
  emergentManyFacedMovementBonus: number;
  // Structured fields for synergyRuntime bonus calculations (4e)
  multiplierStackValue: number;
  dugInDefense: number;
  auraOverlapDefense: number;
}

export interface HealingContext {
  unitId: string;
  unitTags: string[];
  baseHeal: number;
  position: { x: number; y: number };
  adjacentAllies: string[];
  isStealthed: boolean;
}
