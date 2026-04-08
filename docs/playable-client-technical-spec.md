# Playable Client Technical Spec

This document defines the implementation plan for converting `war-civ-v2` from a replay-first React dashboard into a real playable client with a Phaser-rendered world and a React/DOM HUD.

The intended audience is an LLM or engineer implementing the work directly in this repository. The document is written to minimize ambiguity and reduce architecture drift during execution.

## Product Direction

- Target visual bias: `Civ II`
- World renderer: `Phaser`
- HUD / menus / inspector: `React DOM`
- Terrain and unit style: `pixel-art`
- Unit identity goal: `faction-specific variants`
- Fog model: `remembered terrain only`, Civ-style
- HUD controls: `text-forward`
- First-priority map overlays: `movement` and `borders`
- Frontend direction: this is the `real playable client`, not a replay viewer with a better skin

## Implementation Defaults

These decisions are already approved and should be treated as defaults unless explicitly changed later:

- Tile footprint target: `48px`
- Initial unit presentation: `static sprites first`
- Initial unit art scope: `shared chassis silhouettes + faction-specific accents first`
- City labels: `always visible where practical`
- First playable milestone: `selection + movement + end turn`
- City production and deeper city interaction come after the first playable milestone

## Repository Context

Relevant current files:

- [web/src/App.tsx](/Users/fosbo/war-civ-v2/web/src/App.tsx): current monolithic replay viewer
- [web/src/styles.css](/Users/fosbo/war-civ-v2/web/src/styles.css): current dashboard-oriented styling
- [web/codemap.md](/Users/fosbo/war-civ-v2/web/codemap.md): current frontend codemap
- [src/replay/codemap.md](/Users/fosbo/war-civ-v2/src/replay/codemap.md): replay export structure
- [src/game/codemap.md](/Users/fosbo/war-civ-v2/src/game/codemap.md): game state overview

Current reality:

- The frontend is replay-first.
- The map is rendered with React + SVG.
- The layout prioritizes debug/analytics panels instead of play.
- Replay data already contains enough information for a useful renderer foundation, but not enough for final fog-of-war or a complete player-facing command model.

## Primary Goals

1. Build a playable map client in `web/`.
2. Keep gameplay state and rules outside Phaser scenes.
3. Use Phaser for world rendering, input, camera, fog, overlays, and unit presentation.
4. Use React DOM for the Civ-style HUD, inspector, minimap container, command bar, and debug surfaces.
5. Preserve replay/debug workflows as a secondary mode.
6. Allow placeholder assets so playtesting can begin before final art is ready.

## Non-Goals

Do not treat these as part of the first implementation milestone:

- full city production UI
- diplomacy screens
- complete research UX
- final pixel-art polish before playtesting
- faux-isometric presentation
- moving simulation authority into Phaser

## Architecture Summary

The system should be split into four layers:

1. Authoritative game state
- owned by the simulation / game rules
- not owned by Phaser

2. Client controller
- translates authoritative state into renderer-friendly and HUD-friendly view models
- receives player actions
- owns client UI state such as selection, hover, camera preferences, mode, and drawer visibility

3. Phaser renderer
- renders the world
- handles map input
- renders terrain, units, settlements, borders, overlays, fog, and selection feedback

4. React HUD
- renders all text-heavy and responsive UI
- top bar, right inspector, bottom command bar, minimap shell, debug drawer, replay controls

## Core Rule

Phaser must not become the source of truth.

Phaser scenes should consume a normalized `WorldViewModel` and emit typed input actions back to the client controller.

## Mode Model

Support two modes with the same renderer shell:

- `play`
- `replay`

Differences:

- `play`: live controller, actionable commands, turn progression
- `replay`: replay adapter over snapshots and timeline state, no authoritative command dispatch

The same map renderer should work in both modes.

## Required Directory Shape

Create or move toward this structure under `web/src/`:

```text
web/src/
  main.tsx
  App.tsx
  styles.css
  app/
    GameShell.tsx
    routes/
      PlayClient.tsx
      ReplayClient.tsx
  game/
    controller/
      GameController.ts
      GameSession.ts
      actionTypes.ts
      selectors.ts
    view-model/
      worldViewModel.ts
      hudViewModel.ts
      minimapViewModel.ts
      visibilityViewModel.ts
    phaser/
      createGame.ts
      scenes/
        BootScene.ts
        MapScene.ts
        OverlayScene.ts
      systems/
        CameraController.ts
        InputController.ts
        TileLayerRenderer.ts
        BorderRenderer.ts
        SettlementRenderer.ts
        UnitRenderer.ts
        FogRenderer.ts
        SelectionRenderer.ts
        PathRenderer.ts
      assets/
        assetManifest.ts
        keys.ts
    ui/
      TopHud.tsx
      RightInspector.tsx
      BottomCommandBar.tsx
      MiniMapPanel.tsx
      AlertsStrip.tsx
      DebugDrawer.tsx
      SelectionPanel.tsx
    types/
      clientState.ts
      worldView.ts
      hudView.ts
```

This is a target shape, not a requirement to create every file immediately. It exists to keep future work organized and prevent another giant `App.tsx`.

## Phaser Scene Plan

Keep scenes thin.

### `BootScene`

Responsibilities:

- preload assets from a stable manifest
- initialize sprite sheets / atlases / bitmap fonts later if needed
- start `MapScene`

### `MapScene`

Responsibilities:

- render terrain
- render terrain overlays
- render roads / rivers / improvements
- render ownership borders
- render cities / villages
- render city labels
- render units and unit state markers
- render movement overlays and path preview
- render selection and hover feedback
- render fog / shroud
- handle camera pan / zoom
- handle tile, city, and unit pointer input

### `OverlayScene`

Responsibilities:

- optional lightweight in-canvas overlays only
- reserve for later if a pure Phaser visual overlay becomes useful

Do not put dense text UI here. Dense UI belongs in React DOM.

## React Shell Plan

`GameShell` should compose:

- `TopHud`
- `GameCanvas`
- `RightInspector`
- `BottomCommandBar`
- `MiniMapPanel`
- `DebugDrawer`

Layout rules:

- keep the map dominant
- keep the center and lower-middle of the map mostly clear
- keep debug surfaces hidden by default
- keep primary controls contextual and readable

## Required Client Types

Introduce client-specific state instead of driving UI directly from raw replay bundle types.

### `ClientState`

```ts
type ClientMode = 'play' | 'replay';

interface ClientState {
  mode: ClientMode;
  turn: number;
  activeFactionId: string | null;
  selected: ClientSelection | null;
  hoveredHex: HexCoord | null;
  camera: CameraState;
  world: WorldViewModel;
  hud: HudViewModel;
  minimap: MiniMapViewModel;
  debug: DebugViewModel;
}
```

### `ClientSelection`

```ts
type ClientSelection =
  | { type: 'hex'; q: number; r: number }
  | { type: 'unit'; unitId: string }
  | { type: 'city'; cityId: string }
  | { type: 'village'; villageId: string }
  | null;
```

### `GameAction`

```ts
type GameAction =
  | { type: 'select_hex'; q: number; r: number }
  | { type: 'select_unit'; unitId: string }
  | { type: 'select_city'; cityId: string }
  | { type: 'move_unit'; unitId: string; destination: HexCoord }
  | { type: 'end_turn' }
  | { type: 'fortify_unit'; unitId: string }
  | { type: 'wait_unit'; unitId: string }
  | { type: 'toggle_debug_drawer' }
  | { type: 'set_replay_turn'; turnIndex: number };
```

Keep the action contract typed and small. Expand only when real gameplay UX needs it.

## `WorldViewModel`

Phaser should consume a flattened renderer contract, not raw simulation objects.

