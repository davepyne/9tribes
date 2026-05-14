// ============================================================================
// 9 Tribes — Domain Catalog (single source of truth)
// ============================================================================
//
// This module replaces the previous src/content/base/research.json and
// src/content/base/ability-domains.json files. All domain data — ability
// metadata, tier progressions, descriptions, effect flags — lives here in
// typed TypeScript. Backend systems and frontend view-models both import
// from this module; the frontend MUST NOT duplicate this data.
//
// Design intent for the T1 -> T2 -> T3 arcs:
//   - Each tier introduces a NEW VERB, not just a bigger number.
//   - Native T1 is qualitatively distinct from the foreign T1 effect, not
//     just a flavor note.
//   - Native T3 is a different CLASS of mechanic from the foreign T3,
//     never a threshold tune of the same thing.
//   - Where possible, native capstones add a unique action verb (Bastion,
//     Oasis, Maelstrom, Submerge, Sapling) that only the native tribe gets.
//
// Effect-flag wiring status:
//   - Flags marked `// wired` are consumed by combat/movement/healing/etc.
//     systems today (see src/systems/capabilityDoctrine.ts).
//   - Flags marked `// design` are part of the catalog as the canonical
//     design but are not yet wired in combat code; they are tracked in
//     docs/tech-tree-rework-notes.md for follow-up implementation.
// ============================================================================

import type {
  ResearchDomainDef,
  ResearchNodeDef,
} from '../../data/registry/types.js';

// ----------------------------------------------------------------------------
// Ability domain schema
// ----------------------------------------------------------------------------
//
// Ability domains describe the "shape" of each domain at the registry level:
// who its native faction is, what tags it carries (used by knowledge/synergy
// systems), and a baseEffect block that exists for legacy consumers
// (signatureAbilitySystem reads specific fields like baseEffect.value from
// the fortress entry, baseEffect.selfHeal/allyHeal from nature_healing,
// baseEffect.coastDebuff from tidal_warfare). The actual tier mechanics
// live on the ResearchDomainDef nodes below.

export interface AbilityDomainDef {
  id: string;
  name: string;
  nativeFaction: string;
  restrictedToNative?: boolean;
  tags: string[];
  baseEffect: AbilityBaseEffect;
}

// Permissive shape: legacy consumers (signatureAbilitySystem) duck-type into
// specific fields (`value`, `selfHeal`, `allyHeal`, `coastDebuff`, ...). The
// only universal contract is `type` and `description`.
export interface AbilityBaseEffect {
  type: string;
  description: string;
  [key: string]: unknown;
}

// ----------------------------------------------------------------------------
// Helper: build a research domain entry from a compact spec
// ----------------------------------------------------------------------------

interface TierSpec {
  name: string;
  type: string;
  description: string;
  nativeDescription?: string;
  effect: Record<string, unknown>;
}

interface DomainSpec {
  id: string;
  name: string;
  t1: TierSpec;
  t2: TierSpec;
  t3: TierSpec;
}

function buildResearchDomain(spec: DomainSpec): ResearchDomainDef {
  const t1: ResearchNodeDef = {
    id: `${spec.id}_t1`,
    name: spec.t1.name,
    domain: spec.id,
    tier: 1,
    xpCost: 0,
    prerequisites: [],
    unlocks: [],
    codifies: [spec.id],
    qualitativeEffect: {
      type: spec.t1.type,
      description: spec.t1.description,
      ...(spec.t1.nativeDescription ? { nativeDescription: spec.t1.nativeDescription } : {}),
      effect: spec.t1.effect,
    },
  };
  const t2: ResearchNodeDef = {
    id: `${spec.id}_t2`,
    name: spec.t2.name,
    domain: spec.id,
    tier: 2,
    xpCost: 60,
    prerequisites: [`${spec.id}_t1`],
    unlocks: [],
    qualitativeEffect: {
      type: spec.t2.type,
      description: spec.t2.description,
      ...(spec.t2.nativeDescription ? { nativeDescription: spec.t2.nativeDescription } : {}),
      effect: spec.t2.effect,
    },
  };
  const t3: ResearchNodeDef = {
    id: `${spec.id}_t3`,
    name: spec.t3.name,
    domain: spec.id,
    tier: 3,
    xpCost: 100,
    prerequisites: [`${spec.id}_t2`],
    unlocks: [],
    qualitativeEffect: {
      type: spec.t3.type,
      description: spec.t3.description,
      ...(spec.t3.nativeDescription ? { nativeDescription: spec.t3.nativeDescription } : {}),
      effect: spec.t3.effect,
    },
  };
  return {
    id: spec.id,
    name: spec.name,
    nodes: {
      [t1.id]: t1,
      [t2.id]: t2,
      [t3.id]: t3,
    },
  };
}

