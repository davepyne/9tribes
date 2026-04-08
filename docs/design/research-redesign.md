# Research System Redesign: Institutionalization

## Problem Statement

The current research system is a 7-node unlock layer sitting atop the capability system. Research adds nothing that capabilities don't already provide — it's a toll booth on a road you were already driving.

Deeper issue: **three independent progression systems** (capabilities, research, knowledge) barely interact. This redesign unifies them.

---

## Core Concept: Three Pillars

| Pillar | What It Represents | Nature |
|--------|-------------------|--------|
| **Capabilities** | What your soldiers know individually | Organic, passive, grows through play, fades if not practiced |
| **Codification** | What your faction has institutionalized | Permanent, teachable, scalable, costs time |
| **Knowledge** | What you've absorbed from other cultures | Foreign domains, synergies, cultural exchange |

A faction with high horsemanship but no codification can still ride horses — they're self-taught warriors. Codifying horsemanship makes cavalry cheaper, better, and unlocks advanced techniques. This creates a real strategic axis: **organic barbarian horde vs. codified civilized empire.**

---

## Tree Structure: 3 Tiers, 18 Nodes

### Tier 1: Foundations (7 nodes)

One per existing codifiable domain.

- **Prerequisites:** None (keep early game open)
- **Capability gate:** Level 4 (down from 6 — don't need mastery to START codifying)
- **Cost:** 12-15 XP
- **Unlocks:** Advanced component + **qualitative faction bonus** (new mechanical behavior)
- **Expected pacing:** 3-4 turns per node at 4 pts/turn

### Tier 2: Specialization (7 nodes)

Deeper versions of each foundation.

- **Prerequisites:** Completed Tier 1 node in same domain
- **Capability gate:** Level 8
- **Cost:** 20-25 XP
- **Unlocks:** Second component + **transformative ability** (changes how you play)
- **Expected pacing:** 5-6 turns per node at 4 pts/turn
- **You can't complete all 7** — this is where choices matter

### Tier 3: Synthesis (4 nodes)

Cross-domain combinations.

- **Prerequisites:** Two completed Tier 2 nodes from different domains
- **Capability gate:** Level 10 in both domains
- **Cost:** 30-40 XP
- **Unlocks:** Hybrid recipe directly (bypasses capability gating) + major qualitative effect
- **Expected pacing:** 8-10 turns per node at 4 pts/turn
- **You'll typically complete 0-1 per game**

### Total

18 nodes. ~80-100 XP at base rate. With capability bonuses and knowledge bonuses, ~50-60 turns. You'll complete most of Tier 1, some of Tier 2, and maybe 1 Tier 3. **You cannot have everything. That's the point.**

---

## Gating Fix: Separate Eligibility from Power

### Current (broken)

```
capability 6 → research node → component
              └── also gates recipe directly → redundant
```

### Proposed

```
capability 4 → research eligibility (you can only research what your soldiers practice)
research     → advanced content (better components, abilities, hybrid recipes)
capability 6 → component/recipe use (separate from research)
```

- Basic components (`basic_spear`, `basic_bow`, `simple_armor`): freely available, no change
- Research gates **advanced components** and **qualitative abilities**
- Capabilities gate **research eligibility** and **recipe use** — at different levels
- Research is the stepping stone, not the toll booth

---

## Starting Unit Fix

Starting units with research-gated chassis (cavalry, elephant, naval) represent **pre-existing tradition**. The fix is to make research unlocks be **upgrades**, not base access:

- `cavalry_frame`: available from start to factions with horsemanship capability seeds
- `codify_woodcraft` Tier 1: unlocks `heavy_cavalry` component (+2 HP, +1 attack)
- `codify_woodcraft` Tier 2: unlocks `mounted_archer` component (ranged attack while mounted)

Steppe clan starts with decent cavalry. Codifying makes them dramatically better. No narrative break.

---

## Qualitative Unlocks

Every Tier 1+ node unlocks something that CHANGES how you play, not just a stat bump.

### Tier 1 Unlocks

| Node | Component Unlock | Qualitative Effect |
|------|-----------------|-------------------|
| Codify Woodcraft | `skirmish_drill` | **Forest ambush**: first strike from forest hexes |
| Codify Horsemanship | `heavy_cavalry` | **Forced march**: cavalry ignores first ZoC per turn |
| Codify Poisoncraft | `poison_arrows` | **Poison persistence**: poison DoT lasts +1 turn |
| Codify Fortification | `fortress_training` | **Rapid entrench**: dig in 1 turn instead of 2 |
| Codify Formation | `shock_drill` | **Shield wall**: infantry +30% defense vs ranged while adjacent to ally |
| Codify Navigation | `rivercraft_training` | **River crossing**: no movement penalty crossing rivers |
| Codify Endurance | `cold_provisions` | **Marching stamina**: units ignore first exhaustion penalty |

### Tier 2 Unlocks

| Node | Component Unlock | Qualitative Effect |
|------|-----------------|-------------------|
| Master Woodcraft | `druidic_rites` | **Canopy cover**: ranged units +30% defense in forest/jungle |
| Master Horsemanship | `mounted_archer` | **Hit and run**: cavalry can attack then retreat in same turn |
| Master Poisoncraft | `venom_grenades` | **Contaminate terrain**: poison hexes deal 1 dmg/turn for 3 turns |
| Master Fortification | `field_forts` | **Zone of control aura**: fortified units project ZoC to adjacent hexes |
| Master Formation | `elephant_frame` | **Stampede**: elephant charges knock back 2 hexes |
| Master Navigation | `tidal_drill` | **Amphibious assault**: naval units can attack coastal hexes directly |
| Master Endurance | `frost_forge` | **Winter campaign**: no movement/attack penalty in tundra/snow |

### Tier 3 Synthesis Nodes

| Node | Prerequisites | Unlock | Qualitative Effect |
|------|--------------|--------|-------------------|
| Forest Cavalry | Master Woodcraft + Master Horsemanship | `forest_scouts` recipe | **Terrain ignore**: cavalry ignores forest/jungle movement penalty |
| Poison Phalanx | Master Poisoncraft + Master Fortification | `poison_spears` recipe | **Toxic bulwark**: adjacent enemies take 1 poison damage/turn |
| Amphibious Fortress | Master Navigation + Master Fortification | `coastal_fortress` recipe | **Tidal walls**: coastal cities +50% defense |
| Eternal March | Master Formation + Master Endurance | `immortal_guard` recipe | **Undying**: units below 20% HP gain +50% defense |

---

## Knowledge Connection

Simple, clean, impactful:

### Research Rate Bonus

**Each learned foreign domain gives +1 research/turn.**

A cosmopolitan faction with 2 foreign domains researches at 6/turn instead of 4/turn. This creates a feedback loop:

```
Fight neighbors → learn domains (knowledge)
     ↓
More domains → faster research
     ↓
Faster research → stronger faction
     ↓
Stronger faction → fight more → learn more domains
```

Snowball mechanic that rewards exploration and warfare. Fits the emergent philosophy. ~5 lines of code.

### Cross-Pollination Discount

If you've learned a foreign domain through knowledge, codifying your **native** domain gets a **25% XP cost discount**. Represents cross-pollination of ideas.

---

## Pacing

| Tier | Cost Range | Turns at 4/turn | Turns at 6/turn |
|------|-----------|-----------------|-----------------|
| 1 (7 nodes) | 12-15 XP | 3-4 per node | 2-3 per node |
| 2 (7 nodes) | 20-25 XP | 5-6 per node | 3-4 per node |
| 3 (4 nodes) | 30-40 XP | 8-10 per node | 5-7 per node |

### Turn Estimates

- **Base rate (4 pts/turn):** ~20 turns for all Tier 1, ~35 more for all Tier 2, ~30 more for all Tier 3 = ~85 turns total
- **With capability bonuses (5-6 pts/turn):** ~15 turns for Tier 1, ~25 for Tier 2, ~20 for Tier 3 = ~60 turns total
- **With knowledge bonuses (6-7 pts/turn):** ~12 turns for Tier 1, ~20 for Tier 2, ~15 for Tier 3 = ~47 turns total

A typical 50-turn game: most of Tier 1, 2-3 Tier 2 nodes, 0-1 Tier 3.

---

## AI Changes

### Prerequisite Awareness
AI should prefer nodes whose prerequisites are already complete. Current sticky research behavior helps — just needs prerequisite checking before scoring.

### Posture-Aware Switching
Currently AI never switches research mid-project. Should switch if posture changes (offensive → defensive → siege) and a different node better matches the new posture. Check on posture change, not every turn.

### Synthesis Targeting
AI should identify which Tier 2 nodes it's closest to completing and bias toward the second prerequisite. Simple heuristic: "I have Master Woodcraft, score Master Horsemanship higher."

### Knowledge-Rate Integration
AI should factor +1/turn per learned domain into its planning. Cosmopolitan factions research faster — AI should recognize this and prioritize accordingly.

---

## JSON Structure

```json
{
  "war_codification": {
    "id": "war_codification",
    "name": "War Codification",
    "nodes": {
      "codify_woodcraft": {
        "id": "codify_woodcraft",
        "name": "Codify Woodcraft",
        "tier": 1,
        "xpCost": 12,
        "requiredCapabilities": { "woodcraft": 4 },
        "prerequisites": [],
        "unlocks": [
          { "type": "component", "id": "skirmish_drill" }
        ],
        "qualitativeEffect": {
          "type": "forest_ambush",
          "description": "First strike from forest hexes",
          "effect": { "firstStrikeFromForest": true }
        },
        "capabilityBonus": { "woodcraft": 1 }
      },
      "master_woodcraft": {
        "id": "master_woodcraft",
        "name": "Master Woodcraft",
        "tier": 2,
        "xpCost": 22,
        "requiredCapabilities": { "woodcraft": 8 },
        "prerequisites": ["codify_woodcraft"],
        "unlocks": [
          { "type": "component", "id": "druidic_rites" }
        ],
        "qualitativeEffect": {
          "type": "canopy_cover",
          "description": "Ranged units get +30% defense in forest/jungle",
          "effect": { "rangedDefenseInForest": 0.3 }
        },
        "capabilityBonus": { "woodcraft": 2 }
      },
      "forest_cavalry": {
        "id": "forest_cavalry",
        "name": "Forest Cavalry",
        "tier": 3,
        "xpCost": 35,
        "requiredCapabilities": { "woodcraft": 10, "horsemanship": 10 },
        "prerequisites": ["master_woodcraft", "master_horsemanship"],
        "unlocks": [
          { "type": "recipe", "id": "forest_scouts" }
        ],
        "qualitativeEffect": {
          "type": "terrain_ignore",
          "description": "Cavalry ignores forest/jungle movement penalty",
          "effect": { "ignoreTerrain": ["forest", "jungle"] }
        }
      }
    }
  }
}
```

### New Fields

| Field | Type | Description |
|-------|------|-------------|
| `tier` | `1 \| 2 \| 3` | Node tier for UI and prerequisite gating |
| `prerequisites` | `string[]` | Node IDs that must be completed first |
| `qualitativeEffect` | `object` | New mechanical behavior unlocked by this node |
| `qualitativeEffect.type` | `string` | Effect type identifier for engine lookup |
| `qualitativeEffect.description` | `string` | Human-readable description for UI |
| `qualitativeEffect.effect` | `object` | Typed effect parameters |

### Backward Compatibility

- Existing `requiredCapabilities`, `capabilityBonus`, `unlocks` fields unchanged
- `prerequisites` defaults to `[]` for Tier 1 nodes (no change to existing behavior)
- `tier` defaults to `1` if missing
- `qualitativeEffect` is optional (nodes without it just give components + capability bonus)

---

## Implementation Phases

### Phase 1: Foundation (minimal, high impact)

- [ ] Add `tier`, `prerequisites`, `qualitativeEffect` to research.json schema
- [ ] Rewrite `research.json` with all 7 Tier 1 nodes (new gating: cap 4, qualitative effects)
- [ ] Implement prerequisite checking in `researchSystem.ts`
- [ ] Implement 2-3 qualitative effects in `warEcologySimulation.ts` (forest_ambush, forced_march, rapid_entrench)
- [ ] Connect knowledge → research rate: `+1 per learned domain` in `warEcologySimulation.ts`
- [ ] Connect knowledge → codification discount: `25% XP cost reduction` for native domain codification when foreign domains learned
- [ ] Update AI to be prerequisite-aware
- [ ] Smoke test: `npx tsc --noEmit` + 25-trial Optuna run

### Phase 2: Expand Tree

- [ ] Add 7 Tier 2 nodes to `research.json`
- [ ] Add 4 Tier 3 synthesis nodes to `research.json`
- [ ] Implement remaining Tier 1 qualitative effects
- [ ] Implement Tier 2 qualitative effects
- [ ] Implement Tier 3 qualitative effects
- [ ] Update AI synthesis targeting
- [ ] Smoke test + 75-trial Optuna run

### Phase 3: Polish

- [ ] New components for Tier 2 unlocks (`heavy_cavalry`, `mounted_archer`, `venom_grenades`, etc.)
- [ ] New hybrid recipes for Tier 3 unlocks
- [ ] Balance pass (Optuna with expanded knob search space)
- [ ] Codemap update

---

## Risks and Trade-offs

| Risk | Impact | Mitigation |
|------|--------|------------|
| Scope creep | High — 18 nodes is a lot of content | Ship Phase 1 first (7 nodes), expand incrementally |
| Qualitative effects need engine code | Medium — each effect is custom logic | Keep effects simple: boolean flags, small multipliers, re-use existing systems |
| AI may not handle choices well | Medium — prerequisites require planning | Sticky research + prerequisite awareness is sufficient |
| Balance disruption | High — adding power changes everything | Optuna after each phase; start with Phase 1 smoke test |
| Knowledge connection too strong | Low — +1/turn is modest | Cap knowledge bonus at +2 (max 2 foreign domains contributing) |
| Starting unit narrative | Low — frame available at start, upgrades through research | Document clearly; starting chassis are "tradition" not "institution" |

---

## Design Principles

1. **Research = institutionalization.** Not a tech tree. Not a checklist. The act of making organic knowledge permanent and teachable.
2. **You can't have everything.** 18 nodes, ~50 turns. Choices matter.
3. **Qualitative > quantitative.** Each node should change HOW you play, not just make numbers bigger.
4. **Knowledge feeds research.** Cosmopolitan factions research faster. Warfare and exploration are rewarded.
5. **Simple to describe, meaningful to play.** The plan fits on one page. The experience should feel like Civ, not a mobile tutorial.
