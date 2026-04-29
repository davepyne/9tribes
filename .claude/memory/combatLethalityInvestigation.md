---
name: Combat Lethality Investigation
description: 5 harness-verified interventions to increase kill rate ALL failed with the same pattern - avgLivingUnits doubles every time due to snowball feedback loop
type: project
originSessionId: e218181d-0f66-491f-aeff-c799a5c30c65
updated: 2026-04-28
---
## Investigation Results (2026-04-18)

**Problem**: 26% kill rate (293 kills / 1129 battles) too low for learn-by-kill to synergy pipeline.

**5 interventions tested, all FALSIFIED:**
1. Reduce MORALE_DAMAGE_FACTOR 12 to 6: kill rate 28.6%, avgLivingUnits 104.2
2. Defense divisor 3 to 5: kill rate 27.5%, avgLivingUnits 101.8
3. Defense divisor + ROUT_THRESHOLD=0: kill rate 29.2%, avgLivingUnits 105
4. Remove unsafeAfterMove + HP engage floor: kill rate 22.8%, avgLivingUnits 104.6
5. Raise unit costs 50%: kill rate 28.8%, avgLivingUnits 97.1

**Why**: avgRoutedUnits was near-zero at baseline. The real escape is AI strategic retreat. ANY parameter perturbation breaks the fragile combat-production equilibrium: weak factions die faster, survivors inherit territory, production scales with territory. Rich-get-richer snowball dominates.

**Why this matters**: Per-combat lethality tuning will NOT increase kill rate. The system needs anti-snowball mechanics first.

**Bug found**: combatSystem.ts hardcodes for rout check instead of using MORALE_CONFIG.ROUT_THRESHOLD. FIXED 2026-04-18.

**How to apply**: If asked to tune combat lethality, parameter changes are absorbed by the production feedback loop. Structural anti-snowball mechanics needed first.

**Update 2026-04-28**: Decisive games went from 0 to 3/10 after fixing the dead unlockedRecipeIds field in hybridSystem.ts. The AI was blind to unlocked hybrid recipes (strategicAi.ts buildHybridGoal filters by unlockedRecipeIds.includes), so it never pursued hybrid production. Fixing this let the AI snowball harder through better production choices. Frost Wardens dominate (3 wins, 23.7 avg units). Anti-snowball thesis still holds.
