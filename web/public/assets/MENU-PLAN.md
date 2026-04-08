# Title Screen & Menu Plan

## Assets
- `title-screen.jpg` — starting splash screen
- `menu-background.png` — reusable background for all menu screens

## Font Recipe
- **Font:** Cinzel Bold
- **Case:** ALL CAPS
- **Tracking (letter-spacing):** +10px
- **Color:** `#F2D7A1`
- **Shadow:** `#C9A86A` at low opacity (5–10%)

## Menu Flow

### Screen 1 — Title Screen
- Background: `title-screen.jpg`
- Game title + "Press Start" or "Play" button
- Transitions to Screen 2

### Screen 2 — Mode Select
- Background: `menu-background.png`
- Three options:
  - **Single Player** → Screen 3
  - **Multiplayer** → (disabled/coming soon for now)
  - **Load Game** - Load game option

### Screen 3 — Difficulty and Map Size
- Background: `menu-background.png`
- Difficulty level selection (Easy / Normal / Hard)
- **Map size:** Small / Medium / Large (maps to width × height)

### Screen 5 — Tribe Selection
- Background: `menu-background.png`
- Pick player tribe from the 9 tribes
- "Start Game" button → launches game with procedural map

---

## Map Generation — What Already Exists

### `generateClimateBandMap()` (`src/world/generation/generateClimateBandMap.ts`)
- Full procedural map generator
- Climate bands: arctic → tundra → temperate → warm → desert
- Rivers, lakes, terrain variety
- Faction start position placement with biome matching and separation validation
- Options: width, height, mode, startSeparation, lakeChance, riverCountMin/Max

### `buildMvpScenario()` (`src/game/buildMvpScenario.ts`)
- Already supports `mapMode: 'randomClimateBands'` — just a toggle
- Accepts `BuildMvpScenarioOptions` with `mapMode`, `registry`, `balanceOverrides`
- Used by balance harness in randomClimateBands mode already

### `generateMvpMap()` (`src/world/generation/generateMvpMap.ts`)
- Fixed/deterministic map (current bootstrap default)
- Will be replaced by climate band generator for the menu flow

---

## Wiring Needed (Menu → Game)

### What `GameSession` needs to accept
```typescript
interface GameSessionOptions {
  humanControlledFactionIds?: string[];
  difficulty?: DifficultyLevel;
  mapMode?: MapGenerationMode;        // 'randomClimateBands' | 'fixed'
  mapSize?: 'small' | 'medium' | 'large';  // maps to width × height
  selectedFactions?: string[];        // which factions are in the game
}
```

### What needs to change
1. **`GameSessionOptions`** — add `mapMode`, `mapSize`, `selectedFactions`
2. **`GameSession.bootstrap()`** — pass `mapMode` through to `buildMvpScenario()`
3. **`buildMvpScenario()`** — accept `selectedFactions` to control which tribes spawn
4. **`PlayClient.tsx`** — read new params from URL (for testing before menu is built):
   - `?map=random` (default for menu flow)
   - `?size=medium`
   - `?tribes=steppe_clan,frost_clan,desert_clan`
   - `?player=steppe_clan` (replaces hardcoded `humanControlledFactionIds`)
5. **`PlayStateSource`** — the `fresh` source type may need to carry map options

### Map size presets (suggested)
| Size | Width | Height |
|------|-------|--------|
| Small | 30 | 22 |
| Medium | 40 | 30 |
| Large | 50 | 38 |

Note: The climate band generator defaults are now 40×30 (matching the bootstrap MVP map). This is the "medium" size.

### Testing URLs (before menu is built)
- `/play?bootstrap=fresh&seed=42&difficulty=normal&map=random&size=medium&player=steppe_clan`
- `/play?bootstrap=fresh&seed=42&map=fixed` (current bootstrap behavior, unchanged)

---

## Implementation Order
1. Wire `mapMode` + `mapSize` + `selectedFactions` through GameSession → buildMvpScenario (backend plumbing)
2. Build the React menu screens (frontend)
3. Connect menu state → GameSession launch
4. Polish: animations, transitions, tribe preview cards
