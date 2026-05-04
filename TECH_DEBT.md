# Technical Debt Backlog

Auto-generated from full-codebase review (2026-05-04). Work top-to-bottom.

## Critical — Bugs

- [x] **TD-01** `attackAttack` typo zeros Pirate Collar attack bonus
  - `src/content/base/components.json:595` — key should be `attackBonus`
- [x] **TD-02** `heavy_armor` referenced in `hill_engineer` recipe but doesn't exist in `components.json`
  - `src/content/base/hybrid-recipes.json:353` — replaced with `simple_armor`
- [x] **TD-03** `researchRate` missing from `FACTION_OVERRIDE_KEYS` — silently rejects valid balance overrides
  - `src/balance/types.ts:73`
- [x] **TD-04** `terrains.json` copy in web/ has diverged from source (wrong domain pressure values)
  - `web/src/data/terrains.json` vs `src/content/base/terrains.json` (oasis entry)

## High — Dead Code (delete)

- [x] **TD-05** `Entity` interface — zero imports
  - `src/types.ts:25-28`
- [ ] **TD-06** `FactionResearch` type + `state.factionResearch` field — used in serialization and environmentalEffects, NOT dead
  - `src/features/factions/types.ts:106-113`, `src/game/types.ts:52`, `src/game/createGameState.ts:31`
- [x] **TD-07** `ResearchNode` interface — duplicates `ResearchNodeDef`, unused
  - `src/features/research/types.ts:10-21`
- [ ] **TD-08** `ResearchUnlock` type — defined in two places, used in types and registry
  - `src/features/research/types.ts:23-27` + `src/data/registry/types.ts:102-106`
- [x] **TD-09** `QualitativeEffect` interface — unused (only referenced by dead ResearchNode)
  - `src/features/research/types.ts:4-8`
- [ ] **TD-10** `FactionIdentityProfile` interface — NOT dead; used via `Faction.identityProfile` across 20+ files
  - `src/features/factions/types.ts:65-76`
- [x] **TD-11** `TurnState` interface — zero imports
  - `src/game/types.ts:38-41`
- [ ] **TD-12** `ScenarioConfig` + `createScenarioState` — used in tests only
  - `src/game/createGameState.ts:8-59`
- [x] **TD-13** `MVP_RESEARCH_CONFIG` — zero imports
  - `src/game/scenarios/mvp.ts:111-115`
- [x] **TD-14** 5 unused enum types — `VisibilityLevel`, `Elevation`, `UnitRole`, `ComponentSlotType`, `ModifierSourceType`
  - `src/core/enums.ts:4-27`
- [x] **TD-15** 9 type guard functions in ids.ts — only used in one test file
  - `src/core/ids.ts:52-77`
- [x] **TD-16** `rngPick` — dead export, only used in tests; `rngChance` is alive
  - `src/core/rng.ts:35-48`
- [x] **TD-17** `CapabilityBar` component — never imported
  - `web/src/ui/CapabilityBar.tsx`
- [x] **TD-18** `EventToast` + `EventToastStack` — never imported
  - `web/src/ui/EventToast.tsx`, `web/src/ui/EventToastStack.tsx`, dead CSS in `command-tray.css`
- [x] **TD-19** `handleSingleClickUnit` method — never called
  - `web/src/game/phaser/scenes/MapScene.ts:392-419`
- [x] **TD-20** `handleDeselect` in GameShell — duplicate, never used (line 452-454)
  - `web/src/app/GameShell.tsx:452-454`
- [x] **TD-21** `window.testClick`, `selectUnitDirect`, `selectCityDirect` — declared but never assigned
  - `web/src/global.d.ts`, called from `web/src/ui/GameMenuBar.tsx:101,106`
- [x] **TD-22** `terrainDistribution` in `MVP_SCENARIO_CONFIG` — not wired to map generator
  - `src/game/scenarios/mvp.ts:19-30`
- [x] **TD-23** `getTileByKey` + `hasTile` — only used in tests, not production
  - `src/world/map/getTile.ts:17-26`
- [x] **TD-24** Unused type imports in `buildMvpScenario.ts` — `UnitId`, `PrototypeId`, `VillageId`, `FactionId`
  - `src/game/buildMvpScenario.ts:12`
- [x] **TD-25** Unused `rngChance` import in `generateMvpMap.ts`
  - `src/world/generation/generateMvpMap.ts:7`
- [ ] **TD-26** `HexCoord` alias — used in 40+ files, NOT dead
  - `src/types.ts:22` (defer until hex.ts is deleted via TD-31)

## High — Type Safety

- [ ] **TD-27** 67+ `as never` casts in frontend bypass branded type system
  - `GameSession.ts`, `worldViewModel.ts`, `GameController.ts`, `sessionUtils.ts`, etc.
  - Fix: introduce typed map-access helpers like `getUnit(state, id)`
- [x] **TD-28** 6 `as any` casts in `buildMvpScenario.ts` on branded IDs
  - `src/game/buildMvpScenario.ts:264-339` — replaced with proper branded casts
- [x] **TD-29** 3 `as never` casts in `exportReplay.ts` — snapshot types now use branded IDs
  - `src/replay/exportReplay.ts:126,135,146`
- [x] **TD-30** `UnitStats.role` typed as union (`'melee' | 'ranged' | 'mounted'`) instead of `string`
  - `src/features/prototypes/types.ts:10`
