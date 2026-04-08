# Implementation Plan: Synergy System (Bold Abilities + Stacking)

## Overview

Transform the current tiny combat multipliers into bold, defining abilities with 45 pair synergies and 120 triple stacks. This is the cornerstone of the game's fun.

## Architecture

```
src/content/base/
  ability-domains.json        ← NEW: 10 domain definitions + base effects
  pair-synergies.json         ← NEW: 45 pair synergies as data
  emergent-rules.json         ← NEW: 7 emergent rules for triples

src/systems/
  synergyEngine.ts            ← NEW: Core system — reads configs, resolves active synergies
  synergyEffects.ts           ← NEW: Combat/movement/healing effect application
  knowledgeSystem.ts          ← NEW: Domain learning, exposure tracking, prototype mastery

src/systems/warEcologySimulation.ts  ← MODIFY: Hook synergy engine into combat, movement, healing
src/systems/combatSystem.ts          ← MODIFY: Apply synergy combat effects (knockback, stun, strike-first, etc.)
src/systems/signatureAbilitySystem.ts ← MODIFY: Upgrade base abilities from multipliers to bold effects
src/design/assemblePrototype.ts      ← MODIFY: Domain tags flow into prototypes
src/features/prototypes/types.ts     ← MODIFY: Add synergy-related fields to prototype types
src/data/registry/types.ts           ← MODIFY: Add domain knowledge to faction state
```

## Phase 1: Domain Registry + Synergy Engine Foundation

**Goal**: Define the 10 domains as data. Build the engine skeleton that can resolve which synergies are active for a unit/faction. No gameplay changes yet — just the data layer and resolution logic.

### Files to Create

**`src/content/base/ability-domains.json`**
```json
{
  "domains": {
    "venom": {
      "id": "venom",
      "name": "Venomcraft",
      "nativeFaction": "jungle_clan",
      "tags": ["poison"],
      "baseEffect": {
        "type": "on_hit_debuff",
        "debuff": "poison",
        "damagePerTurn": 2,
        "duration": 3,
        "description": "Melee attacks apply 1 poison stack"
      }
    },
    "fortress_discipline": {
      "id": "fortress_discipline",
      "name": "Fortress Discipline",
      "nativeFaction": "hill_clan",
      "tags": ["fortress"],
      "baseEffect": {
        "type": "aura",
        "auraType": "defense",
        "radius": 1,
        "value": 0.30,
        "target": "allies",
        "description": "Adjacent friendly units get +30% defense"
      }
    },
    "stampede_tactics": {
      "id": "stampede_tactics",
      "name": "Stampede Tactics",
      "nativeFaction": "savannah_lions",
      "tags": ["elephant"],
      "baseEffect": {
        "type": "on_charge",
        "effect": "knockback",
        "distance": 1,
        "description": "Charge attacks knock back 1 hex"
      }
    },
    "cavalry_charge": {
      "id": "cavalry_charge",
      "name": "Cavalry Charge",
      "nativeFaction": "plains_riders",
      "tags": ["cavalry"],
      "baseEffect": {
        "type": "on_charge",
        "effect": "strike_first",
        "noRetaliationOnKill": true,
        "description": "Charge attacks strike first; if enemy dies, attacker takes 0 damage"
      }
    },
    "hit_and_run": {
      "id": "hit_and_run",
      "name": "Skirmish Retreat",
      "nativeFaction": "steppe_clan",
      "tags": ["skirmish"],
      "baseEffect": {
        "type": "on_combat_end",
        "effect": "retreat",
        "description": "After combat, unit retreats to safest adjacent hex"
      }
    },
    "tidal_warfare": {
      "id": "tidal_warfare",
      "name": "Tidal Warfare",
      "nativeFaction": "coral_people",
      "tags": ["naval", "shock"],
      "baseEffect": {
        "type": "zone_control",
        "effect": "amphibious_assault",
        "coastDebuff": 0.25,
        "description": "Naval units attack from water to land; enemies on coast get -25% defense"
      }
    },
    "nature_healing": {
      "id": "nature_healing",
      "name": "Nature Healing",
      "nativeFaction": "druid_circle",
      "tags": ["druid", "healing"],
      "baseEffect": {
        "type": "aura",
        "auraType": "healing",
        "radius": 1,
        "selfHeal": 2,
        "allyHeal": 1,
        "description": "Unit heals 2 HP/turn; adjacent allies heal 1 HP/turn"
      }
    },
    "jungle_stealth": {
      "id": "jungle_stealth",
      "name": "Jungle Stealth",
      "nativeFaction": "jungle_clan",
      "tags": ["stealth"],
      "baseEffect": {
        "type": "status",
        "effect": "stealth",
        "ambushDamage": 0.50,
        "description": "Unit is stealthed; first attack from stealth deals +50% damage"
      }
    },
    "polar_summoning": {
      "id": "polar_summoning",
      "name": "Polar Summoning",
      "nativeFaction": "frost_wardens",
      "tags": ["frost", "summon"],
      "baseEffect": {
        "type": "summon",
        "unit": "polar_bear",
        "cooldown": 5,
        "duration": 5,
        "description": "Summon 1 frost bear; bears have 20 HP, 5 atk, 3 def"
      }
    },
    "camel_adaptation": {
      "id": "camel_adaptation",
      "name": "Camel Adaptation",
      "nativeFaction": "desert_nomads",
      "tags": ["camel"],
      "baseEffect": {
        "type": "movement",
        "effect": "ignore_terrain",
        "description": "Unit ignores all terrain movement penalties"
      }
    }
  }
}
```

