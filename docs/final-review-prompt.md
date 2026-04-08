Final review of the research system redesign for war-civ-v2. Read docs/research-redesign.md for the full design spec.

We completed a 4-phase refactor: types, research.json, core system, capabilityDoctrine, sacrifice, chassis unlock, AI, content files, frontend research tree UI. Verify everything is consistent and complete.

## Check 1: TypeScript compilation
Run: npx tsc --noEmit (from root and from web/)
Report any errors (pre-existing MapScene.ts error in web/ is known).

## Check 2: Full test suite
Run: npx vitest run
Report all failures. Known pre-existing: map.test.ts (2), territory.test.ts (1), debug_strategy.test.ts (1).
Any NEW failures need investigation.

## Check 3: Design spec compliance
Read docs/research-redesign.md and verify:
- research.json has 10 domains × 3 tiers = 30 nodes with correct ID convention ({domain}_t1, {domain}_t2, {domain}_t3)
- Tier 1 effects match the spec's "Tier 1 Effects" table
- Tier 2 effects match the spec's "Tier 2 Effects" table  
- Tier 3 effects use the "Shared Tier 3" table (tribe-unique T3 is future work)
- Prerequisites: t2 requires t1, t3 requires t2 within same domain only
- No cross-domain prerequisites exist

## Check 4: Backend consistency
- researchSystem.ts: createResearchState takes nativeDomain param, initializes T1 as completed for native domain
- researchSystem.ts: isDomainUnlocked and getDomainTier helpers exist
- capabilityDoctrine.ts: maps new node IDs to doctrine booleans, no references to old node IDs (codify_, master_)
- sacrificeSystem.ts: sacrifice auto-completes T1 of matching domain, no references to removed capabilityBonus
- warEcologySimulation.ts: chassis unlock uses domain count (learnedDomains.length >= 2 for mid, >= 3 for late), not requiredResearchNodes
- aiResearchStrategy.ts: only scores unlocked domains, no references to removed requiredCapabilities
- All 13 qualitative effects from the old system are preserved and mapped to new Tier 2 nodes

## Check 5: Content files
- chassis.json: no references to old node IDs (codify_horsemanship, codify_fortification, etc.)
- components.json: no references to old requiredResearchNodes
- hybrid-recipes.json: no references to old requiredResearchNodes  
- signatureAbilities.json: no references to old node IDs

## Check 6: Frontend consistency
- ResearchTree.tsx: renders 10 domain rows × 3 tier columns, locked domains greyed out
- ResearchNode.tsx: has locked state, native domain indicator
- worldViewModel.ts: no references to removed exports (getCapabilityResearchBonus, getEffectiveResearchXpCost, getKnowledgeResearchBonus, getResearchProgressPerTurn, requiredCapabilities, capabilityBonus)
- GameSession.ts: applyStartResearch uses new registry API (domain-keyed, not 'war_codification'), rejects locked domains
- clientState.ts: ResearchNodeViewModel has domain, isNative, isLocked fields

## Check 7: No orphaned references
Search entire src/ and web/ for these old patterns — should return ZERO results:
- codify_horsemanship, codify_fortification, codify_woodcraft, codify_endurance, codify_navigation, codify_desert_survival, codify_formation, master_formation, master_poisoncraft, master_navigation
- requiredCapabilities
- capabilityBonus
- 'war_codification' (as a research domain key)
- getEffectiveResearchXpCost
- getCapabilityResearchBonus
- getKnowledgeResearchBonus

## Check 8: Learn-by-kill + sacrifice integration
- learnByKillSystem.ts: 25% chance to learn enemy native domain on kill, vet bonus, cap of 3
- sacrificeSystem.ts: performSacrifice removes unit, auto-completes T1, adds domain to learnedDomains, triggers synergy re-evaluation
- The sacrifice → research → synergy pipeline is intact: sacrifice completes T1 → domain counts for pair synergy → T2 for emergent rule

Report findings as: PASS/FAIL per check, with details on any issues found. Do NOT fix anything — just report.
