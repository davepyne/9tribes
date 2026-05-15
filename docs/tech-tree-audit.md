# 9 Tribes — Technology Progression Audit

> Branch: `claude/review-document-6rr9w`
> Audit date: 2026-05-14
> Method: spec verified against `src/content/base/research.json`, `src/content/base/ability-domains.json`, `src/content/base/civilizations.json`, and consumer sites in `src/systems/capabilityDoctrine.ts`, `src/systems/combat-action/preview.ts`, `src/systems/combat-action/apply.ts`, `src/systems/movementSystem.ts`, `src/systems/zocSystem.ts`, `src/systems/healingSystem.ts`, `src/systems/fogSystem.ts`, `src/systems/simulation/environmentalEffects.ts`.
> Weighting: **balance vs. XP cost** and **thematic coherence** prioritized; suggestions are design-level.

---

## Executive Summary

The T1→T2→T3 system is **conceptually strong** and well-served by the ecology/exposure loop — there's a real "wars create technology" feel, and the native-vs-foreign asymmetry creates meaningful incentives to play your tribe's identity. Several domains (Venomcraft, Camel Adaptation, River Stealth) have clean arcs where each tier introduces a *new mechanical verb* rather than just bigger numbers, and the corresponding native T3 capstone (poison detonation; "all terrain costs 1 movement"; cloak-aura for allies) feels distinctly tribe-defining. Venomcraft in particular is the gold standard: apply → contaminate ground → detonate, with the native bonus chaining into all three layers.

**What's not working** falls into three buckets. **First**, several T3 native bonuses are pure repeats or weaker re-statements of earlier tiers — Tidal Warfare T3 native ("all units cross rivers and coast without movement penalty") is almost identical to T1 ("no movement penalty crossing rivers"); Steppe Riders' hitrun T3 native ("all units can attack then retreat") is just granting the foreign T2 effect to all units; Slaving T3 native (auto-capture <50% HP) is the same effect as the foreign T3 (<25% HP) with only a threshold tuning. **Second**, the foreign-vs-native gap is wildly inconsistent — Fortress's foreign T3 is a flat +10% defense buff vs. native's "all units can brace + aura radius 2," which is a multiple-class-of-mechanic jump, while Slaving's gap is just a numeric threshold. **Third**, the foundational T1 base for non-native factions is rarely a *qualitatively* different thing from what the native got — most foreign T1s simply reproduce the native's starting effect at parity, so the "you have to fight us to learn how to do what we already do" theme isn't paid off mechanically until T3.

