# 9 Tribes

> ⚠️ **Early access / active development.** Balance, features, and mechanics are still evolving.

**9 Tribes** is a turn-based strategy game about civilizations shaped by war. It's not a traditional 4X — there are no economy screens, no linear tech trees, no peaceful victory conditions. Combat drives everything: technology, identity, and unit variety all emerge from what happens on the battlefield.

## How It Works

### Combat drives identity

Every faction starts simple — two units, a home biome, and a native combat domain. From there, everything is earned:

- **Units learn from kills.** When a unit kills an enemy, it can absorb the enemy's combat domain. A Jungle Clans spearman that kills a cavalry unit might learn skirmish tactics.
- **Sacrifice unlocks research.** Units can be sacrificed at a home city to permanently encode learned abilities into faction-wide research.
- **Terrain shapes doctrine.** The map exerts capability pressure — fighting in jungles pushes factions toward poisoncraft; fighting on plains pushes toward horsemanship.
- **Identity is emergent.** Two Jungle Clans playthroughs can produce completely different military identities depending on who they fight and where.

### No tech trees

There are 10 combat domains in the game. Factions don't pick them from a menu — they learn them through combat encounters, sacrifice rituals, and terrain-driven research. A faction that started on the tundra can end up with poison cavalry if they fought the Jungle Clans hard enough.

### Pair synergies

When a faction knows two compatible domains, units carrying both tags unlock combined effects:

- **Toxic Bulwark** (venom + fortress) — Fortress units radiate a poison zone around them
- **Stampeding Death** (venom + charge) — Charge attacks inflict double poison duration
- **Poisoned Skirmish** (venom + hitrun) — Skirmish attacks also apply poison

There are 55 possible pair synergies. They create late-game build diversity — a plains faction can hybridize into poison-cavalry by learning venom from kills.

## The 9 Tribes

| Tribe | Home | Domain | Starts With | Playstyle |
|-------|------|--------|-------------|-----------|
| **Jungle Clans** | Jungle | Venom | Venom Spearman, Venom Archer | Poison attrition, stealth, venom stacks |
| **Druid Circle** | Forest | Nature Healing | Druid Guardian, Druid Archer | Sustain, healing auras, forest control |
| **Steppe Riders** | Plains | Skirmish Pursuit | Horse Archer, Steppe Warrior | Cavalry shock, hit-and-run, mobility |
| **Hill Engineers** | Hills | Fortress | Hill Defender, Hill Archer | Fortification, siege engines, bulwark defense |
| **Pirate Lords** | Coast | Slaving | Boarding Party, Pistol Gunner, Slave Trireme | Naval raids, capture enemies, village plunder |
| **Desert Nomads** | Desert | Camel Adaptation | Desert Archer, Camel Warrior | Camel mobility, desert endurance, anti-cavalry |
| **Savannah Lions** | Savannah | Charge | Shock Infantry, Assegai Impi | Elephant charges, stampede, open-ground tempo |
| **River People** | River | River Stealth | River Infantry, River Galley | Amphibious assault, river mobility, sneak attacks |
| **Arctic Wardens** | Tundra | Heavy Hitter | Frost Guard, Ice Archer | Cold endurance, armor piercing, polar bear summons |

Pirate Lords start with 3 units (all others have 2). They're the only faction that can capture enemy units instead of killing them.

## Domains

| Domain | Native Tribe | What It Does |
|--------|-------------|--------------|
| Venom | Jungle Clans | Melee attacks apply poison stacks (1 damage per turn) |
| Nature Healing | Druid Circle | Self-heal 2 HP/turn; adjacent allies heal 1 HP/turn |
| Skirmish Pursuit | Steppe Riders | +2 bonus damage when you deal more than you take |
| Fortress | Hill Engineers | Adjacent allies get +30% defense |
| Slaving | Pirate Lords | Captured enemies become your units |
| Camel Adaptation | Desert Nomads | Ignore terrain movement penalties |
| Charge | Savannah Lions | Charge attacks strike first; no retaliation on kill |
| River Stealth | River People | Stealthed; first attack from stealth deals +50% damage |
| Tidal Warfare | River People | Naval-to-land attacks; enemies on coast get −25% defense |
| Heavy Hitter | Arctic Wardens | Ignore 50% armor; bonus damage to fortified targets |

## Signature Summons

Each faction can call in a powerful signature unit on cooldown:

| Summon | Tribe | HP | ATK | DEF | What Makes It Special |
|--------|-------|----|-----|-----|-----------------------|
| Serpent God | Jungle Clans | 18 | 5 | 2 | AoE poison; 3 poison damage per turn |
| Treefolk | Druid Circle | 20 | 3 | 6 | Highest defense in the game; 7-turn duration |
| Warlord | Steppe Riders | 20 | 5 | 3 | Aura buff for cavalry; plains/savannah terrain |
| Siege Golem | Hill Engineers | 22 | 6 | 5 | Highest raw stats of any summon; siege + fortress |
| Galley | Pirate Lords | 14 | 3 | 2 | Naval ranged + transport capacity |
| Ancient Alligator | River People | 15 | 5 | 2 | River/jungle/swamp ambusher |
| War Elephant | Savannah Lions | 14 | 4 | 2 | Charge + trample; knockback |
| Polar Bear | Arctic Wardens | 25 | 7 | 3 | Highest HP of any unit in the game |