```ts
interface WorldViewModel {
  map: {
    width: number;
    height: number;
    hexes: HexView[];
  };
  factions: FactionView[];
  units: UnitView[];
  cities: CityView[];
  villages: VillageView[];
  overlays: {
    borders: BorderEdgeView[];
    reachableHexes: ReachableHexView[];
    pathPreview: HexCoord[];
  };
  visibility: VisibilityView;
}
```

### `HexView`

```ts
interface HexView {
  key: string;
  q: number;
  r: number;
  terrain: string;
  river?: boolean;
  road?: boolean;
  improvementId?: string;
  ownerFactionId?: string | null;
  visibility: 'visible' | 'explored' | 'hidden';
}
```

### `UnitView`

```ts
interface UnitView {
  id: string;
  factionId: string;
  q: number;
  r: number;
  hp: number;
  maxHp: number;
  movesRemaining: number;
  movesMax: number;
  acted: boolean;
  fortified?: boolean;
  veteranLevel?: string;
  prototypeId: string;
  prototypeName: string;
  chassisId: string;
  role?: string;
  spriteKey: string;
  visible: boolean;
}
```

### `CityView`

```ts
interface CityView {
  id: string;
  name: string;
  factionId: string;
  q: number;
  r: number;
  visible: boolean;
  remembered: boolean;
  besieged?: boolean;
}
```

### Visibility Rules

Each hex must resolve to one of:

- `visible`
- `explored`
- `hidden`

This rule must be reflected in both the world model and rendering layers.

## Data / Export Changes Required

The current replay bundle is not sufficient for the final playable client. Add or derive the following:

### Required for proper fog of war

- visible hexes per faction
- explored hexes per faction

### Required for unit rendering and action UI

- `chassisId`
- current movement state
- acted / unacted state
- optional role / veterancy

### Required for borders

- owner per tile, or enough tile ownership data to derive border edges

### Required for actual play mode

- active faction
- legal movement context
- selected entity support
- action legality and dispatch boundary

### Required later for city interaction

- population
- production queue
- garrison
- growth

## Recommended Data Strategy

### Near-term

- create adapters that derive as much as possible from current state / replay exports
- allow placeholders where the simulation does not yet expose final data

### Long-term

- source the client from authoritative game state rather than relying on replay bundle assumptions

If visibility does not exist authoritatively yet, it is acceptable to create a client-side visibility layer first as long as the interfaces are shaped to support future authoritative replacement.

## Input Model

### Phaser handles

- tile hover
- tile click
- unit click
- city click
- drag pan
- wheel zoom

### React handles

- bottom command bar actions
- end turn
- top-level HUD navigation
- replay timeline controls in replay mode
- debug drawer toggles

Selection state must be shared through the client controller, not duplicated independently in React and Phaser.

## Camera Model

Implement a tactical camera with these defaults:

- drag-pan always available
- wheel zoom with clamped levels
- selection recenters softly only when useful
- no cinematic movement in the first milestone
- optional keyboard pan later

Suggested zoom tiers:

- tactical close
- default play
- strategic overview

## Rendering Layer Order

Maintain explicit layer ordering in `MapScene`:

1. terrain base
2. terrain overlays
3. rivers / roads / improvements
4. borders
5. settlements
6. city labels
7. units
8. unit state badges
9. movement/path overlays
10. selection/hover rings
11. fog/shroud

This order should be stable and intentional. Do not mix random display objects into ad hoc z-indices.

## Tile and Sprite Sizing

Approved defaults:

- tile footprint target: `48px`
- unit sprite box target: `32px` to `40px`
- city icon target: `20px` to `28px`

Use placeholders that preserve these proportions so final art swaps do not force layout rework.

## Asset Manifest

Use stable manifest keys everywhere. Avoid direct path references in gameplay or renderer logic.

Example structure:

```ts
const assetManifest = {
  terrain: {
    plains: 'terrain/plains',
    forest: 'terrain/forest',
    jungle: 'terrain/jungle',
    hill: 'terrain/hill',
    desert: 'terrain/desert',
    tundra: 'terrain/tundra',
    savannah: 'terrain/savannah',
    coast: 'terrain/coast',
    riverOverlay: 'terrain/river-overlay',
  },
  units: {
    faction_chassis_variant: 'units/faction/chassis/idle',
  },
  settlements: {
    city: 'settlements/city',
    village: 'settlements/village',
  },
  ui: {
    selectionRing: 'ui/selection-ring',
    moveHighlight: 'ui/move-highlight',
    borderEdge: 'ui/border-edge',
    fogMask: 'ui/fog-mask',
  },
};
```

The actual implementation can vary, but the renderer should never depend on raw asset paths spread across the codebase.

## Sprite Naming Scheme

Recommended naming:

- `unit.<factionId>.<chassisId>.idle`
- `unit.<factionId>.<chassisId>.selected`
- `terrain.<terrainType>`
- `overlay.border.<factionId>`
- `settlement.city.<factionId>`
- `settlement.village.<factionId>`

Because the art plan is staged, implement fallback rules:

- if a faction-specific sprite is missing, fall back to a shared chassis silhouette
- allow faction accents to be layered separately in the early phase

## Art and Asset Strategy

The project should not wait for final art before implementation.

### Safe to implement immediately with placeholders

- Phaser integration
- map renderer
- camera
- HUD shell
- movement overlays
- borders
- fog scaffolding
- placeholder units
- placeholder settlements

### Requires user-supplied or approved assets later for final quality

- final terrain pixel-art tiles
- final faction-specific unit sprites
- final city / village icons
- optional HUD chrome and iconography

## Sprite Pipeline Integration

When final art production begins, use this workflow:

1. approve one seed frame per faction/chassis family
2. generate a strip only when animation is needed
3. normalize to shared anchor and scale
4. preview in-engine before acceptance
5. register under stable manifest keys

For the first playable milestone:

- static idle/base frames only
- no animation dependency

## HUD Specification

### `TopHud`

Must show:

- active faction
- turn / round
- treasury
- research status
- alerts count or summary

### `RightInspector`

Must show context-sensitive detail for:

- selected unit
- selected city
- selected tile

At minimum:

- unit HP
- movement remaining
- faction
- terrain move cost
- terrain defense value
- city owner/name when applicable

### `BottomCommandBar`

Text-forward actions only.

First pass should support:

- `Move`
- `Fortify`
- `Wait`
- `End Turn`

Later actions can be added as mechanics mature.

### `MiniMapPanel`

Must eventually support:

- current visibility
- explored terrain
- faction tint / ownership
- camera rectangle later if useful

### `DebugDrawer`

Keep debug detail accessible but secondary:

- replay timeline
- combat log
- AI intent trace
- event log

Debug must not dominate the main play view.

## Fog of War Specification

Approved behavior:

- `visible`: render full terrain, entities, and overlays normally
- `explored`: remembered terrain remains visible but dimmed / desaturated
- `hidden`: render as black shroud

Rules:

- remember terrain only
- do not show stale enemy unit positions
- previously discovered settlements may remain visible if desired, but should visually read as remembered data rather than fully current data

Implementation guidance:

- maintain separate `visible` and `explored` masks for the active faction
- compose fog visually through `FogRenderer`
- do not bury visibility logic inside individual sprite objects

## Borders Specification

Borders are a first-priority overlay and must be visible early.

Requirements:

- show faction ownership clearly without overwhelming terrain
- render only on ownership edges
- remain readable under visible and explored states
- disappear under hidden shroud

Implementation guidance:

- derive edges by adjacency where ownership differs
- render edge segments or edge sprites, not giant tile fills

## Movement Overlay Specification

Movement is also a first-priority overlay and must be in the first playable milestone.

Requirements:

- selected unit shows reachable tiles
- hovered reachable destination shows a path preview
- destination tile reads differently than generic reachable tiles
- blocked tiles remain unlit

Implementation guidance:

- compute reachable hexes and path in the controller or selector layer
- keep renderer consumption simple

## City Label Specification