**Implementation surprised me on three points.** (1) `heavyTranscendenceEnabled` — the flag for Arctic Wardens' native `heavy_hitter_t3` — is set in `capabilityDoctrine.ts:214` but **never consumed anywhere in the codebase**. The Arctic Wardens' "100% armor pen + cannot be displaced" native capstone is dead code; they get the foreign 50% armor pen instead. (2) `chargeTranscendenceEnabled` (Savannah Lions' native charge T3) **does** grant 100% armor penetration in `preview.ts:352`, but the *documented* native bonus for charge T3 is "any melee unit can charge, ignoring terrain penalties" — armor pen is unmentioned in `research.json`. This is a cross-wire: the code accidentally moved Arctic's intended ability onto Savannah. (3) `src/content/base/ability-domains.json` and `src/content/base/research.json` are partially divergent specs of the same effects — fortress base is +30%/radius-1 in one file and +15%/adjacent-only in the other; nature_healing's base is "self-heal 2 / ally-heal 1" vs research.json's "+1 HP regen everyone + forest first-strike." The two systems coexist but don't agree.

**Bottom line:** the framework is good, but ~30% of the native-T3 capstones don't deliver a memorable payoff, two are broken in code, and several T1 bases over-promise uniqueness that the data doesn't enforce. Tidal Warfare, Heavy Hitter, and Slaving need the most attention. The Hill Engineers' undocumented dual-start (`heavy_hitter` as learned alongside native `fortress`) also deserves to be either documented as a deliberate design move or removed for consistency with the prompt's "Pirate Lords are unique."

---

## Domain Audit

### Domain: Venomcraft (`venom`) — Jungle Clans

**Current Progression**: T1 apply poison on all attacks → T2 kills contaminate the ground → T3 +50% poison damage (foreign) / on-kill poison detonation in 1-hex radius (native).

**Thematic Arc**: **9/10.** Each tier adds a new verb — apply, leave-behind, propagate. Native arc layers cleanly: persistent stacks (T1) feed contamination zones (T2) that explode outward on kill (T3). The strongest progression in the set.

**Native Base**: Genuinely unique. "Poison stacks never expire" turns a damage-over-time annoyance into permanent attrition; this is *qualitatively* different from foreign T1 (3-turn duration), not a numeric tweak.

**T3 Native Bonus**: **9/10.** Poison detonation on kill is mechanically interesting (creates kill-chain incentives, AoE pressure on clustered formations), thematically resonant (the venom is everywhere), and synergizes with T1's persistence and T2's contamination.

**Foreign vs Native Gap**: Healthy. Foreign T3 (+50% poison damage) is a passive scaling buff that still pays off for any faction that has invested in poison; native T3 is an active payoff loop. The gap is qualitative without being unfair to foreigners.

**Cross-Tribe Appeal**: Strong rush target — poison is universally useful, ecology XP from fighting Jungle Clans is easy to bank, and the foreign T3 is genuinely good even without persistence. Probably the most-researched foreign domain.

**Improvement — Generic T1-T3**: Foreign T2 (contaminate-on-kill) currently has *no native bonus differentiation* — the native and foreigner contaminate identically. Give the native version a larger or longer-lived contamination zone (e.g., 2-hex radius vs 1-hex for foreigners) so each tier carries a native bump, not just T1 and T3.

**Improvement — Native T3 Capstone**: Already strong; if anything, add a small flavor: poison detonations also re-contaminate the source hex, so the native produces a self-sustaining poison field as the Jungle Clans push through enemy formations.

**Alternative T3 Pitch**: "Hivemind Spores" — each poisoned enemy unit becomes a contagion node; at end of turn, adjacent enemy units gain 1 stack from any poisoned neighbor. Turns clustered enemies into liability.

**Issues Found**: None major. `toxicBulwarkEnabled` (capabilityDoctrine.ts:178) is gated on native T3 but its comment says "all units apply poison on hit" — which is a different effect from the documented "on-kill detonation." Worth verifying the flag is doing what the comment claims; one or the other is stale.

---

### Domain: Nature Healing (`nature_healing`) — Druid Circle

**Current Progression**: T1 +1 HP regen all units + forest first-strike → T2 ranged +30% defense in forest/jungle → T3 healing aura radius 2 (foreign) / units <20% HP gain +50% defense (native).

**Thematic Arc**: **6/10.** T1 is regen + ambush, T2 is forest defense for ranged, T3 is aura expansion or last-stand bonus. Each tier is *fine* but they don't compound — T2 (ranged in forest) doesn't reinforce T1 (regen aura) or T3 (last-stand). It feels like three good ideas rather than one escalating thesis.

**Native Base**: Adequate but underwhelming. "+1 HP regen for all units" is a soft number; "first-strike in forests" is conditional. Neither feels like an exclusive Druid identity move — a foreign faction researching nature_healing T1 gets the same regen.

**T3 Native Bonus**: **6/10.** "<20% HP gain +50% defense" (`undyingEnabled`) is mechanically clear but doesn't *feel* like nature/healing — it's a survivability stat tweak. Native T3 should reinforce *healing* identity, not just durability.

**Foreign vs Native Gap**: Awkward. Foreign T3 (radius 2 heal aura) is arguably more impactful in mass formations than native T3 (defense at <20% HP), making the native capstone feel like a downgrade if you bring a tall army.

**Cross-Tribe Appeal**: High for armies that can stack regen. The radius-2 healing aura is a strong foreign target.

**Improvement — Generic T1-T3**: Replace T2 ("ranged +30% defense in forest/jungle") with something that compounds with T1's regen — e.g., "Healing aura also cures 1 poison stack per turn." This bridges into Venomcraft counterplay and ties the tier to the domain's core verb.

**Improvement — Native T3 Capstone**: Give Druids "Sap of Renewal" — units in the Druid Circle healing aura that take damage heal a portion of damage taken as HP next turn. This makes the *aura itself* the identity, not just stat tweaks.

**Alternative T3 Pitch**: "Verdant Resurgence" — when a Druid unit kills an enemy on forest/jungle, that hex becomes a healing tile for 5 turns (allies on it heal +2 HP/turn). Turns combat into terrain transformation, mirroring Venom's contamination but inverted.

**Issues Found**: `ability-domains.json` describes the base as "Unit heals 2 HP/turn; adjacent allies heal 1 HP/turn" whereas `research.json` T1 is "+1 HP regen for all units; first-strike in forests." Two different effects under the same name in two files. Pick one.

---

### Domain: Skirmish Pursuit (`hitrun`) — Steppe Riders

**Current Progression**: T1 +10% damage on move-then-attack → T2 retreat 1 hex after kill → T3 ignore ZoC (foreign) / all units can attack then retreat (native).

**Thematic Arc**: **7/10.** Genuine escalation in *mobility verbs*: bonus on the move → reposition after kill → free movement through enemy lines. Coherent.

**Native Base**: Just a damage modifier. "+10% on move-then-attack" is a numeric incentive, not a unique playstyle. The Steppe Riders' identity is supposed to be lightning skirmish, but at T1 they have the same +10% any foreign researcher gets.

**T3 Native Bonus**: **5/10.** "All units can attack then retreat" is functionally the foreign T2 (`retreatAfterKill`) lifted to all units and stripped of the kill requirement. It's useful — but it's not a *new mechanic*, just a generalization. The prompt's critique here is correct.

**Foreign vs Native Gap**: Foreign T3 (ignore ZoC) is in some ways *more* tactically valuable than native T3 because ZoC is what makes pinning work. Native's "everyone can attack-retreat" is broad but lacks teeth against fortress factions.

**Cross-Tribe Appeal**: Moderate. The foreign T3 (ignore ZoC) is excellent counterplay vs Fortress factions, so it'll be researched as anti-Hill tech.

**Improvement — Generic T1-T3**: Make T1 native-exclusive: foreigners get +10% on move-then-attack, but Steppe natives get +10% on *any* attack made on a turn they moved (including chained attacks via T2 retreat). The "Skirmish Pursuit" name should mean *chained* skirmish, not single-pulse.

**Improvement — Native T3 Capstone**: Replace "all units can attack-retreat" with **"Sweeping Pursuit"** — when a Steppe unit kills, it can attack a second adjacent enemy at -50% damage; if that also kills, retreat freely. This turns a Steppe deathball into a kill-cascade tool that explicitly *isn't* just "everyone gets the foreign T2."

**Alternative T3 Pitch**: "Horsefall" — Steppe units can move-attack-move across the same turn for free if the attack kills; if it doesn't, normal rules apply. Rewards skill in target prioritization, doesn't just generalize.

**Issues Found**: The "all units can attack then retreat" capstone is the closest the system gets to a placeholder. It works mechanically but loses thematic specificity — every other domain has T3 native introducing a *concept*, not just a permissive cast.

---

### Domain: Fortress Discipline (`fortress`) — Hill Engineers

**Current Progression**: T1 +15% defense when adjacent to ally → T2 build field forts + project ZoC → T3 aura +25% (up from +15%) (foreign) / all units brace + aura radius 2 (native).

**Thematic Arc**: **8/10.** Stand → build → fortify everywhere. Each tier adds a clear verb (cluster, construct, expand) and reinforces the previous.

**Native Base**: Solid. +15% adjacent-ally defense is a real positional incentive; it pushes Hill Engineers to fight in clumps. Other factions get the same effect at T1, but the *culture* the bonus rewards (clustering) is naturally Hill Clans' fighting style.

**T3 Native Bonus**: **8/10.** Brace-on-all-units + doubled aura range is genuinely transformative — turns a Hill army into a moving fortress. Mechanically expensive to balance, but thematically perfect.

**Foreign vs Native Gap**: Probably the largest qualitative gap in the system. Foreign T3 is "+10% on the existing aura," native T3 is "everyone can brace + aura radius 2." Foreigners get an arithmetic upgrade; natives get a paradigm shift. This is the best example of native superiority done right — but it does mean foreign T3 in fortress is mildly disappointing to invest in.

**Cross-Tribe Appeal**: Universally appealing — defense always travels. But the foreign T3 is the weakest payoff in the set relative to native; armies will research T2 and stop.

**Improvement — Generic T1-T3**: Foreign T3 should add a new *verb*, not just bump the aura number. E.g., "allies inside your fortress aura can fortify in 1 turn instead of 2." Keeps it qualitative.

**Improvement — Native T3 Capstone**: Already strong. Could add "Hill Engineers' field forts cost 0 turns to build on hill/mountain terrain" to reinforce the engineering identity beyond just defense.

**Alternative T3 Pitch**: "Crown of Stone" — when 3+ Hill units form a connected line, they generate a +20% defense pulse along the line every turn. Rewards battlefield geometry rather than passive auras.

**Issues Found**: `ability-domains.json` `baseEffect` says +30%/radius-1 while `research.json` T1 says +15%/adjacent-only. The two spec files disagree about Fortress's base.

---

### Domain: Slaving (`slaving`) — Pirate Lords (restrictedToNative)

**Current Progression**: T1 +15% damage vs wounded + 5% capture-on-kill chance → T2 15% capture-on-retreat → T3 auto-capture below 25% HP (foreign) / auto-capture below 50% HP (native).

**Thematic Arc**: **7/10.** Pressure wounded → catch fleeing → automate capture. Coherent verbs. The arc tracks the *systematization* of slave-taking.

**Native Base**: Solid for the Pirates — combining capture incentives at T1 fits their economy and meshes with `greedy` mechanic. But foreigners can never get this (restrictedToNative), so the question of "is the native base unique" is trivially yes.

**T3 Native Bonus**: **5/10.** Native vs foreign T3 is purely a threshold delta (50% vs 25%). That's *not* a capstone — it's a +25% threshold tuning. The prompt's critique is correct and the JSON even reflects this: foreign T3 has no `description` field, only `nativeDescription`, because there's nothing meaningfully separate to describe.

**Foreign vs Native Gap**: Since slaving is restrictedToNative, foreigners can never research this domain — `autoCaptureEnabled` for foreign T3 (`capabilityDoctrine.ts:212`) is unreachable in practice. The flag exists but cannot trigger. **This is dead code paid for in complexity.** Either remove the foreign branch entirely or reverse the restriction.

**Cross-Tribe Appeal**: Zero — restricted. Fine for identity, but means slaving generates exposure XP for everyone *but no one can act on it*, which subtly disrupts the mutual-benefit loop.

**Improvement — Generic T1-T3**: Since restrictedToNative, the generic branch is wasted. Consider either (a) opening slaving to foreigners with a heavy moral/diplomatic cost, or (b) deleting the foreign-T3 effect and making the native T3 *the* T3, freeing design space for a true Pirate capstone.

**Improvement — Native T3 Capstone**: Replace "auto-capture below 50%" with **"Pressed into Service"** — captured units retain 50% of their original combat stats and immediately fight under your command. Plus, a slaughtered enemy faction's captured city has its garrison auto-converted on capture. Makes slaving a *force-multiplier* identity, not just an HP-tuning passive.

**Alternative T3 Pitch**: "Slave Markets" — every captured unit increases the production rate of Pirate cities by a stacking +5% (capped). Turns slaving into a *strategic-layer* economy mechanic, distinct from all other domains which are tactical.

**Issues Found**:
- Foreign T3 has no description in `research.json` (only `nativeDescription` and a `type`). UI rendering of this node will be inconsistent.
- `autoCaptureEnabled` foreign branch is unreachable because of `restrictedToNative`. Dead code.
- The faction `coral_people` (Pirate Lords) starts with `tidal_warfare` learned AND has `slaving` native — strong dual identity, but doubles the asymmetry vs other factions; balance accordingly.

---

### Domain: Camel Adaptation (`camel_adaptation`) — Desert Nomads

**Current Progression**: T1 no movement penalty in desert/tundra → T2 permanent stealth in desert/tundra → T3 +20% defense in rough terrain (foreign) / all terrain costs 1 movement (native).

**Thematic Arc**: **8/10.** Endurance → invisibility-in-harsh → terrain-mastery (or, for foreigners, fortification-in-rough). Tier verbs are mobility, stealth, dominance — clean escalation in conceptual range.

**Native Base**: Strong and binary — "you can or you can't" move freely through deserts. The prompt's analysis is right: this is one of the few T1 bases that's qualitatively unique even though foreigners can replicate it (because foreigners then *also* get the binary, which is the point of the domain).

**T3 Native Bonus**: **9/10.** "All terrain costs 1 movement" is genuinely transformative — flattens the map for Desert Nomads, reinforces their identity as expeditionary fighters who go where others can't.

**Foreign vs Native Gap**: Good. Foreign T3 (+20% rough-terrain defense) is a different class of mechanic from native T3 (universal movement cost = 1) — defensive vs mobility. The two T3s lead to different army builds, which is rare and excellent.

**Cross-Tribe Appeal**: High. Defense in rough terrain is good for any infantry-heavy faction; mobility-through-desert is a niche but valuable strategic option for any faction that finds a desert corridor on their border.

**Improvement — Generic T1-T3**: T2 ("permanent stealth in desert/tundra") is great for natives but useless for factions that never fight in those biomes. Generalize the stealth to *any harsh terrain* (mountain, desert, tundra) for foreigners — natives keep desert/tundra-specific bonuses elsewhere.

**Improvement — Native T3 Capstone**: Already strong. Layer in: "Desert Nomads can build cities on desert/tundra at 50% reduced cost" so the T3 supports their economic expansion, not just tactical reach.

**Alternative T3 Pitch**: "Caravan Master" — every Desert unit gains +1 movement and can shuttle allied units 2 hexes per turn (mounted infantry style). Doubles down on the mobility theme with a unit-class twist.

**Issues Found**: None significant. Possibly the most well-designed domain in the set after Venomcraft.

---

### Domain: Charge (`charge`) — Savannah Lions

**Current Progression**: T1 +15% damage on first attack each combat → T2 charges knock back 2 hexes → T3 +50% charge damage vs routed (foreign) / any melee unit can charge + ignore terrain (native).

**Thematic Arc**: **7/10.** Initial impact → displacement → cleanup of broken units. Good arc, but the native T3 ("any melee can charge") feels parallel to the Steppe Riders T3 ("any unit can attack-retreat") — both are unlock-everything natives.

**Native Base**: Modest. +15% first-attack damage is a number, not an identity verb. The thematic "charge" feel comes from T2 (knockback) more than T1.

**T3 Native Bonus**: **6/10 (documented) / problematic (implemented).** The documented native T3 is "any melee unit can charge, ignoring terrain penalties." But in code (`preview.ts:352`), `chargeTranscendenceEnabled` also grants **100% armor penetration** — which is undocumented in `research.json` and arguably should belong to Heavy Hitter's native T3 instead. This is either:
- A balance overreach (Savannah Lions become a tier-S army with 100% armor pen on top of universal charge), or
- A misplaced effect that was intended for `heavy_hitter` native T3 (`heavyTranscendenceEnabled`), which is set but unconsumed.

**Foreign vs Native Gap**: Documented gap is modest (+50% vs routed for foreigners; universal melee charge for natives). Effective gap, given the 100% armor pen cross-wire, is enormous and probably unintended.

**Cross-Tribe Appeal**: High — knockback is universally useful. Foreign T3 (vs routed) is decent.

**Improvement — Generic T1-T3**: T1 native should differ from foreign: foreigners get +15% first-attack, natives get +15% first-attack *and* charge attacks deal 50% damage to the hex behind the target (lance-through effect).

**Improvement — Native T3 Capstone**: Decide whether the armor penetration belongs here or in Heavy Hitter and fix the code. If it stays on charge native, document it; if not, remove from `chargeTranscendenceEnabled` and move to `heavyTranscendenceEnabled`. Then make charge native T3 do "charges chain — if a charge kills, the unit can charge again in the same turn at -30% damage."

**Alternative T3 Pitch**: "Tide of Tusks" — Savannah charges create a cascading momentum: each unit that charges into combat this turn gives +5% damage to the next allied charger, stacking up to +50%. Encourages coordinated multi-unit pushes.

**Issues Found**:
- **Cross-wired armor penetration**: `chargeTranscendenceEnabled` grants 100% armor pen (preview.ts:352) but `research.json` doesn't list armor pen as a charge T3 effect.
- The 100% armor pen on charges + universal charge access means a Savannah Lions T3 army may be the strongest unintended combo in the game.

---

### Domain: River Stealth (`river_stealth`) — River People

**Current Progression**: T1 stealth on river/coast/swamp end-of-turn → T2 re-enter stealth after attacking from rough terrain → T3 stealth units reveal stealthed enemies within 2 hexes (foreign) / stealthed units cloak adjacent allies + cloaked attacks +50% (native).

**Thematic Arc**: **9/10.** Stealth → assassinate-and-vanish → propagate-stealth-as-aura. Each tier shifts the use of stealth: defensive → offensive → networked. Excellent.

**Native Base**: Strong and habitat-specific. End-of-turn stealth on wetlands is a real positional reward that shapes how River People fight (always ending turn near water).

**T3 Native Bonus**: **9/10.** Cloak-adjacent-allies + +50% cloaked attack damage is mechanically novel (turns a single stealthed unit into a stealth bubble for the army) and thematically perfect (River People as guerrilla networks).

**Foreign vs Native Gap**: Strong. Foreign T3 (reveal stealth within 2) is *counter*-stealth — a defensive answer to native users. The two T3s are opposed in role, which is rare and great.

**Cross-Tribe Appeal**: Foreign T3 is great as anti-Camel and anti-River tech. Worth researching defensively.

**Improvement — Generic T1-T3**: T2 ("attack-then-stealth") works for natives but is conditional ("rough terrain") in ways that favor River people's home biome. For foreigners, generalize the re-stealth trigger to any terrain that provides cover (forest, jungle, swamp, river, hill).

**Improvement — Native T3 Capstone**: Already excellent. Layer: cloaked allies can pass through enemy units once per turn (single-use ghost movement). Makes the cloak feel like *passage*, not just damage.

**Alternative T3 Pitch**: "Mistveil" — a River unit ending turn on water creates a 1-hex fog cloud lasting 2 turns; enemies entering the cloud lose 1 movement. Turns stealth into terrain-shaping, complementing the cloak aura.

**Issues Found**: None major. Worth ensuring the cloak aura (`stealthCloakAuraEnabled`) doesn't double-stack with foreign reveal (`stealthRevealEnabled`) in pathological cases.

---

### Domain: Tidal Warfare (`tidal_warfare`) — (Pirate Lords starting; nominal native `coral_people`)

**Current Progression**: T1 no movement penalty crossing rivers → T2 naval units attack coast + all units +15% attack on coast/river → T3 naval units +25% attack in coastal hexes (foreign) / all units cross rivers and coast without movement penalty (native).

**Thematic Arc**: **5/10.** T1 is mobility, T2 is naval offense, T3 is more naval offense (foreign) or mobility (native). The native T3 collapses *back into T1's verb* — there's no progression on the native side.

**Native Base**: Adequate. "No river movement penalty" is fine but lacks identity heft.

**T3 Native Bonus**: **3/10.** "All units cross rivers *and coast* without movement penalty" extends T1 from rivers to coast — that's it. Pirates already have water-going units, so this near-duplicates T1. The prompt's critique is dead on.

**Foreign vs Native Gap**: Strange. Foreign T3 is a +25% attack buff (real but narrow); native T3 is a mobility extension that overlaps with T1. They aren't comparable powers — foreigners get a combat ability, natives get a movement extension that they may already have via other domains.

**Cross-Tribe Appeal**: Moderate. Naval factions want this; landlocked factions don't.

**Improvement — Generic T1-T3**: Replace foreign T3 with **"Tidal Surge"** — naval units can transport an infantry unit and disgorge it on coastal hexes mid-turn. A new mechanic, not a +25% buff.

**Improvement — Native T3 Capstone**: Replace the redundant movement extension with **"Coral Tide"** — Pirate naval units can attack two adjacent enemy units in the same turn (split-strike). Or: every Pirate unit on coast/river generates +1 ecology XP per turn toward all learned domains (a passive economy bonus). Either gives the capstone a real identity beyond "more movement."

**Alternative T3 Pitch**: "Maelstrom" — once per game, the Pirate player can declare a Maelstrom over a coastal region; for 3 turns, all non-naval units in that region take -2 movement and -10% defense. A strategic-layer capstone, distinct from the tactical-layer T3s.

**Issues Found**:
- Native T3 is a near-duplicate of T1 — most obvious "flat" capstone in the system.
- `coral_people` is the listed nativeFaction for *both* `slaving` and `tidal_warfare` in `ability-domains.json`, while research.json's nativeDescription on tidal_warfare implies a generic "coastal native." Clarify: do Pirate Lords get *both* native T3 bonuses (slaving + tidal_warfare) for free? If yes, that's a major balance asymmetry; if no, document which is "true native."

---

### Domain: Heavy Hitter (`heavy_hitter`) — Arctic Wardens

**Current Progression**: T1 +20% damage vs fortified/bracing → T2 reflect 25% damage → T3 ignore 50% armor + cannot be displaced (foreign) / ignore 100% armor + cannot be displaced (native, **but unconsumed**).

**Thematic Arc**: **6/10.** Anti-fort → reflect → armor-piercing. Mechanically coherent. The prompt flags that this domain doesn't have terrain/cultural flavor the way Venom or River Stealth do — it's purely "smash things." That's a *legitimate identity* (Arctic Wardens are the brute-force tribe), but it's the only tribe whose entire domain reads as raw stat tuning. As long as the Wardens have non-`heavy_hitter` flavor elsewhere, it can stay; if not, this domain needs a thematic verb (e.g., "shatter" or "endure").

**Native Base**: Numeric. +20% vs fortified is good but doesn't *feel* Arctic — it could equally be a generic infantry trait.

**T3 Native Bonus**: **0/10 as implemented; ~7/10 as documented.** The native effect is dead code: `heavyTranscendenceEnabled` is set in `capabilityDoctrine.ts:214` but **never read** anywhere in `src/`. Arctic Wardens functionally get the foreign T3 (50% armor pen) instead of the documented native effect (100% armor pen + immovable). Meanwhile, `chargeTranscendenceEnabled` (Savannah Lions) provides 100% armor pen — likely a cross-wire that was never undone.

**Foreign vs Native Gap**: Documented gap is +50% armor pen, which is meaningful. Actual gap is **zero** because native is unconsumed.

**Cross-Tribe Appeal**: High — 50% armor pen is broadly useful. This will be a popular foreign rush.

**Improvement — Generic T1-T3**: Add a thematic verb. T2 "reflect 25% damage" works mechanically; pair it at native with "reflected damage also dazes the attacker for 1 turn (-1 movement)." Gives reflection a downstream effect rather than just numeric retaliation.

**Improvement — Native T3 Capstone**: First, **fix the bug** — wire `heavyTranscendenceEnabled` into `preview.ts:352` so native Wardens get full armor pen. Second, give native T3 a distinct verb: **"Unyielding"** — when an Arctic unit takes damage that would kill it, it survives at 1 HP once per combat (or once per turn). Reinforces the brute-endurance identity.

**Alternative T3 Pitch**: "Cold Forge" — Arctic units' damage scales with how cold the terrain is (tundra/ice +30% damage, hills/mountains +15%, neutral +0%, deserts -10%). Ties the domain back to terrain identity without abandoning the brute-force theme.

**Issues Found**:
- **`heavyTranscendenceEnabled` is dead code.** Set but never consumed. Critical implementation bug.
- The 100% armor pen that should be native heavy_hitter T3 is currently granted by `chargeTranscendenceEnabled` (Savannah Lions). Almost certainly a cross-wire.
- `frost_wardens` faction starts with no `startingLearnedDomains` — fine, but worth verifying intent given that Hill Engineers (`hill_clan`) start with `heavy_hitter` learned. The prompt missed this Hill→heavy_hitter dual-start.

---

## Recommendation Priority

These three domains need rework most urgently, in order:

### 1. Heavy Hitter — **fix the dead-code bug first, then add thematic resonance**
Native `heavyTranscendenceEnabled` is set but never consumed; Arctic Wardens currently play with foreign-tier capstone power. Simultaneously, `chargeTranscendenceEnabled` is granting an effect (100% armor pen) that probably belongs here. **First action**: in `src/systems/combat-action/preview.ts:352`, change the conditional so 100% armor pen comes from `heavyTranscendenceEnabled` and is removed from `chargeTranscendenceEnabled` (replace charge native bonus with a documented charge-only effect). **Second action**: add an "Unyielding"-style capstone verb so Arctic identity isn't purely numerical.

### 2. Tidal Warfare — **rewrite the native T3 entirely**
The native bonus is a verbatim repeat of T1 with "coast" added to "rivers." There's no capstone payoff for `coral_people`'s second native-tier investment. **First action**: replace the native description in `src/content/base/research.json` with a genuinely new mechanic (split-strike, maelstrom, or ecology-XP-on-coast). **Second action**: reconsider whether `coral_people` should get native-T3 bonuses on *both* `slaving` and `tidal_warfare`; if yes, document; if no, demote one.

### 3. Slaving — **resolve the restricted-to-native paradox**
Foreign branches for `slaving` (`autoCaptureEnabled`, foreign descriptions, etc.) are paid-for complexity that can never trigger because `restrictedToNative: true`. And the native T3 is just a threshold tune of the (unreachable) foreign T3. **First action**: decide whether to open `slaving` to foreigners with cost or delete the foreign branches. **Second action**: rewrite the Pirate Lords native T3 as a real capstone — "Pressed into Service" (captured units fight at 50% stats immediately) or "Slave Markets" (economy bonus from captures) — so the second native domain delivers payoff distinct from the first (`tidal_warfare`).

### Honorable mentions
- **Steppe Riders' hitrun T3 native** ("all units can attack-retreat") is a placeholder-feeling generalization of foreign T2. Replace with a chained-pursuit mechanic.
- **Nature Healing T2** ("ranged +30% in forest/jungle") doesn't reinforce T1 or T3. Replace with poison-cure to bridge into Venomcraft counterplay.
- **`ability-domains.json` vs `research.json` drift**: pick one source of truth for base/T1 effects. The two files currently disagree on fortress, nature_healing, charge, and hitrun base effects.