**`src/content/base/pair-synergies.json`**
Define all 45 pair synergies. Each entry has:
- `id` — combination key (e.g., `"venom+fortress_discipline"`)
- `name` — display name (e.g., `"Toxic Bulwark"`)
- `domains` — the two domain IDs
- `requiredTags` — tags a unit must have to activate this
- `effect` — the mechanical effect as a structured object
- `description` — human-readable

Effect types needed:
- `poison_aura` — passive AoE poison around unit
- `charge_shield` — first hit after charge deals 0 damage
- `anti_displacement` — can't be knocked back
- `dug_in` — +75% defense after retreat
- `land_aura` — naval unit projects aura onto land
- `extended_healing` — larger healing radius
- `stealth_aura` — fortress stealth (invisible until adjacent)
- `terrain_fortress` — project fortress on specific terrain
- `charge_cooldown_reset` — charge every turn
- `rout_threshold` — lower rout threshold
- `ram_attack` — naval knockback
- `combat_healing` — heal for % of damage dealt
- `stealth_charge` — charge from stealth
- `sandstorm` — AoE charge + accuracy debuff
- `double_charge` — two charges per turn
- `poison_trap` — leave poison on retreat hex
- `contaminate` — poison coastal hexes
- `withering` — reduce enemy healing
- `stealth_healing` — heal without breaking stealth
- `terrain_poison` — poison through terrain
- `multiplier_stack` — poison damage multiplies with stacks
- `aura_overlap` — fortress auras multiply instead of add
- `wave_cavalry` — amphibious cavalry
- `stealth_recharge` — auto re-stealth after action
- `desert_fortress` — fortress on desert terrain
- `frostbite` — cold DoT on bear hits
- `frost_defense` — bear gets defense near fortress
- `bear_charge` — bears can knockback
- `frost_speed` — bears boost cavalry movement
- `bear_cover` — bear covers retreat
- `ice_zone` — freeze water hexes
- `frost_regen` — enhanced bear regeneration
- `bear_mount` — stealth unit rides bear
- `terrain_share` — bears inherit camel terrain ignore
- `pack_bonus` — bear pack stats multiply
- `oasis` — neutralize terrain penalties for allies
- `permanent_stealth_terrain` — permanent stealth on specific terrain
- `shadow_network` — stealth sharing between units
- `nomad_network` — terrain ignore sharing between camels
- `heal_on_retreat` — heal when retreating
- `impassable_retreat` — retreat through impassable terrain
- `swarm_speed` — hit-and-run units near each other gain speed

(Full JSON for all 45 will be in the file — this is data entry, not logic.)

