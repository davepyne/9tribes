Now I have a thorough understanding of the entire codebase. Let me produce the design specification.

---

# Research Window — UI/UX Design Specification

## 1. Window Layout

### Recommended approach: **Full-screen modal overlay**

The Research Window is a **planning screen** — players need to see the entire tree, compare paths, and make strategic decisions. This demands more space than the 340px RightInspector column affords. A modal overlay that dims the map gives the full viewport while preserving context.

```
┌─────────────────────────────────────────────────────────────────────┐
│  TopHud (visible, dimmed)                                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                          ┌────────┐ │
│   ┌──────────────────────────────────────────┐ ┌────────┐│  X     │ │
│   │         RESEARCH TREE                     │ │ DETAIL ││        │ │
│   │         (3-tier grid)                     │ │ PANEL  ││        │ │
│   │                                           │ │        ││        │ │
│   │  T1 ▸ [7 nodes by domain column]          │ │ Name   ││        │ │
│   │  T2 ▸ [7 nodes by domain column]          │ │ Tier   ││        │ │
│   │  T3 ▸ [4 synthesis nodes]                 │ │ Cost   ││        │ │
│   │                                           │ │ Req    ││        │ │
│   ├──────────────────────────────────────────┤ │ Effect  ││        │ │
│   │  CAPABILITIES BAR (13 domains)            │ │ Unlocks ││        │ │
│   └──────────────────────────────────────────┘ └────────┘│        │ │
│                                                           └────────┘ │
│   [Start Research]  [Cancel Research]                                │
├─────────────────────────────────────────────────────────────────────┤
│  BottomCommandBar (visible, dimmed)                                 │
└─────────────────────────────────────────────────────────────────────┘
```

**Trigger:** A new `status-chip` in the TopHud reading **"Research"** that opens the modal on click. The chip shows the active research node name (or "Idle") as its value. This follows the existing `top-hud__stats` pattern.

**Close:** `×` button in the top-right corner of the overlay, `Escape` key, or clicking the dimmed backdrop.

**Structure:**
```
research-overlay                    — Full-viewport backdrop
├── research-window                 — Centered card (max 1100px × 85vh)
│   ├── research-window__header     — Title + summary stats + close
│   ├── research-window__body       — Two-column layout
│   │   ├── research-tree           — Left: 3-tier node grid
│   │   └── research-detail         — Right: selected node info
│   ├── research-capabilities       — Bottom bar: 13 domain levels
│   └── research-window__footer     — Action buttons + rate breakdown
```

---

## 2. Research Tree Visualization

### Layout: Domain-column grid with 3 tier rows

The 7 research-track domains form **7 vertical columns**, and the 3 tiers form **3 horizontal rows**. Tier 3 synthesis nodes span two columns each since they bridge domains.

```
                WOOD   HORSE  POISON  FORT   FORM   NAVIG  ENDUR
                ─────  ─────  ──────  ─────  ─────  ─────  ─────
  T1 FOUND     [CW]   [CH]   [CP]    [CF]   [Cfo]  [CN]   [CE]     (XP 12–15)

  T2 MASTER    [MW]   [MH]   [MP]    [MF]   [Mfo]  [MN]   [ME]     (XP 20–24)

  T3 SYNTH     [Forest Cavalry]  [Poison Phalanx]                  (XP 35)
               [Amphib Fort]      [Eternal March]
```

### Tier 3 placement

The 4 synthesis nodes are arranged in a **2×2 sub-grid** beneath the T2 row. Each visually bridges its two parent columns:

| Node | Left column | Right column |
|------|-------------|--------------|
| forest_cavalry | woodcraft | horsemanship |
| poison_phalanx | poisoncraft | fortification |
| amphibious_fortress | navigation | fortification |
| eternal_march | endurance | formation_warfare |

Since fortification and formation appear in two synthesis nodes each, the sub-grid is:

```
  [forest_cavalry (WOOD+HORSE)]  [poison_phalanx (POISON+FORT)]
  [amphibious_fortress (NAV+FORT)]  [eternal_march (ENDUR+FORM)]
```

### Connection lines

Vertical lines connect T1→T2 within each column. Diagonal/angled lines connect T2→T3 across columns. These are rendered as **CSS borders** or an **SVG overlay** — not canvas (to keep the tree in the React DOM for accessibility).

**Implementation:** Use a `position: relative` container with an absolutely-positioned SVG behind the nodes for connection lines. Each line is a `<line>` or `<path>` from node center to node center.

### Node card — `research-node`

Each node is a small card (roughly 120×80px) with:

```
┌──────────────────┐
│ ⬡ Tier 1         │  ← tier badge (small, top-left)
│ Codify Woodcraft  │  ← name (1–2 lines, bold)
│ ████████░░ 8/15   │  ← progress bar + fraction
│ ▸ Forest Ambush   │  ← qualitative effect label (muted)
└──────────────────┘
```

**Node states** (mutually exclusive CSS classes on `.research-node`):

| State | Class | Visual |
|-------|-------|--------|
| Completed | `research-node--completed` | Green-tinted border, checkmark icon, filled progress bar |
| Active | `research-node--active` | Gold accent border with glow, animated progress bar |
| Available (prereqs met, caps met) | `research-node--available` | Standard border, full opacity, clickable |
| Locked (prereqs not met) | `research-node--locked` | Dimmed (opacity 0.45), locked icon, muted text |
| Insufficient capability | `research-node--insufficient` | Dimmed with orange warning indicator, shows deficit |
| Hovered/selected | `research-node--selected` | Highlighted border matching `--accent` color |

