# 9 Tribes — Tech Tree Rework Notes

> Branch: `claude/review-document-6rr9w`
> Companion to: `docs/tech-tree-audit.md`
> Status: Phase 1 (creative content + source-of-truth migration + bug fixes) — complete.

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

- **Venom T2 spore-jump** (`venom.spore-jump`): when a poisoned enemy dies, jump 1 stack to nearest (foreign) or all (native) enemies within 2 hexes. Touches `applyCombatAction()` poison-death path.
- **Venom T3 Toxic Bloom**: track contaminated hexes and tick 2 dmg/turn while occupied. Extends the existing contamination system.
- **Nature Healing T1 forest regen bonus**: units ending turn on forest/jungle regen +3 HP instead of +1. Touches `factionTurnEffects.applyRegen`.
- **Hitrun T2 Bloodtrail momentum**: track per-unit wound count -> +1 movement next turn. New per-unit state field.
- **Hitrun T3 killing chain**: after kill, allow second attack at -40% (foreign) / 100% (native), up to 3 chains for native. Touches `applyCombatAction()` post-kill path.
- **Charge T1 first-attack-per-target**: native Lions get `firstAttackDamageBonus` reset per new target this turn, not once-per-combat.
- **Charge T2 Stampede**: routed enemies displace randomly 2 hexes. Touches rout-resolution.
- **Charge T3 splash + chain amplification**: native Lions splash 50% of charge damage to enemies adjacent to target; charges through friendly Lions chain +10% per ally in line (cap +50%).
- **Heavy Hitter T1 +20% vs elevation**: damage bonus when defender is on hill/mountain. Single conditional in `preview.ts`.
- **Heavy Hitter T2 native reflection (50%) + stagger**: extend the existing `damageReflectionPercent` consumer.
- **Heavy Hitter T3 Last Stand**: native flag `lastStandPerCombat` — when reduced to 0 HP, survive at 1 HP once per combat. Touches the kill-resolution path in `applyCombatAction()`.

### Strategic-layer wiring (new player actions / new state)

These are the highest-value identity moments but require new UI affordances, new persistent faction-level state, or new map mutators:

- **Fortress native T3 — Bastion placement**: ✅ **shipped.** Hill Engineers may raise up to 3 Bastions per game once they research the native fortress T3. Player verb wired via `'build_bastion'` ClientAction (CommandTray "Raise Bastion" button → GameController → GameSession.applyBuildBastion → sessionUtils.buildBastionAtUnit). AI heuristic wired via `src/systems/unit-activation/bastion.ts` (`getBastionOpportunity` / `buildBastionIfEligible`, score threshold 10). Hard cap enforced through `faction.bastionsBuilt` counter and `canBuildBastion` doctrine flag in `capabilityDoctrine.ts`. The retired field-fort system (`fieldFort.ts`, `field_fort` improvement, `canBuildFieldForts` flag, player-side `getFortBuildEligibility`/`buildFortAtUnit`, `build_fort` action) has been deleted; reusable brace + hill-dug-in helpers moved to `src/systems/unit-activation/braceAndDugIn.ts`. Bastions still need a vision-aura wiring pass (the +3-hex ally vision is in the description but not yet computed in fog refresh) and a strategic-tier sound effect.
- **Camel native T3 — Oasis declaration**: once-per-game conversion of a 2-hex radius of any terrain into desert. Needs a player-action verb + terrain mutator.
- **River native T3 — Submerge**: a per-turn unit action that removes the unit from the board for 1 turn and re-emerges in stealth along the connected waterway. Needs an action verb + transient-removal state + waterway graph traversal.
- **Tidal foreign T3 — Maelstrom (3-hex / 3-turn)**: once-per-game AoE debuff zone. Needs an action verb + zone-effect state.
- **Tidal native T3 — Maelstrom (5-hex / 5-turn) + naval kill auto-capture**: bigger version + synergy with slaving.
- **Slaving T1–T3 capture overhaul**: arrive-as-Slave conversion with stat fractions, market production bonus, Captive Champion mechanic. Needs new prototype generation + cross-faction stat copy.
- **Nature native T3 — Sapling creation**: Druid kills convert the target hex to a permanent forest tile, with +1 max HP per kill (capped +3 lifetime). Needs terrain mutator + unit-bonus tracking.
- **Nature T2 — wounded earth**: terrain absorbs 25% of damage on forest/jungle; native heals adjacent allies instead of debuffing enemies. Needs transient terrain state.

These are all designed to coexist with existing systems (poison stacks, contamination, terrain types, faction history) and most can be expressed as faction flags + counter fields + improvements without new state-tracking categories. Implementation is a follow-up branch (or a sequence of focused PRs, one mechanic at a time).

---

## What this means for play today

- **All existing tests pass** (728/728). The migration is behavior-preserving for everything that was already wired.
- **Heavy Hitter Arctic Wardens are immediately stronger** because their native T3 capstone (100% armor pen + immovable) now actually applies. This was a documented capability that was dead code before.
- **Savannah Lions are slightly weaker** because their charge T3 no longer accidentally grants 100% armor pen (that effect belongs to Heavy Hitter and is wired there now). They retain their legitimate terrain-ignoring charges.
- **Hill Engineers no longer start with `heavy_hitter` learned.** They begin like every other tribe (one native domain only). Only Pirate Lords retain a dual-start (slaving + tidal_warfare).
- **All tribes get richer T1/T2/T3 description text** in the UI immediately, because the SynergyChip and TechDiscoveryModal pull descriptions from the new typed catalog.

---

## Source-of-truth boundary

After this rework, the rule is simple: **`src/content/domains/index.ts` is the only place to change domain content**. The frontend imports from it; the backend imports from it; the registry adapter (`loadRulesRegistry`) reads from it. There are no JSON copies and no parallel data files. To add a new domain or change a tier description, edit one file.
