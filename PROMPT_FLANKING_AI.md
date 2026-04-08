## Task: AI Flanking and Rear Attack Positioning

### Problem
The combat AI in `warEcologySimulation.ts` does not consider flanking or rear attacks when choosing movement positions. Units walk directly toward enemies using shortest-distance logic. This means:

1. **Flanking bonuses** (+15% per adjacent ally, from `calculateFlankingBonus()` in `zocSystem.ts:88`) only trigger accidentally when regrouping clusters units together.
2. **Rear attacks** (+20% bonus, from `isRearAttack()` in `zocSystem.ts:106`) are random — the AI doesn't control approach direction or enemy facing.

This makes the game strategically flat and partially explains why factions with combat-multiplying signature abilities (plains_riders swiftCharge, coral_people tidalAssault, savannah_lions stampede) can't convert unit advantage into wins.

### Relevant Code

**Movement AI** (where the fix goes):
- `src/systems/warEcologySimulation.ts` — function `activateUnit()` starting ~line 1343
- Lines ~1392-1451: Default movement scoring — purely distance-based chase logic
- Lines ~1415-1440: Enemy unit chasing with `getRoleEffectiveness` and `getTerrainPreferenceScore`

**Combat systems** (already work, just need AI to exploit them):
- `src/systems/zocSystem.ts:88` — `calculateFlankingBonus()`: +15% per adjacent allied unit around the defender
- `src/systems/zocSystem.ts:106` — `isRearAttack()`: +20% if attacking from defender's rear 3 hexes
- `src/systems/zocSystem.ts` — `getDirectionIndex()`, `getOppositeDirection()`: hex direction utilities

**Existing imports in warEcologySimulation.ts**:
- `calculateFlankingBonus` and `isRearAttack` are already imported from `./zocSystem.js` (line 53)
- `getNeighbors` from `../core/hex.js` (line 90)
- `getUnitAtHex` from `./occupancySystem.js` (line 48)
- `getValidMoves` from `./movementSystem.js` (line 47)

**Combat resolution** (already consumes the bonuses):
- Lines ~1757-1841: `resolveCombat()` call with `flanking`, `rearAttackBonus`, etc.

### What to Implement

**1. Flanking-aware movement scoring** (in the enemy chase section, ~line 1415):
When evaluating a potential move hex against an enemy target, add a score bonus if:
- Moving to that hex would place the unit adjacent to the target AND
- There is already another friendly unit adjacent to the target (flanking setup)
- Bonus should be modest (don't override strategic priorities) — maybe +0.5 to +1.5 to the move score

**2. Rear attack approach preference** (same section):
When evaluating move hexes adjacent to an enemy, prefer hexes that would give a rear attack bonus:
- Use `isRearAttack()` to check if attacking from that hex would hit the enemy's rear
- Add a score bonus for rear-attack positions (maybe +0.3 to +0.8)
- This requires temporarily "pretending" the unit is at the candidate hex to check the direction

**3. Regrouping toward flanking positions** (in the regroup section, ~line 1392):
When regrouping toward a friendly unit, prefer positions that are:
- Not just closest to the friendly, but also positioned to flank a nearby enemy
- This prevents the AI from blindly stacking all units on one hex

### Constraints
- Keep the scoring additive — don't override existing priorities (siege, role effectiveness, terrain preference)
- Flanking/rear bonuses should be secondary signals, not primary drivers
- Don't over-complicate: simple hex-counting is fine, no lookahead trees
- Must compile with zero new TypeScript errors (`npx tsc --noEmit`)
- Don't change combat resolution — only change movement scoring
- Consult the Oracle agent if you need to understand how `isRearAttack` computes facing/directions

### Verification
After implementing, run `npx tsc --noEmit` to verify compilation, then run a quick sim:
```
node --import tsx --no-warnings -e "
import { loadRulesRegistry } from './src/data/loader/loadRulesRegistry.js';
import { runWarEcologySimulation } from './src/systems/warEcologySimulation.js';
import { buildMvpScenario } from './src/game/buildMvpScenario.js';
const registry = loadRulesRegistry();
const state = buildMvpScenario(registry);
const result = runWarEcologySimulation(state, registry, 50);
const frost = result.factions.get('frost_wardens');
console.log('50-turn sim OK, frost polarBear:', JSON.stringify(frost?.polarBearState));
"
```
