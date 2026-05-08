# Synergy Pipeline Breaks

Three breaks prevent the learn-by-kill → sacrifice → synergy pipeline from flowing end-to-end. The AI strategy layer is aware of synergies and targets them, but the execution layer has dead ends.

## Break 1: Learn-by-kill is invisible

`tryLearnFromKill` silently updates units because `trace` is always `undefined`.

**Call site:** `src/systems/combat-action/apply.ts:232`
```ts
const learnResult = tryLearnFromKill(nextAttacker, defender, state, state.rngState, undefined, learnChanceScale);
```

**Trace recorder:** `src/systems/simulation/traceRecorder.ts` has an `abilityLearnedEvents` array and a `recordAbilityLearned` function (or the slot for one), but nothing ever calls it with learn-by-kill data.

**What to fix:** Thread `trace` through the combat action call chain. The caller in `src/systems/unit-activation/activateUnit.ts:461` receives the `appliedCombat.feedback.lastLearnedDomain` result but discards it. Either:
- Pass trace into `applyCombatAction` (it currently doesn't accept one), or
- Have the caller check `appliedCombat.feedback.lastLearnedDomain` after the call and record it to the trace.

Both call sites in `activateUnit.ts` need the fix (line 461 for direct attacks, line 685 for post-movement attacks).

**Verification:** After fix, `abilityLearnedEvents` in simulation JSON should contain entries. Simulation runs confirmed ~6 units per 50 turns learn abilities from kills — those should all appear.

---

## Break 2: `performSacrifice()` is dead code

The function exists in `src/systems/sacrificeSystem.ts` but is never called anywhere in the codebase. The AI generates the *intent* but nothing *executes* it.

**Intent generation (works):**
- `src/systems/strategic-ai/assignments.ts:448-484` — generates `return_to_sacrifice` assignment for units with learned abilities near home city
- `src/systems/strategic-ai/difficultyCoordinator.ts:47` — excludes these units from active army count

**Execution gap (missing):**
- `src/systems/unitActivationSystem.ts` or `src/systems/unit-activation/activateUnit.ts` — neither checks for `return_to_sacrifice` assignment
- No code path calls `canSacrifice()` or `performSacrifice()`

**What to fix:** Add a check in the unit activation loop. When a unit has assignment `return_to_sacrifice`, is adjacent to home city, and passes `canSacrifice()`, call `performSacrifice()`. This strips the unit's learned abilities (unit survives) and calls `codifyDomainsForFaction()` to add those domains to the faction's `learnedDomains`, triggering synergy re-evaluation.

The activation entry point is likely in `src/systems/unit-activation/activateUnit.ts` around the intent-dispatch section, or in the per-unit loop in `src/systems/simulation/factionTurnEffects.ts`.

**Key constraint:** `performSacrifice()` currently takes `unitId, factionId, state, rngState, trace`. The non-destructive version (unit survives, loses abilities) is the one to use. Verify the function signature and behavior — the unit should keep its HP and position but lose `learnedAbilities`.

---

## Break 3: Only passive domain paths work

Domains only reach the faction level through three passive paths, none of which involve intentional AI action:

| Path | File | Trigger |
|------|------|---------|
| Exposure (proximity) | `src/systems/knowledgeSystem.ts` | Units within 2 hexes of enemy gain exposure; auto-completes at threshold |
| City capture | `src/systems/siegeSystem.ts` → `codifyDomainsForFaction` | Capturing a city grants the old owner's native domain |
| Faction elimination | `src/systems/factionAbsorption.ts` | Conqueror absorbs all learned domains from eliminated faction |

**What to fix:** Break 2 is the fix for Break 3. Once `performSacrifice()` is wired into the activation loop, the AI will have an intentional fourth path: kill enemies → learn abilities → return to home city → sacrifice to codify → domains enter faction pool → synergies activate.

The research scoring and learn-loop coordinator are already wired to respond to new faction domains, so no additional work needed there once the sacrifice execution path exists.

---

## Not addressed here (future work)

**Behavioral adaptation after synergy unlocks:** The AI doesn't change its playstyle when triple stacks activate (e.g., Paladin sustain healing doesn't encourage more aggressive engagement). This is a larger AI personality/posture problem that requires injecting active synergies into posture scoring and tactical decisions. Tracked separately.

---

## Files involved

| File | Role |
|------|------|
| `src/systems/combat-action/apply.ts` | Learn-by-kill call site (break 1) |
| `src/systems/unit-activation/activateUnit.ts` | Combat caller, potential sacrifice execution (break 1+2) |
| `src/systems/simulation/traceRecorder.ts` | Trace recording for ability learned events (break 1) |
| `src/systems/sacrificeSystem.ts` | Dead `performSacrifice()` function (break 2) |
| `src/systems/strategic-ai/assignments.ts` | Generates `return_to_sacrifice` intent (works, no execution) |
| `src/systems/strategic-ai/difficultyCoordinator.ts` | Excludes sacrifice units from army count (works) |
| `src/systems/knowledgeSystem.ts` | Exposure path (works) |
| `src/systems/siegeSystem.ts` | City capture path (works) |
| `src/systems/simulation/factionTurnEffects.ts` | Per-faction turn loop, potential sacrifice dispatch point |
