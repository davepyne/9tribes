# 9 Tribes — Tech Tree Rework Notes

> Branch: `claude/review-document-6rr9w`
> Companion to: `docs/tech-tree-audit.md`
> Status: Phase 1 (creative content + source-of-truth migration + bug fixes) — complete. Phase 2 (Tier 1 wiring) — complete. Tier 2 wiring — in progress.

This document tracks the rework of the T1–T3 progression system delivered on this branch and lists the mechanics that are defined in the new domain catalog but not yet wired into combat/movement/strategic code.

---

## What changed in Phase 1

### Architecture: backend now owns the truth

- **New source of truth**: `src/content/domains/index.ts` — a typed TypeScript module containing all 10 domains, every tier, every effect-flag, and both foreign and native descriptions.
- **Deleted JSON files**: `src/content/base/research.json` and `src/content/base/ability-domains.json` are gone. Their contents are now compile-time-checked TypeScript.
- **Backend consumers migrated** (4 systems + 1 loader): `loadRulesRegistry`, `knowledgeSystem`, `synergyRuntime`, `signatureAbilitySystem`, `strategic-ai/learnLoopCoordinator` all import from `src/content/domains/index.js`.
- **Frontend consumers migrated** (6 files): `web/src/data/domainMeta.ts`, `web/src/game/view-model/inspectors/researchInspectorViewModel.ts`, `web/src/ui/SynergyChip.tsx`, `web/src/ui/TechDiscoveryModal.tsx`, `web/src/ui/inspectors/domainFormatters.ts`. None of these import JSON anymore — all consume the typed module owned by the backend.
- **Hand-rolled JSON validation deleted**: `TechDiscoveryModal.tsx` no longer validates the data shape at runtime — the TS type system guarantees it at compile time.

### Bug fixes shipped

- **`heavyTranscendenceEnabled` is no longer dead code.** In `preview.ts`, the armor-penetration path is now `heavyTranscendenceEnabled ? 1.0 : armorPenetrationEnabled ? 0.5 : 0`. Arctic Wardens finally get their documented 100% armor pen + immovable native capstone.
- **Charge cross-wire removed.** `chargeTranscendenceEnabled` no longer grants 100% armor pen (that was the Heavy Hitter native effect leaking through the wrong flag). Charge T3 retains its legitimate terrain-ignoring-charge effect via `chargeTranscendenceEnabled` in `activateUnit.ts` and `movementSystem.ts`.
- **`antiDisplacement` correction**: the defender's immunity to displacement now keys off `heavyTranscendenceEnabled` (the native Arctic capstone) rather than `chargeTranscendenceEnabled` (the attacker's mobility flag).

### Content design highlights

Every domain now has a clear thematic arc — each tier introduces a new verb rather than a numeric tune — and every native T3 differs from its foreign counterpart by *class of mechanic*, not threshold:

| Domain | T1 verb | T2 verb | T3 (foreign) | T3 (native) |
| --- | --- | --- | --- | --- |
| Venom | apply | propagate (hunting spores) | toxic blooms | persistent blooms + network detonate |
| Nature Healing | regen | wounded earth | worldroot share | **Sapling creation** (kill -> permanent forest) |
| Skirmish Pursuit | move-strike | bloodtrail momentum | killing chain (-40%) | killing chain at full damage (cascade 3) |
| Fortress | shieldwall | spike lines | phalanx (group damage share) | **Bastion placement** (strategic, 3/game) |
| Slaving | press-gang | slave markets (economy) | auto-capture <30% near naval | **Captive Champion** (1/5 captures: free promoted unit) |
| Camel Adaptation | sand-wise | mirage (distance-stealth) | caravan transport | **Oasis declaration** (1/game terrain conversion) |
| Charge | stamp | routing force + Stampede | sundering chain | **Splash + chain amplification** (50% to neighbors, +10%/Lion in line) |
| River Stealth | eel-skin | predator stance + bleed | drowning wake reveal | **Submerge** (action: water -> emerge anywhere along waterway) |
| Tidal Warfare | wave-sense | boarding tactics | Maelstrom 3-hex/3-turn | **5-hex/5-turn Maelstrom + naval kills auto-capture** (slaving synergy) |
| Heavy Hitter | crushing blow (+vs elevation) | backbreaker (stagger) | 50% armor pen + immovable | **100% armor pen + Last Stand** (survive lethal once/combat) |

---

## What's NOT yet wired

The new content is the **canonical design**, and existing legacy flags are still wired so foreign factions and natives get *something* meaningful today. But a number of the new mechanics in the catalog are deliberately tagged `// design` and not yet implemented in the consumer systems. The list below is the implementation backlog.