// ============================================================================
// 1. VENOMCRAFT — Jungle Clans
// ----------------------------------------------------------------------------
// Theme: Patient corruption. Poison propagates, mutates, and rewrites the
// battlefield itself. Each tier is about *how* the poison spreads:
//   T1 apply  ->  T2 propagate  ->  T3 transform terrain
// ============================================================================

const VENOM_RESEARCH = buildResearchDomain({
  id: 'venom',
  name: 'Venomcraft',
  t1: {
    name: 'Toxic Strikes',
    type: 'venomous_strikes',
    description: 'All attacks apply 1 poison stack on hit (1 dmg/turn for 3 turns; max 2 stacks).',
    nativeDescription: 'Jungle poison NEVER expires and stacks up to 4. Each stack also reduces enemy movement by 1.',
    effect: { poisonOnAllAttacks: true }, // wired
  },
  t2: {
    name: 'Hunting Spores',
    type: 'contaminate_terrain',
    description: 'When a poisoned enemy dies, their hex becomes contaminated (1 dmg/turn, 3 turns), and 1 poison stack jumps to the nearest enemy within 2 hexes.',
    nativeDescription: 'Hunting Spores jump to ALL enemies within 2 hexes (not just the nearest); contamination lasts 5 turns instead of 3.',
    effect: { contaminateOnKill: true, sporeJumpRadius: 2 }, // contaminateOnKill: wired; sporeJumpRadius: design
  },
  t3: {
    name: 'Mycelium Tide',
    type: 'poison_bonus',
    description: 'Poison-tagged units deal +50% poison damage. Any hex adjacent to 3+ poisoned units becomes a Toxic Bloom (2 dmg/turn for 3 turns).',
    nativeDescription: 'Jungle Clans’ Toxic Blooms are permanent until cleansed, and a kill inside a Bloom propagates 2 fresh poison stacks back to ALL friendly Jungle units within 3 hexes (network detonate).',
    effect: {
      poisonDamageMultiplier: 0.5, // wired
      nativePoisonDetonateOnKill: { damage: 3, stacks: 2, radius: 1 }, // wired (legacy)
      toxicBloomEnabled: true, // design
      myceliumNetworkOnKill: true, // design
    },
  },
});

// ============================================================================
// 2. NATURE HEALING — Druid Circle
// ----------------------------------------------------------------------------
// Theme: Symbiosis. The army merges with terrain; healing flows along
// living ground; kills create new forests.
//   T1 regen  ->  T2 wounded earth  ->  T3 worldroot network / saplings
// ============================================================================

const NATURE_HEALING_RESEARCH = buildResearchDomain({
  id: 'nature_healing',
  name: 'Nature Healing',
  t1: {
    name: 'Rootwell',
    type: 'forest_ambush',
    description: 'All friendly units regen +1 HP/turn; units ending turn on forest/jungle regen +3 HP instead. First-strike in forest terrain.',
    nativeDescription: 'Druid units also cleanse 1 poison stack per turn and shed 1 morale damage per turn.',
    effect: { hpRegenerationBonus: 1, forestFirstStrike: true, forestRegenBonus: 3 }, // first two: wired; forestRegenBonus: design
  },
  t2: {
    name: 'Living Forest',
    type: 'canopy_cover',
    description: 'When a unit takes damage on forest/jungle, the terrain absorbs 25% of it (becomes "wounded earth" for 2 turns — enemies on it suffer -10% defense). Ranged units gain +30% defense in forest/jungle.',
    nativeDescription: 'Druids’ wounded earth heals adjacent allies for +1 HP/turn instead of debuffing enemies.',
    effect: { rangedDefenseInForest: 0.3, woundedEarthEnabled: true }, // rangedDefenseInForest: wired; woundedEarthEnabled: design
  },
  t3: {
    name: 'Worldroot',
    type: 'healing_aura_upgrade',
    description: 'Healing aura range doubled to 2 hexes. Friendly units within 3 hexes of any forest/jungle share 10% of healing.',
    nativeDescription: 'Each kill by a Druid unit converts the target hex into a permanent forest tile (Sapling). The Druid who scored the kill gains a permanent +1 max HP, capped at +3 lifetime.',
    effect: {
      healingAuraRange: 2, // wired
      worldrootShareFraction: 0.1, // design
      saplingOnKill: true, // design
      undyingDefenseAt20: 0.5, // wired (foreign legacy effect retained for the "<20% HP +50% def" rider; native gets Sapling instead)
    },
  },
});

