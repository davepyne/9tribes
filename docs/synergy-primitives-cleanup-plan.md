# Synergy Primitives — Cleanup Plan

Companion to `docs/synergy-primitives-design.md` and `docs/synergy-rework-notes.md`.

This document is the execution plan for resolving the gap between the design and the implementation. The design promised "12 composable primitives; future synergies are declarative records, not new code." The implementation kept a 110-field `SynergyCombatResult` and a per-field consumer in `apply.ts`. Net result: ~30 fields are dispatched but never read; 3 synergies are mechanically inert; 3 primitive features (`trigger`, `target`, `scaling`) are declared in the type system and ignored at runtime.

The plan below resolves this by collapsing the result shape, not by patching named fields one at a time. Patching is what produced the current state. Each phase has a binary done condition and must land before the next phase starts.

---

## Invariants

These hold across every phase. Violating any of them is grounds for reverting the phase.

1. **No backwards-compatibility shims.** If a field is removed, every reference is removed in the same commit. No `// removed` comments, no aliasing, no deprecated re-exports.
2. **Type system reflects reality.** If the dispatcher does not honor a primitive field at runtime, that field does not exist on the primitive type. No aspirational fields.
3. **One source of truth per mechanic.** A given numerical tuning value lives in exactly one place. `EMERGENT_PARAMS` and `SynergyCombatResult` cannot both authoritatively store `iron_turtle.crushZoneRadius`. Pick one.
4. **A synergy that compiles must mechanically affect combat.** If a primitive's only side-effect is writing to a result field that nothing reads, that is a build failure, not a runtime no-op.
5. **Tests assert mechanics, not field values.** `expect(result.mobileStrongholdDefenseBonus).toBe(0.75)` is forbidden. The correct assertion is `expect(combatOutcome.defenderDamage).toBeLessThan(baselineDamage)` — proving the effect changed the simulation. Field-level assertions are a regression vector because they pass even when the field is unread.
6. **No new content during cleanup.** Adding pair synergies or emergent rules is frozen between Phase 1 and Phase 6. New synergies during refactor will silently inherit the broken patterns being removed.

---

## Phase 1 — Static coverage audit

Single artifact: `scripts/auditSynergyCoverage.ts`. No source-code changes outside the script.

### Build

The script enumerates `SynergyCombatResult` fields by parsing `src/systems/synergyTypes.ts` (TypeScript Compiler API; no regex). For each field, it classifies:

- **written-by-content** — at least one `kind: 'statMod'` / `'setFlag'` primitive in `src/content/synergies/index.ts` writes the field, OR a primitive whose dispatcher branch (in `src/systems/primitiveDispatcher.ts`) writes the field is referenced in content.
- **read-by-consumer** — at least one occurrence of `\.<field>\b` outside the dispatch pipeline. Excluded paths (where references are mechanical copies, not consumption): `synergyTypes.ts`, `synergyEffects.ts`, `primitiveDispatcher.ts`, `combat-action/types.ts`, `combat-action/preview.ts` (the field-copy block), `combat-action/labeling.ts` if it only formats for logs.

Output: a table written to `.slim/synergy-coverage.json` and a human-readable summary to stdout. Columns: field name, written-by-content (yes/no), dispatcher-write-branch (yes/no), read-by-consumer (yes/no), classification.

Classifications:
- `live` — written and read.
- `dead` — neither written nor read.
- `vestigial` — written but not read.
- `orphan` — read but not written.

The script also enumerates uses of `trigger`, `target`, `scaling` on primitives in content and reports any (since the dispatcher honors none of them).

### Wire into CI

Add a Vitest test `tests/synergyCoverage.test.ts` that imports the script's classifier and asserts the count of `dead`, `vestigial`, and `orphan` fields against a constant `EXPECTED_COUNTS`. The constant starts at today's actual counts (so the test passes immediately). Every subsequent phase that fixes fields decrements the constant. CI fails if the count grows.

### Done condition

`npm test` runs the new test. `node --import=tsx scripts/auditSynergyCoverage.ts` prints the matrix. Adding a new vestigial field in a PR causes the test to fail.

