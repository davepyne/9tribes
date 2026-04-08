# Research System Redesign — Final Design Document

## Problem Statement

The current research system is confusing and overly-complicated:
- 18 nodes across capability-gated trees with cross-domain prerequisites
- Research and synergies are **parallel systems that don't interact**
- Qualitative effects (the interesting stuff) are buried behind boring capability-level gates
- Component/chassis unlocks are scattered across `requiredResearchNodes` in 3 content files (42+ references)
- `capabilityDoctrine.ts` has 30+ hardcoded node-ID checks
- Players don't understand the system and find it pointless compared to synergies

## New Design: Research as Synergy Preparation

Research and synergies become **one system, not two**. Research unlocks synergy potential; synergies are the payoff.

### Domain Alignment

All 10 synergy domains ARE the research domains. No folding, no sub-domains, no confusion.

| # | Domain | Native Tribe | Concept |
|---|---|---|---|
| 1 | Venom | Jungle Clan | Poison, damage-over-time, debilitation |
| 2 | Fortress | Hill Engineers | Defense, fortification, area control |
| 3 | Charge | Steppe Horde | Aggression, knockback, momentum |
| 4 | Hit & Run | Coast Raiders | Mobility, skirmish, retreat |
| 5 | Nature Healing | Frost Wardens | Regeneration, sustain, survivability |
| 6 | Camel Adaptation | Sand Nomads | Terrain mastery, endurance, adaptation |
| 7 | Tidal Warfare | River Kingdom | Naval, coastal, amphibious |
| 8 | River Stealth | — | Stealth, ambush, surprise |
| 9 | Slaving | — | Capture, coercion, forced labor |
| 10 | Heavy Hitter | — | Armor, power, immovability |

### Tree Structure

3 tiers × 10 domains = **30 nodes** per tribe.

| | Tier 1: Foundation | Tier 2: Mastery | Tier 3: Transcendence |
|---|---|---|---|
| **How to unlock** | Game start (native) or sacrifice (foreign) | Research points | Research points |
| **Cost** | Free (native) or sacrifice (foreign) | ~50-65 XP | ~90-120 XP |
| **Time** | Turn 1 (native) or after first sacrifice | 8-12 turns of investment | 20-30 turns of investment |
| **Synergy role** | Unlocks domain for pair synergy matching | Unlocks domain for emergent rule matching | Tribe-unique faction-altering power |
| **Visual state** | Auto-completed, always lit | Researchable (not greyed out) | Researchable (not greyed out) |

### Domain Locking

- **Native domain:** Tier 1 auto-completed at game start. Player can immediately invest in T2/T3.
- **Unlearned domains:** Greyed out in research tree. Tooltip: "Learn from enemies in combat, then sacrifice to unlock."
- **Learned domains (via sacrifice):** Tier 1 auto-completed. T2/T3 become researchable.

### The Sacrifice Pipeline

```
Kill enemy → unit learns domain tag (25% chance)
         → unit carries learned ability (visible carrier marker)
         → player navigates unit back to home city
         → sacrifice unit
         → Tier 1 of that domain auto-completed
         → Domain counts for synergy matching
         → If 2nd domain learned: mid-tier chassis unlocked
         → If 3rd domain learned: late-tier chassis unlocked
```

### Chassis Unlocks (replaces production gate web)

| Domains Learned (including native) | Chassis Unlocked |
|---|---|
| 1 | Base units only |
| 2 | Mid-tier units |
| 3+ | Late-tier units |

This replaces ALL `requiredResearchNodes` checks in `components.json` and `hybrid-recipes.json` with a single domain count check:
```typescript
const domainCount = faction.learnedDomains.length;
const canBuildMidTier = domainCount >= 2;
const canBuildLateTier = domainCount >= 3;
```

### Synergy Gating

| Research Level | Synergy Effect |
|---|---|
| Domain not learned | Doesn't count for any synergy matching |
| Tier 1 completed | Counts for **pair synergy** matching |
| Tier 2 completed | Counts for pair + **emergent rule** matching |
| Tier 3 completed | Counts for all + **tribe-unique bonus** |

### Tier 1 Effects (all tribes, auto-completed)

