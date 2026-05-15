import type { FactionId, ResearchNodeId, ComponentId } from '../types.js';
import type { ResearchState } from '../features/research/types.js';
import type { Faction } from '../features/factions/types.js';
import { getNativeDomains } from '../features/factions/types.js';
import type { HybridRecipeDef } from '../data/registry/types.js';
import type { Prototype } from '../features/prototypes/types.js';
import { getDomainProgression } from './domainProgression.js';
import { includesResearchNode, includesComponent } from '../game/stateAccess.js';

export interface ResearchDoctrine {
  // Quantitative effects derived from research tier
  poisonStacksOnHit: number;       // always 1
  poisonDamagePerStack: number;    // venom_t2 -> 2, else 1
  poisonMovePenalty: number;       // venom_t3 -> 1, else 0

  // Tier 1 qualitative effects
  forestAmbushEnabled: boolean;     // nature_healing_t1 - kept for combat-side nature effects
  shieldWallEnabled: boolean;       // fortress_t1 - +15% defense when adjacent to ally
  riverCrossingEnabled: boolean;    // tidal_warfare_t1 - no penalty crossing rivers
  marchingStaminaEnabled: boolean;  // retired: hitrun_t1 reflavored to skirmish_step
  venomousStrikesEnabled: boolean;  // venom_t1 - all attacks apply 1 poison stack
  poisonPersistenceEnabled: boolean; // venom_t1 (native only) - poison stacks never expire
  forcedMarchEnabled: boolean;      // charge_t1 - first attack deals +15% damage
  firstAttackPerTargetEnabled: boolean; // charge_t1 native - first-attack bonus resets per target
  rapidEntrenchEnabled: boolean;    // fortress_t1 (via shield wall - same flag?)

  // Tier 2 qualitative effects
  canopyCoverEnabled: boolean;       // nature_healing_t2 - ranged +30% defense in forest/jungle
  elephantStampede2Enabled: boolean; // charge_t2 - charges knock back 2 hexes
  routOnBigChargeEnabled: boolean;   // charge_t2 - charge dealing >50% maxHp routs defender
  stampedeOnRoutEnabled: boolean;    // charge_t2 native - routed targets stampede 2 hexes randomly
  amphibiousAssaultEnabled: boolean; // tidal_warfare_t2 - naval units can attack coastal hexes
  contaminateTerrainEnabled: boolean; // venom_t2 - killing any enemy contaminates hex
  sporeJumpEnabled: boolean;         // venom_t2 - poisoned kill jumps stacks to nearby enemies
  sporeJumpAllEnemies: boolean;      // venom_t2 native - jump to ALL enemies in range, not just nearest
  zoCAuraEnabled: boolean;           // fortress_t2 - fortified units project ZoC to adjacent hexes
  canBuildBastion: boolean;          // fortress_t3 (native) - Hill Engineers may construct up to 3 Bastions per game
  canDeclareMaelstrom: boolean;     // tidal_warfare_t3 - once-per-game Maelstrom declaration
  maelstromRadius: number;          // 3 (foreign) or 5 (native Pirate Lords)
  maelstromDuration: number;        // 3 (foreign) or 5 (native)
  maelstromAutoCaptureEnabled: boolean; // native only: naval kills in Maelstrom auto-capture

  // Tier 3 qualitative effects
  toxicBulwarkEnabled: boolean;      // venom_t3 - all units apply poison on hit
  fortressTranscendenceEnabled: boolean; // native fortress_t3 - all units can brace, aura range doubled
  chargeTranscendenceEnabled: boolean; // native charge_t3 - melee charges have no cooldown and ignore terrain penalties
  chargeSplashEnabled: boolean;       // native charge_t3 - charge splash: 50% damage to adjacent enemies (will diverge from transcendence)
  chargeChainEnabled: boolean;        // native charge_t3 - chain amplification: +10% per ally in charge line (will diverge from transcendence)
  universalHitAndRunEnabled: boolean; // native hitrun_t3 - all units can attack then retreat
  amphibiousMovementEnabled: boolean; // native tidal_warfare_t3 - all units cross rivers/coast without penalty
  undyingEnabled: boolean;           // native nature_healing_t3 - units below 20% HP gain +50% defense

