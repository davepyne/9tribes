---
name: Progression Pipeline Fix
description: 3-cycle thinking-machine investigation that activated the dormant progression pipeline. 5/6 success criteria met. decisiveGames resolved by unlockedRecipeIds fix.
type: project
originSessionId: 3fc7d370-4d79-4531-87a6-9331ac362eac
updated: 2026-04-28
---
Progression pipeline was completely dormant (avgLearnedDomainCount=1.17, 0 triple stacks, 0 decisive games). Fixed through 8 interventions across 3 cycles.

**Why:** Pipeline had 7 serial bottlenecks - gainExposure() was dead code, sacrifice destroyed units, research was too slow, triple stack gate required exactly 3 T2 domains.

**How to apply:** The key changes are:
- Exposure thresholds lowered from [100,150,200] to [10,20,35]
- Non-destructive sacrifice (unit kept, abilities stripped)
- Research speed doubled (4 to 8 XP/turn)
- Triple stack gate lowered from ===3 to >=2 domains
- Auto-complete T1 research when exposure learns a domain
- Learn-by-kill chances 2.5x

**Update 2026-04-28**: decisiveGames went from 0 to 3/10 after fixing the dead unlockedRecipeIds field in hybridSystem.ts. The field was initialized to [] but never populated when unlockHybridRecipes assembled prototypes. This also broke strategicAi.ts buildHybridGoal which filters by unlockedRecipeIds.includes - the AI could never see unlocked recipes. Fix: push recipe.id into the array when assembling. Harness now shows 1-2 unlocked recipes per faction, meaningful mid-game unit diversity, and Frost Wardens winning 3/10 games.

**Remaining concern**: Frost Warden dominance (23.7 avg units, 5.6 cities, 3/3 wins). Hill Clan and Coral People still get eliminated early. 7/10 games still unresolved at turn 150.

**Battle count regression**: totalBattles dropped 25% (1233 to 928) from learn-loop coordinator. Not yet addressed.