// ============================================================================
// 3. SKIRMISH PURSUIT — Steppe Riders
// ----------------------------------------------------------------------------
// Theme: Momentum chains. A wound is an opening; an opening is a kill;
// a kill is the next charge.
//   T1 move-then-strike  ->  T2 bloodtrail momentum  ->  T3 killing cascade
// ============================================================================

const HITRUN_RESEARCH = buildResearchDomain({
  id: 'hitrun',
  name: 'Skirmish Pursuit',
  t1: {
    name: 'Cold-Stride',
    type: 'skirmish_step',
    description: 'Units that moved before attacking deal +15% damage on that attack and ignore zone-of-control on the approach hex.',
    nativeDescription: 'Steppe Riders can move-attack-MOVE in one turn (free repositioning after attack; no second attack).',
    effect: { moveThenAttackBonus: 0.15, ignoreZocOnApproach: true }, // moveThenAttackBonus: wired; ignoreZocOnApproach: design
  },
  t2: {
    name: 'Bloodtrail',
    type: 'kill_retreat',
    description: 'Wounding an enemy below 50% HP grants the attacker +1 movement next turn (stacks up to +3). After a kill, attacker can retreat 1 hex.',
    nativeDescription: 'Steppe Bloodtrail bonus is +2 movement per wound AND applies immediately the same turn rather than next turn.',
    effect: { retreatAfterKill: true, bloodtrailMovementBonus: 1 }, // retreatAfterKill: wired; bloodtrail: design
  },
  t3: {
    name: 'Killing Stride',
    type: 'hitrun_zoc_ignore',
    description: 'Units with this domain ignore zone of control entirely. After a kill, the attacker may immediately attack a second enemy within range at -40% damage.',
    nativeDescription: 'Steppe Killing Stride has NO damage penalty on chained attacks and may chain up to 3 kills in a single turn, so long as each link is a kill.',
    effect: {
      hitAndRunIgnoresZoc: true, // wired
      killChainEnabled: true, // design
      killChainDamageMultiplier: 0.6, // design (foreign = 60% damage on chained shots; native = 100%)
      universalHitAndRunEnabled: true, // wired (legacy flag still used)
    },
  },
});

// ============================================================================
// 4. FORTRESS DISCIPLINE — Hill Engineers
// ----------------------------------------------------------------------------
// Theme: Built ground. The army becomes the terrain. Each tier moves the
// fortress closer to *being* the unit, not just being adjacent to it.
//   T1 shieldwall  ->  T2 spike lines  ->  T3 living wall / Bastions
// ============================================================================

