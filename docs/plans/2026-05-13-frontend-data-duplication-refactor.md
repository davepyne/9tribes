# Frontend Data Duplication Refactor — Phased Plan

> **For Hermes:** Use Claude Code (tmux interactive mode) to implement this plan phase-by-phase.

**Goal:** Eliminate all frontend data duplication so the frontend reads from the backend as the single source of truth.

**Architecture:** The monorepo has two independent build pipelines (`src/` and `web/`), but Vite + tsconfig already allow cross-boundary imports — the view model layer (`researchInspectorViewModel.ts`, etc.) already imports types, functions, and JSON directly from `../../../../../src/`. The UI components have simply never been converted. The plan removes the duplication layers in order: first the trivial JSON copies, then the scattered display constants, then the recomputed game logic.

**Tech Stack:** TypeScript 5.x, Vite 5.x, React 18, JSON data files

---

## Phase 0: Eliminate JSON File Duplication

**Objective:** Replace all frontend `web/src/data/*.json` imports with direct cross-boundary imports from `src/content/base/`. Delete the duplicate JSON files.

**Rationale:** The view model layer already proves this works (it imports `research.json`, `civilizations.json`, etc. directly from `../../../../../src/content/base/`). These 7 JSON files are byte-for-byte identical copies — they provide zero value and will drift on the first missed sync.

### Task 0.1: Audit all `../data/*.json` imports

**Objective:** Find every file that imports from `web/src/data/` JSON files.

**Files:**
- Search: `web/src/` for imports from `'../data/` or `'./data/` or `web/src/data/`

**Step 1: Run the search**

Run: `grep -rn "from '\.\.\/data/" web/src/` and `grep -rn "from '\.\/data/" web/src/`

Expected result: list of ~20 import statements across ~10 files (SynergyChip, SynergyEncyclopediaTab, GameShell, resolveActiveSynergies, KnowledgeGainedModal, etc.)

**Step 2: Create mapping of old import → new import**

```
Old: `import pairSynergiesData from '../data/pair-synergies.json';`
New: `import pairSynergiesData from '../../../../../src/content/base/pair-synergies.json';`

Old: `import emergentRulesData from '../data/emergent-rules.json';`
New: `import emergentRulesData from '../../../../../src/content/base/emergent-rules.json';`

Old: `import abilityDomainsData from '../data/ability-domains.json';`
New: `import abilityDomainsData from '../../../../../src/content/base/ability-domains.json';`

Old: `import researchData from '../data/research.json';`
New: `import researchData from '../../../../../src/content/base/research.json';`
```

Note: The relative path depth varies depending on the importing file's location under `web/src/`. Files in `web/src/ui/` need `../../../` while files in `web/src/app/` need `../../../` as well since both are 2 levels deep from the web root.

### Task 0.2: Update imports in SynergyChip.tsx

**Objective:** Switch 4 JSON imports in this file.

**Step 1: Edit the file**

In `web/src/ui/SynergyChip.tsx`, change lines 5-8:

```typescript
import pairSynergiesData from '../data/pair-synergies.json';
import emergentRulesData from '../data/emergent-rules.json';
import abilityDomainsData from '../data/ability-domains.json';
import researchData from '../data/research.json';
```

To:

```typescript
import pairSynergiesData from '../../../src/content/base/pair-synergies.json';
import emergentRulesData from '../../../src/content/base/emergent-rules.json';
import abilityDomainsData from '../../../src/content/base/ability-domains.json';
import researchData from '../../../src/content/base/research.json';
```

**Step 2: Verify the build**

Run: `cd /home/frank/repos/9tribes && npx tsc --noEmit --project web/tsconfig.json`

Expected: zero errors.

**Step 3: Commit**

```bash
git add web/src/ui/SynergyChip.tsx
git commit -m "refactor: direct cross-boundary imports in SynergyChip"
```

### Task 0.3: Update imports in SynergyEncyclopediaTab.tsx

**Objective:** Switch 2 JSON imports in this file.

**Step 1: Edit the file**

In `web/src/ui/SynergyEncyclopediaTab.tsx`, change lines 3-4:

```typescript
import pairSynergiesData from '../data/pair-synergies.json';
import emergentRulesData from '../data/emergent-rules.json';
```

To:

```typescript
import pairSynergiesData from '../../../src/content/base/pair-synergies.json';
import emergentRulesData from '../../../src/content/base/emergent-rules.json';
```

**Step 2: Run type check**

Run: `npx tsc --noEmit --project web/tsconfig.json`

Expected: zero errors.

**Step 3: Commit**

