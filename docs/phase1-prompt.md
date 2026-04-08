[Context]: We are redesigning the research system for war-civ-v2. The full design is in docs/research-redesign.md — READ IT FIRST. This is Phase 1 of 4.

[Phase 1: Backend Foundation — Types + Research Data + Core System]

Consult @oracle for the implementation. This phase establishes the data model that everything else depends on.

What to do:

1. **Read** docs/research-redesign.md for the full design context.

2. **Update types:**
   - `src/features/research/types.ts`: Update ResearchNode — remove `requiredCapabilities`, `capabilityBonus`, add `domain: string` field. Keep: id, name, tier, xpCost, prerequisites (still T1→T2→T3 within domain), unlocks, qualitativeEffect. Add `isNative: boolean` and `isLocked: boolean` fields.
   - `src/data/registry/types.ts`: Update `ResearchNodeDef` — add `domain: string`, remove `requiredCapabilities` and `capabilityBonus`. Keep `codifies` for sacrifice mapping.
   - `src/types.ts`: Keep `ResearchNodeId` as-is.

3. **Rewrite `src/content/base/research.json`:**
   Structure: one top-level domain object per synergy domain (10 domains), each containing 3 tier nodes.
   
   For now, create the FULL 30-node tree. Use the effect descriptions from the design doc:
   - Tier 1 effects (docs/research-redesign.md, 'Tier 1 Effects' section)
   - Tier 2 effects (docs/research-redesign.md, 'Tier 2 Effects' section)
   - Tier 3 effects — for now use the 'Shared Tier 3' effects from the design doc for ALL tribes. We'll add tribe-unique T3 in a later phase.
   
   Node ID convention: `{domain}_t1`, `{domain}_t2`, `{domain}_t3` (e.g., `venom_t1`, `fortress_t2`, `charge_t3`)
   Prerequisites: t2 requires t1, t3 requires t2 (within same domain only)
   xpCost: t1=0 (free via sacrifice/native), t2=60, t3=100
   Each node should have a `codifies` field mapping to the domain (for sacrifice auto-completion)
   Each node should have a `qualitativeEffect` with type, description, and effect object
   
   IMPORTANT: Preserve the existing qualitativeEffect type strings that are already consumed by capabilityDoctrine.ts (forest_ambush, poison_persistence, shield_wall, etc.). Map the new Tier 2 nodes to use these same type strings where applicable. Check the current research.json for the mapping.

4. **Rewrite `src/systems/researchSystem.ts`:**
   - `createResearchState(factionId, nativeDomain)`: Initialize with native domain T1 auto-completed. Parameter change: now takes nativeDomain string.
   - Remove all capability-related functions: `getCapabilityResearchBonus`, `getCapabilityResearchBonus` references in `getResearchProgressPerTurn`. Simplify to base rate only.
   - Remove `getEffectiveResearchXpCost` (no more knowledge discount — sacrifice is the discount).
   - `startResearch`: Add check — node must belong to an unlocked domain (learnedDomains contains the domain). Greyed-out domains cannot be researched.
   - `addResearchProgress`: Keep as-is (progress toward active node, auto-complete on threshold).
   - Add helper: `isDomainUnlocked(faction, domainId): boolean` — checks if domain is in faction's learnedDomains.
   - Add helper: `getDomainTier(faction, domainId): number` — returns highest completed tier (0=locked, 1=T1 done, 2=T2 done, 3=T3 done).
   - Keep: `isNodeCompleted`, `isComponentUnlocked`, `isChassisUnlocked`, `getResearchProgress`, `isResearching`, `getResearchRate`, `setResearchRate`.

5. **Update `src/data/loader/loadRulesRegistry.ts`:**
   - The research data loading should work with the new JSON structure (top-level keys are domain IDs instead of 'war_codification').
   - Update `getResearchDomain()`, `getResearchNode()`, `getAllResearchDomains()` to work with new structure.
   - `getResearchNode(domainId, nodeId)` should look up `researchData[domainId].nodes[nodeId]`.

6. **Update `src/game/buildMvpScenario.ts`:**
   - `createResearchState(factionId)` → `createResearchState(factionId, nativeDomain)` where nativeDomain comes from the faction config.
   - Look at how factions are defined to find their native domain — check `src/features/factions/types.ts` or faction config files.

[Constraints]:
- Do NOT modify frontend files (nothing in web/)
- Do NOT modify capabilityDoctrine.ts yet (Phase 2)
- Do NOT modify sacrificeSystem.ts yet (Phase 2)
- Do NOT modify aiResearchStrategy.ts yet (Phase 3)
- Do NOT modify components.json or hybrid-recipes.json yet (Phase 3)
- Do NOT modify the test files yet — they will break, that's expected
- After all changes, verify: npx tsc --noEmit passes for src/ files (tests may fail, that's ok)

[Goal]: Establish the new type system, research data, and core research functions. Everything else builds on this.