const FORTRESS_RESEARCH = buildResearchDomain({
  id: 'fortress',
  name: 'Fortress Discipline',
  t1: {
    name: 'Shieldwall',
    type: 'shield_wall',
    description: 'Units adjacent to a friendly ally gain +15% defense. Two adjacent allies grant +25%.',
    nativeDescription: 'Hill Engineers may swap positions with an adjacent ally once per turn at no movement cost (formation discipline).',
    effect: { adjacentAllyDefenseBonus: 0.15, multiAllyDefenseBonus: 0.25, formationSwapEnabled: true }, // first: wired; rest: design
  },
  t2: {
    name: 'Spike Lines',
    type: 'spike_lines',
    description: 'Infantry and ranged units project Zone of Control. Bracing units make adjacent hexes cost +1 movement to enemies; charges into a braced Fortress unit take 1 unavoidable damage.',
    nativeDescription: 'Hill Engineers’ Spike Lines persist for 2 turns after the bracing unit moves away — the engineering stays even when the engineer doesn’t.',
    effect: { spikeLinesEnabled: true, persistentSpikeLinesEnabled: true, zocAuraEnabled: true }, // zocAuraEnabled (legacy zoCAuraEnabled): wired; rest: design
  },
  t3: {
    name: 'Bastion',
    type: 'bastion_construction',
    description: 'Fortress aura grants +25% defense (up from +15%). Three adjacent Fortress units form a "Phalanx": share 50% of damage taken across the group.',
    nativeDescription: 'Hill Engineers may raise a Bastion — a permanent fortification (+400% defense floor for the holding unit, vision aura 3 hexes for allies). Maximum 3 Bastions per game. All Hill units can brace, and the fortress aura range is doubled.',
    effect: {
      fortressAuraDefenseBonus: 0.25, // wired (foreign tier upgrade)
      phalanxDamageShare: 0.5, // design
      canBuildBastion: true, // wired (native): unlocks the build_bastion player action; AI heuristic in bastion.ts. Hard cap 3 per game.
      fortressTranscendenceEnabled: true, // wired (legacy: all-brace + aura range 2)
    },
  },
});

// ============================================================================
// 5. SLAVING — Pirate Lords (restrictedToNative)
// ----------------------------------------------------------------------------
// Theme: Conversion economy. Combat captures fuel the war machine. Slaving
// is the ONE domain that touches the strategic layer (production, prototype
// unlocks) directly, befitting its restricted-to-native status.
//   T1 press-gang  ->  T2 slave markets (economy)  ->  T3 galleon empire (auto-capture + prototype theft)
// ============================================================================

const SLAVING_RESEARCH = buildResearchDomain({
  id: 'slaving',
  name: 'Slaving',
  t1: {
    name: 'Press-Gang',
    type: 'press_gang',
    description: '+10% damage vs wounded enemies (<50% HP). When an enemy is reduced below 30% HP, 10% chance to capture instead of kill — captured units arrive as 1 HP "Slave" prototypes (60% of original stats).',
    effect: {
      damageBonusVsWounded: 0.10, // wired (existing flag named greedyCaptureEnabled)
      captureOnKillChance: 0.10, // wired
      captureHpFraction: 0.01, // arrives at 1% (1 HP-ish)
      captureStatFraction: 0.6, // design
    },
  },
  t2: {
    name: 'Slave Markets',
    type: 'capture_retreat',
    description: 'Captured Slaves now arrive at 50% HP and 60% of original stats. Each captured unit grants +1 production point to the nearest Pirate city. Slaves cannot be routed.',
    effect: {
      captureOnRetreat: 0.15, // wired
      slaveMarketProductionBonus: 1, // design — strategic
      slaveRoutImmune: true, // design
    },
  },
  t3: {
    name: 'Galleon Empire',
    type: 'auto_capture',
    description: 'Auto-capture: any enemy reduced below 30% HP within 2 hexes of a Pirate naval unit is captured at end of combat. Slaves arrive at 70% stats and can earn veterancy.',
    nativeDescription: 'Every 5 captures grants Pirate Lords a "Captive Champion": a free promoted unit using a captured enemy’s prototype, regardless of whether the Pirate Lords have unlocked it themselves.',
    effect: {
      autoCaptureThreshold: 0.3, // wired (extends the existing autoCapture mechanic)
      navalCaptureRadius: 2, // design
      captiveChampionThreshold: 5, // design — strategic
      slaverTranscendenceEnabled: true, // wired (legacy)
    },
  },
});

// ============================================================================
// 6. CAMEL ADAPTATION — Desert Nomads
// ----------------------------------------------------------------------------
// Theme: The map is smaller than you think. Distance becomes a weapon.
//   T1 sand-wise  ->  T2 mirage (stealth-at-distance)  ->  T3 caravan + Oasis
// ============================================================================

