# Design Proposal: Buildable Improvements

## Problem
Improvements are placed at scenario init via `MVP_IMPROVEMENTS` in `buildMvpScenario.ts`. There's no system to build new improvements during gameplay. The `Improvement` type exists (`src/features/improvements/types.ts`) with `defenseBonus`, but no production queue item type for improvements, and no build action.

## Constraints
- `Improvement` type has `position`, `type`, `defenseBonus`, `ownerFactionId`
- `ProductionItem` has `type: 'unit' | 'improvement' | 'prototype'` — improvement is already a valid type
- `src/content/base/improvements.json` defines available improvements
- `completeProduction()` in `productionSystem.ts` only handles `item.type === 'unit'`
- No `spawnImprovement()` function exists

## Solution
**Medium priority — implement after core combat gaps.** Add improvement production:

### 1. Extend `completeProduction()` to handle improvements
When `item.type === 'improvement'`:
- Find spawn hex (adjacent to city, like units)
- Create `Improvement` entity with type from `item.id`
- Add to `state.improvements`
- No unit spawned — just a map entity

### 2. Add improvement costs to economy
- Road: 5 production, +1 movement through hex
- Fort: 8 production, +3 defense bonus
- Watchtower: 6 production, +2 vision range (future)

### 3. AI improvement building
In `simulateFactionTurn()`, after unit production:
- If no supply deficit and no immediate threats, consider building a fort near front lines
- Simple heuristic: build fort on hex adjacent to most enemy units

## Trade-offs
- **Gain**: Strategic depth — choose between army and infrastructure
- **Cost**: More production queue complexity, AI needs improvement logic
- **Risk**: Improvements might be too strong (stacking defense bonuses)

## Implementation Sketch
- **Modified**: `src/systems/productionSystem.ts` `completeProduction()` — add improvement case
- **New function**: `spawnImprovement(state, cityId, improvementType): GameState`
- **Modified**: `src/systems/warEcologySimulation.ts` — add improvement build evaluation to AI
- **Content**: `src/content/base/improvements.json` already has definitions

## Related Gaps
- Gap 4 (city walls): forts are a player-built version of walls
- Gap 12 (terrain combat bonuses): improvements modify terrain defense
