# War-Civ 2 MVP Specification

## Overview

This document defines the authoritative MVP scenario for War-Civ 2, a hex-based tactical strategy game demonstrating core gameplay loops with minimal complexity.

---

## Scenario Specification

### Map Configuration

| Property | Value |
|----------|-------|
| Grid Size | 16 columns × 12 rows |
| Total Hexes | 192 |
| Seed | 42 (deterministic) |

### Terrain Distribution

| Terrain | Percentage | Approx. Tiles | Movement Cost |
|---------|------------|---------------|---------------|
| Plains | 60% | ~115 | 1 |
| Forest | 25% | ~48 | 2 |
| Hills | 15% | ~29 | 2 |

### Factions

#### Red Clan
- **Color**: Red (#cc3333)
- **Capital**: (q=2, r=5)
- **Starting Units**: 2 Infantry (infantry_frame + basic_spear + simple_armor)
- **Playstyle**: Melee-focused, aggressive

#### Blue Clan
- **Color**: Blue (#3333cc)
- **Capital**: (q=13, r=6)
- **Starting Units**: 2 Ranged (ranged_frame + basic_bow + simple_armor)
- **Playstyle**: Ranged-focused, defensive

### Map Improvements

| Type | Position | Effect |
|------|----------|--------|
| Field Fort | (q=8, r=5) | +20% defense bonus |

---

## How to Run the Scenario

### Prerequisites
- Node.js 18+
- npm or yarn

### Commands

```bash
# Install dependencies
npm install

# Build the TypeScript project
npm run build

# Run the MVP scenario simulation
npm run dev

# Run the test suite
npm test
```

### Expected Output

When running `npm run dev`, you will see:
1. **Map Summary** - Terrain distribution and hex count
2. **Faction Status** - Units, positions, HP, XP, research
3. **Turn-by-Turn Events** - Movement, combat, promotions
4. **Final State** - Victory condition or stalemate

---

## Success Criteria Checklist

The MVP is complete when all criteria pass:

### Build & Run
- [x] Project builds successfully (`npm run build`)
- [x] CLI runs scenario from deterministic seed (`npm run dev`)
- [x] Test suite passes (`npm test`)

### Core Gameplay
- [x] Two factions exist on hex map (Red Clan, Blue Clan)
- [x] Units can move with terrain costs (plains=1, forest/hills=2)
- [x] Combat resolves with terrain + fort modifiers
- [x] Units gain XP from combat and can promote
- [x] Research progresses and unlocks components
- [x] Unit history records battle events

### Technical Quality
- [x] Deterministic RNG (seeded random)
- [x] Functional programming style (pure functions, immutable state)
- [x] Data-driven design (content in JSON files)
- [x] No over-abstraction (simple typed records)

---

## System Integration Points

### Combat Flow

```
Combat System (resolveCombat)
    ↓
awardCombatXP() → Unit.xp updated
    ↓
canPromote() checks XP threshold
    ↓
tryPromoteUnit() → Unit.veteranLevel updated
    ↓
recordPromotion() → Unit.history updated
    ↓
getVeteranModifiers() → applied to future combat
```

### Veterancy Progression

| Level | XP Required | Attack Bonus | Defense Bonus |
|-------|-------------|--------------|---------------|
| Green | 0 | +0% | +0% |
| Regular | 10 | +5% | +5% |
| Veteran | 25 | +10% | +10% |
| Elite | 50 | +15% | +15% |

### Research Flow

```
startResearch() → ResearchState.activeNodeId set
    ↓
addResearchProgress() → ResearchState.progress increases
    ↓
On completion (progress >= 100)
    ↓
ResearchState.completedNodes updated
    ↓
ResearchState.unlockedComponents expanded
    ↓
validatePrototype() can use unlocked components
```

### Movement & Occupancy

```
getValidMoves() → checks terrain cost, occupancy
    ↓
canMoveTo() → validates single hex
    ↓
moveUnit() → updates position, reduces movesRemaining
    ↓
OccupancyMap updated
```

### History Recording

Events recorded per unit:
- `unit_created` - When unit is spawned
- `combat` - When unit participates in battle
- `promotion` - When unit advances in veterancy
- `kill` - When unit destroys enemy

---

## Key Source Files

| File | Purpose |
|------|---------|
| `src/game/scenarios/mvp.ts` | Scenario configuration (map, factions, units) |
| `src/game/buildMvpScenario.ts` | Builds complete GameState from config |
| `src/main.ts` | CLI runner for simulation |
| `src/game/types.ts` | Core type definitions |
| `src/systems/combatSystem.ts` | Combat resolution |
| `src/systems/researchSystem.ts` | Research progression |
| `src/systems/historySystem.ts` | Event recording |

---

## Victory Conditions

The MVP scenario supports the following victory conditions:
1. **Elimination** - Destroy all enemy units
2. **Capital Capture** - Occupy enemy capital city
3. **Stalemate** - No decisive victory after 20 rounds

---

## Future Enhancements (Post-MVP)

The following are documented for future development:
- AI decision-making (goal-oriented action planning)
- UI rendering (Phaser.js or Canvas)
- Save/load game state
- Additional unit types and chassis
- Research tree with branching paths
- Fog of war