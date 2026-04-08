# Help System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a tabbed in-game Help Panel so play testers can understand tribes, combat, research/codify, and the synergy system — with curated player-facing prose, not raw JSON dumps.

**Architecture:** Modal overlay matching existing game UI (same glass-panel pattern as ResearchWindow). Tabbed navigation: Quick Start → Tribes → Combat → Research & Codify → Synergy Encyclopedia. All player-facing text lives in a single curated content file (`web/src/data/help-content.ts`). The Synergy Encyclopedia tab is the only one that dynamically reads from JSON data files, but renders curated descriptions rather than raw fields.

**Tech Stack:** React + TypeScript, existing CSS variable system (dark game UI), Vite build. No new dependencies.

**Repo:** `C:\Users\fosbo\war-civ-v2`
**Web source:** `web/src/`
**Styles:** `web/src/styles.css`

---

## Content Architecture

All curated player-facing text goes in `web/src/data/help-content.ts`. This file exports:

```ts
export interface HelpSection {
  id: string;
  title: string;
  body: string; // HTML-safe prose, rendered via dangerouslySetInnerHTML or React fragments
}

export interface TribeProfile {
  id: string;           // matches civilizations.json id
  name: string;
  color: string;        // faction color hex
  nativeDomain: string; // domain ID
  intro: string;        // 2-3 sentence flavor + playstyle summary
  strengths: string[];  // bullet points
  weaknesses: string[]; // bullet points
  tip: string;          // one concrete strategic tip
}

export interface SynergyGuideEntry {
  pairId: string;       // matches pair-synergies.json id
  playerDescription: string; // human-readable explanation
}

export interface HelpContent {
  quickStart: HelpSection;
  combat: HelpSection;
  research: HelpSection;
  tribes: TribeProfile[];
  synergyGuide: SynergyGuideEntry[];
}
```

**Why a single file:** Easy to review, no build-time loading complexity, we can validate coverage (every pair synergy has a guide entry).

---

## Phase 1: UI Shell + Quick Start

**Goal:** Create the HelpPanel modal, tab navigation, and the Quick Start tab. Wire it into the GameMenuBar so "How to Play" opens it. This proves the pattern; all subsequent phases follow the same component structure.

### Task 1.1: Create help-content.ts with Quick Start content

**Files:**
- Create: `web/src/data/help-content.ts`

**Step 1:** Create the file with the `HelpContent`, `HelpSection`, `TribeProfile`, `SynergyGuideEntry` interfaces and export a `helpContent` object. Fill in `quickStart` with player-facing prose covering:
- How to select and move units (click to select, right-click destination)
- How attacks work (click enemy unit when selected)
- Turn flow (activate units → end turn)
- How to open Reports, Research, and this Help panel
- Brief mention that synergy is the deep strategic system (teaser for later tabs)

Leave `combat`, `research`, `tribes`, `synergyGuide` as empty arrays / placeholder strings — they'll be filled in later phases.

### Task 1.2: Create HelpPanel.tsx

**Files:**
- Create: `web/src/ui/HelpPanel.tsx`

**Step 1:** Build the component following the same modal pattern as `ResearchWindow.tsx`:
- Props: `{ state: ClientState; onClose: () => void; initialTab?: string }`
- Overlay div (`.help-overlay`) with click-to-close
- Inner panel (`.help-panel`) with click-stop-propagation
- Header: "War Guide" title + close button (×)
- Tab bar: 5 tabs (Quick Start, Tribes, Combat, Research & Codify, Synergies). Tabs 2-5 are disabled/grayed initially, enabled as content is added in later phases.
- Content area: renders the active tab's content
- Escape key closes the panel
- BEM class naming: `.help-panel`, `.help-panel__header`, `.help-tab-bar`, `.help-tab`, `.help-tab--active`, `.help-panel__body`, `.help-content`

**Step 2:** Implement Quick Start tab rendering — imports `helpContent` from `../data/help-content`, renders `helpContent.quickStart.body` as HTML.