```bash
git add web/src/ui/SynergyEncyclopediaTab.tsx
git commit -m "refactor: direct cross-boundary imports in SynergyEncyclopediaTab"
```

### Task 0.4: Update imports in remaining UI files

**Objective:** Switch JSON imports in GameShell.tsx, resolveActiveSynergies.ts, KnowledgeGainedModal.tsx, TechDiscoveryModal.tsx, EnemySynergyContactModal.tsx.

**Files to modify:**

- `web/src/app/GameShell.tsx` (lines 28-29: pair-synergies.json, emergent-rules.json)
- `web/src/ui/resolveActiveSynergies.ts` (lines 1-2: pair-synergies.json, emergent-rules.json)
- `web/src/ui/KnowledgeGainedModal.tsx` (lines 3-4: pair-synergies.json, emergent-rules.json)
- `web/src/ui/TechDiscoveryModal.tsx` (line 3: research.json)
- `web/src/ui/EnemySynergyContactModal.tsx` (line 7: pair-synergies.json)

All files under `web/src/ui/` use `../../../` relative path. `GameShell.tsx` is in `web/src/app/` which also needs `../../../`.

**Step 1: Update each file**

For each file, replace `'../data/` with `'../../../src/content/base/` in JSON import paths.

**Step 2: Run type check**

Run: `npx tsc --noEmit --project web/tsconfig.json`

Expected: zero errors.

**Step 3: Commit**

```bash
git add web/src/app/GameShell.tsx web/src/ui/resolveActiveSynergies.ts web/src/ui/KnowledgeGainedModal.tsx web/src/ui/TechDiscoveryModal.tsx web/src/ui/EnemySynergyContactModal.tsx
git commit -m "refactor: direct cross-boundary JSON imports in remaining UI files"
```

### Task 0.5: Delete duplicate JSON files

**Objective:** Remove the now-unnecessary copies.

**Files to delete:**
- `web/src/data/ability-domains.json`
- `web/src/data/civilizations.json`
- `web/src/data/components.json`
- `web/src/data/economy.json`
- `web/src/data/emergent-rules.json`
- `web/src/data/pair-synergies.json`
- `web/src/data/research.json`
- `web/src/data/terrains.json`

**Step 1: Delete and verify**

Run: `cd /home/frank/repos/9tribes && rm web/src/data/ability-domains.json web/src/data/civilizations.json web/src/data/components.json web/src/data/economy.json web/src/data/emergent-rules.json web/src/data/pair-synergies.json web/src/data/research.json web/src/data/terrains.json`

Run: `npx tsc --noEmit --project web/tsconfig.json` — expected: zero errors.

**Step 2: Check remaining web/src/data/ files**

`web/src/data/faction-info.ts` and `web/src/data/help-content.ts` stay — they're TypeScript data files, not JSON copies.

**Step 3: Commit**

```bash
git add web/src/data/
git commit -m "refactor: remove duplicate JSON copies, now imported directly from src/content/base/"
```

### Phase 0 Verification

- [ ] `npx tsc --noEmit --project web/tsconfig.json` passes
- [ ] `npm run web:dev` starts without import errors
- [ ] No remaining `import ... from '../data/*.json'` in `web/src/` (grep to confirm)
- [ ] All 7 JSON files removed from `web/src/data/`

---

## Phase 1: Consolidate Domain Display Constants

**Objective:** Eliminate the scatter of `DOMAIN_NAMES`, `DOMAIN_COLORS`, `DOMAIN_ICONS`, and `ALL_DOMAIN_IDS` across SynergyChip.tsx and SynergyEncyclopediaTab.tsx by extracting them into a single shared file that both components import.

**Rationale:** This is the highest-pain-per-touch issue — renaming a domain means editing constant records in 3+ files manually. A centralized `domainMeta.ts` means one source of truth for the frontend layer.

### Task 1.1: Create shared domain metadata file

**Objective:** Extract display constants into `web/src/data/domainMeta.ts`.

**Files:**
- Create: `web/src/data/domainMeta.ts`

**Step 1: Write the shared file**

