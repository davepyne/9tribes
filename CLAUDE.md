# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

War-Civ V2 is a turn-based strategy simulation focused on how civilizations evolve through war. It is **not** a traditional 4X game — it optimizes for conflict-driven evolution, military identity, emergent behavior, and simple systems that create complex outcomes. The guiding rule: *If a system does not meaningfully affect war, cut it.*

**Core pillars:** Combat drives everything, military identity emerges from terrain/outcomes/doctrines, technology comes from environment+combat (no linear tech trees), units are persistent with history, prototypes over unit tiers (chassis + components).

## Build & Run Commands

```bash
# Backend (TypeScript — src/)
npm run build          # tsc compile
npm run dev            # tsx run main.ts directly

# Frontend (Vite + React + Phaser — web/, separate build)
npm run web:dev        # vite dev server
npm run web:build      # tsc + vite build

# Testing (Vitest, Node environment)
npm test               # vitest run (all tests)
npx vitest run tests/combat.test.ts           # single test file
npx vitest run -t "test name pattern"         # tests matching name

# Balance optimization
npm run balance:harness       # run Optuna balance harness
npm run balance:harness:stratified  # stratified variant
npm run balance:evaluate      # evaluate a balance candidate
npm run balance:validate      # validate balance candidate

# Replay export
npm run replay:export         # export replay data
```

## Architecture

### Monorepo Structure (two build pipelines)

- **`src/`** — Game engine / simulation backend. Pure TypeScript, no framework. Compiles to `dist/`. Entry: `src/main.ts`.
- **`web/`** — Frontend application. Vite + React 18 + Phaser 3. Separate `package.json`, separate TypeScript config. Entry: `web/src/main.tsx`.

### Backend Layering (`src/`)

```
src/core/        → Primitives: grid math (hex.ts, grid.ts), enums, IDs, deterministic RNG (rng.ts)
src/content/base/→ JSON data files: chassis, components, civilizations, terrains, research,
                   synergies, signature abilities, veteran levels, hybrid recipes, etc.
src/data/        → Registry types, content loaders, role/weapon effectiveness tables
src/features/    → Domain entities: units, factions, cities, villages, prototypes, research trees
src/systems/     ~40 rule-execution modules (see below)
src/game/        → GameState types, scenario builders, game loop types
src/world/       → Map generation, terrain types
src/balance/     → Balance evaluation, Optuna objective function, harness integration
src/replay/      → Replay recording/playback
```

### Key Systems (`src/systems/`)

**Central orchestrator:** `warEcologySimulation.ts` — the "god function" that runs one complete turn by activating all units. Has 31 import dependencies; changes cascade everywhere.

**Core gameplay systems:**
| System | Purpose |
|--------|---------|
| `combatSystem.ts` | Attack resolution, counter-attacks, HP mutation |
| `movementSystem.ts` | Path execution, ZoC checks, opportunity attacks, faction identity bonuses |
| `productionSystem.ts` | City production queues, unit/city project creation |
| `siegeSystem.ts` | Wall degradation, city capture mechanics |
| `territorySystem.ts` | Territory control, claimed hexes, supply lines |
| `moraleSystem.ts` | Unit morale changes from events |
| `zocSystem.ts` | Zone of Control rules |
| `opportunityAttackSystem.ts` | Free attacks on units leaving ZoC |

**Identity & progression systems:**
| System | Purpose |
|--------|---------|
| `signatureAbilitySystem.ts` | Faction-specific powers (Frost Nova, Desert Swarm, etc.) |
| `factionIdentitySystem.ts` | Emergent identity from terrain/combat outcomes |
| `veterancySystem.ts` | Unit experience tiers and leveling |
| `xpSystem.ts` | Combat XP gain |
| `researchSystem.ts` | Technology from combat/environment (no linear tree) |
| `knowledgeSystem.ts` | Knowledge tracking and unlocks |
| `capabilityDoctrine.ts` | Doctrine-based capability modifiers |

**Newer systems (recently added):**
| System | Purpose |
|--------|---------|
| `captureSystem.ts` | Slaver mechanic — capture enemy units instead of killing |
| `transportSystem.ts` | Naval transport of land units (galley + infantry) |
| `fogSystem.ts` | Fog of War — per-faction visibility, explored/visible/hidden |
| `healingSystem.ts` | Per-turn healing based on location/faction/synergies |
| `learnByKillSystem.ts` | Units learn enemy ability domains by killing |
| `sacrificeSystem.ts` | Units codify learned abilities into faction research at home city |
| `villageCaptureSystem.ts` | Pirate Greedy trait — capture villages instead of destroying |
| `synergyEngine.ts` + `synergyEffects.ts` | Pair-based faction synergy bonuses |

