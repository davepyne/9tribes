# Design Proposal: Richer Map Generation

## Problem
Map generation (`generateMvpMap()`) creates a 16x12 grid with 3 terrain types (plains, forest, hill) in rectangular patches. No rivers, no mountains, no chokepoints, no interesting geography. Every map feels the same — flat terrain with patches.

## Constraints
- `generateMvpMap()` in `src/world/generation/generateMvpMap.ts` uses simple terrain stamping
- `buildMvpScenario()` calls `stampTerrainPatch()` to place faction-specific terrain
- Only 3 terrain types in `src/content/base/terrains.json`: plains, forest, hill
- All current terrain is passable — no impassable terrain exists
- Must work with deterministic RNG (seed-based)

## Solution
**Low priority — polish feature.** Improve map generation with:

### 1. Add terrain types
- **Mountain**: Impassable, blocks movement and vision
- **River**: Impassable except at fords, blocks movement
- **Marsh**: Passable, high movement cost (2), low defense

### 2. Noise-based generation
Replace rectangular patches with Perlin/simplex noise:
- Continuous elevation map → hill/mountain clustering
- Moisture map → forest/marsh distribution
- Rivers follow elevation valleys

### 3. Chokepoints
Mountains and rivers create natural chokepoints:
- Mountain ranges force armies through passes
- Rivers require fords or bridges (future improvement)
- Strategic positions emerge naturally

### 4. Resource nodes (optional)
Special hexes with bonus yields:
- **Iron**: +2 production
- **Fertile land**: +1 production, +1 supply
- **Stone**: +1 production, enables fort building

## Trade-offs
- **Gain**: Every map is different. Strategic positions emerge. Terrain matters.
- **Cost**: More complex generation. Need noise library or implement simplex.
- **Risk**: Bad maps (all mountains, no paths) could make games unplayable. Need validation.

## Implementation Sketch
- **Modified**: `src/world/generation/generateMvpMap.ts` — noise-based terrain assignment
- **New content**: Add mountain, marsh, river to `terrains.json`
- **Modified**: `src/content/base/terrains.json` — add `passable: false` for mountains
- **Dependency**: Simplex noise (or implement basic Perlin — ~50 lines)

## Related Gaps
- Gap 10 (terrain passability): mountains require passability checks
- Gap 12 (terrain combat bonuses): more terrain types = more combat variety
