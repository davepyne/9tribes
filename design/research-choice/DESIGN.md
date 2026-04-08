# Research Choice: Design Proposal

## Problem Statement

The research system in `startOrAdvanceCodification()` (warEcologySimulation.ts:124-237) automatically selects the "best" research node using a hardcoded heuristic. This creates two issues:

1. **No player agency**: Future player-controlled factions cannot choose their research direction. Players would watch research "just happen" without meaningful input.

2. **Brittle AI coupling**: The selection heuristic is embedded in the simulation loop. Changing AI strategy or adding player control requires invasive changes.

The current heuristic (lines 152-156):
```typescript
const score = Object.entries(reqs).reduce(
  (sum, [capabilityId]) => sum + (capabilities.domainLevels[capabilityId] ?? 0),
  0
) - (node.xpCost ?? 0) * 0.1;
```

This prefers nodes matching high capability domains with slight cost discount—fine for AI, but it should be a *strategy*, not hardcoded behavior.

## Proposed Solution: Research Strategy Pattern

Separate **research selection** from **research execution**. Add a `researchStrategy` field to `ResearchState` that controls how the next research target is chosen.

### Core Mechanism

**Add to `ResearchState` (src/features/research/types.ts):**

```typescript
export interface ResearchState {
  factionId: FactionId;
  activeNodeId: ResearchNodeId | null;
  progressByNodeId: Partial<Record<ResearchNodeId, number>>;
  completedNodes: ResearchNodeId[];
  researchPerTurn: number;
  unlockedComponents: string[];
  unlockedChassis: string[];
  
  // NEW FIELDS:
  researchStrategy: 'auto' | 'manual';
  targetNodeId: ResearchNodeId | null;  // For manual mode
}
```

- `researchStrategy: 'auto'` — AI-style automatic selection using heuristic
- `researchStrategy: 'manual'` — Respect `targetNodeId` if set
- `targetNodeId` — Player's chosen next research; ignored in auto mode

### Selection Logic

**New function in `src/systems/researchSystem.ts`:**

```typescript
/**
 * Determine which node to research next based on strategy.
 * Returns null if no valid target available.
 */
export function selectNextResearchTarget(
  state: ResearchState,
  capabilities: CapabilityState,
  registry: RulesRegistry
): ResearchNodeId | null {
  // Manual mode: use player's target if valid
  if (state.researchStrategy === 'manual' && state.targetNodeId) {
    if (canResearchNode(state, capabilities, registry, state.targetNodeId)) {
      return state.targetNodeId;
    }
    // Fall through to auto if target invalid
  }
  
  // Auto mode (or fallback): use heuristic
  return selectBestNodeByHeuristic(state, capabilities, registry);
}

/**
 * Check if a node can be researched (not completed, meets requirements).
 */
export function canResearchNode(
  state: ResearchState,
  capabilities: CapabilityState,
  registry: RulesRegistry,
  nodeId: ResearchNodeId
): boolean {
  if (state.completedNodes.includes(nodeId)) return false;
  
  const node = findResearchNode(registry, nodeId);
  if (!node) return false;
  
  const reqs = node.requiredCapabilities ?? {};
  return Object.entries(reqs).every(
    ([capabilityId, threshold]) =>
      (capabilities.domainLevels[capabilityId] ?? 0) >= threshold
  );
}

/**
 * Current AI heuristic extracted into pure function.
 */
export function selectBestNodeByHeuristic(
  state: ResearchState,
  capabilities: CapabilityState,
  registry: RulesRegistry
): ResearchNodeId | null {
  let bestNodeId: ResearchNodeId | null = null;
  let bestScore = -Infinity;
  
  for (const domain of registry.getAllResearchDomains()) {
    for (const node of Object.values(domain.nodes)) {
      if (state.completedNodes.includes(node.id as ResearchNodeId)) continue;
      
      const reqs = node.requiredCapabilities ?? {};
      const meetsReqs = Object.entries(reqs).every(
        ([capabilityId, threshold]) =>
          (capabilities.domainLevels[capabilityId] ?? 0) >= threshold
      );
      if (!meetsReqs) continue;
      
      const score = Object.entries(reqs).reduce(
        (sum, [capabilityId]) => 
          sum + (capabilities.domainLevels[capabilityId] ?? 0),
        0
      ) - (node.xpCost ?? 0) * 0.1;
      
      if (score > bestScore) {
        bestScore = score;
        bestNodeId = node.id as ResearchNodeId;
      }
    }
  }
  
  return bestNodeId;
}
```

### Updated Simulation Flow

**Modified `startOrAdvanceCodification()` (warEcologySimulation.ts:124-237):**