  // Additional qualitative effects from research
  heatResistanceEnabled: boolean;    // camel_adaptation_t1 - ignore desert/tundra movement penalty
  roughTerrainMovementEnabled: boolean;    // river_stealth_t1 - +1 movement in rough terrain
  greedyCaptureEnabled: boolean;     // slaving_t1 - +15% damage vs wounded enemies (<50% HP)
  antiFortificationEnabled: boolean; // heavy_hitter_t1 - +20% damage vs fortified/bracing enemies
  damageBonusVsElevationEnabled: boolean; // heavy_hitter_t1 - +20% damage vs enemies on hill/mountain
  permanentStealthEnabled: boolean;  // camel_adaptation_t2 - permanent stealth in desert/tundra
  stealthRechargeEnabled: boolean;   // river_stealth_t2 - re-enter stealth after attacking
  predatorBleedEnabled: boolean;     // river_stealth_t2 - first attack from stealth applies bleed
  persistentStealthOnAttackEnabled: boolean; // river_stealth_t2 native - attacks don't break stealth
  captureRetreatEnabled: boolean;    // slaving_t2 - 15% chance to capture wounded enemies on retreat
  damageReflectionEnabled: boolean;  // heavy_hitter_t2 - reflect 25% damage back to attackers
  nativeDamageReflectionEnabled: boolean; // heavy_hitter_t2 native - reflect 50% + stagger attacker
  hitAndRunEnabled: boolean;         // hitrun_t2 - cavalry can attack then retreat in same turn
  bloodtrailMomentumEnabled: boolean; // hitrun_t2 - each wound received grants +1 movement next turn
  woundedEarthEnabled: boolean;          // nature_healing_t2 - terrain absorbs 25% damage on forest/jungle
  woundedEarthHealEnabled: boolean;      // nature_healing_t2 native - adjacent allies heal for absorbed amount instead
  killChainEnabled: boolean;         // hitrun_t3 foreign - follow-up attack at 60% damage after kill
  nativeKillChainEnabled: boolean;   // hitrun_t3 native - follow-up at 100% damage, chain up to 3 kills

  // Phase 2 — Tribe Identity flags
  wetlandStealthEnabled: boolean;    // river_stealth_t1 - stealth on wetland end-of-turn
  skirmishStepEnabled: boolean;      // hitrun_t1 - move then attack bonus
  ignoreZocOnApproachEnabled: boolean; // hitrun_t1 - ignore ZoC on the approach hex when attacking
  pressGangCaptureEnabled: boolean;  // slaving_t1 - capture chance on kill vs wounded
  nativePoisonDetonateEnabled: boolean; // venom_t3 native - poison detonation on kill
  toxicBloomEnabled: boolean;           // venom_t3 - faction may spawn Toxic Blooms at poison-cluster hexes
  toxicBloomPermanent: boolean;         // venom_t3 native - spawned Blooms are permanent (turnsRemaining: -1)
  myceliumNetworkOnKillEnabled: boolean; // venom_t3 native - kill inside own Bloom propagates poison to nearby friendly units
  cleanseToxicBloomEnabled: boolean;    // nature_healing_t3 native - Druid units passively cleanse Toxic Blooms they stand on

  // T3 upgrades
  poisonBonusEnabled: boolean;       // foreign venom_t3 - poison-tagged units deal +50% poison damage
  fortressAuraUpgradeEnabled: boolean; // foreign fortress_t3 - fortress aura grants +25% defense
  chargeRoutedBonusEnabled: boolean;  // foreign charge_t3 - charge damage +50% against routed enemies
  hitrunZocIgnoreEnabled: boolean;    // foreign hitrun_t3 - units with hitrun ignore zone of control
  healingAuraUpgradeEnabled: boolean; // foreign nature_healing_t3 - healing aura range doubled to 2 hexes
  roughTerrainDefenseEnabled: boolean; // foreign camel_adaptation_t3 - units in rough terrain gain +20% defense
  navalCoastalBonusEnabled: boolean;  // foreign tidal_warfare_t3 - naval units gain +25% attack in coastal hexes
  stealthCloakAuraEnabled: boolean;   // native river_stealth_t3 - stealthed units cloak adjacent allies, who also gain sneak attack
  stealthRevealEnabled: boolean;      // foreign river_stealth_t3 - stealth units reveal stealthed enemies within 2 hexes
  autoCaptureEnabled: boolean;        // foreign slaving_t3 - wounded enemies below 25% HP are auto-captured
  nomadicTranscendenceEnabled: boolean; // native camel_adaptation_t3 - all terrain costs 1 movement
  slaverTranscendenceEnabled: boolean;  // native slaving_t3 - auto-capture below 50% HP
  slaveHpFraction: number;             // captured unit HP: 0.01 T1, 0.5 T2+, 1.0 none
  slaveStatFraction: number;           // captured unit stat multiplier: 0.6 T1/T2, 0.7 T3, 1.0 none
  navalCaptureRadius: number;          // T3: friendly naval units extend auto-capture within this radius
  heavyTranscendenceEnabled: boolean;   // native heavy_hitter_t3 - 100% armor penetration
  lastStandEnabled: boolean;           // native heavy_hitter_t3 - survive lethal hit at 1 HP once per turn
  armorPenetrationEnabled: boolean;     // foreign heavy_hitter_t3 - ignore 50% armor, units cannot be displaced
  natureHealingRegenBonus: number;    // nature_healing_t1/T3 - +1 HP/turn, or +3 HP/turn for native T3
  forestRegenBonus: number;           // nature_healing_t1 - +3 regen on forest/jungle instead of +1
}

