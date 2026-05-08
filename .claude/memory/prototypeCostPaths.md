---
name: prototypeCostPaths
description: Production costs unified via Prototype.productionCost — single source of truth from chassis.json baseProductionCost or costOverride in content JSON
type: architecture
---
## Cost Unification via Prototype.productionCost (2026-05-08)

**Single source of truth:** `prototype.productionCost` is always populated (required field). No more separate cost tables.

**How it gets set during assembly:**
- `assemblePrototype()` in `assemblePrototype.ts` sets: `options.productionCost ?? chassis.baseProductionCost ?? 10`
- Starting units: `civilizations.json` → `costOverride` → `options.productionCost`
- Hybrid recipes: `hybrid-recipes.json` → `costOverride` → `options.productionCost`
- No override: falls back to `chassis.baseProductionCost` from `chassis.json`

**Chassis base costs** are in `src/content/base/chassis.json` as `baseProductionCost` on each chassis entry. The old `UNIT_COSTS` table in productionSystem.ts has been removed.

**Cost resolution flow (all paths unified):**
1. Read `prototype.productionCost` as base cost
2. For unlock prototypes: `calculatePrototypeCost(base, faction, domains)` applies mastery modifier (2x/1.5x/1.2x/1x)
3. For starting/other prototypes: base cost used directly

**Key functions:**
- `getPrototypeQueueCost(prototype)` — reads `prototype.productionCost` (settlers use village cost)
- `getPrototypeEconomicProfile(prototype, registry)` — reads `prototype.productionCost`
- `getPrototypeCost(state, registry, prototypeId)` in sessionUtils — reads `prototype.productionCost`, applies mastery for unlocks
- `getProductionCostForPrototype(prototype, faction)` in aiProductionScoring — reads `prototype.productionCost`, applies mastery for unlocks

**Balance tuning:** Adjust `costOverride` in `civilizations.json` (starting units) or `hybrid-recipes.json` (unlock units). Adjust `baseProductionCost` in `chassis.json` to change the default for all units on that chassis.

**Why:** Fixed 3-way cost split where AI ignored productionCost overrides, player saw different costs than AI, and hardcoded switch in sessionUtils returned different values than UNIT_COSTS table.

**How to apply:** When adding a new unit, set `costOverride` in the content JSON for precise tuning. If omitted, the chassis default from `chassis.json` applies. The balance harness and AI now see the exact same costs the player sees.
