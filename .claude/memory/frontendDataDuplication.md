---
name: frontendDataDuplication
description: RESOLVED — three tiers of frontend data duplication eliminated via cross-boundary imports, shared constants, and GameState-stored ecology
type: project
originSessionId: 64035bca-210b-45fc-be0f-52580fc47def
---
## Frontend Data Duplication — RESOLVED (2026-05-13)

Three tiers of duplication between `src/` (backend) and `web/` (frontend) have been eliminated on branch `refactor/data-duplication-elimination`.

### Phase 0 — JSON file duplication (eliminated)
All UI components that imported from `web/src/data/*.json` now import directly from `src/content/base/*.json` via cross-boundary imports. 8 duplicate JSON files deleted. 13+ files updated.

### Phase 1 — Domain display constants (consolidated)
Created `web/src/data/domainMeta.ts` as the single source for `DOMAIN_IDS`, `DOMAIN_COLORS`, `DOMAIN_ICONS`, `DOMAIN_NAMES`. SynergyChip.tsx, SynergyEncyclopediaTab.tsx, and ResearchTree.tsx all import from it. ResearchTree retains its intentional short-name overrides.

### Phase 2 — Ecology computation (moved to GameState)
Added `ecologyBonusesThisTurn` and `ecologyBreakdownThisTurn` to `ResearchState`. Populated during the ecology pass in `factionTurnEffects.ts`. The view model (`researchInspectorViewModel.ts`) reads from GameState instead of reimplementing computation logic. ~100 lines of duplicated game logic deleted from the frontend. Resets at start of each faction turn alongside combat accumulators.

### Why it mattered
The monorepo had two independent build pipelines with no shared module boundary, leading to content copies and scattered display constants that diverged over time.

### How to apply
When adding new domain display data, add it to `web/src/data/domainMeta.ts`. When adding new turn-computed data that the frontend needs, store it in GameState during the turn loop and read it from the view model — don't reimplement the computation on the frontend side.
