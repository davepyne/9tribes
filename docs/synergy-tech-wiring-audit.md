# Synergy & T1–T3 Tech Wiring Audit

**Date:** 2026-05-21
**Scope:** Verify that non-basic combat effects — domain tier abilities (T1→T3) and
the double (pair) / triple (emergent) synergy systems — are actually wired to fire
at runtime, not just defined in content.

**Motivation:** A prior bug where an ability meant to trigger "every 3 turns" did not
fire (it required a dedicated periodic system to be built). This pass looks for the
same class of failure: effects that are *declared and dispatched* but *consumed by
nothing*.

---

## TL;DR

- The systems are **mostly wired correctly**. The "every-N-turns" pattern that bit
  before (Life Bloom) is now correctly implemented via a dedicated per-turn system.
- T1–T3 technology (research → doctrine flags) is healthy; nearly every doctrine
  flag has a live consumer.
- A **narrow set of pair-synergy fields are dispatched but read by no system** — they
  are effectively dead. In two cases this hides a genuinely missing sub-mechanic; in
  the rest the effect is delivered redundantly through a different (live) field.
- The project's `tests/unwiredSynergies.test.ts` gives **false confidence**: it asserts
  *dispatch* only, not *consumption*, so it stays green even for dead fields.
- `codemap.md` describes a primitive **trigger/target system that does not exist** in
  the code.

---

## How wiring actually works (architecture as-built)

A primitive effect must land in one of **two** consumption paths or it is dead:

1. **Combat-time path**
   `applyCombatSynergies()` (`src/systems/synergyEffects.ts`)
   → `resolvePrimitives()` / dispatcher (`src/systems/primitiveDispatcher.ts`)
   → mutates a `SynergyCombatResult`
   → read in `src/systems/combat-action/*` via `result.getStat()` / `result.hasFlag()`.

2. **Per-turn / aura / movement / fog path**
   Dedicated systems **re-parse the raw `synergy.effects[]` array themselves**:
   - `src/systems/simulation/unitRefresh.ts` (healing, bloom pulse, slave economy)
   - `src/systems/movementSystem.ts` (amphibious move bonus)
   - `src/systems/fogSystem.ts` (stealth-share, caravan vision, transported stealth)
   - `src/systems/zocSystem.ts` (`emergentIgnoreZoc` via `factionHasEmergentFlag`)
   - `src/systems/unit-activation/activateUnit.ts` (positionSwap verb, caravan passenger)
   - `src/systems/combat-action/helpers.ts` (`countsAsCity`)

### Key structural note: there is no trigger/target system

`PrimitiveBase` (`src/systems/synergyPrimitives.ts`) carries only an optional
`condition`. There is **no `trigger` or `target` field**, and the dispatcher reads
neither. Consequently:

- Every primitive resolves at combat time (path 1) and produces a flat result.
- Anything "periodic", "per-turn", "aura", or "on-N-turns" must be hand-built in a
  path-2 system. There is no declarative scheduling.
- `codemap.md`'s entries for `primitiveEvaluator.ts` / `primitiveDispatcher.ts`
  describe `TriggerSpec`, `TargetSpec`, `triggerMatches()`, and `resolveTarget()`.
  **None of these exist.** This is documentation drift and should be corrected so
  future work doesn't assume triggers are evaluated.

### The "every 3 turns" pattern is wired (Life Bloom)

`nature_healing+nature_healing` (Life Bloom) sets `bloomPulse*` stats. These are
consumed in `unitRefresh.ts`:
- Per-turn aura heal + self-heal + movement bonus: `unitRefresh.ts:160–272`.
- "Every 3rd turn" burst: `unitRefresh.ts:274–294`, gated on a `life_bloom` zone
  effect's `roundsSinceCreation % 3 === 0`.

This is the correct shape for periodic effects and is the template any future
"every N turns" ability should follow.

---

## T1–T3 technology: status

`src/systems/capabilityDoctrine.ts` (`resolveResearchDoctrine`) is the single source
of truth mapping completed research nodes → ~84 doctrine flags. Diffing defined flags
against consumers shows **every flag except `marchingStaminaEnabled` (intentionally
retired/always-false) has at least one live consumer.**

### Stale `// design` labels in `src/content/domains/index.ts`

The domains file annotates effect fields `// wired` or `// design` (= not yet wired).
Several `// design` labels are **stale — the feature is actually wired:**

| Field (labeled `// design`) | Actually wired at |
|---|---|
| `submergeEnabled` | `capabilityDoctrine.ts:300` → `submergeSystem.ts` |
| `maelstromRadius` / `maelstromDuration` / `pirateMaelstromAutoCapture` | `capabilityDoctrine.ts:246–248` → `maelstromSystem.ts` |
| `oasisOncePerGame` | via `canDeclareOasis` `capabilityDoctrine.ts:243` → `oasisSystem.ts` |
| `woundedEarthEnabled` | `combat-action/resolveDamage.ts:185` (full absorb + native heal variant) |
| `nativeArmorPenetration` (1.0) | via `heavyTranscendenceEnabled` `combat-action/preview.ts:448` |

### Genuinely still-unimplemented design items

These have no doctrine flag (or an unconsumed one) and are tracked in
`docs/tech-tree-rework-notes.md`:

- `worldrootShareFraction` (nature_healing T3 — share 10% healing near forest)
- `formationSwapEnabled` (fortress T1 native)
- `spikeLinesEnabled` / `persistentSpikeLinesEnabled` (fortress T2)
- `phalanxDamageShare` (fortress T3 foreign)
- `mirageRange` / `mirageAllRough` (camel T2)
- `caravanCarryEnabled` (camel T3 — carry allied unit)
- `sunderingChargeContinue` (charge T3 foreign — continue line after kill)
- `coverProjectionEnabled` (river_stealth T1 native)
- `revealMovementPenalty` (river_stealth T3 foreign)
- `pirateNavalVision` (tidal T1 native), `pirateCombinedAssault` (tidal T2 native)

