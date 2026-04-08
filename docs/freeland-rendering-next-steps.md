# Freeland Rendering Next Steps

This project already has a real Freeland-backed terrain path, but the renderer still has a few hardening and polish gaps. This note is scoped to what `war-civ-v2` actually uses today, not every possible Freeciv terrain extra.

Important current scope:
- Rail is not part of the game.
- Roads, irrigation, and farmland are not planned right now.
- Fog of war is not implemented yet as a gameplay target.
- Rivers currently look clumped and strange.

That means the relevant render stack is:
- terrain base
- ocean/coast transitions
- rivers
- settlements
- borders
- fog
- units

## 1. Make Freeland failures loud

The current renderer can still fall back to non-Freeland terrain logic if a Freeland lookup fails. That makes regressions hard to notice and can silently mix rendering systems.

Recommended action:
- Make Freeland the authoritative terrain path for Freeland-backed terrain, or
- Add explicit diagnostics whenever `getFreelandTerrainRenderSpec()` returns `null`
- In development, consider throwing instead of silently falling back

Goal:
- No silent terrain fallback for core terrain types

## 2. Add Freeland asset validation at boot

The recent issue came from terrain assets being overwritten by custom files. The renderer exposed the problem, but nothing prevented the bad assets from shipping.

Recommended action:
- Add a boot-time validator for required Freeland assets
- Validate:
  - required PNG files exist
  - required spec files load
  - required tags exist after parse
  - core terrain textures load successfully
  - core terrain sheets optionally match expected hashes or file sizes

Goal:
- Fail fast when Freeland assets are missing, replaced, or incompatible

## 3. Fix river connectivity and river presentation

Rivers are a current visual problem. They look clumped and strange, which makes this a higher priority than broader refactors.

Recommended action:
- Audit `getRiverOverlayFrameForTile()` against the current map projection and river topology
- Verify whether the current north/south connection rules are over-connecting tiles
- Build a small deterministic river test map with:
  - straight runs
  - bends
  - T-junctions
  - coast entry
  - adjacent but unconnected cases
- Tune river rendering until isolated cases read cleanly

Goal:
- Rivers read as intentional paths instead of merged blobs

## 4. Port deterministic terrain variation fully

Freeland uses alternate terrain tags to avoid visible repetition. If only the core cellgroup logic is used, the map can still look flatter than the source tileset intends.

Recommended action:
- Audit the Freeland tileset for base/randomized terrain variants that matter to the current game
- Port deterministic coordinate-stable variant selection
- Keep the result reproducible across sessions

Goal:
- Repeated grassland/plains/tundra/desert/ocean tiles look like Freeland instead of repeated single frames

## 5. Audit layer ordering for the layers this game actually uses

Even when individual sprites are correct, visual artifacts can still come from incorrect layer order.

Recommended action:
- Verify render order for:
  - base terrain
  - ocean/coast transitions
  - rivers
  - settlements
  - borders
  - fog visuals
  - units
- Check whether borders should sit above or below settlements
- Check whether rivers remain readable under later layers
- Check whether fog visuals are obscuring or flattening the scene in useful ways

Goal:
- A stable, readable stack where layers do not visually fight each other

## 6. Add a strict debug mode for terrain rendering

The renderer needs a mode that makes mismatches obvious during development.

Recommended action:
- Add a `Freeland strict mode` or debug flag that:
  - logs missing tag lookups
  - logs terrain fallback usage
  - highlights unknown render cases
  - optionally throws in development builds

Goal:
- No silent renderer drift

## 7. Keep terrain rendering on pixel-safe zoom steps

Fractional zoom can make correct pixel art look broken.

Recommended action:
- Keep zoom snapped to approved steps
- Avoid arbitrary resampling on terrain layers
- Keep terrain composition textures on nearest-neighbor filtering

Goal:
- Terrain visuals stay crisp and diagnosable

## 8. Refactor the compositor only after behavior is stable

The renderer already has a meaningful Freeland composition path. A dedicated compositor module is still useful, but it is not the first thing to do.

Recommended action:
- Once behavior is correct, isolate Freeciv-compatible composition into one module
- Centralize:
  - rect-cell crop rectangles
  - mask application
  - corner offsets
  - terrain composition ordering

Goal:
- One place that mirrors Freeciv-compatible sprite composition without hiding behavior bugs behind refactors

## Not A Current Priority

These may matter later, but they are not part of the current rendering hardening plan:
- rail
- roads
- irrigation
- farmland

Reason:
- They are not part of the current game scope
- Implementing them now would be future-proofing, not solving current rendering problems

## Suggested implementation order

1. Add Freeland strict mode and fallback diagnostics
2. Add boot-time asset validation
3. Fix river connectivity and presentation
4. Add deterministic terrain variation
5. Audit layer ordering for the currently used stack
6. Refactor the compositor if the code is still fragile after behavior is correct
