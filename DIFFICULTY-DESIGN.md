# Difficulty & AI Design

## Difficulty Tiers

### Easy (Current AI — Baseline)
The existing AI behavior as-is. Reactive, role-balanced, cautious.

- `aggression: 0.5`, `siegeBias: 0.25`, `raidBias: 0.25`
- Production fills desired role ratios (35% melee, 25% ranged, 20% mounted, etc.)
- Posture is reactive — defensive when threatened, offensive only with local superiority
- Units spread across assignments (defender, main_army, reserve)
- Strongly penalizes supply deficit in production scoring
- No timing mechanism — builds and moves based on current state only

### Normal (Easy + Coordinator Layer)
Everything Easy does, plus a proactive timing/coordinator layer inspired by StarCraft AI:

1. **Rush production phase** — early rounds (1-10), go all-in on military production. Ignore role balance, just build the cheapest effective unit repeatedly. Prioritize supply-efficient units.
2. **Supply trigger** — when faction reaches ~80% supply capacity AND has 3+ units idle near home, form a hunting party.
3. **Hunter/home split** — once hunting triggers, assign roughly half the army as hunters (move toward nearest enemy city) and half as defenders (stay near home city). Hunting party must be ≥3 units to be valid.
4. **Higher aggression defaults** — `aggression: 0.7`, `siegeBias: 0.5`, `raidBias: 0.4`
5. **Learn-and-sacrifice loop** — proactively send units to learn new domains from enemies, bring them home to sacrifice, and immediately switch production to upgraded units that unlock from the new domain. This is the AI's tech progression engine.
6. **Research priority: Tier 3** — AI should prioritize reaching Tier 3 in all available technologies for maximum bonuses, rather than spreading thin across T1 in many domains.
7. **Home city defender** — always keep at least 1 unit garrisoned at the home city for the defensive terrain bonus.
8. **Village-first targeting** — when attacking, prioritize destroying enemy villages before besieging cities. Cutting enemy production/supply is more valuable than city capture early on.
9. **Triple-stack awareness** — AI should understand which combo domains (e.g., Paladin, Ghost Army) are within reach based on current domain progress, and prioritize research/codification moves that unlock them. These are powerful thematic unlocks that should influence AI strategy.

### Hard (Normal + AI Bonuses)
Normal AI plus asymmetric bonuses:

- AI gets +25% production, +25% supply income
- AI starts with an extra unit
- AI more aggressive (offensive posture bias, better target selection)
- AI research speed +15%
- Slightly faster village spawning for AI

## Philosophy
- Never directly punish the player (or minimally). Make the opponent stronger instead.
- Tune on Normal first — get the game balanced there, then Easy dials AI down, Hard dials it up.
- Difficulty modifiers should be data-driven where possible (multipliers in config, not hardcoded branching).

## Current AI Architecture Reference

### Layer 1: Personality (`aiPersonality.ts`)
- Per-faction baseline scalars: aggression, caution, cohesion, siegeBias, raidBias, etc.
- Modified by research domains (native domain full weight, learned domains 60%)
- State modifiers: exhaustion reduces aggression, local superiority increases it

### Layer 2: Strategy (`strategicAi.ts`)
- Posture system: scores 6 postures (offensive, balanced, defensive, recovery, siege, exploration)
- Posture scoring weighted by personality — low aggression = rarely offensive/siege
- Siege posture bonus only when `friendlyUnits >= enemyUnits + 1` at a front (reactive, not proactive)
- No fronts + no threats → exploration posture

### Layer 3: Unit Assignment (`strategicAi.ts` ~line 600-750)
- Assignments: main_army, raider, defender, siege_force, reserve, recovery, return_to_sacrifice
- `squadSize: 3` — minimum group size for many decisions
- Assignments spread units across roles — no "mass and move as group" logic

### Layer 4: Production (`aiProductionStrategy.ts`)
- Produces to fill desired role ratios
- Penalizes supply deficit
- Counter-builds enemy composition
- Not rush-oriented — builds a balanced army slowly

### Layer 5: Movement (`warEcologySimulation.ts` ~line 3000-3400)
- Units move toward waypoints (front anchor, enemy city, friendly city)
- Heavy penalty for moving alone into danger
- Units trickle toward front instead of massing up

## Key Gaps to Address for Normal Difficulty
1. No "build up then attack" timing mechanism
2. No "supply cap reached → attack" trigger
3. No deliberate hunter group formation (3+ units as a coordinated strike force)
4. No hunter/home garrison split
5. Default personality values too conservative for Normal
6. Production doesn't prioritize speed/rushing

## Implementation Notes
- The Normal coordinator layer should plug into the existing posture/assignment system, not replace it
- Add a `difficultyLevel` field to game setup that flows through to AI systems
- Production system can check difficulty to adjust behavior (role-balanced vs. rush)
- Personality defaults can be overridden by difficulty level
- Hunter group formation can be a new posture or assignment type

## Testing / Playtest Access