**Computation of node state** (for the view model):
```typescript
type NodeViewState = 'completed' | 'active' | 'available' | 'locked' | 'insufficient';
```
A node is:
- `completed` if in `completedNodes`
- `active` if `activeNodeId === node.id`
- `available` if all prereqs in `completedNodes` AND all `requiredCapabilities` met
- `insufficient` if all prereqs met BUT some `requiredCapabilities` not met
- `locked` if prereqs not met

---

## 3. Node Detail Panel — `research-detail`

A right-side panel (roughly 320px) that shows full information for the **selected node**. Selecting a node is done by clicking it in the tree. The detail panel updates immediately.

```
┌────────────────────────────────┐
│  p.panel-kicker → "Tier 1 · Foundation"   │
│  h2 → "Codify Woodcraft"                  │
├────────────────────────────────┤
│  div.meta-row                              │
│    span "XP Cost"                          │
│    strong "15 (11 with knowledge discount)"│
│                                            │
│  div.meta-row                              │
│    span "Progress"                         │
│    strong "8 / 15"                         │
│                                            │
│  div.meta-row                              │
│    span "Estimated Turns"                  │
│    strong "2 turns"                        │
│                                            │
│  div.meta-row                              │
│    span "Research Rate"                    │
│    strong "4 XP/turn"                      │
├────────────────────────────────┤
│  p.panel-kicker → "Requirements"          │
│  div.research-detail__req                  │
│    span "woodcraft ≥ 4"  ✓ (current: 6)   │
│    span "No prerequisites"                 │
├────────────────────────────────┤
│  p.panel-kicker → "Unlocks"               │
│  div.research-detail__unlock               │
│    span "Component: Skirmish Drill"        │
│                                            │
│  p.panel-kicker → "Effect"                │
│  div.research-detail__effect               │
│    "First strike from forest hexes"        │
│                                            │
│  p.panel-kicker → "Bonus"                 │
│  div.research-detail__bonus                │
│    "woodcraft +1"                          │
├────────────────────────────────┤
│  [Start Research]                          │
└────────────────────────────────┘
```

**Knowledge discount display:** When the faction has any `learnedDomains` (knowledge from contact/absorption), show the discounted XP cost with the original struck through:
```
  XP Cost    ~~15~~ 11  (25% knowledge discount)
```

**Turn estimate:** `Math.ceil((xpCost - currentProgress) / researchPerTurn)` — shown only for available/active nodes.

---

## 4. Research Summary Section — `research-window__header`

Integrated into the top of the window rather than a separate section. Shows:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  p.panel-kicker → "Research"                                           │
│  h2 → "War Codification"                                               │
│                                                                         │
│  div.research-summary                                                  │
│    div.research-summary__stat                                          │
│      span.research-summary__label "Completed"                          │
│      strong.research-summary__value "3 / 18"                           │
│    div.research-summary__stat                                          │
│      span.research-summary__label "Active"                             │
│      strong.research-summary__value "Codify Woodcraft (53%)"           │
│    div.research-summary__stat                                          │
│      span.research-summary__label "Rate"                               │
│      strong.research-summary__value "6 XP/turn"                        │
│                                                          [× Close]     │
└─────────────────────────────────────────────────────────────────────────┘
```

### Rate breakdown — `research-rate`

Below the header stats or in the footer, a collapsible breakdown:

```
  Research Rate Breakdown
  ─────────────────────────
  Base rate                4 XP/turn
  Knowledge bonus         +1 XP/turn (1 foreign domain learned)
  Capability bonus        +1 XP/turn (1 codified domain)
  ─────────────────────────
  Total                    6 XP/turn
```

This uses the existing `meta-row` pattern.

---

## 5. Capability Domain Section — `research-capabilities`

A **horizontal bar** at the bottom of the tree area showing all 13 domains. This acts as both a reference and a diagnostic for why nodes are locked.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  p.panel-kicker → "Capability Domains"                                       │
│  div.capability-bar                                                          │
│                                                                              │
│  [WOOD]  [HORSE] [POISON] [HILL] [FORM] [FORT] [MOBIL]                      │
│   6        4       3      2     5      4      7                                              │
│   ████▓   ███░    ██░    █░    ████   ███░   █████                                                          │
│   T1✓     T1✓            ·     T1✓    T1✓   ·                                               │
│                                                                              │
│  [STEALTH] [SHOCK] [SEAFAR] [NAVIG] [DESERT] [ENDUR]                        │
│    1         3       2        5      0         4                                                             │
│    █░        ██░     █░      ████    ░        ███░                                                           │
│    ·         ·       ·       T1✓     ·        T1✓                                           │
│                                                                              │
│  T1✓ = can codify (≥4)   T2✓ = can master (≥8)   · = ecology-only          │
└──────────────────────────────────────────────────────────────────────────────┘
```

Each domain is a small `capability-pip` card:

```
┌──────────┐
│ Woodcraft │  ← name
│ ██████░░  │  ← mini progress bar (toward next threshold)
│ 6  (≥8)  │  ← current level + next threshold
│ ⬡ T1 ✓   │  ← research-track indicator + threshold met?
└──────────┘
```

**Color coding for thresholds:**
- Level ≥ 8 (T2 threshold): Gold `--accent` bar fill
- Level ≥ 4 (T1 threshold): Green fill
- Below 4: Muted fill at fraction toward 4

