# Task: Implement Tag-Driven Combat Abilities (Step 1 of Tag-Driven Ability System)

## Context
We are refactoring faction-gated signature abilities to be tag-driven, so any faction that learns a foreign ability domain can use it on their units. This is Step 1 of the system described in `docs/design/tag-driven-abilities.md`. Only refactor the combat bonuses — do NOT implement the knowledge acquisition system, exposure tracking, or prototype cost scaling (those are Steps 2-4).

## Root Cause
Six signature abilities are hardcoded to `factionId === '...'` checks in `warEcologySimulation.ts`. They should instead check prototype tags, so any unit with the right tags gets the ability regardless of which faction built it.

## Current State — Exact Locations to Refactor

### 1. Stampede Bonus (savannah_lions → elephant tag)
- **File**: `src/systems/warEcologySimulation.ts`
- **Line**: ~1908-1912
- **Current**: `if (isChargeAttack && !braceTriggered && activeUnit.factionId === 'savannah_lions' && prototype.chassisId === 'elephant_frame')`
- **Target**: Check if prototype has `elephant` tag (from chassis or components). Remove factionId check.
- **Bonus value**: Still read from `registry.getSignatureAbility('savannah_lions')?.stampedeBonus` for now (Step 2 will make this domain-based).

### 2. Swift Charge (plains_riders → cavalry tag + charge)
- **File**: `src/systems/warEcologySimulation.ts`
- **Line**: ~1902-1905
- **Current**: `if (isChargeAttack && !braceTriggered && activeUnit.factionId === 'plains_riders')`
- **Target**: Check if prototype has `cavalry` tag. Remove factionId check.
- **Bonus value**: Still read from `registry.getSignatureAbility('plains_riders')?.swiftChargeBonus`.

### 3. Hit and Run (steppe_clan → cavalry + skirmish tags)
- **File**: `src/systems/warEcologySimulation.ts`
- **Line**: ~2042-2043
- **Current**: `if (!result.attackerDestroyed && updatedAttacker.factionId === 'steppe_clan' && prototype.chassisId === 'cavalry_frame')`
- **Target**: Check if prototype has both `cavalry` and `skirmish` tags. Remove factionId and chassisId checks.
- **Toggle**: Still read from `registry.getSignatureAbility('steppe_clan')?.hitAndRun`.

### 4. Tidal Assault (coral_people → naval + shock tags)
- **File**: `src/systems/warEcologySimulation.ts`
- **Line**: ~1853-1859
- **Current**: `if (activeUnit.factionId === 'coral_people' && prototype.chassisId === 'naval_frame')`
- **Target**: Check if prototype has both `naval` and `shock` tags. Remove factionId and chassisId checks.
- **Bonus value**: Still read from `registry.getSignatureAbility('coral_people')?.tidalAssaultBonus`.

### 5. Nature's Blessing / Forest Mending (druid_circle → druid/healing tag)
- **File**: `src/systems/warEcologySimulation.ts`
- **Line**: ~1200-1204
- **Current**: `if (factionId === 'druid_circle') { healRate += forestHealBonus; }`
- **Target**: Check if the unit's prototype has `druid` or `healing` tag. Any faction's unit with these tags gets the bonus.
- **Bonus value**: Still read from `registry.getSignatureAbility('druid_circle')?.forestHealRate`.
- **Note**: The `signatureAbilitySystem.ts` function `getForestHealBonus()` at line ~119 still has a terrain gate (`terrainId !== 'forest' && terrainId !== 'jungle'`). That function is currently UNUSED (the inline check at line 1200 replaced it). You can leave it or clean it up.

### 6. Bulwark Defense (hill_clan → fortress tag, partially done)
- **File**: `src/systems/warEcologySimulation.ts`
- **Line**: ~1878-1885
- **Current**: Uses `registry.getSignatureAbility('hill_clan')?.bulwarkDefenseBonus` and passes it to `getBulwarkDefenseBonus()`.
- **Target**: The `hasFortressTraining()` check in `signatureAbilitySystem.ts` already uses component tags (good). The remaining issue is the bonus *value* is read from hill_clan's signature ability. For now, keep reading from `registry.getSignatureAbility('hill_clan')` — but remove any `factionId === 'hill_clan'` gate. Any faction's unit with `fortress`-tagged components adjacent to a defender should trigger Bulwark.

