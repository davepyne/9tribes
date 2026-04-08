# Research System Dependency Report

**Date**: 2026-04-06  
**Scope**: Full codebase scan of research system dependency web  
**Goal**: Inform redesign to 3 tiers × 7 domains per tribe (21 nodes), with Tier 3 as a faction-altering ability

---

## 1. System Architecture Overview

### 1.1 Core Research Files

| File | Role |
|------|------|
| `src/features/research/types.ts` | `ResearchState`, `ResearchNode` interface definitions |
| `src/systems/researchSystem.ts` | 15 exports: state CRUD, bonus calculations, progress queries |
| `src/data/loader/loadRulesRegistry.ts` | Loads `research.json`, exposes `getResearchNode()` |
| `src/content/base/research.json` | **Content**: 18 nodes in 1 domain (`war_codification`) |

### 1.2 Current Research Content (research.json)

```
Domain: war_codification
└── Tier 1 (8 nodes): codify_woodcraft, codify_horsemanship, codify_poisoncraft,
                       codify_fortification, codify_formation, codify_navigation,
                       codify_endurance, codify_desert_survival
    └── Tier 2 (6 nodes): master_woodcraft, master_horsemanship, master_poisoncraft,
                          master_fortification, master_formation, master_navigation,
                          master_endurance
        └── Tier 3 (3 synthesis nodes): poison_phalanx, amphibious_fortress, eternal_march
```

**Key structural fact**: All 18 nodes live in a **single domain**. The proposed redesign (3 tiers × 7 domains) is a fundamentally different topology — multiple domains each with their own tiered progression, plus Tier 3 nodes that cross domain boundaries.

---

## 2. All 18 QualitativeEffect Types: Definition → Consumption

### 2.1 Complete Map

| Effect | Node | Tier | Doctrine Flag | Consumed By | Status |
|--------|------|------|--------------|-------------|--------|
| `forest_ambush` | `codify_woodcraft` | 1 | `forestAmbushEnabled` | `warEcologySimulation.ts:3737` → `combatSystem.ts:150,199` (first strike from forest) | ✅ Live |
| `forced_march` | `codify_horsemanship` | 1 | `forcedMarchEnabled` | `capabilityDoctrine.ts:81` — **flag set but never read** | ⚠️ Dead flag |
| `poison_persistence` | `codify_poisoncraft` | 1 | `poisonPersistenceEnabled` | `warEcologySimulation.ts:3841` (+1 extra poison stack on hit) | ✅ Live |
| `rapid_entrench` | `codify_fortification` | 1 | `rapidEntrenchEnabled` | `capabilityDoctrine.ts:82` — **flag set but never read** | ⚠️ Dead flag |
| `shield_wall` | `codify_formation` | 1 | `shieldWallEnabled` | `warEcologySimulation.ts:3707–3718` (infantry +30% defense vs ranged, adjacent ally) | ✅ Live |
| `river_crossing` | `codify_navigation` | 1 | `riverCrossingEnabled` | `movementSystem.ts:133–134` (river costs 1 MP instead of 2) | ✅ Live |
| `marching_stamina` | `codify_endurance` | 1 | `marchingStaminaEnabled` | `warEcologySimulation.ts:2947–2948` (ignore first exhaustion point for morale) | ✅ Live |
| `heat_resistance` | `codify_desert_survival` | 1 | **none** | **Not consumed anywhere** | ❌ Dead effect |
| `canopy_cover` | `master_woodcraft` | 2 | `canopyCoverEnabled` | `warEcologySimulation.ts:3724–3728` (ranged +30% defense in forest/jungle) | ✅ Live |
| `hit_and_run` | `master_horsemanship` | 2 | **none** | **Not consumed anywhere** | ❌ Dead effect |
| `contaminate_terrain` | `master_poisoncraft` | 2 | `contaminateTerrainEnabled` | `warEcologySimulation.ts:3853–3858` (killing poisoned enemy contaminates hex) | ✅ Live |
| `zone_of_control_aura` | `master_fortification` | 2 | `zoCAuraEnabled` | `zocSystem.ts:50–63` (dug-in units project ZoC to adjacent hexes, doubling radius) | ✅ Live |
| `stampede2` | `master_formation` | 2 | `elephantStampede2Enabled` | `warEcologySimulation.ts:3834–3836` (elephant knockback = 2 hexes not 1) | ✅ Live |
| `amphibious_assault` | `master_navigation` | 2 | `amphibiousAssaultEnabled` | **Set in capabilityDoctrine but not consumed in any system** | ⚠️ Dead flag |
| `winter_campaign` | `master_endurance` | 2 | `winterCampaignEnabled` | `movementSystem.ts:137–138` (no tundra movement penalty) | ✅ Live |
| `toxic_bulwark` | `poison_phalanx` | 3 | `toxicBulwarkEnabled` | `warEcologySimulation.ts:843–854` (each alive unit deals 1 poison damage/turn to adjacent enemies) | ✅ Live |
| `tidal_walls` | `amphibious_fortress` | 3 | `tidalWallsEnabled` | `warEcologySimulation.ts:3756–3761` (coastal city +50% defense) | ✅ Live |
| `undying` | `eternal_march` | 3 | `undyingEnabled` | `warEcologySimulation.ts:3732–3734` (units below 20% HP gain +50% defense) | ✅ Live |

