# War-Civ II: Game Manual

## Introduction

War-Civ II is a turn-based strategy game where conflict drives civilization forward. Nine tribes compete for dominance across a procedurally generated hex map. Each tribe has a unique identity shaped by its home terrain, passive traits, signature abilities, and two exclusive unit types — one for the mid-game and one for the late-game.

This manual covers all game mechanics as implemented in the current codebase.

---

## The World

### Hex-Based Geography

The world is a hexagonal grid using axial coordinates (q, r). Each hex has a terrain type that affects movement cost, combat defense, economy, and capability growth.

### Terrain Types

| Terrain | Move Cost | Defense | Production Yield | Key Capabilities Taught |
|---------|-----------|---------|-----------------|------------------------|
| Plains | 1 | 0% | 0.10 | Horsemanship, Mobility |
| Savannah | 1 | 0% | 0.12 | Formation Warfare, Mobility, Shock Resistance |
| Forest | 2 | +25% | 0.06 | Woodcraft, Poisoncraft, Stealth |
| Hill | 2 | +15% | 0.14 | Fortification, Hill Fighting, Shock Resistance |
| Desert | 2 | −10% | 0.04 | Desert Survival, Endurance |
| Tundra | 2 | +5% | 0.06 | Endurance, Fortification |
| Jungle | 3 | +45% | 0.07 | Woodcraft, Poisoncraft, Stealth |
| Coast | 2 | +10% | 0.10 | Seafaring, Navigation |
| River | 2 | +5% | 0.12 | Navigation, Mobility, Seafaring |
| Swamp | 3 | +15% | 0.06 | Navigation, Stealth, Woodcraft |
| Ocean | 1 (naval only) | 0% | 0.03 | Seafaring, Navigation |

### Map Generation

The map is procedurally generated from a seed, ensuring reproducibility. Each tribe is placed in terrain matching its home biome, with guaranteed minimum coverage of preferred terrain within radius 2 of its starting hex.

---

## The Nine Tribes

Each tribe has a unique passive trait, a mid-game hybrid unit, and a late-game signature unit.

### Jungle Clan

| Attribute | Detail |
|---|---|
| **Home Biome** | Jungle |
| **Passive Trait** | Jungle Stalkers — +35% defense in jungle, +15% attack in jungle and forest, +15% defense in forest and swamp, enhanced economy in jungle |
| **Signature Unit** | Serpent God (summon) |
| **Starting Capabilities** | woodcraft 4, poisoncraft 3, stealth 3, endurance 2 |

**Starting Units:** 1 infantry (spear + venom_rites), 1 ranged (bow + venom_rites)

**Signature Ability — Serpent God:** Summons a Serpent God (18 HP, 5 ATK, 2 DEF, 3 MOV) on jungle terrain. Lasts 5 turns, 3-turn cooldown. Requires `master_poisoncraft` research. Applies 3 poison damage per turn to enemies.

**Hybrid Units:**
- **Blowgun Skirmishers** (ranged, poison) — requires poisoncraft 4, `codify_poisoncraft`
- **Serpent Priest** (ranged, healing, poison) — requires poisoncraft 4 + woodcraft 4, `codify_poisoncraft`

**Research Path:** codify_poisoncraft → master_poisoncraft (Serpent God summon)

---

### Druid Circle

| Attribute | Detail |
|---|---|
| **Home Biome** | Forest |
| **Passive Trait** | Healing Druids — units heal extra HP on forest, jungle, hill, tundra, and desert tiles (all rough terrains), +15% attack on forest, enhanced economy on rough terrain |
| **Signature Unit** | Druid Wizard (hybrid) |
| **Starting Capabilities** | woodcraft 4, endurance 3, stealth 2, fortification 1 |

**Starting Units:** 1 infantry (spear + druidic_rites), 1 ranged (bow + simple_armor)

**Signature Ability — Forest Mending:** Units on forest or jungle tiles regenerate 3 HP per turn (configurable).

**Hybrid Units:**
- **Healing Druids** (ranged, healing) — requires woodcraft 6 + endurance 4, `codify_woodcraft`
- **Druid Wizard** (ranged, glass cannon) — requires woodcraft 6 + endurance 5, `codify_woodcraft`

