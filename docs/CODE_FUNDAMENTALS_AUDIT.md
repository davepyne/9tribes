# Code Fundamentals Audit

**Date:** 2026-05-13
**Context:** Following the frontend/backend data duplication refactor (PR #25, commit `c1805d4`) which eliminated stale JSON copies in `web/src/data/`, this audit surveys the remaining codebase for similar fundamental code-quality issues: DRY violations, type safety erosion, mutable state patterns, logic duplication, and test coverage gaps.

---

## Table of Contents

1. [DRY Violations: Hardcoded Data / Logic](#1-dry-violations)
2. [Type Safety: Branded Type Erosion](#2-type-safety)
3. [State Management: Mutation & Determinism](#3-state-management)
4. [Logic Duplication: Frontend vs Backend](#4-logic-duplication)
5. [Test Coverage: Critical Gaps](#5-test-coverage)
6. [Priority Action Items](#6-priority-action-items)

---

## 1. DRY Violations

These are the same class of bug as the `web/src/data/*.json` duplication — data or logic that exists in one place being hardcoded or re-copied elsewhere.

### 1.1 `synergyEngine.ts` — `generateTripleName()` (lines 332–400)

**Problem:** Hardcodes emergent rule names, domain groupings, and condition-checking logic that already exist in `emergent-rules.json`. The JSON defines 10 emergent rules with their domain groupings (terrain, combat, mobility, healing, offensive, defensive, stealth), names, and membership conditions. `generateTripleName()` has a parallel switch statement that hardcodes all of this — if a domain is added to or removed from a rule in the JSON, the engine silently diverges.

**Fix:** Make `generateTripleName()` derive rule names from the resolved `EmergentRuleConfig.name` field and evaluate conditions generically by iterating over `rule.domainSets` rather than maintaining a hardcoded mapping.

**Files:**
- `src/systems/synergyEngine.ts` (lines 257–330, 332–400)
- `src/content/base/emergent-rules.json`

### 1.2 `help-content.ts` — Hardcoded Terrain XP Table (lines 370–385)

**Problem:** A hardcoded HTML table listing terrain → XP rates duplicates the constants `DOMAIN_TERRAIN_AFFINITY` and `TERRAIN_RESEARCH_BONUS` in `factionTurnEffects.ts`. If balance values change (e.g., Swamp goes from +2.0 to +2.5), the help text must be updated manually.

**Fix:** Generate the table dynamically from the source-of-truth constants by re-exporting them in a form the help module can consume, or by moving the constants to a JSON content file and having both the system and the help text import from the same place.

**Files:**
- `web/src/data/help-content.ts`
- `src/systems/simulation/factionTurnEffects.ts` (lines 98–127)

### 1.3 `CommandTray.tsx` — UI-Side Eligibility Checks (lines 25–92)

**Problem:** The React component independently reimplements fort build/destroy eligibility and sacrifice checks. This partially duplicates `getFortBuildEligibility()` in `sessionUtils.ts`. The UI version checks fewer conditions and could diverge from the real backend logic.

**Fix:** Move eligibility checks into the view-model builder so the UI only reads precomputed boolean flags.

**Files:**
- `web/src/ui/CommandTray.tsx`
- `web/src/game/controller/sessionUtils.ts`

### 1.4 `factionTurnEffects.ts` — Balance Constants in Code (lines 98–127)

**Problem:** `DOMAIN_TERRAIN_AFFINITY` and `TERRAIN_RESEARCH_BONUS` are gameplay-balance constants hardcoded in TypeScript with no JSON counterpart. While this is not a DRY violation per se (single source), it's inconsistent with the codebase's "data-driven design" convention and makes balance tuning require a code change.

**Consider:** Move to a JSON content file (e.g., extending `terrains.json` or a new `terrain-research.json`).

---

## 2. Type Safety

### 2.1 `as never` — Branded Type Bypass (~50+ occurrences in `src/`)

**Problem:** Branded types (`FactionId`, `UnitId`, `PrototypeId`, `CityId`) are the foundation of the game's ID safety, but virtually every system bypasses them with `as never` when accessing Maps. This means the type system provides zero runtime protection against passing the wrong ID kind.

**Examples:**

```
// src/systems/capabilitySystem.ts
game.cities.get(cityId as never)
game.units.get(unitId as never)

// src/systems/combat-action/apply.ts
state.prototypes.get(attacker.prototypeId as never)

// src/systems/simulation/factionTurnEffects.ts
state.cities.get(cid as never)
state.units.get(uid as never)
completedNodes.includes(prereqId as never)

// src/systems/simulation/summarizeFaction.ts
state.units.has(id as never)
```

There's a `web/src/game/stateAccess.ts` that provides properly-typed accessors (`getUnit()`, `getFaction()`, `getCity()`) and centralizes the cast — but most callers don't use it.

**Fix:** Get all code using `stateAccess.ts` accessors. Add an ESLint rule banning `as never` in production code.

### 2.2 `as unknown as` Double Casts (18 occurrences in 11 files)

**Problem:** Used as an escape hatch when TypeScript's structural compatibility check blocks an unsafe cast, rather than fixing the underlying types:

```
unit.position as unknown as { x: number; y: number }   // type says {q,r} not {x,y}
faction.prototypeIds as unknown as PrototypeId[]        // cast instead of fixing the type
```

**Key instances:**

| File | Line | Issue |
|------|------|-------|
| `src/systems/simulation/factionTurnEffects.ts` | 993, 1020 | Position type mismatch |
| `src/systems/healingSystem.ts` | 181, 209 | Same position type mismatch |
| `src/systems/signatureAbilitySystem.ts` | 44, 49 | `UnitId` → `PrototypeId`, missing property access |
| `web/src/ui/TechDiscoveryModal.tsx` | 20 | JSON import — no schema validation |
| `web/src/ui/KnowledgeGainedModal.tsx` | 42 | JSON import — no schema validation |

### 2.3 `as any` at Serialization Boundary

**Problem:** `web/src/game/types/playState.ts` (lines 126–127) casts serialized payload fields with `as any` when constructing typed Maps:

```
transportMap: toTypedMap(payload.transportMap as any),
villageCaptureCooldowns: toTypedMap(payload.villageCaptureCooldowns as any),
```

These two fields skip the generic constraint that other `toTypedMap` calls respect. If the serialized format changes, these silently accept wrong shapes.

### 2.4 Inline `any` Parameters (3 occurrences)

- `web/src/app/GameShell.tsx` lines 153–154: `.find((p: any) => ...)` and `.find((r: any) => ...)`
- `src/systems/knowledgeSystem.ts` line 176: `(pairSynergiesData.pairSynergies as any[]).some(...)`

### 2.5 Notable Single Casts

- `src/systems/productionSystem.ts` lines 212–213: `'green' as any` and `'ready' as any` for unit veteran level and status instead of using union types
- `src/systems/unit-activation/targeting.ts` lines 30, 161: `null as any` used as initial value for `bestTarget` — defeats strictNullChecks
- `src/balance/types.ts` line 103: `JSON.parse(JSON.stringify(value)) as T` — generic deep clone that erases type safety at runtime

**Positive:** Zero `// @ts-ignore` or `// @ts-expect-error` found across the entire codebase. No `[key: string]: any` index signatures. The type safety violations are concentrated in specific patterns, not systemic carelessness.

---

## 3. State Management

### 3.1 GameState Has No `Readonly<>` Protections

**Problem:** The entire `GameState` interface (`src/game/types.ts`) is fully mutable with no `Readonly<>` wrappers on Maps or Sets. The type system provides zero guard against accidental mutation. This means a future change that mutates `state.units.get(id)!.health = x` would pass silently at compile time.

### 3.2 Shallow Copy Bug in Simulation Loop

**File:** `src/systems/warEcologySimulation.ts` line 54

```ts
let current = { ...initialState }
```

This is a shallow copy. The Maps inside (`factions`, `units`, `cities`, etc.) remain reference-identical to the original `initialState`. If any code path accidentally mutates a Map in place (which the `as never` pattern makes easy), it corrupts the original state. Currently no runtime path does this, but it's a latent bug.

### 3.3 Non-Deterministic RNG Fallback

**File:** `src/systems/captureSystem.ts` lines 135, 300

```ts
const roll = rngState ? rngNextFloat(rngState) : Math.random();
```

When `rngState` is falsy from certain call paths, it falls back to `Math.random()`. This breaks simulation determinism — two runs with the same seed can produce different results.

### 3.4 `Date.now()` Calls Destroy Replay Determinism

**42+ calls** scattered across `historySystem.ts`, `captureSystem.ts`, `combatSystem.ts`, and other files. Timestamps are baked into history entries at mutation time. If the simulation is ever replayed or compared between runs, these timestamps differ and cause object inequality even when game state is equivalent.

### 3.5 Dead Mutation Code

**File:** `src/systems/combatSystem.ts` lines 361–367

`addBattleHistory(unit, opponentId, won)` does `unit.history.push({...})` — directly mutating a game model object's property. **It is defined but never called.** If reactivated, it would silently corrupt unit objects in the game state.

### 3.6 Module-Level Mutable Singletons

- `capabilityDoctrine.ts` (line 108): `const doctrineCache = new Map<FactionId, DoctrineCacheEntry>()` — persistent cache with a `clearDoctrineCache()` band-aid for tests
- `synergyRuntime.ts` (line 13): `let synergyEngine: SynergyEngine | null = null` — mutable module-level reference

### 3.7 Map-Generation Mutations

**File:** `src/game/buildMvpScenario.ts` — functions mutate `tile.terrain`, `faction.unitIds`, etc. on game objects already stored in Maps. These are one-time setup functions, but they set a bad precedent and exemplify the "mutable by default" culture.

**Patterns that ARE handled correctly (for reference):**
- Most systems create `new Map(state.units)`, `new Set(current.contaminatedHexes)` and return `{ ...state, units: newUnits }`
- `historySystem.ts` uses `[... unit.history, entry]` (immutable append)
- `combat-action/apply.ts` consistently creates new Unit objects with spread
- No `Object.assign(gameState, ...)` found
- No direct `.hp = X` mutations on game model objects in runtime code

---

## 4. Logic Duplication

### Status After PR #25

**✅ Clean — properly refactored:**
- View-model inspectors all import from backend
- Hex grid utilities — no web-side grid code exists
- Cost/modifier calculations — all import from backend
- Synergy computation — only backend fields used (`resolveActiveSynergies.ts` only calls `resolveActiveSynergiesFromBackend()`)
- Data file duplication — JSON files removed from `web/src/data/`

**⚠️ Remaining issues:**

### 4.1 `worldViewModelUnitView.ts` — `effectiveDefense` (lines 57–84)

| Aspect | Frontend | Backend |
|--------|----------|---------|
| Formula | `base * (1 + terrainMod + improvementBonus)` | `base * (1 + terrainMod + improvementBonus + veteranBonus + situationalDefenseModifier)` |
| Improvement | Scans improvements/cities/villages | Same, plus `hill_clan` fortification special case |

The frontend version is a simplified subset missing `veteranBonus` and `situationalDefenseModifier`, plus the `hill_clan` special case. **Fix:** Either expose `effectiveDefense` as a backend-calculated field on the unit state, or document this is intentionally simplified and keep in sync.

### 4.2 `sessionUtils.ts` — Siege State

`updateSiegeState` (lines 41–58) replicates siege encircled-checking on the game state, while `siegeSystem.ts` likely also manages siege state. Worth verifying that these two paths agree.

---

## 5. Test Coverage

### 5.1 Critical Systems With Zero Tests

| System | LOC | Risk | Notes |
|--------|:---:|:----:|-------|
| `simulation/factionTurnEffects.ts` | 1,301 | 🔴 CRITICAL | Core per-turn simulation: ecology research, production, healing, supply, environmental damage, AI strategy, victory checks. Orchestrates everything. |
| `healingSystem.ts` | 268 | 🔴 HIGH | Per-turn healing, location rates, synergy healing, withering, nature aura, treefolk, poison cure |
| `captureSystem.ts` | 375 | 🔴 HIGH | Slaver capture mechanic, chance/cooldown logic |
| `fogSystem.ts` | 499 | 🔴 HIGH | Hex visibility, last-seen snapshots, stealth interactions |
| `combat-action/apply.ts` + `preview.ts` | ~500 | 🔴 HIGH | The new combat pipeline. Only indirectly tested via liveSessionParity. |
| AI activation pipeline | ~500+ | 🔴 HIGH | `activateUnit.ts`, `targeting.ts`, `movement.ts`. Zero direct tests. |
| `learnByKillSystem.ts` | ~80+ | 🟡 MODERATE | Combat-driven learning mechanic |
| `moraleSystem.ts` | ~100+ | 🟡 MODERATE | Partially tested via combat.test.ts |
| `pathfinder.ts` | ~200+ | 🟡 MODERATE | Pathfinding edge cases |
| `signatureAbilitySystem.ts` | ~50+ | 🟢 LOW | Faction signature abilities |
| `transportSystem.ts` | ~60+ | 🟢 LOW | Unit transport |
| `villageCaptureSystem.ts` | ~80+ | 🟢 LOW | Village capture logic |

### 5.2 Dead Code: War Exhaustion System

`warExhaustionSystem.ts` has a complete system (create, add, calculate penalties, decay, tick) with 71 lines of test coverage confirming it works... but `EXHAUSTION_CONFIG` has every value at zero:
```ts
UNIT_KILLED=0, CITY_CAPTURED=0, DECAY_NO_LOSS=0
```
Tests verify: "production penalty is always zero", "morale penalty is always zero", "decay is a no-op". **~300 lines of dead code with tests validating its uselessness.** Decision needed: wire it up with real values or delete it.

### 5.3 Combat Tests Verify the Wrong API

`combat.test.ts` (586 lines) tests `resolveCombat()` from `combatSystem.ts`. The actual combat pipeline now routes through `previewCombatAction()` → `applyCombatAction()` in the `combat-action/` subdirectory. The primary call chain diverges from the tested path.

### 5.4 Missing Full-Pipeline Integration Test

No test calls `runFactionPhase()` or `processFactionPhases()` to verify all sub-systems compose correctly. `liveSessionParity.test.ts` (1,025 lines) is the closest integration test but goes through `GameSession` (frontend controller) rather than the pure simulation pipeline.

### 5.5 Shallow / Misnamed Tests

| Test File | Lines | Problem |
|-----------|:-----:|---------|
| `dataSync.test.ts` | 26 | Misnamed — just checks no `.json` in `web/src/data/`. No actual serialization roundtrip test despite `serializeGameState`/`deserializeGameState` existing. |
| `warExhaustion.test.ts` | 71 | Tests confirm the system is entirely disabled. |
| `gameState.test.ts` | 118 | Trivial — verifies every property exists on empty constructor, tests nothing behavioral. |
| `curatedPlaytest.test.ts` | 26 | Thin — just checks payload structure. |
| `movementSystem.test.ts` | 150 | Only 3 cost scenarios. No ZOC, transport, or forced march tests. |
| `webGameController.test.ts` | 64 | One happy path only. |

### 5.6 Coverage Summary

| Metric | Count |
|--------|:-----:|
| Test files | 57 |
| Total test lines | 16,210 |
| Total `expect()` assertions | 1,711 |
| Total `it()` test cases | 802 |
| System modules in `src/systems/` | ~86 |
| System modules with ZERO tests | ~20+ |
| Untested critical logic | ~4,000+ lines |

---

## 6. Priority Action Items

Ranked by impact and ease of fix:

### P0 — Immediate Risk

| # | Item | Category | Effort |
|---|------|----------|--------|
| 1 | Write tests for `factionTurnEffects.ts` (1,301 LOC, core turn pipeline, zero coverage) | Test coverage | Large |
| 2 | Fix RNG determinism: remove `Math.random()` fallback in `captureSystem.ts` | State mgmt | Small |
| 3 | Decide fate of war exhaustion: wire it up or delete the system | Dead code | Medium |
| 4 | Align combat tests with the actual `combat-action/` pipeline | Test coverage | Medium |

### P1 — Erosion That Gets Worse Over Time

| # | Item | Category | Effort |
|---|------|----------|--------|
| 5 | Ban `as never` at lint level, migrate all callers to `stateAccess.ts` | Type safety | Medium |
| 6 | Make `GameState` use `Readonly<>` wrappers on Maps | State mgmt | Large |
| 7 | Add schema validation at JSON import boundaries (3 UI modals) | Type safety | Small |

### P2 — DRY & Maintenance

| # | Item | Category | Effort |
|---|------|----------|--------|
| 8 | Make `generateTripleName()` data-driven from `emergent-rules.json` | DRY | Medium |
| 9 | Derive help-content terrain table from source constants | DRY | Small |
| 10 | Move CommandTray eligibility checks to view-model | Logic dup | Medium |
| 11 | Expose `effectiveDefense` as backend-calculated field or document simplification | Logic dup | Small |
| 12 | Deep-copy simulation state in warEcologySimulation.ts instead of shallow `{...x}` | State mgmt | Small |
| 13 | Fix position type mismatch (`{q,r}` → `{x,y}` casts in healing/factionTurnEffects) | Type safety | Small |
| 14 | Fix `productionSystem.ts` `'green' as any` / `'ready' as any` casts | Type safety | Trivial |

### P3 — Investigation Required

| # | Item | Category |
|---|------|----------|
| 15 | Verify `sessionUtils.ts` siege state management doesn't diverge from `siegeSystem.ts` | Logic dup |
| 16 | Evaluate whether `Date.now()` in history entries is needed or can be replaced with turn number | Determinism |
| 17 | Review `buildMvpScenario.ts` mutation patterns for refactoring into pure setup functions | State mgmt |

---

## Files Referenced

```
src/game/types.ts                                    # GameState type definition
src/systems/warEcologySimulation.ts                  # Main simulation loop
src/systems/simulation/factionTurnEffects.ts         # Per-turn simulation (1,301 LOC)
src/systems/synergyEngine.ts                         # Synergy/computation engine
src/systems/captureSystem.ts                         # Capture mechanic + RNG fallback
src/systems/combatSystem.ts                          # Legacy combat, dead addBattleHistory
src/systems/combat-action/apply.ts                   # New combat apply pipeline
src/systems/combat-action/preview.ts                 # New combat preview pipeline
src/systems/healingSystem.ts                         # Healing system (no tests)
src/systems/fogSystem.ts                             # Fog of war (no tests)
src/systems/warExhaustionSystem.ts                   # Disabled war exhaustion
src/systems/capabilityDoctrine.ts                    # Module-level doctrineCache singleton
src/systems/synergyRuntime.ts                        # Module-level synergyEngine singleton
src/game/buildMvpScenario.ts                         # Scenario setup with mutation patterns
src/content/base/emergent-rules.json                 # Canonical emergent rules data
web/src/game/types/playState.ts                      # Serialization boundary casts
web/src/game/stateAccess.ts                          # Typed state accessors
web/src/game/view-model/worldViewModelUnitView.ts    # effectiveDefense duplication
web/src/ui/CommandTray.tsx                           # UI eligibility reimplementation
web/src/data/help-content.ts                         # Hardcoded terrain table
web/src/game/controller/sessionUtils.ts              # Fort/siege eligibility
tests/                                               # All test files
```