Contents:
```typescript
/**
 * Centralized domain metadata for frontend display.
 * Single source of truth — all UI components import from here.
 * If a domain needs a different display name in a specific context
 * (e.g., ResearchTree), override locally from this base.
 */

export const DOMAIN_IDS = [
  'venom',
  'fortress',
  'charge',
  'hitrun',
  'tidal_warfare',
  'slaving',
  'nature_healing',
  'river_stealth',
  'camel_adaptation',
  'heavy_hitter',
] as const;

export type DomainId = typeof DOMAIN_IDS[number];

export const DOMAIN_COLORS: Record<DomainId, string> = {
  venom: '#4ade80',
  fortress: '#60a5fa',
  charge: '#f59e0b',
  hitrun: '#94a3b8',
  tidal_warfare: '#22d3ee',
  slaving: '#dc2626',
  nature_healing: '#10b981',
  river_stealth: '#a855f7',
  camel_adaptation: '#d97706',
  heavy_hitter: '#64748b',
};

export const DOMAIN_ICONS: Record<DomainId, string> = {
  venom: '\u2623',
  fortress: '\u26E8',
  charge: '\u1F418',
  hitrun: '\u276F',
  tidal_warfare: '\u1F30A',
  slaving: '\u2694',
  nature_healing: '\u273E',
  river_stealth: '\u1F30F',
  camel_adaptation: '\u1F42A',
  heavy_hitter: '\u2696',
};

// Display name overrides for ability domains
export const DOMAIN_NAMES: Record<DomainId, string> = {
  venom: 'Venomcraft',
  fortress: 'Fortress Discipline',
  charge: 'Charge',
  hitrun: 'Skirmish Pursuit',
  tidal_warfare: 'Tidal Warfare',
  slaving: 'Slaving',
  nature_healing: 'Nature Healing',
  river_stealth: 'River Stealth',
  camel_adaptation: 'Camel Adaptation',
  heavy_hitter: 'Heavy Hitter',
};
```

**Step 2: Verify the file compiles**

Run: `npx tsc --noEmit --project web/tsconfig.json`

Expected: zero errors.

**Step 3: Commit**

```bash
git add web/src/data/domainMeta.ts
git commit -m "feat: add centralized domain metadata file"
```

### Task 1.2: Refactor SynergyChip.tsx to use shared constants

**Objective:** Replace inline `DOMAIN_COLORS`, `DOMAIN_ICONS`, `DOMAIN_NAMES` with imports from `domainMeta.ts`. Keep the helper functions (`domainGlyph`, `domainColor`, `domainDisplayName`, `domainBenefit`) exported for consumers.

**Files:**
- Modify: `web/src/ui/SynergyChip.tsx`

**Step 1: Edit the file**

Remove lines 64-102 (the `DOMAIN_COLORS`, `DOMAIN_ICONS`, `DOMAIN_NAMES` records). Add import at top:

```typescript
import { DOMAIN_COLORS, DOMAIN_ICONS, DOMAIN_NAMES } from '../data/domainMeta';
```

Keep the helper functions `domainGlyph()`, `domainColor()`, `domainDisplayName()`, `domainBenefit()` — they use the constants internally so they still work.

**Step 2: Run type check**

Run: `npx tsc --noEmit --project web/tsconfig.json`

Expected: zero errors.

**Step 3: Commit**

```bash
git add web/src/ui/SynergyChip.tsx
git commit -m "refactor: SynergyChip imports domain constants from shared domainMeta"
```

### Task 1.3: Refactor SynergyEncyclopediaTab.tsx to use shared constants

**Objective:** Replace inline `ALL_DOMAIN_IDS` with import from `domainMeta.ts`.

**Files:**
- Modify: `web/src/ui/SynergyEncyclopediaTab.tsx`

**Step 1: Edit the file**

Remove line 9:
```typescript
const ALL_DOMAIN_IDS = ['venom', 'fortress', 'charge', 'hitrun', 'tidal_warfare', 'slaving', 'nature_healing', 'river_stealth', 'camel_adaptation', 'heavy_hitter'];
```

Add import at the top:
```typescript
import { DOMAIN_IDS } from '../data/domainMeta';
```

Replace references: `ALL_DOMAIN_IDS` → `DOMAIN_IDS`

**Step 2: Run type check**

Run: `npx tsc --noEmit --project web/tsconfig.json`

Expected: zero errors. Note: `domainGlyph`, `domainColor`, `domainDisplayName` are already imported from `SynergyChip` (line 7), which now pulls from `domainMeta` internally. No change needed for those.

**Step 3: Commit**

```bash
git add web/src/ui/SynergyEncyclopediaTab.tsx
git commit -m "refactor: SynergyEncyclopediaTab uses shared DOMAIN_IDS from domainMeta"
```

### Task 1.4: Refactor ResearchTree.tsx to use shared domain IDs (with override names)

**Objective:** ResearchTree has its own short names (e.g. "Venom" instead of "Venomcraft", "Hit & Run" instead of "Skirmish Pursuit"). Keep the intentional override but import the domain list from the shared source.

**Files:**
- Modify: `web/src/ui/ResearchTree.tsx`

**Step 1: Edit the file**

Replace the inline `DOMAINS` constant with one built from shared IDs + override names:

```typescript
import { DOMAIN_IDS } from '../data/domainMeta';

const DOMAIN_NAMES_OVERRIDE: Record<string, string> = {
  venom: 'Venom',
  fortress: 'Fortress',
  charge: 'Charge',
  hitrun: 'Hit & Run',
  nature_healing: 'Nature Healing',
  camel_adaptation: 'Camel Adapt',
  tidal_warfare: 'Tidal War',
  river_stealth: 'River Stealth',
  slaving: 'Slaving',
  heavy_hitter: 'Heavy Hitter',
};

const DOMAINS = DOMAIN_IDS.map((id) => ({ id, name: DOMAIN_NAMES_OVERRIDE[id] ?? id }));
```

This means if a new domain is added to `DOMAIN_IDS` in `domainMeta.ts`, it automatically appears in the research tree (with its ID as fallback name) rather than needing a manual edit to both lists.

**Step 2: Run type check**

Run: `npx tsc --noEmit --project web/tsconfig.json`

Expected: zero errors.

**Step 3: Commit**

```bash
git add web/src/ui/ResearchTree.tsx
git commit -m "refactor: ResearchTree derives domain list from shared DOMAIN_IDS"
```

### Phase 1 Verification

- [ ] `npx tsc --noEmit --project web/tsconfig.json` passes
- [ ] `npm run web:dev` starts and renders domain displays correctly
- [ ] SynergyChip popup shows correct colors/icons/names
- [ ] Encyclopedia tab shows correct filter dots with colors/icons
- [ ] ResearchTree shows correct domain names (including intentional overrides like "Hit & Run")
- [ ] `grep -rn "DOMAIN_NAMES\s*:" web/src/` returns only results in domainMeta.ts
- [ ] `grep -rn "DOMAIN_COLORS\s*:" web/src/` returns only results in domainMeta.ts
- [ ] `grep -rn "DOMAIN_ICONS\s*:" web/src/` returns only results in domainMeta.ts

---

## Phase 2: Store Computed Ecology State in GameState

**Objective:** Eliminate the computed logic duplication in `researchInspectorViewModel.ts`'s `computeEcologyBonusesForDomain()` by storing ecology bonus results in GameState during turn processing, so the view model simply reads them.

**Rationale:** This is the most dangerous duplication — the frontend reimplements game logic. Every time terrain system or combat bonuses change, both implementations must stay in sync.

### Task 2.1: Add ecology bonus accumulators to ResearchState

**Files:**
- Modify: `src/game/types.ts` (the ResearchState type)

**Step 1: Locate the ResearchState interface**

Search for `interface ResearchState` in `src/game/types.ts`.

**Step 2: Add ecology bonus fields**

Add after existing combat bonus accumulator:
```typescript
/** Per-domain ecology bonus computed during turn processing, for UI consumption */
ecologyBonusesThisTurn: Record<string, number>;
/** Source breakdown for each domain's ecology bonus */
ecologyBonusSourcesThisTurn: Record<string, EcologyBonusSource[]>;
```

Where `EcologyBonusSource` is:
```typescript
export interface EcologyBonusSource {
  type: 'terrain' | 'proximity' | 'combat';
  amount: number;
  detail: string;
}
```

**Step 3: Add initial values to research creation**

Find where `ResearchState` is initialized (likely `createInitialResearchState` or similar) and add:
```typescript
ecologyBonusesThisTurn: {},
ecologyBonusSourcesThisTurn: {},
```

**Step 4: Run type check**

Run: `npx tsc --noEmit`

Expected: zero errors on the backend type check.

**Step 5: Commit**

```bash
git add src/game/types.ts
git commit -m "feat: add ecology bonus fields to ResearchState"
```

### Task 2.2: Store ecology bonuses during turn processing

**Objective:** In `factionTurnEffects.ts`, populate `research.ecologyBonusesThisTurn` and `research.ecologyBonusSourcesThisTurn` during the ecology pass, so the frontend can read them.

**Files:**
- Modify: `src/systems/simulation/factionTurnEffects.ts`

**Step 1: Locate `applyResearchEffects` or `applyEcologyResearchPass` function**

The function that iterates factions and applies ecology research each turn.

**Step 2: Add bonus collection**

After computing terrain and proximity bonuses for the domain (but before applying them to research progress), store them on the research state:

```typescript
// Collect ecology bonuses for UI consumption
const ecologySources: EcologyBonusSource[] = [];
// ... populate from terrain, proximity, combat sources ...
research.ecologyBonusesThisTurn[domainId] = totalDomainBonus;
research.ecologyBonusSourcesThisTurn[domainId] = ecologySources;
```

**Step 3: Reset accumulators at start of turn**