Approved direction:

- always visible where practical
- owner-accented
- can simplify at low zoom if clutter becomes a problem

The label system should be implemented early because it contributes strongly to the `Civ II` feel.

## Milestones

### Milestone 1: Client Foundation

Outcome:

- Phaser added to `web/`
- React HUD shell exists
- map rendering path no longer depends on the old SVG implementation
- play mode and replay mode are structurally separable

Acceptance criteria:

- Phaser mounts successfully inside the frontend
- `GameShell` exists
- core client types exist
- current monolithic rendering path is no longer the long-term architecture

### Milestone 2: Playable Map

Outcome:

- map renders in Phaser
- terrain, settlements, units, labels, movement overlays, and borders are visible
- camera works
- placeholder assets are acceptable

Acceptance criteria:

- terrain renders in Phaser
- hover and selection work
- camera pan/zoom works
- cities and villages render
- movement overlay renders
- border overlay renders
- city labels are visible

### Milestone 3: Core Play Loop

Outcome:

- unit selection updates map and HUD
- move command works
- end turn works
- remembered-terrain fog works
- replay/debug lives in a drawer or secondary mode

Acceptance criteria:

- selected unit syncs between Phaser and HUD
- legal move preview appears
- issuing a move updates state and renderer
- end turn action is functional
- visibility and exploration update correctly
- debug/replay is accessible without dominating the UI

### Milestone 4: Visual Identity Pass

Outcome:

- faction-accented unit sprites replace generic placeholders
- terrain improves
- fog, borders, and HUD chrome receive polish

Acceptance criteria:

- the map is clearly readable at a glance
- units are identifiable by faction and chassis
- the UI feels intentionally `Civ II`-inspired rather than debug-tool-derived

## Migration Strategy

Implement in this order:

1. add Phaser and create the shell
2. define client types and view models
3. build a replay adapter into the new world-view contract
4. render placeholder terrain in Phaser
5. move hover and selection into Phaser input
6. build HUD shell in React
7. add movement overlays and borders
8. add move and end-turn interaction
9. add visibility memory and fog
10. move replay/debug into a secondary drawer or mode
11. replace placeholders with real art over time

## Risks

### Risk: renderer becomes stateful

If Phaser becomes the source of truth, implementation will drift and become hard to maintain.

Mitigation:

- keep authoritative logic in the controller / simulation
- scenes render derived state only

### Risk: replay types leak everywhere

If raw replay bundle types remain the frontend contract, the code will be hard to evolve into a real client.

Mitigation:

- define explicit client-facing view models

### Risk: art blocks implementation

Waiting for final art will slow playtesting.

Mitigation:

- ship placeholder assets first

### Risk: visibility becomes a late retrofit

Fog of war is central to the target feel. Retrofitting too late will be expensive.

Mitigation:

- establish visibility interfaces early, even if initial data is partly derived

## Implementation Rules For Future LLMs

If you are implementing from this spec:

1. Do not rebuild the entire frontend in one file.
2. Do not put gameplay authority into Phaser scene-local state.
3. Do not render dense HUD text inside Phaser unless there is a strong reason.
4. Prefer placeholder assets over waiting for final art.
5. Keep debug surfaces available but hidden by default.
6. Preserve the ability to run replay mode through the same rendering pipeline.
7. Treat the world renderer and HUD as separate layers with a shared controller boundary.
8. Preserve the approved defaults in this document unless the user explicitly changes them.

## Immediate Next Tasks

The first implementation pass should do the following:

1. Add Phaser to `web/`.
2. Create `GameShell` and mount a basic `MapScene`.
3. Define `ClientState`, `GameAction`, and `WorldViewModel`.
4. Create a replay adapter that feeds the world view model.
5. Render placeholder terrain, settlements, units, hover, and selection in Phaser.
6. Create a minimal React HUD shell with top bar, right inspector, and bottom command bar.
7. Add movement overlays and border rendering.

That is the shortest path to a testable playable foundation.
