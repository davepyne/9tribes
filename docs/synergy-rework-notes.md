# 9 Tribes — Synergy Rework Notes

> Branch: `claude/optimize-tech-tree-synergies-Jqxic`
> Companion to: `docs/tech-tree-rework-notes.md`
> Status: Phase 0 (catalog migration to typed TS) — complete. Phase 1 (rebalance edits) — not started; this doc is the implementation backlog.

This document audits all **55 pair synergies** and **11 emergent rules** against the new T1–T3 verbs introduced by the tech-tree rework, and proposes concrete reworks where the synergies have fallen out of step with their "home technologies."

---

## What changed in Phase 0 (catalog migration)

Pair-synergies and emergent rules used to live in JSON (`src/content/base/pair-synergies.json`, `emergent-rules.json`) and were loaded by both the backend and the frontend via duplicated read paths plus hand-rolled runtime validators. That setup mirrored the pre-rework state of the domain catalog and carried the same drift risks: an effect-field typo would compile cleanly today and silently no-op forever, because `effect: SynergyEffect` was opaqued by the JSON import boundary.

This branch moves both files to a single typed module:

- **New source of truth**: `src/content/synergies/index.ts`. Exposes `PAIR_SYNERGIES`, `EMERGENT_RULES`, plus `getAllPairSynergies`, `getAllEmergentRules`, `getPairSynergyById`, `getEmergentRuleById`. The effect fields are now checked at compile time against the discriminated `SynergyEffect` / `EmergentEffect` unions in `src/systems/synergyTypes.ts`.
- **Deleted JSON files**: `src/content/base/pair-synergies.json` and `src/content/base/emergent-rules.json`.
- **Deleted runtime validator**: `web/src/data/jsonValidators.ts` (now structurally impossible to fail — TS guarantees the shape).
- **Backend consumers migrated** (4 files): `synergyRuntime.ts`, `knowledgeSystem.ts`, `aiResearchScoring.ts`, `strategic-ai/learnLoopCoordinator.ts`.
- **Frontend consumers migrated** (9 files): `KnowledgeGainedModal.tsx`, `SynergyUnlockedModal.tsx`, `SynergyEncyclopediaTab.tsx`, `EnemySynergyContactModal.tsx`, `FieldReportsPanel.tsx`, `SynergyChip.tsx`, `resolveActiveSynergies.ts`, `inspectors/UnitInspectorSection.tsx`, `app/GameShell.tsx`, plus `data/help-content.ts` and `game/controller/GameSession.ts`.
- **Shared frontend lookup**: `web/src/data/synergyLookup.ts` — one in-memory projection of the backend catalog into the UI's slim `PairSynergyData` / `EmergentRuleData` shapes, used by every UI consumer. Avoids re-projecting the data per component.
- **Obsolete CI script removed**: `scripts/checkSynergyCoverage.mjs` (its job was preventing drift between dual JSON copies — drift is now structurally impossible).
- **Art-prompt generator ported to TS**: `scripts/generateSynergyArtPrompts.mjs` → `.ts` (the previous version had been broken since the domain migration deleted `ability-domains.json` and `research.json`).

**Bug surfaced and fixed by the migration**: `tidal_warfare+river_stealth` (Silent Landing) declared `firstAttackAfterLandingDamageBonus: 0.5` and `transportedTroopsStealth: true` on the `stealth_aura` effect variant. Those fields were not in the union — they have never been read by any consumer. They are documented design intent that was silently dead. The migration added them to the `stealth_aura` variant as optional (matching the pattern the rework notes use for unwired `// design` flags) so they remain visible as design backlog instead of getting lost.

All 884 tests pass after the migration. The audit below assumes any new effect fields land in `src/content/synergies/index.ts` and any new effect-field shapes extend `SynergyEffect` / `EmergentEffect` in `synergyTypes.ts`.

---

## Methodology

Each synergy was assessed against three questions:

1. **Tier overlap.** Does the synergy duplicate an effect now provided by a T2 or T3 node of one of its constituent domains? (After the rework, T2/T3 actually carry weight — a synergy that "gives armor pen" matters less when Heavy T3 native already gives 100% armor pen.)
2. **Tier reach.** Does the synergy *reference* any of the new T1–T3 verbs (Bastions, Saplings, Maelstroms, Toxic Blooms, Submerge, Oasis, bloodtrail wounds, spore-jump, mycelium, Last Stand, Captive Champion counter, etc.)? Synergies that ignore all of them are "flat layers parallel to the tech tree," not emergent combinations.
3. **Identity fit.** Does the mechanic feel like the two domains discovered something together that neither could do alone? (The strong synergies do; the weak ones feel like generic stat bumps.)

Findings are bucketed into six categories:

- **A. Redundancy** — synergy effect is duplicated or strictly subsumed by a new T2/T3 effect.
- **B. Naming collision** — synergy name re-uses a word the rework now uses for a different native verb.
- **C. Data drift surfaced by migration** — fields whose names suggest a behavior but which no consumer reads.
- **D. Plug-in opportunity** — synergy works fine today but could anchor to a new T1–T3 verb instead of a flat numeric bump.
- **E. Self-pair needing escalation** — same-domain pair that is now ≤ the T2 of its own domain.
- **F. Triple-stack drift** — emergent rule overlaps with or duplicates a new native T3.

A synergy with no entry in any category is in good shape and need not be touched.

---

## Headline findings (priority order)

The five highest-value reworks, ranked by gameplay impact:

1. **Rename `nature_healing+camel_adaptation` away from "Oasis"** *(category B)*. Camel T3 native is **literally called Oasis declaration** and is the headline Oasis verb in the game. The synergy of the same name is now a confusing pseudo-Oasis. Rename + re-anchor (proposal: "Living Oasis — hex you occupy is treated as a declared Oasis for purposes of Oasis-aware effects, including future ones; this is the cheap synergy version of the once-per-game declaration").
2. **Escalate the three self-pairs that the new T2/T3 made obsolete** *(category E)*: `venom+venom`, `charge+charge`, `fortress+heavy_hitter` (the last is cross-pair but is the cleanest example of duplicated reflection). All three currently provide effects that are weaker than what one of the constituent domain's own T2/T3 nodes provides.
3. **Wire the bloodtrail/momentum hook into every `hitrun+*` synergy** *(category D)*. The rework introduced `woundsReceivedThisTurn` and `bloodtrailMomentumEnabled`. None of the seven `hitrun` cross-pairs read it. Easy plug-in: bloodtrail wounds scale or refund the synergy effect.
4. **Wire Bastions/Saplings/Maelstroms/Blooms into the relevant fortress and tidal synergies** *(category D)*. The new state lives in `state.zoneEffects`, `state.factions[].bastionsBuilt`, terrain mutations — all queryable. Several synergies could project effects through these new structures instead of through "any unit with tag X."
5. **Audit the `juggernaut` emergent rule's per-domain signatures** *(category F)*. Charge's signature is `damageBehindPercent` but Charge T3 native is now `splash + chain amplification`; tidal's is `bonusDamageAdjacentToWater` but Tidal T3 native is Maelstrom — neither signature reflects the new identity verbs.

---

## A. Redundancy with new T2/T3

These synergies are now weaker than or duplicate the new tier mechanics of one of their constituent domains. Suggested action: either rework to provide a strictly different mechanic, or escalate beyond the T3 ceiling so the synergy is meaningfully more than learning T3 of the underlying domain.

| Synergy | Overlap | Proposed direction |
| --- | --- | --- |
| `venom+venom` (Concentrated Venom) | 1 stack on adjacent on death is **strictly weaker** than Venom T2 spore-jump (foreign: nearest within 2; native: ALL within 2, full stack) and Venom T3 Toxic Bloom. | Escalate: on poisoned-enemy death **inside a Toxic Bloom**, double bloom radius for 1 turn AND drop a fresh +1 bloom centered on the death. Makes self-pair the "force-multiplier on Blooms" rather than a tiny radius-1 spread. |
| `charge+charge` (Stampede Horde) | `formation_pinball` on knockback duplicates Charge T2 native Stampede (Lions stampede routed targets, collision damage) and overlaps Charge T3 native splash. | Escalate: when two `charge` units charge **the same target on the same turn**, the second charge inherits the first charger's run-up bonus AND the chain bonus extends through both lines. Currently the synergy gives `+4` flat collision; new mechanic should compound the Charge T3 chain. |
| `fortress+heavy_hitter` (Immovable Object) | 25→50% damage reflection duplicates Heavy Hitter T2 native (50% reflection + stagger via `nextTurnMovePenalty`). | Reframe as **range-extended reflection**: an adjacent fortress-tagged ally inherits the heavy unit's reflection percentage. Or change reflection to a different vector (e.g. reflect to a randomly chosen *third* enemy, exploiting positioning). |
| `venom+heavy_hitter` (Venomous Smash) | Base 50% armor pen against poisoned targets duplicates the foreign Heavy T3 effect (`armorPenetrationEnabled` → 50% pen, now wired). Stack-scaling to 100% duplicates the native T3 (`heavyTranscendenceEnabled` → 100% pen). | Shift the synergy off armor-pen entirely: each heavy strike against a poisoned target adds +1 poison stack (instead of bonus armor pen) AND a 5-stack target is stunned for 1 turn. Synergy now generates the poison rather than depending on it. |
| `river_stealth+heavy_hitter` (Assassin's Blow) | 100% permanent armor shred duplicates Heavy T3 native (Arctic Wardens' 100% armor pen) at the per-hit level. | Reframe the permanence: instead of shredding, a stealth-heavy strike marks the target with `armorBroken` for the rest of the *game* — any subsequent ally attacking the marked target sees no armor. Becomes a team-amplifier rather than a stronger solo armor-pen. |
| `tidal_warfare+slaving` (Naval Slave Raid) | `navalCaptureRadius: 2` (1-hex from water + delivery double) overlaps the new Slaving T3 (any-tier `navalCaptureRadius`, currently 2). | Lean into the **delivery double-count** field (the unique part) and the **instant-embark** field; drop the duplicate capture-range and replace with a hook into Captive Champion: naval slave captures count as **2** captures toward the every-5th Captive Champion trigger. |
| `slave_empire` (emergent, triple) | "Fortress zones auto-capture wounded enemies below 25% HP" overlaps with new Slaving T3 `slaveHpFraction: 0.5` and the existing capture auto-trigger. | Make the auto-capture aura **stack with the Bastion** so that a Bastion belonging to a Slave Empire faction extends its capture aura to its full 3-hex defensive radius (and counts each auto-capture toward Captive Champion). Slave Empire becomes "your Bastions are slaver outposts." |