### High-value wiring (touch a few existing call sites)

- **Heavy Hitter T1 +20% vs elevation**: ✅ **wired.** `damageBonusVsElevationEnabled` in `capabilityDoctrine.ts`, consumed in `preview.ts` when defender terrain is hill/mountain.
- **Heavy Hitter T2 native reflection (50%) + stagger**: ✅ **wired.** `nativeDamageReflectionEnabled` in doctrine; `apply.ts` branches reflection to 50% + stagger via `nextTurnMovePenalty` on Unit, consumed at turn start in `turnSystem.ts` and `factionTurnEffects.ts`.
- **Hitrun T1 ignore ZoC on approach**: ✅ **wired.** `ignoreZocOnApproachEnabled` in doctrine; `zocSystem.ts` returns 0 ZoC cost when destination has adjacent enemies.
- **Fortress T1 multi-ally defense scaling**: ✅ **wired.** Shieldwall in `preview.ts` now counts adjacent allies: 2+ allies = +25%, 1 ally = +15%.
- **Charge T1 first-attack-per-target**: ✅ **wired.** `firstAttackPerTargetEnabled` in doctrine; `preview.ts` grants +20% on first attack per-target (native) vs first attack per-combat (foreign). `attackedTargetsThisTurn` on Unit, tracked in `apply.ts`, reset at turn start.
- **Camel T1 +1 movement on harsh terrain**: ✅ **wired.** `factionTurnEffects.ts` adds +1 moves when unit starts turn on desert/tundra with `heatResistanceEnabled`, capped at maxMoves+1.
- **Venom T2 spore-jump**: ✅ **wired.** `sporeJumpEnabled` / `sporeJumpAllEnemies` in `capabilityDoctrine.ts`; consumed in `apply.ts` after the contaminate-terrain block. When a poisoned enemy is killed, 1 poison stack jumps to nearby enemies: foreign hits the nearest enemy within 2 hexes; native (Jungle Clans) hits ALL enemies within 2 hexes. Uses `applyPoisonDoT` and sets `poisonedBy` / `poisonSourcePrototypeId` on jumped-to units. 8 tests in `tests/sporeJump.test.ts`.
- **Venom T3 Toxic Bloom**: ✅ **wired.** `toxicBloomEnabled` / `toxicBloomPermanent` / `myceliumNetworkOnKillEnabled` / `cleanseToxicBloomEnabled` in `capabilityDoctrine.ts`. New module `src/systems/toxicBloomSystem.ts` exposes `detectAndSpawnToxicBlooms(state)` and `cleanseToxicBlooms(state)`; both hook into round rollover (tick → cleanse → detect) in `turnSystem.ts:116-126` and `warEcologySimulation.ts:135-141`. Damage consumer in `simulation/environmentalEffects.ts:187-194` between contamination and bleed ticks. Mycelium-network on-kill propagation in `combat-action/apply.ts:554-583` — Jungle Clans kill inside an owned Bloom propagates 2 poison stacks to all friendly units within 3 hexes of the bloom center. Foreign Blooms last 3 turns; native Blooms are permanent until cleansed by a Druid Circle (nature_healing native T3) unit standing on the bloom center.
- **Nature Healing T1 forest regen bonus**: ✅ **wired.** `forestRegenBonus` in `capabilityDoctrine.ts`; consumed in `factionTurnEffects.ts` heal loop — units on forest/jungle regen +3 HP/turn instead of +1 when `nature_healing_t1` is completed.
- **Hitrun T2 Bloodtrail momentum**: track per-unit wound count -> +1 movement next turn. New per-unit state field.
- **Hitrun T3 killing chain**: ✅ **wired.** `killChainEnabled` / `nativeKillChainEnabled` in `capabilityDoctrine.ts`; consumed in `apply.ts` post-kill path. Foreign: 1 chain at 60% damage. Native (Steppe Riders): chain up to 3 kills at 100% damage. Uses per-unit-per-turn `killChainCountThisTurn` tracking.
- **Charge T2 rout-on-big-charge + Stampede**: ✅ **wired.** `routOnBigChargeEnabled` / `stampedeOnRoutEnabled` in `capabilityDoctrine.ts`; consumed in `apply.ts` after knockback. Charge dealing >50% maxHP routs defender; native Savannah Lions stampede routed targets 2 hexes randomly (seeded RNG), dealing 2 damage on collision.
- **River Stealth T2 predator bleed + persistent stealth**: ✅ **wired.** `predatorBleedEnabled` / `persistentStealthOnAttackEnabled` in `capabilityDoctrine.ts`. Bleed: first attack from stealth applies bleed (1 dmg/turn, 3 turns) via `bleeding`/`bleedTurnsRemaining` on Unit, ticked in `environmentalEffects.ts`. Persistent stealth: native River People attacks from stealth do NOT break stealth.
- **Heavy Hitter T3 Last Stand**: ✅ **wired.** `lastStandEnabled` in `capabilityDoctrine.ts`; consumed in `apply.ts` kill-resolution path. Arctic Wardens with native heavy_hitter T3 survive a lethal hit at 1 HP once per turn. Uses per-unit-per-turn `lastStandUsedThisTurn` tracking, reset in `turnSystem.ts` and `factionTurnEffects.ts`. Does not trigger on instant-kill synergy effects.
- **Charge T3 splash + chain amplification**: native Lions splash 50% of charge damage to enemies adjacent to target; charges through friendly Lions chain +10% per ally in line (cap +50%).
- **Heavy Hitter T3 Last Stand**: native flag `lastStandPerCombat` — when reduced to 0 HP, survive at 1 HP once per combat. Touches the kill-resolution path in `applyCombatAction()`.