**`src/content/base/emergent-rules.json`**
```json
{
  "rules": [
    {
      "id": "mount",
      "name": "Mount",
      "condition": "contains_summoning AND contains_combat AND contains_mobility",
      "domainSets": {
        "summoning": ["polar_summoning"],
        "combat": ["venom", "fortress_discipline", "stampede_tactics", "cavalry_charge", "hit_and_run", "tidal_warfare"],
        "mobility": ["camel_adaptation", "cavalry_charge", "hit_and_run", "jungle_stealth"]
      },
      "effect": {
        "type": "inherit",
        "description": "Summoned units inherit combat domain's effect AND mobility domain's effect"
      }
    },
    {
      "id": "paladin",
      "name": "Paladin",
      "condition": "contains_healing AND contains_defensive AND contains_offensive",
      "domainSets": {
        "healing": ["nature_healing"],
        "defensive": ["fortress_discipline", "tidal_warfare"],
        "offensive": ["venom", "stampede_tactics", "cavalry_charge", "hit_and_run"]
      },
      "effect": {
        "type": "sustain",
        "healPercentOfDamage": 0.50,
        "minHp": 1,
        "description": "Heals for 50% of damage dealt; can't drop below 1 HP from a single hit"
      }
    },
    {
      "id": "terrain_assassin",
      "name": "Terrain Assassin",
      "condition": "contains_stealth AND contains_combat AND contains_terrain",
      "domainSets": {
        "stealth": ["jungle_stealth"],
        "combat": ["venom", "stampede_tactics", "cavalry_charge", "hit_and_run"],
        "terrain": ["camel_adaptation", "tidal_warfare", "polar_summoning"]
      },
      "effect": {
        "type": "permanent_stealth",
        "terrainTypes": ["native terrain of the terrain domain"],
        "description": "Permanent stealth on matching terrain type"
      }
    },
    {
      "id": "anchor",
      "name": "Anchor",
      "condition": "contains_fortress AND contains_healing",
      "domainSets": {
        "fortress": ["fortress_discipline"],
        "healing": ["nature_healing"]
      },
      "effect": {
        "type": "zone_of_control",
        "radius": 3,
        "defenseBonus": 0.30,
        "healPerTurn": 3,
        "immovable": true,
        "selfRegen": 5,
        "description": "3-hex zone: +30% defense + 3 HP/turn for allies. Unit immovable, regens 5 HP/turn."
      }
    },
    {
      "id": "ghost_army",
      "name": "Ghost Army",
      "condition": "contains_3_mobility",
      "mobilityDomains": ["cavalry_charge", "hit_and_run", "camel_adaptation", "jungle_stealth"],
      "effect": {
        "type": "faction_wide",
        "ignoreAllTerrain": true,
        "bonusMovement": 1,
        "description": "All units ignore terrain penalties AND gain +1 movement"
      }
    },
    {
      "id": "juggernaut",
      "name": "Juggernaut",
      "condition": "contains_3_combat",
      "combatDomains": ["venom", "fortress_discipline", "stampede_tactics", "cavalry_charge"],
      "effect": {
        "type": "faction_wide",
        "doubleCombatBonuses": true,
        "description": "All combat bonuses are doubled"
      }
    },
    {
      "id": "adaptive",
      "name": "Adaptive",
      "condition": "default",
      "effect": {
        "type": "multiplier",
        "pairSynergyMultiplier": 1.5,
        "description": "All pair synergy effects multiplied by 1.5x"
      }
    }
  ]
}
```

### Files to Create (Code)

**`src/systems/synergyEngine.ts`**
```ts
// Core resolution engine
export interface ActiveSynergy {
  pairId: string;
  name: string;
  domains: [string, string];
  effect: SynergyEffect;
}

export interface ActiveTripleStack {
  domains: [string, string, string];
  pairs: ActiveSynergy[];
  emergentRule: EmergentRule;
  name: string;
}

export class SynergyEngine {
  constructor(
    private pairSynergies: PairSynergyConfig[],
    private emergentRules: EmergentRuleConfig[],
    private abilityDomains: DomainConfig[],
  ) {}

  // Given a unit's tags, resolve all active pair synergies
  resolveUnitPairs(unitTags: string[]): ActiveSynergy[] { ... }

  // Given a faction's learned domains, resolve the triple stack
  resolveFactionTriple(learnedDomains: string[]): ActiveTripleStack | null { ... }

  // Given a faction's learned domains, resolve ALL active pairs
  // (pairs activate when a unit has BOTH domain tags)
  resolveFactionPairs(learnedDomains: string[]): string[] { ... }
}
```

