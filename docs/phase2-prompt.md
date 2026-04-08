[Context]: We are redesigning the research system for war-civ-v2. Phase 1 is complete — types, research.json, and core researchSystem.ts have been rewritten. Read docs/research-redesign.md for the full design.

[Phase 2: capabilityDoctrine + Sacrifice + Chassis Unlock]

Consult @oracle. This phase connects the new research system to the game's combat, sacrifice, and production mechanics.

What to do:

1. **Read** docs/research-redesign.md and the current state of the files modified in Phase 1 to understand the new node IDs and type shapes.

2. **Rewrite `src/systems/capabilityDoctrine.ts`:**
   - Currently has 30+ hardcoded node-ID checks mapping to boolean flags.
   - Rewrite to use the new node ID convention (`venom_t1`, `fortress_t2`, etc.).
   - Map each Tier 2 and Tier 3 node to its corresponding qualitative effect boolean.
   - Preserve ALL existing boolean flags — these are consumed by warEcologySimulation.ts, movementSystem.ts, zocSystem.ts.
   - The mapping should be: completedTier >= 2 for the domain → enable the qualitative effect.
   - Remove any references to the old node IDs (codify_woodcraft, master_formation, etc.).
   - Remove capability-level-based doctrine thresholds. Doctrine is now purely research-tier-based.

3. **Update `src/systems/sacrificeSystem.ts`:**
   - Sacrifice should auto-complete Tier 1 of the matching domain (if not already completed).
   - The `codifies` field on the new ResearchNodeDef maps domains to nodes.
   - Sacrifice should also add the domain to the faction's `learnedDomains` if not already there (this may already happen via knowledgeSystem.ts — verify).
   - Verify that sacrifice still works end-to-end: find matching research node → auto-complete → apply qualitative effect → trigger synergy re-evaluation.

4. **Update chassis unlock logic:**
   - Find where chassis availability is checked (likely in productionSystem.ts or prototype validation).
   - Replace the `requiredResearchNodes` check with a domain count check: `faction.learnedDomains.length >= 2` for mid-tier, `>= 3` for late-tier.
   - This may require changes to `src/systems/productionSystem.ts` and/or prototype validation.
   - Check `src/content/base/components.json` and `src/content/base/hybrid-recipes.json` for how chassis tiers are currently gated. For now, just update the code — we'll clean up the JSON in Phase 3.

5. **Update `src/systems/warEcologySimulation.ts`:**
   - Update the simulation loop to use the new `createResearchState(factionId, nativeDomain)` call.
   - Find where factions get their native domain and pass it through.
   - Verify that the simulation loop still handles research progress correctly.
   - Check if there are any remaining references to old node IDs or capability-level-based research logic.

6. **Run targeted checks:**
   - npx tsc --noEmit (src/ files only — tests will still fail)
   - Verify no references to old node IDs remain in src/ (grep for codify_, master_, poison_phalanx, amphibious_fortress, eternal_march)

[Constraints]:
- Do NOT modify frontend files
- Do NOT modify aiResearchStrategy.ts yet (Phase 3)
- Do NOT modify components.json or hybrid-recipes.json yet (Phase 3)
- Do NOT modify test files yet (Phase 3)
- If you need to fix something from Phase 1, do it — but document what was wrong.

[Goal]: Connect the new research system to combat effects, sacrifice, and production. After this phase, the backend should be functionally complete.
