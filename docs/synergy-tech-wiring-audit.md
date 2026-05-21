# Synergy & T1–T3 Tech Wiring Audit

**Date:** 2026-05-21
**Scope:** Verify that non-basic combat effects — domain tier abilities (T1→T3) and
the double (pair) / triple (emergent) synergy systems — are actually wired to fire
at runtime, not just defined in content.

**Motivation:** A prior bug where an ability meant to trigger "every 3 turns" did not
fire (it required a dedicated periodic system to be built). This pass looks for the
same class of failure: effects that are *declared/dispatched* but *consumed by
nothing*.

---

## Verdict

The wiring **infrastructure** is sound: research nodes resolve to doctrine flags
(`capabilityDoctrine.ts`), and combat/turn systems consume them; the "every-N-turns"
pattern that bit before (Life Bloom) is now correctly implemented via a dedicated
per-turn system. **However**, a substantial number of catalogued tier abilities —
especially native-tribe enhancements — and a handful of pair-synergy fields are
**defined in content but have no runtime consumer**. They are enumerated in the single
master list below, which is intended to be the *exclusive* inventory of unimplemented /
unwired items from this pass.

Counts: **20 unimplemented/unwired items** (15 tech tier abilities or native
enhancements + 5 synergy items). One additional class — `projectAura` per-turn heal —
is partially wired.

---

## How wiring works (architecture as-built)

A primitive/effect must land in one of **two** consumption paths or it is dead:

1. **Combat-time path** — `applyCombatSynergies()` (`synergyEffects.ts`) →
   `primitiveDispatcher.ts` → mutates a `SynergyCombatResult` → read in
   `combat-action/*` via `result.getStat()` / `result.hasFlag()`.
2. **Per-turn / aura / movement / fog path** — dedicated systems re-parse the raw
   `synergy.effects[]` array themselves (`unitRefresh.ts`, `movementSystem.ts`,
   `fogSystem.ts`, `zocSystem.ts`, `activateUnit.ts`, `combat-action/helpers.ts`).

For the tech tree, the path is: research node → doctrine flag in
`resolveResearchDoctrine()` → consumer system reads `doctrine.<flag>`.

**There is no trigger/target system.** `PrimitiveBase` carries only an optional
`condition`; the dispatcher reads neither a trigger nor a target. Anything periodic
must be hand-built (see Life Bloom: `unitRefresh.ts:274` bursts on
`roundsSinceCreation % 3 === 0`). Note that `codemap.md` describes
`TriggerSpec`/`TargetSpec`/`triggerMatches()`/`resolveTarget()` — **these do not exist**
and the codemap should be corrected.

**Stale `// design` labels (excluded — actually wired):** the following are labeled
`// design` in `content/domains/index.ts` but are in fact wired and therefore are *not*
in the master list: `woundedEarthEnabled` (resolveDamage.ts:185), `submergeEnabled`
(submergeSystem.ts), `maelstromRadius`/`maelstromDuration` (maelstromSystem.ts),
`oasisOncePerGame` (via `canDeclareOasis` → oasisSystem.ts), `pirateMaelstromAutoCapture`
(via `maelstromAutoCaptureEnabled`), `nativeArmorPenetration` (via
`heavyTranscendenceEnabled`, preview.ts:448), and the core `bloodtrail` effect (via
`bloodtrailMomentumEnabled`).

---

## Master list — all unimplemented / unwired items (exclusive)

Status legend:
- **Unimplemented** — feature has no runtime consumer; nothing happens in game.
- **Partial** — base/foreign effect works, but the listed native enhancement or
  sub-mechanic has no consumer.
- **Dead-duplicate** — field is unread, but the synergy's intended effect is delivered
  via a different live field, so there is no gameplay loss (cleanup only).