### 2.2 Architecture Note on Qualitative Effects

The `qualitativeEffect.type` string in JSON is **never directly evaluated at runtime**. Instead, `resolveCapabilityDoctrine()` in `capabilityDoctrine.ts` maps **node IDs** (not effect type strings) to boolean doctrine flags. The coupling is:

```
completed node ID → doctrine boolean flag → game system reads flag
```

The `type` field in JSON is descriptive only. The real coupling key is the **node ID** (e.g., `codify_woodcraft` → `forestAmbushEnabled: true`).

### 2.3 Dead Flag Summary

Four of 18 effects have **zero gameplay impact** today:
- `forced_march` (T1): flag set but never read
- `rapid_entrench` (T1): flag set but never read
- `heat_resistance` (T1): no doctrine flag, no consumer
- `hit_and_run` (T2): no doctrine flag, no consumer

---

## 3. System Dependency Map

### 3.1 Direct Research Consumers

```
researchSystem.ts (242 lines, 15 exports)
├── GameSession.ts               → human startResearch + addResearchProgress + turn auto-start
├── warEcologySimulation.ts      → AI: startResearch + addResearchProgress per tick
├── worldViewModel.ts            → UI: getKnowledgeResearchBonus, getCapabilityResearchBonus,
│                                  getResearchProgressPerTurn (rate breakdown + turn estimates)
├── buildMvpScenario.ts          → createResearchState per faction at game init
└── tests/*                      → fixtures
```

### 3.2 Full Dependency Web

