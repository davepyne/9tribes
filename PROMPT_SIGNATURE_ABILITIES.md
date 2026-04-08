# Signature Abilities Implementation

## Overview
Implement 9 faction-specific signature unit abilities for the war-civ-v2 strategy game. Each ability gives a thematic, powerful reason to build and field signature units. All numeric parameters must be tunable by our Optuna optimization system.

## Architecture Context

### Key files to modify:
- `src/systems/movementSystem.ts` — movement cost resolution (line ~63)
- `src/systems/combatSystem.ts` — combat modifiers (line ~145-150)
- `src/systems/warEcologySimulation.ts` — main simulation loop (lines ~909, ~1542-1600, ~194-200)
- `src/systems/zocSystem.ts` — adjacency/flanking (line ~88-111)
- `src/content/base/chassis.json` — unit frame definitions
- `src/content/base/civilizations.json` — faction configs
- `src/data/loader/loadRulesRegistry.ts` — content loading

### Key files to create:
- `src/content/base/signatureAbilities.json` — ability definitions with tunable params
- `src/systems/signatureAbilitySystem.ts` — runtime ability logic

### Existing patterns to follow:
- Content is JSON-driven, loaded via `loadRulesRegistry.ts`
- Balance overrides in `src/balance/types.ts` use `BalanceOverrides` type — new params must be added there
- The Optuna optimizer in `scripts/optuna_optimize.py` reads `KNOBS` array to generate override JSON
- Combat modifiers flow through `resolveCombat()` params like `flankingBonus`, `situationalAttackModifier`
- Flanking bonus already iterates neighbors in `zocSystem.ts:calculateFlankingBonus()` — reuse this adjacency pattern

### How existing systems work:
1. **Movement**: `previewMove()` in movementSystem.ts returns `{ totalCost: Math.max(1, terrain.movementCost + zocCost + movementModifier) }` — we can override totalCost for camels
2. **Combat**: `warEcologySimulation.ts:activateUnit()` calculates `flanking`, `chargeAttackBonus`, `situationalAttackModifier` etc, then passes them all to `resolveCombat()`
3. **Poison**: `warEcologySimulation.ts:198-199` deals 1 flat damage per turn. `canInflictPoison()` checks for `poison` tag on prototype
4. **Healing**: `warEcologySimulation.ts:909-910` heals via `getHealRate()`, capped at maxHp
5. **Unit spawning**: `productionSystem.ts:completeProduction()` creates units with `createUnitId()`, adds to `state.units` and `faction.unitIds`
6. **Flanking**: `zocSystem.ts:calculateFlankingBonus()` iterates `getNeighbors(defender.position)`, checks for allied units

### Existing chassis/component data:
- `camel_frame`: hp=7, atk=2, def=2, mov=3, movementClass=camel, tags=[mounted, camel], requires horsemanship:3
- `elephant_frame`: hp=14, atk=3, def=2, mov=3, movementClass=beast, tags=[mounted, elephant, shock], requires formation_warfare:4, shock_resistance:3
- `fortress_training`: def+2, hp+2, requires fortification:4, hill_fighting:4, tags=[fortress, defensive]
- `poison_arrows`: atk+2, requires woodcraft:6, poisoncraft:6, tags=[poison, ranged]
- `druidic_rites`: hp+2, def+2, requires woodcraft:4, tags=[druid, healing, forest]
- Terrain costs: plains=1, forest=2, jungle=3, hill=2, desert=2, tundra=2, savannah=1, coast=2, river=2, swamp=3

### Faction IDs and passives:
- desert_nomads, savannah_lions, frost_wardens, hill_clan, jungle_clan, druid_circle, steppe_clan, coral_people, plains_riders
- Each has a `passiveTrait` in `identityProfile` (e.g., desert_logistics, charge_momentum, cold_hardened_growth, etc.)

## Abilities to Implement

### 1. Desert Nomads — "Endless Stride" (camel_frame)
**Effect**: Camel units ignore ALL terrain movement costs. Total cost is always 1 regardless of terrain.
**Hook**: In `movementSystem.ts:previewMove()`, after calculating `totalCost`, check if the unit's chassis is `camel_frame` and movementClass is `camel`. If so, set totalCost to 1 (before the Math.max(1,...)).
**Tunable params**: None (flat ability; camel stats already tunable via chassis overrides)

