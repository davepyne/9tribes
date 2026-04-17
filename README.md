# War-Civ V2

> ⚠️ **This game is in beta-testing.** Features, balance, and code are actively evolving. Expect breaking changes.

---

**War-Civ V2** is a turn-based strategy simulation focused on how civilizations evolve through war. It is **not** a traditional 4X game — it optimizes for conflict-driven evolution, military identity, emergent behavior, and simple systems that create complex outcomes.

> *If a system does not meaningfully affect war, cut it.*

## Core Pillars

- **Combat drives everything** — No separate economy minigame; resources and technology emerge from conflict
- **Military identity emerges** — Terrain, battle outcomes, and doctrines shape each faction's personality
- **Technology from environment + combat** — No linear tech trees; learn from what you fight and where you fight it
- **Units are persistent** — Veterans carry history; every battle leaves marks
- **Prototypes over unit tiers** — Chassis + components create unit variety

## Tech Stack

| Layer | Technology |
|-------|-------------|
| Game Engine | TypeScript (`src/`) |
| Frontend | Vite + React 18 + Phaser 3 (`web/`) |
| Testing | Vitest |
| Balance Optimization | Optuna |

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd war-civ-v2

# Install dependencies
npm install
```

### Running the Game

```bash
# Start the backend dev server (game simulation)
npm run dev

# In a separate terminal, start the frontend dev server
npm run web:dev
```

Open `http://localhost:5173` in your browser.

### Build

```bash
# Build backend
npm run build

# Build frontend
npm run web:build
```

### Testing

```bash
# Run all tests
npm test

# Run architecture boundary tests
npm run test:architecture

# Run balance harness (requires setup)
npm run balance:harness
```

## Project Structure

```
war-civ-v2/
├── src/                    # Game engine (TypeScript)
│   ├── core/              # Primitives: hex math, grid, RNG, enums, IDs
│   ├── content/base/      # JSON data: chassis, components, civilizations, terrains
│   ├── data/              # Registry types, content loaders
│   ├── features/         # Domain entities: units, factions, cities, villages
│   ├── systems/          # 51 rule-execution modules (combat, movement, AI, etc.)
│   ├── game/             # GameState, scenario builders, game loop
│   ├── world/            # Map generation, terrain types
│   ├── balance/          # Optuna balance evaluation
│   └── replay/           # Replay recording/playback
│
├── web/                    # Frontend application
│   ├── src/
│   │   ├── app/          # React app shell, routing, audio
│   │   ├── game/
│   │   │   ├── controller/  # GameSession, GameController
│   │   │   ├── phaser/      # Phaser scenes and rendering systems
│   │   │   └── view-model/  # UI state model
│   │   └── ui/           # React components (HUD, inspectors, modals)
│   └── public/assets/    # Sprites, audio
│
├── tests/                 # Vitest tests
├── docs/                  # Implementation plans, reference docs
└── .slim/                # Auto-generated architecture indexes
```

## Key Systems (51 total)

- **Combat** — Attack resolution, counter-attacks, multi-axis attacks, kill-shot bonuses
- **Movement** — Path execution, Zone of Control, opportunity attacks
- **AI** — Strategic decisions, tactical positioning, production/research priorities
- **Identity** — Faction identity, veterancy, signature abilities, sacrifice, learn-by-kill
- **Progression** — Domain-based research, emergent synergies, knowledge tracking
- **Conquest** — City capture, village capture, slaver mechanic, siege walls
- **World** — Fog of war, healing, territory, supply lines

## Architecture Notes

### Dual Combat Paths ⚠️

**Critical:** Any combat mechanic must be implemented in **both** paths:

| Path | File | Used By |
|------|------|---------|
| AI/Autonomous simulation | `src/systems/warEcologySimulation.ts` | All AI turns |
| Player-facing live-play | `web/src/game/controller/GameSession.ts` | Player actions |

### Feedback Chain

For UI/audio feedback, follow this chain rather than scattering ad hoc calls:

```
GameSession.ts → GameController.ts → clientState.ts → sfxManager.ts
```

## Contributing

This is an active development project. If you'd like to contribute:

1. Check existing issues or create new ones for bugs/features
2. Ensure `npm test` passes before submitting changes
3. Run `npm run test:architecture` to verify architecture boundaries

## License

Open-source project. See individual files for licensing terms.

---

**Version:** 0.1.0-mvp  
**Status:** Beta-testing