**Ecology-only domains** (hill_fighting, mobility, stealth, shock_resistance, seafaring, desert_survival) are shown with a `·` marker and slightly muted styling — they have no research path but players need to see their levels for hybrid recipe requirements.

**Codification indicator:** Domains that appear in the faction's `codifiedDomains` get a small `⬡` glyph or a colored badge showing they contribute to the research rate bonus.

---

## 6. Interaction Design

### Opening the Research Window

1. **TopHud chip:** A new status chip labeled "Research" with value showing active node name or "No Active Research". Clicking opens the overlay.
2. The chip is always visible during play mode.

### Selecting a node to inspect

- **Click** a node in the tree → it becomes the "selected" node and the detail panel populates.
- The selected node gets a `research-node--selected` class (accent border highlight).
- Only one node selected at a time. Clicking the same node again deselects (detail panel shows "Select a node to inspect").

### Starting research

- The detail panel for an `available` or `insufficient` node shows a **"Start Research"** button.
- If the node is `insufficient` (capability requirements not met), the button is **disabled** with a tooltip showing the deficit: "Requires woodcraft ≥ 4 (current: 2)".
- If the node is `active` (already being researched), the button reads **"Researching…"** and is disabled.
- Clicking "Start Research" dispatches a new game action: `{ type: 'start_research'; nodeId: ResearchNodeId }`.

### Canceling / switching research