```
RESEARCH STATE (per-faction: activeNodeId, progressByNodeId, completedNodes, unlockedComponents, unlockedChassis)
    │
    ├── RESEARCH SYSTEM (src/systems/researchSystem.ts)
    │   ├── startResearch()       → GameSession.ts (human), warEcologySimulation.ts (AI)
    │   ├── addResearchProgress() → GameSession.ts (human), warEcologySimulation.ts (AI)
    │   └── getResearchProgressPerTurn() → bonus calculation (knowledge + capability)
    │
    ├── CAPABILITY DOCTRINE (src/systems/capabilityDoctrine.ts)
    │   ├── resolveCapabilityDoctrine() — reads completedNodes → 16+ doctrine boolean flags
    │   └── hasCompletedResearchNodes() — gates recipes, chassis, signatures
    │       │
    │       ├── Combat (warEcologySimulation.ts) — 13+ flags consumed
    │       │   ├── forestAmbushEnabled        → combat first-strike from forest
    │       │   ├── shieldWallEnabled          → infantry +30% defense vs ranged
    │       │   ├── poisonPersistenceEnabled  → +1 poison stack on hit
    │       │   ├── contaminateTerrainEnabled → poison contaminates hex on kill
    │       │   ├── toxicBulwarkEnabled        → faction-wide poison aura
    │       │   ├── tidalWallsEnabled         → coastal city +50% defense
    │       │   ├── undyingEnabled            → <20% HP units +50% defense
    │       │   ├── elephantStampede2Enabled  → 2-hex knockback
    │       │   ├── canopyCoverEnabled        → ranged +30% in forest/jungle
    │       │   ├── marchingStaminaEnabled   → ignore first exhaustion
    │       │   ├── canBuildFieldForts        → gates field fort construction
    │       │   └── grantsHillDugIn          → gates hill dug-in
    │       │
    │       ├── Movement (movementSystem.ts)
    │       │   ├── riverCrossingEnabled → river costs 1 MP (not 2)
    │       │   └── winterCampaignEnabled → no tundra penalty
    │       │
    │       ├── ZoC (zocSystem.ts)
    │       │   └── zoCAuraEnabled → dug-in units project ZoC 2 hexes out
    │       │
    │       └── GameSession.ts:235 — amphibious_assault gate (naval→land attack)
    │
    ├── AI RESEARCH STRATEGY (src/systems/aiResearchStrategy.ts)
    │   ├── rankResearchPriorities() — scores by posture, synergy, unlocks, synthesis
    │   ├── chooseStrategicResearch() — picks + "sticky" behavior for balanced/offensive
    │   └── scoreImmediateUnlocks() — projects research completions → component/chassis/recipe availability
    │
    ├── SACRIFICE SYSTEM (src/systems/sacrificeSystem.ts)
    │   └── autoCompleteResearchForDomains() — sacrifices unit → auto-completes nodes whose
    │       codifies[] matches learned domains → applies capabilityBonus
    │
    ├── KNOWLEDGE/LEARNING (src/systems/knowledgeSystem.ts)
    │   ├── getKnowledgeResearchBonus() → +1/turn per foreign learned domain (cap 2)
    │   ├── getEffectiveResearchXpCost() → 25% XP discount when any foreign domain learned
    │   └── gainExposure() sources: bordering (3/turn), combat (15/combat), siege capture (50)
    │
    ├── PROTOTYPE DESIGN (src/design/validatePrototype.ts)
    │   └── hasCompletedResearch() — gates component + chassis assembly
    │
    ├── SIGNATURE ABILITIES (warEcologySimulation.ts:1748–1760)
    │   └── applySummonAbility() — blocks summon if requiredResearchNodes not all completed
    │
    ├── PRODUCTION GATES
    │   ├── components.json (21 entries with requiredResearchNodes)
    │   ├── hybrid-recipes.json (18 entries with requiredResearchNodes)
    │   ├── chassis.json (10 entries with requiredResearchNodes)
    │   └── signatureAbilities.json (4 factions with requiredResearchNodes)
    │
    └── UI LAYER
        ├── worldViewModel.ts → builds ResearchNodeViewModel[] for client
        ├── GameSession.ts → applyStartResearch, applyCancelResearch, resolveFactionResearch
        └── ResearchTree.tsx / ResearchNode.tsx → renders 3-tier grid with SVG connections
```

---

## 4. qualitativeEffect Type Inventory

*(Section 2 above contains the full table. Summary: 18 total, 13 live, 2 dead flags, 2 dead effects)*

---

## 5. Research → Other System Connections

### 5.1 Capability System
- **`capabilityDoctrine.ts:36–95`**: `resolveCapabilityDoctrine()` maps **node IDs** → doctrine flags. It does NOT read `qualitativeEffect.type` strings — the coupling is via node IDs.
- **`capabilityDoctrine.ts:36–43`**: `hasCompletedResearchNodes()` used to gate hybrid recipe assembly and AI unlock projections.
- **AI scoring** (`aiResearchStrategy.ts:134–147`): Nodes whose `unlocks` match the faction's signature unit type get +3 score.

### 5.2 Production System
- **21 components** with `requiredResearchNodes` in `components.json`
- **18 hybrid recipes** with `requiredResearchNodes` in `hybrid-recipes.json`
- **10 chassis** with `requiredResearchNodes` in `chassis.json`
- **`validatePrototype.ts`**: Validates chassis + component research prerequisites before assembly. Uses `hasCompletedResearch()` helper.

