[Context]: We are redesigning the research system for war-civ-v2. Phases 1-2 are complete — types, research.json, core system, capabilityDoctrine, sacrifice, and chassis unlocks are done. Read docs/research-redesign.md for the full design.

[Phase 3: AI Strategy + Content Files + Tests]

Consult @oracle. This phase updates the AI, cleans up content files, and fixes tests.

What to do:

1. **Rewrite `src/systems/aiResearchStrategy.ts`:**
   - The AI needs to score and select research from the new 10-domain × 3-tier tree.
   - Key changes:
     a) Only consider domains that are UNLOCKED (in faction's learnedDomains). Score locked domains as 0.
     b) Native domain should always be prioritized for T2 early, T3 later.
     c) Foreign domains (learned via sacrifice) should be scored based on:
        - Synergy potential: does this domain combine well with already-researched domains?
        - Chassis urgency: does completing T2 here unlock needed mid/late-tier units?
        - Current game state: if losing, prioritize defensive domains (fortress, nature_healing). If winning, prioritize offensive (charge, venom).
     d) Within a domain, always complete T2 before starting T3.
     e) Keep the "sticky" behavior — if actively researching something, don't switch unless a clearly better option appears.
   - Remove all references to old node IDs and capability-level scoring.
   - `chooseStrategicResearch()` should return the best available node from unlocked domains.

2. **Update `src/content/base/components.json`:**
   - Remove `requiredResearchNodes` from all components.
   - Replace with chassis tier gating where appropriate. The production system (updated in Phase 2) now checks domain count for chassis availability. Components should be available based on the prototype system, not research gates.
   - Some components may need to be gated behind Tier 2 completion of a specific domain. If so, use a simpler format like `requiredDomain: "venom", requiredTier: 2`.

3. **Update `src/content/base/hybrid-recipes.json`:**
   - Same approach as components.json — remove old `requiredResearchNodes`, replace with domain/tier checks if needed.

4. **Update faction files in `src/content/base/factions/`:**
   - Check for `requiredResearchNodes` on signature abilities (summoning gates).
   - Update to use new node ID convention or domain-based checks.

5. **Fix test files:**
   - `tests/warEcologySimulation.test.ts`: Update `createResearchState` calls to include nativeDomain parameter. Update any hardcoded node IDs.
   - `tests/capabilityDoctrine.test.ts`: Update completed node IDs to new convention. Verify doctrine flags still map correctly.
   - `tests/prototype.test.ts`: Update research state initialization.
   - `tests/strategicAi.test.ts`: Update AI research strategy tests for new scoring.
   - `tests/content.test.ts`: Update node ID assertions.
   - Run ALL tests: npx vitest run
   - Fix failures until all tests pass.

6. **Run full verification:**
   - npx tsc --noEmit (zero errors)
   - npx vitest run (all tests pass)
   - Grep for any remaining old node IDs: codify_, master_, poison_phalanx, amphibious_fortress, eternal_march, forced_march, rapid_entrench

[Constraints]:
- Do NOT modify frontend files (Phase 4)
- If you find issues from Phase 1 or 2, fix them and document

[Goal]: AI works with new tree, content files are clean, all tests pass. Backend is fully complete.
