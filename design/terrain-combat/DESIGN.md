# Design Proposal: Terrain Combat Bonuses

## Problem
Terrain provides a flat `defenseBonus` via the registry and improvements. But there's no attack penalty for fighting uphill, no forest ambush bonus, no plains charge bonus. The combat system already has role/weapon effectiveness tables — terrain should add another layer.

## Constraints
- `resolveCombat()` in `combatSystem.ts` takes `attackerTerrain` and `defenderTerrain`
- `registry.getTerrain(terrainId)` returns `{ defenseBonus: number, ... }`
- Currently only used as a flat defense modifier
- Role/weapon effectiveness already provides rock-paper-scissors depth
- Must not make combat too random or unpredictable

## Solution
**Low priority — polish feature.** Add terrain-specific attack modifiers:

### Terrain Attack Modifiers
| Defender Terrain | Attacker Role | Modifier |
|-----------------|---------------|----------|
| hill | any | -15% attack (fighting uphill) |
| forest | cavalry | -25% attack (cavalry struggles in forest) |
| forest | ranged | +10% attack (archers benefit from cover) |
| plains | cavalry | +10% attack (open ground favors cavalry) |

### Implementation
In `resolveCombat()`, after role/weapon modifiers, add terrain attack modifier:
```typescript
const terrainAttackMod = getTerrainAttackModifier(attackerTerrain, attackerRole);
finalAttack *= (1 + terrainAttackMod);
```

This is separate from the existing `defenseBonus` which applies to the defender.

## Trade-offs
- **Gain**: Terrain matters tactically. Positioning becomes important.
- **Cost**: More combat complexity. Harder to predict outcomes.
- **Risk**: Stacking with role/weapon bonuses could create extreme modifiers.

## Implementation Sketch
- **New function**: `getTerrainAttackModifier(terrain, role): number`
- **Modified**: `src/systems/combatSystem.ts` `resolveCombat()` — add terrain attack modifier
- **Data**: Could be in `src/content/base/terrains.json` or a new `terrain-attack-modifiers.json`

## Related Gaps
- Gap 7 (fog of war): forests could provide concealment
- Gap 14 (map generation): more terrain types = more tactical variety
