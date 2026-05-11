# Research UI Dual-Track Display

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Update the technology/research screen to show both the player-chosen research node (+1 XP bonus) and all other domains auto-progressing via ecology/terrain/war/combat bonuses.

**Architecture:** The backend already tracks progress for all nodes via `progressByNodeId`. The UI currently only highlights the `activeNodeId`. We need to (1) surface ecology/war bonus data to the client, (2) distinguish "active" vs "ecology-progressing" nodes visually, and (3) add a summary section showing bonus sources per domain.

**Tech Stack:** React + TypeScript, existing 9tribes web UI components.

---

## Background

The new research system has TWO tracks running simultaneously each turn:

**Track 1: Player-chosen research** (the active node)
- Player picks a node via `startResearch(nodeId)` -> sets `activeNodeId`
- Gets flat `researchPerTurn` XP (1 for human, 2-3 for AI) applied via `addResearchProgress()`
- This is the "bonus" slot -- the +1 the player directs each turn

**Track 2: Ecology/War auto-research** (parallel, passive)
- Every turn, ALL learned domains get auto-progress from three sources:
  - **Terrain bonuses**: Units on affinity terrain + city territory hexes with affinity terrain -> XP for matching domains (e.g., jungle hexes boost venom research)
  - **Proximity bonuses**: Enemy units within 2 hexes -> XP for enemy's native domain if already learned (+0.5 per contact)
  - **Combat bonuses**: Each combat engagement -> +1 XP for enemy's native domain if learned
- Uses `addResearchProgressToNode()` which is NOT gated by `activeNodeId`
- Capped at `MAX_RESEARCH_TERRAIN_BONUS` (5) total per domain

The key insight from the design doc: terrain drives capabilities -> capabilities boost learn chance -> combat + proximity unlock domains -> ecology research advances them -> synergies create unique identities.

---

## Task 1: Add ecology bonus fields to ResearchNodeViewModel

**Objective:** Extend the client-side view model type to carry ecology/war bonus info per node.

**Files:**
- Modify: `web/src/game/types/clientState.ts`

**Step 1: Add ecology fields to ResearchNodeViewModel**

Add these fields after `estimatedTurns` in the `ResearchNodeViewModel` type (around line 303):

```typescript
// Ecology/war auto-research info
ecologyBonus: number | null;
ecologySources: Array<{
  type: 'terrain' | 'proximity' | 'combat';
  amount: number;
  detail: string;
}>;
ecologyEstimatedTurns: number | null;
isEcologyActive: boolean;
```

**Step 2: Verify no compile errors**

Run: `cd /home/frank/repos/9tribes && npx tsc --noEmit`
Expected: No new errors related to the type change

**Step 3: Commit**

```bash
cd /home/frank/repos/9tribes
git add web/src/game/types/clientState.ts
git commit -m "types: add ecology bonus fields to ResearchNodeViewModel"
```

---

## Task 2: Compute and attach ecology bonuses in the view model builder

**Objective:** Make the server-side view model builder compute ecology bonuses for each unlocked domain and attach them to the node VMs.

**Files:**
- Modify: `web/src/game/view-model/inspectors/researchInspectorViewModel.ts`

**Step 1: Import ecology bonus constants and helpers**

Add imports at the top of the file (after line 18):

```typescript
import {
  DOMAIN_TERRAIN_AFFINITY,
  MAX_RESEARCH_TERRAIN_BONUS,
} from '../../../../../src/systems/simulation/factionTurnEffects.js';
import { getHexesInRange } from '../../../../../src/core/grid.js';
import { hexToKey, hexDistance } from '../../../../../src/core/grid.js';
import type { UnitId, CityId } from '../../../../../src/types.js';
```

Note: The ecology bonus functions are currently not exported from `factionTurnEffects.ts`. We need to either export them or replicate the computation. Since the bonus computation is part of the turn processing (not a pure query), the cleanest approach is to compute the bonuses in the view model builder using the same logic.

