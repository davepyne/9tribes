# Tag-Driven Ability System — Design Document

## Philosophy

Faction identity is a **starting condition**, not a ceiling. Tribes are shaped by their home terrain, but they evolve through contact — war, proximity, conquest. By end-game, a faction that has fought across the map may have absorbed up to 3 foreign combat traditions and is building hybrid prototypes that combine them.

Uniqueness comes from *terrain and exposure*, not hardcoded faction ID.

### Key Design Decisions

- **Culture cap: 3 learned domains.** First 3 you encounter through exposure — no player choice, no menu. What you absorb is determined by who you fight and where you expand. This creates emergent identity: your faction is shaped by the game, not by a build menu.
- **All 9 factions start with 1 native domain.** Every tribe has something to teach. No blank slates.
- **Domains stack on prototypes.** A single prototype can carry up to 3 domains. This is where the fun lives.
- **No forgetting.** Once learned, a domain is yours permanently.

---

## Current State: What Needs to Change

### Faction-Hardcoded Abilities (must be refactored)

| Current Ability | Faction | Hardcoded Check | Proposed Tag Driver |
|---|---|---|---|
| Lethal Venom | jungle_clan | `canInflictPoison()` checks `poison` tag ✅ | Already tag-driven — no change needed |
| Bulwark | hill_clan | `hasFortressTraining()` checks component tags ✅ | Partially tag-driven — combat bonus is faction-gated ❌ |
| Stampede | savannah_lions | `factionId === 'savannah_lions'` ❌ | `elephant` tag + charge |
| Swift Charge | plains_riders | `factionId === 'plains_riders'` ❌ | `cavalry` tag + charge |
| Hit and Run | steppe_clan | `factionId === 'steppe_clan'` ❌ | `cavalry` + `skirmish` tags |
| Tidal Assault | coral_people | `factionId === 'coral_people'` ❌ | `naval` + `shock` tags |
| Nature's Blessing | druid_circle | `factionId === 'druid_circle'` ❌ | `druid` / `healing` tag |
| Endless Stride | jungle_clan | stealth screening in AI ❌ | `stealth` tag + jungle terrain |
| Polar Call | frost_wardens | `factionId === 'frost_wardens'` ❌ | **Summon system** — different category |

### Already Tag-Driven (keep as-is)

- **Poison infliction**: checks `prototype.tags.includes('poison')` — any unit with poison component works
- **Bulwark detection**: `hasFortressTraining()` checks component tags — any unit with fortress training detected
- **Flee behavior**: checks `beast`/`elephant`/`summon` tags on prototype

---

## Core Mechanic: Knowledge Acquisition

Factions don't start knowing all abilities. They **learn** them through exposure to other tribes.

### Knowledge Sources

**1. Combat Exposure (Primary)**
When your units fight against a unit carrying an ability tag you haven't learned:
- After the battle, there's a chance (based on number of rounds fought, not just a single clash) to gain **exposure XP** for that ability domain.
- Once exposure XP reaches a threshold → the ability domain is **learned** (unlocked for your faction).
- First exposure is slow. Each subsequent battle against the same ability speeds up learning.

**2. City/Village Capture (Fast)**
Conquering a settlement from a faction that has an ability domain you haven't learned → immediate partial exposure (like 50% of the threshold). Represents absorbing their craft knowledge.

**3. Proximity / Trade (Slow)**
Having a shared border or trade route with a faction for N turns → gradual exposure to their ability domains. Peaceful diffusion. Slower than combat but no risk.

**4. Terrain Mastery (Natural)**
Controlling territory associated with a domain for extended periods naturally builds capability. A desert tribe holding forest for 20 turns slowly gains woodcraft exposure even without fighting jungle_clan.

### Knowledge State per Faction

```ts
interface AbilityKnowledge {
  // Native domain (always present, learned from game start)
  nativeDomain: AbilityDomainId;

  // Learned foreign domains (max 3 total including native = 2 foreign max)
  learnedDomains: AbilityDomainId[];  // max length 3

  // Domains in progress — exposure accumulated but not yet learned
  exposureProgress: Map<AbilityDomainId, number>; // 0..threshold

  // How many prototypes built with each domain (drives cost reduction)
  prototypeMastery: Map<AbilityDomainId, number>;
}
```

**Culture cap: 3 domains total** (1 native + up to 2 foreign). When you're already at 3 and exposure completes for a 4th, it's simply lost — you can't absorb more. This makes the *order* of contact matter strategically. Who you fight early shapes your faction's identity permanently.

**Domain stacking on prototypes:** A prototype can carry effects from all 3 learned domains simultaneously. This is the core fun mechanic.