### Tier 3 — Strategic-layer infrastructure (foundation)

The five remaining new-system mechanics (Maelstrom, Toxic Bloom, Oasis, Sapling, Submerge) share two pieces of infrastructure that ship as their own foundation before any mechanic plugs in:

- **Zone effects system**: ✅ **shipped (skeleton).** Generic map-level effects keyed by `ZoneEffectId`, with center+radius coverage, damage and movement penalty per turn, and a lifetime that ticks down on round rollover. Lives in `src/features/zoneEffects/types.ts` (data shape) and `src/systems/zoneEffectSystem.ts` (lifecycle/query helpers). `state.zoneEffects: ReadonlyMap<ZoneEffectId, ZoneEffect>` is the canonical store; `tickZoneEffectLifetimes()` runs from `turnSystem.ts` and `warEcologySimulation.ts` on round rollover. Designed for Maelstrom (radius 3/5, 3/5 turns) and Toxic Bloom (radius 0, 3 turns / permanent). Friendly fire is OFF; visibility is universal; multiple effects on a hex stack additively.
- **Terrain mutation utility**: ✅ **shipped.** `src/systems/terrainMutationSystem.ts` exports `setTerrainAt(state, hex, terrain)` and `setTerrainInRadius(state, center, radius, terrain)`. Mutates `state.map.tiles` directly so every downstream system (movement, defense, vision, ecology) picks up the change automatically. One-way; no reversal. Designed for Oasis (radius 2 → desert) and Sapling (radius 0 → forest).

The damage consumer hook now lives in `simulation/environmentalEffects.ts:187-194` (added by the Toxic Bloom wiring) and applies to any ZoneEffect with `damagePerTurn > 0` — Maelstrom reuses it as-is. The movement-penalty consumer is now wired in `movementSystem.ts` via `getZoneEffectMovementPenalty`, applied after the minimum-cost floor so zone penalties cannot be negated.

### Strategic-layer wiring (new player actions / new state)

These are the highest-value identity moments but require new UI affordances, new persistent faction-level state, or new map mutators:

- **Fortress native T3 — Bastion placement**: ✅ **shipped.** Hill Engineers may raise up to 3 Bastions per game once they research the native fortress T3. Player verb wired via `'build_bastion'` ClientAction (CommandTray "Raise Bastion" button → GameController → GameSession.applyBuildBastion → sessionUtils.buildBastionAtUnit). AI heuristic wired via `src/systems/unit-activation/bastion.ts` (`getBastionOpportunity` / `buildBastionIfEligible`, score threshold 10). Hard cap enforced through `faction.bastionsBuilt` counter and `canBuildBastion` doctrine flag in `capabilityDoctrine.ts`. The retired field-fort system (`fieldFort.ts`, `field_fort` improvement, `canBuildFieldForts` flag, player-side `getFortBuildEligibility`/`buildFortAtUnit`, `build_fort` action) has been deleted; reusable brace + hill-dug-in helpers moved to `src/systems/unit-activation/braceAndDugIn.ts`. Bastions still need a vision-aura wiring pass (the +3-hex ally vision is in the description but not yet computed in fog refresh) and a strategic-tier sound effect.
- **Camel native T3 — Oasis declaration**: once-per-game conversion of a 2-hex radius of any terrain into desert. Needs a player-action verb + terrain mutator.
- **River native T3 — Submerge**: a per-turn unit action that removes the unit from the board for 1 turn and re-emerges in stealth along the connected waterway. Needs an action verb + transient-removal state + waterway graph traversal.
- **Tidal T3 — Maelstrom**: ✅ **wired.** `canDeclareMaelstrom` / `maelstromRadius` / `maelstromDuration` / `maelstromAutoCaptureEnabled` in `capabilityDoctrine.ts`. New module `src/systems/maelstromSystem.ts` exports `declareMaelstrom(state, factionId, centerHex)` which validates doctrine + water terrain, creates a `ZoneEffect` with `type: 'maelstrom'`, `damagePerTurn: 2`, `movementPenalty: 1`. Damage consumer rides the existing generic path in `environmentalEffects.ts`. Movement penalty wired in `movementSystem.ts` via `getZoneEffectMovementPenalty` (applied after minimum-cost floor). Auto-capture hook in `combat-action/apply.ts` post-kill path: native tidal T3 naval kills inside own Maelstrom auto-capture regardless of HP threshold. Player verb wired via `'declare_maelstrom'` ClientAction (CommandTray → GameController → GameSession → sessionUtils → maelstromSystem). AI heuristic in `src/systems/unit-activation/maelstrom.ts` (`getMaelstromOpportunity` / `declareMaelstromIfEligible`, score threshold 8, requires 3+ enemies in radius). Per-game cap via `faction.maelstromsDeclared`. Pirate Lords have `nativeDomains: ['slaving', 'tidal_warfare']` (dual native domain), so tidal T3 resolves as native: 5-hex radius, 5 turns, with naval-kill auto-capture.
- **Slaving T1–T3 capture overhaul**: ✅ **wired.** `slaveHpFraction` / `slaveStatFraction` / `navalCaptureRadius` in `capabilityDoctrine.ts`, resolved by tier (T1: stat 0.6/hp 0.01, T2: stat 0.6/hp 0.5, T3: stat 0.7/hp 0.5/radius 2). `slaveStatFraction` on Unit multiplies attack+defense in `combatSystem.ts` calculateAttack/calculateDefense. All 5 capture call sites (attemptCapture, attemptNonCombatCapture, press-gang inline, retreat capture, AI activation) pass tier-dependent HP and stat overrides. Slave rout immunity (`slaveRoutImmune` on Unit) set via T2 override, guarded in apply.ts initial rout + big-charge rout. Slave market: T2 grants +1 production to nearest city on capture (via `getNearestFriendlyCity`). Naval capture radius: T3 extends auto-capture to non-capture Pirate units when a friendly non-slave naval unit is within 2 hexes. Captive Champion: `faction.slaveCaptureCount` incremented in all capture paths; every 5th capture with native T3 spawns a free seasoned unit adjacent to the captor using the captured prototype. Re-capture by original faction clears `slaveStatFraction` and `slaveRoutImmune` (liberation). 16 tests in `tests/slavingOverhaul.test.ts`.
- **Nature native T3 — Sapling creation**: Druid kills convert the target hex to a permanent forest tile, with +1 max HP per kill (capped +3 lifetime). Needs terrain mutator + unit-bonus tracking.
- **Nature T2 — wounded earth**: terrain absorbs 25% of damage on forest/jungle; native heals adjacent allies instead of debuffing enemies. Needs transient terrain state.

These are all designed to coexist with existing systems (poison stacks, contamination, terrain types, faction history) and most can be expressed as faction flags + counter fields + improvements without new state-tracking categories. Implementation is a follow-up branch (or a sequence of focused PRs, one mechanic at a time).

---

## What this means for play today

- **All existing tests pass** (729/729). The migration is behavior-preserving for everything that was already wired.
- **Heavy Hitter Arctic Wardens are immediately stronger** because their native T3 capstone (100% armor pen + immovable) now actually applies. This was a documented capability that was dead code before.
- **Savannah Lions are slightly weaker** because their charge T3 no longer accidentally grants 100% armor pen (that effect belongs to Heavy Hitter and is wired there now). They retain their legitimate terrain-ignoring charges.
- **Hill Engineers no longer start with `heavy_hitter` learned.** They begin like every other tribe (one native domain only). Only Pirate Lords retain a dual-start (slaving + tidal_warfare).
- **All tribes get richer T1/T2/T3 description text** in the UI immediately, because the SynergyChip and TechDiscoveryModal pull descriptions from the new typed catalog.

---

## Source-of-truth boundary

After this rework, the rule is simple: **`src/content/domains/index.ts` is the only place to change domain content**. The frontend imports from it; the backend imports from it; the registry adapter (`loadRulesRegistry`) reads from it. There are no JSON copies and no parallel data files. To add a new domain or change a tier description, edit one file.
