# /balance — AI-Driven Balance Optimization Loop

Iteratively tune game balance parameters using AI analysis of harness metrics.

## Usage

```
/balance                    — Run a quick evaluation, analyze, propose changes
/balance validate           — Run full validation (10+ seeds, 150 turns)
/balance focus <faction>    — Focus iteration on a specific faction's problems
```

## What To Do

### Phase 1: Quick Evaluation

Run a fast harness evaluation (3 seeds × 75 turns) and score it:

```bash
npx tsx scripts/evaluateBalance.ts <<< '{"seeds": [11, 37, 97], "maxTurns": 75}'
```

Save the output — it contains both `summary` (per-faction metrics) and `objective` (score breakdown).

### Phase 2: AI Analysis

Read the evaluation output and analyze per-faction balance health. For each faction, assess:

1. **Survival**: Is `survivedGames` at or near `totalSeeds`? Low survival = faction can't compete.
2. **Army health**: Is `avgLivingUnits` in line with other factions? Low = economy or production failure.
3. **Territory**: Is `avgCities` competitive? Low = can't hold or capture cities.
4. **Combat engagement**: Is `avgKills` in line with other factions? Low = can't fight; high = dominating.
5. **Competitive product** (`avgLivingUnits × avgCities`): Is it close to the batch mean?
6. **Progression**: Are `avgUnlockedRecipes`, `avgT1DomainCount`, `avgT2DomainCount` progressing?

Cross-reference with current content values in:
- `src/content/base/chassis.json` — base unit stats
- `src/content/base/components.json` — weapon/armor/training bonuses
- `src/content/base/civilizations.json` — faction capability seeds
- `src/content/base/signatureAbilities.json` — signature ability parameters

### Phase 3: Propose Targeted Changes

Based on the analysis, propose 3-8 parameter changes. For each change, state:
- **What** parameter to change and by how much (with the override JSON path)
- **Why** — which metric it addresses and the causal chain
- **Expected effect** — which metric(s) should improve and rough magnitude

Format proposals as a `BalanceOverrides` JSON object that can be fed directly to the evaluation harness:
```json
{
  "components": { "blowgun": { "attackBonus": 3 } },
  "chassis": { "infantry_frame": { "baseHp": 10 } }
}
```

**Guidelines for proposals:**
- Prefer component and chassis tweaks over faction capability seeds — they're more targeted
- Don't change more than 5-8 parameters per iteration — small moves compound
- If a faction is weak on multiple axes, address the root cause (usually combat power or economy)
- Cross-check proposed values against the content JSONs to ensure they're reasonable (within ±50% of current)
- Never change boolean identity flags (endlessStride, hitAndRun)
- Use the Optuna knob ranges in `scripts/optuna_optimize.py` as guardrails for reasonable bounds

### Phase 4: Apply and Re-evaluate

After the user approves the changes, run the evaluation again with overrides:

```bash
npx tsx scripts/evaluateBalance.ts <<< '{"seeds": [11, 37, 97], "maxTurns": 75, "overrides": {<proposed overrides>}}'
```

Compare the new score and breakdown to the previous iteration. Report:
- Score change (lower is better)
- Which metrics improved, which worsened
- Whether the targeted factions actually improved

### Phase 5: Iterate or Validate

- If score improved by >5%: propose another round of refinements
- If score improved by <5%: you're converging — suggest validating
- If score worsened: revert the last change, try a different approach
- If score plateaued: stop and validate

When the user says to validate (or after convergence), run the full validation:

```bash
npx tsx scripts/evaluateBalance.ts <<< '{"stratified": true, "maxTurns": 150}'
```

Or with accumulated overrides:
```bash
npx tsx scripts/evaluateBalance.ts <<< '{"stratified": true, "maxTurns": 150, "overrides": {<final overrides>}}'
```

### Phase 6: Apply to Content

If the user approves the final parameters, update the source content JSON files directly:
- `src/content/base/chassis.json`
- `src/content/base/components.json`
- `src/content/base/civilizations.json`
- `src/content/base/signatureAbilities.json`

## Key Files

- Objective function: `src/balance/objective.ts`
- Harness metrics: `src/systems/balanceHarness.ts`
- Override types: `src/balance/types.ts`
- Evaluation entry: `scripts/evaluateBalance.ts`
- Content JSONs: `src/content/base/*.json`
- Optuna knob ranges (guardrails): `scripts/optuna_optimize.py` (KNOBS list)

## Quick Reference: Faction Identity

| Faction | Home Biome | Signature Unit | Core Component | Key Mechanic |
|---------|-----------|---------------|---------------|-------------|
| jungle_clan | jungle | Serpent (summon) | blowgun/poison | Lethal Venom, stealth |
| druid_circle | forest | Treefolk (summon) | druidic_rites | Treefolk summon, sustain |
| steppe_clan | plains | Warlord (summon) | light_mount/chariot | Warlord summon, hit & run |
| hill_clan | hill | Siege Golem (summon) | fortress_training | Golem summon, siege |
| coral_people | coast | Galley (summon) | pistol/ship_cannon | Wall defense, greedy capture |
| desert_nomads | desert | Camel Swarm | desert_forged/desert_regen | Endless Stride, swarm |
| savannah_lions | savannah | War Elephant | shock_drill/elephant_harness | Stampede, elephant charge |
| river_people | river | Alligator (summon) | rivercraft_training | Sneak attack, amphibious |
| frost_wardens | tundra | Polar Bear (summon) | cold_provisions/frost_forge | Bear summon, endurance |

## Behavior

- Start each iteration by running the harness — don't assume you remember the previous metrics exactly
- Always show the before/after comparison when re-evaluating
- Keep a running JSON object of accumulated overrides across iterations
- If the user interrupts, save the current overrides and score to memory
- Don't propose changes that would require code changes — only parameters tuneable via BalanceOverrides
