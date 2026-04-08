# Design Proposal: Supply Line Attrition

## Problem
Supply is a flat per-unit cost (1 supply/unit) with no distance factor. Units deep in enemy territory suffer no attrition penalty. This removes a key strategic constraint — overextension should be punished. Historically, armies that outran their supply lines collapsed.

## Constraints
- `deriveResourceIncome()` in `economySystem.ts` calculates supply income/demand
- Supply deficit causes morale penalty spread across all units equally
- No concept of "distance from nearest friendly city" exists
- `hexDistance()` is available for distance calculations
- Must not make early expansion impossible (balance concern)

## Solution
**Low priority — implement after core gaps.** Add distance-based supply penalty:

### Mechanism
Units beyond a threshold distance from the nearest friendly city/village suffer attrition:
- **Safe range**: 4 hexes from any friendly city or village — no penalty
- **Extended range**: 5-8 hexes — 1 HP/turn attrition (slow withering)
- **Deep range**: 9+ hexes — 2 HP/turn attrition (rapid decay)

### Implementation
In `simulateFactionTurn()`, after unit reset loop:
```typescript
for (const unitId of faction.unitIds) {
  const unit = unitsMap.get(unitId);
  if (!unit || unit.hp <= 0) continue;
  
  const nearestFriendly = findNearestFriendlyAnchor(unit.position, state, factionId);
  const distance = nearestFriendly ? hexDistance(unit.position, nearestFriendly) : Infinity;
  
  if (distance > 8) {
    unitsMap.set(unitId, { ...unit, hp: Math.max(1, unit.hp - 2) });
  } else if (distance > 4) {
    unitsMap.set(unitId, { ...unit, hp: Math.max(1, unit.hp - 1) });
  }
}
```

### Counterplay
- Build villages to extend supply range (+1 safe range per village)
- Captured cities become supply anchors for the attacker
- Units can retreat to recover (no healing needed — just stop attrition)

## Trade-offs
- **Gain**: Strategic depth — overextension punished, supply lines matter
- **Cost**: More complex turn processing, AI needs supply awareness
- **Risk**: Too punishing for aggressive play. Numbers need tuning.

## Implementation Sketch
- **New helper**: `findNearestFriendlyAnchor(position, state, factionId): HexCoord | null`
- **Modified**: `src/systems/warEcologySimulation.ts` — add attrition check after unit reset
- **Constants**: `SAFE_RANGE = 4`, `EXTENDED_RANGE = 8`, `DEEP_ATTRITION = 2`

## Related Gaps
- Gap 5 (village destruction): destroying enemy villages extends their attrition range
- Gap 9 (buildable improvements): roads could reduce attrition