No other code changes.

---

## Phase 2 — Delete Tier 1 dead fields

Eight fields are referenced by neither content nor consumer:

- `routTriggered`
- `routThresholdOverride`
- `slaveHordeRageTriggered`
- `tidalCleanseClearedDebuffs`
- `swarmSpeedBonus`
- `heavyRetreatDamageReduction`
- `coastalNomadSpeed`
- `terrainSlaveSpeed`

For each: remove from `SynergyCombatResult` in `src/systems/synergyTypes.ts`, from `StatName` in `src/systems/synergyPrimitives.ts`, from `makeEmptyResult` in `src/systems/synergyEffects.ts`, from `CombatActionPreviewDetails` in `src/systems/combat-action/types.ts`, and from the field-copy block in `src/systems/combat-action/preview.ts`. Delete the corresponding default value from `baseResolution` in `src/systems/combat-action/apply.ts` if present.

No content references to update (these were never written). No consumer references to update (these were never read). TypeScript will fail the build if any reference was missed; that is the proof of completion.

### Done condition

`npx tsc --noEmit` clean for `src/`. `npm test` green. Audit script reports 0 dead fields. `EXPECTED_COUNTS.dead = 0` in `tests/synergyCoverage.test.ts`.

---

## Phase 3 — Collapse the result shape

This is the root-cause fix. The reason `~30` fields are unwired is that adding a synergy required adding a named field, and the named field made it easy to forget to add a consumer. The fix is to eliminate named fields entirely.

### Target shape

Replace `SynergyCombatResult` with:

```ts
export interface SynergyCombatResult {
  stats: Map<StatName, number>;
  flags: Set<FlagName>;
  statuses: AppliedStatus[];        // { name: StatusName; stacks: number; duration: number; fields?: ... }
  knockback: KnockbackResult | null; // { distance, collisionDamage, collisionStun }
  spawns: MapSpawn[];                // { effectType, position, radius?, duration?, fields? }
  verbs: Set<VerbName>;              // granted player verbs for this combat
  additionalEffects: string[];       // unchanged; existing log-line accumulator
}
```

Helpers on the result type:
- `getStat(name: StatName, default = 0): number`
- `hasFlag(name: FlagName): boolean`
- `hasVerb(name: VerbName): boolean`
- `findStatus(name: StatusName): AppliedStatus | undefined`

All consumer reads go through these. No `.damage`, no `.mobileStrongholdDefenseBonus`.

### StatName collapse

Today `StatName` has ~88 entries, most of which are synergy-specific (`mobileStrongholdDefenseBonus`, `bloomPulseAuraRadius`, `formationFocusBonus`, etc.). After collapse, `StatName` is the small core set of stats the simulation actually mutates:

`damage`, `defense`, `damageReflection`, `armorPiercing`, `movement`, `accuracy`, `knockbackDistance`, `stunDuration`, `slowDuration`, `poisonStacks`, `aoeDamage`, `healAmount`, `healPercentMaxHp`, plus the small set of consumer-side scalars that genuinely need to exist (charge/retreat/stealth capture chance, naval capture bonus, ram damage, etc. — to be enumerated during the phase by reading every `apply.ts` consumer and recording the stat it reads).

Synergy-specific scalars (`mobileStrongholdDefenseBonus`, `slaveHordeDamageBonus`, etc.) are deleted entirely. Their effect is expressed as the underlying raw stat — which is already in the same `effects: []` list today as the "shadow primitive." This phase removes the dead twin in favor of the live one.

### Migration of content

`src/content/synergies/index.ts` is rewritten in place. For each synergy:

1. Identify primitives whose `stat` is a vestigial field. (The audit script's output drives this list.)
2. Delete the vestigial primitive if its mechanical effect is already expressed by a sibling primitive (the shadow pattern). The audit must show that the sibling exists and writes a `live` stat. If no sibling exists, the synergy is in Phase 4 territory — flag it and continue.
3. Verify the synergy still has at least one effective primitive. A synergy whose entire `effects: []` array becomes empty after deletion is mechanically inert and must be flagged for Phase 4 rework.

### Migration of dispatcher

`src/systems/primitiveDispatcher.ts` collapses. `dispatchStatMod` becomes:

```ts
function dispatchStatMod(p: StatMod, ctx: CombatContext, result: SynergyCombatResult): void {
  if (!evaluateCondition(p.condition, ctx)) return;
  const current = result.stats.get(p.stat) ?? 0;
  result.stats.set(p.stat, applyOp(current, p.op, p.value));
}
```

The 30-line dispatcher branches for individual stats disappear. Same collapse for `dispatchSetFlag`, `dispatchApplyStatus`, `dispatchGrantVerb` — each becomes a one-liner that inserts into the generic container.

### Migration of consumers

Every consumer of the old named fields rewrites to use the helper API. Examples:

- `apply.ts:1313` — `preview.details.damageReflection + preview.details.emergentDamageReflection` becomes `preview.details.synergy.getStat('damageReflection')` (with the emergent damage reflection now written to `damageReflection` directly by the emergent rule's primitives, not a separate `emergentDamageReflection` slot).
- `preview.ts:344` — `attackerSynergyResult.damage` becomes `attackerSynergyResult.getStat('damage')`.
- `apply.ts:1062` — `preview.details.ghostPassActive` becomes `preview.details.synergy.hasFlag('ghostPassActive')`.

The field-copy block in `preview.ts` (lines ~600–710) collapses to a single line: `synergy: attackerSynergyResult`. The denormalization through `CombatActionPreviewDetails` is what made the vestigial pattern invisible; eliminating it is the structural fix.

### Done condition

- `SynergyCombatResult` has the new shape. The interface is ~10 lines.
- `StatName` is the core set, enumerated and justified.
- `CombatActionPreviewDetails` no longer denormalizes synergy fields.
- `makeEmptyResult` returns `{ stats: new Map(), flags: new Set(), statuses: [], knockback: null, spawns: [], verbs: new Set(), additionalEffects: [] }`.
- The audit script reports 0 vestigial fields (because there are no named fields to be vestigial).
- `npx tsc --noEmit` clean for `src/`.
- `npm test` green. Every test that previously asserted on a named result field is rewritten to either assert via the helper API (acceptable) or assert on a mechanical outcome (preferred — see Invariant 5).

This phase is the biggest. It will touch `apply.ts`, `preview.ts`, `synergyEffects.ts`, `synergyTypes.ts`, `synergyPrimitives.ts`, `primitiveDispatcher.ts`, `synergyRuntime.ts`, all synergy tests, and the synergy content catalog. Expect a single PR with no intermediate commits — partial states leave the codebase in a half-migrated condition that is worse than either endpoint.

---

## Phase 4 — Fix synergies with no working primitive

After Phase 3, the audit script identifies synergies whose entire `effects: []` array has no mechanical effect. From the current audit, these are:

1. **`tidal_warfare+tidal_warfare` (Armada).** Sole primitive writes `formationChainBonus`, which is removed in Phase 3. Replace with a primitive on `damage` (or extend the design to support `scaling` — see Phase 6).
2. **`juggernaut` ZoC immunity.** The setFlag of `emergentIgnoreZoc` was never read by `zocSystem.ts`. After Phase 3 the flag still exists in `result.flags` but no consumer reads it. Wire the consumer: `src/systems/zocSystem.ts:127, 164` reads `faction.activeTripleStack?.emergentRule.effects` for a `setFlag` primitive with flag `emergentIgnoreZoc`. Refactor the read into a helper `factionHasEmergentFlag(faction, 'emergentIgnoreZoc')` in `synergyRuntime.ts` so the dependency direction is correct (zocSystem depends on synergyRuntime, not the inverse).
3. **`iron_turtle` ZoC immunity.** Same fix as above; iron_turtle's emergent rule also sets `emergentIgnoreZoc`.
4. **`juggernaut` charge signature (`emergentDamageBehindPercent`).** Either wire a consumer in `apply.ts` (analogous to the existing charge T3 splash code), or remove the signature from the emergent rule and replace with a different mechanic. Decision is content design, not refactor — flag in `synergy-rework-notes.md` and resolve there.

Each fix lands with a behavioral test that asserts mechanical effect — not field state. For Armada: build a fixture of 3 naval units in chain range, run `applyCombatAction()`, assert defender HP loss matches expected chain damage. For ZoC immunity: move a Juggernaut-active unit through an enemy ZoC hex, assert `entersZoC` is false on the movement preview.

### Done condition

- Every synergy in `src/content/synergies/index.ts` has at least one primitive whose `stat` / `flag` / `status` / `verb` is read by some consumer (verified by an extension of the audit script).
- New behavioral tests in `tests/synergyEffects.test.ts` covering the four cases above. Tests fail without the fix and pass with it.

---

## Phase 5 — Reconcile EMERGENT_PARAMS with primitives

Today, several emergent mechanics are tuned in two places: the emergent rule's `effects: []` primitives (in `src/content/synergies/index.ts`) and `EMERGENT_PARAMS` (in `src/systems/emergentRuleParams.ts`). The consumer reads `EMERGENT_PARAMS` and ignores the primitive. Examples:

- `iron_turtle.crushZoneRadius` — read by `factionTurnEffects.ts:780`. The emergent rule's primitive `{ stat: 'emergentCrushZoneRadius', op: 'set', value: 3 }` is unread.
- `ghost_army.phaseDistance` — read by `apply.ts` via `EMERGENT_PARAMS`. The primitive `{ verb: 'phase', range: 3 }` is unread.
- `terrain_lord.terraformCharges` — read by `factionTurnEffects.ts:884`. The primitive is unread.

Decision: **`EMERGENT_PARAMS` is the single source of truth for emergent-rule-scoped tuning.** Emergent rules govern faction-wide turn effects (zone effects, terraform charges, phase distances), which are not per-combat values. Forcing them through `SynergyCombatResult` is the wrong abstraction.

Action:
- Remove every primitive from `EMERGENT_RULES_DATA` whose effect is a tuning value already in `EMERGENT_PARAMS`. The emergent rule's `effects: []` array shrinks to the per-combat primitives only.
- Document in `synergyTypes.ts` that `EmergentRuleConfig.effects` is for per-combat effects; faction-scoped tuning belongs in `EMERGENT_PARAMS`.
- After Phase 3's StatName collapse, the `emergent*` stat names no longer exist anyway. This phase verifies that the per-combat primitives that remain on emergent rules (`emergentSustainHealPercent`, `emergentUndying`, `emergentIgnoreZoc`, the juggernaut domain-conditional damage mods, the many-faced raw-stat mods) are all read by consumers.

### Done condition

- `EMERGENT_PARAMS` is not duplicated by any primitive in `EMERGENT_RULES_DATA`.
- A unit test enforces this: scan emergent-rule primitives, scan `EMERGENT_PARAMS`, fail if any keys collide.

---

## Phase 6 — Reconcile primitive type with dispatcher capability

The primitive types in `src/systems/synergyPrimitives.ts` declare three fields the dispatcher does not honor:

- `trigger?: TriggerSpec` on `PrimitiveBase`
- `target?: TargetSpec` on `PrimitiveBase`
- `scaling?: { per: ScalingAxis; max?: number }` on `StatMod`

No primitive in `src/content/synergies/index.ts` uses any of them today. The fields exist as design intent that the dispatcher silently drops.

Two valid resolutions:

**Option A — Delete.** Remove `trigger`, `target`, and `scaling` from `synergyPrimitives.ts`. Remove `TriggerSpec`, `TargetSpec`, `ScalingAxis` types. Update `docs/synergy-primitives-design.md` to note that these were deferred. Net effect: the type system stops promising capability that does not exist.

**Option B — Implement.** Build a trigger queue on `GameState` flushed at the appropriate events; build a target resolver that returns affected unit IDs; build a scaling evaluator. Each is its own subproject:
- Trigger queue: ~200 LOC in a new `src/systems/triggerQueue.ts`. Routes for `onKill`, `onDeath`, `onTurnEnd`, `onCapture`, `onPhase`, `onAdjacentAllyDeath`, `onExecution`, `mercyKillOfCaptive`. Flushed from `apply.ts` after damage application and from `factionTurnEffects.ts` at turn end.
- Target resolver: `resolveTargets(target: TargetSpec, ctx: CombatContext, state: GameState): UnitId[]`. Used by the dispatcher to choose which unit's stats/flags/statuses the primitive applies to. Requires `SynergyCombatResult` to be indexed by unit ID, not a single aggregate object — a structural change that should be designed before any implementation.
- Scaling evaluator: counts the relevant entities (`chainedUnit`, `runUpHex`, `poisonStack`, `woundsReceived`, `hpLost`, `stackingAttacker`) at dispatch time and multiplies `value` accordingly, capping at `max`.

Decision: **Option A** unless a concrete synergy in active development requires the capability. Aspirational types are worse than absent types because they invite content authors to use them and produce silent no-ops.

If Option A: ship in the same PR as Phase 6 the deletion of the three fields and a one-paragraph addition to `docs/synergy-primitives-design.md` explaining the deferral. Phase 6 done.

If Option B: each capability is its own phase (6a, 6b, 6c) with its own done condition. Do not partial-implement.

### Done condition

The primitive type system declares no field that the dispatcher silently ignores. Audit script extended with a check: for each declared optional field on `PrimitiveBase` and on each primitive kind, verify the dispatcher reads it. Fails if any field is declared and unread.

---

## Phase 7 — Behavioral test coverage

After Phases 1–6, the result-shape problem is resolved. The remaining risk is regression: a future change to `apply.ts` could silently break a synergy and the existing tests would not catch it because they assert on intermediate state, not mechanical outcome.

Add `tests/synergyBehavioral.test.ts` with one test per pair synergy and one per emergent rule. Each test:

1. Constructs a deterministic fixture: two factions, a small map, one unit per faction with prototypes that tag-match the synergy's `requiredTags`.
2. Activates the synergy by setting the appropriate `faction.activeDoubleStack` or `faction.activeTripleStack`.
3. Runs `applyCombatAction()`.
4. Asserts a mechanical property of the result: HP delta, position delta, status applied, verb granted, zone effect spawned, etc.

For synergies whose effect is faction-scoped rather than per-combat (caravanRelayVisionRange, slaveEconomyResourceBonus, etc.), the test runs `processFactionPhases()` and asserts on the resulting `FactionState`.

A synergy without a behavioral test is treated as unwired regardless of what the static audit reports. Behavioral coverage is what the static audit cannot prove.

### Done condition

`tests/synergyBehavioral.test.ts` exists. Test count equals number of pair synergies plus number of emergent rules. All pass. A CI guard fails if the count drops.

---

## Sequencing

Phase 1 must land before any other phase. The audit script is what makes the remaining phases falsifiable. Without it, "done" cannot be verified.

Phase 2 must land before Phase 3, because Phase 3's StatName collapse is justified by the Phase 2 deletions (proving the fields can be removed without breaking the build).

Phase 3 is the structural fix. Phases 4, 5, and 6 are downstream cleanups that depend on Phase 3 having collapsed the result shape. They can land in any order relative to each other.

Phase 7 lands last because it depends on the final shape being stable.

Do not interleave phases. A half-collapsed result shape with some named fields and some generic containers is worse than either endpoint and indistinguishable in isolation from the current state.

---

## Out of scope

- Synergy content rework (the rebalancing proposed in `docs/synergy-rework-notes.md`). That is content design and belongs in a separate document and a separate PR sequence.
- Frontend synergy display changes. The frontend reads name/description/flavor only; it does not interpret primitives. Phase 3's structural change is invisible to the frontend.
- The 12 primitive kinds themselves. The set is correct; only the surrounding plumbing is broken.
- Performance. Dispatch cost is negligible at current synergy counts and is not what is being fixed here.