- [ ] **TD-31** Dead `hex.ts` still imported by 3 production files — split-brain 6-dir vs 8-dir topology
  - `src/core/hex.ts` imported by `fogSystem.ts`, `citySiteSystem.ts`, `strategic-ai/objectives.ts`
  - Fix: migrate imports to `grid.ts`, delete `hex.ts` + `tests/hex.test.ts`
- [x] **TD-32** `oasis` terrain has no economy yield entry
  - `src/content/base/economy.json` — added oasis entry
- [ ] **TD-33** Summon stats in `signatureAbilities.json` duplicate `chassis.json` — can drift
  - Should reference chassis by ID instead of inlining stats
- [x] **TD-34** `TerrainYieldDef` de-duplicated — registry types now re-export from economy types
  - `src/features/economy/types.ts:17-20` + `src/data/registry/types.ts:122-125`
- [x] **TD-35** `loadRulesRegistry` override loops guard against undefined base entries
  - `src/data/loader/loadRulesRegistry.ts:64-83`

## High — Content Validation

- [ ] **TD-36** No JSON schema validation — content typos silently ignored at load time
  - `src/data/loader/loadRulesRegistry.ts:35-44` — `cloneData(data) as Record<string, X>` bypasses all checks
  - Fix: add runtime validation or JSON schema check during registry load

## High — Structural Issues

- [ ] **TD-37** Phaser renderers destroy+recreate all game objects every frame
  - All renderers in `web/src/game/phaser/systems/` — needs diffing or pooling
- [ ] **TD-38** `GameController.getPlayState()` full recomputation on every state change (including hover)
  - `web/src/game/controller/GameController.ts:258-386`
- [ ] **TD-39** O(units²) transport checks in view model every render
  - `web/src/game/view-model/worldViewModel.ts:155-277`
- [ ] **TD-40** `ContextInspector.tsx` is 777 lines — god component
  - Should decompose into UnitInspector, CityInspector, ProductionPanel, FactionPopup, DomainPopup
- [ ] **TD-41** Faction popup JSX duplicated 3x across `GameMenuBar`, `ContextInspector`, `TopHud`
  - Extract `<FactionInfoPopup>` component
- [ ] **TD-42** 31 props drilled through `ShellContentProps`
  - `web/src/app/GameShell.tsx:73-104` — needs reducer or context for UI panel state
- [ ] **TD-43** `window` global functions for Phaser↔React communication (fragile, partially broken)
  - `web/src/global.d.ts`, `web/src/ui/GameMenuBar.tsx:70-91`
- [ ] **TD-44** `buildMvpScenario` is 296 lines — should extract inner loop
  - `src/game/buildMvpScenario.ts:136-431`
- [ ] **TD-45** 6 near-identical `ensureTerrainNearStart` functions in map generation
  - `src/world/generation/generateMvpMap.ts` — should be one generic function
- [ ] **TD-46** No `React.memo` on any leaf UI component — all re-render on every state change
  - All components in `web/src/ui/`
- [ ] **TD-47** `layoutCamera` recomputes map bounds every frame (should cache)
  - `web/src/game/phaser/scenes/MapScene.ts:274-287`
- [ ] **TD-48** Magic numbers in balance scoring weights
  - `src/balance/objective.ts:46-125` — extract to named constants

## Medium — Test Infrastructure

- [ ] **TD-49** 9 skipped tests — known regressions hidden rather than fixed or tracked
  - `warEcologySimulation.test.ts:107,464,528`, `strategicAi.test.ts:640`, `aiTactics.test.ts:129,155`, `debug_strategy.test.ts:20`, `map.test.ts:194,261`
- [ ] **TD-50** Tautological assertions — `toBeGreaterThanOrEqual(0)` on counters/lengths
  - `combat.test.ts:563`, `warEcologySimulation.test.ts:371`, `balanceHarness.test.ts:76,149-152,184`
- [ ] **TD-51** `trimState()` duplicated 8 times across test files with subtle differences
  - Extract to `tests/helpers/trimState.ts`
- [ ] **TD-52** `makeUnit()` duplicated 5 times with inconsistent shapes
  - Extract to `tests/helpers/makeUnit.ts`
- [ ] **TD-53** 50 separate `loadRulesRegistry()` calls at module scope — should be singleton
  - Extract to `tests/helpers/registry.ts`
- [ ] **TD-54** `Partial<any>` unit construction in 3 test files
  - `zoc.test.ts`, `territory.test.ts`, `opportunityAttack.test.ts`
- [ ] **TD-55** Registry monkey-patching in `opportunityAttack.test.ts` — no cleanup on failure
  - `tests/opportunityAttack.test.ts:212-289`
- [ ] **TD-56** Silent early return in test — `combat.test.ts:157` passes if units don't exist
- [ ] **TD-57** 10,000-iteration Monte Carlo tests in main test run — should be opt-in
  - `tests/learn-kill-verify.test.ts:39-65`
- [ ] **TD-58** `debug_strategy.test.ts` — debug artifact with console.log, should be removed or cleaned
- [ ] **TD-59** No tests for 10+ critical systems: capture, transport, fog, healing, signature abilities, hybrid, morale, combatActionSystem, villageCapture, historySystem
- [ ] **TD-60** `architectureBoundaries.test.ts` — asserts content counts (`terrains.toHaveLength(13)`) that break on any content addition
  - `tests/content.test.ts:27,66`
