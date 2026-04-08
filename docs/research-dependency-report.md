# Research System Dependency Report

## Overview

The research system is referenced across **23 source files + 3 test files**. Simplifying it from its current form (9+ capability-gated trees, ~18 nodes, 3 tiers with prerequisites and component/chassis unlocks) to a simpler structure (3 tiers × 7 domains per tribe, 21 nodes) requires updating all downstream consumers.

---

## Data Flow

```
JSON Content (ResearchNodeDef)
    ↓ loaded by loadRulesRegistry.ts
RulesRegistry.getResearchNode()
    ↓ consumed by
researchSystem.ts ──→ ResearchState (completedNodes, activeNodeId)
    ↓ read by
capabilityDoctrine.ts ──→ combat effects (30+ boolean flags)
aiResearchStrategy.ts ──→ auto-select next node
sacrificeSystem.ts ──→ auto-complete matching nodes
warEcologySimulation.ts ──→ summoning gates
worldViewModel.ts ──→ ResearchNodeViewModel
    ↓ rendered by
ResearchTree.tsx / ResearchNode.tsx
```

---

## Core Research System

**File:** `src/systems/researchSystem.ts` (242 lines, 15 exports)

| Category | Functions | Purpose |
|---|---|---|
| State management | `createResearchState`, `startResearch`, `addResearchProgress`, `advanceResearch` | Create/modify research state |
| Queries | `isNodeCompleted`, `isComponentUnlocked`, `isChassisUnlocked`, `getResearchProgress`, `isResearching`, `getResearchRate`, `setResearchRate` | Read-only checks |
| Bonus calculations | `getKnowledgeResearchBonus`, `getCapabilityResearchBonus`, `getResearchProgressPerTurn`, `getEffectiveResearchXpCost` | Rate/cost modifiers from knowledge & capabilities |

---

## Downstream Consumers

| File | Functions Used | System Connection |
|---|---|---|
| `web/…/worldViewModel.ts` | `getEffectiveResearchXpCost`, `getKnowledgeResearchBonus`, `getCapabilityResearchBonus`, `getResearchProgressPerTurn` | UI layer — read-only display |
| `web/…/GameSession.ts` | `startResearch`, `addResearchProgress`, `getEffectiveResearchXpCost`, `getResearchProgressPerTurn` | Human player controller |
| `src/…/warEcologySimulation.ts` | `startResearch`, `addResearchProgress` | AI simulation loop |
| `src/…/buildMvpScenario.ts` | `createResearchState` | Game initialization |
| `src/…/capabilityDoctrine.ts` | `hasCompletedResearchNodes`, `resolveCapabilityDoctrine` | **30+ hardcoded node-ID → boolean flag mappings** |
| `src/…/aiResearchStrategy.ts` | `rankResearchPriorities`, `chooseStrategicResearch`, `scoreImmediateUnlocks` | AI research decisions |
| `src/…/sacrificeSystem.ts` | `ResearchNodeId`, auto-complete matching nodes via `codifies` field | Sacrifice/codification mechanic |
| `src/…/movementSystem.ts` | Reads doctrine booleans for river_crossing, winter_campaign | Movement modifiers |
| `src/…/zocSystem.ts` | Reads doctrine boolean for zone_of_control_aura | Zone of control projection |
| `web/…/ResearchTree.tsx` | Renders 3-tier grid with SVG connections | UI research tree |
| `web/…/ResearchNode.tsx` | Renders single node card with progress | UI node component |

---

## Qualitative Effects — Implementation Status

| Status | Count | Effect Types |
|---|---|---|
| ✅ Fully implemented | 13 | `forest_ambush`, `poison_persistence`, `shield_wall`, `river_crossing`, `marching_stamina`, `canopy_cover`, `contaminate_terrain`, `zone_of_control_aura`, `stampede2`, `amphibious_assault`, `winter_campaign`, `toxic_bulwark`, `tidal_walls`, `undying` |
| ⚠️ Flag exists, never consumed | 2 | `forced_march`, `rapid_entrench` |
| ❌ No flag, no consumption | 2 | `heat_resistance`, `hit_and_run` |