---

## B. Naming collisions with new T1–T3 verbs

Two synergy names now collide with new verbs in the catalog. Both should be renamed — the rework has the stronger claim on the verb since it's the player-facing identity for that domain.

| Synergy | Collides with | Suggested new name |
| --- | --- | --- |
| `nature_healing+camel_adaptation` (Oasis) | **Camel T3 native: Oasis declaration** (`declareOasis` — terrain mutation, once per game). The synergy's `oasis` effect type and the system module `oasisSystem.ts` both predate the rework but the player-facing verb "Oasis" is now the declaration. | "Living Spring" / "Watering Hole" / "Wellspring." Rework so the synergy effect *enhances* declared Oases (e.g. a declared Oasis gains the +full-HP-on-turn-end aura the synergy describes), tying the two concepts together without name confusion. |
| `nature_healing+fortress` (Citadel) | New Fortress T3 native: **Bastion placement** (`buildBastionAtUnit` — strategic placement, capped 3/game). "Citadel" and "Bastion" are perilously close as concepts and the synergy claims a "counts as city" mechanic which is a third structural-placement concept layered on top of two existing ones. | Either rename to "Grove-Keep" / "Verdant Hold" and reposition as a non-Bastion effect (the +1 resource + heal aura, no city tag), OR fold the mechanic into "a Bastion built by a Citadel-capable faction also generates 1 resource + heals 3/turn within 2 hexes." The latter is the better play — it removes the structural overlap. |

Worth flagging though not naming-collision per se: the `fortress+camel_adaptation` synergy is "Desert Stronghold" with toggle fields named `fortUpDefenseBonus`/`fortUpAlliedDefenseBonus`/`decampFreeAction`. The rework deleted the old field-fort system (`fieldFort.ts`, `field_fort` improvement) in favor of Bastions. "Fort Up" is now an orphan concept. Rename the field semantics to "Encamp" to avoid confusion with the deprecated field-fort verb.

---

## C. Data drift surfaced by the migration

These are dead fields or effect-type/field mismatches that the JSON import previously masked. Each was caught by the TS catalog migration. They are not the same as the redundancy issues above — they are silent bugs.

| Synergy | Field(s) | Problem | Suggested fix |
| --- | --- | --- | --- |
| `tidal_warfare+river_stealth` (Silent Landing) | `firstAttackAfterLandingDamageBonus`, `transportedTroopsStealth` | Fields exist in data but were not in the `stealth_aura` union — no consumer reads them. Documented design intent, never wired. Fixed in this migration by extending the union (as `?: optional`) so the design intent is visible to future implementers without claiming the behavior. | Wire: `apply.ts` should detect amphibious landings (water→land disembark via `TransportMap` adjacency) and apply the +50% damage; `transportSystem.ts` should propagate `isStealthed: true` to embarked units in the synergy's case. Both are non-trivial but the design hooks are ready. |
| `charge+slaving` (Press-Ganged Cavalry) | `capture_charge` with **only** `knockbackDistance: 2` | The description says "Charge attacks have 30% chance to capture enemy units" but there is no `captureChance` field — the only field is knockback distance. The captureChance is hardcoded somewhere or simply doesn't run. | Add `captureChance: number` to the `capture_charge` variant and the data entry. Verify the consumer in `apply.ts` actually reads it. |
| `tidal_warfare+slaving` | `navalCaptureRadius: 2` is also a doctrine flag on Slaving T3 (`navalCaptureRadius`) | Two paths set the same effect — once via Slaving T3 doctrine (any tier with `navalCaptureRadius`), once via this pair-synergy. Could compound unexpectedly. | After the rework above (Section A: lean into delivery-double-count and Captive Champion), the synergy stops setting `navalCaptureRadius` and only the T3 path sets it. |
| `juggernaut` emergent rule | `domainSignatures.charge.damageBehindPercent` | This was an emergent signature for charge units. Charge T3 native is now splash + chain amplification — `damageBehindPercent` doesn't reflect the current charge identity. | Replace with a signature that fires the splash effect at half strength when the unit is in juggernaut mode, OR with a chain-extension bonus. |
| `juggernaut` emergent rule | `domainSignatures.tidal_warfare.bonusDamageAdjacentToWater` | Tidal T3 native is now Maelstrom (`canDeclareMaelstrom`, etc.), not coast-adjacent damage. | Replace with: tidal juggernaut can declare a half-size Maelstrom (1 hex / 1 turn / 1 damage) at no per-game cost. Differentiates from full Tidal T3 native Maelstrom. |
| `juggernaut` emergent rule | `domainSignatures` missing `river_stealth`, `nature_healing`, `camel_adaptation` | Rule applies when 3 domains from `combatDomains` are learned. Defining signatures only for some leaves nothing happening for legal-but-unlisted combos (e.g. venom+fortress+heavy_hitter is fully signed; but adding camel makes the rule fire while still using a 3-of-7 subset). | Add the missing three signatures so every combat domain has a per-juggernaut effect. |