const CAMEL_RESEARCH = buildResearchDomain({
  id: 'camel_adaptation',
  name: 'Camel Adaptation',
  t1: {
    name: 'Sand-Wise',
    type: 'endurance',
    description: 'No movement penalty in desert or tundra. +1 movement when starting the turn on harsh terrain (desert, tundra, dunes).',
    nativeDescription: 'Desert Nomads ignore movement penalties on ALL non-impassable terrain.',
    effect: { ignoreDesertMovementPenalty: true, harshTerrainMoveBonus: 1, nomadicTerrainImmunity: true }, // first: wired; nomadicTerrainImmunity: design (used to map to nomadicTranscendenceEnabled)
  },
  t2: {
    name: 'Mirage',
    type: 'terrain_veil',
    description: 'Units in desert or tundra are invisible to enemies more than 2 hexes away (stealth-at-distance, not stealth-on-contact).',
    nativeDescription: 'Nomad Mirage extends to all rough/cover terrain types (forest, jungle, hill, mountain) — the Nomads vanish wherever the land bends light.',
    effect: { permanentStealthInHarshTerrain: true, mirageRange: 2, mirageAllRough: true }, // first: wired; rest: design
  },
  t3: {
    name: 'Caravan Doctrine',
    type: 'rough_terrain_defense',
    description: 'Units in rough terrain gain +20% defense. Camel-class units may carry one allied unit on their hex; the carried unit may disgorge and attack on arrival (combined-arms transport).',
    nativeDescription: 'Desert Nomads may proclaim an Oasis ONCE per game: a chosen hex and its 2-hex neighborhood is permanently converted to desert. Carry/disgorge has no movement penalty for Nomads.',
    effect: {
      roughTerrainDefenseBonus: 0.2, // wired
      caravanCarryEnabled: true, // design
      oasisOncePerGame: true, // design — strategic
      nomadicTranscendenceEnabled: true, // wired (legacy: all-terrain-1-movement)
    },
  },
});

// ============================================================================
// 7. CHARGE — Savannah Lions
// ----------------------------------------------------------------------------
// Theme: Momentum overwhelms positioning. First impact decides the battle;
// charges amplify each other when delivered in formation.
//   T1 stamp  ->  T2 routing force  ->  T3 sundering charge / chain splash
// ============================================================================
//
// IMPORTANT IMPLEMENTATION NOTE: the previous code accidentally granted
// 100% armor penetration via `chargeTranscendenceEnabled` (preview.ts:352).
// That effect actually belongs to Heavy Hitter native T3 (Unbreakable).
// This rework moves the armor-pen capstone back to Heavy Hitter and gives
// Charge a real charge-themed capstone (splash + chain-amplification).

const CHARGE_RESEARCH = buildResearchDomain({
  id: 'charge',
  name: 'Charge',
  t1: {
    name: 'Stamp',
    type: 'battle_momentum',
    description: 'First attack each combat deals +20% damage. If that attack kills, the attacker gains +1 attack action this turn.',
    nativeDescription: 'Savannah Lions’ first-attack bonus applies to the first attack on EACH new target this turn, not just the first attack of combat.',
    effect: { firstChargeNoCooldown: true, firstAttackDamageBonus: 0.2, firstAttackPerTarget: true }, // firstChargeNoCooldown: wired; rest: design
  },
  t2: {
    name: 'Routing Force',
    type: 'stampede',
    description: 'Charges knock enemies back 2 hexes. Charges that deal more than 50% of target max HP also rout the target (-30% attack 2 turns, no retaliation this combat).',
    nativeDescription: 'Routed targets Stampede: they move 2 hexes in a random direction, taking 2 damage if they collide with anything.',
    effect: { chargeKnockback: 2, routOnBigCharge: true, stampedeOnRout: true }, // chargeKnockback: wired; rest: design
  },
  t3: {
    name: 'Sundering Charge',
    type: 'charge_routed_bonus',
    description: 'Charge damage +50% against routed enemies. A charge that kills lets the attacker continue moving in the same line and attack a second enemy.',
    nativeDescription: 'Savannah charges splash: enemies within 1 hex of the target take 50% of charge damage. Charges through friendly Savannah Lions also CHAIN — each ally in the charge line adds +10% damage (up to +50%).',
    effect: {
      chargeRoutedDamageMultiplier: 0.5, // wired
      sunderingChargeContinue: true, // design
      chargeSplashRadius: 1, // design (native)
      chargeChainBonus: 0.1, // design (native, capped at +0.5)
      chargeTranscendenceEnabled: true, // KEEP: still gates terrain-ignoring charges in activateUnit.ts. ARMOR-PEN PATH MOVED OUT OF THIS FLAG.
    },
  },
});