**`src/systems/synergyEffects.ts`**
```ts
// Apply synergy effects to combat, movement, healing
// This is where the mechanical effects are implemented

export function applyCombatSynergies(
  context: CombatContext,
  synergies: ActiveSynergy[],
  tripleStack: ActiveTripleStack | null,
): CombatResult { ... }

export function applyMovementSynergies(
  context: MovementContext,
  synergies: ActiveSynergy[],
): MovementResult { ... }

export function applyHealingSynergies(
  context: HealingContext,
  synergies: ActiveSynergy[],
): number { ... }
```

### Verification
- `npx tsc --noEmit` — zero errors
- Load all 3 JSON files and verify they parse correctly
- Unit test: `SynergyEngine.resolveUnitPairs(["poison", "fortress"])` returns Toxic Bulwark
- Unit test: `SynergyEngine.resolveFactionTriple(["venom", "fortress_discipline", "nature_healing"])` returns Withering Citadel with Anchor emergent

---

## Phase 2: Bold Base Abilities

**Goal**: Replace the current tiny multipliers with the bold base effects defined in `ability-domains.json`. This is the single-domain version — no synergies yet, but each ability alone should feel powerful.

### Changes to Existing Files

**`src/systems/combatSystem.ts`**
- Add knockback logic (stampede base effect) — after combat, if attacker has `elephant` tag and performed a charge, push defender to adjacent hex
- Add strike-first logic (cavalry base effect) — cavalry charges deal damage before defender can retaliate
- Add poison DoT system — `poison` tag applies 2 dmg/turn for 3 turns; track poison stacks on units
- Add stealth ambush — stealth units deal +50% damage on first attack; lose stealth after attacking

**`src/systems/warEcologySimulation.ts`**
- Upgrade Bulwark from +0.22 multiplier to +30% defense aura — fortress-tagged units boost adjacent allies
- Upgrade Nature's Blessing from flat heal to aura — healing-tagged units heal self (2) + adjacent allies (1)
- Upgrade Tidal Assault from +0.29 to amphibious assault + coast debuff
- Upgrade Swift Charge from +0.15 to strike-first + no-retaliation-on-kill
- Add stealth system — stealth-tagged units are invisible to AI targeting; first attack breaks stealth with +50% damage
- Add knockback resolution — after combat, check for stampede effect and move defender
- Add poison tick — in the unit refresh phase, apply poison damage to all poisoned units
- Add terrain-ignore movement — camel-tagged units skip terrain penalties in movement calculation

**`src/systems/signatureAbilitySystem.ts`**
- Refactor bonus value reading to use `ability-domains.json` instead of `signatureAbilities.json`
- Add helper functions for new effects: `applyKnockback()`, `applyStrikeFirst()`, `applyPoisonDoT()`, `resolveStealth()`

**New state needed on units:**
- `poisonStacks: number` — number of active poison stacks
- `isStealthed: boolean` — current stealth status
- `turnsSinceStealthBreak: number` — cooldown before can re-stealth

### Verification
- `npx tsc --noEmit` — zero errors
- Run balance harness — expect score to change significantly (abilities are much stronger now)
- Manual: an elephant charge should visibly knock back the defender
- Manual: a poison attack should show DoT damage over subsequent turns

---

## Phase 3: Pair Synergies

**Goal**: Implement the 45 pair synergies from `pair-synergies.json`. When a unit has tags matching two domains, the synergy effect activates.

### Implementation