**Research Path:** codify_woodcraft → master_woodcraft (unlocks druidic_rites component, canopy cover)

---

### Steppe Clan

| Attribute | Detail |
|---|---|
| **Home Biome** | Plains |
| **Passive Trait** | Foraging Riders — +15% attack and +20% defense on plains and savannah, enhanced economy on plains and savannah |
| **Signature Unit** | Warlord (summon) |
| **Starting Capabilities** | horsemanship 4, mobility 4, woodcraft 2, stealth 2 |

**Starting Units:** 1 cavalry (bow + skirmish_drill), 1 infantry (spear + simple_armor)

**Signature Ability — Warlord:** Summons a Warlord (20 HP, 5 ATK, 3 DEF, 3 MOV) on plains or savannah terrain. Lasts 5 turns, 5-turn cooldown. Requires `codify_horsemanship` research. Has an aura that buffs adjacent allies.

**Hybrid Units:**
- **Steppe Raiders** (cavalry, raider) — requires horsemanship 6 + mobility 5, `codify_horsemanship` + `codify_woodcraft`
- **Steppe Priest** (infantry, healing) — requires horsemanship 4 + endurance 4, `codify_horsemanship`

**Research Path:** codify_horsemanship → master_horsemanship (hit and run, mounted archer component)

---

### Hill Clan

| Attribute | Detail |
|---|---|
| **Home Biome** | Hill |
| **Passive Trait** | Hill Engineering — +25% attack and +10% defense on hill terrain |
| **Signature Unit** | Catapult (hybrid) |
| **Starting Capabilities** | hill_fighting 4, fortification 4, formation_warfare 2 |

**Starting Units:** 1 infantry (spear + fortress_training), 1 ranged (bow + simple_armor)

**Signature Ability — Stampede:** Elephant charges knock enemies back (0.3 multiplier).

**Hybrid Units:**
- **Fortress Archer** (ranged, fortress) — requires hill_fighting 5 + fortification 6, `codify_fortification`
- **Catapult** (ranged, siege) — requires fortification 4, `codify_fortification`

**Research Path:** codify_fortification → master_fortification (field forts, boiling oil)

---

### Coral People (Pirate Lords)

| Attribute | Detail |
|---|---|
| **Home Biome** | Coast |
| **Passive Trait** | Greedy Capture — 50% chance to capture enemy units instead of killing them (no HP threshold), +15% attack and defense on coast and ocean, enhanced economy on coast and ocean, river stealth |
| **Signature Unit** | Galley (hybrid) |
| **Starting Capabilities** | seafaring 4, navigation 4, mobility 2 |

**Starting Units:** 1 naval (bow + tidal_drill), 1 infantry (spear + simple_armor)

**Signature Abilities:**
- **Greedy Capture:** 50% capture chance on non-combat hits, 40% on combat hits. 3-round cooldown.
- **Coastal Walls:** Capital city walls take half damage when besieged.
- **Coastal Fortress:** Capital city gets double wall defense bonus (×2 multiplier).

**Hybrid Units:**
- **Slaver** (heavy infantry, capture) — requires formation_warfare 4, `codify_formation`
- **Slave Galley** (naval, ranged, transport) — requires formation_warfare 4 + navigation 5 + seafaring 6, `codify_navigation` + `codify_formation`

**Research Path:** codify_navigation → master_navigation (tidal drill, amphibious assault)

---

### Desert Nomads

| Attribute | Detail |
|---|---|
| **Home Biome** | Desert |
| **Passive Trait** | Desert Logistics — Desert Swarm: +1 attack and +10% defense when 3+ friendly units within Chebyshev distance 2, +15% defense in desert, enhanced production and supply in desert/savannah/plains |
| **Signature Unit** | Desert Immortals (hybrid) |
| **Starting Capabilities** | horsemanship 3, desert_survival 3, mobility 3 |

**Starting Units:** 1 camel (spear + simple_armor), 1 infantry (spear + simple_armor)

