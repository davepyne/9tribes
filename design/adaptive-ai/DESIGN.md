# Design Proposal: Adaptive AI Baselines + Domain Doctrines

## Problem

The current AI stack has a usable shared strategy layer, but it remains mostly generic. Factions differ only lightly, and newly learned domains do not materially change how the AI behaves. That leaves three gaps:

1. Faction identity is too weak. Pirate Lords should raid coasts and value captures, River People should seek river ambushes, Hill Clan should assemble around anchors and siege deliberately.
2. Domain growth is not reflected in behavior. A faction that learns `slaving` or `river_stealth` should start making different tactical and production choices.
3. Supply is under-modeled. [economySystem.ts](C:/Users/fosbo/war-civ-v2/src/systems/economySystem.ts#L19) currently treats every living unit as `1` supply, which collapses an important tradeoff between cheap line units and expensive force-projection units. AI production logic in [aiProductionStrategy.ts](C:/Users/fosbo/war-civ-v2/src/systems/aiProductionStrategy.ts#L17) therefore cannot reason correctly about long-run army maintenance.

This proposal designs an AI system around:

- faction baselines for durable identity
- domain doctrines for evolving behavior
- a computed personality snapshot each turn
- explicit production cost and supply cost evaluation in both economy and AI

## Constraints

- Both simulation and live play already use the same high-level strategy entry point: [strategicAi.ts](C:/Users/fosbo/war-civ-v2/src/systems/strategicAi.ts#L34).
- Live gameplay still has duplicated tactical scoring in [GameSession.ts](C:/Users/fosbo/war-civ-v2/web/src/game/controller/GameSession.ts#L1030) and [GameSession.ts](C:/Users/fosbo/war-civ-v2/web/src/game/controller/GameSession.ts#L1072).
- Simulation still has its own tactical scoring in [warEcologySimulation.ts](C:/Users/fosbo/war-civ-v2/src/systems/warEcologySimulation.ts#L2944).
- Strategy output shape already exists in [factionStrategy.ts](C:/Users/fosbo/war-civ-v2/src/systems/factionStrategy.ts#L75).
- Faction identity data already exists in [civilizations.json](C:/Users/fosbo/war-civ-v2/src/content/base/civilizations.json#L7) and [features/factions/types.ts](C:/Users/fosbo/war-civ-v2/src/features/factions/types.ts#L65).
- Production cost exists in [productionSystem.ts](C:/Users/fosbo/war-civ-v2/src/systems/productionSystem.ts#L17), but supply cost does not.
- Supply economy types support fractional numbers already because [FactionEconomy](C:/Users/fosbo/war-civ-v2/src/features/economy/types.ts#L10) uses `number`, and [economySystem.ts](C:/Users/fosbo/war-civ-v2/src/systems/economySystem.ts#L110) already rounds floats.
- The implementation should remain one-ply heuristic AI, not a search tree.

## Solution

### 1. Policy Layers

The AI becomes:

`Shared tactical engine <- Personality snapshot <- Faction baseline + Domain doctrines + Board state`

Each layer has a clear role.

#### Faction baseline

Defines stable identity that should remain true all game.

Examples:

- Pirate Lords: raid bias, coastal objectives, capture preference, weak inland appetite
- River People: stealth bias, river corridor preference, opportunistic strikes
- Hill Clan: cohesion, choke-point bias, defensive patience, siege preparation

#### Domain doctrines

Defines modular behavior packages that activate when a faction has a domain.

Examples:

- `slaving`: prefer capturable units, villages, isolated targets, transports
- `river_stealth`: prefer ambush positions, river/swamp approach, safe disengage
- `hitrun`: prefer attacks with retreat paths and non-sticky engagements
- `fortress`: prefer anchors, city defense, siege assets, stable lines
- `charge`: prefer open-ground timing attacks and flank/rear setups
- `venom`: prefer attrition fights, safe repeat attacks, poisoned targets
- `nature_healing`: rotate wounded units earlier and prolong favorable fights
- `camel_adaptation`: prefer harsh-terrain campaigns and long overland pressure
- `heavy_hitter`: seek decisive local overmatch
- `tidal_warfare`: prefer coastal staging, amphibious pressure, naval mobility

#### Personality snapshot

Computed once per faction turn. Consumed everywhere decisions are made.

Inputs:

- faction baseline
- native domain
- learned domains
- near-exposure domains if desired
- current fronts, threats, supply, exhaustion, combat record

Outputs:

- posture weights
- target weights
- move weights
- assignment weights
- production weights
- research weights
- operational thresholds such as commit advantage and focus fire limits

### 2. New Data Model

Add a new content file:

- `src/content/base/ai-profiles.json`

This avoids overloading `civilizations.json` with large tactical data while still allowing per-faction baselines to reference existing identity text and traits.

#### `FactionAiBaseline`

```ts
export interface FactionAiBaseline {
  factionId: FactionId;

  aggression: number;      // 0..1
  caution: number;         // 0..1
  cohesion: number;        // 0..1
  opportunism: number;     // 0..1

  raidBias: number;        // 0..1
  siegeBias: number;       // 0..1
  defenseBias: number;     // 0..1
  exploreBias: number;     // 0..1

  captureBias: number;     // 0..1
  stealthBias: number;     // 0..1
  attritionBias: number;   // 0..1
  mobilityBias: number;    // 0..1

  preferredTerrains: string[];
  avoidedTerrains: string[];

  desiredRoleRatios: Partial<Record<'melee' | 'ranged' | 'mounted' | 'support' | 'siege' | 'naval', number>>;

  commitAdvantage: number;  // e.g. 1.15
  retreatThreshold: number; // e.g. 0.75
  focusFireLimit: number;   // e.g. 2 or 3
  squadSize: number;        // preferred local assault size
}
```

#### `DomainAiDoctrine`

```ts
export interface DomainAiDoctrine {
  domainId: string;

  scalarMods?: Partial<{
    aggression: number;
    caution: number;
    cohesion: number;
    opportunism: number;
    raidBias: number;
    siegeBias: number;
    defenseBias: number;
    exploreBias: number;
    captureBias: number;
    stealthBias: number;
    attritionBias: number;
    mobilityBias: number;
  }>;

  thresholdMods?: Partial<{
    commitAdvantage: number;
    retreatThreshold: number;
    focusFireLimit: number;
    squadSize: number;
  }>;

  terrainBiasMods?: {
    prefer?: string[];
    avoid?: string[];
    terrainScores?: Record<string, number>;
  };

  targetRules?: Record<string, number>;
  moveRules?: Record<string, number>;
  assignmentRules?: Record<string, number>;
  productionRules?: Record<string, number>;
  researchRules?: Record<string, number>;
}
```

#### `AiPersonalitySnapshot`

```ts
export interface AiPersonalitySnapshot {
  factionId: FactionId;
  round: number;

  scalars: {
    aggression: number;
    caution: number;
    cohesion: number;
    opportunism: number;
    raidBias: number;
    siegeBias: number;
    defenseBias: number;
    exploreBias: number;
    captureBias: number;
    stealthBias: number;
    attritionBias: number;
    mobilityBias: number;
  };

  thresholds: {
    commitAdvantage: number;
    retreatThreshold: number;
    focusFireLimit: number;
    squadSize: number;
  };

  terrainScores: Record<string, number>;
  desiredRoleRatios: Record<string, number>;
  targetWeights: Record<string, number>;
  moveWeights: Record<string, number>;
  assignmentWeights: Record<string, number>;
  productionWeights: Record<string, number>;
  researchWeights: Record<string, number>;

  activeDoctrines: string[];
  reasons: string[];
}
```

#### `UnitEconomicProfile`

Add a dedicated production-and-maintenance profile for prototypes.

```ts
export interface UnitEconomicProfile {
  productionCost: number;
  supplyCost: number;   // fractional allowed, e.g. 1.5
}
```

This should be derivable from prototype/chassis data, not buried in AI code.

### 3. Supply Cost Model

Supply should become a first-class unit property from both rules and AI perspectives.

#### Rules

Each prototype gets an explicit `supplyCost`.

Suggested v1 defaults:

- infantry: `1.0`
- ranged: `1.0`
- cavalry: `1.5`
- camel: `1.5`
- heavy infantry: `1.5`
- naval light: `1.25`
- transport / galley: `1.5`
- elephant: `2.0`
- siege: `1.5`
- summons: explicit per summon, default `0` or discounted if intended to be temporary and not logistical

This corrects the current flaw where Steppe cavalry projects more value than line infantry while paying the same upkeep.

#### Implementation target

Supply demand in [economySystem.ts](C:/Users/fosbo/war-civ-v2/src/systems/economySystem.ts#L92) should change from:

- count living units

to:

- sum `getUnitSupplyCost(prototype, registry)` for living units

#### New helpers

- `getUnitSupplyCost(prototype, registry): number`
- `getPrototypeEconomicProfile(prototype, registry): UnitEconomicProfile`
- `getFactionProjectedSupplyDemand(state, factionId): number`
- `getProjectedSupplyDemandWithPrototype(state, factionId, prototype): number`

#### Design rule

Production cost and supply cost must remain distinct:

- production cost answers: "Can I afford to build this now?"
- supply cost answers: "Can I afford to keep fielding several of these?"

The AI must reason about both.

### 4. Merge Rules

Use additive weighted merge with clamps.

#### Source weights

- faction baseline: `1.0`
- native domain doctrine: `1.0`
- learned domain doctrine: `0.6`
- near-exposure doctrine: `0.25`
- state modifiers: applied after merge

#### Clamp ranges

- scalar values: `0..1`
- `commitAdvantage`: `0.85..1.75`
- `retreatThreshold`: `0.4..1.25`
- `focusFireLimit`: `1..5`
- `squadSize`: `1..6`

#### State modifiers

After baseline + doctrine merge:

- high exhaustion: reduce aggression, increase caution, raise retreat tendency
- supply deficit: reduce siege appetite and expensive production appetite
- threatened capital/cities: increase defense bias
- local superiority: increase offense and siege bias
- weak strategic position: increase cohesion and recovery weighting

### 5. Runtime Flow

Add:

- `src/systems/aiPersonality.ts`
- optionally `src/systems/aiTactics.ts`

#### `aiPersonality.ts`

Exports:

- `computeAiPersonalitySnapshot(state, factionId, registry)`
- `scorePosture(snapshot, context, posture)`
- `scoreFocusTarget(snapshot, context, target)`
- `scoreProductionCandidate(snapshot, context, prototype)`
- `scoreResearchCandidate(snapshot, context, node)`
- `shouldCommitAttack(snapshot, context)`
- `shouldRetreat(snapshot, context)`

#### Strategy flow

In [strategicAi.ts](C:/Users/fosbo/war-civ-v2/src/systems/strategicAi.ts#L34):

1. compute threats/fronts as today
2. compute personality snapshot
3. choose posture from weighted scores instead of generic thresholds
4. assign focus targets with target budgets
5. assign unit intents using snapshot assignment weights

Add the snapshot to [FactionStrategy](C:/Users/fosbo/war-civ-v2/src/systems/factionStrategy.ts#L75):

```ts
personality: AiPersonalitySnapshot;
```

### 6. Tactical Scoring

Current tactical scoring is split between:

- [warEcologySimulation.ts](C:/Users/fosbo/war-civ-v2/src/systems/warEcologySimulation.ts#L2944)
- [GameSession.ts](C:/Users/fosbo/war-civ-v2/web/src/game/controller/GameSession.ts#L1030)
- [GameSession.ts](C:/Users/fosbo/war-civ-v2/web/src/game/controller/GameSession.ts#L1072)

Extract shared scoring into one tactical helper so sim and live play behave consistently.

#### Move score

```ts
moveScore =
  objectiveProgress * 8
  + terrainFit * 1.5
  + supportDelta * cohesionWeight
  + flankingSetup * moveWeights.flanking
  + rearAttackSetup * moveWeights.rearAttack
  + ambushFit * moveWeights.ambush
  + retreatPathQuality * moveWeights.retreatPath
  + corridorFit
  + captureOpportunity
  - exposureRisk * moveWeights.avoidExposure
  - overcommitPenalty;
```

#### Attack score

```ts
attackScore =
  projectedDamageValue
  + targetValue
  + captureValue
  + doctrineBonus
  + localSupportBonus
  - retaliationRisk
  - isolationRisk
  - anchorBreakPenalty;
```

Attack is committed only if it clears the snapshot threshold.

### 7. Production + Supply Decision Model

AI production should evaluate:

- immediate production cost
- ongoing supply cost
- current supply margin
- projected supply after completion
- role need
- doctrine fit
- terrain/map fit

#### New production evaluation helpers

- `getSupplyMargin(economy): number`
- `getProjectedSupplyMarginAfterBuild(state, factionId, prototype): number`
- `scoreSupplyEfficiency(prototype): number`
- `scoreForceProjectionValue(prototype, snapshot, context): number`

#### Production score sketch

```ts
score =
  doctrineFit
  + roleNeed
  + targetCounterValue
  + terrainFit
  + signatureFit
  + hybridFit
  + forceProjectionValue
  - productionCostPenalty
  - supplyCostPenalty
  - projectedSupplyDeficitPenalty;
```

#### Supply-aware AI rules

- If projected supply remains comfortably positive, allow expensive units when strategically justified.
- If supply is tight, prefer cheaper maintenance units unless the expensive unit solves a critical problem.
- Mounted, elephant, siege, and transport production should be restricted by supply margin rather than only by production pool.
- The AI should understand that a cavalry-heavy army is faster and stronger but logistically shallower.

#### Concrete example

Steppe Clan early cavalry:

- production cost is already higher
- supply cost becomes `1.5`
- AI should still prefer cavalry for identity and tempo
- but should stop massing them if projected supply margin becomes weak
- and should backfill infantry/ranged when cavalry saturation makes upkeep inefficient

This gives Steppe a real strategic curve rather than free superior units.

### 8. Research Decision Model

Current research scoring in [aiResearchStrategy.ts](C:/Users/fosbo/war-civ-v2/src/systems/aiResearchStrategy.ts#L303) is mostly posture + signature + generic synergy.

Update it so doctrines and logistics matter:

- if the army is cavalry-heavy and supply-tight, prefer domains that improve tempo, value density, or sustain instead of blindly adding more expensive force multipliers
- if `slaving` is active, boost navigation / formation / mobility packages
- if `river_stealth` is active, boost river, stealth, ambush, and mobility-adjacent tech
- if `fortress` is active and city threat is high, boost fortification completion

Research AI should score "completes a strategic package" higher than isolated strong nodes.

### 9. Baseline Profiles

Suggested v1 baselines:

#### Pirate Lords

- high `raidBias`
- high `captureBias`
- high `opportunism`
- medium `mobilityBias`
- low inland tolerance
- preferred terrain: coast, river, ocean

#### River People

- high `stealthBias`
- high `mobilityBias`
- medium `caution`
- medium `opportunism`
- preferred terrain: river, swamp, coast, jungle

#### Steppe Riders

- high `mobilityBias`
- high `aggression`
- medium `cohesion`
- medium `opportunism`
- moderate caution when isolated

#### Hill Engineers

- high `defenseBias`
- high `cohesion`
- medium `siegeBias`
- low `opportunism`

#### Jungle Clan

- high `attritionBias`
- high `stealthBias`
- medium `aggression`
- avoid open ground when possible

#### Druid Circle

- high `defenseBias`
- high `attritionBias`
- high `caution`
- sustain-focused

#### Desert Nomads

- high `mobilityBias`
- medium `raidBias`
- lower supply fear than baseline
- desert corridor preference

#### Savannah Lions

- high `aggression`
- medium `cohesion`
- open-ground shock timing preference

#### Frost Wardens

- high `defenseBias`
- medium `aggression`
- low `opportunism`
- deliberate anchor-based pushes

### 10. Doctrine Catalog v1

These domain doctrines should exist at minimum:

- `slaving`
- `river_stealth`
- `hitrun`
- `fortress`
- `charge`
- `venom`
- `nature_healing`
- `camel_adaptation`
- `heavy_hitter`
- `tidal_warfare`

Each doctrine should define:

- scalar modifiers
- terrain preferences
- target priorities
- movement priorities
- assignment weights
- production weights
- research weights

### 11. Trade-offs

Benefits:

- preserves faction identity without hard-coding a separate engine per tribe
- allows AI behavior to evolve naturally with learned domains
- makes supply and force composition meaningful
- reduces frontend/backend drift by moving tactical scoring into shared helpers

Costs:

- more tuning surface
- risk of opaque behavior if weights are hidden
- requires careful logging and tests to avoid regressions

### 12. Risks

#### Too many knobs

Mitigation:

- keep doctrine count small
- use a small fixed vocabulary of weights
- log top reasons for posture, production, and attacks

#### Learned domains overpower faction identity

Mitigation:

- baseline weight always equals or exceeds any single learned doctrine
- native domain gets stronger weight than learned domains

#### Supply changes destabilize balance

Mitigation:

- make supply costs explicit and testable
- start with conservative defaults
- add regression tests around projected supply margins and production choices

#### Tactical helper extraction changes live feel and sim together

Mitigation:

- introduce shared helpers after personality snapshot is stable
- keep rollback-safe phases

## Implementation Sketch

### New Files

- `src/systems/aiPersonality.ts`
- `src/systems/aiTactics.ts`
- `src/content/base/ai-profiles.json`

### Modified Files

- `src/systems/factionStrategy.ts`
  - add `personality: AiPersonalitySnapshot`
- `src/systems/strategicAi.ts`
  - compute snapshot
  - replace generic posture selection
  - replace focus target selection
  - weight unit intent assignment via snapshot
- `src/systems/aiProductionStrategy.ts`
  - add supply-aware scoring
  - consume snapshot production weights
- `src/systems/aiResearchStrategy.ts`
  - add doctrine-aware strategic package scoring
- `src/systems/economySystem.ts`
  - replace flat `SUPPLY_PER_UNIT`
  - sum supply cost per living unit
- `src/systems/productionSystem.ts`
  - expose prototype economic profile helpers
- `src/data/registry/types.ts`
  - add AI profile and possibly supply metadata schema
- `src/features/prototypes/types.ts`
  - optional: add `economicProfile` if caching derived cost on prototypes is preferred
- `src/systems/warEcologySimulation.ts`
  - consume shared tactical helpers
- `web/src/game/controller/GameSession.ts`
  - consume shared tactical helpers

### Acceptance Criteria

#### AI identity

- Pirate Lords prefer coastal objectives over equally strong inland objectives
- River People prefer river/swamp approach lanes and ambush opportunities
- Hill Clan assembles around anchors and does not over-raid

#### Domain adaptation

- A non-pirate faction that learns `slaving` becomes more capture-seeking but does not fully become Pirate Lords
- A faction with `river_stealth` starts preferring river ambush lanes
- A faction with `hitrun` is less likely to stick in bad melee trades

#### Supply logic

- cavalry and other premium units contribute more than `1` to supply demand
- projected supply deficit affects production rankings
- Steppe still builds cavalry early, but not endlessly when upkeep becomes constraining

#### Consistency

- live and sim paths use the same move/attack scoring helpers

### Phased Rollout

#### Phase 1

- add AI profile content
- add personality snapshot computation
- add supply cost helpers
- update economy demand calculation

#### Phase 2

- feed snapshot into research and production
- make production supply-aware

#### Phase 3

- feed snapshot into posture, focus targets, and assignments

#### Phase 4

- extract shared move/attack scoring
- add pre-combat commit and retreat gates

#### Phase 5

- add squad logic, target budgets, wait-for-allies behavior

## Related Gaps

- Encirclement frequency and siege coordination
- Research choice quality
- Force composition realism
- Supply attrition and strategic tempo
