# Design Proposals Index

## Implemented (Wave 3 - 2026-03-26)

| # | Gap | Key Insight | Result |
|---|-----|-------------|--------|
| 20 | Steppe Clan Dominance | Infantry HP 10->9, chassis diversity penalty, cavalry access at horsemanship 4 | steppe wins 10->3, faction balance restored |
| 21 | Siege-to-Capture Pipeline | WALL_DAMAGE_PER_TURN 10->20, encirclement threshold 4->3 | totalCityCaptures 0->2 |
| 22 | Encirclement Frequency | Siege intent scoring (+2/friendly) enables AI coordination | totalSiegesStarted 2->16 |

## Implemented (Wave 4 - 2026-03-26)

| Gap | Key Insight | Result |
|-----|-------------|--------|
| Hill Clan Engineering | Units with fortification >= 8 holding position auto-build field forts (+1 defense) | hill WE 13.7->6.2, hill wins 1->2 |
| Steppe Horse Archers | Cavalry gets range 2 (ranged attacks, no retaliation), flee at 50% HP | steppe wins 1->3, cavalry identity realized |

## Deferred

| # | Gap | Tier | File | Key Insight |
|---|-----|------|------|-------------|
| - | Adaptive AI | high | [link](adaptive-ai/DESIGN.md) | Faction baselines + domain doctrines + supply-aware production create evolving AI identity without hard-coded tribe AIs |
| - | Research Choice | medium | [link](research-choice/DESIGN.md) | Strategy pattern (`auto`/`manual`) for player research control |
| - | Buildable Improvements | medium | [link](buildable-improvements/DESIGN.md) | Extend `completeProduction()` to handle improvement items |
| - | Terrain Combat | low | [link](terrain-combat/DESIGN.md) | Terrain-specific attack modifiers (uphill penalty, forest ambush) |
| - | Supply Attrition | low | [link](supply-attrition/DESIGN.md) | Distance-based HP loss for units far from friendly cities |
| - | Map Generation | low | [link](map-generation/DESIGN.md) | Noise-based terrain with mountains, rivers, chokepoints |
| - | Fog of War | low | [link](fog-of-war/DESIGN.md) | Per-faction visibility, detection range, scouting value |
| - | Diplomacy | low | [link](diplomacy/DESIGN.md) | Alternate victory conditions, relation tracking |