**Signature Abilities:**
- **Endless Stride:** Units ignore movement penalties from terrain.
- **Desert Swarm:** When 3+ living friendly units are within Chebyshev distance 2, the unit gains +1 attack and +10% defense.

**Hybrid Units:**
- **Camel Lancers** (camel, desert) — requires horsemanship 5 + desert_survival 6, `codify_horsemanship`
- **Desert Immortals** (heavy infantry, immortal) — requires desert_survival 6 + fortification 4, `codify_fortification`

**Research Path:** codify_desert_survival (heat resistance), codify_horsemanship (forced march)

---

### Savannah Lions

| Attribute | Detail |
|---|---|
| **Home Biome** | Savannah |
| **Passive Trait** | Charge Momentum — +15% attack and defense on savannah and plains, enhanced economy on savannah and plains |
| **Signature Unit** | War Elephants (hybrid) |
| **Starting Capabilities** | formation_warfare 4, mobility 3, shock_resistance 3 |

**Starting Units:** 1 elephant (spear + elephant_harness), 1 infantry (spear + simple_armor)

**Signature Ability — Stampede:** Elephant charges apply knockback (0.3 multiplier, upgraded to 2 hexes with master_formation).

**Hybrid Units:**
- **War Elephants** (elephant, shock) — requires formation_warfare 6 + shock_resistance 4, `master_formation`
- **War Chariot** (cavalry, shock, fast) — requires horsemanship 3 + formation_warfare 4 + mobility 3, `codify_horsemanship`

**Research Path:** codify_formation → master_formation (stampede 2, war elephants unlock)

---

### Plains Riders

| Attribute | Detail |
|---|---|
| **Home Biome** | River |
| **Passive Trait** | River Assault — +10% attack on water terrain (river, coast, ocean), river stealth, enhanced economy on river terrain |
| **Signature Unit** | Ancient Alligator (summon) |
| **Starting Capabilities** | navigation 4, seafaring 4, mobility 3, woodcraft 2 |

**Starting Units:** 1 naval (spear + rivercraft_training), 1 infantry (spear + rivercraft_training)

**Signature Ability — Ancient Alligator:** Summons an Ancient Alligator (15 HP, 5 ATK, 2 DEF, 3 MOV) on river, jungle, or swamp terrain. Lasts 5 turns, 5-turn cooldown. Requires `master_navigation` research.

**Hybrid Units:**
- **River Raiders** (naval, amphibious) — requires navigation 6 + seafaring 5, `codify_navigation`
- **River Priest** (ranged, healing) — requires navigation 4 + endurance 4, `codify_navigation`

**Research Path:** codify_navigation → master_navigation (Alligator summon, tidal drill, amphibious assault)

---

### Frost Wardens

| Attribute | Detail |
|---|---|
| **Home Biome** | Tundra |
| **Passive Trait** | Cold Hardened — −1 movement cost on tundra, +15% attack and +25% defense on tundra, +10% economy on poor terrain |
| **Signature Unit** | Polar Bear (summon) |
| **Starting Capabilities** | fortification 4, hill_fighting 2, endurance 4 |

**Starting Units:** 1 infantry (spear + cold_provisions), 1 ranged (bow + cold_provisions)

**Signature Ability — Polar Bear:** Summons a Polar Bear (25 HP, 7 ATK, 3 DEF, 3 MOV) on tundra terrain. Lasts 7 turns, 3-turn cooldown. Requires `codify_endurance` research. The strongest summon in the game — individually powerful but terrain-locked.

**Hybrid Units:**
- **Ice Defenders** (ranged, cold, defensive) — requires endurance 5 + fortification 4, `codify_endurance`
- **Polar Priest** (ranged, healing, cold) — requires endurance 4 + fortification 4, `codify_endurance`

**Research Path:** codify_endurance (Polar Bears, cold provisions) → codify_fortification (fortress training, heavy infantry, catapults)

**Design Philosophy:** Slow but strong. No cavalry, no navy, no mobility — but access to heavy infantry, catapults, and the game's most powerful summon. The trade-off is speed for raw power.

---

