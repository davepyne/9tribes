# TP-002: AI Aggression Analysis — Medium Difficulty

## Issue Summary

**Symptom:** On Medium difficulty, at round 27 with zero city pressure, AI spearmen refuse to leave their territory to attack weaker archer units at range. The AI should be more aggressive and willing to take risks on Normal.

**Expectation:** AI on Normal should pursue and engage skirmisher/archer units that are poking from a safe distance, rather than passively waiting.

## Context

- Difficulty: Medium (maps to `normal` profile in `src/systems/aiDifficulty.ts`)
- Round 27 — mid-game, neither side under significant pressure
- AI has spearmen (melee), player has archers (ranged) kiting from range
- Spearmen won't cross territory boundary to engage

## Relevant Files

### AI Decision Logic
- `src/systems/aiPersonality.ts` — aggression scalars, commit/retreat thresholds, `shouldCommitAttack()`
- `src/systems/aiTactics.ts` — attack scoring, `scoreAttackCandidate()`, `shouldEngageTarget()`
- `src/systems/aiDifficulty.ts` — Normal difficulty profile values

### Effectiveness Tables
- `src/data/roleEffectiveness.ts` — role-vs-role modifiers (melee vs ranged currently 0)
- `src/data/weaponEffectiveness.ts` — weapon-vs-movement-class modifiers

### Key Parameters to Investigate

**From `aiDifficulty.ts` NORMAL_PROFILE.personality:**
```typescript
aggressionFloor: 0.7,
siegeBiasFloor: 0.5,
raidBiasFloor: 0.4,
commitAdvantageOffset: 0,      // ← currently 0, no boost to attack threshold
retreatThresholdOffset: 0,     // ← currently 0, no reduction to retreat threshold
antiSkirmishResponseWeight: 1,
```

**Thresholds from DEFAULT_BASELINE:**
```typescript
commitAdvantage: 1.15,
retreatThreshold: 0.8,
```

**Role effectiveness for melee vs ranged:**
- `roleEffectiveness(melee → ranged)` = 0 (no entry in table)
- `reverseRoleEffectiveness(ranged → melee)` = -0.25 (penalizes engagement)

## Analysis Tasks

1. **Trace the attack decision flow** — follow `shouldEngageTarget()` → `shouldCommitAttack()` → attack score calculation
2. **Identify blockers** — why doesn't the attack advantage exceed the commit threshold (1.15)?
3. **Check movement assignment** — are spearmen assigned to 'defender' role, which may prevent offensive pursuit?
4. **Examine distance penalty** — is the AI penalized for moving to attack ranged units?
5. **Review antiSkirmishResponseWeight** — does this trigger and what does it do?

## Expected Output

Provide concrete tuning recommendations:
1. Which parameters to adjust
2. What values to try
3. Trade-offs (will it make AI recklessly attack cities too?)
4. Any code changes needed beyond parameter tuning

## Constraints

- Do NOT modify AI logic in ways that break other behaviors
- Prefer parameter changes over structural rewrites
- Changes should primarily affect the "pursuing skirmishers" scenario, not all engagements