// ============================================================================
// 8. RIVER STEALTH — River People
// ----------------------------------------------------------------------------
// Theme: Water hides everything. The army is the river.
//   T1 eel-skin  ->  T2 predator stance  ->  T3 drowning wake / Submerge
// ============================================================================

const RIVER_STEALTH_RESEARCH = buildResearchDomain({
  id: 'river_stealth',
  name: 'River Stealth',
  t1: {
    name: 'Eel-Skin',
    type: 'wetland_stealth',
    description: 'Units ending their turn on river, coast, or swamp hexes enter stealth.',
    nativeDescription: 'River People’s stealth breaks line-of-sight for adjacent allies as well (cover-projection): allies adjacent to a stealthed River unit are also concealed from distant enemies.',
    effect: { stealthOnWetlandEndOfTurn: true, coverProjectionEnabled: true }, // first: wired; coverProjection: design
  },
  t2: {
    name: 'Predator Stance',
    type: 'terrain_stealth',
    description: 'After attacking from rough terrain, the attacker re-enters stealth. First attack from stealth deals +50% damage and applies Bleed (-1 HP/turn for 3 turns).',
    nativeDescription: 'River People attacks from stealth DO NOT break stealth — the predator stays invisible.',
    effect: { stealthInRoughTerrain: true, predatorStanceBleed: true, persistentStealthOnAttack: true }, // first: wired; rest: design
  },
  t3: {
    name: 'Drowning Wake',
    type: 'stealth_reveal',
    description: 'Stealthed units reveal stealthed enemies within 2 hexes. Revealed enemies lose 1 movement next turn.',
    nativeDescription: 'River People may Submerge: spend an action on a water hex to become untargetable for 1 turn (no attack, no zone of control). They re-emerge in stealth, anywhere along the connected waterway.',
    effect: {
      stealthRevealRange: 2, // wired
      revealMovementPenalty: 1, // design
      submergeEnabled: true, // design — strategic action verb
      stealthCloakAuraEnabled: true, // wired (legacy: cloak-adjacent-allies)
    },
  },
});

// ============================================================================
// 9. TIDAL WARFARE — Coral People (Pirate Lords)
// ----------------------------------------------------------------------------
// Theme: Water as battlefield. Coastlines and rivers become highways.
// Tidal Warfare is "Pirate Lords' second native domain" — they start with
// it learned but not T1-completed. Native bonus applies only if researched.
//   T1 wave-sense  ->  T2 boarding tactics  ->  T3 Maelstrom (one-shot ULT)
// ============================================================================

const TIDAL_RESEARCH = buildResearchDomain({
  id: 'tidal_warfare',
  name: 'Tidal Warfare',
  t1: {
    name: 'Wave-Sense',
    type: 'river_crossing',
    description: 'No movement penalty crossing rivers or coast. +10% attack on coast or river hexes.',
    nativeDescription: 'Pirate Lords gain +1 vision from any coast or river hex (naval scouting heritage).',
    effect: { riverMovementPenalty: 0, coastAttackBonus: 0.1, pirateNavalVision: true }, // first: wired; rest: design
  },
  t2: {
    name: 'Boarding Tactics',
    type: 'tidal_surge',
    description: 'Naval units can attack adjacent coastal land hexes; all units gain +15% attack when on coast or river. Naval units adjacent to your land units grant those land units +15% attack as well.',
    nativeDescription: 'Pirate naval units may carry one extra land unit AND disgorge it in the same turn (combined assault).',
    effect: { navalCoastalAssault: true, tidalSurgeAttackBonus: 0.15, pirateCombinedAssault: true }, // first two: wired; combined: design
  },
  t3: {
    name: 'Maelstrom',
    type: 'naval_coastal_bonus',
    description: 'Naval units gain +25% attack in coastal hexes. Once per game, declare a Maelstrom centered on a coast/river hex: 3 turns, 3-hex radius — all enemy units inside take 2 dmg/turn and lose 1 movement.',
    nativeDescription: 'Pirate Maelstrom is 5-hex radius for 5 turns. Naval kills inside the Maelstrom auto-capture (synergy with Slaving), regardless of HP threshold.',
    effect: {
      navalCoastalAttackBonus: 0.25, // wired
      maelstromRadius: 3, // design (foreign 3 / native 5)
      maelstromDuration: 3, // design (foreign 3 / native 5)
      pirateMaelstromAutoCapture: true, // design
      amphibiousMovementEnabled: true, // wired (legacy: all units cross rivers/coast). Demoted from "the" native bonus to a side rider.
    },
  },
});

