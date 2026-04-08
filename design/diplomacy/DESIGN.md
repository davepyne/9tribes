# Design Proposal: Diplomacy and Victory Types

## Problem
The only victory condition is elimination — last faction standing. There's no diplomacy, no alliances, no negotiation, no territorial victory. This makes every game a deathmatch. The "war drives civilization" thesis implies war is a means to an end, not the only end.

## Constraints
- No diplomacy state exists (no `Relation` type, no `DiplomacyState`)
- Factions are either at war or don't interact — no neutral state
- `maybeAbsorbFaction()` is the only inter-faction interaction
- Must work with AI factions (no human negotiation UI yet)
- Should not break the core combat loop

## Solution
**Deferred to a future phase.** Diplomacy is a full subsystem requiring:
- Relation tracking between faction pairs
- Treaty types (peace, alliance, trade)
- AI decision-making for diplomacy
- Victory condition checking beyond elimination
- UI for player-facing negotiation

### Minimal Alternative: Alternate Victory Conditions
If you want something lighter, add victory condition checks to the simulation loop:
- **Domination**: Control 75%+ of cities → win
- **Survival**: Survive 50 turns with 2+ cities → win
- **Elimination**: Already implemented

These are just checks at the end of each round — no diplomacy state needed.

## Trade-offs
- **Gain**: Replay variety, strategic depth beyond "kill everyone"
- **Cost**: Major feature, needs AI personality systems, relation tracking
- **Risk**: Over-engineering for MVP. Core combat loop is the priority for testing.

## Implementation Sketch
- **Future**: `DiplomacyState` with `Map<string, Relation>` (faction pair → relation level)
- **Future**: `Relation` type with `status: 'war' | 'peace' | 'alliance'`, `trust: number`
- **Future**: `checkVictoryConditions(state): FactionId | null` — runs each round
- **Minimal**: Add `checkVictoryConditions()` with domination/survival checks

## Related Gaps
- Gap 7 (fog of war): alliances could share vision
- Gap 1 (city capture): domination victory depends on city control