| Domain | Effect | Notes |
|---|---|---|
| Venom | +1 poison stack on hit | Small but immediately noticeable |
| Fortress | +15% defense when adjacent to ally | Encourages formation play |
| Charge | No cooldown on first charge of each battle | Slightly stronger first engagement |
| Hit & Run | +1 movement after attacking | Retreating is easier |
| Nature Healing | +1 HP regeneration per turn for all units | Passive sustain |
| Camel Adaptation | Ignore desert movement penalties | Terrain freedom |
| Tidal Warfare | No penalty crossing rivers | Map flexibility |
| River Stealth | +1 movement in rough terrain | Better map traversal |
| Slaving | +15% damage vs wounded enemies (<50% HP) | Finishing bonus |
| Heavy Hitter | +20% damage vs fortified/bracing enemies | Anti-turtle |

### Tier 2 Effects (existing qualitative effects, redistributed)

| Domain | Effect | Source (current) |
|---|---|---|
| Venom | Contaminate terrain — killing poisoned enemy leaves poison hex | `contaminate_terrain` |
| Fortress | Zone of Control — fortified units project ZoC to adjacent hexes | `zone_of_control_aura` |
| Charge | Elephant stampede — charges knock back 2 hexes | `stampede2` |
| Hit & Run | Attack then retreat — cavalry can attack and move in same turn | `hit_and_run` (currently unimplemented) |
| Nature Healing | Canopy cover — ranged units +30% defense in forest/jungle | `canopy_cover` |
| Camel Adaptation | Permanent stealth in desert terrain | `permanent_stealth_terrain` |
| Tidal Warfare | Amphibious assault — naval units can attack coastal hexes | `amphibious_assault` |
| River Stealth | Stealth recharge — re-enter stealth after attacking | `stealth_recharge` |
| Slaving | Capture chance on retreat — 15% to capture wounded enemies | `capture_retreat` |
| Heavy Hitter | Reflect 25% damage back to attackers | `damageReflection` |

### Tier 3 Effects (tribe-unique for native domain, shared for foreign)

#### Native Tribe Tier 3 (faction-altering)

| Tribe | Native Domain | Tier 3 Effect |
|---|---|---|
| Jungle Clan | Venom | All units apply poison on hit, not just poison-tagged. Poison never expires. |
| Hill Engineers | Fortress | All units can brace for +40% defense. Fortress aura range doubled to 2 hexes. |
| Steppe Horde | Charge | Charge has no cooldown. Charges ignore terrain penalties. |
| Coast Raiders | Hit & Run | All units can attack then retreat in same turn. |
| Frost Wardens | Nature Healing | All units regenerate 3 HP/turn. Units below 20% HP gain +50% defense. |
| Sand Nomads | Camel Adaptation | All units ignore all terrain movement penalties. |
| River Kingdom | Tidal Warfare | All units gain amphibious movement — cross rivers/coast without penalty. |

#### Shared Tier 3 (for non-native domains — still strong, not faction-altering)

| Domain | Tier 3 Effect |
|---|---|
| Venom | Poison-tagged units deal +50% poison damage |
| Fortress | Fortress aura grants +25% defense (up from +15%) |
| Charge | Charge damage +50% against routed enemies |
| Hit & Run | Units with hit_and_run ignore zone of control |
| Nature Healing | Healing aura range doubled to 2 hexes |
| Camel Adaptation | Units in rough terrain gain +20% defense |
| Tidal Warfare | Naval units gain +25% attack in coastal hexes |
| River Stealth | Stealth units reveal enemies within 2 hexes |
| Slaving | Wounded enemies below 25% HP are auto-captured |
| Heavy Hitter | Ignore 50% armor, units cannot be displaced |

### Per-Tribe Research Tree Layout

Each tribe sees:
- 1 native domain with T1 auto-completed, T2/T3 researchable
- 9 foreign domains all greyed out
- As sacrifices happen, domains light up with T1 completed

Example for Jungle Clan (Turn 1):
```
Venom         [✓ T1] [T2: 60 XP] [T3: 100 XP]     ← NATIVE, lit up
Fortress      [🔒 locked]                            ← greyed out
Charge        [🔒 locked]                            ← greyed out
Hit & Run     [🔒 locked]                            ← greyed out
Nature Heal   [🔒 locked]                            ← greyed out
Camel Adapt   [🔒 locked]                            ← greyed out
Tidal War     [🔒 locked]                            ← greyed out
River Stealth [🔒 locked]                            ← greyed out
Slaving       [🔒 locked]                            ← greyed out
Heavy Hitter  [🔒 locked]                            ← greyed out
```

After sacrificing a unit that learned Fortress (Turn ~15):
```
Venom         [✓ T1] [T2: 60 XP] [T3: 100 XP]     ← NATIVE
Fortress      [✓ T1] [T2: 60 XP] [T3: 100 XP]     ← UNLOCKED via sacrifice
Charge        [🔒 locked]                            ← greyed out
...
```

