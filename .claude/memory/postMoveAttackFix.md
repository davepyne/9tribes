---
name: postMoveAttackFix
description: AI now attacks after strategic movement if adjacent to enemy; movesRemaining gate removed from combatActionSystem so ZoC entry doesn't block attacks
type: project
originSessionId: 34809008-748c-40d3-a558-a270f4acd734
---
## Post-Movement Attack Fix (2026-04-13)

Two bugs fixed that caused the AI to fail to attack with remaining movement:

**Bug 1 — No post-strategic-movement attack check**
- `activateUnit()` in `src/systems/unit-activation/activateUnit.ts` treated the decision as a branching tree (attack OR charge-move OR strategic-move), not a loop. After `performStrategicMovement`, units simply ended their turn — even if adjacent to an enemy.
- Fix: After `performStrategicMovement`, scan for adjacent enemies using `findBestTargetChoice` (from `src/systems/unit-activation/targeting.ts`) and attack if the engagement gate (`shouldEngageFromPosition`) passes. Initially was `score > 0` but now uses full threat assessment (2026-04-13).

**Bug 2 — movesRemaining gate blocked attacks after ZoC entry (FIXED 2026-04-28)**
- `previewCombatAction()` in `src/systems/combat-action/preview.ts` previously gated attacks on `attacker.movesRemaining > 0`. Entering enemy ZoC sets `movesRemaining = 0` (in `movementSystem.ts`), which blocked attacks.
- **Fixed in commit `4f5e4d1`:** Removed `movesRemaining <= 0` from the guard in both `preview.ts` and `GameSession.ts` (`getAttackTargets`). Only `attacksRemaining <= 0` remains as the attack eligibility check.
- `attacksRemaining` is now the sole authoritative "can this unit still attack" flag.

**Why:** User noticed AI not attacking when it had movement points remaining. Bug 1 fix (post-movement attack check in activateUnit.ts) resolved the AI path. Bug 2 fix (removing movesRemaining gate) resolved the player-facing path and ZoC-entry case.

**How to apply:** Both combat paths now allow attacks regardless of remaining movement. If you need to re-introduce a movement requirement for attacks, both `preview.ts` and `GameSession.ts` must be updated together (dual-path trap).