### Task 1.3: Add HelpPanel CSS to styles.css

**Files:**
- Modify: `web/src/styles.css` (append at end)

**Step 1:** Add styles for:
- `.help-overlay` — full-screen overlay, same as `.research-overlay` pattern
- `.help-panel` — centered modal, `var(--panel-glass)`, `var(--panel-blur)`, `var(--panel-radius-float)`, `var(--panel-shadow-heavy)`, max-width 780px, max-height 85vh, overflow hidden
- `.help-panel__header` — flex row with title and close button
- `.help-tab-bar` — horizontal tab strip, bottom border `var(--border)`
- `.help-tab` — pill-style tabs, hover state, `--active` state with `var(--accent)` underline
- `.help-tab--disabled` — muted, cursor not-allowed
- `.help-panel__body` — scrollable content area, padding, prose styling (`.help-prose h3`, `.help-prose p`, `.help-prose ul`, `.help-prose li`)
- Use existing CSS variables: `--bg`, `--bg-elevated`, `--text`, `--muted`, `--accent`, `--border`
- Match the warm dark aesthetic (Cinzel for headings, Inter for body)

### Task 1.4: Wire HelpPanel into GameMenuBar

**Files:**
- Modify: `web/src/ui/GameMenuBar.tsx`
- Modify: `web/src/game/controller/GameSession.ts` (or wherever menu actions are handled — check the `onMenuAction` handler)

**Step 1:** In `GameMenuBar.tsx`:
- Add prop `onOpenHelp: () => void`
- Update `helpMenu` to enable "How to Play": `{ label: 'How to Play', action: 'open_how_to_play' }`
- In `handleMenuAction`, route `open_how_to_play` to `onOpenHelp()`

**Step 2:** In the parent component that renders `GameMenuBar` (likely `GameSession.ts` or the main App):
- Add `const [helpOpen, setHelpOpen] = useState(false)`
- Pass `onOpenHelp={() => setHelpOpen(true)}` to `GameMenuBar`
- Render `<HelpPanel state={state} onClose={() => setHelpOpen(false)} />` when `helpOpen` is true

**Step 3:** Verify: launch the game, click Help → How to Play, modal opens with Quick Start content. Press Escape or click overlay to close.

**Step 4:** Commit

```bash
git add web/src/data/help-content.ts web/src/ui/HelpPanel.tsx web/src/styles.css web/src/ui/GameMenuBar.tsx
git commit -m "feat(help): add HelpPanel shell with Quick Start tab"
```

---

## Phase 2: Tribes Tab

**Goal:** Add curated profiles for all 9 factions with flavor text, strengths, weaknesses, and strategic tips.

### Task 2.1: Write tribe profiles in help-content.ts

**Files:**
- Modify: `web/src/data/help-content.ts`

**Step 1:** Populate the `tribes` array with 9 `TribeProfile` entries. Source data from `src/content/base/civilizations.json` but rewrite into player-facing prose. For each tribe:
- `id`, `name`, `color`, `nativeDomain` — copy from civilizations.json
- `intro` — 2-3 sentences: who they are, where they live, what makes them unique. Reference their signature unit and passive trait naturally.
- `strengths` — 3 bullet points based on `naturalPrey`, `economyAngle`, `terrainDependence`
- `weaknesses` — 2 bullet points based on `naturalCounter`, terrain limitations
- `tip` — one concrete strategic tip a play tester can use immediately