- When a node is currently active, the footer shows: **"Cancel Research"** button.
- Clicking it dispatches: `{ type: 'cancel_research' }`.
- Switching to a different node (clicking "Start Research" on a different available node) is allowed **without confirmation** — progress is retained per node (`progressByNodeId` persists).
- However, if the player already has an active node and clicks "Start Research" on a new one, show a **confirmation**: "Switch research from Codify Woodcraft (53%) to Codify Horsemanship? Progress on the current node will be preserved."

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Escape` | Close the research window |
| `R` | Open/close research window (when not in a text input) |

---

## 7. Visual Design Direction

### Color tokens (reusing existing CSS variables)

```
--research-completed:  #5b9e5b   (muted green, matches existing muted palette)
--research-active:     var(--accent)  (#d6a34b gold)
--research-available:  var(--text)    (#f6ebcf warm white)
--research-locked:     rgba(134, 118, 86, 0.45)  (dimmed warm gray)
--research-insufficient: #d6863b  (orange-amber warning)
--research-connector:  rgba(227, 196, 136, 0.18)  (subtle border color)
--research-synthesis:  #7a8cd4  (cool blue-purple for synthesis tier)
```

### Typography hierarchy

| Element | Font | Weight | Size | Class |
|---------|------|--------|------|-------|
| Window title | Fraunces | 700 | 1.4rem | `research-window__title` |
| Tier labels | Fraunces | 600 | 0.95rem | `research-tier-label` |
| Node names | Inter | 600 | 0.82rem | `research-node__name` |
| Node tier badge | Inter | 500 | 0.68rem | `research-node__tier` |
| Domain labels | Inter | 500 | 0.72rem | `capability-pip__name` |
| Progress fraction | Inter | 500 | 0.7rem | `research-node__progress` |
| Effect labels | Inter | 400 | 0.72rem | `research-node__effect` |
| Detail headings | panel-kicker (existing) | 500 | 0.76rem | `panel-kicker` |

### Iconography

Since the game uses a pixel-art isometric aesthetic, use **simple Unicode glyphs** rather than SVG icon libraries:

| Concept | Glyph | Context |
|---------|-------|---------|
| Completed | ✓ | Overlay on completed node cards |
| Active/Researching | ⬡ (hexagon) | On active node border |
| Locked | 🔒 → use CSS `::after` with " ⊘ " | On locked nodes |
| Warning (insufficient) | △ | On insufficient-capability nodes |
| Research-track domain | ⬡ | On capability pips |
| Ecology-only domain | · | On capability pips |
| Component unlock | ◆ | In unlocks list |
| Chassis unlock | ■ | In unlocks list |
| Recipe unlock | ⬢ | In unlocks list |

### Progress bars

Node progress bars use a **two-tone** fill:
- Completed portion: solid fill in state color (green for completed, gold for active)
- Remaining portion: `rgba(134, 118, 86, 0.15)` (subtle background track)

Bar height: 4px, border-radius: 2px.

For active nodes, the progress bar gets a subtle **shimmer animation**:
```css
.research-node--active .research-node__bar-fill {
  animation: research-shimmer 2s ease-in-out infinite;
}
@keyframes research-shimmer {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.75; }
}
```

### Connection lines

Thin (1px) lines in `rgba(227, 196, 136, 0.18)` for locked connections, brightening to `rgba(227, 196, 136, 0.5)` when the prerequisite is completed. Active connections (leading to the active node) use `var(--accent)` with a dashed pattern.

### Overall background

The modal overlay uses `rgba(23, 19, 14, 0.88)` (matching `--bg` with alpha). The inner window uses the existing `var(--bg-elevated)` + `backdrop-filter: blur(16px)` pattern from `.panel`.

---

## 8. Component Architecture

### New types in `clientState.ts`

```typescript
// === Research Inspector View Model ===

export type ResearchNodeViewState =
  | 'completed'
  | 'active'
  | 'available'
  | 'locked'
  | 'insufficient';

export type ResearchNodeViewModel = {
  nodeId: string;
  name: string;
  tier: number;
  xpCost: number;
  discountedXpCost: number | null;   // null if no knowledge discount
  currentProgress: number;
  state: ResearchNodeViewState;
  prerequisites: string[];           // node IDs
  prerequisiteNames: string[];
  requiredCapabilities: Array<{
    domainId: string;
    domainName: string;
    required: number;
    current: number;
    met: boolean;
  }>;
  unlocks: Array<{
    type: 'component' | 'chassis' | 'improvement' | 'recipe';
    id: string;
    name: string;
  }>;
  qualitativeEffect: string | null;  // description text
  capabilityBonus: Array<{ domainId: string; domainName: string; amount: number }>;
  estimatedTurns: number | null;
};

export type CapabilityPipViewModel = {
  domainId: string;
  domainName: string;
  description: string;
  level: number;
  hasResearchTrack: boolean;         // true for the 7 codifiable domains
  codified: boolean;                 // in codifiedDomains
  t1Threshold: number;               // 4
  t2Threshold: number;               // 8
  t1Ready: boolean;                  // level >= 4
  t2Ready: boolean;                  // level >= 8
};

export type ResearchRateBreakdown = {
  base: number;
  knowledgeBonus: number;
  knowledgeDetail: string;           // e.g., "1 foreign domain learned"
  capabilityBonus: number;
  capabilityDetail: string;          // e.g., "2 codified domains"
  total: number;
};

export type ResearchInspectorViewModel = {
  factionId: string;
  activeNodeId: string | null;
  activeNodeName: string | null;
  activeNodeProgress: number | null;
  activeNodeXpCost: number | null;
  completedCount: number;
  totalNodes: number;

  nodes: ResearchNodeViewModel[];
  capabilities: CapabilityPipViewModel[];
  rateBreakdown: ResearchRateBreakdown;
  hasKnowledgeDiscount: boolean;
};
```

### Add to `ClientState`:
```typescript
export type ClientState = {
  // ... existing fields ...
  research: ResearchInspectorViewModel | null;  // null in replay mode or if no research system
};
```

### Add to `GameAction`:
```typescript
export type GameAction =
  // ... existing actions ...
  | { type: 'start_research'; nodeId: string }
  | { type: 'cancel_research' }
  | { type: 'open_research_window' }
  | { type: 'close_research_window' };
```

### Add to `HudViewModel` (minimal — for the TopHud chip):
```typescript
export type HudViewModel = {
  // ... existing fields ...
  researchChip: {
    activeNodeName: string | null;
    progress: number | null;       // 0–1 fraction
    totalCompleted: number;
  } | null;
};
```

### New React components

| Component | File | Purpose |
|-----------|------|---------|
| `ResearchWindow` | `web/src/ui/ResearchWindow.tsx` | Top-level modal overlay container |
| `ResearchTree` | `web/src/ui/ResearchTree.tsx` | 3-tier node grid + SVG connections |
| `ResearchNode` | `web/src/ui/ResearchNode.tsx` | Individual node card |
| `ResearchDetail` | `web/src/ui/ResearchDetail.tsx` | Right-side detail panel |
| `CapabilityBar` | `web/src/ui/CapabilityBar.tsx` | Bottom domain level strip |
| `CapabilityPip` | `web/src/ui/CapabilityPip.tsx` | Individual domain card in the bar |

### Component tree

```
GameShell
├── TopHud (updated: new research chip)
├── game-layout
│   ├── game-stage
│   └── RightInspector (unchanged)
├── BottomCommandBar (unchanged)
└── ResearchWindow (conditional, modal)
    ├── research-window__header
    │   ├── panel-heading (title + kicker)
    │   ├── research-summary__stats (completed/active/rate)
    │   └── close button
    ├── research-window__body
    │   ├── ResearchTree
    │   │   ├── SVG connections layer
    │   │   ├── Tier 1 row (7 × ResearchNode)
    │   │   ├── Tier 2 row (7 × ResearchNode)
    │   │   └── Tier 3 sub-grid (4 × ResearchNode)
    │   └── ResearchDetail
    │       ├── meta-rows (cost, progress, turns)
    │       ├── Requirements section
    │       ├── Unlocks section
    │       ├── Effect section
    │       └── Action button
    ├── CapabilityBar
    │   └── 13 × CapabilityPip
    └── research-window__footer
        └── Rate breakdown + action buttons
```

### Props

```typescript
type ResearchWindowProps = {
  state: ClientState;
  onStartResearch: (nodeId: string) => void;
  onCancelResearch: () => void;
  onClose: () => void;
};

type ResearchTreeProps = {
  nodes: ResearchNodeViewModel[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
};

type ResearchNodeProps = {
  node: ResearchNodeViewModel;
  selected: boolean;
  onSelect: () => void;
};

type ResearchDetailProps = {
  node: ResearchNodeViewModel | null;
  researchRate: number;
  onStartResearch: (nodeId: string) => void;
  onCancelResearch: () => void;
  hasActiveResearch: boolean;
  activeNodeName: string | null;
};

type CapabilityBarProps = {
  capabilities: CapabilityPipViewModel[];
};

type CapabilityPipProps = {
  pip: CapabilityPipViewModel;
};
```

### View model builder

New pure function in `worldViewModel.ts` (or a new `researchViewModel.ts` file):

```typescript
export function buildResearchInspectorViewModel(
  state: GameState,
  registry: RulesRegistry,
): ResearchInspectorViewModel | null {
  const factionId = state.activeFactionId;
  if (!factionId) return null;
  const faction = state.factions.get(factionId as never);
  if (!faction) return null;

  const research = state.research.get(factionId as never);
  const capabilities = faction.capabilities;
  if (!research || !capabilities) return null;

  const domain = registry.getResearchDomain('war_codification');
  if (!domain) return null;

  // Build node VMs
  const nodes: ResearchNodeViewModel[] = Object.values(domain.nodes).map((nodeDef) => {
    const isCompleted = research.completedNodes.includes(nodeDef.id as never);
    const isActive = research.activeNodeId === nodeDef.id;
    const progress = research.progressByNodeId[nodeDef.id as never] ?? 0;

    // Check prerequisites
    const prereqsMet = (nodeDef.prerequisites ?? []).every((prereqId) =>
      research.completedNodes.includes(prereqId as never)
    );

    // Check capability requirements
    const capReqs = Object.entries(nodeDef.requiredCapabilities ?? {}).map(
      ([domainId, required]) => {
        const current = capabilities.domainLevels[domainId] ?? 0;
        return {
          domainId,
          domainName: registry.getCapabilityDomain(domainId)?.name ?? domainId,
          required,
          current,
          met: current >= required,
        };
      }
    );
    const capsMet = capReqs.every((req) => req.met);

    let nodeState: ResearchNodeViewState;
    if (isCompleted) nodeState = 'completed';
    else if (isActive) nodeState = 'active';
    else if (!prereqsMet) nodeState = 'locked';
    else if (!capsMet) nodeState = 'insufficient';
    else nodeState = 'available';

    const unlocks = nodeDef.unlocks.map((unlock) => {
      let name = unlock.id;
      if (unlock.type === 'component') {
        name = registry.getComponent(unlock.id)?.name ?? unlock.id;
      } else if (unlock.type === 'chassis') {
        name = registry.getChassis(unlock.id)?.name ?? unlock.id;
      } else if (unlock.type === 'recipe') {
        name = registry.getHybridRecipe(unlock.id)?.name ?? unlock.id;
      }
      return { ...unlock, name };
    });

    const capBonus = Object.entries(nodeDef.capabilityBonus ?? {}).map(
      ([domainId, amount]) => ({
        domainId,
        domainName: registry.getCapabilityDomain(domainId)?.name ?? domainId,
        amount,
      })
    );

    const hasKnowledgeDiscount = (faction.learnedDomains ?? []).length > 0;
    const effectiveCost = hasKnowledgeDiscount
      ? Math.floor(nodeDef.xpCost * 0.75)
      : nodeDef.xpCost;

    return {
      nodeId: nodeDef.id,
      name: nodeDef.name,
      tier: nodeDef.tier ?? 1,
      xpCost: nodeDef.xpCost,
      discountedXpCost: hasKnowledgeDiscount ? effectiveCost : null,
      currentProgress: progress,
      state: nodeState,
      prerequisites: nodeDef.prerequisites ?? [],
      prerequisiteNames: (nodeDef.prerequisites ?? []).map(
        (id) => domain.nodes[id]?.name ?? id
      ),
      requiredCapabilities: capReqs,
      unlocks,
      qualitativeEffect: nodeDef.qualitativeEffect?.description ?? null,
      capabilityBonus: capBonus,
      estimatedTurns:
        nodeState === 'active' || nodeState === 'available'
          ? Math.ceil(Math.max(0, effectiveCost - progress) / research.researchPerTurn)
          : null,
    };
  });

  // Build capability pips (all 13 domains)
  const allDomains = registry.getAllCapabilityDomains();
  const codifiableDomains = new Set(
    Object.values(domain.nodes).flatMap((n) => Object.keys(n.requiredCapabilities ?? {}))
  );

  const capabilitiesVms: CapabilityPipViewModel[] = allDomains.map((domainDef) => {
    const level = capabilities.domainLevels[domainDef.id] ?? 0;
    return {
      domainId: domainDef.id,
      domainName: domainDef.name,
      description: domainDef.description,
      level,
      hasResearchTrack: codifiableDomains.has(domainDef.id),
      codified: capabilities.codifiedDomains.includes(domainDef.id as never),
      t1Threshold: 4,
      t2Threshold: 8,
      t1Ready: level >= 4,
      t2Ready: level >= 8,
    };
  });

  // Rate breakdown
  const foreignDomainCount = Math.min(2, (faction.learnedDomains ?? []).length);
  const knowledgeBonus = foreignDomainCount;
  const codifiedCount = capabilities.codifiedDomains.length;
  const capBonus = Math.min(
    3,
    codifiedCount > 0
      ? capabilities.codifiedDomains.reduce(
          (sum, domainId) =>
            sum + Math.min(3, Math.floor((capabilities.domainLevels[domainId] ?? 0) / 4)),
          0
        )
      : 0
  );

  return {
    factionId,
    activeNodeId: research.activeNodeId,
    activeNodeName: research.activeNodeId
      ? domain.nodes[research.activeNodeId]?.name ?? research.activeNodeId
      : null,
    activeNodeProgress: research.activeNodeId
      ? (research.progressByNodeId[research.activeNodeId as never] ?? 0)
      : null,
    activeNodeXpCost: research.activeNodeId
      ? domain.nodes[research.activeNodeId]?.xpCost ?? 0
      : null,
    completedCount: research.completedNodes.length,
    totalNodes: Object.keys(domain.nodes).length,
    nodes,
    capabilities: capabilitiesVms,
    rateBreakdown: {
      base: 4,
      knowledgeBonus,
      knowledgeDetail: `${foreignDomainCount} foreign domain${foreignDomainCount !== 1 ? 's' : ''} learned`,
      capabilityBonus: capBonus,
      capabilityDetail: `${codifiedCount} codified domain${codifiedCount !== 1 ? 's' : ''}`,
      total: research.researchPerTurn,
    },
    hasKnowledgeDiscount: foreignDomainCount > 0,
  };
}
```

---

## 9. CSS Class Naming

### New classes — `styles.css` additions

```css
/* ═══════════════════════════════════════
   Research Window — Modal Overlay
   ═══════════════════════════════════════ */

/* Backdrop */
.research-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  background: rgba(23, 19, 14, 0.88);
  backdrop-filter: blur(4px);
  animation: research-overlay-in 200ms ease-out;
}

@keyframes research-overlay-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Main window container */
.research-window {
  width: min(1100px, 94vw);
  max-height: 85vh;
  display: grid;
  grid-template-rows: auto 1fr auto auto;
  gap: 18px;
  overflow: hidden;
  border-radius: 24px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  backdrop-filter: blur(16px);
  box-shadow: var(--shadow);
}

/* Header */
.research-window__header {
  display: flex;
  justify-content: space-between;
  align-items: start;
  padding: 18px 22px 0;
}

.research-window__close {
  border: none;
  background: none;
  color: var(--muted);
  font-size: 1.3rem;
  cursor: pointer;
  padding: 4px 8px;
}

.research-summary {
  display: flex;
  gap: 18px;
  margin-top: 12px;
}

.research-summary__stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.research-summary__label {
  color: var(--muted);
  font-size: 0.76rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.research-summary__value {
  font-size: 0.95rem;
}

/* Body: two-column layout */
.research-window__body {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 18px;
  padding: 0 22px;
  overflow-y: auto;
}

/* ═══════════════════════════════════════
   Research Tree
   ═══════════════════════════════════════ */

.research-tree {
  position: relative;
  display: grid;
  gap: 16px;
  align-content: start;
}

.research-tree__tier {
  display: grid;
  gap: 8px;
}

.research-tier-label {
  color: var(--muted);
  font-family: 'Fraunces', serif;
  font-size: 0.82rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin-bottom: 4px;
}

.research-tree__tier-1,
.research-tree__tier-2 {
  grid-template-columns: repeat(7, minmax(0, 1fr));
}

.research-tree__tier-3 {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

/* Connection SVG overlay */
.research-tree__connections {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}

.research-tree__connections line {
  stroke: var(--border);
  stroke-width: 1;
}

.research-tree__connections line.research-tree__line--completed {
  stroke: rgba(91, 158, 91, 0.4);
}

.research-tree__connections line.research-tree__line--active {
  stroke: var(--accent);
  stroke-dasharray: 4 3;
}

/* ═══════════════════════════════════════
   Research Node Card
   ═══════════════════════════════════════ */

.research-node {
  position: relative;
  z-index: 1;
  padding: 10px;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: rgba(67, 52, 37, 0.28);
  cursor: pointer;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

.research-node:hover {
  border-color: rgba(227, 196, 136, 0.48);
}

.research-node__tier {
  color: var(--muted);
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.research-node__name {
  font-size: 0.82rem;
  font-weight: 600;
  line-height: 1.3;
  margin: 4px 0 6px;
}

.research-node__progress {
  height: 4px;
  border-radius: 2px;
  background: rgba(134, 118, 86, 0.15);
  overflow: hidden;
}

.research-node__progress-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--muted);
  transition: width 300ms ease;
}

.research-node__progress-text {
  font-size: 0.7rem;
  color: var(--muted);
  margin-top: 3px;
}

.research-node__effect {
  font-size: 0.72rem;
  color: var(--muted);
  margin-top: 4px;
}

/* ── Node States ── */

.research-node--completed {
  border-color: rgba(91, 158, 91, 0.36);
  background: rgba(91, 158, 91, 0.1);
}
.research-node--completed .research-node__progress-fill {
  background: #5b9e5b;
}

.research-node--active {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px rgba(214, 163, 75, 0.24), 0 0 12px rgba(214, 163, 75, 0.12);
}
.research-node--active .research-node__progress-fill {
  background: var(--accent);
  animation: research-shimmer 2s ease-in-out infinite;
}

@keyframes research-shimmer {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.72; }
}

.research-node--locked {
  opacity: 0.45;
  cursor: default;
}
.research-node--locked:hover {
  border-color: var(--border);
}

.research-node--insufficient {
  border-color: rgba(214, 134, 59, 0.36);
  background: rgba(214, 134, 59, 0.06);
}

.research-node--selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

/* ═══════════════════════════════════════
   Research Detail Panel
   ═══════════════════════════════════════ */

.research-detail {
  display: grid;
  gap: 14px;
  align-content: start;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid var(--border);
  background: rgba(67, 52, 37, 0.2);
}

.research-detail__empty {
  color: var(--muted);
  font-size: 0.9rem;
  padding: 24px 0;
  text-align: center;
}

.research-detail__req {
  display: grid;
  gap: 6px;
}

.research-detail__req-item {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.88rem;
}

.research-detail__req-item--met {
  color: #5b9e5b;
}
.research-detail__req-item--unmet {
  color: #d6863b;
}

.research-detail__unlock {
  display: grid;
  gap: 4px;
}

.research-detail__unlock-item {
  font-size: 0.88rem;
}

.research-detail__effect {
  font-size: 0.88rem;
  line-height: 1.45;
  color: var(--muted);
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(22, 18, 14, 0.28);
}

.research-detail__action {
  border-radius: 999px;
  padding: 10px 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background 160ms ease;
}

.research-detail__action--primary {
  background: var(--accent);
  color: var(--bg);
  border-color: var(--accent);
}

.research-detail__action--danger {
  background: transparent;
  color: var(--danger);
  border-color: var(--danger);
}

.research-detail__action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ═══════════════════════════════════════
   Capability Bar
   ═══════════════════════════════════════ */

.research-capabilities {
  padding: 14px 22px;
  border-top: 1px solid rgba(227, 196, 136, 0.12);
}

.capability-bar {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.capability-pip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  min-width: 70px;
  padding: 8px 6px;
  border-radius: 12px;
  background: rgba(67, 52, 37, 0.2);
  border: 1px solid rgba(227, 196, 136, 0.08);
}

.capability-pip--research-track {
  border-color: rgba(227, 196, 136, 0.18);
}

.capability-pip--codified {
  border-color: rgba(91, 158, 91, 0.3);
  background: rgba(91, 158, 91, 0.06);
}

.capability-pip__name {
  font-size: 0.7rem;
  font-weight: 500;
  text-align: center;
  color: var(--muted);
}

.capability-pip__level {
  font-size: 0.88rem;
  font-weight: 600;
}

.capability-pip__bar {
  width: 100%;
  height: 3px;
  border-radius: 1.5px;
  background: rgba(134, 118, 86, 0.15);
  overflow: hidden;
}

.capability-pip__bar-fill {
  height: 100%;
  border-radius: 1.5px;
  background: var(--muted);
  transition: width 300ms ease;
}

.capability-pip__bar-fill--t2 {
  background: var(--accent);
}

.capability-pip__bar-fill--t1 {
  background: #5b9e5b;
}

.capability-pip__threshold {
  font-size: 0.62rem;
  color: var(--muted);
}

.capability-pip--ecology-only {
  opacity: 0.6;
}

/* ═══════════════════════════════════════
   Research Window Footer
   ═══════════════════════════════════════ */

.research-window__footer {
  padding: 0 22px 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
}

.research-rate {
  display: grid;
  gap: 6px;
}

/* ═══════════════════════════════════════
   Research chip in TopHud
   ═══════════════════════════════════════ */

.status-chip--research {
  cursor: pointer;
  transition: border-color 160ms ease;
}

.status-chip--research:hover {
  border-color: var(--accent);
}

.status-chip--research .chip-label {
  cursor: pointer;
}

/* ═══════════════════════════════════════
   Responsive
   ═══════════════════════════════════════ */

@media (max-width: 900px) {
  .research-window {
    width: 96vw;
    max-height: 92vh;
  }

  .research-window__body {
    grid-template-columns: 1fr;
  }

  .research-detail {
    order: -1;
  }

  .research-tree__tier-1,
  .research-tree__tier-2 {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .research-tree__tier-3 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 600px) {
  .research-tree__tier-1,
  .research-tree__tier-2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .research-tree__tier-3 {
    grid-template-columns: 1fr;
  }

  .capability-bar {
    gap: 4px;
  }

  .capability-pip {
    min-width: 56px;
    padding: 6px 4px;
  }
}
```

---

## 10. Integration Touchpoints

### `GameShell.tsx` changes

```tsx
const [researchOpen, setResearchOpen] = useState(false);

// Add to render:
{researchOpen && state.research ? (
  <ResearchWindow
    state={state}
    onStartResearch={(nodeId) => controller.dispatch({ type: 'start_research', nodeId })}
    onCancelResearch={() => controller.dispatch({ type: 'cancel_research' })}
    onClose={() => setResearchOpen(false)}
  />
) : null}
```

### `TopHud.tsx` changes

Add a clickable research chip to `top-hud__stats`:
```tsx
{state.hud.researchChip ? (
  <div
    className="status-chip status-chip--research"
    role="button"
    tabIndex={0}
    onClick={onOpenResearch}
  >
    <span className="chip-label">Research</span>
    <strong>{state.hud.researchChip.activeNodeName ?? 'Idle'}</strong>
  </div>
) : null}
```

### `GameController.ts` changes

- Add `researchWindowOpen: boolean` to transient state
- Handle `start_research` / `cancel_research` actions by delegating to `GameSession`
- In `getState()`, call `buildResearchInspectorViewModel()` for play mode
- Populate `hud.researchChip` from research state

### `GameSession.ts` changes

- Handle `start_research`: validate prereqs from registry, call `startResearch()`, emit
- Handle `cancel_research`: set `activeNodeId` to null, emit
- In `advanceTurn()`: continue calling `advanceResearch()` + `addResearchProgress()` (existing logic)
- Research rate recalculation happens in `advanceTurn()` using capability levels and learned domains

---

## 11. ASCII Wireframe — Full Composition

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ┌─ RESEARCH ─────────────────────────────────────────────────────────────┐  │
│ │                                                                        │  │
│ │  RESEARCH            Completed 3/18    Active: Codify Woodcraft (53%)  │  │
│ │  War Codification    Rate: 6 XP/turn                              [×] │  │
│ │                                                                       │  │
│ │  ┌─ TREE ─────────────────────────────────────┐ ┌─ DETAIL ──────────┐ │  │
│ │  │                                              │                    │ │  │
│ │  │  TIER 1 — FOUNDATIONS                        │ TIER 1 · FOUND    │ │  │
│ │  │  ┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐ │ Codify Woodcraft  │ │  │
│ │  │  │✓ CW ││ CH  ││ CP  ││✓ CF ││ Cfo ││✓ CN ││ CE  │ │                   │ │  │
│ │  │  │████ ││██░░ ││░░░░ ││████ ││████ ││████ ││░░░░ │ │ XP    15 (11*)    │ │  │
│ │  │  │8/15 ││4/14 ││0/13 ││DONE ││9/14 ││DONE ││0/12 │ │ Prog   8/15      │ │  │
│ │  │  └──┬──┘└──┬──┘└─────┘└──┬──┘└──┬──┘└──┬──┘└─────┘ │ ETA    2 turns   │ │  │
│ │  │     │      │              │      │      │            │                   │ │  │
│ │  │     │      │              │      │      │            │ REQUIRES          │ │  │
│ │  │     │      │              │      │      │            │ ✓ woodcraft ≥ 4   │ │  │
│ │  │  TIER 2 — SPECIALIZATIONS                │            │   (current: 6)    │ │  │
│ │  │  ┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐ │                   │ │  │
│ │  │  │ MW  ││ MH  ││ MP  ││ MF  ││ Mfo ││ MN  ││ ME  │ │ UNLOCKS          │ │  │
│ │  │  │░░░░ ││░░░░ ││░░░░ ││░░░░ ││░░░░ ││░░░░ ││░░░░ │ │ ◆ Skirmish Drill │ │  │
│ │  │  │20/22││ 0/22││ 0/22││ 0/24││ 0/24││ 0/22││ 0/20│ │                   │ │  │
│ │  │  └──┬──┘└──┬──┘└──┬──┘└──┬──┘└──┬──┘└──┬──┘└──┬──┘ │ EFFECT           │ │  │
│ │  │     └──┬───┘     └──┬───┘└──┬──┘     │      │    │ "First strike     │ │  │
│ │  │        │            │       │        │      │    │  from forest hexes"│ │  │
│ │  │  TIER 3 — SYNTHESIS                        │    │                   │ │  │
│ │  │  ┌──────────────┐┌──────────────┐          │    │ BONUS            │ │  │
│ │  │  │ Forest Cavalry││ Poison Phalan│          │    │ +1 woodcraft     │ │  │
│ │  │  │ ░░░░ 0/35    ││ ░░░░ 0/35   │          │    │                   │ │  │
│ │  │  ├──────────────┤├──────────────┤          │    │ [Start Research] │ │  │
│ │  │  │Amphib Fort   ││Eternal March │          │    │                   │ │  │
│ │  │  │ ░░░░ 0/35    ││ ░░░░ 0/35   │          │    └───────────────────┘ │  │
│ │  │  └──────────────┘└──────────────┘          │                         │ │  │
│ │  └──────────────────────────────────────────────┘                         │ │  │
│ │                                                                          │ │  │
│ │  CAPABILITIES                                                            │ │  │
│ │  ┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐              │ │  │
│ │  │WOOD  ││HORSE ││POISON││HILL· ││FORM  ││FORT  ││MOBIL·│              │ │  │
│ │  │ 6    ││ 4    ││ 3    ││ 2    ││ 5    ││ 4    ││ 7    │              │ │  │
│ │  │███▓  ││██░   ││█░    ││█░    ││████  ││██░   ││█████ │              │ │  │
│ │  │T1✓   ││T1✓   ││      ││      ││T1✓   ││T1✓   ││      │              │ │  │
│ │  └──────┘└──────┘└──────┘└──────┘└──────┘└──────┘└──────┘              │ │  │
│ │  ┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐                       │ │  │
│ │  │STEAL·││SHOCK·││SEAF· ││NAVIG ││DESRT·││ENDUR │                       │ │  │
│ │  │ 1    ││ 3    ││ 2    ││ 5    ││ 0    ││ 4    │                       │ │  │
│ │  │█░    ││█░    ││█░    ││████  ││░     ││██░   │                       │ │  │
│ │  │      ││      ││      ││T1✓   ││      ││T1✓   │                       │ │  │
│ │  └──────┘└──────┘└──────┘└──────┘└──────┘└──────┘                       │ │  │
│ │                                                                          │ │  │
│ │  Rate: 4 base + 1 knowledge + 1 capability = 6 XP/turn    [Close]      │ │  │
│ └──────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 12. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Modal overlay** vs. tab in inspector | 18 nodes with connections need horizontal space the 340px inspector can't provide. A modal lets the player see the full tree at once. |
| **Domain-column grid** vs. force-directed graph | 7 domains × 3 tiers is naturally tabular. A graph layout adds complexity without clarity — the domain grouping is the primary mental model. |
| **Click-to-select detail panel** vs. hover tooltips | Tooltips don't scale to showing requirements, unlocks, effects, and bonuses simultaneously. A persistent detail panel gives full context. |
| **Progress retained on switch** (no penalty) | `progressByNodeId` already stores partial progress. Showing "progress preserved" in the switch confirmation reassures players. |
| **Capability bar at bottom** vs. sidebar | Domains are reference material, not the primary action. A bottom bar keeps them accessible without competing with the tree for horizontal space. |
| **SVG connections** vs. CSS pseudo-elements | SVG allows diagonal lines for T2→T3 synthesis connections, which CSS borders can't achieve cleanly. |
| **Ecology-only domains shown** | Players need to see all 13 levels for hybrid recipe planning. Muting them with `·` markers clearly distinguishes them from research-track domains. |
| **Knowledge discount inline** vs. separate indicator | Showing `~~15~~ 11` directly in the detail panel's cost row is more immediate than a separate toggle or legend. |