Before computing new bonuses, reset:
```typescript
research.ecologyBonusesThisTurn = {};
research.ecologyBonusSourcesThisTurn = {};
```

**Step 4: Run type check and tests**

Run: `npx tsc --noEmit`
Run: `npm test`

Expected: zero errors, all tests pass.

**Step 5: Commit**

```bash
git add src/systems/simulation/factionTurnEffects.ts
git commit -m "feat: store ecology bonuses in ResearchState during turn processing"
```

### Task 2.3: Read ecology bonuses from GameState in view model

**Objective:** Replace `computeEcologyBonusesForDomain()` in `researchInspectorViewModel.ts` with direct reads from `research.ecologyBonusesThisTurn` and `research.ecologyBonusSourcesThisTurn`.

**Files:**
- Modify: `web/src/game/view-model/inspectors/researchInspectorViewModel.ts`

**Step 1: Remove the `computeEcologyBonusesForDomain` function**

Remove lines 95-190 entirely. This eliminates the duplicated computation.

**Step 2: Replace calls**

Wherever `computeEcologyBonusesForDomain(state, factionId, domainId)` was called, replace with:
```typescript
const ecologyBonus = research.ecologyBonusesThisTurn?.[domainId] ?? 0;
const ecologySources = research.ecologyBonusSourcesThisTurn?.[domainId] ?? [];
```

**Step 3: Clean up imports**

Remove now-unnecessary imports:
- `DOMAIN_TERRAIN_AFFINITY`
- `MAX_RESEARCH_TERRAIN_BONUS`
- `TERRAIN_RESEARCH_BONUS`
- `RESEARCH_PROXIMITY_BONUS_PER_CONTACT`
- `getHexesInRange`, `hexToKey`, `hexDistance` (if only used by the removed function)

Keep imports still used elsewhere.

**Step 4: Run type check**

Run: `npx tsc --noEmit --project web/tsconfig.json`

Expected: zero errors.

**Step 5: Commit**

```bash
git add web/src/game/view-model/inspectors/researchInspectorViewModel.ts
git commit -m "refactor: view model reads ecology bonuses from GameState instead of recomputing"
```

### Phase 2 Verification

- [ ] `npx tsc --noEmit` passes (root)
- [ ] `npx tsc --noEmit --project web/tsconfig.json` passes (web)
- [ ] `npm test` passes
- [ ] `npm run web:dev` starts
- [ ] Research tab shows correct ecology bonuses (number, sources, estimated turns)
- [ ] Ecology numbers match between the turn log and the research UI

---

## Phase 3: Cleanup

### Task 3.1: Update memory documentation

**Objective:** Update the frontendDataDuplication.md memory file to reflect resolved state.

**Files:**
- Modify: `.claude/memory/frontendDataDuplication.md`

**Step 1: Update the content**

Replace "7 duplicated JSON files" with "resolved — direct imports now". Note the consolidated domain constants. Note the ecology computation fix.

**Step 2: Commit**

```bash
git add .claude/memory/frontendDataDuplication.md
git commit -m "docs: update frontendDataDuplication.md to reflect resolved duplication"
```

### Task 3.2: Verify web build works

**Objective:** Full build verification before merging.

**Step 1: Run full web build**

Run: `cd /home/frank/repos/9tribes && npm run web:build`

Expected: vite builds without errors.

**Step 2: Run backend build**

Run: `npm run build`

Expected: tsc compiles without errors.

**Step 3: Final commit**

```bash
git add -A
git commit -m "chore: final build verification"
```

### Phase 3 Verification

- [ ] `npm run web:build` succeeds
- [ ] `npm run build` succeeds
- [ ] `npm test` passes
- [ ] No remaining `web/src/data/*.json` files
- [ ] No remaining inline domain constant records outside `domainMeta.ts`
- [ ] No `computeEcologyBonusesForDomain` function in view model

---

## Summary of Changes

| Phase | Files Changed | Files Deleted | Risk |
|-------|---------------|---------------|------|
| 0 | 8-10 UI component files | 7 JSON files | Minimal — proven pattern |
| 1 | 4 files (1 create, 3 modify) | 0 | Minimal — extract-only |
| 2 | 3 files (types, turn effects, view model) | 0 | Moderate — changes turn processing |
| 3 | 1 docs file | 0 | None |

## Rollback Plan

Each phase is independently rollbackable:
- **Phase 0:** `git revert HEAD~5` (or however many commits)
- **Phase 1:** `git revert` the last 4 commits
- **Phase 2:** `git revert` the last 3 commits + restore deleted function
- **Phase 3:** `git revert` the last 2 commits