**Reference data** (civilizations.json):
| id | name | nativeDomain | homeBiome | signatureUnit | passiveTrait |
|---|---|---|---|---|---|
| jungle_clan | Jungle Clans | venom | jungle | Serpent God | jungle_stalkers |
| druid_circle | Druid Circle | nature_healing | forest | Druid Wizard | healing_druids |
| steppe_clan | Steppe Riders | hitrun | plains | Warlord | foraging_riders |
| hill_clan | Hill Engineers | fortress | hill | Catapult | hill_engineering |
| coral_people | Pirate Lords | slaving | coast | Galley | greedy |
| desert_nomads | Desert Nomads | camel_adaptation | desert | Desert Immortals | desert_logistics |
| savannah_lions | Savannah Lions | charge | savannah | War Elephants | charge_momentum |
| plains_riders | River People | river_stealth | river | Ancient Alligator | river_assault |
| frost_wardens | Arctic Wardens | heavy_hitter | tundra | Polar Bear | cold_hardened_growth |

### Task 2.2: Build TribesTab component

**Files:**
- Create: `web/src/ui/TribesTab.tsx`

**Step 1:** Create component that:
- Imports `helpContent` from `../data/help-content`
- Renders a grid/list of tribe cards
- Each card shows: faction color swatch, name, native domain badge (reuse `domainGlyph`/`domainColor` from SynergyChip if possible, or import the domain constants), intro text, strengths/weaknesses lists, tip callout
- Add CSS for tribe cards in styles.css (`.tribe-card`, `.tribe-card__header`, `.tribe-card__swatch`, `.tribe-card__domain`, `.tribe-card__body`, `.tribe-card__tip`)
- Clicking a tribe card could expand it (or keep all visible in a scrollable list — simpler for v1)

### Task 2.3: Wire TribesTab into HelpPanel

**Files:**
- Modify: `web/src/ui/HelpPanel.tsx`

**Step 1:** Import `TribesTab`, render it when the "Tribes" tab is active.
- Enable the "Tribes" tab in the tab bar.

**Step 2:** Commit

```bash
git add web/src/data/help-content.ts web/src/ui/TribesTab.tsx web/src/ui/HelpPanel.tsx web/src/styles.css
git commit -m "feat(help): add Tribes tab with curated faction profiles"
```

---

## Phase 3: Combat Tab

**Goal:** Explain the combat system — attack flow, terrain, retreat, opportunity attacks — and show 2-3 synergy examples inline.

### Task 3.1: Write combat guide content

**Files:**
- Modify: `web/src/data/help-content.ts`

**Step 1:** Populate `helpContent.combat` with prose covering:
- **Attack Flow**: Select unit → click enemy → combat resolves → counter-attack (unless killed)
- **Terrain Effects**: How terrain modifies combat (defense bonuses, rough terrain costs)
- **Opportunity Attacks**: Moving through enemy zones of control triggers free attacks
- **Retreat**: Hit-and-run units can withdraw after attacking
- **Morale & Rout**: Low HP units may rout; synergy effects can change rout thresholds
- **How Synergies Modify Combat**: 2-3 concrete examples:
  - "Toxic Bulwark (Venom + Fortress): Your fortress units radiate poison — enemies standing next to them take damage even without being attacked."
  - "Unstoppable Momentum (Charge + Heavy): Heavy charges deal massive knockback and stun, letting you push through enemy lines."
  - "Death from the Shadows (Venom + Stealth): Stealth ambushes with poison deal double damage and apply poison instantly."
- Keep it ~400-600 words. Use subheadings. Write for someone who has played 1-2 turns.

### Task 3.2: Build CombatTab component

**Files:**
- Create: `web/src/ui/CombatTab.tsx`

**Step 1:** Simple prose renderer — import `helpContent.combat`, render as HTML with `.help-prose` styling. Add a "See Synergies tab for the full list" callout at the bottom linking to the Synergy Encyclopedia tab.

### Task 3.3: Wire CombatTab into HelpPanel

**Files:**
- Modify: `web/src/ui/HelpPanel.tsx`

**Step 1:** Import `CombatTab`, render when "Combat" tab is active. Enable the tab.

**Step 2:** Commit

```bash
git add web/src/data/help-content.ts web/src/ui/CombatTab.tsx web/src/ui/HelpPanel.tsx
git commit -m "feat(help): add Combat tab with synergy examples"
```

