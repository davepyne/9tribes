Invoke the war-civ-balance skill.

Run a smoke-test Optuna optimization (25 trials, 50 turns, stratified, random climate bands) using:
  conda run -n base python scripts/optuna_optimize.py --trials 25 --turns 50 --stratified --random

Context: We just fixed two issues:
1. frost_wardens: polar bears no longer flee (summoned units immune to routing via beast flee exclusion)
2. druid_circle: Nature's Blessing healing now universal (removed forest/jungle terrain gate)

After it finishes, read best_candidates.json from artifacts/balance-optimization/<timestamp>/ and analyze:
- Did frost_wardens and druid_circle improve vs previous runs?
- Any regressions in other factions?
- Per-faction win distribution and signature ability unit counts
- Objective score breakdown (all stddev components + penalties)
- Compare to previous best of 4.95 (Run 8)

IMPORTANT: exit code 1 from Optuna is usually just PowerShell stderr noise — always check the JSON output before reporting failure.
