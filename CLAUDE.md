# CLAUDE.md

This file provides guidance to AI agents working in this repository.

## Project Overview

**Formerly "War-Civ V2"** (also seen as `war-civ-v2`, `war-civ-2`, or `War-Civ-2` in source comments, config, and scripts). The project was renamed to **9 Tribes** — these are the same codebase.

9 Tribes is a turn-based strategy simulation focused on how civilizations evolve through war. It is **not** a traditional 4X game — it optimizes for conflict-driven evolution, military identity, emergent behavior, and simple systems that create complex outcomes. The guiding rule: *If a system does not meaningfully affect war, cut it.*

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

## Monorepo Structure (two build pipelines)

- **`src/`** — Game engine / simulation backend. Pure TypeScript, no framework. Compiles to `dist/`. Entry: `src/main.ts`.
- **`web/`** — Frontend application. Vite + React 18 + Phaser 3. Separate `package.json`, separate TypeScript config. Entry: `web/src/main.tsx`.

## Codebase Navigation

This repo has 56+ system modules across `src/systems/` with deep cross-cutting dependencies. Rather than guessing where things live or grepping broadly, use the auto-generated structured data in `.slim/` to narrow your search before reading source files. This is faster than grep for "how does X connect to Y" questions and stays current automatically via the cartography-v2 skill.

1. **`.slim/symbols.json`** — every export: name, kind, line number, signature
2. **`.slim/imports.json`** — bidirectional dependency graph (imports + importedBy)
3. **`.slim/digest.md`** — rolling changelog of recent architectural changes
4. **`codemap.md`** — per-system contracts (inputs/outputs/side effects/invariants/callers). Auto-updated by the cartography skill when source files change.

When to use which:
- "What does this file export?" → look up the file in symbols.json
- "Who calls this function?" → search imports.json for the name in `importedBy`
- "What's the blast radius of changing X?" → trace `importedBy` transitively
- "What changed recently?" → read digest.md
- "What are the invariants for this system?" → read codemap.md

To refresh after code changes:
```bash
python3 ~/.openclaw-autoclaw/skills/cartography-v2/scripts/cartographer.py changes --root ./
python3 ~/.openclaw-autoclaw/skills/cartography-v2/scripts/cartographer.py extract --root ./ --changed-only
python3 ~/.openclaw-autoclaw/skills/cartography-v2/scripts/cartographer.py digest --root ./ --output .slim/digest.md
python3 ~/.openclaw-autoclaw/skills/cartography-v2/scripts/cartographer.py update --root ./
```

## Grid System

The map uses a **hex grid** (6-directional, pointy-top axial coordinates) defined in `src/core/grid.ts`. Coordinate type is `TileCoord { q, r }`. Key exports: `getNeighbors` (6 hex neighbors), `hexDistance`, `getHexesInRange`, `getDirectionIndex`, `getOppositeDirection` (offset +3 mod 6). Screen projection: `x = (q-r)*HALF_W`, `y = (q+r)*HALF_H`.

## Combat Architecture

Both the AI path and the player path converge on a **single shared function**: `applyCombatAction()` in `src/systems/combat-action/apply.ts`. All post-combat mechanics live there exclusively.

| Path | Orchestration | Calls |
|------|---------------|-------|
| AI/Autonomous | `activateUnit()` in `src/systems/unit-activation/activateUnit.ts` | `previewCombatAction()` → `applyCombatAction()` |
| Player-facing | `GameSession.ts` — `resolveAttack()` then `applyResolvedCombat()` | `previewCombatAction()` → `applyCombatAction()` |

**When adding a new combat mechanic:** implement it inside `applyCombatAction()` (or `previewCombatAction()` for modifiers). Both paths call these functions, so no manual duplication is needed.

**What differs between paths (intentionally):**
- AI passes `learnChanceScale=2` (double learn-by-kill chance)
- Player path adds animation delay between preview and apply
- Player path adds UI feedback (combat log, enemy synergy intel tracking, siege state rendering)
- Combat now also applies an ecology research bonus (`applyCombatResearchBonus`) — combat against a faction whose native domain you've learned gives +1 XP to that domain's next research node

## Research & Ecology System

Research progresses via two parallel tracks:

1. **Directed research** — faction chooses an active research node, gets base `researchPerTurn` XP (default 1).
2. **Ecology research** — automatic passive XP each turn based on terrain and proximity. Runs in `applyEcologyResearchPass()` inside `factionTurnEffects.ts`.

Ecology bonuses are computed per learned domain:
- **Terrain bonus**: units and city territory on affinity terrain generate XP (see `DOMAIN_TERRAIN_AFFINITY` and `TERRAIN_RESEARCH_BONUS` in `factionTurnEffects.ts`). Rarer terrain = more XP per hex. Capped at `MAX_RESEARCH_TERRAIN_BONUS` (5) per domain.
- **Proximity bonus**: units within hex distance 2 of enemy units whose faction's native domain matches a learned domain get +0.5 XP per contact.
- **Combat bonus**: each combat action grants +1 XP to the combat target's native domain (if learned). Applied in `applyCombatAction()`.

Key functions in `researchSystem.ts`: `addResearchProgressToNode()` (ungated progress, used by ecology), `getNextResearchNodeForDomain()` (finds next incomplete tier T1→T2→T3). Directed research uses `addResearchProgress()` which requires `activeNodeId`.

UI ecology fields live on `ResearchNodeViewModel` in `web/src/game/types/clientState.ts` and are computed in `web/src/game/view-model/inspectors/researchInspectorViewModel.ts`.

## Code Conventions

- **TypeScript strict mode**, ES2022 target, ESNext modules
- **Data-driven design**: Game content defined in JSON, loaded at runtime via registry pattern
- **Pure-ish systems**: Most systems take GameState + inputs → return updated GameState. Side effects are documented in each system's contract (see codemap.md).
- **External state**: `FogState` and `TransportMap` are NOT part of GameState — callers must manage them separately.
- **History arrays as state**: Many systems write to `unit.history[]` or `faction.history[]` for event tracking (e.g., capture cooldowns tracked via history entries, not dedicated counters).
- **Deterministic RNG** (`src/core/rng.ts`) for reproducible simulations. Tests use seeded RNG states.
- **Tests** use fixtures from `tests/fixtures/` and seed RNG for determinism

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