## Faction Identity System

Each faction's passive trait provides permanent bonuses tied to terrain or combat mechanics. These are not toggleable — they are always active.

| Faction | Passive | Effect |
|---------|---------|--------|
| Jungle Clan | Jungle Stalkers | +35% defense in jungle, +10% attack in jungle/forest |
| Druid Circle | Healing Druids | Extra HP healing on forest/jungle tiles |
| Steppe Clan | Hit and Run | Units can attack then retreat in same turn |
| Hill Clan | Bulwark | +25% defense when adjacent to fortress-trained ally |
| Coral People | Greedy Capture | 50% chance to capture low-HP enemies; capital walls take half damage and have double defense bonus |
| Desert Nomads | Desert Logistics | Endless Stride (ignore terrain penalties); Desert Swarm (+1 ATK, +10% DEF when 3+ friendly units nearby) |
| Savannah Lions | Stampede | Elephant charges knock enemies back |
| Plains Riders | Swift Charge | Mounted units gain +30% attack when charging |
| Frost Wardens | Cold Hardened | −1 move cost on tundra, +10% ATK/DEF on tundra, +10% economy on poor terrain |

---

## Units

### Chassis

Every unit is built on a chassis that determines base stats, movement, available equipment slots, and tags.

| Chassis | HP | ATK | DEF | MOV | RNG | Move Class | Slots | Tags |
|---------|-----|-----|-----|-----|-----|-----------|-------|------|
| Infantry | 9 | 2 | 2 | 2 | 1 | infantry | weapon, armor, training | melee |
| Heavy Infantry | 12 | 2 | 3 | 2 | 1 | infantry | weapon, armor, training | melee, heavy |
| Ranged | 8 | 1 | 1 | 2 | 2 | infantry | weapon, armor, training | ranged |
| Cavalry | 10 | 1 | 2 | 3 | 1 | cavalry | weapon, armor, training | mounted |
| Heavy Cavalry | 12 | 2 | 2 | 3 | 1 | cavalry | weapon, armor, training | mounted, heavy |
| Camel | 7 | 2 | 1 | 3 | 1 | camel | weapon, armor, training | mounted, camel |
| Elephant | 14 | 3 | 2 | 3 | 1 | beast | weapon, armor, training | mounted, elephant, shock |
| Naval | 8 | 1 | 1 | 3 | 1 | naval | weapon, armor, training | naval |
| Ranged Naval | 8 | 1 | 1 | 4 | 3 | naval | weapon, armor, training | naval, ranged |
| Galley | 14 | 3 | 2 | 5 | 3 | naval | weapon, armor, training | naval, ranged, transport |
| Chariot | 8 | 2 | 1 | 4 | 1 | cavalry | weapon, armor, training | cavalry, mounted, chariot, shock, fast |
| Catapult | 6 | 4 | 1 | 2 | 3 | infantry | weapon, armor, training | ranged, siege |

#### Summon-Only Chassis

These chassis cannot be built — they are only created by the summon ability.

| Chassis | HP | ATK | DEF | MOV | Tags |
|---------|-----|-----|-----|-----|------|
| Polar Bear | 25 | 7 | 3 | 3 | beast, summon, frost |
| Serpent God | 18 | 5 | 2 | 3 | beast, summon, jungle, poison |
| Ancient Alligator | 15 | 5 | 2 | 3 | beast, summon, river |
| Warlord | 20 | 5 | 3 | 3 | cavalry, mounted, warlord, summon, aura |

#### Faction-Locked Chassis

Some chassis are exclusive to specific factions — even if another faction meets the capability requirements, they cannot build these units:

| Chassis | Locked To |
|---------|-----------|
| Elephant Frame | Savannah Lions |
| Catapult Frame | Hill Clan |
| Galley Frame | Coral People |

### Equipment Components

Components are equipped into chassis slots to modify unit stats. Components may have capability requirements and/or research prerequisites.

**Weapons:**

