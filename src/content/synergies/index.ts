// ============================================================================
// 9 Tribes — Synergy Catalog (single source of truth)
// ============================================================================
//
// This module replaces the previous src/content/base/pair-synergies.json and
// src/content/base/emergent-rules.json files. All pair-synergy + emergent
// (triple-stack) data lives here in typed TypeScript. Backend systems and
// frontend view-models both import from this module; no parallel JSON copies.
//
// Why a typed module instead of JSON:
//   - Compile-time validation of every effect shape against the
//     `PrimitiveEffect` union (a JSON import was opaque to the type system
//     and silently allowed typos).
//   - Zero runtime validators — TS guarantees the data shape at build time.
//   - One source of truth shared by backend and frontend; no chance of the
//     two diverging via stale JSON copies.
//
// Layering note: the config types (`PairSynergyConfig`, `EmergentRuleConfig`)
// live in src/systems/synergyTypes.ts. Non-combat tuning values live in
// src/systems/emergentRuleParams.ts.
// ============================================================================

import type {
  PairSynergyConfig,
  EmergentRuleConfig,
} from '../../systems/synergyTypes.js';

// Re-export so consumers can import types and data from a single module.
export type { PairSynergyConfig, EmergentRuleConfig } from '../../systems/synergyTypes.js';

// ----------------------------------------------------------------------------
// Pair synergies (cross-pairs + same-domain self-pairs)
// ----------------------------------------------------------------------------

