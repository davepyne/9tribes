# Design Proposal: Fog of War

## Problem
All factions see all units and the entire map. There's no exploration, no detection, no ambush potential. This removes a core strategic dimension — information asymmetry. Without fog of war, flanking is trivial (you always know where enemies are), and there's no reason to scout.

## Constraints
- `GameState` has `map?: GameMap` — shared across all factions
- Units have `position: HexCoord` — visible to all
- No concept of "vision range" or "revealed tiles" exists
- Must work with the deterministic simulation (seed-based RNG)
- Performance: checking visibility every turn for every unit shouldn't be expensive

## Solution
**Deferred to a future phase.** Fog of war is a significant feature that requires:
- Per-faction visibility maps (which tiles are revealed)
- Vision range per unit type
- Line-of-sight calculations on hex grid
- Hidden unit mechanics (can't target what you can't see)
- AI adaptation (factions must act on incomplete information)

This is too large for a design proposal alone — it needs its own implementation sprint. **Recommendation**: Mark as future work, don't block testing on this.

### Minimal Alternative: Soft Fog
If you want something lighter, add a "detection range" concept:
- Units can only attack/interact with enemies within 3 hexes
- Beyond 3 hexes, enemy positions are unknown
- No tile-level visibility — just unit-level detection range

This is simpler but doesn't provide the full strategic depth of real fog of war.

## Trade-offs
- **Gain**: Information asymmetry, scouting value, ambush mechanics
- **Cost**: Major implementation effort, AI needs rework, testing complexity increases
- **Risk**: Over-engineering for MVP. Fog of war is a "nice to have" not a "must have" for testing the core loop.

## Implementation Sketch
- **Future**: Per-faction `Set<string>` of revealed hex keys
- **Future**: `calculateVision(unit, map): Set<string>` — hexes visible from unit position
- **Future**: `isVisible(hex, factionId, state): boolean` — check if hex is in faction's revealed set
- **Future**: Filter `findBestTarget()` to only consider visible enemies

## Related Gaps
- Gap 12 (terrain combat bonuses): forests could provide concealment in fog of war
- Gap 11 (supply attrition): units cut off from supply lines are more vulnerable without vision