---

## D. Plug-in opportunities

These synergies work today but ignore the new T1–T3 state that would make them feel like coherent extensions of the tech tree. Each one represents a small, well-scoped wiring pass.

### Bloodtrail momentum (Hitrun T2)

`woundsReceivedThisTurn` on Unit is incremented in `apply.ts` and consumed in `factionTurnEffects.ts`. Seven `hitrun` synergies could read it:

- **`hitrun+nature_healing` (Healing Retreat)**: vampiric strike heals 100% of damage *or* 100% + 5 × wounds — bloody retreats heal more.
- **`hitrun+river_stealth` (Shadow Step)**: re-enter stealth at retreat hex *and* drop a wound-marker that bleeds pursuers by `woundsReceivedThisTurn`.
- **`hitrun+camel_adaptation` (Desert Ghost)**: retreat-through-impassable always available; with bloodtrail wounds ≥ 2, retreat through any terrain (not just impassable).
- **`hitrun+slaving` (Raid Retreat)**: capture chance scales with wounds (15% base + 5% per wound this turn).
- **`hitrun+heavy_hitter` (Heavy Skirmish)**: free opportunity strike damage multiplier scales (1.0× → 1.0× + 0.25×wounds).
- **`hitrun+hitrun` (Swarm Tactics)**: bloodtrail wounds count as +1 attacker for the per-attacker bonus stacking (a single wounded unit acts as two for the formation_focus calculation).
- **`charge+hitrun` (Endless Charge)**: the second charge requires bloodtrail wounds ≥ 1 instead of "enough movement points" — turns the synergy into an actual combo (be wounded, then double-charge).

This single hook (bloodtrail) gives every `hitrun` cross-pair a tier reference instead of a flat numeric multiplier.

### Bastions (Fortress T3 native)

`state.factions[].bastionsBuilt` + the Bastion structure on the map gives 3 concrete query points:

- **`fortress+charge` (Fortress Charge)**: +50% charge damage when adjacent to a Bastion (currently: adjacent to any fortress-tagged unit). Makes the bonus geographically meaningful.
- **`fortress+river_stealth` (Hidden Fortress)**: a Bastion built by a faction with this synergy is **hidden** (treated as stealth terrain) until an enemy is within 2 hexes.
- **`fortress+slaving` (Chained Prisoners)**: slaves captured within a Bastion's defensive aura count 2× toward Captive Champion.
- **`fortress+nature_healing` (Citadel)**: see Section B — fold the synergy effect into Bastions to remove the structural overlap.

### Saplings (Nature T3 native)

`saplingOnKillEnabled` + the resulting terrain mutation to `forest`:

- **`charge+nature_healing` (Charging Growth)**: charging *onto* a sapling tile grants +1 movement (currently kills restore +1 — the sapling becomes a movement-replenishing terrain).
- **`hitrun+nature_healing` (Healing Retreat)**: kill via retreat creates a sapling AND heals 100% (currently just heals).
- **`nature_healing+nature_healing` (Life Bloom)**: pulse interval shrinks by 1 turn for each sapling within the 3-hex aura (max: every turn).

### Maelstrom / zone effects (Tidal T3 + generic infrastructure)

`state.zoneEffects: Map<ZoneEffectId, ZoneEffect>` is queryable by hex range:

- **`venom+tidal_warfare` (Venomous Tide)**: while a Maelstrom is active, naval poison stacks contributed by this faction also stack onto every enemy inside the Maelstrom each turn.
- **`charge+tidal_warfare` (Tsunami Charge)**: ramming an enemy into a Maelstrom hex triggers the Maelstrom's `damagePerTurn` immediately, on top of the ram damage.
- **`tidal_warfare+tidal_warfare` (Armada)**: chain-bonus also extends the active Maelstrom's radius by +1 per chained ship for the turn the chain fires.

### Toxic Blooms (Venom T3)

`state.zoneEffects` of type `toxic_bloom` already query by hex:

- **`venom+fortress` (Toxic Bulwark)**: a Bloom centered on or adjacent to a fortress-tagged unit gains the "poisoned-can-not-attack-source" effect on every unit inside it (turning Blooms into denial zones, not just damage zones).
- **`venom+venom` (Concentrated Venom)**: see Section A — escalate to Bloom-amplification.

### Oasis declarations (Camel T3 native)

`oasisSystem.declareOasis` mutates terrain in radius 2. The declared center is on the map permanently:

- **`venom+camel_adaptation` (Desert Viper)**: if the unit is on a hex created by an Oasis declaration, its passive poison damage is +1.
- **`charge+camel_adaptation` (Sandstorm Charge)**: charges originating from an Oasis-converted hex get +1 to `sandstormPersistTurns`.
- **`nature_healing+camel_adaptation` (Living Spring, renamed)**: see Section B — the synergy *is* the Oasis hookup.

### Captive Champion counter (Slaving T3 native)

`faction.slaveCaptureCount` increments every capture; every 5th with native T3 spawns a free unit. Plug-ins to amplify the cycle:

- **`venom+slaving` (Envenomed Captors)**: envenomed captures count 2× toward Champion (10 normal captures or 5 envenomed get you the freebie).
- **`river_stealth+slaving` (Ambush Captors)**: silent captures count 2× toward Champion. (Pairs nicely with stealth's information-asymmetry identity.)
- **`charge+slaving` (Press-Ganged Cavalry)**: captures via charge count 2× toward Champion.
- **`hitrun+slaving` (Raid Retreat)**: every successful retreat-with-captive grants +1 to the counter even if no capture happened that turn (you "trained" the captor; abstract).

### Last Stand (Heavy T3 native)

`lastStandUsedThisTurn` tracks the once-per-turn 1-HP survival. Nothing currently amplifies it:

- **`nature_healing+heavy_hitter` (Berserker Regen)**: surviving a lethal hit via Last Stand heals 50% of max HP (currently triggers on kill — extend to also trigger on Last Stand survival).
- **`fortress+heavy_hitter` (Immovable Object)**: see Section A — the synergy reflects damage *and* allows Last Stand to trigger twice per turn for the heavy unit.

### Submerge (River T3 native)

`canSubmerge` / `executeSubmerge` lets a unit teleport along waterways. Plug-ins:

- **`venom+river_stealth` (Death from the Shadows)**: a Submerge that ends adjacent to an enemy *and* breaks stealth on emerge still applies the lethal_ambush poison stacks (so Submerge becomes an ambush delivery mechanism, not just a repositioning tool).

---

## E. Self-pair escalation

Self-pairs (same-domain pair) should be qualitatively beyond what T2/T3 of that single domain already provides; otherwise the second copy of the domain "discovers" nothing. The current state:

| Self-pair | Today | Compared to T2/T3 | Verdict |
| --- | --- | --- | --- |
| `venom+venom` | toxic_spread 1 stack adjacent | Weaker than T2 spore-jump (radius 2, full stack on kill) and far weaker than T3 Toxic Bloom | **Rework**: see Section A — escalate to Bloom-multiplier. |
| `fortress+fortress` | formation_wall (two adjacent fortresses block movement, halve ranged) | Distinct from T1 shieldwall, T2 spike lines, T3 Bastion | **Keep**. Plug-in: two **Bastions** within 4 hexes project the formation_wall along the line between them. |
| `charge+charge` | formation_pinball collision +4, stun 1 | Overlaps T2 native Stampede + T3 native splash | **Rework**: see Section A — compound the Charge T3 chain bonus across two chargers attacking the same target. |
| `hitrun+hitrun` | formation_focus +30% per stacking attacker, ignores defense | Distinct from T1 ignore-ZoC-on-approach, T2 bloodtrail, T3 killing chain | **Keep**. Plug-in: each attacker that has bloodtrail wounds this turn counts as 2 for the stacking. |
| `tidal_warfare+tidal_warfare` | formation_chain +1 per chained ship, cap +4 | Distinct from T2 boarding, T3 Maelstrom | **Keep**. Plug-in: chain bonus also extends Maelstrom radius. |
| `nature_healing+nature_healing` | bloom_pulse big aura + pulse | Distinct from T2 wounded earth, T3 worldroot share / Sapling | **Keep**. Plug-in: pulse interval shrinks with adjacent Saplings. |
| `river_stealth+river_stealth` | position_swap 3-hex, kill-doesn't-reveal | Distinct from T2 predator stance, T3 drowning wake / Submerge | **Keep**. Plug-in: swap can be done **through** an Oasis or a Sapling hex regardless of range cap (treats those as nodes in the network). |
| `camel_adaptation+camel_adaptation` | caravan_relay vision-share 3, relay march | Distinct from T1 sand-wise, T2 mirage, T3 caravan transport / Oasis | **Keep**. Plug-in: vision-shared hexes count as Oasis-adjacent for movement cost purposes if the network includes a unit on an Oasis. |
| `slaving+slaving` | slave_horde +50% dmg, -30% def, group-3 ignores ZoC, rage on adjacent slave death | Distinct from press-gang T1, slave-markets T2, auto-capture T3 / Captive Champion native | **Keep**. Plug-in: rage on adjacent slave death also increments Captive Champion counter by 1 (the surviving slaves "earned" a champion). |
| `heavy_hitter+heavy_hitter` | formation_pinball (same effect type as charge+charge) collision +4, stun 1 | Distinct from T1 elevation, T2 backbreaker, T3 armor pen / Last Stand | **Keep**. Plug-in: collision damage scales with stagger duration on the victim (heavier stagger → bigger pinball). |

Two of the ten self-pairs (`venom+venom`, `charge+charge`) need rework; the other eight are well-positioned and just need a single bloodtrail-or-new-state plug-in to feel current.

---

## F. Triple-stack (emergent rules) audit

The 11 emergent rules were largely written before the rework. Findings per rule:

### `terrain_lord` — keep, plug in
- Effect: charges ignore terrain penalties; +50% damage and 2× range in native terrain; +3 terraform charges.
- The `terraformCharges: 3` field overlaps the new Camel T3 Oasis declaration (1/game terrain conversion) and Nature T3 Sapling creation (kill → forest). All three mutate `state.map.tiles`.
- **Plug-in**: the 3 terraform charges should route through `setTerrainAt` / `setTerrainInRadius` from `terrainMutationSystem.ts` (the rework's new utility). Reuse existing infra rather than implementing a parallel mutator.

### `paladin` — keep
- Effect: 50% lifesteal + min 1 HP + +100% smite at full HP. Clean, distinct.
- **No issues.**

### `terrain_assassin` — keep
- Effect: permanent stealth in desert/coast/hill. Stays distinct from River T3 Submerge (Submerge is a teleport, not a stealth state).
- **Plug-in opportunity**: triple resolves to permanent stealth in matching terrain; while a triple-stack unit is in *its* matching terrain, allies within 1 hex gain temporary stealth (extends the `nature_healing+river_stealth` veil mechanic to the emergent layer).

### `standing_stone` — keep
- Effect: toggle anchored/marching; large aura + tar-pit movement debuff. Distinct from Fortress T3 Bastion.
- **Plug-in**: an anchored Standing Stone unit can be **converted** into a Bastion if the owning faction has Fortress T3 native (Hill Engineers). One-way conversion: trades the toggle for the permanent +3 capacity. The standing stone *becomes* one of the 3 Bastions you can place.

### `ghost_army` — keep, plug in
- Effect: phase 4 hexes through anything, kill-chain redeploy 99-range, +2 ally movement on phase.
- **Plug-in**: phase distance scales with bloodtrail wounds on the phasing unit (4 + woundsReceivedThisTurn, cap 8). Marries the emergent identity to the hitrun-tier momentum verb.

### `juggernaut` — rework signatures, see Section C
- The per-domain signatures are stale for charge and tidal_warfare and missing entirely for camel/river/nature. After fix:
  - `venom`: poison-per-hit (keep)
  - `fortress`: damage reflection 30% (keep)
  - `charge`: replace `damageBehindPercent` with chain-extension (+1 max chain bonus when in juggernaut mode)
  - `hitrun`: free reposition after kill (keep)
  - `heavy_hitter`: armor pierce 50% (keep)
  - `slaving`: capture below 25% HP (keep)
  - `tidal_warfare`: replace `bonusDamageAdjacentToWater` with declare-small-Maelstrom (1/1/1)
  - `camel_adaptation` (NEW): +1 movement on rough terrain
  - `river_stealth` (NEW): undying-trigger also restealth
  - `nature_healing` (NEW): undying-trigger also heals 25% max HP

### `slave_empire` — see Section A
- Auto-capture below 25% HP in fortress zone overlaps Slaving T3. Rework to project through Bastions.

### `raid_camp` — keep
- Effect: place a Raid Camp within 5 hexes once per turn. The mechanic is itself a placement verb, which now sits alongside Bastion / Oasis / Sapling. Raid Camps are temporary (2 turns) and small-radius (3), so they don't collide.
- **Plug-in**: a Raid Camp placed on a declared Oasis lasts double duration (4 turns instead of 2) — rewards the camel-adaptation half of the triple.

### `poison_shadow` — keep
- Effect: 3 poison stacks from stealth + retreat poison cloud + no heal in cloud. Distinct from Venom T3 Toxic Bloom.
- **Plug-in**: retreat poison cloud counts as a Toxic Bloom for purposes of mycelium-network detonate (so a poison_shadow retreat can trigger a Bloom detonate cascade for venom-native factions).

### `iron_turtle` — keep
- Effect: 2-hex crushing zone, 50% reflection, no displace, ignore ZoC. Builds well on Heavy T2 reflection.
- **No issues.**

### `many_faced` — keep
- Default fallback for any-3-domain. Stance cycling is non-overlapping with any tier verb.
- **No issues.**

---

## Per-synergy summary (all 55 pairs)

The table below is the full audit. Entries with no category and no plug-in note are well-positioned and need no work.

| Synergy | Categories | Notes |
| --- | --- | --- |
| `venom+fortress` | D | Plug-in: poison-aura concentrates on Bastions / spike-line hexes. |
| `venom+charge` | D | Plug-in: poison stacks splash via Charge T3 native splash. |
| `venom+hitrun` | D | Plug-in: poison trap damage scales with bloodtrail wounds. |
| `venom+tidal_warfare` | D | Plug-in: while Maelstrom active, naval poison stacks every enemy inside it. |
| `venom+nature_healing` | D | Plug-in: poisoned-enemy kill spawns a corrupted Sapling (poison terrain instead of forest). |
| `venom+river_stealth` | D | Plug-in: Submerge emerges with double lethal-ambush stacks. |
| `venom+camel_adaptation` | D | Plug-in: passive poison +1 on Oasis-converted hexes. |
| `venom+slaving` | D | Plug-in: envenomed captures count 2× toward Captive Champion. |
| `venom+heavy_hitter` | A | Rework: pivot from armor-pen (now duplicate of Heavy T3) to poison-stack generation per hit. |
| `venom+venom` | A, E | Rework: escalate to Bloom-multiplier on poisoned death inside a Bloom. |
| `fortress+charge` | D | Plug-in: +50% bonus when charging from adjacent to a Bastion. |
| `fortress+hitrun` | D | Plug-in: dug-in bonus enables shieldwall T1 even without adjacent allies. |
| `fortress+tidal_warfare` | D | Plug-in: a coastal Bastion projects bombardment without a naval unit present. |
| `fortress+nature_healing` | B | Rename + fold into Bastion (see Section B). |
| `fortress+river_stealth` | D | Plug-in: Bastion is treated as stealth terrain when faction has this synergy. |
| `fortress+camel_adaptation` | D | Rename "Fort Up" field semantics → "Encamp" (Fort Up refers to retired system). Plug-in: encamped unit emits desert +1 movement to camel allies. |
| `fortress+slaving` | D | Plug-in: captures in a Bastion aura count 2× toward Captive Champion. |
| `fortress+heavy_hitter` | A | Rework: range-extend reflection (adjacent ally inherits %) rather than duplicate Heavy T2 native. |
| `fortress+fortress` | D, E | Plug-in: 2 Bastions within 4 hexes project formation_wall along the line. |
| `charge+hitrun` | D | Plug-in: second charge requires bloodtrail wound ≥ 1 (turns synergy into an actual combo). |
| `charge+tidal_warfare` | D | Plug-in: ramming an enemy into a Maelstrom triggers Maelstrom damage on the ram. |
| `charge+nature_healing` | D | Plug-in: charging onto a Sapling tile grants +1 movement. |
| `charge+river_stealth` | — | Strong as-is. |
| `charge+camel_adaptation` | D | Plug-in: charge from Oasis-converted hex grants +1 sandstorm duration. |
| `charge+slaving` | C, D | Fix `capture_charge` data shape (add `captureChance` field). Plug-in: captures count 2× toward Captive Champion. |
| `charge+heavy_hitter` | — | Strong as-is. Run-up damage already plays well with T1 elevation bonus. |
| `charge+charge` | A, E | Rework: compound Charge T3 chain across two chargers attacking the same target. |
| `hitrun+tidal_warfare` | — | Strong as-is. |
| `hitrun+nature_healing` | D | Plug-in: retreat-kill spawns a Sapling (already heals, now also terraforms). |
| `hitrun+river_stealth` | D | Plug-in: retreat hex drops a bleed-marker scaled by bloodtrail wounds. |
| `hitrun+camel_adaptation` | D | Plug-in: bloodtrail ≥ 2 allows retreat through any terrain (not just impassable). |
| `hitrun+slaving` | D | Plug-in: capture chance scales with bloodtrail wounds (15% + 5%/wound). |
| `hitrun+heavy_hitter` | D | Plug-in: opportunity-strike multiplier scales with bloodtrail wounds. |
| `hitrun+hitrun` | D, E | Plug-in: wounded attackers count as 2 in the per-attacker stacking. |
| `tidal_warfare+nature_healing` | — | Strong as-is — natural counter to venom strategies. |
| `tidal_warfare+river_stealth` | C | Wire the dead fields (`firstAttackAfterLandingDamageBonus`, `transportedTroopsStealth`) in `apply.ts` and `transportSystem.ts`. |
| `tidal_warfare+camel_adaptation` | — | Strong as-is. |
| `tidal_warfare+slaving` | A, C | Drop duplicate `navalCaptureRadius`; lean into delivery-double and Captive Champion 2× hook. |
| `tidal_warfare+heavy_hitter` | — | Strong as-is. |
| `tidal_warfare+tidal_warfare` | D, E | Plug-in: chain bonus extends Maelstrom radius by +1 per chained ship for that turn. |
| `nature_healing+river_stealth` | — | Strong as-is. |
| `nature_healing+camel_adaptation` | B | Rename "Oasis" → "Living Spring" and rework to enhance declared Oases (the once-per-game Camel T3 verb). |
| `nature_healing+slaving` | — | Strong as-is. |
| `nature_healing+heavy_hitter` | D | Plug-in: Last Stand survival also triggers the +50% max HP heal (currently only on kill). |
| `nature_healing+nature_healing` | D, E | Plug-in: pulse interval shrinks by 1 per adjacent Sapling. |
| `river_stealth+camel_adaptation` | — | Strong as-is — Mirage is one of the best-defined synergies. |
| `river_stealth+slaving` | D | Plug-in: silent captures count 2× toward Captive Champion. |
| `river_stealth+heavy_hitter` | A | Rework: shift "permanent 100% armor shred" to a global mark (`armorBroken`) so any ally inherits the bypass — team amplifier instead of solo duplicate of Heavy T3. |
| `river_stealth+river_stealth` | D, E | Plug-in: swap network includes Oasis / Sapling hexes as additional nodes. |
| `camel_adaptation+slaving` | — | Strong as-is. |
| `camel_adaptation+heavy_hitter` | — | Strong as-is. |
| `camel_adaptation+camel_adaptation` | D, E | Plug-in: vision-shared hexes count as Oasis-adjacent for movement costs if any network member is on an Oasis. |
| `slaving+slaving` | D, E | Plug-in: rage-on-slave-death increments Captive Champion counter by 1. |
| `slaving+heavy_hitter` | — | Strong as-is. |
| `heavy_hitter+heavy_hitter` | D, E | Plug-in: collision damage scales with stagger duration (Heavy T2 effect). |

Distribution: **9** rework targets (A/B/C, primary surgical), **34** plug-in targets (D, easy wiring passes), **8** self-pair plug-ins (E, all but two stay in shape with one wire), **0** synergies that should be deleted outright.

---

## Recommended implementation order

If approaching this as a sequence of small PRs (one focused mechanic per PR, mirroring the Phase-2 wiring style of the tech-tree rework):

1. **Naming-collision rename pass** (1 PR). Lowest risk, highest player-clarity payoff. Rename `Oasis` synergy → `Living Spring`; rename/reposition `Citadel` synergy; rename Desert Stronghold's `fortUp*` fields → `encamp*`. No mechanical change.
2. **Surface and fix data drift** (1 PR). Add `captureChance` field to `capture_charge`. Wire Silent Landing's two dead fields. Update juggernaut's stale charge/tidal signatures and add missing signatures for camel/river/nature.
3. **Self-pair rework** (1 PR per pair, 3 PRs). `venom+venom`, `charge+charge`, and the cross-pair `fortress+heavy_hitter` (which is the same category of "duplicated by new T2/T3" but cross-domain).
4. **Bloodtrail plug-in sweep** (1 PR). One commit, seven cross-pair synergies updated to read `woundsReceivedThisTurn`. Mechanically cheap; identity-rich.
5. **Bastion plug-in sweep** (1 PR). Four synergies updated to project through Bastions.
6. **Maelstrom / Toxic Bloom / Sapling plug-in sweep** (1 PR each). Each plugs into the zone-effect or terrain-mutation infrastructure shipped by the rework.
7. **Captive Champion 2× hook** (1 PR). Five synergies update to increment `slaveCaptureCount` by 2 instead of 1.
8. **Emergent rule plug-ins** (1 PR). Standing Stone → Bastion conversion, Ghost Army scales with bloodtrail, Raid Camp interacts with Oasis, Poison Shadow cloud counts as a Bloom, Terrain Lord routes through `terrainMutationSystem`.

Most steps are small enough that a single commit covers them. The naming-collision pass and the data-drift fixes should land first because they have the smallest blast radius and remove confusing edges for player communication and for the audit doc's own credibility.