const PAIR_SYNERGIES_DATA: readonly PairSynergyConfig[] = [
  {
    id: 'venom+fortress',
    name: 'Toxic Bulwark',
    domains: ['venom', 'fortress'],
    requiredTags: ['poison', 'fortress'],
    effects: [{ kind: 'applyStatus', status: 'poison', stacks: 2 }],
    description:
      'Fortress units radiate a poison zone: enemies within 2 hexes of a fortress-tagged unit take 2 poison damage per turn. Poisoned enemies cannot attack the source unit.',
    friendlyFlavor:
      'Your wardens have learned to weep poison. The walls themselves now rebuke any who dare approach.',
    enemyFlavor:
      'Their fortifications smell wrong. Birds fall from the sky downwind. None of our wounded have come back from the perimeter.',
  },
  {
    id: 'venom+charge',
    name: 'Stampeding Death',
    domains: ['venom', 'charge'],
    requiredTags: ['poison', 'elephant'],
    effects: [
      { kind: 'statMod', stat: 'multiplierStackValue', op: 'set', value: 2 },
    ],
    description:
      'Charge attacks inflict double poison duration. Knockback leaves enemies poisoned in their new position',
    friendlyFlavor:
      'Your war beasts trample the enemy under hooves slick with venom. Even those who survive the charge find themselves dying long after the battle.',
    enemyFlavor:
      "We heard them before we saw them — a rumble like thunder, then the screaming. Those who were knocked down got back up, but they didn't stay standing for long. Something in the dust wouldn't stop burning.",
  },
  {
    id: 'venom+hitrun',
    name: 'Poisoned Skirmish',
    domains: ['venom', 'hitrun'],
    requiredTags: ['poison', 'skirmish'],
    effects: [
      { kind: 'statMod', stat: 'poisonTrapDamage', op: 'set', value: 2 },
      { kind: 'statMod', stat: 'poisonTrapSlow', op: 'set', value: 1 },
      { kind: 'spawnOnMap', effectType: 'poisonTrap', position: 'attacker', condition: 'isRetreat' },
    ],
    description:
      'After retreating, the unit leaves a poison trap on the hex it vacated',
    friendlyFlavor:
      'Your skirmishers strike and vanish, leaving nothing but sickness behind. The ground itself becomes your weapon.',
    enemyFlavor:
      "We pursued them into the clearing and they were gone. By morning the whole company was feverish. The healers say something was left in the dirt where they'd stood.",
  },
  {
    id: 'venom+tidal_warfare',
    name: 'Venomous Tide',
    domains: ['venom', 'tidal_warfare'],
    requiredTags: ['poison', 'naval'],
    effects: [{ kind: 'setFlag', flag: 'contaminateActive' }],
    description:
      'Naval units with poison contaminate coastal hexes for 3 turns. Enemies on contaminated coast hexes take 2 poison damage/turn. Stacks up to 6.',
    friendlyFlavor:
      "Your ships blacken the water for leagues. No coastline is safe from your fleet's creeping blight.",
    enemyFlavor:
      'We fished from those shallows for generations. Now the nets come up fouled, the fish belly-up, and the water stings to touch. Their ships pass by and the tide turns dark.',
  },
  {
    id: 'venom+nature_healing',
    name: 'Regenerative Venom',
    domains: ['venom', 'nature_healing'],
    requiredTags: ['poison', 'druid'],
    effects: [{ kind: 'statMod', stat: 'witheringReduction', op: 'set', value: 1.0 }],
    description:
      'Poisoned enemies cannot heal at all (100% healing reduction). Deals 1 corruption damage to any enemy healer attempting to heal a poisoned target.',
    friendlyFlavor:
      'Your venom is a curse upon the very earth. Enemy healers who attempt to mend your victims find their own hands turned against them.',
    enemyFlavor:
      'We brought healers to the front — the best from three cities. Not one could slow the rot. Two of them collapsed trying, clutching their own chests. Whatever they carry, it hates the light of life itself.',
  },
  {
    id: 'venom+river_stealth',
    name: 'Death from the Shadows',
    domains: ['venom', 'river_stealth'],
    requiredTags: ['poison', 'stealth'],
    effects: [
      { kind: 'instantKill', condition: 'isStealthAttack' },
      { kind: 'statMod', stat: 'lethalAmbushPoison', op: 'set', value: 2, condition: 'isStealthAttack' },
      { kind: 'applyStatus', status: 'poison', stacks: 2, condition: 'isStealthAttack' },
    ],
    description:
      'Stealth ambushes with poison deal double damage, apply 2 poison stacks instantly, and cost enemies 1 action point to respond',
    friendlyFlavor:
      'Your assassins strike from nothingness with venom-tipped blades. The first the enemy knows of your presence is the burning in their veins.',
    enemyFlavor:
      "Jarek was standing right beside me. Then he was on the ground, gasping, his veins black. We never saw who did it. We couldn't even muster a response — everyone was frozen, waiting for the next one to fall.",
  },
  {
    id: 'venom+camel_adaptation',
    name: 'Desert Viper',
    domains: ['venom', 'camel_adaptation'],
    requiredTags: ['poison', 'camel'],
    effects: [{ kind: 'applyStatus', status: 'poison', stacks: 2 }],
    description:
      'Camel units with venom apply poison through difficult terrain. Enemies in rough terrain near them take passive poison damage and cannot retreat.',
    friendlyFlavor:
      'Your desert riders carry venom in every grain of sand they kick up. The wastes belong to you — and nothing that enters leaves clean.',
    enemyFlavor:
      "We thought the desert was the real enemy. We were wrong. Their riders barely touched us, but every scrape, every breath of dust, it burrowed in. The men who tried to flee found their legs wouldn't carry them.",
  },
  {
    id: 'venom+slaving',
    name: 'Envenomed Captors',
    domains: ['venom', 'slaving'],
    requiredTags: ['poison', 'capture'],
    effects: [
      { kind: 'statMod', stat: 'capturePoisonDamage', op: 'set', value: 3 },
      { kind: 'statMod', stat: 'capturePoisonStacks', op: 'set', value: 3 },
      { kind: 'statMod', stat: 'slaveDamageBonus', op: 'set', value: 0.25 },
      { kind: 'statMod', stat: 'slaveHealPenalty', op: 'set', value: 0.5 },
    ],
    description:
      'Captured units are poisoned and slowly weakened (3 damage/turn). Slave armies deal +25% damage but heal at half the normal rate. Mercy-killing a captive triggers a 5-stack poison burst in 1-hex radius.',
    friendlyFlavor:
      'Your captives wither in chains, weakened by venom until they beg for the sword. Your slave armies fight with desperate fury, knowing the poison grants them no mercy.',
    enemyFlavor:
      "They don't kill everyone. Some they take. You can hear them at night, the captured ones, coughing something awful. When we put one out of his misery, a cloud of something noxious burst from his body. Two more men fell.",
  },
  {
    id: 'venom+heavy_hitter',
    name: 'Venomous Smash',
    domains: ['venom', 'heavy_hitter'],
    requiredTags: ['poison', 'heavy'],
    effects: [
      { kind: 'applyStatus', status: 'poison', stacks: 1 },
      { kind: 'statMod', stat: 'armorPiercing', op: 'add', value: 0.5 },
    ],
    description:
      'Heavy strikes ignore 50% of enemy armor when attacking poisoned targets. Each poison stack adds 25% armor piercing (cap 100%). Full poison = stun.',
    friendlyFlavor:
      'Your heaviest warriors use venom like a key — armor crumbles, shields rot, and the strongest enemy defenses dissolve under their crushing blows.',
    enemyFlavor:
      "Our vanguard was armored head to toe. It didn't matter. Something in their strikes found every gap, every joint. The men who'd been sick beforehand went rigid — just froze in place, eyes open, before the hammer came down.",
  },
  {
    id: 'venom+venom',
    name: 'Concentrated Venom',
    domains: ['venom', 'venom'],
    requiredTags: ['poison', 'poison'],
    effects: [
      { kind: 'statMod', stat: 'toxicSpreadTransferStacks', op: 'set', value: 1 },
      { kind: 'statMod', stat: 'toxicSpreadTransferRadius', op: 'set', value: 1 },
    ],
    description:
      'When a poisoned enemy dies, poison transfers (1 stack) to all adjacent enemies. Cascading kills sweep formations.',
    friendlyFlavor:
      'Your venom knows no mercy — when one enemy falls, their death spreads the poison to all who stand nearby. The chain of death feeds itself.',
    enemyFlavor:
      'It started with Korrin. He dropped, and then Kael was sick, and then the man beside Kael, like something passed from body to body. We broke formation. We had to. The dying spread faster than we could count.',
  },
  {
    id: 'fortress+charge',
    name: 'Fortress Charge',
    domains: ['fortress', 'charge'],
    requiredTags: ['fortress', 'elephant'],
    effects: [{ kind: 'setFlag', flag: 'chargeShield' }],
    description:
      'Charging units adjacent to fortress units get a charge shield: first hit after charging deals 0 damage to the charger. Charging adjacent to a fortress grants +50% damage bonus.',
    friendlyFlavor:
      'Your shield wall holds firm while your cavalry crashes through the gap. The fortress anchors the line; the charge shatters theirs.',
    enemyFlavor:
      "They had a wall of shields, immovable, and then something came from behind it — fast, heavy, and completely shielded. Our pikes didn't even slow it down. It was coordinated. Practiced. We never had a chance to regroup.",
  },
  {
    id: 'fortress+hitrun',
    name: 'Fortress Skirmish',
    domains: ['fortress', 'hitrun'],
    requiredTags: ['fortress', 'skirmish'],
    effects: [
      { kind: 'statMod', stat: 'defense', op: 'add', value: 0.75 },
      { kind: 'statMod', stat: 'dugInDefense', op: 'add', value: 0.75 },
    ],
    description:
      "After hit-and-run retreat, the unit gains a 1-turn 'dug in' bonus: +75% defense until next action. Dug-in counter-attacks deal +50% damage.",
    friendlyFlavor:
      "Your skirmishers withdraw into earthworks of their own making. Let them pursue — they'll break against your fortified positions.",
    enemyFlavor:
      'We chased them out of the open field. They fell back to a rise — dug in before we even reached them. Our assault bounced off like waves on rock, and their counter-strikes were savage.',
  },
  {
    id: 'fortress+tidal_warfare',
    name: 'Coastal Fortress',
    domains: ['fortress', 'tidal_warfare'],
    requiredTags: ['fortress', 'naval'],
    effects: [
      { kind: 'statMod', stat: 'bombardmentRange', op: 'set', value: 3 },
      { kind: 'statMod', stat: 'bombardmentDamageMultiplier', op: 'set', value: 0.5 },
      { kind: 'statMod', stat: 'bombardmentLandAuraDefense', op: 'set', value: 0.25 },
      { kind: 'statMod', stat: 'defense', op: 'add', value: 0.25 },
    ],
    description:
      'Ships bombard land targets within 3 hexes for 50% damage. Allied land units within 2 hexes gain +25% defense.',
    friendlyFlavor:
      'Your fleet hammers the shore while your legions hold the coast. Fire from the sea, iron on the land — there is no refuge for the enemy.',
    enemyFlavor:
      "The ships sat offshore, just out of range, and pounded us with something — stones, fire, I couldn't tell. Our men on the beach were pinned. When we tried to push back, their ground troops met us with shields locked tight.",
  },
  {
    id: 'fortress+nature_healing',
    name: 'Citadel',
    domains: ['fortress', 'nature_healing'],
    requiredTags: ['fortress', 'druid'],
    effects: [
      { kind: 'projectAura', radius: 2, effects: [
        { kind: 'heal', amount: 3, mode: 'flat' },
      ] },
      { kind: 'setFlag', flag: 'countsAsCity' },
      { kind: 'statMod', stat: 'defense', op: 'add', value: 0.5 },
    ],
    description:
      'Units with both fortress and healing create a 2-hex healing aura. The unit counts as a city for defense purposes and generates 1 resource per turn.',
    friendlyFlavor:
      'Your stone-singers raise living citadels wherever they stand. Walls of earth and light, mending wounds and holding the line — a fortress that breathes.',
    enemyFlavor:
      "We laid siege to what we thought was a war camp. Within a day it had become a fortress — walls, healed soldiers, the works. They seemed stronger each morning. Our siege weapons couldn't keep up.",
  },
  {
    id: 'fortress+river_stealth',
    name: 'Hidden Fortress',
    domains: ['fortress', 'river_stealth'],
    requiredTags: ['fortress', 'stealth'],
    effects: [
      { kind: 'statMod', stat: 'stealthChargeMultiplier', op: 'set', value: 2.0, condition: 'isStealthAttack' },
    ],
    description:
      'Stealth fortress units are invisible until they attack or an enemy enters an adjacent hex. First attack from stealth has 2x critical multiplier. Can creep 1 hex while hidden.',
    friendlyFlavor:
      "Your fortifications are invisible until the moment of your choosing. The enemy walks past your positions never knowing death waits an arm's length away.",
    enemyFlavor:
      'We patrolled that ridgeline twice. Nothing. Third pass, Volke disappears — just gone. We found him an hour later, barely breathing, next to fortifications that absolutely were not there yesterday.',
  },
  {
    id: 'fortress+camel_adaptation',
    name: 'Desert Stronghold',
    domains: ['fortress', 'camel_adaptation'],
    requiredTags: ['fortress', 'camel'],
    effects: [
      { kind: 'setFlag', flag: 'mobileStrongholdFortUp' },
      { kind: 'statMod', stat: 'mobileStrongholdDefenseBonus', op: 'set', value: 0.75 },
      { kind: 'statMod', stat: 'mobileStrongholdAlliedDefenseBonus', op: 'set', value: 0.25 },
      { kind: 'statMod', stat: 'defense', op: 'add', value: 0.75 },
      { kind: 'preventAction', action: 'displacement' },
    ],
    description:
      'Toggle Fort Up (+75% defense, 2-hex aura at +25% ally def) / Decamp (free action). Mobile fortress.',
    friendlyFlavor:
      'Your desert riders become roving strongholds, fortifying in the open dunes at will. The sands themselves answer your command to hold.',
    enemyFlavor:
      'We had them in the open — or so we thought. They stopped, dismounted, and somehow the ground changed around them. By the time we reached them, it was like assaulting a castle wall in the middle of nowhere.',
  },
  {
    id: 'fortress+slaving',
    name: 'Chained Prisoners',
    domains: ['fortress', 'slaving'],
    requiredTags: ['fortress', 'capture'],
    effects: [
      { kind: 'statMod', stat: 'defense', op: 'add', value: 0.5 },
      { kind: 'preventAction', action: 'captureEscape' },
    ],
    description:
      'Fortress units guarding slaves gain +50% defense. Counter-attack damage scales with HP lost (25%). Prisoners provide +1 garrison bonus.',
    friendlyFlavor:
      'Your fortress guards draw strength from every prisoner they hold. The more your walls have endured, the harder they strike back.',
    enemyFlavor:
      'The guards around the slave pens were the toughest of the lot. They barely flinched when we hit them, and the harder we pressed, the harder they hit back. The prisoners seemed to strengthen them somehow.',
  },
  {
    id: 'fortress+heavy_hitter',
    name: 'Immovable Object',
    domains: ['fortress', 'heavy_hitter'],
    requiredTags: ['fortress', 'heavy'],
    effects: [
      { kind: 'statMod', stat: 'damageReflection', op: 'add', value: 0.25 },
      { kind: 'preventAction', action: 'displacement' },
    ],
    description:
      'Heavy units in fortress formation reflect 25% damage back to attackers (scaling to 50% at 5+ damage). Adjacent allies are immune to knockback.',
    friendlyFlavor:
      'Your heavy fortress troops are mountains given form. Let the enemy break themselves against you — every blow they land returns to them twofold.',
    enemyFlavor:
      "We hit them with everything. Our best warriors, our heaviest strikes. They didn't move. They didn't even seem to feel it. But our arms ached afterward, like the force had come back into us.",
  },
  {
    id: 'fortress+fortress',
    name: 'Layered Defense',
    domains: ['fortress', 'fortress'],
    requiredTags: ['fortress', 'fortress'],
    effects: [
      { kind: 'setFlag', flag: 'formationWallActive' },
      { kind: 'statMod', stat: 'formationWallRangedReduction', op: 'set', value: 0.5 },
    ],
    description:
      'Two adjacent fortress units form an impassable line — enemies cannot move through hexes between them. Ranged attacks crossing the wall halve their range.',
    friendlyFlavor:
      'Two of your fortress units standing shoulder to shoulder form an unbreakable wall. Nothing passes through — not men, not arrows, not hope.',
    enemyFlavor:
      "We couldn't find a gap. Two lines of shields, and the space between them might as well have been solid stone. Our arrows fell short. Our men couldn't flank. It was like attacking a cliff face.",
  },
  {
    id: 'charge+hitrun',
    name: 'Endless Charge',
    domains: ['charge', 'hitrun'],
    requiredTags: ['elephant', 'skirmish'],
    effects: [
      { kind: 'setFlag', flag: 'chargeCooldownWaived' },
    ],
    description:
      'Units with charge can charge, retreat, and charge again in the same turn if they have enough movement points',
    friendlyFlavor:
      'Your cavalry charges, withdraws, and charges again — a single relentless tide that never stops crashing. There is no recovering from the first impact before the second arrives.',
    enemyFlavor:
      'They hit us, pulled back, and before we could reform, hit us again. Same troops. Same turn. Our formation never had a chance to close. It was over before we understood it had started.',
  },
  {
    id: 'charge+tidal_warfare',
    name: 'Tsunami Charge',
    domains: ['charge', 'tidal_warfare'],
    requiredTags: ['elephant', 'naval'],
    effects: [{ kind: 'knockback', distance: 1 }],
    description:
      'Naval charge: ships can ram enemy naval units, dealing massive damage with +75% ram bonus and knocking them 1-2 hexes in a random drift direction.',
    friendlyFlavor:
      'Your ships become rams, crashing through enemy fleets with the force of a tidal wave. The ocean itself carries your charge.',
    enemyFlavor:
      'We saw their ships change course and thought they were retreating. They were accelerating. The impact threw our vessel two ship-lengths. The whole engagement was over in a single collision.',
  },
  {
    id: 'charge+nature_healing',
    name: 'Charging Growth',
    domains: ['charge', 'nature_healing'],
    requiredTags: ['elephant', 'druid'],
    effects: [
      { kind: 'heal', amount: 0.3, mode: 'percentMaxHp', condition: 'isCharge' },
      { kind: 'statMod', stat: 'bloomPulseMovementBonus', op: 'set', value: 1, condition: 'isCharge' },
    ],
    description:
      'Charging units adjacent to healing units regenerate after a charge. Successful charges restore 1 movement point.',
    friendlyFlavor:
      "Your charges invigorate rather than exhaust. Each thundering advance restores your warriors' vigor — momentum begets momentum.",
    enemyFlavor:
      'They should have been winded after that charge. We braced for an exhausted opponent. Instead they came again, fresher than before, like the impact itself had healed them.',
  },
  {
    id: 'charge+river_stealth',
    name: 'Stealth Charge',
    domains: ['charge', 'river_stealth'],
    requiredTags: ['elephant', 'stealth'],
    effects: [
      { kind: 'statMod', stat: 'damage', op: 'set', value: 0.5, condition: 'isCharge AND isStealthAttack' },
      { kind: 'setFlag', flag: 'chargeCooldownWaived', condition: 'isCharge AND isStealthAttack' },
    ],
    description:
      'Units with charge can initiate a charge from stealth. The charge deals +50% damage from surprise, but the attacker is revealed until their next turn',
    friendlyFlavor:
      'Your cavalry strikes from total concealment — a wall of iron and muscle erupting from nowhere. The first hit is devastating; the second is inevitable.',
    enemyFlavor:
      "No warning. No dust cloud on the horizon. One moment we were marching, the next a cavalry charge was in our midst, as if they'd materialized from thin air. The scouts saw nothing.",
  },
  {
    id: 'charge+camel_adaptation',
    name: 'Sandstorm Charge',
    domains: ['charge', 'camel_adaptation'],
    requiredTags: ['elephant', 'camel'],
    effects: [
      { kind: 'statMod', stat: 'sandstormDamage', op: 'set', value: 2 },
      { kind: 'statMod', stat: 'sandstormAccuracyDebuff', op: 'set', value: 0.25 },
      { kind: 'statMod', stat: 'aoeDamage', op: 'set', value: 2 },
      { kind: 'knockback', distance: 1 },
    ],
    description:
      'Camel charge: camel units charge through desert terrain dealing AoE damage. Desert charges raise a sandstorm that persists for 2 turns with -25% accuracy.',
    friendlyFlavor:
      'Your camel riders charge through the desert and leave a howling storm in their wake. The sands rise at your command, blinding everything in your path.',
    enemyFlavor:
      "They came out of a dust devil — or maybe they brought it with them. The charge scattered us, and then the storm rolled in and we couldn't see our own hands. Arrows flew blindly for what felt like hours.",
  },
  {
    id: 'charge+slaving',
    name: 'Press-Ganged Cavalry',
    domains: ['charge', 'slaving'],
    requiredTags: ['elephant', 'capture'],
    effects: [
      { kind: 'capture', chanceBonus: 0.30, condition: 'isCharge' },
      { kind: 'knockback', distance: 2, condition: 'isCharge' },
    ],
    description:
      'Charge attacks have 30% chance to capture enemy units. Captured units are converted to your faction',
    friendlyFlavor:
      'Your thundering charge does not merely kill — it takes. Enemies are broken and bound in a single pass, dragged back to swell your ranks.',
    enemyFlavor:
      "The cavalry came through and kept going. We counted afterward — three men weren't dead, just gone. Dragged. We found their armor in a pile by the enemy camp the next day. The men themselves were already wearing different colors.",
  },
  {
    id: 'charge+heavy_hitter',
    name: 'Unstoppable Momentum',
    domains: ['charge', 'heavy_hitter'],
    requiredTags: ['elephant', 'heavy'],
    effects: [
      { kind: 'applyStatus', status: 'stun', duration: 1 },
      { kind: 'knockback', distance: 1, extendMultiplier: 1.5, condition: 'isCharge' },
    ],
    description:
      'Heavy charges deal massive knockback and stun enemies for 1 turn. Each hex of run-up adds +5% damage (cap +50%).',
    friendlyFlavor:
      'The longer your heavy cavalry runs, the harder they hit — a rolling boulder of muscle and steel that stuns everything it touches.',
    enemyFlavor:
      'They started their charge from the far end of the valley. We watched them come, confident our lines would hold. The impact knocked men flat — not just the ones who were hit, but everyone nearby. None of us could move for what felt like an eternity.',
  },
  {
    id: 'charge+charge',
    name: 'Stampede Horde',
    domains: ['charge', 'charge'],
    requiredTags: ['elephant', 'elephant'],
    effects: [
      { kind: 'statMod', stat: 'formationPinballCollisionDamage', op: 'set', value: 4 },
      { kind: 'applyStatus', status: 'stun', duration: 1 },
    ],
    description:
      "Knockback victims collide with whatever's behind them for +4 damage and 1-turn stun.",
    friendlyFlavor:
      'When two of your charges collide with the enemy, the impact cascades — victims slam into each other like stones in an avalanche.',
    enemyFlavor:
      "The first charge knocked us backward into our own lines. The second charge hit the pile. Men were thrown into men, armor into armor. I've never seen bodies used as weapons like that.",
  },
  {
    id: 'hitrun+tidal_warfare',
    name: 'Coastal Raid',
    domains: ['hitrun', 'tidal_warfare'],
    requiredTags: ['skirmish', 'naval'],
    effects: [
      { kind: 'statMod', stat: 'beachRaidDamageBonus', op: 'set', value: 0.25 },
      { kind: 'setFlag', flag: 'beachRaidRetreatToWater' },
      { kind: 'statMod', stat: 'damage', op: 'set', value: 0.25 },
    ],
    description:
      'Attack from water with +25% damage. After attacking, retreat to any water within 2 hexes. Land units cannot pursue.',
    friendlyFlavor:
      'Your raiders strike from the sea and vanish back into it. No army can chase you where the waves take your ships.',
    enemyFlavor:
      'They came from the water, hit us hard, and were gone before we could draw weapons. We pursued to the shoreline and stopped. There was no following them into the surf.',
  },
  {
    id: 'hitrun+nature_healing',
    name: 'Healing Retreat',
    domains: ['hitrun', 'nature_healing'],
    requiredTags: ['skirmish', 'druid'],
    effects: [{ kind: 'statMod', stat: 'vampiricStrikeHealPercent', op: 'set', value: 1.0 }],
    description:
      'Hit-and-run attacks heal for 100% of damage dealt. Full vampiric lifesteal on retreat.',
    friendlyFlavor:
      'Every wound your skirmishers inflict feeds their own vitality. Strike and withdraw, stronger than before — war as sustenance.',
    enemyFlavor:
      'They were wounded when they attacked us. I saw the blood. But when they pulled back they moved like fresh troops — no limp, no pain. It was like watching someone drink our suffering.',
  },
  {
    id: 'hitrun+river_stealth',
    name: 'Shadow Step',
    domains: ['hitrun', 'river_stealth'],
    requiredTags: ['skirmish', 'stealth'],
    effects: [
      { kind: 'setFlag', flag: 'reEnterStealthAfterCombat', condition: 'isRetreat' },
    ],
    description:
      'Stealth hit-and-run: after attacking from stealth, the unit automatically re-enters stealth at the retreat hex (no cooldown)',
    friendlyFlavor:
      'Your shadow fighters attack and dissolve into darkness in the same breath. They cannot be caught because they are never where they appear to be.',
    enemyFlavor:
      'We spotted one — just for a moment — and then it was gone. An arrow came from the left. We turned, and nothing. Another from behind. We never caught them. They were shadows with bowstrings.',
  },
  {
    id: 'hitrun+camel_adaptation',
    name: 'Desert Ghost',
    domains: ['hitrun', 'camel_adaptation'],
    requiredTags: ['skirmish', 'camel', 'cavalry'],
    effects: [{ kind: 'setFlag', flag: 'ghostPassActive', condition: 'isRetreat' }],
    description:
      'Retreat through impassable terrain. After passing through impassable, gain +1 movement and re-enter stealth.',
    friendlyFlavor:
      'Your desert raiders pass through terrain no army should survive. They vanish into the wastes and reappear where you least expect, refreshed and hidden once more.',
    enemyFlavor:
      "We cornered them against the salt flats — impassable ground on three sides. They ran straight into it. We assumed they'd die. Two days later they hit our supply camp from a direction we didn't think was passable.",
  },
  {
    id: 'hitrun+slaving',
    name: 'Raid Retreat',
    domains: ['hitrun', 'slaving'],
    requiredTags: ['skirmish', 'capture'],
    effects: [{ kind: 'capture', chanceBonus: 0.15 }],
    description:
      'Hit-and-run attacks have 15% chance to capture wounded enemies (below 50% HP), rising to 40% below 25 HP. Instant retreat with captive.',
    friendlyFlavor:
      "Your raiders don't just wound — they take. A swift strike, a bound captive, and then gone before the enemy can count their missing.",
    enemyFlavor:
      "They hit our column, grabbed two men off the march, and vanished. We found drag marks in the dirt, but the trail went cold within fifty paces. They're fast. They're deliberate. They don't want a fight — they want us.",
  },
  {
    id: 'hitrun+heavy_hitter',
    name: 'Heavy Skirmish',
    domains: ['hitrun', 'heavy_hitter'],
    requiredTags: ['skirmish', 'heavy'],
    effects: [
      { kind: 'setFlag', flag: 'fightingRetreatFreeStrike' },
      { kind: 'statMod', stat: 'fightingRetreatDamageMultiplier', op: 'set', value: 1.0 },
    ],
    description:
      'Free opportunity strike at full damage when disengaging. Heavy skirmishers hit back on the way out.',
    friendlyFlavor:
      'Your heavy skirmishers punish anyone foolish enough to let them retreat. The disengage is just another attack — full force, no mercy.',
    enemyFlavor:
      "We thought we'd forced them back. They were retreating — we pressed the advantage. Then every one of them turned and struck, full force, like the retreat had been a setup. It probably was.",
  },
  {
    id: 'hitrun+hitrun',
    name: 'Swarm Tactics',
    domains: ['hitrun', 'hitrun'],
    requiredTags: ['skirmish', 'skirmish'],
    effects: [
      { kind: 'statMod', stat: 'formationFocusBonus', op: 'set', value: 0.3 },
      { kind: 'setFlag', flag: 'formationFocusIgnoresDefense' },
      { kind: 'statMod', stat: 'damage', op: 'set', value: 0.3 },
    ],
    description:
      "When 2+ hitrun units attack the same target in one turn, each subsequent attacker deals +30% damage and ignores defender's defense bonuses.",
    friendlyFlavor:
      'Your swarm tactics overwhelm any single target. The first strike opens the gap; each subsequent hit drives deeper, ignoring whatever defense remains.',
    enemyFlavor:
      'One of them was manageable. Then another, and another — all hitting the same position. Our shield wall meant nothing. The third or fourth strike went through like our men weren\'t even trying to block.',
  },
  {
    id: 'tidal_warfare+nature_healing',
    name: 'Tidal Restoration',
    domains: ['tidal_warfare', 'nature_healing'],
    requiredTags: ['naval', 'druid'],
    effects: [{ kind: 'statMod', stat: 'tidalCleanseHealPerTurn', op: 'set', value: 4 }],
    description:
      '2-hex aura heals 4 HP/turn. Cleanses poison, stun, and slow from allies in range each turn.',
    friendlyFlavor:
      'Your sea-priests call upon the tide to cleanse and restore. Poison, stun, weariness — all wash away in the healing waters.',
    enemyFlavor:
      "Their ships carried something — not weapons, or not just weapons. Our poison-tipped arrows didn't seem to work on them. Their wounded were fighting again within the hour, like the sea itself was mending them.",
  },
  {
    id: 'tidal_warfare+river_stealth',
    name: 'Silent Landing',
    domains: ['tidal_warfare', 'river_stealth'],
    requiredTags: ['naval', 'stealth'],
    effects: [
      { kind: 'statMod', stat: 'stealthChargeMultiplier', op: 'add', value: 0.5, condition: 'isStealthAttack' },
      { kind: 'setFlag', flag: 'transportedTroopsStealth' },
    ],
    description:
      'Stealth naval units can make amphibious landings without breaking stealth. First attack after landing deals +50% damage. Transported troops gain stealth.',
    friendlyFlavor:
      'Your forces arrive from the sea in total silence, landing unseen and striking with devastating surprise. Even the troops you transport move like ghosts.',
    enemyFlavor:
      'We had sentries on every beach. They saw nothing. In the morning we found boot prints in the sand and half our garrison dead. The survivors said they never heard a boat, never saw a torch, never caught a shadow.',
  },
  {
    id: 'tidal_warfare+camel_adaptation',
    name: 'Shoreline Nomads',
    domains: ['tidal_warfare', 'camel_adaptation'],
    requiredTags: ['naval', 'camel'],
    effects: [{ kind: 'statMod', stat: 'amphibiousMovementBonus', op: 'set', value: 1 }],
    description:
      'Full movement on coast, desert, and shallow water. +1 movement bonus in all three terrains.',
    friendlyFlavor:
      'Your riders move between sea and sand as if they were one terrain. Coast, desert, shallows — all are home, all are conquered with equal speed.',
    enemyFlavor:
      "They moved from the beach into the dunes like the ground wasn't even there. Our cavalry got bogged down in the shallows; theirs didn't slow. It's like they don't see the difference between water and sand.",
  },
  {
    id: 'tidal_warfare+slaving',
    name: 'Naval Slave Raid',
    domains: ['tidal_warfare', 'slaving'],
    requiredTags: ['naval', 'capture'],
    effects: [{ kind: 'capture', chanceBonus: 0.3, condition: 'isWater' }],
    description:
      'Capture from 1 hex away on water. Instant embark captured units. Delivering slaves to a city counts double.',
    friendlyFlavor:
      'Your slave ships pluck prisoners from the shore without ever docking. The sea delivers your captives, and every one is worth double in your cities.',
    enemyFlavor:
      'We were standing on the docks — solid ground, we thought. Reaching hands came from the water, grabbed two men, and they were gone. Pulled into a boat that was already moving. Our people are just cargo to them.',
  },
  {
    id: 'tidal_warfare+heavy_hitter',
    name: 'Ironclad Tide',
    domains: ['tidal_warfare', 'heavy_hitter'],
    requiredTags: ['naval', 'heavy'],
    effects: [{ kind: 'statMod', stat: 'heavyNavalRamDamage', op: 'set', value: 2, condition: 'isWater' }],
    description:
      '+50% damage on water. Treats coast hexes as water for movement. Ram attacks deal 2 bonus damage.',
    friendlyFlavor:
      'Your heavy fleet turns the coast into a killing ground. Ramming, bombardment, coastal assault — your iron-clad ships know no mercy near shore.',
    enemyFlavor:
      "We thought we were safe on the beach — their ships were out at sea. Then they closed in, and the coast itself seemed to become water for them. The ramming was the worst. The survivors won't go near the shore anymore.",
  },
  {
    id: 'tidal_warfare+tidal_warfare',
    name: 'Armada',
    domains: ['tidal_warfare', 'tidal_warfare'],
    requiredTags: ['naval', 'naval'],
    effects: [{ kind: 'statMod', stat: 'formationChainBonus', op: 'set', value: 1 }],
    description:
      'Naval units within 2 hexes chain attacks — when one ship attacks, every chained ship contributes +1 damage to that attack (cap +4).',
    friendlyFlavor:
      'Your fleet fights as a single organism. One ship fires and every vessel nearby adds its weight to the volley. The ocean itself conspires in your bombardment.',
    enemyFlavor:
      "We engaged one of their ships — just one. Then the next one fired, and the next, like a chain of thunder. The damage was far more than a single vessel should manage. They don't fight alone, ever.",
  },
  {
    id: 'nature_healing+river_stealth',
    name: "Nature's Veil",
    domains: ['nature_healing', 'river_stealth'],
    requiredTags: ['druid', 'stealth'],
    effects: [{ kind: 'statMod', stat: 'stealthAuraShareRadius', op: 'set', value: 1 }],
    description:
      'Adjacent allies share stealth state. If this unit is stealthed, adjacent allies gain stealth too.',
    friendlyFlavor:
      "Your nature-speakers weave living camouflage around themselves and all who stand nearby. An entire army can vanish beneath the forest's breath.",
    enemyFlavor:
      'We were tracking a company — forty men at least. They walked into a grove and simply stopped existing. Our scouts circled it twice. Nothing. It was as if the trees had swallowed them whole.',
  },
  {
    id: 'nature_healing+camel_adaptation',
    name: 'Oasis',
    domains: ['nature_healing', 'camel_adaptation'],
    requiredTags: ['druid', 'camel'],
    effects: [
      { kind: 'projectAura', radius: 1, effects: [
        { kind: 'heal', amount: 1.0, mode: 'percentMaxHp' },
      ] },
    ],
    description:
      "Camel units with healing create an 'oasis' effect: the hex they occupy and all adjacent hexes count as neutral terrain for movement purposes. Units at full HP are fully restored at turn end (5-turn cooldown).",
    friendlyFlavor:
      'Your camel healers create living oases in the harshest terrain. Around them, the desert blooms and your warriors are restored to full vigor.',
    enemyFlavor:
      "We pursued them deep into the wastes, waiting for them to drop from exhaustion. Instead we found green grass growing in a circle around their camp. Their wounded were standing, whole, drinking from pools that shouldn't exist.",
  },
  {
    id: 'nature_healing+slaving',
    name: 'Forced Labor',
    domains: ['nature_healing', 'slaving'],
    requiredTags: ['druid', 'capture'],
    effects: [
      { kind: 'statMod', stat: 'slaveEconomyHealPerTurn', op: 'set', value: 4 },
      { kind: 'statMod', stat: 'slaveEconomyResourceBonus', op: 'set', value: 1 },
    ],
    description:
      'Slaves heal 4 HP/turn. Slaves at full HP produce +1 resource. Requires adjacent healer unit.',
    friendlyFlavor:
      'Your healers tend to their slaves — not out of mercy, but efficiency. A healthy slave produces more, fights longer, and is worth more alive than dead.',
    enemyFlavor:
      "We assumed their slaves would be starving, broken, easy to turn. They weren't. They were well-fed, healed, and fought for their captors with terrifying devotion. There's something worse than cruelty at work here.",
  },
  {
    id: 'nature_healing+heavy_hitter',
    name: 'Berserker Regen',
    domains: ['nature_healing', 'heavy_hitter'],
    requiredTags: ['druid', 'heavy'],
    effects: [{ kind: 'statMod', stat: 'heavyRegenPercent', op: 'set', value: 0.3 }],
    description:
      'Heavy units regenerate 30% of damage dealt as HP. Killing an enemy heals 50% of max HP.',
    friendlyFlavor:
      'Your heavy warriors wade into battle and emerge healthier than they entered. Each enemy felled floods them with renewed vitality — violence as medicine.',
    enemyFlavor:
      "We put a spear through his shoulder. He pulled it out and kept coming, madder, stronger. By the time he'd cut down three of ours, the wound was closing. We're not fighting men. We're fighting something that feeds on death.",
  },
  {
    id: 'nature_healing+nature_healing',
    name: 'Life Bloom',
    domains: ['nature_healing', 'nature_healing'],
    requiredTags: ['druid', 'druid'],
    effects: [
      { kind: 'statMod', stat: 'bloomPulseHeal', op: 'set', value: 4 },
      { kind: 'statMod', stat: 'bloomPulseSelfHeal', op: 'set', value: 6 },
      { kind: 'statMod', stat: 'bloomPulseAuraRadius', op: 'set', value: 3 },
      { kind: 'statMod', stat: 'bloomPulseMovementBonus', op: 'set', value: 1 },
    ],
    description:
      '3-hex aura, +4/+6 HP/turn. Every 3rd turn, instantly heals all allies in radius for +8 HP and grants them +1 movement.',
    friendlyFlavor:
      'Your healers sing the earth itself back to life. In their presence, wounds close like they were never opened and allies move with supernatural energy.',
    enemyFlavor:
      "Their healers didn't just mend wounds — the air around them felt alive. Every few minutes, a pulse would go out and their whole line would straighten up, stand taller, move faster. It was like fighting a force of nature.",
  },
  {
    id: 'river_stealth+camel_adaptation',
    name: 'Mirage',
    domains: ['river_stealth', 'camel_adaptation'],
    requiredTags: ['stealth', 'camel'],
    effects: [
      { kind: 'applyStatus', status: 'stealth', duration: 'permanent', condition: 'terrain:desert' },
      { kind: 'spawnOnMap', effectType: 'decoy', position: 'attacker', duration: 2 },
    ],
    description:
      'Camel stealth units in desert terrain are permanently stealthed. Moving in desert spawns a phantom decoy that lasts 2 turns.',
    friendlyFlavor:
      'Your desert stalkers are one with the sands — permanently invisible in the wastes. Every step spawns a mirage, and the enemy chases shadows while you strike from the real.',
    enemyFlavor:
      'We saw them crossing the dunes — a clear line of riders. We moved to intercept. When we arrived, there was nothing but sand and heat haze. Then arrows came from a direction nobody was watching.',
  },
  {
    id: 'river_stealth+slaving',
    name: 'Ambush Captors',
    domains: ['river_stealth', 'slaving'],
    requiredTags: ['stealth', 'capture'],
    effects: [{ kind: 'capture', chanceBonus: 0.4, condition: 'isStealthAttack' }],
    description:
      "Stealth attacks have 40% chance to capture enemies instead of killing them. Silent capture doesn't alert nearby enemies. Gain 1 free movement hex after capture.",
    friendlyFlavor:
      "Your ambushers don't just kill — they take. A silent strike, a bound captive, and then they vanish into terrain as though they were never there.",
    enemyFlavor:
      'Three of our sentries vanished in the night. No alarm, no struggle, no blood. Just gone. We found boot prints leading away from the perimeter — two sets walking, three being dragged.',
  },
  {
    id: 'river_stealth+heavy_hitter',
    name: "Assassin's Blow",
    domains: ['river_stealth', 'heavy_hitter'],
    requiredTags: ['stealth', 'heavy'],
    effects: [{ kind: 'statMod', stat: 'armorPiercing', op: 'set', value: 1.0, condition: 'isStealthAttack' }],
    description:
      'Heavy attacks from stealth permanently shred 100% of enemy armor. This is your elite assassin specialist combo',
    friendlyFlavor:
      "Your assassins carry hammers instead of daggers. A single stealth strike from them doesn't just wound — it strips away every layer of protection, permanently.",
    enemyFlavor:
      "Our champion was in full plate — enchanted, generations old. Something hit him from behind, one blow. When he stood up, the armor wasn't just dented — it was gone. Flaked away like rust. He didn't survive the next strike.",
  },
  {
    id: 'river_stealth+river_stealth',
    name: 'Shadow Network',
    domains: ['river_stealth', 'river_stealth'],
    requiredTags: ['stealth', 'stealth'],
    effects: [{ kind: 'grantVerb', verb: 'positionSwap' }],
    description:
      "Stealth units within 3 hexes can swap positions as a free action once per turn. Killing one doesn't reveal others.",
    friendlyFlavor:
      "Your shadow agents operate as a web — they swap positions at will, and catching one reveals nothing about the rest. The network has no center to cut.",
    enemyFlavor:
      "We finally cornered one of their spies. Caught him dead to rights. Then he wasn't there anymore — another one was, thirty paces from where we'd been chasing. They're connected somehow. Killing one does nothing to the others.",
  },
  {
    id: 'camel_adaptation+slaving',
    name: 'Desert Slave Train',
    domains: ['camel_adaptation', 'slaving'],
    requiredTags: ['camel', 'capture'],
    effects: [{ kind: 'setFlag', flag: 'caravanPassengerActive' }],
    description:
      'Captured units ride as passengers; the raider may release them anywhere along their path as instant slaves at home cities.',
    friendlyFlavor:
      'Your desert raiders carry captives like cargo, releasing them anywhere along their route. Every raid is a supply run — human cargo delivered to your cities.',
    enemyFlavor:
      'They took our people and moved them like baggage. We tracked the raiders for days, expecting a camp, a prison. Instead they stopped at their city gates and the prisoners just walked in and started working. It was seamless.',
  },
  {
    id: 'camel_adaptation+heavy_hitter',
    name: 'Sand Titan',
    domains: ['camel_adaptation', 'heavy_hitter'],
    requiredTags: ['camel', 'heavy'],
    effects: [
      { kind: 'statMod', stat: 'sandstormAuraRadius', op: 'set', value: 2, condition: 'terrain:desert' },
      { kind: 'statMod', stat: 'sandstormAuraDebuff', op: 'set', value: 0.2, condition: 'terrain:desert' },
      { kind: 'statMod', stat: 'sandstormAccuracyDebuff', op: 'add', value: 0.2, condition: 'terrain:desert' },
    ],
    description:
      '2-hex sandstorm aura at -20% accuracy. Applies everywhere, not just desert.',
    friendlyFlavor:
      'Your camel titans carry a perpetual sandstorm with them. Around them, nothing strikes true — enemies grope blindly while your forces move unhindered.',
    enemyFlavor:
      "There was always sand in our eyes near their heavy riders. Didn't matter if we were on grassland — something about them churned the air. Half our arrows missed at point-blank range. It's not natural.",
  },
  {
    id: 'camel_adaptation+camel_adaptation',
    name: 'Nomad Network',
    domains: ['camel_adaptation', 'camel_adaptation'],
    requiredTags: ['camel', 'cavalry'],
    effects: [{ kind: 'statMod', stat: 'caravanRelayVisionRange', op: 'set', value: 3 }],
    description:
      'Camel units within 3 hexes share vision. Once per turn, one moves full distance, then any network member makes a free 1-hex move into the vacated hex.',
    friendlyFlavor:
      'Your camel network shares sight across the desert — what one sees, all know. The relay march lets your entire force reposition with uncanny speed.',
    enemyFlavor:
      'We ambushed one of their patrols. Within moments, reinforcements arrived from three directions — they knew exactly where we were, even though the patrol never sent a signal. They share eyes somehow.',
  },
  {
    id: 'slaving+slaving',
    name: 'Slave Army',
    domains: ['slaving', 'slaving'],
    requiredTags: ['capture', 'capture'],
    effects: [
      { kind: 'statMod', stat: 'slaveHordeDamageBonus', op: 'set', value: 0.5 },
      { kind: 'statMod', stat: 'slaveHordeDefensePenalty', op: 'set', value: 0.3 },
      { kind: 'statMod', stat: 'damage', op: 'set', value: 0.5 },
      { kind: 'statMod', stat: 'defense', op: 'add', value: -0.3 },
    ],
    description:
      '+50% damage, -30% defense. Groups of 3+ ignore ZoC. When one slave dies, adjacent slaves gain +1 movement that turn.',
    friendlyFlavor:
      'Your slave hordes fight with desperate fury — strong but brittle. When one falls, the others surge forward in rage, and their numbers make them impossible to contain.',
    enemyFlavor:
      "They marched their captives at us like fodder. We cut them down easily enough — too easily. When one fell, the ones beside it went mad, charging through our lines. They didn't care about dying. That's what made them dangerous.",
  },
  {
    id: 'slaving+heavy_hitter',
    name: "Overseer's Rule",
    domains: ['slaving', 'heavy_hitter'],
    requiredTags: ['capture', 'heavy'],
    effects: [{ kind: 'statMod', stat: 'slaveCoercionDamageBonus', op: 'set', value: 0.5 }],
    description:
      'Heavy units commanding slaves increase slave damage by 50%. Slaves adjacent to an overseer gain +1 attack range. Executing an enemy triggers rage in nearby slaves.',
    friendlyFlavor:
      'Your overseers drive slaves to superhuman effort with fear and force. Near a heavy taskmaster, captives fight with unnatural reach and murderous zeal.',
    enemyFlavor:
      "Their slaves fought like veterans whenever one of the big armored ones was nearby — reaching further, striking harder. When they executed one of ours, the captives around them howled and surged. They're weaponizing desperation.",
  },
  {
    id: 'heavy_hitter+heavy_hitter',
    name: 'Crushing Weight',
    domains: ['heavy_hitter', 'heavy_hitter'],
    requiredTags: ['heavy', 'heavy'],
    effects: [
      { kind: 'statMod', stat: 'formationPinballCollisionDamage', op: 'set', value: 4 },
      { kind: 'applyStatus', status: 'stun', duration: 1 },
    ],
    description:
      'Knockback persists; victims colliding with other heavy units or terrain edges take +4 damage and 1-turn stun.',
    friendlyFlavor:
      'When your heavy warriors send enemies flying, the impact cascades. Victims slam into walls, allies, or each other with bone-shattering force.',
    enemyFlavor:
      "Their heavy troops hit ours so hard the bodies flew backward into our own line. The collision knocked three more men flat. It wasn't a battle — it was a demolition. Everything they touched became a hazard for everyone nearby.",
  },
];