## Unit Variety

Units are assembled from parts, not picked from tiers:

- **19 chassis** — infantry, ranged, cavalry, camel, elephant, chariot, naval, catapult, galley, heavy variants, plus 7 summon-only frames
- **38 components** — weapons, armor, training upgrades that slot into chassis
- **19 hybrid recipes** — named unlockable units (Healing Druids, Serpent Priest, Catapult, War Elephants, Desert Immortals, Polar Priest, etc.)

Stats follow a simple formula: `chassis base + component bonuses`. Higher-tier chassis require the faction to have learned more domains before they unlock.

## Terrain

13 terrain types, all load-bearing:

| Terrain | Move Cost | Defense | Notes |
|---------|-----------|---------|-------|
| Plains | 1 | 0 | Open ground; cavalry country |
| Forest | 2 | +25% | Healing and stealth bonuses |
| Jungle | 3 | +25% | Poison and woodcraft pressure |
| Hill | 2 | +50% | Fortification and siege country |
| Desert | 2 | −10% | Harsh; desert survival pressure |
| Oasis | 1 | +10% | Desert respite |
| Tundra | 2 | +5% | Cold and endurance pressure |
| Savannah | 1 | 0 | Open ground; formation warfare |
| Coast | 2 | +10% | Seafaring pressure; amphibious |
| River | 2 | +5% | Navigation and stealth pressure |
| Swamp | 3 | +25% | Stealth and ambush country |
| Ocean | 1 | 0 | Naval-only |
| Mountain | — | — | Impassable |

---

## For Developers

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Simulation engine | TypeScript (`src/`) — pure logic, no framework |
| Frontend | Vite 5 + React 18 + Phaser 3 (`web/`) |
| Testing | Vitest (54 test files) |
| Balance tuning | Optuna via Python harness |
| Deployment | Vercel (frontend) |

### Quick Start

```bash
git clone <repo-url>
cd 9tribes

npm install                 # engine + test deps
npm install --prefix web    # frontend deps

npm run web:dev             # play in browser → http://localhost:5173
npm run dev                 # headless CLI sim (turn-by-turn trace)
```

### Build & Test

```bash
npm run build               # type-check engine
npm run web:build           # production frontend build
npm test                    # run all tests
npm run test:architecture   # architecture boundary checks
```

### Project Structure

```
src/
  core/               Hex math, grid, RNG, enums, IDs
  content/base/       JSON data: chassis, components, factions, terrains,
                      domains, synergies, hybrid recipes, research
  data/               Registry types, content loaders
  features/           Units, factions, cities, villages, prototypes
  systems/            56 engine modules + 30 sub-modules
    combat-action/    Combat preview, resolution, application
    simulation/       Victory, environment effects, turn orchestration
    strategic-ai/     AI production, research, fronts, objectives
    unit-activation/  Per-unit activation and movement
  game/               GameState, scenarios, game loop
  world/              Map generation
  balance/            Optuna integration

web/
  src/app/            React shell, audio, GameShell
  src/game/
    controller/       GameSession (player actions), GameController
    phaser/           MapScene, renderers, combat animation
    view-model/       UI state + sprite resolution
  src/ui/             HUD, inspectors, modals
  public/assets/
    playtest-units/   46 sprites × 2 (normal + flipped)
    audio/sfx/        25 sound effects

tests/                54 Vitest test files
scripts/              Balance harness, replay export, scenario runner
```

### Architecture Gotchas

**Dual combat paths.** Any combat mechanic must exist in both paths or they silently diverge:

| Path | Entry point | Used by |
|------|------------|---------|
| AI simulation | `src/systems/warEcologySimulation.ts` | All AI turns, headless sim |
| Player live-play | `web/src/game/controller/GameSession.ts` | Browser UI |

**Audio feedback chain.** Route through `GameSession → GameController → clientState → sfxManager`. Don't scatter `new Audio()` calls.

**External state.** `FogState` and `TransportMap` live outside `GameState`.

**History arrays.** Cooldowns and transient state are tracked via `unit.history[]` / `faction.history[]`, not dedicated counters.

### Balance Tuning

```bash
npm run balance:harness              # Optuna optimization loop
npm run balance:harness:stratified   # Stratified variant
npm run balance:evaluate             # Score a candidate
npm run balance:validate             # Validate a candidate
```

---

**Version:** 0.1.0-mvp
**Status:** Active development