export type SlaveOverrides = { hpFraction: number; statFraction: number; routImmune?: boolean };

/** Build slave overrides from doctrine, or undefined if slaving is inactive. */
export function buildSlaveOverrides(doctrine: ResearchDoctrine | undefined): SlaveOverrides | undefined {
  if (!doctrine || doctrine.slaveStatFraction >= 1) return undefined;
  return { hpFraction: doctrine.slaveHpFraction, statFraction: doctrine.slaveStatFraction, routImmune: !!doctrine.captureRetreatEnabled };
}

/**
 * Check if a faction has completed specific research nodes.
 */
export function hasCompletedResearchNodes(
  researchState: ResearchState | undefined,
  requiredResearchNodes: string[] | undefined
): boolean {
  return (requiredResearchNodes ?? []).every((nodeId) =>
    researchState?.completedNodes.includes(nodeId as ResearchNodeId)
  );
}

/**
 * Check if a recipe's research requirements are met.
 */
export function meetsRecipeResearchRequirements(
  recipe: HybridRecipeDef,
  researchState: ResearchState | undefined
): boolean {
  void recipe;
  void researchState;
  return true;
}

// Bounded cache for resolveResearchDoctrine.
// Keyed by FactionId with reference-equality invalidation on completedNodes/learnedDomains.
// Auto-evicts when full — bounded to 16 entries (well above the 9-faction game max),
// so production never evicts, while test-created factions naturally cycle out.
const MAX_CACHE_SIZE = 16;
type DoctrineCacheEntry = {
  completedNodesRef: readonly string[];
  learnedDomainsRef: readonly string[];
  nativeDomain: string;
  nativeDomainsRef: readonly string[];
  bastionsBuilt: number;
  maelstromsDeclared: number;
  doctrine: ResearchDoctrine;
};
const doctrineCache = new Map<FactionId, DoctrineCacheEntry>();

/**
 * Resolve the research doctrine for a faction based on completed research nodes.
 * This is the single source of truth for all qualitative combat effects.
 *
 * Results are cached per faction and invalidated when completedNodes or
 * learnedDomains array references change (they are replaced on mutation).
 * No caller changes are needed — caching is transparent.
 */