// ============================================================================
// 10. HEAVY HITTER — Arctic Wardens
// ----------------------------------------------------------------------------
// Theme: Unstoppable force. Arctic Wardens don't dance — they break.
// FIXES THE PRIOR DEAD-CODE BUG: native T3 now genuinely differs from foreign
// T3 (100% armor pen + Last Stand survival).
//   T1 crushing blow  ->  T2 backbreaker  ->  T3 unbreakable / Last Stand
// ============================================================================

const HEAVY_HITTER_RESEARCH = buildResearchDomain({
  id: 'heavy_hitter',
  name: 'Heavy Hitter',
  t1: {
    name: 'Crushing Blow',
    type: 'anti_fortification',
    description: '+20% damage vs fortified or bracing enemies; +20% damage vs enemies on hill or mountain terrain.',
    nativeDescription: 'Arctic Wardens’ attacks against fortified targets also reduce the target’s defense bonus by 50% for the rest of combat.',
    effect: { damageBonusVsFortified: 0.2, damageBonusVsElevation: 0.2, fortifiedDefenseReduction: 0.5 }, // first: wired; rest: design
  },
  t2: {
    name: 'Backbreaker',
    type: 'damageReflection',
    description: 'When attacked, retaliate by reflecting 25% of damage dealt back to the attacker.',
    nativeDescription: 'Arctic Wardens reflect 50% of damage AND stagger the attacker (-1 movement next turn).',
    effect: { damageReflectionPercent: 0.25, nativeReflectionPercent: 0.5, staggerOnReflect: true }, // first: wired; rest: design
  },
  t3: {
    name: 'Unbreakable',
    type: 'armor_penetration',
    description: 'Ignore 50% of enemy armor. Units cannot be displaced (immune to knockback and Stampede).',
    nativeDescription: 'Arctic Wardens ignore 100% of enemy armor. Last Stand: when reduced to 0 HP, survive at 1 HP once per combat (and shrug off the killing blow).',
    effect: {
      armorPenetration: 0.5, // wired (foreign)
      cannotBeDisplaced: true, // wired
      nativeArmorPenetration: 1.0, // design — must be wired in preview.ts (replaces the chargeTranscendence cross-wire)
      lastStandPerCombat: true, // design
      heavyTranscendenceEnabled: true, // wired (currently dead code — this rework wires it)
    },
  },
});

// ----------------------------------------------------------------------------
// Aggregate research domains
// ----------------------------------------------------------------------------

export const RESEARCH_DOMAINS: Record<string, ResearchDomainDef> = {
  venom: VENOM_RESEARCH,
  fortress: FORTRESS_RESEARCH,
  charge: CHARGE_RESEARCH,
  hitrun: HITRUN_RESEARCH,
  nature_healing: NATURE_HEALING_RESEARCH,
  camel_adaptation: CAMEL_RESEARCH,
  tidal_warfare: TIDAL_RESEARCH,
  river_stealth: RIVER_STEALTH_RESEARCH,
  slaving: SLAVING_RESEARCH,
  heavy_hitter: HEAVY_HITTER_RESEARCH,
};

// ----------------------------------------------------------------------------
// Ability domain registry
// ----------------------------------------------------------------------------
// The baseEffect blocks below intentionally preserve the field shapes that
// existing legacy consumers depend on:
//   - fortress.baseEffect.value           -> getBulwarkDefenseBonus
//   - nature_healing.baseEffect.selfHeal  -> getNatureHealingAura
//   - nature_healing.baseEffect.allyHeal  -> getNatureHealingAura
//   - tidal_warfare.baseEffect.coastDebuff -> getTidalCoastDebuff
//
// All other fields are descriptive metadata used by the knowledge / synergy
// / signature-ability subsystems via the `tags` array.