**`src/systems/synergyEffects.ts`** (expand from Phase 1 skeleton)
- Implement each effect type as a function:
  - `applyPoisonAura()` — V+F, V+T, V+A
  - `applyChargeShield()` — F+S
  - `applyAntiDisplacement()` — F+C
  - `applyDugIn()` — F+H
  - `applyLandAura()` — F+T
  - `applyExtendedHealing()` — F+N, N+N
  - `applyStealthFortress()` — F+J
  - `applyTerrainFortress()` — F+A
  - `applyChargeReset()` — S+C
  - `applyRoutThreshold()` — S+H
  - `applyRamAttack()` — S+T
  - `applyCombatHealing()` — S+N, C+N
  - `applyStealthCharge()` — S+J, C+J
  - `applySandstorm()` — S+A
  - `applyDoubleCharge()` — C+H
  - `applyPoisonTrap()` — V+H
  - `applyContaminate()` — V+T
  - `applyWithering()` — V+N
  - `applyStealthHealing()` — N+J
  - `applyPermanentStealth()` — J+A
  - `applyOasis()` — N+A
  - `applyFrostbite()` — P+V
  - `applyIceFortress()` — P+F
  - `applyBearCharge()` — P+S
  - `applyFrostSpeed()` — P+C
  - `applyBearCover()` — P+H
  - `applyFrozenTide()` — P+T
  - `applyFrostRegen()` — P+N
  - `applyBearMount()` — P+J
  - `applyTerrainShare()` — P+A
  - `applyPackBonus()` — P+P
  - `applyHealOnRetreat()` — H+N
  - `applyImpassableRetreat()` — H+A
  - `applySwarmSpeed()` — H+H
  - `applyShadowNetwork()` — J+J
  - `applyNomadNetwork()` — A+A

**`src/systems/synergyEngine.ts`** (expand)
- `resolveUnitPairs()` — check unit tags against pair synergy requiredTags
- Return sorted list of active synergies with their effects

**Integration into combat loop** (`warEcologySimulation.ts`):
- Before combat: resolve active synergies for attacker and defender
- During combat: apply synergy modifications to damage, defense, order of operations
- After combat: apply post-combat effects (knockback, retreat, traps, healing, stealth recharge)
- During healing phase: apply healing synergies (auras, regen, withering)

### Verification
- `npx tsc --noEmit` — zero errors
- Unit test: each of the 45 pair synergies can be resolved from tags
- Integration test: a unit with `["fortress", "poison"]` tags applies Toxic Bulwark in combat
- Balance harness — expect further score changes (synergies make strong factions stronger)

---

## Phase 4: Triple Stacks + Emergent Rules

**Goal**: When a faction has learned 3 domains, all their units gain 3 pair synergies + the emergent bonus. This is the end-game transformation.

### Implementation

**`src/systems/synergyEngine.ts`** (expand)
- `resolveFactionTriple()` — given 3 learned domains, find the matching triple
- `resolveEmergentRule()` — match triple against emergent rule conditions
- `applyEmergentEffect()` — apply the emergent rule's effect (Mount, Paladin, Anchor, etc.)

**`src/data/registry/types.ts`**
- Add `learnedDomains: string[]` to faction state (max 3)
- Add `nativeDomain: string` to faction config

**Integration into simulation** (`warEcologySimulation.ts`):
- At start of each turn: resolve faction triple stack
- Faction-wide effects (Ghost Army, Juggernaut) apply to ALL units
- Unit-level effects (Mount, Paladin, Anchor) apply to units with matching tags
- The emergent bonus is the cherry on top of 3 pair synergies

### Triple Naming
Generate triple names from pair synergy names. Example:
- V+F+N = pair synergies: Toxic Bulwark + Citadel + Regenerative Venom → name: "Withering Citadel"
- Names are stored in the emergent-rules.json or derived from a lookup table

### Verification
- `npx tsc --noEmit` — zero errors
- Unit test: faction with domains `["venom", "fortress_discipline", "nature_healing"]` gets Withering Citadel with Anchor emergent
- Unit test: faction with domains `["cavalry_charge", "hit_and_run", "camel_adaptation"]` gets Ghost Army emergent
- Integration test: end-game faction with 3 domains transforms visibly

---

## Phase 5: Knowledge Acquisition System

**Goal**: Factions learn foreign domains through combat exposure, city capture, and proximity. This is the progression system that makes the game emergent.

### Implementation

**`src/systems/knowledgeSystem.ts`** (NEW)
```ts
interface AbilityKnowledge {
  nativeDomain: string;
  learnedDomains: string[];          // max 3 total
  exposureProgress: Map<string, number>; // domain -> 0..threshold
  prototypeMastery: Map<string, number>; // domain -> count of prototypes built
}

function gainExposure(factionId: string, domainId: string, amount: number): void
function checkDomainLearned(factionId: string): string | null  // returns newly learned domain or null
function getPrototypeCostModifier(factionId: string, domainId: string): number  // 2.0, 1.5, 1.2, 1.0
```