**Step 2: Add ecology bonus computation function**

Add this function before `buildResearchInspectorViewModel` (around line 80):

```typescript
const TERRAIN_RESEARCH_BONUS: Record<string, number> = {
  plains: 0.25, savannah: 0.25, forest: 0.5, hill: 0.5,
  coast: 0.5, jungle: 0.5, desert: 0.5, tundra: 0.5,
  river: 1.0, swamp: 1.0, mountain: 1.0, oasis: 1.0, ocean: 1.0,
};
const RESEARCH_PROXIMITY_BONUS_PER_CONTACT = 0.5;
const COMBAT_RESEARCH_BONUS = 1.0;

interface EcologyBonusSource {
  type: 'terrain' | 'proximity' | 'combat';
  amount: number;
  detail: string;
}

function computeEcologyBonusesForDomain(
  state: GameState,
  factionId: string,
  domainId: string,
): { bonus: number; sources: EcologyBonusSource[] } {
  const faction = state.factions.get(factionId);
  if (!faction || !state.map || !faction.learnedDomains?.includes(domainId)) {
    return { bonus: 0, sources: [] };
  }

  const sources: EcologyBonusSource[] = [];
  const affinityTerrains = DOMAIN_TERRAIN_AFFINITY?.[domainId];

  // Terrain bonus
  if (affinityTerrains) {
    const affinitySet = new Set(affinityTerrains);
    let terrainBonus = 0;
    let unitCount = 0;

    for (const uid of faction.unitIds) {
      const u = state.units.get(uid as any);
      if (!u || u.hp <= 0) continue;
      const tile = state.map.tiles.get(hexToKey(u.position));
      if (tile && affinitySet.has(tile.terrain)) {
        terrainBonus += TERRAIN_RESEARCH_BONUS[tile.terrain] ?? 0.5;
        unitCount++;
      }
    }

    for (const cid of faction.cityIds) {
      const city = state.cities.get(cid as any);
      if (!city) continue;
      const radius = city.territoryRadius ?? 2;
      for (const hex of getHexesInRange(city.position, radius)) {
        const tile = state.map.tiles.get(hexToKey(hex));
        if (tile && affinitySet.has(tile.terrain)) {
          terrainBonus += TERRAIN_RESEARCH_BONUS[tile.terrain] ?? 0.5;
        }
      }
    }

    terrainBonus = Math.min(terrainBonus, MAX_RESEARCH_TERRAIN_BONUS);
    if (terrainBonus > 0) {
      sources.push({
        type: 'terrain',
        amount: terrainBonus,
        detail: `${unitCount} units + city territory on ${affinityTerrains.slice(0, 2).join('/')} terrain`,
      });
    }
  }

  // Proximity bonus (simplified: count enemy contacts within 2 hexes)
  let proximityBonus = 0;
  let contactCount = 0;
  for (const uid of faction.unitIds) {
    const fUnit = state.units.get(uid as any);
    if (!fUnit || fUnit.hp <= 0) continue;
    for (const [eid, enemyUnit] of state.units) {
      if (enemyUnit.factionId === factionId || enemyUnit.hp <= 0) continue;
      if (hexDistance(fUnit.position, enemyUnit.position) <= 2) {
        const enemyFaction = state.factions.get(enemyUnit.factionId);
        if (enemyFaction && enemyFaction.nativeDomain === domainId) {
          proximityBonus += RESEARCH_PROXIMITY_BONUS_PER_CONTACT;
          contactCount++;
        }
      }
    }
  }

  if (proximityBonus > 0) {
    proximityBonus = Math.min(proximityBonus, MAX_RESEARCH_TERRAIN_BONUS);
    sources.push({
      type: 'proximity',
      amount: proximityBonus,
      detail: `${contactCount} enemy contacts within range`,
    });
  }

  const totalBonus = Math.min(
    sources.reduce((sum, s) => sum + s.amount, 0),
    MAX_RESEARCH_TERRAIN_BONUS,
  );

  return { bonus: totalBonus, sources };
}
```