**AI systems:**
| System | Purpose |
|--------|---------|
| `strategicAi.ts` | High-level AI decisions (production, research, movement priorities) |
| `aiProductionStrategy.ts` | AI production queue management |
| `aiResearchStrategy.ts` | AI research prioritization |
| `aiTactics.ts` | Tactical AI (flanking, positioning) |
| `aiPersonality.ts` | Faction personality profiles |

### Frontend Architecture (`web/src/`)

```
web/src/
├── app/              → React app shell (App.tsx, page/layout components)
├── game/
│   ├── controller/   → GameSession.ts (main controller), GameController.ts
│   ├── types/        → Client state types, world view types, play state types
│   ├── view-model/   → worldViewModel.ts (UI state model, sprite key resolution)
│   └── phaser/
│       ├── scenes/   → MapScene.ts (main Phaser scene)
│       ├── systems/  → UnitRenderer.ts, FogRenderer.ts, CombatAnimator.ts
│       └── assets/   → Texture keys, asset manifest (39 playtest sprites)
├── data/             → JSON content copied from src/content/base/
├── ui/               → React UI components (HUD, inspectors, modals, overlays)
└── styles.css        → Global styles
```

**Sprite system:** 39 unique faction-unit sprites in `web/public/assets/playtest-units/`. Naming: `{faction}_{unit}.png`. Display size 48×64, yOffset 8. Resolution order: sourceRecipeId → special chassisId → faction+chassisId lookup.

### Data Flow

1. **Content JSON files** (`src/content/base/`) define all game entities
2. **Systems** read content via RulesRegistry and operate on GameState
3. **warEcologySimulation.ts** orchestrates all systems per turn
4. **Frontend GameSession** calls systems for player actions and renders via Phaser + React

### Deterministic Simulation

The engine uses deterministic RNG (`src/core/rng.ts`) for reproducible simulations. Tests use seeded RNG states. The balance harness runs thousands of simulations to evaluate parameter candidates via Optuna.

## Code Conventions

- **TypeScript strict mode**, ES2022 target, ESNext modules
- **Data-driven design**: Game content defined in JSON, loaded at runtime via registry pattern
- **Pure-ish systems**: Most systems take GameState + inputs → return updated GameState. Side effects are documented in each system's contract (see codemap.md).
- **TransportMap and FogState are external**: These are NOT part of GameState — callers must manage them separately.
- **History entries**: Many systems write to `unit.history[]` or `faction.history[]` for event tracking (e.g., capture cooldowns tracked via history entries, not dedicated counters).
- **Tests** use fixtures from `tests/fixtures/` and seed RNG for determinism

## Navigation

Read `codemap.md` for detailed per-system contracts (inputs/outputs/invariants/callers). It is auto-generated by the cartography-v2 skill and kept current.

For structured symbol/import data, check `.slim/symbols.json` and `.slim/imports.json` (generated by cartography-v2).

## Sound Effects

Gameplay sound effects are centralized in `web/src/app/audio/sfxManager.ts`.

Use this flow when adding a new sound:
- Put the browser-loadable asset under `web/public/assets/audio/sfx/`.
- Add the file path and playback mapping in `web/src/app/audio/sfxManager.ts`.
- If the sound is tied to combat initiation, trigger it from the React/Phaser bridge in `web/src/app/GameShell.tsx` using the pending attacker.
- If the sound is tied to a gameplay event outside combat, prefer driving it from state-delta detection in `web/src/app/audio/sfxManager.ts` instead of scattering `new Audio(...)` calls across the codebase.
- If the UI does not currently expose enough information to detect the event, add a small feedback field in `web/src/game/controller/GameSession.ts` and pass it through `web/src/game/controller/GameController.ts` into `playFeedback`.

Current pattern:
- Combat sounds are selected from the attacking unit during the 2-second battle animation.
- Non-combat sounds are inferred from play-state changes such as movement, city founding/capture, sacrifice, learned domains, research completion, unit capture, and victory/defeat.