// ----------------------------------------------------------------------------
// Emergent rules (triple-stack identities)
// ----------------------------------------------------------------------------

const EMERGENT_RULES_DATA: readonly EmergentRuleConfig[] = [
  {
    id: 'terrain_lord',
    name: 'Terrain Lord',
    condition: 'contains_terrain AND contains_combat AND contains_mobility',
    domainSets: {
      terrain: ['camel_adaptation', 'tidal_warfare', 'heavy_hitter'],
      combat: ['venom', 'fortress', 'charge', 'hitrun', 'slaving', 'heavy_hitter'],
      mobility: ['camel_adaptation', 'charge', 'hitrun', 'river_stealth'],
    },
    description:
      'Charges ignore all terrain penalties. In native terrain: double charge range + +50% damage. Reshape: permanently convert 3 hexes to your native terrain type.',
    effects: [
      { kind: 'statMod', stat: 'damage', op: 'multiply', value: 1.5, condition: 'isCharge' },
    ],
    friendlyFlavor:
      "Your armies become the land's true masters. The terrain bends to your will — you reshape it, charge through it, and weaponize it like no force before you.",
    enemyFlavor:
      'They changed the ground under our feet. I swear it. Hills flattened, rivers dried. Their charges crossed terrain that should have stopped a mountain goat. When they were done, the land itself bore their mark.',
  },
  {
    id: 'paladin',
    name: 'Paladin',
    condition: 'contains_healing AND contains_defensive AND contains_offensive',
    domainSets: {
      healing: ['nature_healing'],
      defensive: ['fortress', 'tidal_warfare', 'heavy_hitter'],
      offensive: ['venom', 'charge', 'hitrun', 'slaving'],
    },
    description:
      "Heals for 50% of damage dealt; can't drop below 1 HP from a single hit. At full HP, next attack deals +100% damage (Radiant Smite).",
    effects: [
      { kind: 'statMod', stat: 'emergentSustainHealPercent', op: 'set', value: 0.5 },
      { kind: 'statMod', stat: 'emergentSustainMinHp', op: 'set', value: 1 },
      { kind: 'statMod', stat: 'emergentSmiteBonus', op: 'set', value: 1.0 },
    ],
    friendlyFlavor:
      'Your champions are touched by the divine — their wounds seal as they deal death, and at full strength they unleash radiant fury that annihilates anything it touches.',
    enemyFlavor:
      "We wounded their champion again and again. Every time, the cuts sealed shut. When they struck back at full health, the blow was blinding — literally. Men near the impact couldn't see for minutes afterward.",
  },
  {
    id: 'terrain_assassin',
    name: 'Terrain Assassin',
    condition: 'contains_stealth AND contains_combat AND contains_terrain',
    domainSets: {
      stealth: ['river_stealth'],
      combat: ['venom', 'charge', 'hitrun', 'slaving'],
      terrain: ['camel_adaptation', 'tidal_warfare', 'heavy_hitter'],
    },
    description:
      'Attacks from stealth in matching terrain type are permanent stealth — enemies never detect you regardless of proximity',
    effects: [
      { kind: 'applyStatus', status: 'stealth', duration: 'permanent', condition: 'isStealthAttack' },
    ],
    friendlyFlavor:
      'Your assassins become one with the terrain — invisible forever in their chosen environment. They kill without revealing themselves, over and over, until nothing remains.',
    enemyFlavor:
      'We posted sentries. We used dogs. We burned torches in a ring around the camp. They still died. Whatever is out there, it knows the land in a way we never will. We never saw it. We never will.',
  },
  {
    id: 'standing_stone',
    name: 'Standing Stone',
    condition: 'contains_fortress AND contains_healing AND contains_defensive',
    domainSets: {
      fortress: ['fortress'],
      healing: ['nature_healing'],
      defensive: ['tidal_warfare', 'heavy_hitter'],
    },
    description:
      'Toggle stance each turn. Anchored: 3-hex aura (+30% defense, 5 HP/turn, damage share 50/50, enemies lose 2 movement, adjacent enemies take 2 damage). Marching: 1-hex aura (+15% defense, 2 HP/turn), can move.',
    effects: [
      { kind: 'statMod', stat: 'defense', op: 'add', value: 0.3 },
      { kind: 'preventAction', action: 'displacement' },
      { kind: 'statMod', stat: 'emergentCaptureBonus', op: 'set', value: 0 },
    ],
    friendlyFlavor:
      'Your standing stones anchor the battlefield. In stillness, you are immovable — healing, shielding, and punishing all who approach. In motion, your protective aura marches with you.',
    enemyFlavor:
      "They planted something in the ground — a stone, a totem, I couldn't tell. After that, everything near it was wrong. Our arrows curved. Our men slowed. Theirs got back up when they should have stayed down.",
  },
  {
    id: 'ghost_army',
    name: 'Ghost Army',
    condition: 'contains_3_mobility',
    mobilityDomains: ['charge', 'hitrun', 'camel_adaptation', 'river_stealth'],
    description:
      'Phase: teleport up to 3 hexes through anything (0 movement cost, must be outside enemy vision). On kill: re-stealth + re-emerge near any ally. Adjacent allies gain +2 movement when this unit phases.',
    effects: [],
    friendlyFlavor:
      'Your phantom soldiers phase through the battlefield like smoke — teleporting, killing, and vanishing to re-emerge beside any ally. Their presence alone quickens your entire force.',
    enemyFlavor:
      "We had them surrounded. Then they weren't there anymore — and they were behind us. Killing one didn't help; it just appeared somewhere else. We were fighting ghosts.",
  },
  {
    id: 'juggernaut',
    name: 'Juggernaut',
    condition: 'contains_3_combat',
    combatDomains: ['venom', 'fortress', 'charge', 'slaving', 'heavy_hitter', 'hitrun', 'tidal_warfare'],
    description:
      'Each combat domain contributes a signature ability. 3-combat unit collects 3 signatures simultaneously. Cannot be killed by a single hit (survives at 1 HP once). Ignores zone of control.',
    effects: [
      { kind: 'setFlag', flag: 'emergentUndying' },
      { kind: 'setFlag', flag: 'emergentIgnoreZoc' },
      // Per-domain signatures — only fire if the faction has learned that domain
      { kind: 'statMod', stat: 'emergentPoisonPerHit', op: 'set', value: 1, condition: 'domain:venom' },
      { kind: 'statMod', stat: 'emergentDamageReflection', op: 'add', value: 0.3, condition: 'domain:fortress' },
      { kind: 'statMod', stat: 'emergentKnockbackOnKill', op: 'set', value: 1, condition: 'domain:charge' },
      { kind: 'statMod', stat: 'emergentFreeReposition', op: 'set', value: 1, condition: 'domain:hitrun' },
      { kind: 'statMod', stat: 'emergentArmorPierce', op: 'set', value: 0.5, condition: 'domain:heavy_hitter' },
      { kind: 'statMod', stat: 'emergentCaptureBelowHpPercent', op: 'set', value: 0.25, condition: 'domain:slaving' },
      { kind: 'statMod', stat: 'emergentBonusDamageAdjacentWater', op: 'set', value: 2, condition: 'domain:tidal_warfare' },
    ],
    friendlyFlavor:
      'Your juggernauts collect the essence of every combat art they master. They cannot be stopped by a single blow, cannot be contained by formation, and carry the fury of three warriors in one body.',
    enemyFlavor:
      'This one soldier had everything — poison, armor-breaking, the works. We hit it with everything and it just kept coming. It should have died three times over. It walked through our shield wall like it wasn\'t there.',
  },
  {
    id: 'slave_empire',
    name: 'Slave Empire',
    condition: 'contains_slaving AND contains_heavy AND contains_fortress',
    domainSets: {
      slaving: ['slaving'],
      heavy: ['heavy_hitter'],
      fortress: ['fortress'],
    },
    description:
      'Fortress zones (2-hex radius) auto-capture wounded enemies below 25% HP. Captured slaves produce +50% resources. Heavy enforcers make slaves immune to rout.',
    effects: [{ kind: 'statMod', stat: 'emergentCaptureBonus', op: 'set', value: 0.2 }],
    friendlyFlavor:
      'Your empire runs on chains. Fortress zones drag in the wounded automatically, your slaves produce at double efficiency, and your heavy enforcers ensure no captives ever break free.',
    enemyFlavor:
      "If you fall below a certain threshold, you don't die — you belong to them. The wounded were dragged inside their walls and never seen again. Their entire economy runs on this.",
  },
  {
    id: 'raid_camp',
    name: 'Raid Camp',
    condition: 'contains_camels AND contains_slaving AND contains_mobility',
    domainSets: {
      camels: ['camel_adaptation'],
      slaving: ['slaving'],
      mobility: ['charge', 'hitrun'],
    },
    description:
      'Each turn, place a Raid Camp within 5 hexes. Allies entering gain +2 movement and stealth for 1 turn. Enemies within 3 hexes of a camp on hostile territory suffer -25% defense. Capture chance +30%. Camp persists 2 turns.',
    effects: [{ kind: 'statMod', stat: 'emergentCaptureBonus', op: 'set', value: 0.3 }],
    friendlyFlavor:
      'Your raiders establish forward camps that turn any position into an ambush point. Allies surge with speed and stealth while enemies falter under the shadow of your presence.',
    enemyFlavor:
      "They set up somewhere nearby — we could feel it. Our scouts couldn't find it, but suddenly our whole flank was exposed. Men were slower, arrows went wide. By the time we located the camp, they'd already taken half our force.",
  },
  {
    id: 'poison_shadow',
    name: 'Poison Shadow',
    condition: 'contains_venom AND contains_stealth AND contains_combat',
    domainSets: {
      venom: ['venom'],
      stealth: ['river_stealth'],
      combat: ['charge', 'hitrun'],
    },
    description:
      "Stealth attacks apply 3 poison stacks instantly. Retreating from stealth leaves a poison cloud (2 damage/turn, 2-hex radius). Enemies can't heal while in the cloud.",
    effects: [
      { kind: 'applyStatus', status: 'poison', stacks: 3, condition: 'isStealthAttack' },
      { kind: 'spawnOnMap', effectType: 'poisonCloud', position: 'attacker', condition: 'isRetreat' },
      { kind: 'statMod', stat: 'poisonTrapDamage', op: 'set', value: 2, condition: 'isRetreat' },
    ],
    friendlyFlavor:
      'Your shadow-venom assassins are the nightmare your enemies never wake from. Strike from darkness with triple venom, then retreat into a cloud of poison that chokes the life from anyone who dares follow.',
    enemyFlavor:
      "They struck from nowhere — three of our men dropped instantly, veins black. We tried to pursue but the area they'd vacated was wrong. Clouds of something. Anyone who entered started coughing blood. The healers couldn't help; their medicine wouldn't take hold.",
  },
  {
    id: 'iron_turtle',
    name: 'Iron Turtle',
    condition: 'contains_fortress AND contains_heavy AND contains_terrain',
    domainSets: {
      fortress: ['fortress'],
      heavy: ['heavy_hitter'],
      terrain: ['tidal_warfare', 'camel_adaptation'],
    },
    description:
      '2-hex crushing zone deals 2 damage/turn and -1 movement to enemies inside. 50% damage reflection. Cannot be displaced. Ignores zone of control.',
    effects: [
      { kind: 'statMod', stat: 'damageReflection', op: 'set', value: 0.5 },
      { kind: 'preventAction', action: 'displacement' },
      { kind: 'setFlag', flag: 'emergentIgnoreZoc' },
    ],
    friendlyFlavor:
      'Your iron turtles are immovable juggernauts that crush everything nearby. They reflect pain, grind down opposition, and walk through enemy formations as if they weren\'t there.',
    enemyFlavor:
      "We surrounded one and it didn't matter. Men near it took damage just standing there. Our strikes bounced back — I watched my own sword swing return into my shoulder. We couldn't displace it. We couldn't ignore it. We just had to leave.",
  },
  {
    id: 'many_faced',
    name: 'Many-Faced',
    condition: 'default',
    description:
      'Cycles stances based on last turn\'s events. Took damage -> Bulwark (+40% defense, 25% reflection). Dealt damage -> Predator (+40% damage, +1 range). Moved -> Phantom (ignore ZoC, +1 movement, stealth on rough terrain). Stance persists until the next event reassigns it.',
    effects: [
      {
        kind: 'modeSelect',
        selector: 'combatContext',
        collectMode: 'pickOne',
        modes: {
          bulwark: [
            { kind: 'statMod', stat: 'defense', op: 'add', value: 0.4 },
            { kind: 'statMod', stat: 'damageReflection', op: 'add', value: 0.25 },
          ],
          predator: [
            { kind: 'statMod', stat: 'damage', op: 'multiply', value: 1.4 },
          ],
          phantom: [
            { kind: 'setFlag', flag: 'emergentIgnoreZoc' },
          ],
        },
      },
    ],
    friendlyFlavor:
      'Your many-faced warriors adapt to every moment of battle. They are shield when struck, blade when striking, and shadow when moving — ever shifting, never the same twice.',
    enemyFlavor:
      "Every time we thought we'd figured them out, they changed. Aggressive one moment, impenetrable the next, then gone entirely. They don't have a strategy. They have all of them.",
  },
];

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

export const PAIR_SYNERGIES: readonly PairSynergyConfig[] = PAIR_SYNERGIES_DATA;
export const EMERGENT_RULES: readonly EmergentRuleConfig[] = EMERGENT_RULES_DATA;

export function getAllPairSynergies(): readonly PairSynergyConfig[] {
  return PAIR_SYNERGIES;
}

export function getAllEmergentRules(): readonly EmergentRuleConfig[] {
  return EMERGENT_RULES;
}

export function getPairSynergyById(id: string): PairSynergyConfig | undefined {
  return PAIR_SYNERGIES.find((s) => s.id === id);
}

export function getEmergentRuleById(id: string): EmergentRuleConfig | undefined {
  return EMERGENT_RULES.find((r) => r.id === id);
}