export const ABILITY_DOMAINS: Record<string, AbilityDomainDef> = {
  venom: {
    id: 'venom',
    name: 'Venomcraft',
    nativeFaction: 'jungle_clan',
    tags: ['poison'],
    baseEffect: {
      type: 'on_hit_debuff',
      debuff: 'poison',
      damagePerTurn: 1,
      duration: 3,
      description: 'Melee attacks apply 1 poison stack',
    },
  },
  fortress: {
    id: 'fortress',
    name: 'Fortress Discipline',
    nativeFaction: 'hill_clan',
    tags: ['fortress'],
    baseEffect: {
      type: 'aura',
      auraType: 'defense',
      radius: 1,
      value: 0.15,
      target: 'allies',
      description: 'Adjacent friendly units gain +15% defense (Shieldwall)',
    },
  },
  charge: {
    id: 'charge',
    name: 'Charge',
    nativeFaction: 'savannah_lions',
    tags: ['charge', 'elephant', 'cavalry'],
    baseEffect: {
      type: 'on_charge',
      effect: 'strike_first',
      noRetaliationOnKill: true,
      description: 'Charge attacks strike first; if the target dies, attacker takes 0 retaliation damage',
    },
  },
  hitrun: {
    id: 'hitrun',
    name: 'Skirmish Pursuit',
    nativeFaction: 'steppe_clan',
    tags: ['skirmish'],
    baseEffect: {
      type: 'on_combat_end',
      effect: 'pursuit',
      bonusDamage: 2,
      description: 'When the attacker deals more damage than it takes, presses the advantage for +2 damage',
    },
  },
  tidal_warfare: {
    id: 'tidal_warfare',
    name: 'Tidal Warfare',
    nativeFaction: 'coral_people',
    tags: ['naval', 'shock'],
    baseEffect: {
      type: 'zone_control',
      effect: 'amphibious_assault',
      coastDebuff: 0.25,
      description: 'Naval units may attack from water onto land; enemies on coast suffer -25% defense',
    },
  },
  nature_healing: {
    id: 'nature_healing',
    name: 'Nature Healing',
    nativeFaction: 'druid_circle',
    tags: ['druid', 'healing'],
    baseEffect: {
      type: 'aura',
      auraType: 'healing',
      radius: 1,
      selfHeal: 2,
      allyHeal: 1,
      description: 'Druid units heal 2 HP/turn; adjacent allies heal 1 HP/turn',
    },
  },
  camel_adaptation: {
    id: 'camel_adaptation',
    name: 'Camel Adaptation',
    nativeFaction: 'desert_nomads',
    tags: ['camel'],
    baseEffect: {
      type: 'movement',
      effect: 'ignore_terrain',
      description: 'Camel-class units ignore desert and tundra movement penalties',
    },
  },
  river_stealth: {
    id: 'river_stealth',
    name: 'River Stealth',
    nativeFaction: 'river_people',
    tags: ['stealth', 'river'],
    baseEffect: {
      type: 'status',
      effect: 'stealth',
      ambushDamage: 0.50,
      description: 'River-tagged units gain stealth; first attack from stealth deals +50% damage',
    },
  },
  slaving: {
    id: 'slaving',
    name: 'Slaving',
    nativeFaction: 'coral_people',
    restrictedToNative: true,
    tags: ['capture', 'slave'],
    baseEffect: {
      type: 'on_capture',
      effect: 'enslave',
      description: 'Wounded enemies may be captured rather than killed; captives serve under your command',
    },
  },
  heavy_hitter: {
    id: 'heavy_hitter',
    name: 'Heavy Hitter',
    nativeFaction: 'frost_wardens',
    tags: ['heavy', 'armor'],
    baseEffect: {
      type: 'on_hit',
      effect: 'heavy_strike',
      armorPiercing: 0.50,
      description: 'Heavy strikes ignore 50% of enemy armor and deal bonus damage to fortified targets',
    },
  },
};

// ----------------------------------------------------------------------------
// Public helpers
// ----------------------------------------------------------------------------

export function getAllResearchDomains(): ResearchDomainDef[] {
  return Object.values(RESEARCH_DOMAINS);
}

export function getResearchDomainById(id: string): ResearchDomainDef | undefined {
  return RESEARCH_DOMAINS[id];
}

export function getAllAbilityDomains(): AbilityDomainDef[] {
  return Object.values(ABILITY_DOMAINS);
}

export function getAbilityDomainById(id: string): AbilityDomainDef | undefined {
  return ABILITY_DOMAINS[id];
}

export function getDomainIds(): string[] {
  return Object.keys(RESEARCH_DOMAINS);
}