### Critical Architecture Note

The `qualitativeEffect.type` field (e.g., `"forest_ambush"`) is **never directly evaluated at runtime by type-string lookup**. Instead, `resolveCapabilityDoctrine()` in `capabilityDoctrine.ts` maps **completed research node IDs** to boolean flags, and game systems check those booleans. The coupling is `nodeId → boolean`, not `effect type → handler`.

**This means you cannot just rename nodes without updating `capabilityDoctrine.ts`.**

---

## The 5 Hardest Dependencies to Untangle

### 1. `capabilityDoctrine.ts` — 30+ hardcoded node-ID checks
The spider in the web. Maps specific research node completions to combat booleans. Simplifying research means rewriting this entire file. Each node ID like `codify_woodcraft`, `master_formation`, `poison_phalanx` is individually checked.

### 2. `aiResearchStrategy.ts` — Complex scoring heuristics
Has 8+ scoring factors: early research bias, posture alignment, synergy with hybrid goals, signature unit support, tier 3 synthesis proximity, knowledge discount efficiency, unlock count vs. cost. All assume the current multi-tier structure.

### 3. `sacrificeSystem.ts` — Auto-completes research nodes
Uses the `codifies` field on `ResearchNodeDef` to find nodes matching sacrificed domains. If we change the tree structure, sacrifice needs updated `codifies` mappings.

### 4. Production gates — `components.json` + `hybrid-recipes.json`
21+ occurrences each. Both use `requiredResearchNodes` to gate availability. Changing node IDs breaks these references.

### 5. Signature abilities — Faction summoning mechanics
Gated behind `requiredResearchNodes`. Removing/renaming nodes could unlock summoning prematurely.

---

## Content Files That Need Updates

| File | Changes Needed |
|---|---|
| `src/content/base/research.json` | Complete rewrite — new simple tree structure |
| `src/content/base/components.json` | Update `requiredResearchNodes` on 21+ components |
| `src/content/base/hybrid-recipes.json` | Update `requiredResearchNodes` on 21+ recipes |
| `src/content/base/factions/*.json` | Update `requiredResearchNodes` on signature abilities |

---

## Feasibility Assessment

- **Risk level:** Moderate
- **Dependency graph:** Deep but NOT circular — data flows one direction
- **Biggest risk:** `capabilityDoctrine.ts` — missing one mapping means a qualitative effect silently stops working
- **Test coverage:** 4 test files reference research (warEcologySimulation, capabilityDoctrine, prototype, strategicAi, content, ids)

---

## Recommended Refactor Order (Safest)

1. **Define new tree structure** — 3 tiers × 7 domains × 9 tribes (design document)
2. **Rewrite `capabilityDoctrine.ts`** — Map new node IDs to same boolean flags
3. **Update `sacrificeSystem.ts`** — New `codifies` mappings for domain → node
4. **Rewrite `aiResearchStrategy.ts`** — Score the simpler tree
5. **Rewrite `research.json`** — New node definitions
6. **Update `components.json` + `hybrid-recipes.json`** — New `requiredResearchNodes` values
7. **Update faction files** — New signature ability gates
8. **Update UI** — `ResearchTree.tsx`, `ResearchNode.tsx`, `worldViewModel.ts`, `clientState.ts`
9. **Update `buildMvpScenario.ts`** — New initialization
10. **Run tests, fix failures, verify qualitative effects still fire**

---

## Design Decisions Needed Before Refactor

1. **Tier 3 per-tribe customization** — How many unique tier 3 nodes? All 9 tribes × 7 domains = 63, or just native domain per tribe = 9 unique?
2. **What happens to current qualitative effects?** Move to tier 3? Keep as-is? Distribute across tiers?
3. **Component/chassis unlocks** — Keep gated behind research, or move to production/economy system?
4. **Capability bonuses on research nodes** — Keep, remove, or fold into the synergy system?
5. **Research rate** — Keep the knowledge/capability bonus calculations, or simplify to a flat rate?
