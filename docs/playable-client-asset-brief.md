# Playable Client Asset Brief

This document lists the art assets needed to support the first playable client milestones for `war-civ-v2`.

The goal is not final art completeness. The goal is to provide enough consistent pixel-art assets for:

- Phaser map rendering
- movement and border overlays
- visible settlements
- readable faction/unit identity
- early Civ-style playtesting

All assets in this brief should be placed under:

- [web/public/assets](/Users/fosbo/war-civ-v2/web/public/assets)

## Global Art Rules

- File format: `PNG`
- Style: `pixel-art`
- Terrain may be opaque
- Units, settlements, overlays, badges, and fog masks should use transparent backgrounds
- Keep one consistent lighting direction, palette family, and camera language across the whole set
- Keep edges crisp; do not introduce soft anti-aliased rendering
- Favor readability over detail
- Units must remain readable over dark terrain like `forest`, `jungle`, and `swamp`

## Asset Root

Create this structure:

```text
web/public/assets/
  terrain/
    plains-01.png
    ...
    swamp-04.png
    rivers/
      river-straight-01.png
      river-curve-01.png
      river-tee-01.png
      river-cross-01.png
      river-end-01.png
  overlays/
    borders/
      border-edge-01.png
      border-corner-01.png
    ui/
      hex-select-ring.png
      hex-hover-ring.png
      hex-move-allowed.png
      hex-move-destination.png
      hex-path-dot.png
  settlements/
    city-neutral-01.png
    village-neutral-01.png
  units/
    unit-jungle_clan-infantry-idle.png
    ...
    badges/
      badge-fortified.png
      badge-veteran.png
      badge-moved.png
      badge-damaged.png
  fog/
    fog-dim-mask-01.png
    shroud-solid-mask-01.png
```

## 1. Terrain Tiles

Folder:

- [web/public/assets/terrain](/Users/fosbo/war-civ-v2/web/public/assets/terrain)

Size:

- `64x64` PNG each

Needed terrain types:

- `plains`
- `forest`
- `jungle`
- `hill`
- `desert`
- `tundra`
- `savannah`
- `coast`
- `swamp`

Variation count:

- `4` variants per terrain type

Naming pattern:

- `plains-01.png` through `plains-04.png`
- `forest-01.png` through `forest-04.png`
- repeat for each terrain type

Notes:

- These are map tile textures, not large illustrations
- They must remain readable under units and overlays
- `coast` should read as shallow coastal water, not deep open ocean
- `hill` should read as traversable hill country, not mountains
- `forest` and `jungle` must be clearly distinguishable at a glance
- `swamp` should read as darker, wetter, and murkier than `plains` or `savannah`

## 2. River Overlays

Folder:

- [web/public/assets/terrain/rivers](/Users/fosbo/war-civ-v2/web/public/assets/terrain/rivers)

Size:

- `64x64` PNG each
- transparent background

Needed pieces:

- `river-straight-01.png`
- `river-curve-01.png`
- `river-tee-01.png`
- `river-cross-01.png`
- `river-end-01.png`

Variation count:

- `1` each for now

Notes:

- These are overlays, not full terrain tiles
- Only one orientation is needed for each type in the first pass
- The game can rotate them in-engine later if needed

## 3. Border Overlays

Folder:

- [web/public/assets/overlays/borders](/Users/fosbo/war-civ-v2/web/public/assets/overlays/borders)

Size:

- `64x64` PNG each
- transparent background

Needed pieces:

- `border-edge-01.png`
- `border-corner-01.png`

Variation count:

- `1` each for now

Notes:

- These should be subtle and readable over all terrain
- Think territorial edge markers, not magical glowing shields

## 4. Movement and Selection Overlays

Folder:

- [web/public/assets/overlays/ui](/Users/fosbo/war-civ-v2/web/public/assets/overlays/ui)

Size:

- `64x64` PNG each
- transparent background

Needed pieces:

- `hex-select-ring.png`
- `hex-hover-ring.png`
- `hex-move-allowed.png`
- `hex-move-destination.png`
- `hex-path-dot.png`

Variation count:

- `1` each

Notes:

- Keep these clean and functional
- These are utility overlays, not decorative flourishes

## 5. Settlements

Folder:

- [web/public/assets/settlements](/Users/fosbo/war-civ-v2/web/public/assets/settlements)