**Step 3: Wire ecology bonuses into node VMs**

In `buildResearchInspectorViewModel`, inside the node-building loop (around line 106-147), add ecology computation after `estimatedTurns`:

```typescript
// Ecology/war auto-progress (for unlocked domains that are not the active node)
let ecologyBonus = 0;
let ecologySources: { type: 'terrain' | 'proximity' | 'combat'; amount: number; detail: string }[] = [];
let ecologyEstimatedTurns: number | null = null;
let isEcologyActive = false;

if (isUnlocked && !isCompleted) {
  const { bonus, sources } = computeEcologyBonusesForDomain(state, factionId, domainId);
  if (bonus > 0) {
    ecologyBonus = bonus;
    ecologySources = sources;
    isEcologyActive = true;
    ecologyEstimatedTurns = Math.ceil(Math.max(0, nodeDef.xpCost - progress) / bonus);
  }
}
```

Then add these fields to the `nodes.push()` call (after `estimatedTurns`, around line 141):

```typescript
ecologyBonus,
ecologySources,
ecologyEstimatedTurns,
isEcologyActive,
```

**Step 4: Verify no compile errors**

Run: `cd /home/frank/repos/9tribes && npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
cd /home/frank/repos/9tribes
git add web/src/game/view-model/inspectors/researchInspectorViewModel.ts
git commit -m "feat: compute ecology bonuses in research view model builder"
```

---

## Task 3: Update ResearchTree to show all progress + ecology indicators

**Objective:** Make the ResearchTree visually distinguish active research from ecology auto-progress and show progress bars for all nodes with any progress.

**Files:**
- Modify: `web/src/ui/ResearchTree.tsx`
- Modify: `web/src/ui/ResearchNode.tsx`

**Step 1: Pass ecology info through ResearchNode**

Update `ResearchNode.tsx` to accept and render ecology info. Modify the props type (line 4):

```typescript
type ResearchNodeProps = {
  node: ResearchNodeViewModel;
  selected: boolean;
  onSelect: () => void;
};
```

Keep the same, but add ecology indicator rendering. After the existing progress section (around line 53), add:

```typescript
{node.isEcologyActive && node.state !== 'completed' && (
  <div className="research-node__ecology-badge">
    <span className="research-node__ecology-icon" aria-label="Ecology progress">&#9889;</span>
    <span className="research-node__ecology-text">+{node.ecologyBonus?.toFixed(1) ?? 0}/turn</span>
  </div>
)}
{node.ecologyEstimatedTurns !== null && node.state !== 'completed' && node.state !== 'active' && (
  <div className="research-node__ecology-turns">
    ~{node.ecologyEstimatedTurns} turns
  </div>
)}
```

**Step 2: Update ResearchTree domain row labels to show ecology activity count**

In `ResearchTree.tsx`, modify the domain row rendering (around line 63-67). Change the label section to:

```typescript
<div className="research-domain-row__label">
  <span className="research-domain-row__name">{domain.name}</span>
  {isNative && <span className="research-domain-row__native-badge" aria-label="Native">&#9733;</span>}
  {(() => {
    const ecologyCount = [t1, t2, t3].filter(n => n?.isEcologyActive)?.length;
    return ecologyCount > 0
      ? <span className="research-domain-row__ecology-count" aria-label={`${ecologyCount} domains with ecology progress`}>&#9889;{ecologyCount}</span>
      : null;
  })()}
</div>
```

**Step 3: Add CSS for ecology indicators**

Find the research CSS file and add ecology styles:

```bash
cd /home/frank/repos/9tribes && find . -name "*.css" | xargs grep -l "research-node" | head -3
```

Add these styles to the research CSS file:

```css
/* Ecology/auto-progress indicators */
.research-node__ecology-badge {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.7rem;
  color: var(--color-ecology, #4ade80);
  margin-top: 0.25rem;
}

.research-node__ecology-icon {
  font-size: 0.75rem;
}

.research-node__ecology-turns {
  font-size: 0.65rem;
  color: var(--color-ecology-muted, #86efac);
  margin-top: 0.15rem;
}

.research-domain-row__ecology-count {
  font-size: 0.7rem;
  color: var(--color-ecology, #4ade80);
  margin-left: 0.25rem;
}

.research-node--ecology-active .research-node__progress-fill {
  background: linear-gradient(90deg, var(--color-ecology, #4ade80), var(--color-ecology-muted, #86efac));
}
```

**Step 4: Verify no compile errors**

Run: `cd /home/frank/repos/9tribes && npx tsc --noEmit`

**Step 5: Commit**

```bash
cd /home/frank/repos/9tribes
git add web/src/ui/ResearchNode.tsx web/src/ui/ResearchTree.tsx [css file]
git commit -m "ui: show ecology progress indicators in research tree"
```

---

## Task 4: Split ResearchWindow header into dual-track summary

**Objective:** Add an ecology summary section to the research window header showing how many domains are auto-progressing and total ecology XP/turn.

**Files:**
- Modify: `web/src/ui/ResearchWindow.tsx`

**Step 1: Compute ecology summary from research nodes**

After the existing `activeProgress` computation (line 47), add:

```typescript
const ecologyNodes = research.nodes.filter((n) => n.isEcologyActive);
const totalEcologyBonus = ecologyNodes.reduce((sum, n) => sum + (n.ecologyBonus ?? 0), 0);
const ecologyDomains = new Set(ecologyNodes.map((n) => n.domain));
```

**Step 2: Add ecology summary in header**

In the header section (lines 52-72), add an ecology summary row after the existing stats (after line 69):

```typescript
{ecologyDomains.size > 0 && (
  <div className="research-header-stats">
    <span className="research-header-stat research-header-stat--ecology">
      <span className="research-header-ecology-icon">&#9889;</span>
      <strong>{ecologyDomains.size} domain{ecologyDomains.size !== 1 ? 's' : ''}</strong> auto-researching
      <span className="research-header-stat--detail">+{totalEcologyBonus.toFixed(1)} total XP/turn</span>
    </span>
  </div>
)}
```

**Step 3: Add ecology header CSS**

```css
.research-header-stat--ecology {
  color: var(--color-ecology, #4ade80);
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.research-header-ecology-icon {
  font-size: 0.9rem;
}

.research-header-stat--detail {
  font-size: 0.75rem;
  opacity: 0.8;
  margin-left: 0.25rem;
}
```

**Step 4: Commit**

```bash
cd /home/frank/repos/9tribes
git add web/src/ui/ResearchWindow.tsx [css file]
git commit -m "ui: add ecology summary to research window header"
```

---

## Task 5: Update ResearchDetail to show ecology sources

**Objective:** When a node with ecology progress is selected, show the bonus sources (terrain, proximity, combat) and ecology estimated turns alongside the player research info.

**Files:**
- Modify: `web/src/ui/ResearchDetail.tsx`

**Step 1: Add ecology section to ResearchDetail**

After the existing research rate section (line 100), add ecology bonus display if applicable:

```typescript
{node.isEcologyActive && node.ecologyBonus !== null && node.ecologyBonus > 0 ? (
  <div className="research-detail__section research-detail__section--ecology">
    <p className="panel-kicker">Ecology & War Progress</p>
    <div className="meta-row">
      <span>Auto XP/turn</span>
      <strong style={{ color: 'var(--color-ecology, #4ade80)' }}>+{node.ecologyBonus.toFixed(1)}</strong>
    </div>
    {node.ecologyEstimatedTurns !== null && node.state !== 'completed' ? (
      <div className="meta-row">
        <span>Ecology Est. Turns</span>
        <strong>~{node.ecologyEstimatedTurns}</strong>
      </div>
    ) : null}
    {node.ecologySources && node.ecologySources.length > 0 ? (
      <div className="research-detail__source-list">
        {node.ecologySources.map((source, i) => (
          <div key={i} className="research-detail__source-item">
            <span className="research-detail__source-icon">
              {source.type === 'terrain' ? '&#9874;' : source.type === 'proximity' ? '&#128205;' : '&#128299;'}
            </span>
            <span className="research-detail__source-detail">
              <strong>{source.detail}</strong>
              <span className="research-detail__source-amount">+{source.amount.toFixed(1)}</span>
            </span>
          </div>
        ))}
      </div>
    ) : null}
    <div className="research-detail__ecology-hint">
      Auto-progress advances this domain passively each turn from terrain, proximity, and combat.
    </div>
  </div>
) : null}
```

**Step 2: Add ecology detail CSS**

```css
.research-detail__section--ecology {
  border: 1px solid var(--color-ecology-border, rgba(74, 222, 128, 0.3));
  background: var(--color-ecology-bg, rgba(74, 222, 128, 0.05));
  border-radius: 0.375rem;
  padding: 0.75rem;
}

.research-detail__source-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: 0.5rem;
}

.research-detail__source-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
}

.research-detail__source-icon {
  font-size: 0.9rem;
  width: 1.25rem;
  text-align: center;
}

.research-detail__source-detail {
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.research-detail__source-amount {
  color: var(--color-ecology, #4ade80);
  font-weight: 600;
}

.research-detail__ecology-hint {
  font-size: 0.7rem;
  color: var(--color-text-muted, #9ca3af);
  font-style: italic;
  margin-top: 0.5rem;
  line-height: 1.4;
}
```

**Step 3: Update the state label for ecology nodes that are not active**

In the button label logic (lines 51-65), add a case for ecology-active nodes:

```typescript
if (node.state === 'active') {
  buttonLabel = 'In Progress';
} else if (node.isEcologyActive && node.state !== 'completed') {
  buttonLabel = 'Auto-Researching';
} else if (node.state === 'locked' || node.isLocked) {
  // ... existing
}
```

**Step 4: Commit**

```bash
cd /home/frank/repos/9tribes
git add web/src/ui/ResearchDetail.tsx [css file]
git commit -m "ui: show ecology sources and auto-progress in research detail"
```

---

## Task 6: Update ResearchNode progress display for non-active nodes

**Objective:** Ensure the progress bar renders correctly for ecology-progressing nodes that are not the active research target. Currently progress bars only render for non-completed nodes -- they should render for ANY node with progress > 0.

**Files:**
- Modify: `web/src/ui/ResearchNode.tsx`

**Step 1: Update progress bar rendering condition**

The existing condition at line 47 is:
```typescript
{node.state !== 'completed' && node.xpCost > 0 && (
```

This already covers it since ecology nodes won't be 'completed' and have xpCost > 0. But we should ensure the progress bar uses the right color for ecology vs active. Change the progress fill to conditionally add the ecology class:

```typescript
<div className={`research-node__progress${node.isEcologyActive && node.state !== 'active' ? ' research-node__progress--ecology' : ''}`}>
  <div className="research-node__progress-fill" style={{ width: `${progressPct}%` }} />
</div>
```

**Step 2: Add ecology progress CSS variant**

```css
.research-node__progress--ecology .research-node__progress-fill {
  background: linear-gradient(90deg, #4ade80, #86efac);
}
```

**Step 3: Commit**

```bash
cd /home/frank/repos/9tribes
git add web/src/ui/ResearchNode.tsx [css file]
git commit -m "ui: color-code progress bars for ecology vs active research"
```

---

## Task 7: Add research rate breakdown for ecology in the window

**Objective:** Show a more detailed XP/turn breakdown in the research window header, separating player-directed XP from ecology XP.

**Files:**
- Modify: `web/src/ui/ResearchWindow.tsx`
- Modify: `web/src/game/types/clientState.ts` (add field to ResearchRateBreakdown)