```typescript
function startOrAdvanceCodification(
  state: GameState,
  factionId: FactionId,
  registry: RulesRegistry,
  trace?: SimulationTrace
): GameState {
  const faction = state.factions.get(factionId);
  const research = state.research.get(factionId);
  if (!faction || !research) return state;

  const capabilities = faction.capabilities ?? createCapabilityState();
  let currentResearch = research;
  
  // CHANGED: Use strategy-based selection instead of inline heuristic
  if (!currentResearch.activeNodeId) {
    const nextTarget = selectNextResearchTarget(
      currentResearch, 
      capabilities, 
      registry
    );
    
    if (nextTarget) {
      currentResearch = startResearch(currentResearch, nextTarget);
      const node = findResearchNode(registry, nextTarget);
      log(trace, `${faction.name} starts codifying ${node?.name ?? nextTarget}`);
    }
  }
  
  // Rest unchanged: progress calculation, completion handling...
  if (!currentResearch.activeNodeId) return state;
  
  // ... existing progress logic ...
}
```

### Player Control Interface

**New action for player input (future UI layer):**

```typescript
// In a new file: src/actions/researchActions.ts

/**
 * Set research target for a player-controlled faction.
 * Switches to manual strategy.
 */
export function setResearchTarget(
  state: GameState,
  factionId: FactionId,
  targetNodeId: ResearchNodeId | null
): GameState {
  const research = state.research.get(factionId);
  if (!research) return state;
  
  const updatedResearch: ResearchState = {
    ...research,
    researchStrategy: targetNodeId ? 'manual' : 'auto',
    targetNodeId,
  };
  
  const researchMap = new Map(state.research);
  researchMap.set(factionId, updatedResearch);
  
  return { ...state, research: researchMap };
}

/**
 * Switch to automatic research selection.
 */
export function enableAutoResearch(
  state: GameState,
  factionId: FactionId
): GameState {
  const research = state.research.get(factionId);
  if (!research) return state;
  
  const updatedResearch: ResearchState = {
    ...research,
    researchStrategy: 'auto',
    targetNodeId: null,
  };
  
  const researchMap = new Map(state.research);
  researchMap.set(factionId, updatedResearch);
  
  return { ...state, research: researchMap };
}
```

### Default Initialization

**Update `createResearchState()` (researchSystem.ts):**

```typescript
export function createResearchState(factionId: FactionId): ResearchState {
  return {
    factionId,
    activeNodeId: null,
    progressByNodeId: {},
    completedNodes: [],
    researchPerTurn: 4,
    unlockedComponents: [],
    unlockedChassis: [],
    // NEW:
    researchStrategy: 'auto',  // Default to AI behavior
    targetNodeId: null,
  };
}
```

AI factions remain unchanged—they use the default `'auto'` strategy.

## Implementation Sketch

### Files to Modify

| File | Changes |
|------|---------|
| `src/features/research/types.ts` | Add `researchStrategy`, `targetNodeId` to `ResearchState` |
| `src/systems/researchSystem.ts` | Add `selectNextResearchTarget()`, `canResearchNode()`, `selectBestNodeByHeuristic()`; update `createResearchState()` |
| `src/systems/warEcologySimulation.ts` | Replace inline heuristic (lines 139-167) with call to `selectNextResearchTarget()` |
| `src/actions/researchActions.ts` | **NEW** — Add `setResearchTarget()`, `enableAutoResearch()` |

### Migration Path

1. **Phase 1**: Add new fields with defaults, extract heuristic. No behavior change.
2. **Phase 2**: Add action functions for player control.
3. **Phase 3**: UI integration (out of scope here).

### Testing Strategy

- Unit tests for `selectBestNodeByHeuristic()` matching current behavior
- Unit tests for `selectNextResearchTarget()` with both strategies
- Integration test: AI faction research unchanged with `'auto'`
- Integration test: Manual target respected when valid
- Edge case: Invalid manual target falls back to auto

## Trade-offs

### Advantages

1. **Minimal disruption**: AI behavior unchanged; new fields default to current behavior
2. **Pure functions**: All new functions are stateless and testable
3. **Extensible**: `researchStrategy` could expand to `'priority'`, `'weighted'`, etc.
4. **Clear separation**: Selection logic moves from simulation to research system
5. **UI-ready**: `setResearchTarget()` provides clean action interface

### Disadvantages

1. **State growth**: Two new fields per faction (minimal: ~16 bytes)
2. **Single target**: Only one queued research; no full queue system
3. **Fallback complexity**: Invalid manual target must decide: fail silently or fall back to auto?

### Rejected Alternatives

**Research Queue (full queue system)**
- More flexible but over-engineered for current needs
- Adds complexity: queue management, cancellation, reordering
- Could be added later by extending `targetNodeId` to `targetQueue: ResearchNodeId[]`

**Priority Weights (player sets domain priorities)**
- Indirect control—player influences but doesn't choose
- More complex UI and mental model
- Doesn't give true agency over specific unlocks

**Per-Faction Strategy Field on Faction Entity**
- Couples research strategy to Faction instead of ResearchState
- ResearchState already tracks research-specific data; better locality

## Open Questions

1. **Invalid target handling**: When `targetNodeId` becomes invalid (requirements no longer met?), should we:
   - A) Silently fall back to auto (proposed above)
   - B) Set `activeNodeId = null` and wait
   - C) Emit a warning event

2. **UI feedback**: Should `selectNextResearchTarget()` return metadata (why target was chosen) for UI display?

3. **Switching mid-research**: Can player change `targetNodeId` while `activeNodeId` is set? Current design allows it—next selection uses new target.