| Component | ATK | RNG | Requirements | Compatible Chassis |
|-----------|-----|-----|-------------|-------------------|
| Basic Spear | +3 | — | None | infantry, heavy infantry, cavalry, naval, camel, elephant |
| Basic Bow | +2 | +1 | None | ranged, cavalry, naval |
| Blowgun | +1 | +1 | poisoncraft 4, codify_poisoncraft | ranged |
| Druidic Missiles | +4 | — | None (druid-only via recipe) | ranged |
| Mounted Archer | +1 | +1 | horsemanship 6, master_horsemanship | cavalry, heavy cavalry |
| Ship Cannon | +2 | +1 | seafaring 4, navigation 3, codify_navigation | ranged naval, galley, naval |
| Slaver Net | +1 | — | formation_warfare 4 | infantry, heavy infantry, galley |
| Pirate Collar | +1 | — | formation_warfare 4 | infantry, heavy infantry |
| Catapult Arm | +2 | +1 | fortification 4, codify_fortification | catapult |

**Armor:**

| Component | DEF | HP | Requirements | Compatible Chassis |
|-----------|-----|-----|-------------|-------------------|
| Simple Armor | +2 | — | None | infantry, heavy infantry, ranged, cavalry, naval, ranged naval, galley, camel, elephant |
| Jungle Mask | +2 | +2 | poisoncraft 5, stealth 4, codify_poisoncraft | infantry, heavy infantry |
| Frost Forge | +2 | +2 | endurance 6, master_endurance | infantry, heavy infantry, ranged, cavalry |
| Desert Forged | +3 | +3 | desert_survival 6, fortification 6, master_fortification | infantry, heavy infantry, camel |

**Training:**

| Component | ATK | DEF | HP | MOV | Requirements |
|-----------|-----|-----|-----|-----|-------------|
| Venom Rites | +1 | — | — | — | woodcraft 4, poisoncraft 3 |
| Poison Arrows | +2 | — | — | — | woodcraft 6, poisoncraft 6, codify_poisoncraft |
| Skirmish Drill | +1 | — | — | +1 | mobility 4, stealth 2 |
| Fortress Training | — | +2 | +2 | — | fortification 4, hill_fighting 4, codify_fortification |
| Shock Drill | +2 | — | — | — | formation_warfare 6, codify_formation |
| Druidic Rites | — | +2 | +2 | — | woodcraft 4 |
| Rivercraft Training | +1 | — | — | +1 | navigation 4, seafaring 3, codify_navigation |
| Cold Provisions | — | +2 | +2 | — | endurance 4, codify_endurance |
| Venom Grenades | +2 | — | — | — | poisoncraft 8, master_poisoncraft |
| War Drums | +1 | — | — | +1 | formation_warfare 6, master_formation |
| Tidal Drill | +1 | — | — | +1 | seafaring 4, navigation 4, master_navigation |
| Field Forts | — | +3 | +1 | — | fortification 8, master_fortification |
| Elephant Harness | +1 | — | +1 | — | formation_warfare 4, shock_resistance 3 |
| Boiling Oil | +1 | +3 | +2 | — | fortification 8, hill_fighting 6, master_fortification |
| Warlord Standard | +1 | — | +2 | — | horsemanship 8, formation_warfare 6, master_horsemanship + master_formation |

### Experience and Veteran Levels

Units gain XP from combat. Participating in a battle grants 5 XP; killing an enemy grants 15 additional XP; surviving a battle grants 3 XP.

| Level | XP Required | ATK Bonus | DEF Bonus | Morale Bonus |
|-------|-------------|-----------|-----------|-------------|
| Green | 0 | +0% | +0% | +0% |
| Seasoned | 15 | +10% | +10% | +5% |
| Veteran | 30 | +20% | +20% | +10% |
| Elite | 60 | +30% | +30% | +15% |

### Combat Flee Behavior

Cavalry, camel, beast, and elephant-tagged units automatically flee combat when their HP drops below 50% of maximum. This preserves remaining HP for future engagements but means they cannot hold a line at low health.

---

## Combat System

### Attack and Defense Calculation

```
Attack Strength = Base Attack × (1 + Veteran Bonus + Weapon Modifier + Flanking Bonus + Situational Modifiers)
Defense Strength = Base Defense × (1 + Terrain Modifier + Armor Modifier + Veteran Bonus + Improvement Bonus + Wall Bonus)
```