### 2. Savannah Lions — "Stampede" (elephant_frame)
**Effect**: When an elephant charges (moves before attacking, i.e., `movesRemaining < maxMoves`), add a bonus to attack damage.
**Hook**: In `warEcologySimulation.ts` around line 1558 where `chargeAttackBonus` is calculated, add: if attacker is savannah_lions AND chassis is elephant_frame AND charging, add stampede bonus to the situational attack modifier.
**Tunable param**: `stampedeBonus` (float, 0.1-0.5) — added as a multiplier to attack

### 3. Frost Wardens — "Polar Call" (NEW chassis: polar_bear_frame)
**Effect**: Summon a polar bear unit that lasts 5 turns, then has a 5-turn cooldown. Bears are extremely powerful but temporary. Can only summon on tundra terrain.
**Implementation**:
- Create `polar_bear_frame` chassis in chassis.json: hp=20, atk=5, def=2, mov=3, movementClass=beast, tags=[beast, summon, frost], NO capability requirements (it's a summoned creature, not built)
- Create a prototype for it (no component slots needed, or minimal)
- Add to frost_wardens in civilizations.json but NOT as a buildable unit — handle via ability system
- Track summon state per faction: `{ summoned: boolean, turnsRemaining: number, cooldownRemaining: number, bearUnitId: string | null }` — store on GameState or Faction
- At the START of frost_wardens' turn activation (in warEcologySimulation.ts), check: is any frost_wardens unit on tundra? Is cooldown expired? If yes, spawn a polar bear adjacent to that unit. Set turnsRemaining=5.
- Each turn, decrement turnsRemaining. When it hits 0, remove the bear unit and set cooldownRemaining=5.
- Each turn, if cooldownRemaining > 0, decrement it.
**Tunable params**: `polarBearHp` (int, 15-25), `polarBearAttack` (int, 4-7), `polarBearDefense` (int, 1-3), `summonDuration` (int, 3-7), `cooldownDuration` (int, 3-7)

### 4. Hill Clan — "Bulwark" (units with fortress_training component)
**Effect**: Units with the fortress_training component grant a defense bonus to all adjacent friendly units during combat.
**Hook**: In `warEcologySimulation.ts` where `flanking` is calculated (~line 974/1546), also call a new function `getBulwarkBonus()`. This function checks: for each ally adjacent to the DEFENDER, does that ally have a component with tag `fortress`? If so, add bulwark bonus. Apply as a `situationalDefenseModifier`.
**Alternative simpler approach**: Add a new function in zocSystem.ts alongside calculateFlankingBonus. Call it `calculateBulwarkBonus(defender, state, registry)` — iterates defender's neighbors, checks if any friendly unit has fortress_training in its component list. Returns defense bonus.
**Tunable param**: `bulwarkDefenseBonus` (float, 0.1-0.4) — added as defense multiplier

### 5. Jungle Clan — "Lethal Venom" (units with poison tag)
**Effect**: When jungle clan units inflict poison, the poison deals X damage per turn instead of the default 1.
**Hook**: In `warEcologySimulation.ts:198-199`, where poison damage is applied (`updatedUnit = { ...updatedUnit, hp: Math.max(0, updatedUnit.hp - 1) }`), check if the unit that inflicted the poison belongs to jungle_clan. If so, use `venomDamagePerTurn` instead of 1.
**Implementation detail**: The current code only stores `poisoned: boolean` on the unit, not WHO poisoned it. You'll need to either:
  (a) Add a `poisonedBy: FactionId | undefined` field to the Unit type, or
  (b) Track it differently — check all enemy units that could have poisoned this unit
Option (a) is cleaner. Modify the poison infliction at line 1602-1603 to also set `poisonedBy: activeUnit.factionId`.
**Tunable param**: `venomDamagePerTurn` (int, 2-4)

### 6. Druid Circle — "Forest Mending" (units with druidic_rites component)
**Effect**: Druid units heal additional HP per turn when on forest or jungle terrain.
**Hook**: In `warEcologySimulation.ts` around line 909-910 where healing happens, check: if unit's faction is druid_circle AND unit is on forest/jungle terrain, add `forestHealRate` extra healing.
**Tunable param**: `forestHealRate` (int, 2-5) — extra HP healed per turn

### 7. Steppe Clan — "Hit and Run" (cavalry_frame)
**Effect**: After a steppe clan cavalry unit attacks and survives, it can retreat 1 hex away from the enemy.
**Hook**: In `warEcologySimulation.ts`, after combat resolution (~line 1600-1650), if attacker is steppe_clan AND chassis is cavalry AND attacker survived AND attacker is not routed, find the best retreat hex (hex furthest from any enemy, adjacent to current position, passable, unoccupied) and move the attacker there.
**Tunable params**: None (flat ability)

### 8. Coral People — "Tidal Assault" (naval_frame)
**Effect**: When a coral_people naval unit attacks from a water tile (coast/river) to a land tile, it gets an attack bonus.
**Hook**: In `warEcologySimulation.ts` where combat modifiers are calculated (~line 1546-1574), check: if attacker is coral_people AND attacker terrain is water (coast/river) AND defender terrain is land, add tidalAssaultBonus to situationalAttackModifier.
**Tunable param**: `tidalAssaultBonus` (float, 0.1-0.4)

### 9. Plains Riders — "Swift Charge" (cavalry_frame)
**Effect**: Plains riders get a stronger charge bonus than other factions.
**Hook**: In `warEcologySimulation.ts` where `chargeAttackBonus` is calculated (~line 1558), if attacker is plains_riders AND is charging, use `swiftChargeBonus` instead of the default 0.15.
**Tunable param**: `swiftChargeBonus` (float, 0.2-0.5)

## Content JSON Structure

Create `src/content/base/signatureAbilities.json`:
```json
{
  "desert_nomads": {
    "endlessStride": true
  },
  "savannah_lions": {
    "stampedeBonus": 0.3
  },
  "frost_wardens": {
    "polarBearHp": 20,
    "polarBearAttack": 5,
    "polarBearDefense": 2,
    "summonDuration": 5,
    "cooldownDuration": 5
  },
  "hill_clan": {
    "bulwarkDefenseBonus": 0.25
  },
  "jungle_clan": {
    "venomDamagePerTurn": 3
  },
  "druid_circle": {
    "forestHealRate": 3
  },
  "steppe_clan": {
    "hitAndRun": true
  },
  "coral_people": {
    "tidalAssaultBonus": 0.2
  },
  "plains_riders": {
    "swiftChargeBonus": 0.3
  }
}
```

## Balance Override Integration

All tunable numeric params must be overrideable via the Optuna balance system:
1. Add new paths to `BalanceOverrides` type in `src/balance/types.ts`
2. Handle loading in `loadRulesRegistry.ts`
3. The Optuna script will add knobs — we don't need to modify it now, but the override paths should be: `signatureAbilities.<factionId>.<param>`

## Implementation Order
1. Create `signatureAbilities.json` content file
2. Add loading to `loadRulesRegistry.ts` + `RulesRegistry` type
3. Create `signatureAbilitySystem.ts` with all ability check functions
4. Implement easy wins: Endless Stride (movement), Lethal Venom (poison damage), Forest Mending (heal)
5. Implement combat modifiers: Stampede, Tidal Assault, Swift Charge, Bulwark
6. Implement complex: Polar Call (new chassis + summon/removal lifecycle)
7. Implement complex: Hit and Run (post-combat movement)
8. Add balance override paths to types.ts

## Important Constraints
- Do NOT break existing game logic — all changes are additive
- Follow existing code patterns (immutable state updates, function signatures)
- The `warEcologySimulation.ts` file is large — be surgical with edits
- All new unit fields (like `poisonedBy`, `turnsRemaining`) need to be added to the Unit type in `src/features/units/types.ts`
- For the polar bear, the summon state tracking needs to survive across turns. Consider adding it to GameState or Faction type.
- Run `node --import tsx --no-warnings -e "import { scoreBalanceSummary } from './src/balance/objective.js'; console.log('OK')"` after changes to verify compilation (there are ~170 pre-existing errors from tsconfig, but runtime imports should work)