### URL Parameter Approach
The bootstrap already uses `URLSearchParams` in `PlayClient.tsx`:
```
/play?bootstrap=fresh&seed=42
```

Add a `difficulty` parameter:
```
/play?bootstrap=fresh&seed=42&difficulty=normal
```

### How It Flows
1. `PlayClient.tsx` reads `search.get('difficulty')`, passes it into `GameSessionOptions`
2. `GameSession` stores `difficulty: 'easy' | 'normal' | 'hard'`
3. AI systems check difficulty level to adjust behavior:
   - `computeFactionStrategy()` — Normal uses coordinator layer, Easy skips it
   - `computeAiPersonalitySnapshot()` — Normal overrides defaults (aggression 0.7, siegeBias 0.5)
   - Production scoring — Normal prioritizes rushing early game
4. If no `difficulty` param, default to `'easy'` (current behavior)

### Claude Code Task Brief (Phased Implementation)

#### Phase 1: Foundation — Aggression + Coordination
```
[Context]: We have a working Easy AI and need to add a Normal difficulty layer.
See DIFFICULTY-DESIGN.md for the full design. This is Phase 1 of 3.

[Goal]: Implement the foundational Normal difficulty behaviors.
Testable via: /play?bootstrap=fresh&seed=42&difficulty=normal

Changes:
1. Add `difficulty?: 'easy' | 'normal' | 'hard'` to GameSessionOptions in GameSession.ts
2. Parse `?difficulty=normal` from URL in PlayClient.tsx, pass to GameSession
3. Default to 'easy' when no difficulty param (zero behavior change for Easy)

4. In aiPersonality.ts — when difficulty is 'normal', override baseline defaults:
   - aggression: 0.5 → 0.7
   - siegeBias: 0.25 → 0.5
   - raidBias: 0.25 → 0.4

5. In aiProductionStrategy.ts — when difficulty is 'normal':
   - Early game rush (rounds 1-10): ignore role balance, prioritize cheapest military unit by supply efficiency
   - After round 10: resume normal role-balanced production

6. In strategicAi.ts — when difficulty is 'normal', add coordinator logic:
   - When faction reaches 80% supply capacity AND has 3+ units idle near home:
     - Assign ~half the army as "hunters" (move toward nearest enemy city, min 3 units)
     - Assign ~half as "defenders" (stay near home city)
   - ALWAYS keep at least 1 unit garrisoned at home city (defensive terrain bonus)

7. 'hard' difficulty recognized but uses Normal AI behavior for now

[Constraints]:
- Easy must remain EXACTLY as-is — zero behavior change
- Must compile with tsc --noEmit
- Don't refactor, just layer on top
```

#### Phase 2: Strategic Depth — Targeting + Research
```
[Context]: Phase 1 is complete. Normal AI now has aggression, rush production, hunter split, and home garrison.
This is Phase 2 of 3. See DIFFICULTY-DESIGN.md.

[Goal]: Add strategic depth to Normal AI targeting and research.

Changes:
1. Attack targeting (Normal only):
   - When hunting, prioritize enemy villages over cities
   - Cutting enemy production/supply via village destruction before sieging cities
   - Implement as a scoring modifier in focus target selection

2. Research strategy (Normal only):
   - Prioritize reaching Tier 3 in current domains before spreading to new ones
   - Tier 3 = biggest bonuses, focus depth over breadth
   - Modify aiResearchStrategy.ts to weight active domain T3 nodes higher when difficulty is 'normal'

3. Post-sacrifice production pivot (Normal only):
   - After a unit is sacrificed and a new domain unlocks, immediately prioritize production
     of upgraded units available from that domain
   - Track last domain unlock event and boost production scoring for units requiring that domain

[Constraints]:
- Easy unchanged
- Phase 1 behaviors preserved
- Must compile with tsc --noEmit
```

#### Phase 3: Advanced — Learn Loop + Triple Stacks
```
[Context]: Phases 1-2 are complete. Normal AI has aggression, coordination, village targeting, T3 research.
This is Phase 3 of 3 (the hardest). See DIFFICULTY-DESIGN.md.

[Goal]: Add the learn-and-sacrifice loop and triple-stack domain awareness.

Changes:
1. Learn-and-sacrifice loop (Normal only):
   - AI should proactively send units to fight enemies in different domains to learn abilities
   - Units that have learned 2+ abilities should be prioritized for return_to_sacrifice
   - After sacrifice unlocks a new domain, immediately switch production to newly available units
   - This is the AI's tech progression engine — actively pursue domain unlocks through combat learning

2. Triple-stack awareness (Normal only):
   - AI should know which combo/triple-stack domains (e.g., Paladin, Ghost Army) are achievable
   - Factor this into research and codification priority
   - If 2 of 3 required domains are codified, heavily prioritize the 3rd
   - These are powerful thematic unlocks that should influence AI strategy
   - Check the combo domain definitions in the registry to understand which 3 domains combine

[Constraints]:
- Easy unchanged
- Phases 1-2 behaviors preserved
- Must compile with tsc --noEmit
- This is the riskiest phase — test thoroughly
```