### Ability Domains (replaces per-faction signature abilities)

| Domain ID | Name | Source Faction | Tags It Enables |
|---|---|---|---|
| `venom` | Venomcraft | jungle_clan | `poison` — DoT on hit |
| `fortress_discipline` | Fortress Discipline | hill_clan | `fortress` — Bulwark defense aura |
| `stampede_tactics` | Stampede Tactics | savannah_lions | `elephant` charge bonus |
| `cavalry_charge` | Cavalry Charge | plains_riders | cavalry charge damage |
| `hit_and_run` | Skirmish Retreat | steppe_clan | retreat-after-combat |
| `tidal_warfare` | Tidal Warfare | coral_people | naval shock combat |
| `nature_healing` | Nature Healing | druid_circle | healing bonus |
| `jungle_stealth` | Jungle Stealth | jungle_clan | stealth in forest/jungle |
| `polar_summoning` | Polar Summoning | frost_wardens | summon frost guardians |
| `camel_adaptation` | Camel Adaptation | desert_nomads | `camel` — ignore terrain movement penalties |

---

## Prototype Economics

### Cultural Challenge Cost

Building a prototype using an **unfamiliar** ability domain (one you learned but haven't mastered) costs more. This represents the cultural difficulty of adapting foreign techniques.

```
Base production cost × cost_modifier
```

| Prototype # with domain | Cost modifier | Rationale |
|---|---|---|
| First ever | 2.0× | Cultural shock — you're trying something completely foreign |
| Second | 1.5× | You've done it once, rough idea |
| Third | 1.2× | Starting to institutionalize |
| Fourth+ | 1.0× | Fully integrated into your military tradition |

This is tracked per-domain per-faction in `prototypeMastery`. So:
- Your first `poison_infantry` costs 2× infantry base
- Your second poison unit (even if different chassis) costs 1.5×
- After 3 poison units, all future poison builds are normal cost
- A frost_wardens player who learned venomcraft and builds 4 poison units eventually gets them at normal cost — but their *first* one was expensive enough that it was a strategic commitment

### Recipe System Expansion

Current `hybrid-recipes.json` defines fixed combinations. Under the tag model, recipes become **templates** for the most common combinations, but the Prototype Lab allows free-form assembly:

```
Chassis: infantry_frame
  + Weapon: basic_spear
  + Training: poison_arrows      ← requires learned domain: venom
  + Training: cold_provisions    ← requires learned domain: nature_healing (or frost)
  → "Frost-Venom Infantry" — poison DoT + cold endurance
```

The Prototype Lab only allows combinations where you've learned ALL required domains. You can't combine `poison_arrows` + `tidal_drill` unless you've learned both `venom` and `tidal_warfare`.

---

## Faction Starting Conditions (What Makes Factions Different)

Factions are no longer defined by exclusive abilities. They're defined by:

### 1. Home Terrain & Starting Capabilities
- frost_wardens start with high `endurance`, `fortification` on tundra
- jungle_clan start with high `woodcraft`, `poisoncraft`
- This gives them early access to their native ability domains — they don't need to "learn" what they invented

### 2. Native Domains (Pre-Learned)
Each faction starts with 1 native ability domain — one thing they invented that everyone else has to earn:
- jungle_clan: `venom`
- druid_circle: `nature_healing`
- steppe_clan: `hit_and_run`
- hill_clan: `fortress_discipline`
- coral_people: `tidal_warfare`
- desert_nomads: `camel_adaptation`
- savannah_lions: `stampede_tactics`
- plains_riders: `cavalry_charge`
- frost_wardens: `polar_summoning`

### 3. Capability Biases
Existing capability growth biases (from `civilizations.json`) mean factions naturally develop their native domains faster. A jungle_clan unit will hit `poisoncraft: 6` sooner than a hill_clan unit, unlocking `poison_arrows` component research first.

### 4. Terrain Advantage
Fighting on home terrain still matters — jungle_clan in forest gets stealth bonuses, frost_wardens on tundra get summon bonuses. The *terrain* is the uniqueness, not a faction ID check.

---

## Summon Abilities (Special Case)

Polar Call (frost bear summoning) is fundamentally different from buff abilities — it creates new units. Under the tag model:

- `polar_summoning` domain allows building a **summon action** into your turn cycle
- The summoned creature is defined by the domain (frost bear = beast, frost, summon tags)
- If desert_nomads learned `polar_summoning`, they could summon frost bears too — but only on tundra terrain (the summon is terrain-gated, not faction-gated)
- Future domains could add other summons: jungle_clan's `venom` domain could eventually unlock a "venomous serpent" summon on jungle terrain

---

## End Game Vision

A typical end-game faction might look like:

**Frost Wardens (aggressive expansionist)**
- Native: `polar_summoning` (learned from start)
- Learned: `venom` (fought jungle_clan repeatedly), `fortress_discipline` (conquered hill_clan city)
- Building: Frost-Venom Cavalry (cavalry + poison + cold), Fortress Bear Riders (infantry + fortress + frost summon support)
- Prototype mastery: 4 poison builds (1.0× cost), 2 fortress builds (1.2× cost)

**Desert Nomads (the ultimate adapter)**
- Native: `camel_adaptation` (terrain-ignore movement — they go where others can't)
- Learned: `hit_and_run` (bordered steppe_clan early), `nature_healing` (long proximity to druid_circle)
- Building: Healer Skirmish Camels (camel + skirmish retreat + healing) — they hit, they heal, they go anywhere
- Every foreign prototype was expensive at first — but their native camel mobility means they get exposure to *everyone* by crossing terrain others avoid

**The Dream Unit — Frost-Venom Camel Bear**
Imagine a desert_nomads player who:
1. Started with `camel_adaptation` (native)
2. Fought frost_wardens repeatedly → learned `polar_summoning`
3. Fought jungle_clan repeatedly → learned `venom`
- Building: A camel-mounted unit with polar bear summon support and poison weapons
- On the battlefield: this unit ignores terrain penalties, summons a poison-inflicting frost bear, and the bear itself can traverse difficult terrain to reach enemies hiding in rough ground
- The polar bear has `poison` tag (inherited from summoning faction's learned domains) → its attacks inflict DoT
- **This is a unit that could only exist in this specific game, against this specific sequence of opponents. No build guide, no meta. Pure emergence.**

This creates **emergent faction identity** — your faction becomes unique not because of what you started with, but because of *who you fought and what you absorbed*. No two games produce the same faction.

---

## Implementation Priority

1. **Tag-Driven Combat Abilities** — Refactor the 6 faction-gated combat bonuses to tag checks. This is the foundation everything else depends on.
2. **Ability Domain Knowledge System** — New data structure tracking learned domains, exposure progress, and prototype mastery per faction.
3. **Knowledge Acquisition Logic** — Combat exposure → city capture → proximity. Integrated into the existing turn loop.
4. **Prototype Cost Scaling** — Multiply production cost by domain familiarity modifier.
5. **Prototype Lab UI** — Late-game improvement that lets players assemble custom unit combinations from learned domains.
6. **AI Prototype Strategy** — AI needs to evaluate which foreign domains to pursue and build prototypes accordingly.

---

## Design Decisions (Resolved)

- **Culture cap: 3 domains total** (1 native + 2 foreign max). No player choice — first 3 you encounter. Order of contact matters permanently.
- **All 9 factions have a native domain.** Everyone has something to teach, everyone has something to learn.
- **Domains stack on prototypes.** A single unit can carry all 3 learned domains simultaneously.
- **No forgetting.** Once learned, permanently yours.
- **desert_nomads get `camel_adaptation`.** Terrain-ignore movement — they're the ones who can reach everyone, so they get the most exposure opportunities naturally.

## Edge Cases (Resolved)

- **Learning synergies: None.** Exposure is exposure — no bonus for learning related domains. Synergies exist organically through geography (fighting steppe_clan on open ground naturally leads to encountering plains_riders). Keep it simple.
- **4th domain overflow: Silently lost with notification.** Show a toast/message: *"You encountered frost summoning traditions, but your culture is saturated — cannot absorb more."* Makes the cap feel intentional, gives the player strategic info about what they missed, and makes early-game contact routing matter permanently.
- **Summoned units inherit domains: Yes.** If desert_nomads has `venom` + `polar_summoning`, their summoned bear inflicts poison. Summons are an extension of the summoning faction's knowledge, not separate entities. This is required for the dream unit to work.
- **Peaceful cultural exchange: Not now, but structure for it.** The `gainExposure(factionId, domainId, amount)` function should be the single entry point for all exposure gains — currently called from combat and capture, later callable from diplomatic actions. Don't build the UI or action, just don't paint into a corner.
- **Component slots vs domains: Domains are passive, components are the build.** Domains don't occupy component slots. `camel_adaptation` doesn't need a component — if the faction knows it, any `camel`-tagged unit they build ignores terrain penalties. Components (weapon, training, armor) are the physical assembly. Domains are the knowledge layer on top.
- **AI domain prioritization: TBD.** Needs more thought during implementation. Likely heuristic: pursue domains that complement existing native domain and terrain position.