export function resolveResearchDoctrine(
  researchState: ResearchState | undefined,
  faction?: Pick<Faction, 'nativeDomain' | 'nativeDomains' | 'learnedDomains' | 'id' | 'bastionsBuilt' | 'maelstromsDeclared'>,
): ResearchDoctrine {
  const completedNodes = researchState?.completedNodes ?? [];
  const learnedDomains = faction?.learnedDomains ?? [];
  const nativeDomain = faction?.nativeDomain ?? '';
  const nativeDomains = new Set(getNativeDomains(faction ?? { nativeDomain: '' }));
  const factionId = faction?.id;
  const bastionsBuilt = faction?.bastionsBuilt ?? 0;
  const maelstromsDeclared = faction?.maelstromsDeclared ?? 0;

  // Cache check: reference equality on the mutable arrays + scalar counters
  if (factionId) {
    const cached = doctrineCache.get(factionId);
    if (
      cached
      && cached.completedNodesRef === completedNodes
      && cached.learnedDomainsRef === learnedDomains
      && cached.nativeDomain === nativeDomain
      && cached.nativeDomainsRef === faction?.nativeDomains
      && cached.bastionsBuilt === bastionsBuilt
      && cached.maelstromsDeclared === maelstromsDeclared
    ) {
      return cached.doctrine;
    }
  }

  function hasNode(nodeId: string): boolean {
    return completedNodes.includes(nodeId as ResearchNodeId);
  }

  const progression = faction ? getDomainProgression(faction, researchState) : null;
  const hasNativeT3 = (domainId: string): boolean =>
    progression?.nativeT3Domains.includes(domainId) ?? hasNode(`${domainId}_t3`);
  const hasForeignT3 = (domainId: string): boolean =>
    progression?.foreignT3Domains.includes(domainId) ?? false;

  const doctrine: ResearchDoctrine = {
    // Quantitative effects
    poisonStacksOnHit: hasNode('venom_t1') ? 2 : 1,
    poisonDamagePerStack: hasNode('venom_t2') ? 2 : 1,
    poisonMovePenalty: hasNode('venom_t3') ? 1 : 0,

    // Tier 1 qualitative effects
    forestAmbushEnabled: hasNode('nature_healing_t1'),
    shieldWallEnabled: hasNode('fortress_t1'),
    riverCrossingEnabled: hasNode('tidal_warfare_t1'),
    marchingStaminaEnabled: false, // retired: hitrun_t1 reflavored to skirmish_step
    venomousStrikesEnabled: hasNode('venom_t1'),
    poisonPersistenceEnabled: hasNode('venom_t1') && nativeDomains.has('venom'),
    forcedMarchEnabled: hasNode('charge_t1'),
    firstAttackPerTargetEnabled: hasNode('charge_t1') && nativeDomains.has('charge'),
    rapidEntrenchEnabled: hasNode('fortress_t1') || hasNativeT3('fortress'),

    // Tier 2 qualitative effects
    canopyCoverEnabled: hasNode('nature_healing_t2'),
    elephantStampede2Enabled: hasNode('charge_t2'),
    routOnBigChargeEnabled: hasNode('charge_t2'),
    stampedeOnRoutEnabled: hasNode('charge_t2') && nativeDomains.has('charge'),
    amphibiousAssaultEnabled: hasNode('tidal_warfare_t2'),
    contaminateTerrainEnabled: hasNode('venom_t2'),
    sporeJumpEnabled: hasNode('venom_t2'),
    sporeJumpAllEnemies: hasNode('venom_t2') && nativeDomains.has('venom'),
    zoCAuraEnabled: hasNode('fortress_t2'),
    // Bastion is a native-only capstone (Hill Engineers, fortress_t3 native) with a
    // hard 3-per-game cap tracked on faction.bastionsBuilt. The cap is enforced here
    // so all eligibility checks (player UI, AI heuristic) flow through the same flag.
    canBuildBastion:
      hasNativeT3('fortress')
      && (faction?.bastionsBuilt ?? 0) < 3,
    canDeclareMaelstrom:
      hasNode('tidal_warfare_t3')
      && (faction?.maelstromsDeclared ?? 0) < 1,
    maelstromRadius: hasNativeT3('tidal_warfare') ? 5 : 3,
    maelstromDuration: hasNativeT3('tidal_warfare') ? 5 : 3,
    maelstromAutoCaptureEnabled: hasNativeT3('tidal_warfare'),

    // Tier 3 qualitative effects
    toxicBulwarkEnabled: hasNativeT3('venom'),
    fortressTranscendenceEnabled: hasNativeT3('fortress'),
    chargeTranscendenceEnabled: hasNativeT3('charge'),
    chargeSplashEnabled: hasNativeT3('charge'),
    chargeChainEnabled: hasNativeT3('charge'),
    universalHitAndRunEnabled: hasNativeT3('hitrun'),
    amphibiousMovementEnabled: hasNativeT3('tidal_warfare'),
    undyingEnabled: hasNativeT3('nature_healing'),

    // Additional qualitative effects
    heatResistanceEnabled: hasNode('camel_adaptation_t1'),
    roughTerrainMovementEnabled: false, // retired: river_stealth_t1 reflavored to wetland_stealth
    greedyCaptureEnabled: hasNode('slaving_t1'),
    antiFortificationEnabled: hasNode('heavy_hitter_t1'),
    damageBonusVsElevationEnabled: hasNode('heavy_hitter_t1'),
    permanentStealthEnabled: hasNode('camel_adaptation_t2'),
    stealthRechargeEnabled: hasNode('river_stealth_t2'),
    predatorBleedEnabled: hasNode('river_stealth_t2'),
    persistentStealthOnAttackEnabled: hasNode('river_stealth_t2') && nativeDomains.has('river_stealth'),
    captureRetreatEnabled: hasNode('slaving_t2'),
    damageReflectionEnabled: hasNode('heavy_hitter_t2'),
    nativeDamageReflectionEnabled: hasNode('heavy_hitter_t2') && nativeDomains.has('heavy_hitter'),
    hitAndRunEnabled: hasNode('hitrun_t2'),
    bloodtrailMomentumEnabled: hasNode('hitrun_t2'),
    woundedEarthEnabled: hasNode('nature_healing_t2'),
    woundedEarthHealEnabled: hasNode('nature_healing_t2') && nativeDomains.has('nature_healing'),
    killChainEnabled: hasNode('hitrun_t3'),
    nativeKillChainEnabled: hasNativeT3('hitrun'),

    // Phase 2 — Tribe Identity flags
    wetlandStealthEnabled: hasNode('river_stealth_t1'),
    skirmishStepEnabled: hasNode('hitrun_t1'),
    ignoreZocOnApproachEnabled: hasNode('hitrun_t1'),
    pressGangCaptureEnabled: hasNode('slaving_t1'),
    nativePoisonDetonateEnabled: hasNativeT3('venom'),
    toxicBloomEnabled: hasNode('venom_t3'),
    toxicBloomPermanent: hasNativeT3('venom'),
    myceliumNetworkOnKillEnabled: hasNativeT3('venom'),
    cleanseToxicBloomEnabled: hasNativeT3('nature_healing'),

    // T3 upgrades
    poisonBonusEnabled: hasForeignT3('venom'),
    fortressAuraUpgradeEnabled: hasForeignT3('fortress'),
    chargeRoutedBonusEnabled: hasForeignT3('charge'),
    hitrunZocIgnoreEnabled: hasForeignT3('hitrun'),
    healingAuraUpgradeEnabled: hasForeignT3('nature_healing'),
    roughTerrainDefenseEnabled: hasForeignT3('camel_adaptation'),
    navalCoastalBonusEnabled: hasForeignT3('tidal_warfare'),
    stealthCloakAuraEnabled: hasNativeT3('river_stealth'),
    stealthRevealEnabled: hasForeignT3('river_stealth'),
    autoCaptureEnabled: hasForeignT3('slaving'),
    armorPenetrationEnabled: hasForeignT3('heavy_hitter'),
    heavyTranscendenceEnabled: hasNativeT3('heavy_hitter'),
    lastStandEnabled: hasNativeT3('heavy_hitter'),
    nomadicTranscendenceEnabled: hasNativeT3('camel_adaptation'),
    slaverTranscendenceEnabled: hasNativeT3('slaving'),
    slaveHpFraction: hasNativeT3('slaving') ? 0.5
      : hasNode('slaving_t2') ? 0.5
      : hasNode('slaving_t1') ? 0.01
      : 1.0,
    slaveStatFraction: hasNativeT3('slaving') ? 0.7
      : hasNode('slaving_t1') ? 0.6
      : 1.0,
    navalCaptureRadius: hasNativeT3('slaving') ? 2 : 0,
    natureHealingRegenBonus: hasNativeT3('nature_healing')
      ? 3
      : hasNode('nature_healing_t1')
        ? 1
        : 0,
    forestRegenBonus: hasNode('nature_healing_t1') ? 3 : 0,
  };

  // Store in cache (auto-evict oldest if full)
  if (factionId) {
    if (doctrineCache.size >= MAX_CACHE_SIZE) {
      const firstKey = doctrineCache.keys().next().value;
      if (firstKey !== undefined) doctrineCache.delete(firstKey);
    }
    doctrineCache.set(factionId, {
      completedNodesRef: completedNodes,
      learnedDomainsRef: learnedDomains,
      nativeDomain,
      nativeDomainsRef: faction?.nativeDomains,
      bastionsBuilt,
      maelstromsDeclared,
      doctrine,
    });
  }

  return doctrine;
}

/**
 * Legacy alias for backwards compatibility during migration.
 * @deprecated Use resolveResearchDoctrine instead.
 */
export const resolveCapabilityDoctrine = resolveResearchDoctrine;

/**
 * Check if a prototype has a specific component.
 */
export function prototypeHasComponent(prototype: Prototype, componentId: string): boolean {
  return includesComponent(prototype.componentIds, componentId);
}