These are **known, documented gaps**, not silent failures.

---

## Pair-synergy fields that are dispatched but consumed by NOTHING

Confirmed by repo-wide grep: each name below appears only in
`src/content/synergies/index.ts`, `src/systems/synergyPrimitives.ts` (type def),
`src/systems/primitiveDispatcher.ts` (writer), and test files — **never in a
consumer.**

### A. Dead field hides a genuinely missing sub-mechanic

| Synergy | Dead field(s) | What works vs. what's missing |
|---|---|---|
| **Swarm Tactics** `hitrun+hitrun` | `formationFocusBonus`, `formationFocusIgnoresDefense` | +30% damage applies via generic `damage` stat, but **unconditionally** (not focus-fire on a shared target), and **ignore-defender-defense never happens** |
| **Coastal Fortress** `fortress+tidal_warfare` | `bombardmentRange`, `bombardmentLandAuraDefense` | `bombardmentDamageMultiplier` (resolveStatus.ts:343) and `defense +0.25` work, but **ships cannot actually bombard land at range** (attack range never extended) and the **ally land-defense aura is missing** |
| **Slave Army** `slaving+slaving` | `slaveHordeDamageBonus`, `slaveHordeDefensePenalty` | +50% / −30% delivered via generic `damage`/`defense`, but **"groups of 3+ ignore ZoC"** and **"slave death → adjacent allies +1 move"** are not implemented |

### B. Dead duplicate — no functional loss (effect delivered elsewhere)

| Synergy | Dead field(s) | Why harmless |
|---|---|---|
| **Desert Stronghold** `fortress+camel_adaptation` | `mobileStrongholdDefenseBonus`, `mobileStrongholdFortUp` | Self-defense delivered by generic `defense +0.75`; ally aura by `mobileStrongholdAlliedDefenseBonus` (preview.ts:366); anti-displacement by `preventAction` |
| **Shadow Network** `river_stealth+river_stealth` | `positionSwapAvailable` flag | Swap feature works via the `positionSwap` **verb** detected in `activateUnit.ts:775`; the flag is just never read |

### C. `projectAura`-nested per-turn healing not pumped

`dispatchProjectAura` recurses inner effects only at **combat time**.
`unitRefresh.ts:349` reads `projectAura` solely to size the **visual** zone effect —
it never applies the nested per-turn heal. Affects:

- **Citadel** `fortress+nature_healing` — "2-hex healing aura +3/turn"
- **Oasis (pair)** `nature_healing+camel_adaptation` — "full HP restore at turn end"

Mitigated because those units carry the `druid`/`healing` tag and already heal via the
base nature-healing aura; the synergy's *extra* aura heal simply doesn't stack.

---

## Test & doc drift

- **`tests/unwiredSynergies.test.ts`** — Despite the header ("dispatched AND consumed
  by downstream systems"), every assertion only calls `applyCombatSynergies(...)` and
  checks `result.getStat()/hasFlag()` immediately after. That tests **dispatch only**.
  It passes for `mobileStrongholdDefenseBonus`, `mobileStrongholdFortUp`,
  `formationFocus*`, `bombardment*`, `slaveHorde*`, and `positionSwapAvailable` even
  though nothing consumes them. The test should assert real downstream consumption
  (e.g., run a combat/turn and observe the HP/defense/movement delta).
- **`codemap.md`** — `primitiveEvaluator.ts` / `primitiveDispatcher.ts` /
  `synergyTypes.ts` entries reference a trigger/target system (`TriggerSpec`,
  `TargetSpec`, `triggerMatches`, `resolveTarget`, `onTurnEnd`, `onPhase`, etc.) that
  does not exist in the source. Correct to reflect the condition-only reality.

---

## Recommended follow-ups (not yet actioned)

1. **Missing sub-mechanics (balance-affecting):** wire Swarm Tactics ignore-defense +
   focus-fire conditionality; Coastal Fortress ranged land bombardment + ally aura;
   Slave Army group-ZoC-ignore + on-death movement.
2. **Cleanup (no gameplay change):** remove the dead duplicate fields
   (`mobileStronghold{DefenseBonus,FortUp}`, `slaveHorde{DamageBonus,DefensePenalty}`,
   `positionSwapAvailable`, `formationFocus{Bonus,IgnoresDefense}`) from content + the
   `StatName`/`FlagName` unions.
3. **Per-turn auras:** apply Citadel + Oasis-pair `projectAura` healing in
   `unitRefresh.ts`.
4. **Docs/tests:** make `unwiredSynergies.test.ts` assert consumption; correct the
   `codemap.md` trigger/target description.

---

## Appendix — verification method

- Enumerated all `StatName`/`FlagName`/`VerbName` from `synergyPrimitives.ts` and all
  doctrine flags from `capabilityDoctrine.ts`.
- Grepped every `getStat('…')`, `hasFlag('…')`, `hasVerb('…')`, `findStatus/getList/
  getSpawns('…')` consumer across `src/` and `web/`.
- For each suspected-dead name, grepped the entire repo (`src/`, `web/`, `tests/`) to
  confirm it appears only in content, the type definition, the dispatcher writer, and
  tests — never a consumer.
- Read the per-turn pump (`unitRefresh.ts`), movement/fog/zoc consumers, the doctrine
  resolver, and both content catalogs in full.