### Role Effectiveness

- **Mounted** vs **Ranged**: +50% attack
- **Melee** vs **Mounted**: −25% penalty (reduced)
- **Ranged** vs **Melee**: −25% penalty when attacked in melee range
- **Support** units: +25% damage taken from all attackers

### Weapon Effectiveness

- **Spears** vs **Cavalry**: +50% attack
- **Ranged weapons** vs **Cavalry**: −25% penalty
- **Camel units** vs **Cavalry**: +50% attack
- **Camel Scare**: camels get +30% ATK vs cavalry; cavalry get −20% ATK vs camels

### Flanking

+15% attack per adjacent allied unit surrounding the target (excluding the attacker). Six surrounding allies = +90% maximum flanking bonus.

### Siege Combat

- **Catapults** in field forts gain +40% attack bonus
- **Siege-tagged units** attacking cities gain +25% attack bonus
- Wall defense bonus = `floor(wallHP / 20)`, range 0–5

### Morale and Routing

Morale starts at 100. Morale damage = HP damage × 12. When morale drops to 25 or below, the unit routs. Routed units flee and suffer −25% attack penalty. Routed units recover +15 morale per turn when not in combat, +25 with the rally bonus. Morale rallies at 50.

Killing an enemy unit grants +8 morale (triumph bonus).

---

## Movement

### Movement Costs

Units spend movement points to enter hexes. Base movement varies by chassis (see Chassis table). Naval-only terrain (ocean) can only be entered by naval-tagged units.

### Zone of Control

Enemy units exert zone of control over adjacent hexes. Entering a hex adjacent to an enemy costs +1 additional movement point. Cavalry-tagged units ignore ZoC penalties.

---

## The War Economy

### Production

Cities generate **2 production** per turn. Villages generate **1 production** per turn. Production accumulates toward building units.

**Unit Production Costs:**

| Chassis | Cost |
|---------|------|
| Infantry | 20 |
| Ranged | 24 |
| Cavalry | 36 |
| Naval | 30 |
| Ranged Naval | 32 |
| Galley | 40 |
| Camel | 24 |
| Elephant | 36 |
| Heavy Infantry | 10 |
| Heavy Cavalry | 10 |
| Chariot | 10 |
| Catapult | 10 |

When a unit completes production, it spawns on an adjacent empty hex to the city.

### Supply

Each city generates **1 supply** per turn. Each territory hex provides **0.1 supply** per turn. Each living unit consumes **1 supply** per turn.

A supply deficit generates **+2 war exhaustion per deficit point** per turn, quickly escalating penalties.

### Village System

Villages are minor settlements that provide +1 production per turn. A village spawns with a militia infantry unit. Maximum 4 villages per city.

**Spawn conditions:** faction has at least 1 city, supply surplus (income > demand), below village cap, no village founded in last 2 rounds, and a valid passable unoccupied hex exists away from enemies.

### War Exhaustion

Exhaustion accumulates through warfare and supply deficit:

| Event | Points |
|-------|--------|
| Enemy unit killed | +5 |
| Own unit lost | +8 |
| Your city captured | +15 |
| You capture enemy city | +5 |
| Village lost | +3 |
| Supply deficit per point | +2 |
| Besieged city per turn | +2 |

Exhaustion decays by −4 per turn with no losses for 3+ turns, or −15 when territory is clear of enemies.

**Penalty thresholds:**

| Exhaustion | Production Penalty | Morale Penalty |
|-----------|-------------------|---------------|
| 0–20 | 0% | 0 |
| 21–40 | −10% | 0 |
| 41–60 | −20% | 0 |
| 61–80 | −30% | 0 |
| 81–100 | −40% | −5 |
| 100+ | −50% | −10 |

---

## Territory and Siege

### Territory Control

Cities claim territory extending 2 hexes in all directions. Territory hexes generate supply. If an enemy unit is adjacent to a territory hex, it becomes contested and produces no resources.

### Siege Mechanics