---

## Phase 4: Research & Codify Tab

**Goal:** Explain the Learn by Kill → Sacrifice → Research pipeline with a concrete walkthrough example.

### Task 4.1: Write research guide content

**Files:**
- Modify: `web/src/data/help-content.ts`

**Step 1:** Populate `helpContent.research` with prose covering:
- **The Big Picture**: You start with your faction's native domain. To unlock synergies, you need *foreign* domains — abilities from other factions.
- **Learn by Kill**: When your units defeat enemies, there's a chance (25% base, +5% per veteran level) to learn one of their ability domains. Max 3 learned abilities per unit. You can't learn your own faction's domains.
- **Sacrifice (Codify)**: Bring a unit with learned abilities back to your home city and sacrifice it. This permanently adds the learned domain to your faction's research tree.
- **Research Tree**: Each domain has 3 tiers:
  - T1 (Foundation): Free, codifies the domain — makes it available for pair synergies
  - T2 (Mastery, 60 XP): Powers up the domain and contributes to Emergent Rule progress
  - T3 (Transcendence, 100 XP): Fully activates pair synergies with other T3 domains
- **Concrete Example**: "You're playing Jungle Clans (native: Venom). You kill a Steppe Rider with your Serpent God and learn Skirmish Retreat. You bring the Serpent God home and sacrifice it — now Skirmish Retreat is in your research tree. Research it to T3, and your units with both poison and skirmish tags gain the 'Poisoned Skirmish' synergy: retreating leaves a poison trap."
- **Emergent Triple Stacks**: When you have T2+ in 3 domains that match an emergent rule's condition (e.g., one terrain + one combat + one mobility domain), you unlock a powerful faction-wide bonus. These are the ultimate builds.
- Keep it ~500 words. Use the concrete example as the anchor.

### Task 4.2: Build ResearchTab component

**Files:**
- Create: `web/src/ui/ResearchTab.tsx`

**Step 1:** Prose renderer with `.help-prose` styling. Consider a visual flow diagram (Learn → Sacrifice → Research → Synergy) using simple CSS flexbox arrows, if it fits naturally.

### Task 4.3: Wire ResearchTab into HelpPanel

**Files:**
- Modify: `web/src/ui/HelpPanel.tsx`

**Step 1:** Import `ResearchTab`, render when "Research & Codify" tab is active. Enable the tab.

**Step 2:** Commit

```bash
git add web/src/data/help-content.ts web/src/ui/ResearchTab.tsx web/src/ui/HelpPanel.tsx
git commit -m "feat(help): add Research & Codify tab with Learn/Sacrifice walkthrough"
```

---

## Phase 5: Synergy Encyclopedia Tab

**Goal:** Browseable, searchable list of all 55 pair synergies and all emergent triple stacks, with curated player descriptions. This is the reference tab play testers return to.

### Task 5.1: Write synergy guide descriptions

**Files:**
- Modify: `web/src/data/help-content.ts`

**Step 1:** Populate `helpContent.synergyGuide` — one `SynergyGuideEntry` per pair synergy in `pair-synergies.json`. There are 55 entries. Each `playerDescription` should:
- Explain the synergy in plain language (what it does, when it triggers)
- Mention which unit tags activate it
- Give a one-sentence strategic assessment ("Great for...", "Situational but devastating when...")
- Be 2-3 sentences, ~40-60 words
- **Do NOT** copy the JSON `description` field verbatim — rewrite for clarity

**Source:** `web/src/data/pair-synergies.json` → `pairSynergies[]`

### Task 5.2: Build SynergyEncyclopediaTab component

**Files:**
- Create: `web/src/ui/SynergyEncyclopediaTab.tsx`