**Exposure Sources:**
- Combat: fighting a unit with ability tags from a foreign domain → gain exposure
- City capture: conquering a settlement from a faction with a foreign domain → 50% of threshold
- Proximity: shared border for N turns → small exposure per turn
- Terrain control: controlling terrain associated with a domain for N turns → gradual exposure

**Exposure Thresholds:**
- First domain: 100 exposure points
- Second domain: 150 exposure points (harder to learn)
- Third domain: 200 exposure points (hardest)

**Integration into simulation** (`warEcologySimulation.ts`):
- After each combat: check if any unit tags match a foreign domain → `gainExposure()`
- After city capture: check if the captured faction had a domain → `gainExposure(captureThreshold)`
- Each turn: check shared borders → `gainExposure(proximityPerTurn)`
- After domain learned: log event, notify player (if UI exists)
- When producing prototypes: apply `getPrototypeCostModifier()` to production cost

### Native Domain Assignment
Each faction starts with their native domain already learned:
- jungle_clan → venom
- druid_circle → nature_healing
- steppe_clan → hit_and_run
- hill_clan → fortress_discipline
- coral_people → tidal_warfare
- desert_nomads → camel_adaptation
- savannah_lions → stampede_tactics
- plains_riders → cavalry_charge
- frost_wardens → polar_summoning

Add `nativeDomain` field to `civilizations.json` for each faction.

### Verification
- `npx tsc --noEmit` — zero errors
- Unit test: faction starts with 1 domain, gains exposure through combat, learns 2nd domain after threshold
- Unit test: prototype cost is 2× for first foreign build, 1.5× for second, 1.2× for third, 1.0× after
- Unit test: faction at 3 domains cannot learn a 4th
- Integration test: run 50-turn sim, check that factions learn foreign domains naturally through combat
- Balance harness — expect significant score changes (knowledge acquisition creates power divergence)

---

## Phase 6: AI Strategy + Polish

**Goal**: AI factions make intelligent decisions about which domains to pursue, which prototypes to build, and how to leverage synergies.

### AI Changes

**Domain Pursuit Priority:**
- AI evaluates which foreign domains complement its native domain
- Prioritizes fighting factions whose domains synergize well with native
- Example: frost_wardens (polar_summoning) should seek nature_healing (for Frost Citadel triple) over stampede_tactics (less synergistic)

**Prototype Building:**
- When a faction has 2+ domains, AI considers building hybrid prototypes
- AI evaluates prototype cost modifier vs. strategic value
- AI won't build expensive foreign prototypes until it has sufficient economy

**Synergy-Aware Combat:**
- AI positions units to maximize synergy effects (fortress aura overlap, healing range, etc.)
- AI uses hit-and-run + terrain synergy to kite enemies
- AI uses stealth ambush positioning

### Polish
- Turn snapshot should include active synergies and learned domains
- Combat log should mention synergy activations ("Toxic Bulwark activated!", "WITHERING CITADEL — Anchor emergent!")
- Balance harness should track domain learning events

---

## OpenCode Session Plan

| Session | Phase | Scope | Est. Complexity |
|---------|-------|-------|-----------------|
| 1 | Phase 1 | Data files + engine skeleton | Medium |
| 2 | Phase 2 | Bold base abilities | High |
| 3 | Phase 3 | Pair synergies | High |
| 4 | Phase 4 | Triple stacks + emergence | Medium |
| 5 | Phase 5 | Knowledge acquisition | High |
| 6 | Phase 6 | AI + polish | Medium |

**Session 1 is the foundation** — get the data structures right and the engine skeleton compiling. Sessions 2-3 are where the fun happens (bold abilities + synergies). Session 4 is the payoff (triple stacks). Sessions 5-6 make it a game.

**Each session should:**
1. Read the design docs (`docs/design/tag-driven-abilities.md`, `docs/design/synergy-reference.md`)
2. Read the codemap
3. Implement the changes
4. Run `npx tsc --noEmit`
5. Run relevant tests

**Important constraints:**
- Fun > Optuna score. If abilities feel too strong, that's a feature not a bug.
- Keep existing test infrastructure working — balance harness should still run (even if scores are wild)
- Don't break turn snapshot recording — synergies should be recorded for future UI
- Each phase must be independently compilable and runnable
