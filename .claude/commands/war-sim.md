# /war-sim — Headless Scenario Runner

Run a simulation scenario and analyze AI behavior without playing the game.

## Usage
/war-sim <description of what to investigate>

## What To Do

1. Parse the user's description into simulation parameters:
   - Which factions to focus on
   - What behavior to watch for (siege response, flanking, retreat, production, etc.)
   - How many turns (default 50)
   - Difficulty level (default normal)
   - Whether a targeted scenario setup is needed

2. **For full-game runs**, execute:
   ```bash
   npx tsx scripts/runScenario.ts --seed <N> --turns <N> --difficulty <level> --focus <siege|combat|ai|strategy|research|synergy|full> --factions <id,id> --turn-range <a-b>
   ```

   **Focus modes:**
   - `siege` — siege events only
   - `combat` — combat events with damage breakdowns
   - `ai` — AI intent events (retreat, advance, siege, support)
   - `strategy` — faction strategy decisions (posture, objectives, threatened cities)
   - `research` — research start/complete, domain learning via exposure
   - `synergy` — triple stack activation/loss, research, domain learning (full synergy pipeline)
   - `full` — all events

3. **For targeted scenarios** (specific situations like "city under siege"), write a small
   ad-hoc script using the helper from `src/game/scenarios/targeted.ts`:
   ```typescript
   import { placeEnemyNearCity } from '../src/game/scenarios/targeted.js';
   // Modify a buildMvpScenario output, then run with runWarEcologySimulation
   ```
   Run it with `npx tsx`, then analyze the output.

4. If the behavior is unclear from the text report, re-run with `--json` to dump
   the raw trace, then inspect specific events.

5. Report findings concisely: what happened, what the AI did or didn't do, and
   where in the code the relevant decision is made. Propose targeted fixes.

## Example Sessions

- `/war-sim siege response` → run full game, focus on siege events + AI intent/strategy
- `/war-sim why does frost clans always lose` → compare faction metrics, check strategy events
- `/war-sim does the AI flank properly` → focus on combat events, check flanking bonuses
- `/war-sim synergy acquisition` → focus=synergy, track domain learning + triple stack formation
- `/war-sim research choices` → focus=research, see what AI picks and why

## Key Files

- Report generator: `src/systems/simulation/traceReport.ts`
- Runner script: `scripts/runScenario.ts`
- Scenario modifier: `src/game/scenarios/targeted.ts`
- Trace types: `src/systems/simulation/traceTypes.ts`
- Simulation entry: `src/systems/warEcologySimulation.ts`