**Step 1:** Component features:
- **Search bar** — filter synergies by name or description text
- **Domain filter** — row of domain dots (reuse `domainGlyph`/`domainColor` from SynergyChip), click to filter to synergies involving that domain. Multi-select with Ctrl/Cmd.
- **List view** — each synergy rendered as a card/row:
  - Domain dots (colored, with glyphs) showing which two domains combine
  - Synergy name
  - Player description (from `helpContent.synergyGuide`, keyed by `pairId`)
  - Tags showing required unit tags
- **Emergent section** — below the pair list, show all emergent triple stacks from `emergent-rules.json` with their name, condition description, and effect description (curated, not raw)
- **Empty state** — "No synergies match your filters" message

### Task 5.3: Add Synergy Encyclopedia CSS

**Files:**
- Modify: `web/src/styles.css`

**Step 1:** Styles for:
- `.syn-enc-search` — search input, dark bg, accent border on focus
- `.syn-enc-filters` — domain filter row
- `.syn-enc-list` — scrollable list
- `.syn-enc-item` — synergy card/row with domain dots, name, description
- `.syn-enc-item__domains` — domain dot pair
- `.syn-enc-section` — "Emergent Triple Stacks" section header
- `.syn-enc-emergent` — emergent rule card

### Task 5.4: Wire SynergyEncyclopediaTab into HelpPanel

**Files:**
- Modify: `web/src/ui/HelpPanel.tsx`

**Step 1:** Import `SynergyEncyclopediaTab`, render when "Synergies" tab is active. Enable the tab.

**Step 2:** Commit

```bash
git add web/src/data/help-content.ts web/src/ui/SynergyEncyclopediaTab.tsx web/src/styles.css web/src/ui/HelpPanel.tsx
git commit -m "feat(help): add Synergy Encyclopedia with search and domain filters"
```

---

## Phase 6: Polish & Validation

### Task 6.1: Enable all Help menu items

**Files:**
- Modify: `web/src/ui/GameMenuBar.tsx`

**Step 1:** Update `helpMenu`:
- "Controls" → action `open_help` with `initialTab='quick-start'` (or merge into Quick Start)
- "How to Play" → action `open_help` (default tab)
- "About" → can remain disabled for now, or show game version

### Task 6.2: Validate content coverage

**Files:**
- Create: `web/src/data/help-content.test.ts` (optional, or just manual check)

**Step 1:** Verify that every `pairSynergy.id` in `pair-synergies.json` has a corresponding entry in `helpContent.synergyGuide`. Log warnings for any missing.

### Task 6.3: Visual QA

**Step 1:** Open the game, navigate to Help, click through all 5 tabs. Verify:
- All text renders correctly (no HTML escaping issues)
- Tribe cards show correct colors and domain badges
- Synergy search and filters work
- Modal closes on Escape and overlay click
- Tab state persists when switching between tabs
- Scroll position resets when changing tabs
- No layout overflow or cutoff on smaller viewports

**Step 2:** Final commit

```bash
git add -A
git commit -m "feat(help): complete Help System — 5 tabs with curated player content"
```

---

## Subagent Orchestration Plan

| Phase | Subagent Focus | Dependencies | Can Parallel? |
|-------|---------------|-------------|---------------|
| 1 | UI Shell + Quick Start | None (first) | No |
| 2 | Tribes Tab | Phase 1 (shell exists) | After Phase 1 |
| 3 | Combat Tab | Phase 1 | Yes (with Phase 2) |
| 4 | Research & Codify Tab | Phase 1 | Yes (with Phase 2) |
| 5 | Synergy Encyclopedia | Phase 1 | Yes (with Phase 2) |
| 6 | Polish & Validation | Phases 2-5 | No (last) |

**Recommended execution:**
1. Phase 1 solo ( establishes the pattern)
2. Phases 2-5 in parallel (4 subagents, each with a clear brief + copy of the shell code)
3. Phase 6 solo (integration + QA)

Each subagent brief should include:
- This plan document (for context)
- The specific phase's tasks
- The current state of files they'll modify (HelpPanel.tsx, styles.css, help-content.ts)
- Clear instructions NOT to modify files outside their scope