### 5.3 Combat
- 13 of 16 doctrine flags are consumed in `warEcologySimulation.ts` for combat effects.
- `combatSystem.ts:150,199`: `forestFirstStrike` boolean from `forestAmbushEnabled`.
- Synergies are tag-based, not research-gated, but `aiResearchStrategy.ts:38,125` scores nodes whose `codifies` domains would create synergy pairs.

### 5.4 Knowledge/Learning
- **XP discount**: 25% off any node's cost if faction has ≥1 foreign learned domain (`getEffectiveResearchXpCost`).
- **Rate bonus**: +1/turn per foreign domain, capped at +2 (`getKnowledgeResearchBonus`).
- Sources of learned domains: initial (native domain), exposure gain, sacrifice, siege capture.
- **Knowledge system does NOT read completed research nodes** — it is purely exposure-driven.

### 5.5 Sacrifice/Codification System
- **`sacrificeSystem.ts:149–201`**: `autoCompleteResearchForDomains()` iterates ALL research nodes; for any node where `node.codifies[]` includes a domain the unit knew, auto-completes it if prerequisites are met.
- Also applies `node.capabilityBonus` to faction domain levels.
- This means ANY node with a `codifies` array can be auto-completed via sacrifice — regardless of tier.

### 5.6 AI
- **`aiResearchStrategy.ts`**: 9 scoring factors: early research bias (+3), posture alignment (+2–4), synergy/exposure goals (+2–2.5), signature unit (+3), immediate unlocks (+1.5/+2), synthesis progress (+4), knowledge bonus efficiency, unlock breadth (+1.25), cost penalty.
- Sticky research for balanced/offensive postures (won't switch mid-progress).
- `scoreSynthesisProgress()` gives +4 to a node that is the **second prerequisite** for a T3 synthesis node.

### 5.7 Signature Abilities
- 4 factions have signature summon abilities gated on research (`signatureAbilities.json`):
  - `frost_wardens` → `codify_endurance`
  - `jungle_clan` → `master_poisoncraft`
  - `steppe_clan` → `codify_horsemanship`
  - `plains_riders` → `master_navigation`
- Gate check in `warEcologySimulation.ts:1748–1760`: if any required node not completed, summon is blocked and no cooldown starts.

---

## 6. Scope Assessment

### 6.1 Files Requiring Changes

| File | Change Type | Risk |
|------|-----------|------|
| `src/content/base/research.json` | **Rewrite content** — 21 nodes across 7 domains instead of 18 in 1 | High — all node IDs change |
| `src/systems/capabilityDoctrine.ts` | **Hard-code update** — `resolveCapabilityDoctrine()` has 15+ specific node ID checks | **Critical** — if node IDs change, doctrine flags break silently |
| `src/data/registry/types.ts` | **Type update** — `ResearchDomainDef` must support multiple domains with `nodes` | Medium — new field structure |
| `src/content/base/components.json` | **Update 21 `requiredResearchNodes`** — IDs must match new research nodes | High — if IDs change, components become unbuildable |
| `src/content/base/hybrid-recipes.json` | **Update 18 `requiredResearchNodes`** — IDs must match | High |
| `src/content/base/chassis.json` | **Update 10 `requiredResearchNodes`** — IDs must match | High |
| `src/content/base/factions/*.json` | **Update signature ability `requiredResearchNodes`** | Medium |
| `src/systems/aiResearchStrategy.ts` | **Potential update** — scoring factors may need adjustment for multi-domain | Medium |
| `src/systems/researchSystem.ts` | **Likely stable** — core API unchanged, only data changes | Low |
| `web/src/ui/ResearchTree.tsx` | **Structural update** — currently renders 1 domain in 3-tier grid; needs multi-domain support | Medium |
| `web/src/ui/ResearchNode.tsx` | **Likely stable** — component rendering is data-driven | Low |
| `src/systems/sacrificeSystem.ts` | **Stable** — dynamically reads `codifies[]`, not node IDs | Low |
| `src/systems/knowledgeSystem.ts` | **Stable** — no node ID references | Low |
| `src/design/validatePrototype.ts` | **Stable** — reads `completedNodes`, not node IDs directly | Low |
| `src/game/buildMvpScenario.ts` | **Stable** — calls `createResearchState()`, no node IDs | Low |
| `tests/content.test.ts` | **Update** — `getResearchNode()` tests use specific IDs | Medium |
| `tests/strategicAi.test.ts` | **Update** — AI strategy tests use specific node IDs | Medium |
| `tests/capabilityDoctrine.test.ts` | **Update** — doctrine resolution tests push specific node IDs | Medium |

**Estimated source files requiring changes: 15–18 out of ~50 research-adjacent files.**

### 6.2 Hard Dependencies (Cannot Break)

1. **`capabilityDoctrine.ts:52–95`** — `resolveCapabilityDoctrine()` has **hardcoded node ID strings** (e.g., `codify_woodcraft`, `master_poisoncraft`). If these IDs change, all 13+ live qualitative effects will silently stop working. This is the most critical dependency.

2. **`components.json` / `hybrid-recipes.json` / `chassis.json`** — `requiredResearchNodes` arrays gate production. If a component's required node ID doesn't exist, the component becomes permanently unbuildable for that faction.

3. **`signatureAbilities.json`** — `requiredResearchNodes` gates summoning. If research IDs change, factions lose their signature ability with no indication to the player.

4. **`aiResearchStrategy.ts`** — scoring uses node IDs to project unlocks (`scoreImmediateUnlocks()`). If ID structure changes, AI scoring logic could misfire or break entirely.

### 6.3 Risk Level: **HIGH**

The research system's coupling is **type-string-based** throughout. Changing a single node ID breaks chains at:
- Doctrine flag resolution (silent failure — no error, just missing effects)
- Production gating (component becomes permanently locked)
- Signature ability gating (faction loses summon)
- AI scoring (bad decisions)

---

## 7. Qualitative Effects: Implemented vs Placeholder

*(See Section 2.3 for the dead flag summary)*

| Category | Count |
|----------|-------|
| Fully implemented (flag + consumer) | 13 |
| Flag set but never consumed | 2 (`forced_march`, `rapid_entrench`) |
| No flag, no consumer | 2 (`heat_resistance`, `hit_and_run`) |

---

## 8. Dead Code Discovery

| Function | File | Status |
|----------|------|--------|
| `advanceResearch()` | `researchSystem.ts:119` | **Dead** — exported but never imported/called in any source file |
| `isNodeCompleted()` | `researchSystem.ts:138` | **Dead** — exported but never imported/called in any source file |
| `isComponentUnlocked()` | `researchSystem.ts:148` | **Dead** — exported but never imported/called in any source file |
| `isChassisUnlocked()` | `researchSystem.ts:158` | **Dead** — exported but never imported/called in any source file |
| `getResearchProgress()` | `researchSystem.ts:168` | **Dead** — exported but never imported/called in any source file |
| `getResearchRate()` | `researchSystem.ts:185` | **Dead** — getter set but never called externally; value computed dynamically |

---

## 9. Proposed Simplification Approach

### 9.1 The Core Challenge

The proposed model (**3 tiers × 7 domains per tribe = 21 nodes per tribe**) is structurally different from today:

- **Today**: 1 domain, 18 nodes, 3 tiers — T3 nodes cross-reference T2 nodes within the same domain
- **Proposed**: 7 domains × 3 tiers, each domain self-contained — T3 nodes must still cross-reference (a Tier 3 faction-altering ability must still require T2 nodes from specific domains)

The key complexity is **Tier 3 as a faction-altering ability** — this means T3 nodes in the new model should be:
1. Cross-domain (requiring T2 from multiple domains)
2. Powerful enough to fundamentally alter faction playstyle
3. The "goal" of the research tree

### 9.2 Safest Approach: Phased Migration

**Phase 1 — Parallel Content authoring (no code changes)**
- Author the new `research.json` with 7 domains × 3 tiers = 21 nodes per tribe
- Keep the SAME node IDs wherever possible (e.g., keep `codify_poisoncraft` if it maps to domain 1's T1 node)
- Map new T3 nodes to the same doctrine flags if effects are equivalent
- This is pure content work, zero risk to systems

**Phase 2 — Update doctrine resolution (highest risk, isolated change)**
- Update `capabilityDoctrine.ts:52–95` to use the NEW node IDs
- This is the single most dangerous change — if it breaks, qualitative effects silently stop
- **Mitigation**: Write integration tests that assert each doctrine flag is `true` after completing the corresponding node
- **Do not proceed to Phase 3 until Phase 2 is test-covered**

**Phase 3 — Update production gates (JSON changes only)**
- Update `components.json`, `hybrid-recipes.json`, `chassis.json`, `signatureAbilities.json`
- Replace old `requiredResearchNodes` IDs with new equivalents
- This is mechanical find/replace, low code risk

**Phase 4 — Update AI scoring (adjust, don't rewrite)**
- `aiResearchStrategy.ts` scoring factors (posture alignment, synthesis proximity, unlock breadth) are generic enough to survive node ID changes
- The `scoreSynthesisProgress()` factor will need updating to reference new T3 node IDs and their new prerequisites
- `scoreImmediateUnlocks()` reads `unlockedComponents/chassis` via registry — should survive if registry changes are complete

**Phase 5 — UI adaptation (lowest risk)**
- `ResearchTree.tsx` currently renders 1 domain in a fixed 3-tier grid
- With 7 domains, consider: tabbed UI (one tab per domain) or a domain-selector dropdown
- `ResearchNode.tsx` is purely data-driven and should not need changes
- `worldViewModel.ts` builds `ResearchNodeViewModel[]` from registry — should survive if data changes are complete

### 9.3 Key Principles for Safe Migration

1. **Never delete a node ID — deprecate it**: If a node ID changes, add a mapping so old saves still deserialize correctly. The serialization layer (`playState.ts`) stores `ResearchState` which includes `completedNodes` as node ID arrays.

2. **Test doctrine resolution first**: `resolveCapabilityDoctrine()` must be covered by unit tests for every node before any production JSON is touched.

3. **Preserve the sacrifice/codification path**: `sacrificeSystem.ts` dynamically reads `codifies[]` — this is the safest part of the system and should remain stable. New nodes just need `codifies` fields if they should be auto-completable.

4. **Maintain the 3-tier structure for AI scoring**: The AI's `scoreSynthesisProgress()` gives +4 to nodes that complete a T3 prerequisite pair. This structure must be preserved even if domains change. T3 should always be reachable only via T2 prerequisites.

5. **Leverage the knowledge discount system**: The 25% XP discount for learning foreign domains is a powerful existing mechanic. A 7-domain model makes this more meaningful — players can learn 1–2 foreign domains for +1–2 research/turn bonus.

---

## 10. Summary

| Dimension | Current | Proposed |
|-----------|---------|----------|
| Nodes | 18 in 1 domain | 21 in 7 domains |
| Tiers | 3 | 3 |
| Domains | 1 (`war_codification`) | 7 |
| Qualitative effects | 18 (13 live, 5 dead/placeholder) | 21 |
| T3 mechanics | Synthesis (cross-domain prerequisites) | Faction-altering abilities |
| Dead code | 4 exports in `researchSystem.ts` | TBD |
| Hardest change | `capabilityDoctrine.ts` hardcodes node IDs | `capabilityDoctrine.ts` + all JSON content files |
| Total files needing updates | — | ~15–18 source files |

**The critical risk is the hardcoded node ID → doctrine flag mapping in `capabilityDoctrine.ts:52–95`**. Everything else flows from `completedNodes` and is either data-driven or generic enough to adapt. Phase 2 (doctrine update) is the only place where a bug would be silent — effects would simply stop working.

**Recommendation**: Author the new content first (Phase 1), update doctrine with tests (Phase 2), then update JSON production gates (Phase 3). This keeps the highest-risk change isolated and verifiable before the full migration.