Size:

- `32x32` PNG each
- transparent background

Needed pieces:

- `city-neutral-01.png`
- `village-neutral-01.png`

Variation count:

- `1` each for now

Notes:

- Start neutral
- Faction tint or accent can be applied in-engine during early implementation
- The city icon should read as larger and more fortified than the village icon

## 6. Unit Sprites: Phase-One Scope

Folder:

- [web/public/assets/units](/Users/fosbo/war-civ-v2/web/public/assets/units)

Size:

- `48x48` PNG each
- transparent background

Facing direction:

- use one consistent direction across the full set
- recommendation: face `right`

Important constraints:

- These are first-pass idle/base frames only
- Do not produce walk/attack/hit animations yet
- Shared silhouette families are acceptable
- Each faction should still have distinct costume, palette, or banner accents

### Factions

Use these faction IDs:

- `jungle_clan`
- `druid_circle`
- `steppe_clan`
- `hill_clan`
- `coral_people`
- `desert_nomads`
- `savannah_lions`
- `plains_riders`
- `frost_wardens`

These IDs are derived from the current source content in [src/content/base/civilizations.json](/Users/fosbo/war-civ-v2/src/content/base/civilizations.json).

### Chassis families

Use these chassis names:

- `infantry`
- `ranged`
- `cavalry`
- `camel`
- `elephant`
- `naval`

### Recommended minimum useful set

This set is enough to support the first playable milestones:

- `jungle_clan.infantry`
- `jungle_clan.ranged`
- `druid_circle.infantry`
- `steppe_clan.infantry`
- `steppe_clan.cavalry`
- `hill_clan.infantry`
- `coral_people.infantry`
- `coral_people.naval`
- `desert_nomads.infantry`
- `desert_nomads.camel`
- `savannah_lions.infantry`
- `savannah_lions.elephant`
- `plains_riders.infantry`
- `plains_riders.naval`
- `frost_wardens.infantry`
- `frost_wardens.ranged`

Recommended naming:

- `unit-jungle_clan-infantry-idle.png`
- `unit-jungle_clan-ranged-idle.png`
- repeat for the rest

Variation count:

- `1` idle frame each

### Optional expanded set

If you want broader art coverage earlier, produce all `9 factions x 6 chassis = 54` sprite files.

That is not required for the first playable milestone.

## 7. Optional Unit Status Badges

Folder:

- [web/public/assets/units/badges](/Users/fosbo/war-civ-v2/web/public/assets/units/badges)

Size:

- `16x16` PNG each
- transparent background

Needed pieces:

- `badge-fortified.png`
- `badge-veteran.png`
- `badge-moved.png`
- `badge-damaged.png`

Variation count:

- `1` each

Notes:

- These are optional
- They can be replaced temporarily by simple in-engine markers if needed

## 8. Fog and Shroud Textures

Folder:

- [web/public/assets/fog](/Users/fosbo/war-civ-v2/web/public/assets/fog)

Size:

- `64x64` PNG each

Needed pieces:

- `fog-dim-mask-01.png`
- `shroud-solid-mask-01.png`

Variation count:

- `1` each

Notes:

- These are optional for the first implementation pass
- Fog can be prototyped procedurally first

## Minimum Starter Pack

This is the minimum blocker-free pack for implementation:

1. Terrain tiles for all listed terrain types, with `4` variants each
2. River overlays
3. Border overlays
4. Movement and selection overlays
5. Neutral city and village icons
6. The `16` recommended faction/chassis unit sprites covering the current `9` faction roster

This is enough to support the first playable client milestones.

## What Can Wait

These are not required before implementation begins:

- animation strips
- more than `4` terrain variants
- full `9 x 6` faction/chassis unit coverage
- status badges
- fog textures
- final HUD chrome

## Consistency Rules

These matter more than raw detail:

- All terrain should feel like it belongs to the same game
- All units should share one scale language and one camera/facing language
- Units should read by silhouette first, color second
- Terrain saturation should not overpower faction colors
- Forest, jungle, swamp, desert, tundra, and savannah must be distinguishable at a glance

## Production Advice

If art is being generated or commissioned, start in this order:

1. terrain tiles
2. river overlays
3. border and selection overlays
4. settlement icons
5. the `16` recommended unit sprites

That order gives the implementation team the most useful coverage fastest.
