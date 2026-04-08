[Context]: We are redesigning the research system for war-civ-v2. Phases 1-3 are complete — the entire backend is rewritten, tests pass, AI works with the new tree. Read docs/research-redesign.md for the full design.

[Phase 4: Frontend — Research Tree UI + View Model + GameSession]

Consult @oracle. This phase updates the frontend to render the new research tree.

What to do:

1. **Read** docs/research-redesign.md and the current state of the modified backend files to understand the new data shapes.

2. **Rewrite `web/src/ui/ResearchTree.tsx`:**
   - Current layout: 3-tier grid with 7 columns and SVG connection lines for prerequisites.
   - New layout: 10 rows (one per domain) × 3 columns (T1, T2, T3).
   - Each domain row shows: domain name, then 3 tier nodes side by side.
   - Locked domains (not in learnedDomains) show all 3 nodes greyed out with a lock icon.
   - Unlocked domains show: T1 as completed (green check), T2 and T3 as researchable.
   - The player's native domain should be visually distinct (maybe a small banner or different background).
   - SVG connection lines: simple horizontal line from T1→T2→T3 within each domain row. No cross-domain lines.
   - Keep it clean and scannable — the player should see at a glance which domains are unlocked and how far along they are.

3. **Update `web/src/ui/ResearchNode.tsx`:**
   - Remove prerequisite rendering (no cross-domain prereqs anymore).
   - Add locked state styling (grey, lock icon, "Learn from enemies in combat" tooltip).
   - Add native domain indicator (small badge or different border).
   - Show the qualitativeEffect description as the node's summary text.
   - Keep the progress bar for active research.

4. **Update `web/src/game/view-model/worldViewModel.ts`:**
   - The view model needs to know: which domains are unlocked (learnedDomains), which is native, what tier each domain is at.
   - Update `buildResearchInspectorViewModel()` or equivalent to work with the new research structure.
   - Domain-lock status should be computed from faction's learnedDomains vs the 10 domain list.
   - Remove capability requirement display (no more "requires woodcraft: 4").
   - Show estimated turns to complete for researchable nodes.

5. **Update `web/src/game/types/clientState.ts`:**
   - Update `ResearchNodeViewModel` to include: `domain: string`, `isNative: boolean`, `isLocked: boolean`, `highestCompletedTier: number`.
   - Remove `requiredCapabilities` field from the view model.
   - Add `domainUnlockStatus` to the research inspector view model: which domains are locked vs unlocked.

6. **Update `web/src/game/controller/GameSession.ts`:**
   - Update `applyStartResearch()` — reject attempts to start research on locked domains.
   - Update `resolveFactionResearch()` — use the simplified research rate (base rate only, no capability bonus).
   - Update any remaining references to old research node IDs or capability-based logic.

7. **Update `web/src/styles.css` if needed:**
   - Add styles for locked domain state (grey background, reduced opacity, lock icon).
   - Add styles for native domain indicator.

8. **Verify:**
   - cd web && npx tsc --noEmit (zero errors, except pre-existing MapScene.ts error)
   - The research tree should render with all 10 domains, native domain lit up, others locked.

[Constraints]:
- Only modify files in web/ — do NOT touch src/ (backend is done)
- Match existing code style and patterns
- The research tree should be functional: clicking an unlocked T2/T3 node should start research
- Locked nodes should be visually clear that they need sacrifice to unlock

[Goal]: Frontend renders the new research tree correctly. The full refactor is complete.
