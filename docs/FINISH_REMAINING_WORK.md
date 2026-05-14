# Finish Remaining Work — Agent Prompt

Use this prompt to finish everything incomplete from the `refactor/code-fundamentals-audit` branch.

---

## Setup

```bash
cd /home/frank/repos/9tribes
git checkout refactor/code-fundamentals-audit
```

Reference docs:
- `docs/CODE_FUNDAMENTALS_AUDIT.md` — original audit
- `docs/CODE_FUNDAMENTALS_AUDIT_DELTA.md` — what was fixed vs not

---

## Task 1: Fix synergyEngine.test.ts Naming Failures (6 missing `name:` fields)

**File:** `tests/synergyEngine.test.ts`, lines 758-830

The `namingRules` array has 8 `makeEmergent()` calls. Currently only `terrain_lord` (line 760) and `fallback` (line 827) have a `name:` override. The other 6 need one added **immediately after their `id:` line**.

Add `name:` to these rules with exact display names:

| id line | Add after it |
|---------|-------------|
| `id: 'ghost_army',` (line 770) | `name: 'Ghost Army',` |
| `id: 'slave_empire',` (line 776) | `name: 'Slave Empire',` |
| `id: 'raid_camp',` (line 786) | `name: 'Raid Camp',` |
| `id: 'poison_shadow',` (line 796) | `name: 'Poison Shadow',` |
| `id: 'iron_turtle',` (line 806) | `name: 'Iron Turtle',` |
| `id: 'paladin',` (line 816) | `name: 'Paladin',` |

**Verification:** `npx vitest run tests/synergyEngine.test.ts` — all 57 tests must pass.

---

## Task 2: Inherit the Remaining `as any` / `as unknown as` Casts

### 2a: productionSystem.ts line 176

Replace the newly-introduced `item.id as any` with a proper cast. Read the file around that line to understand what type `item.id` should be, then import and use the correct branded type.

### 2b: playState.ts lines 126-127

Replace `as any` casts on `transportMap` and `villageCaptureCooldowns` with proper generic parameters, matching the pattern of the other `toTypedMap()` calls in the same file.

### 2c: signatureAbilitySystem.ts lines 44, 49

Fix these `as unknown as` double casts:
- Line 44: `unitId as unknown as PrototypeId` — fix the type so a UnitId isn't being passed where PrototypeId is expected, or add proper conversion
- Line 49: `prototype as unknown as { componentIds?: string[] }` — if `componentIds` is a valid property, add it to the type; if not, fix the access pattern

---

## Task 3: Eliminate Remaining `Math.random()` and `Date.now()` in Systems

### 3a: Remove `Date.now()` from combat/capture/history systems

Search for all `Date.now()` calls in `src/systems/`. Replace with a deterministic turn-based timestamp or remove them entirely if the timestamp isn't needed for game logic.

Key files known to have them:
- `src/systems/combatSystem.ts` line ~377
- `src/systems/historySystem.ts` line ~17
- `src/systems/captureSystem.ts` lines ~170, 188, 319, 338

Strategy: If the timestamp is used for ordering, replace with a turn counter or sequence number from game state. If it's used for display, move the `Date.now()` call to the view/presentation layer only.

---

## Task 4: Remove or Wire Up Dead Code

### 4a: `addBattleHistory()` in combatSystem.ts (line ~374)

This function mutates `unit.history.push({...})` with `Date.now()` but is **never called**. Either:
- Remove the function entirely, OR
- If it should be wired in, add the call site and ensure it uses immutable patterns (`[...unit.history, entry]`) instead of `.push()`

### 4b: Verify old `resolveCombat()` is still used

The old `resolveCombat()` in `combatSystem.ts` has a JSDoc note saying it's called by `previewCombatAction()`. Verify this is still true and that the old combat tests (`tests/combat.test.ts`) don't need updating.

---

## Task 5: Investigate (but don't necessarily fix)

### 5a: Siege state divergence

Read `web/src/game/controller/sessionUtils.ts` lines 41-58 (`updateSiegeState`) and compare with `src/systems/siegeSystem.ts`. Document whether they agree or diverge in the re-audit delta doc.

### 5b: buildMvpScenario.ts mutation patterns

Read `src/game/buildMvpScenario.ts`. Add a comment at the top noting it's "one-time setup with intentional mutation" so future devs know the pattern is deliberate.

---

## Verification

After each task, run:

```bash
npm run build          # backend must compile
npx vitest run         # all 750+ tests must pass
```

After ALL tasks are complete, update the delta report:
- `docs/CODE_FUNDAMENTALS_AUDIT_DELTA.md` — move items from ❌ Not Fixed to ✅ Fixed
- Update the summary table at the top