| # | Source | Item / field | Status | What is missing |
|---|--------|--------------|--------|-----------------|
| 1 | nature_healing T3 (foreign) | `worldrootShareFraction` | Unimplemented | Friendly units within 3 hexes of forest/jungle share 10% of healing. |
| 2 | fortress T1 (native) | `formationSwapEnabled` | **Wired** (Batch D) | Hill Engineers swap positions with an adjacent ally, once/turn, 0 move cost. → `activateUnit.ts` formation swap verb |
| 3 | fortress T2 (foreign) | `spikeLinesEnabled` | Unimplemented | Infantry/ranged project ZoC; bracing makes adjacent hexes cost +1 move to enemies; charges into a braced fortress take 1 unavoidable dmg. (`zocAuraEnabled` is a separate, wired flag.) |
| 4 | fortress T2 (native) | `persistentSpikeLinesEnabled` | Unimplemented | Spike lines persist 2 turns after the bracing unit moves away. |
| 5 | fortress T3 (foreign) | `phalanxDamageShare` | Unimplemented | Three adjacent fortress units share 50% of damage taken across the group. |
| 6 | camel_adaptation T1 (native) | `nomadicTerrainImmunity` | Partial | Native T1 should ignore move penalty on ALL non-impassable terrain; only the desert/tundra base (foreign) is wired. (`nomadicTranscendenceEnabled` grants all-terrain at T3, not T1.) |
| 7 | camel_adaptation T2 (foreign) | `mirageRange` | Partial | Mirage stealth-at-distance works as a boolean (`permanentStealthEnabled`), but the "more than 2 hexes away" range value is not read. |
| 8 | camel_adaptation T2 (native) | `mirageAllRough` | Partial | Native mirage should extend to all rough/cover terrain (forest, jungle, hill, mountain); only desert/tundra is wired. |
| 9 | camel_adaptation T3 (foreign) | `caravanCarryEnabled` | **Wired** (Batch D) | Camel-class units carry one allied unit; disembarked unit keeps attacks. → `transportSystem.ts` canBoardTransport + disembarkUnit |
| 10 | charge T3 (foreign) | `sunderingChargeContinue` | Unimplemented | A charge that kills lets the attacker continue moving in the same line and attack a second enemy. |
| 11 | river_stealth T1 (native) | `coverProjectionEnabled` | Unimplemented | Allies adjacent to a stealthed River unit are also concealed from distant enemies. |
| 12 | river_stealth T3 (foreign) | `revealMovementPenalty` | Partial | Stealth-reveal works (`stealthRevealEnabled`), but revealed enemies losing 1 movement next turn is not wired. |
| 13 | tidal_warfare T1 (native) | `pirateNavalVision` | Unimplemented | Pirate Lords gain +1 vision from any coast/river hex. |
| 14 | tidal_warfare T2 (native) | `pirateCombinedAssault` | **Wired** (Batch D) | Pirate naval units carry +1 land unit; disembarked unit acts same turn. → `transportSystem.ts` canBoardTransport + disembarkUnit |
| 15 | heavy_hitter T1 (native) | `fortifiedDefenseReduction` | Partial | Base +20% vs fortified is wired (`antiFortificationEnabled`); the native "reduce target's defense bonus by 50% for the rest of combat" is not. |
| 16 | hitrun T2 (native) | `bloodtrailMovementBonus` (native variant) | Partial | Foreign bloodtrail (+1 move next turn) is wired (`bloodtrailMomentumEnabled`); the native "+2 per wound, applied the same turn" enhancement is not. |
| 17 | Swarm Tactics — `hitrun+hitrun` | `formationFocusBonus`, `formationFocusIgnoresDefense` | Partial | +30% damage applies via generic `damage`, but **unconditionally** (not focus-fire on a shared target) and the **ignore-defender-defense never happens**. |
| 18 | Coastal Fortress — `fortress+tidal_warfare` | `bombardmentRange`, `bombardmentLandAuraDefense` | **Wired** (Batch D) | `bombardmentDamageMultiplier` + `defense +0.25` already worked; `bombardmentRange` now extends attack range in `canAttackTarget`; `bombardmentLandAuraDefense` adds defense to allied land units near a Coastal Fortress ship in `preview.ts`. |
| 19 | Slave Army — `slaving+slaving` | `slaveHordeDamageBonus`, `slaveHordeDefensePenalty` | Partial | +50% / −30% delivered via generic `damage`/`defense` (named fields are dead), but **"groups of 3+ ignore ZoC"** and **"slave death → adjacent allies +1 move"** are not implemented. |
| 20 | Desert Stronghold — `fortress+camel_adaptation` | `mobileStrongholdDefenseBonus`, `mobileStrongholdFortUp` | Dead-duplicate | Self-defense via generic `defense +0.75`, ally aura via `mobileStrongholdAlliedDefenseBonus`, anti-displacement via `preventAction` — all live. These two fields are pure dead duplicates. |
| 21 | Shadow Network — `river_stealth+river_stealth` | `positionSwapAvailable` flag | Dead-duplicate | Swap works via the `positionSwap` **verb** (`activateUnit.ts:775`); the flag is never read. |

> Also note (not a discrete catalog item): `projectAura`-nested **per-turn healing** is
> not pumped — `unitRefresh.ts:349` reads `projectAura` only to size the visual zone, so
> the **Citadel** (`fortress+nature_healing`) and **Oasis-pair**
> (`nature_healing+camel_adaptation`) "+HP/turn" auras don't actually heal. Mitigated
> because those units carry `druid`/`healing` tags and already heal via the base aura;
> the synergy's *extra* aura heal simply doesn't stack.

---

## Test & doc drift (supporting findings, not catalog items)

- **`tests/unwiredSynergies.test.ts`** asserts *dispatch only* (it checks
  `result.getStat()/hasFlag()` immediately after `applyCombatSynergies`), not
  consumption. It stays green for items 17–21 even though nothing downstream reads
  those fields — false confidence. It should run a real combat/turn and assert the
  HP/defense/movement delta.
- **`codemap.md`** documents a primitive trigger/target system that does not exist;
  correct it to the condition-only reality.

---

## Verification method

- Enumerated all `StatName`/`FlagName`/`VerbName` (`synergyPrimitives.ts`), every
  doctrine flag (`capabilityDoctrine.ts`), and every `// design`-annotated field
  (`content/domains/index.ts`).
- Grepped every `getStat`/`hasFlag`/`hasVerb`/`findStatus`/`getList`/`getSpawns`
  consumer across `src/` and `web/`, plus a per-name whole-repo grep (`src/`, `web/`,
  `tests/`) for each suspected-dead field to confirm it appears only in content, the
  type definition, the dispatcher writer, and tests — never a consumer.
- Read in full: `unitRefresh.ts`, the doctrine resolver, both content catalogs, the
  dispatcher/evaluator, and the movement/fog/zoc consumers.