### 7. Lethal Venom (jungle_clan) — ALREADY TAG-DRIVEN ✅
- `combatSystem.ts:262-264`: `canInflictPoison()` checks `prototype?.tags?.includes('poison')`. No change needed.

### 8. Polar Call (frost_wardens) — SUMMON SYSTEM, separate category
- `warEcologySimulation.ts:903-1078`: Summoning creates new units. This is fundamentally different from combat bonuses and should NOT be refactored in this step. It will be addressed in the knowledge acquisition system (Step 2).

## Helper Functions Available

In `src/systems/signatureAbilitySystem.ts`:
- `hasFortressTraining(unitId, state, registry)` — already checks component tags
- `isElephantUnit(prototype)` — checks chassis or tags
- `getBulwarkDefenseBonus(defender, state, registry)` — checks adjacent fortress units

In `src/design/assemblePrototype.ts`:
- Tags are already merged from chassis + components into the prototype: `Array.from(new Set([...chassis.tags, ...component.tags]))` at line ~75.

## What Tags Currently Exist on Prototypes

From `components.json`, the relevant component tags are:
- `poison_arrows`: `["poison", "ranged"]`
- `skirmish_drill`: `["skirmish", "mobility"]`
- `fortress_training`: `["fortress", "defensive"]`
- `tidal_drill`: `["naval", "amphibious", "shock"]`
- `rivercraft_training`: `["river", "amphibious"]`
- `shock_drill`: `["shock", "formation"]`
- `druidic_rites`: `["druid", "healing", "forest"]`
- `cold_provisions`: `["cold", "endurance"]`
- `elephant_harness`: `["elephant", "shock", "large"]`

From `chassis.json`:
- `cavalry_frame`: tags include `"mounted"`
- `elephant_frame`: tags include `"elephant"`, `"beast"`
- `naval_frame`: tags include `"naval"`
- `camel_frame`: tags include `"camel"`, `"desert"`
- `infantry_frame`: tags include `"infantry"`

**Important**: `cavalry_frame` does NOT have a `"cavalry"` tag — it has `"mounted"`. You need to either:
(a) Add `"cavalry"` to the cavalry_frame chassis tags in `chassis.json`, OR
(b) Check for `"mounted"` tag instead of `"cavalry"` in the Swift Charge and Hit and Run logic.

Option (a) is cleaner because the design doc and ability domain names reference "cavalry".

## Changes Needed Summary

1. **`chassis.json`**: Add `"cavalry"` tag to `cavalry_frame` (currently only has `"mounted"`)
2. **`warEcologySimulation.ts`**: Refactor 6 faction-gated checks to tag checks (Stampede, Swift Charge, Hit and Run, Tidal Assault, Nature's Blessing, Bulwark gate)
3. **`signatureAbilitySystem.ts`**: Clean up `getForestHealBonus()` if it's dead code (the terrain gate version)
4. **Tests**: Run `npx tsc --noEmit` and `npm run test:balance` to verify no regressions

## Verification
- `npx tsc --noEmit` — zero TypeScript errors
- `npm run test:balance` — balance harness passes (baseline may need update if behavior changes intentionally)
- Manual check: grep for remaining `factionId === '` checks in combat ability code — should only remain for Polar Call (summon system) and AI-specific scoring logic

## Risks
- **Balance regression**: Changing who gets abilities may shift win rates. The Optuna balance harness will catch this. Run a smoke test after changes.
- **Tag collision**: If multiple components/chassis contribute the same tag, abilities still trigger (which is correct — stacking is the design intent).
- **AI scoring**: Lines ~388-423 in `warEcologySimulation.ts` have faction-specific AI chassis preference bonuses. These are NOT combat abilities — they're AI production decisions. Leave them alone for now.
