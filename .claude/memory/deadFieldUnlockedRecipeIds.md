---
name: Dead Field unlockedRecipeIds
description: unlockedRecipeIds was initialized to [] but never written to, blinding the strategic AI and balance harness to hybrid recipe unlocks
type: trap
created: 2026-04-28
updated: 2026-04-28
---
## Fact Or Decision
When adding state-tracking fields to CapabilityState or similar, any field that is only initialized but never mutated is a dead field. The hybrid recipe unlock path (hybridSystem.ts unlockHybridRecipes) created prototypes and added them to faction.prototypeIds but never updated faction.capabilities.unlockedRecipeIds.

## Why
This pattern is easy to miss because:
1. The type definition exists and compiles fine
2. The real work (prototype creation) succeeds, creating a false sense of correctness
3. Downstream consumers (strategicAi.ts buildHybridGoal, balanceHarness) silently degrade rather than crash

## How To Apply
When adding a new tracking field to game state:
- Verify the WRITE path exists, not just the type and initialization
- Grep for all readers of the field and confirm they can receive data
- The balance harness is a good smoke test - if a metric is always 0, suspect a dead field

## Staleness Triggers
- hybridSystem.ts unlockHybridRecipes
- capabilitySystem.ts createCapabilityState
- src/features/factions/types.ts CapabilityState