**Step 1: Add ecology total to ResearchRateBreakdown**

In `clientState.ts`, update the type (around line 320):

```typescript
export type ResearchRateBreakdown = {
  base: number;
  detail: string;
  total: number;
  ecologyTotal: number;
};
```

**Step 2: Compute ecology total in view model builder**

In `researchInspectorViewModel.ts`, compute the ecology total and add it to the return value (around line 181):

```typescript
const ecologyNodes = nodes.filter(n => n.isEcologyActive);
const ecologyTotal = ecologyNodes.reduce((sum, n) => sum + (n.ecologyBonus ?? 0), 0);
```

Add `ecologyTotal` to the returned object:

```typescript
rateBreakdown: {
  base: research.researchPerTurn,
  detail: /* existing logic */,
  total: totalRate,
  ecologyTotal,
},
```

**Step 3: Display combined rate in header**

In `ResearchWindow.tsx`, update the XP/turn display:

```typescript
<span className="research-header-stat">
  <strong>{research.rateBreakdown.total}</strong> XP/turn directed
  {research.rateBreakdown.ecologyTotal > 0 ? (
    <span className="research-header-stat--ecology-inline">
      +{research.rateBreakdown.ecologyTotal.toFixed(1)} auto
    </span>
  ) : null}
</span>
```

**Step 4: Commit**

```bash
cd /home/frank/repos/9tribes
git add web/src/game/types/clientState.ts web/src/game/view-model/inspectors/researchInspectorViewModel.ts web/src/ui/ResearchWindow.tsx
git commit -m "ui: show directed + auto XP/turn breakdown in research header"
```

---

## Task 8: Visual polish -- domain row grouping with ecology highlight

**Objective:** Make domain rows that have ecology progress visually stand out in the tree with a subtle background glow.

**Files:**
- Modify: `web/src/ui/ResearchTree.tsx`
- Modify: CSS file

**Step 1: Add ecology highlight class to domain rows**

In `ResearchTree.tsx`, when rendering domain rows (line 60-63), add an ecology-active class:

```typescript
const hasEcology = [t1, t2, t3].some(n => n?.isEcologyActive);
return (
  <div
    key={domain.id}
    className={`research-domain-row${isNative ? ' research-domain-row--native' : ''}${hasEcology ? ' research-domain-row--ecology' : ''}`}
  >
```

**Step 2: Add CSS for ecology-highlighted rows**

```css
.research-domain-row--ecology {
  background: var(--color-ecology-row, rgba(74, 222, 128, 0.03));
  border-left: 2px solid var(--color-ecology, #4ade80);
  border-radius: 0.25rem;
  padding-left: 0.5rem;
  margin-left: -0.5rem;
}
```

**Step 3: Commit**

```bash
cd /home/frank/repos/9tribes
git add web/src/ui/ResearchTree.tsx [css file]
git commit -m "ui: highlight domain rows with ecology progress"
```

---

## Verification

After all tasks are complete:

1. **Run the dev server:** `cd /home/frank/repos/9tribes && npm run dev` (or whatever the start command is)
2. **Open the game** and navigate to the research window
3. **Verify:**
   - Active research node shows "In Progress" with player XP/turn
   - Other unlocked domains with terrain/proximity contacts show lightning bolt icon + auto XP/turn
   - Clicking an ecology-progressing node shows its sources (terrain types, contact count) in the detail panel
   - Header shows "X XP/turn directed +Y auto" combined rate
   - Domain rows with ecology progress have a subtle green left border highlight
   - Estimated turns shown for both active and ecology nodes

---

## Notes on CSS file location

Find the research CSS:
```bash
cd /home/frank/repos/9tribes && find . -name "*.css" | xargs grep -l "research-window\|research-node" 2>/dev/null
```

Most likely it's in `web/src/styles/` or embedded in a global CSS file. All new CSS classes should go into the same file.