A city becomes **besieged** when 4 or more enemy units are within 2 hexes.

**Effects of besiegement:**
- City produces nothing
- Walls take **20 HP damage per turn** (10 for Coral People's capital — Coastal Walls)
- +2 war exhaustion per turn
- No healing for garrisoned units

### Walls

Cities have 100 wall HP. Wall defense bonus = `floor(wallHP / 20)`, range 0–5.

- **Repair:** +3 HP per turn when not besieged
- **Capture:** Walls reset to 50% on city capture

### City Capture

A city can be captured when walls are breached (wallHP ≤ 0) AND the city remains encircled. The capturing faction is the one with the most adjacent units.

---

## War Ecology

### Capability Growth

Factions develop capabilities through terrain exposure, force composition, and combat. These capabilities unlock access to advanced components, chassis, and hybrid recipes.

**Terrain exposure** grants capability progress each turn based on the terrain's `capabilityPressure` values.

**Force composition** also generates pressure — e.g., fielding cavalry units grants horsemanship progress.

**Combat signals** provide focused capability gains based on combat context (forest fighting → woodcraft, charges → horsemanship, etc.).

**Contact and absorption:** Factions learn from nearby enemies at 15% of their level. Eliminating a faction absorbs their capabilities at 150%.

### Hybrid Recipes

Hybrid recipes are faction-exclusive advanced unit types that combine a base chassis with specific components. Each recipe requires certain capability thresholds and may require completed research. Recipes are locked to their `nativeFaction` — other factions cannot build them even if they meet the requirements.

**All hybrid recipes:**

| Recipe | Faction | Chassis | Key Requirements |
|--------|---------|---------|-----------------|
| Healing Druids | Druid | ranged | woodcraft 6, endurance 4, codify_woodcraft |
| Druid Wizard | Druid | ranged | woodcraft 6, endurance 5, codify_woodcraft |
| Blowgun Skirmishers | Jungle | ranged | poisoncraft 4, codify_poisoncraft |
| Serpent Priest | Jungle | ranged | poisoncraft 4, woodcraft 4, codify_poisoncraft |
| Steppe Raiders | Steppe | cavalry | horsemanship 6, mobility 5, codify_horsemanship + codify_woodcraft |
| Steppe Priest | Steppe | infantry | horsemanship 4, endurance 4, codify_horsemanship |
| Fortress Archer | Hill | ranged | hill_fighting 5, fortification 6, codify_fortification |
| Catapult | Hill | catapult | fortification 4, codify_fortification |
| Slaver | Coral | heavy infantry | formation_warfare 4, codify_formation |
| Slave Galley | Coral | galley | formation 4, navigation 5, seafaring 6, codify_navigation + codify_formation |
| Camel Lancers | Desert | camel | horsemanship 5, desert_survival 6, codify_horsemanship |
| Desert Immortals | Desert | heavy infantry | desert_survival 6, fortification 4, codify_fortification |
| War Elephants | Savannah | elephant | formation_warfare 6, shock_resistance 4, master_formation |
| War Chariot | Savannah | chariot | horsemanship 3, formation_warfare 4, mobility 3, codify_horsemanship |
| River Raiders | Plains | naval | navigation 6, seafaring 5, codify_navigation |
| River Priest | Plains | ranged | navigation 4, endurance 4, codify_navigation |
| Ice Defenders | Frost | ranged | endurance 5, fortification 4, codify_endurance |
| Polar Priest | Frost | ranged | endurance 4, fortification 4, codify_endurance |

---

## Research and Technology

### The Research Tree

The **War Codification** tree has 18 nodes across 3 tiers. Research points accumulate at **4 per turn** base, plus bonuses for foreign domain exposure (+1 per domain, max +2) and capability levels (+1 per 4 levels in each required capability, max +3 each).

#### Tier 1 — Codification (requirement: capability at threshold)

| Node | Required Cap | XP Cost | Unlocks | Qualitative Effect |
|------|-------------|---------|---------|-------------------|
| Codify Woodcraft | woodcraft 4 | 45 | skirmish_drill | Forest Ambush — first strike from forest |
| Codify Horsemanship | horsemanship 2 | 42 | heavy_cavalry chassis | Forced March — cavalry ignores first ZoC |
| Codify Poisoncraft | poisoncraft 4 | 39 | poison_arrows | Poison Persistence — +1 extra poison stack on hit |
| Codify Fortification | fortification 4 | 36 | fortress_training | Rapid Entrench — dig in 1 turn instead of 2 |
| Codify Formation | formation_warfare 4 | 42 | shock_drill | Shield Wall — infantry +30% DEF vs ranged near allies |
| Codify Navigation | navigation 4 | 39 | rivercraft_training | River Crossing — no movement penalty crossing rivers |
| Codify Endurance | endurance 4 | 36 | cold_provisions | Marching Stamina — ignore first exhaustion penalty |
| Codify Desert Survival | desert_survival 4 | 39 | — | Heat Resistance — no desert movement penalty |

#### Tier 2 — Mastery (requires tier 1 + higher cap)

| Node | Prerequisite | Required Cap | XP Cost | Unlocks | Qualitative Effect |
|------|-------------|-------------|---------|---------|-------------------|
| Master Woodcraft | codify_woodcraft | woodcraft 8 | 66 | druidic_rites | Canopy Cover — ranged +30% DEF in forest/jungle |
| Master Horsemanship | codify_horsemanship | horsemanship 6 | 66 | mounted_archer | Hit and Run — cavalry attack then retreat |
| Master Poisoncraft | codify_poisoncraft | poisoncraft 8 | 66 | venom_grenades | Contaminate Terrain — poisoned kills contaminate hex |
| Master Fortification | codify_fortification | fortification 8 | 72 | field_forts | ZoC Aura — fortified units project ZoC |
| Master Formation | codify_formation | formation_warfare 6 | 72 | war_drums | Stampede 2 — elephant knockback 2 hexes |
| Master Navigation | codify_navigation | navigation 8 | 66 | tidal_drill | Amphibious Assault — naval attack coastal hexes |
| Master Endurance | codify_endurance | endurance 8 | 60 | frost_forge | Winter Campaign — no tundra movement penalty |

#### Tier 3 — Synergies (requires two tier 2 masters)

| Node | Prerequisites | Required Cap | XP Cost | Unlocks | Qualitative Effect |
|------|--------------|-------------|---------|---------|-------------------|
| Poison Phalanx | master_poisoncraft + master_fortification | poisoncraft 10, fortification 10 | 105 | poison_spears recipe | Toxic Bulwark — adjacent enemies take 1 poison/turn |
| Amphibious Fortress | master_navigation + master_fortification | navigation 10, fortification 10 | 105 | coastal_fortress recipe | Tidal Walls — coastal cities +50% defense |
| Eternal March | master_formation + master_endurance | formation 10, endurance 10 | 105 | — | Undying — units below 20% HP gain +50% DEF |

---

## The Turn Sequence

### Turn Flow

1. **Turn Start:** Advance to next faction; reset unit moves and status; apply healing
2. **Ecology Phase:** Terrain exposure, force composition pressure, capability growth, hybrid recipe unlocking
3. **Economy Phase:** Production and supply income; war exhaustion penalties
4. **Production Phase:** Progress unit construction; complete units
5. **Village Phase:** Check village spawn conditions
6. **Research Phase:** Accumulate research points; progress active node
7. **Action Phase:** Units move, attack, fortify
8. **Siege Phase:** Apply wall damage to besieged cities; check captures

### Unit Healing

| Location | HP Recovered per Turn |
|----------|----------------------|
| City garrison (non-besieged) | 5 |
| Adjacent to friendly city | 3 |
| In village | 2 |
| In field | 1 |

Faction and terrain bonuses (e.g., Druid healing, Frost regeneration) add to these rates.

### Victory Conditions

The game continues until one faction remains or the turn limit is reached. A faction is alive if it has at least one living unit or one non-besieged city. If the turn limit is reached, the faction with the most living units wins by score.

---

*War-Civ II v2: Where conflict drives civilization evolution.*