### Files That Need Changes

#### Backend (src/)
| File | Change |
|---|---|
| `content/base/research.json` | Complete rewrite — 30 nodes per tribe (10 domains × 3 tiers) |
| `systems/researchSystem.ts` | Simplify — remove capability gates, add domain-locking logic, update state type |
| `systems/capabilityDoctrine.ts` | Rewrite — map 30 new node IDs to same boolean flags |
| `systems/sacrificeSystem.ts` | Update `codifies` mapping: sacrifice → auto-complete T1 + count domain |
| `systems/aiResearchStrategy.ts` | Rewrite scoring — prioritize unlocked domains, score T2/T3 |
| `systems/warEcologySimulation.ts` | Update chassis unlock check to use domain count instead of research nodes |
| `features/research/types.ts` | Update `ResearchNode` interface — remove `requiredCapabilities`, add domain field |
| `data/registry/types.ts` | Update `ResearchNodeDef` — add domain, remove capability gates |
| `data/loader/loadRulesRegistry.ts` | Load new research structure |
| `content/base/components.json` | Replace `requiredResearchNodes` with chassis tier requirement |
| `content/base/hybrid-recipes.json` | Replace `requiredResearchNodes` with chassis tier requirement |
| `content/base/factions/*.json` | Update signature ability gates |
| `game/buildMvpScenario.ts` | Initialize native domain T1 as completed |
| `systems/productionSystem.ts` | Update production checks to use domain count |

#### Frontend (web/)
| File | Change |
|---|---|
| `ui/ResearchTree.tsx` | Rewrite layout — 10 domains × 3 tiers, greyed-out states |
| `ui/ResearchNode.tsx` | Update for domain-locked state, remove prerequisite lines |
| `game/view-model/worldViewModel.ts` | Update view model — domain lock status, simplified cost display |
| `game/types/clientState.ts` | Update types — domain lock state, remove capability requirement fields |
| `game/controller/GameSession.ts` | Update research actions — domain-locked nodes can't be selected |
| `styles.css` | Greyed-out styles for locked domains |

#### Tests
| File | Change |
|---|---|
| `tests/warEcologySimulation.test.ts` | Update research state initialization |
| `tests/capabilityDoctrine.test.ts` | Update node IDs in test data |
| `tests/prototype.test.ts` | Update research state initialization |
| `tests/strategicAi.test.ts` | Update AI research strategy tests |
| `tests/content.test.ts` | Update node ID assertions |

### Implementation Order

1. **Design new `research.json`** — 30 nodes, 10 domains × 3 tiers
2. **Update `features/research/types.ts` + `data/registry/types.ts`** — new type shapes
3. **Rewrite `capabilityDoctrine.ts`** — map new node IDs to same boolean flags
4. **Update `sacrificeSystem.ts`** — sacrifice auto-completes T1 + increments domain count
5. **Update `warEcologySimulation.ts`** — chassis unlock via domain count
6. **Update `productionSystem.ts`** — domain-count-based production gates
7. **Rewrite `aiResearchStrategy.ts`** — score unlocked domains for T2/T3
8. **Update `content/base/components.json` + `hybrid-recipes.json`** — remove `requiredResearchNodes`
9. **Update `buildMvpScenario.ts`** — native T1 auto-complete
10. **Update frontend** — ResearchTree, ResearchNode, worldViewModel, GameSession, clientState
11. **Run tests, fix failures, verify all 13 qualitative effects still fire**
12. **Playtest**

### Design Decisions (FINAL)

1. **Tier 3 customization:** Native domain gets tribe-unique T3. Foreign domains get shared T3 (still strong).
2. **Current qualitative effects:** Redistributed to Tier 2. All 13 preserved.
3. **Component/chassis unlocks:** Removed from research nodes. Chassis gated by domain count (1=base, 2=mid, 3=late).
4. **Capability bonuses on research nodes:** Removed entirely. Effects are qualitative only.
5. **Research rate:** Keep knowledge/capability bonus calculations for now, simplify later if needed.
6. **Prerequisites:** None between domains. No cross-domain requirements. Only T1→T2→T3 within a single domain.
7. **Native domain:** T1 auto-completed at game start. No sacrifice needed.
8. **Foreign domains:** Greyed out until unlocked via sacrifice. T1 auto-completed on sacrifice.
9. **Synergy gating:** T1 = pair synergy matching, T2 = emergent rule matching, T3 = tribe-unique bonus.
10. **Game pacing target:** ~150 turns. First sacrifice expected ~turn 15-20 given combat difficulty.
