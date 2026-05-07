# War-Civ V2 — Complete Unit Balance Audit

**Last Updated:** 2026-05-06 (Post Balance Pass — 3 Cycles + Wizard Buff)
**Verified Against:** chassis.json, components.json, civilizations.json, signatureAbilities.json, ability-domains.json, veteran-levels.json, combatSystem.ts, weaponEffectiveness.ts, roleEffectiveness.ts

This document maps every unit's attack, defense, HP, movement, range, and special abilities for the purpose of faction balance evaluation. All stats are derived from actual source code and JSON content files—not design intent or placeholder values.

---

## Table of Contents

1. [Stat Computation & Combat Mechanics](#stat-computation--combat-mechanics)
2. [Weapon & Role Effectiveness Tables](#weapon--role-effectiveness-tables)
3. [Veteran Progression](#veteran-progression)
4. [Per-Faction Unit Sheets](#per-faction-unit-sheets)
5. [Summon Comparison Matrix](#summon-comparison-matrix)
6. [Hybrid Units (Mid/Late Game)](#hybrid-units-midlate-game)
7. [Balance Anomalies & Flags](#balance-anomalies--flags)

---

## Stat Computation & Combat Mechanics

### How Unit Stats Are Built

All unit stats are computed as: **base chassis stats + sum of component bonuses**.

**Formula** (from `src/design/calculatePrototypeStats.ts`):
```
unit.stats = chassis.baseStats + Σ(component.bonuses)
  where:
    - chassis provides: baseHp, baseAttack, baseDefense, baseMoves, baseRange (or default 1)
    - components add: attackBonus, defenseBonus, hpBonus, movesBonus, rangeBonus (all optional)
    - inline unit config may override: rangeBonus, movesBonus
```

**Minimums enforced:**
- HP ≥ 1
- Attack ≥ 0
- Defense ≥ 0
- Moves ≥ 1
- Range ≥ 1

### Combat Resolution

**Damage formula** (from `src/systems/combatSystem.ts:84–215`):

```
// Phase 1: Calculate base stats with veterancy
attackStat = prototype.derivedStats.attack × (1 + veteranBonus)
defenseStat = prototype.derivedStats.defense × (1 + terrainMod + improvementBonus + veteranBonus + situationalDefMod)

// Phase 2: Calculate modifiers
roleModifier = getRoleEffectiveness(attackerRole, defenderRole)
weaponModifier = getWeaponEffectiveness(weaponTags, defenderMovementClass)

// Phase 3: Compose attack strength (additive then multiplicative)
baseMultiplier = desperateMultiplier + roleModifier + weaponModifier + situationalModifiers + stealthBonus
positionalMultiplier = (1 + flankingBonus) × (1 + rearAttackBonus)
attackStrength = round(attackStat × baseMultiplier × positionalMultiplier)

// Phase 4: Compose defense strength
defenseStrength = round(defenseStat × (1 + braceDefenseBonus) × (1 - accuracyDebuff) × (1 - armorPenetration))

// Phase 5: Resolve damage
damage = max(3, attackStrength - floor(defenseStrength / 3))
damage_final = damage × random[0.9, 1.1]  // ±10% variance

// Phase 6: Retaliation (melee only; ranged attacks take NO retaliation)
retaliation = max(1, floor(defenderDefense × 0.6) - attackerAttack)
retaliation_final = retaliation × random[0.9, 1.1]

// Exception: Cavalry charge kill (isCharge && cavalry tag && defender killed)
// → attacker takes 0 retaliation damage
```

**Key rules:**
- **Ranged units** (role == 'ranged' OR ranged weapon tag) take **zero retaliation** damage
- **Cavalry units** on charge that kill the defender take **zero retaliation** damage
- **Desperate units** (routed morale) apply a penalty multiplier to their attack
- **Minimum damage** is 3 for initial hit, 1 for retaliation

---

## Weapon & Role Effectiveness Tables

### Weapon Effectiveness (vs. Movement Class)

Source: `src/data/weaponEffectiveness.ts`

| Weapon Tag | Target Movement Class | Attack Modifier |
|---|---|---|
| `spear` | cavalry | **+0.50** |
| `spear` | camel | **+0.35** |
| `spear` | beast | **+0.15** |
| `ranged` | cavalry | **−0.25** |
| `ranged` | camel | **−0.15** |
| `ranged` | beast | **0** |

**Note:** `getWeaponTags()` only collects tags from weapon-slot components, not chassis tags. The `camel` chassis tag does NOT qualify as a weapon tag. Camel Warriors get +0.50 from spear (weapon tag) + +0.30 from situational camel bonus (preview.ts:146-149) = **+0.80 total vs cavalry**, not +1.00.

### Role Effectiveness (Attacker vs. Defender Role)

Source: `src/data/roleEffectiveness.ts`

| Attacker Role | Defender Role | Attack Modifier |
|---|---|---|
| `mounted` | `ranged` | **+0.50** |
| `melee` | `mounted` | **−0.25** |
| `ranged` | `melee` | **−0.25** |
| `melee` | `support` | **+0.25** |
| `ranged` | `support` | **+0.25** |
| `mounted` | `support` | **+0.25** |

---

## Veteran Progression

Source: `src/content/base/veteran-levels.json`

| Level | XP Threshold | Attack Bonus | Defense Bonus | Morale Bonus | HP Bonus |
|---|---|---|---|---|---|
| Green | 0 | **0%** | **0%** | **0%** | 0 |
| Seasoned | 30 | **+10%** | **+10%** | **+5%** | — |
| Veteran | 60 | **+20%** | **+20%** | **+10%** | — |
| Elite | 120 | **+30%** | **+30%** | **+15%** | — |

---

## Per-Faction Unit Sheets

### Format Guide

For each starting unit, stats are notated as: **ATK / DEF / HP** — **Moves** — **Range** (melee units show Range 1 but take/deal melee combat). Cost shown in production units. Special mechanics noted per unit.

**Components** listed as `role_or_chassis + weapon + armor + training/utility`.

---

## 🟢 JUNGLE CLANS

**Terrain Bias:** Jungle (woodcraft 4, poisoncraft 3, stealth 3, endurance 2)
**Native Domain:** Venom — On-hit poison debuff (1 damage/turn for 3 turns, applied on melee hit)
**Faction Mechanic:** `venomDamagePerTurn: 1` (passive poison damage in jungle terrain)

### Starting Units

#### Venom Spearman
- **Chassis + Components:** infantry_frame + basic_spear + venom_rites
- **Stats:** 6 ATK / 2 DEF / 9 HP — 2 moves — 1 range (melee)
- **Cost:** 20
- **Tags:** jungle, poison, beast
- **Role:** Melee
- **Stat Breakdown:**
  - Base: infantry (2/2/9/2/1)
  - Spear: +3 ATK
  - Venom rites: +1 ATK (total: 2+3+1=6)

#### Venom Archer
- **Chassis + Components:** ranged_frame + basic_bow + poison_arrows
- **Stats:** 5 ATK / 1 DEF / 8 HP — 2 moves — 2 range
- **Cost:** 23
- **Tags:** jungle, poison
- **Role:** Ranged (no retaliation taken)
- **Stat Breakdown:**
  - Base: ranged (1/1/8/2/1)
  - Bow: +2 ATK, +1 range
  - Poison arrows: +2 ATK (total: 1+2+2=5, range: 1+1=2)

### Signature Summon: Serpent God

- **Chassis:** serpent_frame (summon-only, no slots)
- **Stats:** 5 ATK / 2 DEF / 18 HP — 3 moves — — (melee)
- **Summon Terrain:** jungle, swamp
- **Duration:** 5 turns
- **Cooldown:** 5 turns
- **Special:** Beast summon (never flees, dies when timer expires)

### Summary

**Strengths:**
- Venom Archer (ATK 5, cost 23) is one of the strongest tier-0 ranged units
- Poison domain enables attrition kills over time
- Jungle terrain bias makes them dominant in jungle interiors

**Weaknesses:**
- Zero defensive capability on both units (DEF 1–2)
- Slow (2-move units); no mounted options
- Poison damage of 1 per turn is negligible early game

---

## 🌿 DRUID CIRCLE

**Terrain Bias:** Forest (woodcraft 4, endurance 3, stealth 2, fortification 1)
**Native Domain:** Nature Healing — Aura effect: self +2 HP/turn, adjacent allies +1 HP/turn, radius 1
**Faction Mechanic:** Passive healing in forests; rally units after combat

### Starting Units

#### Druid Guardian
- **Chassis + Components:** infantry_frame + basic_spear + druidic_rites
- **Stats:** 5 ATK / 4 DEF / 11 HP — 2 moves — 1 range (melee)
- **Cost:** 20
- **Tags:** woodcraft, endurance, healing, forest
- **Role:** Melee
- **Stat Breakdown:**
  - Base: infantry (2/2/9/2/1)
  - Spear: +3 ATK
  - Druidic rites: +2 DEF, +2 HP (total: ATK 2+3=5, DEF 2+2=4, HP 9+2=11)

#### Druid Archer
- **Chassis + Components:** ranged_frame + basic_bow + nature_binding
- **Stats:** 3 ATK / 2 DEF / 10 HP — 2 moves — 2 range
- **Cost:** 20
- **Tags:** ranged, druid, nature
- **Role:** Ranged (no retaliation taken)
- **Stat Breakdown:**
  - Base: ranged (1/1/8/2/1)
  - Bow: +2 ATK, +1 range
  - Nature binding: +1 DEF, +2 HP (total: ATK 1+2=3, DEF 1+1=2, HP 8+2=10, range 1+1=2)
- **Thematic twist:** Higher HP (10) than other archers — sustain theme

### Signature Summon: Treefolk

- **Chassis:** treefolk_frame (summon-only, no slots)
- **Stats:** 3 ATK / 6 DEF / 20 HP — 2 moves — 1 range (melee)
- **Summon Terrain:** forest, jungle, city
- **Duration:** 7 turns
- **Cooldown:** 4 turns
- **Special:** Beast summon; highest defense of all summons (DEF 6); nature healing domain applies passively; **fully heals on forest/jungle tiles at end of turn** (healingSystem.ts:220-223)

### Late-Game Unit: Druid Wizard

- **Chassis + Components:** ranged_frame + druidic_missiles + druidic_rites
- **Stats:** **8 ATK** / 3 DEF / 10 HP — 2 moves — **2 range**
- **Cost:** 50
- **Requires:** 3 learned domains
- **Tier:** Late
- **Tags:** druid, magic, nature, ranged, glass_cannon
- **Stat Breakdown:**
  - Base: ranged (1/1/8/2/1)
  - Druidic missiles: +7 ATK, +1 range
  - Druidic rites: +2 DEF, +2 HP (total: ATK 1+7=8, DEF 1+2=3, HP 8+2=10, range 1+1=2)
- **Highest ranged ATK in the game** — no other faction has a magic-based ranged unit

### Summary

**Strengths:**
- Druid Guardian (ATK 5, DEF 4, HP 11, cost 20) is the tankiest early melee unit
- Treefolk is the tankiest summon (DEF 6, HP 20, full heal on forest/jungle, 7-turn duration)
- Nature healing domain creates a defensive aura — excellent for sustained armies
- **Druid Wizard (ATK 8, range 2) is the most powerful ranged attacker in the game** — unique magic-based damage

**Weaknesses:**
- Lowest starting offensive output (Archer ATK 3, Guardian ATK 5)
- Zero mobility; all units have 2 moves
- Healing is useless if you can't survive engagement; aura requires adjacency (radius 1)
- Druid Wizard is fragile (DEF 3, HP 10) and expensive (cost 50)

---

## 🐴 STEPPE RIDERS

**Terrain Bias:** Plains (horsemanship 4, charge 4, mobility 4, woodcraft 2, stealth 2)
**Native Domain:** Skirmish Pursuit — On combat end: if dealing more damage than received, gain +2 bonus damage (press the advantage)
**Faction Mechanic:** `hitAndRun: true`

### Starting Units

#### Horse Archer
- **Chassis + Components:** ranged_frame + basic_bow + skirmish_drill + light_mount
- **Stats:** 4 ATK / 1 DEF / 8 HP — 4 moves — 2 range
- **Cost:** 23
- **Tags:** cavalry, mounted, ranged, skirmish
- **Role:** Ranged mounted unit (no retaliation taken)
- **Stat Breakdown:**
  - Base: ranged (1/1/8/2/1)
  - Bow: +2 ATK, +1 range
  - Skirmish drill: +1 ATK, +1 moves
  - Light mount: +1 moves (total: ATK 1+2+1=4, DEF 1, HP 8, moves 2+1+1=4, range 1+1=2)
- **⚠️ Critical weakness:** DEF 1 — dies in a single hit from most melee units. Spear units get +0.5 modifier vs cavalry tag.

#### Steppe Warrior
- **Chassis + Components:** infantry_frame + basic_spear + skirmish_drill
- **Stats:** 6 ATK / 2 DEF / 9 HP — 3 moves — 1 range (melee)
- **Cost:** **15** (reduced from 17 — enables cheaper cavalry swarm)
- **Tags:** skirmish
- **Role:** Melee
- **Stat Breakdown:**
  - Base: infantry (2/2/9/2/1)
  - Spear: +3 ATK
  - Skirmish drill: +1 ATK, +1 moves (total: ATK 2+3+1=6, DEF 2, HP 9, moves 2+1=3)
- **Advantage:** **Cheapest infantry unit in the game** (cost 15)

### Signature Summon: Warlord

- **Chassis:** warlord_frame (summon-only, no slots)
- **Stats:** 5 ATK / 3 DEF / 20 HP — 3 moves — — (melee)
- **Summon Terrain:** plains, savannah
- **Duration:** 5 turns
- **Cooldown:** 5 turns
- **Special:** Beast summon; aura tag; applies hit-and-run mechanic

### Summary

**Strengths:**
- Horse Archer (4 moves) is the fastest starting unit in the game
- Skirmish Pursuit domain rewards winning exchanges (+2 bonus damage when ahead)
- Hit-and-run mechanic enables harassment tactics
- Steppe Warrior is the cheapest infantry (cost 15)

**Weaknesses:**
- Horse Archer (DEF 1) is the squishiest unit in the game — dies to a single moderate hit
- Cavalry tag means spear units deal +0.5 modifier — hard-countered by spear factions
- Melee is weak (DEF 2 on Warrior), ranged is too slow at range 2 vs catapult (range 3)

---

## 🏔️ HILL ENGINEERS

**Terrain Bias:** Hill (hill_fighting 4, fortification 4, formation_warfare 2)
**Native Domain:** Fortress Discipline — Aura effect: adjacent friendly units get **+30% defense**, radius 1
**Starting Learned Domain:** `fortification` (faction begins game with one domain already learned)
**Faction Mechanic:** Hill engineering bonus on hills/chokes; defense bonuses on all rough terrain

### Starting Units

#### Hill Defender
- **Chassis + Components:** infantry_frame + basic_spear + fortress_training
- **Stats:** 5 ATK / 4 DEF / **13 HP** — 2 moves — 1 range (melee)
- **Cost:** 21
- **Tags:** fortress, defensive, hill_fighting
- **Role:** Melee
- **Stat Breakdown:**
  - Base: infantry (2/2/9/2/1)
  - Spear: +3 ATK
  - Fortress training: +2 DEF, +4 HP (total: ATK 2+3=5, DEF 2+2=4, HP 9+4=13)
- **Highest HP of any starting infantry** (13 HP) — fortress tank identity

#### Hill Archer
- **Chassis + Components:** ranged_frame + basic_bow + hill_leather
- **Stats:** 3 ATK / **4 DEF** / 8 HP — 2 moves — 2 range
- **Cost:** 20
- **Tags:** ranged, fortress
- **Role:** Ranged (no retaliation taken)
- **Stat Breakdown:**
  - Base: ranged (1/1/8/2/1)
  - Bow: +2 ATK, +1 range
  - Hill leather: +3 DEF (total: ATK 1+2=3, DEF 1+3=4, HP 8, range 1+1=2)
- **Thematic twist:** Highest DEF of any ranged unit (4) — fortress theme

### Signature Summon: Siege Golem

- **Chassis:** siege_golem_frame (summon-only, no slots)
- **Stats:** 6 ATK / 5 DEF / 22 HP — 2 moves — — (melee)
- **Summon Terrain:** hill, city
- **Duration:** 7 turns
- **Cooldown:** 4 turns
- **Special:** Beast summon; second-highest combined ATK+DEF (11 total); after Polar Bear, has best HP at creation time

### Hybrid Unit: Catapult

- **Chassis + Components:** catapult_frame + catapult_arm + fortress_training
- **Stats:** 6 ATK / 3 DEF / **10 HP** — 2 moves — 3 range
- **Cost:** 50 production
- **Requires:** 3 learned domains (reduced from 4)
- **Tier:** Late
- **Tags:** ranged, siege, no_fort_build
- **Stat Breakdown:**
  - Base: catapult (4/1/6/2/3)
  - Catapult arm: +2 ATK
  - Fortress training: +2 DEF, +4 HP (total: ATK 4+2=6, DEF 1+2=3, HP 6+4=10)
- **Special:** Cannot build forts (despite fortification tag); range 3 makes it a high-tier ranged threat

### Summary

**Strengths:**
- Hill Defender (ATK 5, DEF 4, **HP 13**) is the tankiest starting infantry
- Fortress Discipline domain (+30% DEF aura) is a force multiplier for army stacks
- Starting with fortification domain pre-learned is a unique advantage
- Defense bonuses on all rough terrain (not just hills) — hill: 0.15, other rough: 0.10
- Siege Golem (6/5/22) combines high HP with high defense
- Late-game Catapult (ATK 6, range 3) is a siege powerhouse

**Weaknesses:**
- Zero mobility (all units 2 moves, no mounts)
- Weak economy — slow production scaling
- Heavily punished by armies that refuse to fight on rough terrain

---

## 🏴‍☠️ PIRATE LORDS

**Terrain Bias:** Coast (seafaring 5, navigation 4, mobility 3, formation_warfare 2)
**Native Domain:** Slaving — Captured units are converted to slave units under your command
**Starting Learned Domain:** `seafaring` (faction begins game with one domain already learned)
**Faction Mechanics:**
- `tidalAssaultBonus: +0.2` (coastal attack modifier)
- `greedyBonus: 25` (villages give +25 resources when captured)
- `greedyCaptureChance: 50%` / `greedyNonCombatCaptureChance: 40%` (capture mechanics)
- `wallDefenseMultiplier: 2` (walls count double for defense)
- `villageCaptureDestroys: true` (villages destroyed when captured, not taken)

### Starting Units

#### Boarding Party
- **Chassis + Components:** infantry_frame + pirate_collar + simple_armor
- **Stats:** 3 ATK / 4 DEF / 9 HP — 2 moves — 1 range (melee)
- **Cost:** 20
- **Tags:** capture, formation, pirate
- **Role:** Melee capture unit
- **Stat Breakdown:**
  - Base: infantry (2/2/9/2/1)
  - Pirate collar: +1 ATK
  - Simple armor: +2 DEF (total: ATK 2+1=3, DEF 2+2=4, HP 9)
- **Special:** Capture mechanic — 50% chance to capture enemy unit when enemy HP ≤ 50%, cooldown 2 turns

#### Pistol Gunner
- **Chassis + Components:** ranged_frame + pistol + simple_armor
- **Stats:** 6 ATK / 3 DEF / 8 HP — 2 moves — 1 range
- **Cost:** 23
- **Tags:** ranged, gun, pirate
- **Role:** Ranged (no retaliation taken)
- **Stat Breakdown:**
  - Base: ranged (1/1/8/2/1)
  - Pistol: +5 ATK, +0 range bonus (stays at range 1)
  - Simple armor: +2 DEF (total: ATK 1+5=6, DEF 1+2=3, HP 8, range 1)
- **Critical mechanic:** Range 1 (point-blank) but classified ranged (no retaliation). Highest point-blank ATK outside Druid Wizard.

#### Slave Galley
- **Chassis + Components:** naval_frame + slaver_net + simple_armor
- **Stats:** 2 ATK / 3 DEF / 8 HP — 3 moves — 1 range (naval melee)
- **Cost:** 18
- **Tags:** naval, capture, pirate
- **Role:** Naval capture unit
- **Stat Breakdown:**
  - Base: naval (1/1/8/3/1)
  - Slaver net: +1 ATK
  - Simple armor: +2 DEF (total: ATK 1+1=2, DEF 1+2=3, HP 8, moves 3)
- **Special:** Capture mechanic — 50% chance to capture enemy unit when enemy HP ≤ 50%, cooldown 2 turns
- **Weakness:** Extremely weak offensively (ATK 2); useful only as a capture platform or transport

### Signature Summon: Galley

- **Chassis:** galley_frame (summon-only, no slots)
- **Stats:** 3 ATK / 2 DEF / 14 HP — 5 moves — 3 range
- **Summon Terrain:** coast, ocean, city
- **Duration:** 5 turns
- **Cooldown:** 5 turns
- **Special:** Beast summon; **5 moves** (unmatched mobility), range 3, transport capacity 4 units
- **Summon access:** Priest tag on Slaver hybrid (mid-tier, minLearnedDomains 2)

### Summary

**Strengths:**
- Only faction with **3 starting units** (unique 3-unit opening)
- Pistol Gunner (ATK 6, no retaliation) is devastating in close combat
- Greedy mechanics (village capture, +25 bonus) enable resource snowball
- Galley summon (5 moves, range 3, transport 4) is unmatched for naval mobility
- Starting with seafaring domain pre-learned

**Weaknesses:**
- Slave Galley (ATK 2) is almost useless in combat — barely stronger than settler units
- All units tied to water/coast — weak deep inland (severe attrition on non-coast terrain)
- Boarding Party and Slave Galley overlap functionally (both capture, both tanky, neither deals damage)

---

## 🐪 DESERT NOMADS

**Terrain Bias:** Desert (horsemanship 3, desert_survival 3, mobility 3)
**Native Domain:** Camel Adaptation — Ignores all terrain movement penalties
**Faction Mechanics:**
- `endlessStride: true` (desert terrain movement ignored for all units)
- `desertSwarmThreshold: 3` (swarm bonus triggers with 3+ units)
- `desertSwarmAttackBonus: +1` (cumulative attack bonus when swarming)
- `desertSwarmDefenseMultiplier: 1.1` (+10% defense multiplier when swarming)
- **Passive attack bonus:** +0.10 on desert terrain (desert_logistics)

### Starting Units

#### Desert Archer
- **Chassis + Components:** ranged_frame + basic_bow + desert_silk
- **Stats:** 3 ATK / 2 DEF / 8 HP — **3 moves** — 2 range
- **Cost:** 20
- **Tags:** ranged, desert
- **Role:** Ranged (no retaliation taken)
- **Stat Breakdown:**
  - Base: ranged (1/1/8/2/1)
  - Bow: +2 ATK, +1 range
  - Desert silk: +1 DEF, +1 moves (total: ATK 1+2=3, DEF 1+1=2, HP 8, moves 2+1=3, range 1+1=2)
- **Thematic twist:** 3 moves — fastest archer in the game (desert mobility theme)

#### Camel Warrior
- **Chassis + Components:** camel_frame + basic_spear + desert_forged
- **Stats:** 6 ATK / 5 DEF / 12 HP — 3 moves — 1 range (melee)
- **Cost:** 23
- **Tags:** camel, mounted, desert, shock
- **Role:** Melee mounted
- **Stat Breakdown:**
  - Base: camel (2/2/9/3/1)
  - Spear: +3 ATK
  - Desert forged: +3 DEF, +3 HP, +1 ATK (total: ATK 2+3+1=6, DEF 2+3=5, HP 9+3=12)
- **Anti-cavalry interaction:** Camel Warrior gets:
  - `spear` weapon tag: +0.50 vs cavalry (from weaponEffectiveness.ts)
  - `camel` situational bonus: +0.30 vs cavalry (from preview.ts:146-149)
  - **Combined: +0.80 modifier vs cavalry** (NOT +1.00 — the `camel` chassis tag does not count as a weapon tag)
- **Advantage:** Best HP:cost ratio of any starting melee (12 HP, DEF 5, ATK 6, cost 23)

### Signature Summon: Desert Immortals

- **Chassis:** desert_immortals_frame (summon-only, no slots)
- **Stats:** **4 ATK** / 3 DEF / 12 HP — 3 moves — — (melee)
- **Summon Terrain:** desert, city
- **Duration:** 5 turns
- **Cooldown:** 5 turns
- **Special:** Beast summon; **self-heal passive** (hp regenerates per turn)
- **Summon access:** Priest tag on Camel Lancers hybrid (mid-tier, minLearnedDomains 2)
- **ATK raised from 2 to 4** — now a viable offensive summon

### Summary

**Strengths:**
- Camel Warrior (6/5/12, cost 23) has the best HP:cost ratio of early melee units
- Anti-cavalry (+0.80 modifier) hard-counters Steppe Riders
- Endless stride + camel adaptation = terrain-agnostic army; no terrain penalties
- Desert swarm mechanic provides cumulative bonuses at army density (3+ units)
- Desert Archer has 3 moves — fastest ranged starting unit
- Desert Immortals now a viable summon (ATK 4, self-heal)

**Weaknesses:**
- Desert Archer has lower DEF (2) than most archers
- Desert Swarm requires army density (3+ units in range 2) — hard to maintain when spread thin
- Only useful in desert-heavy maps; combat bonuses only apply on desert terrain
- Camel Warrior is a "mid" tier chassis requiring 2 learned domains — progression anomaly for starting unit

---

## 🦁 SAVANNAH LIONS

**Terrain Bias:** Savannah (formation_warfare 4, mobility 3, shock_resistance 3, horsemanship 2)
**Native Domain:** Charge — Strike-first on charge; if defender dies, attacker takes 0 retaliation damage
**Faction Mechanic:** `stampedeBonus: +0.3` (additive attack bonus on charge momentum)

### Starting Units

#### Shock Infantry
- **Chassis + Components:** infantry_frame + basic_spear + shock_drill
- **Stats:** 7 ATK / **3 DEF** / 9 HP — 2 moves — 1 range (melee)
- **Cost:** 21
- **Tags:** shock, formation
- **Role:** Melee
- **Stat Breakdown:**
  - Base: infantry (2/2/9/2/1)
  - Spear: +3 ATK
  - Shock drill: +2 ATK, +1 DEF (total: ATK 2+3+2=7, DEF 2+1=3, HP 9)
- **Advantage:** **Highest starting melee ATK in the game** (7 ATK)
- **DEF buffed from 2 to 3** — still a glass cannon but can survive one more hit

#### Assegai Impi
- **Chassis + Components:** ranged_frame + basic_bow + simple_armor (+ inline bonuses: rangeBonus +1, movesBonus +1)
- **Stats:** 3 ATK / 3 DEF / 8 HP — **3 moves** — **3 range**
- **Cost:** 20
- **Tags:** ranged, ignore_terrain
- **Role:** Ranged (no retaliation taken)
- **Stat Breakdown:**
  - Base: ranged (1/1/8/2/1)
  - Bow: +2 ATK, +1 range
  - Simple armor: +2 DEF
  - Inline bonuses: +1 moves, +1 range
  - (total: ATK 1+2=3, DEF 1+2=3, HP 8, moves 2+1=3, range 1+1+1=3)
- **Double-count bug FIXED:** Previously 5 moves / 4 range due to movesBonus being applied in both `assemblePrototype.ts` and `buildMvpScenario.ts`. Now correctly 3 moves / 3 range.
- **Advantage:** Range 3 on a starting unit is still very strong; `ignore_terrain` tag enables flanking

### Signature Summon: War Elephant

- **Chassis:** war_elephant_frame (summon-only, no slots)
- **Stats:** 4 ATK / 2 DEF / 14 HP — 3 moves — — (melee)
- **Summon Terrain:** savannah, plains, city
- **Duration:** 5 turns
- **Cooldown:** 5 turns
- **Special:** Beast summon; charge + trample tags; knockback on charge
- **Note:** War Chariot lost priest tag — Savannah Lions need a different unit for summon access

### Summary

**Strengths:**
- Shock Infantry (ATK 7) is the **highest starting melee attack in the game**
- Charge domain (strike-first, no retaliation on kill) enables devastating alpha strikes
- Stampede bonus (+0.3) amplifies charge momentum
- Assegai Impi (range 3, ignore_terrain) enables unconventional tactics

**Weaknesses:**
- Both units are glass cannons — DEF 3 on Shock Infantry is still below average
- Pure charge faction; must engage in melee where they take maximum retaliation
- War Elephant (ATK 4) is mid-tier summon offensively
- Lost priest tag on War Chariot — summon access needs alternative path

---

## 🌊 RIVER PEOPLE

**Terrain Bias:** River (navigation 4, seafaring 4, mobility 3, woodcraft 2)
**Native Domain:** River Stealth — Unit is stealthed; first attack from stealth deals **+50% damage**
**Faction Mechanic:** `sneakAttackBonus: 0.10` (was disabled at 0 — now provides ambush bonus)
**Special:** Amphibious assault mechanic

### Starting Units

#### River Infantry
- **Chassis + Components:** infantry_frame + basic_spear + rivercraft_training
- **Stats:** 6 ATK / 2 DEF / 9 HP — 3 moves — 1 range (melee)
- **Cost:** 20
- **Tags:** river, amphibious, mobility
- **Role:** Melee
- **Stat Breakdown:**
  - Base: infantry (2/2/9/2/1)
  - Spear: +3 ATK
  - Rivercraft training: +1 ATK, +1 moves (total: ATK 2+3+1=6, DEF 2, HP 9, moves 2+1=3)
- **Advantage:** Amphibious mobility (can move through rivers)

#### River Galley
- **Chassis + Components:** naval_frame + basic_spear + simple_armor
- **Stats:** 4 ATK / 3 DEF / 8 HP — 3 moves — 1 range (naval melee)
- **Cost:** 16
- **Tags:** naval, amphibious
- **Role:** Naval melee
- **Stat Breakdown:**
  - Base: naval (1/1/8/3/1)
  - Spear: +3 ATK
  - Simple armor: +2 DEF (total: ATK 1+3=4, DEF 1+2=3, HP 8, moves 3)
- **Advantage:** **Cheapest naval unit** (cost 16); provides real offensive output (ATK 4)

### Signature Summon: Ancient Alligator

- **Chassis:** alligator_frame (summon-only, no slots)
- **Stats:** 5 ATK / 2 DEF / 15 HP — 3 moves — — (melee)
- **Summon Terrain:** river, jungle, swamp
- **Duration:** 5 turns
- **Cooldown:** 5 turns
- **Special:** Beast summon; river stealth domain applies
- **Summon access:** River Priest hybrid (mid-tier, minLearnedDomains **3** — raised from 2 to slow priest spam)

### Summary

**Strengths:**
- River Galley (ATK 4, cost 16) is the cheapest unit with real offensive output
- River Infantry (ATK 6, 3 moves, amphibious) enables unconventional tactics
- River Stealth domain (+50% first-attack damage) enables devastating ambushes
- Amphibious mechanics allow army repositioning through waterways
- sneakAttackBonus now active (0.10) — signature ability works

**Weaknesses:**
- No passive defense bonus from faction identity
- Weak economy on non-river terrain (+0.02 production on river only)
- Ancient Alligator (ATK 5) is mid-tier summon; DEF 2 is low
- Weak inland — requires river corridors or coastal access for effectiveness

---

## ❄️ ARCTIC WARDENS (Frost Wardens)

**Terrain Bias:** Tundra (fortification 4, hill_fighting 2, endurance 4)
**Native Domain:** Heavy Hitter — **50% armor piercing** (reduces enemy defense by 50%); bonus damage to fortified targets
**Faction Mechanic:** `cold_hardened_growth: true` (economy bonus on tundra only)

### Starting Units

#### Frost Guard
- **Chassis + Components:** infantry_frame + basic_spear + frost_forge
- **Stats:** 6 ATK / 4 DEF / 11 HP — 2 moves — 1 range (melee)
- **Cost:** **25** (increased from 23)
- **Tags:** frost, endurance, armor
- **Role:** Melee
- **Stat Breakdown:**
  - Base: infantry (2/2/9/2/1)
  - Spear: +3 ATK
  - Frost forge: +1 ATK, +2 DEF, +2 HP (total: ATK 2+3+1=6, DEF 2+2=4, HP 9+2=11)

#### Ice Archer
- **Chassis + Components:** ranged_frame + basic_bow + cold_provisions
- **Stats:** 3 ATK / 3 DEF / 10 HP — 2 moves — 2 range
- **Cost:** **18** (increased from 15 — reduces archer spam)
- **Tags:** frost, ranged, endurance
- **Role:** Ranged (no retaliation taken)
- **Stat Breakdown:**
  - Base: ranged (1/1/8/2/1)
  - Bow: +2 ATK, +1 range
  - Cold provisions: +2 DEF, +2 HP (total: ATK 1+2=3, DEF 1+2=3, HP 8+2=10, range 1+1=2)
- **Advantage:** Higher HP than most archers (10 HP); cost still below average (18)

### Signature Summon: Polar Bear

- **Chassis:** polar_bear_frame (summon-only, no slots)
- **Stats:** 7 ATK / 3 DEF / 25 HP — 3 moves — — (melee)
- **Summon Terrain:** tundra, city
- **Duration:** 7 turns
- **Cooldown:** **5 turns** (increased from 3 — matches other top summons)
- **Special:** Beast summon; **highest ATK (7)**, **highest HP (25)**

### Hybrid Units (Examples)

**Polar Priest**
- **Chassis + Components:** heavy_infantry_frame + basic_spear + frost_forge + cold_provisions
- **Stats:** 7 ATK / 7 DEF / 19 HP — 2 moves — 1 range
- **Cost:** 54
- **Requires:** 3 learned domains
- **Tier:** Late
- **Note:** **Highest combined DEF (7) and tied highest ATK (7) of any buildable unit**; tankiest buildable unit

### Summary

**Strengths:**
- Frost Guard (ATK 6, DEF 4, HP 11, cost 25) is tanky early infantry
- Polar Bear (7/3/25, cooldown 5) is the most powerful summon
- Heavy Hitter domain (50% armor piercing) hard-counters defensive tactics
- Polar Priest (7/7/19) is the tankiest buildable unit
- Economy bonus on tundra (+0.10 production)

**Weaknesses:**
- No mobility; all units have 2 moves except summons
- Economy bonus limited to tundra only (was all poor terrain — scoped for correctness)
- Cold hardened growth is slow — takes many turns to materialize
- Higher unit costs (Frost Guard 25, Ice Archer 18) slow early production

---

## Summon Comparison Matrix

| Faction | Summon | ATK | DEF | HP | Moves | Range | Terrain Types | Duration | Cooldown | Special |
|---|---|---|---|---|---|---|---|---|---|---|
| Frost Wardens | Polar Bear | **7** | 3 | **25** | 3 | — | tundra, city | 7 | 5 | Best HP and ATK |
| Hill Clan | Siege Golem | 6 | **5** | 22 | 2 | — | hill, city | 7 | 4 | Best DEF |
| Druid Circle | Treefolk | 3 | **6** | 20 | 2 | 1 | forest, jungle, city | 7 | 4 | **Full heal on forest/jungle**, passive healing |
| Steppe Clan | Warlord | 5 | 3 | 20 | 3 | — | plains, savannah | 5 | 5 | Aura tag |
| Jungle Clan | Serpent God | 5 | 2 | 18 | 3 | — | jungle, swamp | 5 | 5 | Poison native domain |
| River People | Ancient Alligator | 5 | 2 | 15 | 3 | — | river, jungle, swamp | 5 | 5 | Stealth native domain |
| Savannah Lions | War Elephant | 4 | 2 | 14 | 3 | — | savannah, plains, city | 5 | 5 | Charge + trample |
| Coral People | Galley | 3 | 2 | 14 | **5** | **3** | coast, ocean, city | 5 | 5 | Best mobility, transport 4 |
| Desert Nomads | Desert Immortals | **4** | 3 | 12 | 3 | — | desert, city | 5 | 5 | Self-heal (ATK raised from 2) |

---

## Hybrid Units (Mid/Late Game Unlocks)

Source: `src/content/base/hybrid-recipes.json`

### Tier: Mid (2 learned domains required)

| Name | Chassis + Components | ATK | DEF | HP | Moves | Range | Cost | Tags | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Healing Druids | ranged + basic_bow + druidic_rites | 3 | 3 | 10 | 2 | 2 | 31 | priest, druid | Druid Circle priest |
| Blowgun Skirmishers | ranged + blowgun + simple_armor | 3 | 3 | 8 | 2 | 2 | 27 | poison, stealth | Jungle ranged |
| Fortress Archer | ranged + basic_bow + fortress_training | 3 | 4 | **12** | 2 | 2 | 31 | fortress | Hill ranged |
| Lancers | cavalry + basic_spear + skirmish_drill | 6 | 2 | 13 | 4 | 1 | 38 | cavalry | Fast melee cavalry |
| Camel Lancers | camel + basic_spear + desert_forged + skirmish_drill | **8** | 5 | 12 | 3 | 1 | 35 | camel, **priest** | Highest melee ATK, Desert priest |
| Ice Defenders | ranged + basic_bow + frost_forge + cold_provisions | 3 | 7 | 14 | 2 | 2 | 38 | frost | Tanky ranged |
| River Priest | ranged + basic_bow + simple_armor + cold_provisions | 3 | 3 | 10 | 2 | 2 | 31 | river, priest | River People priest (minDomains **3**) |
| Steppe Priests | infantry + basic_spear + simple_armor + druidic_rites | 5 | 3 | 11 | 2 | 1 | 35 | priest | Steppe healer |
| War Chariot | chariot + chariot_bow + chariot_armor + chariot_drill | 7 | 3 | 9 | **5** | 2 | 43 | cavalry, shock | Fast ranged (priest tag **removed**) |
| Slaver | heavy_infantry + slaver_net + simple_armor + musket | 3 | 7 | 16 | 2 | 2 | 43 | capture, **priest** | Pirate priest |

### Tier: Late (3+ learned domains required)

| Name | Chassis + Components | ATK | DEF | HP | Moves | Range | Cost | Tags | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Druid Wizard | ranged + druidic_missiles + druidic_rites | **8** | 3 | 10 | 2 | **2** | 50 | magic, glass_cannon | **Highest ranged ATK in the game** |
| Serpent Priest | ranged + druidic_missiles + venom_grenades + jungle_mask | **7** | 3 | 13 | 3 | 1 | 54 | poison | High ATK ranged |
| Polar Priest | heavy_infantry + basic_spear + frost_forge + cold_provisions | **7** | **7** | 19 | 2 | 1 | 54 | frost | Tankiest buildable unit |
| Catapult | catapult + catapult_arm + fortress_training | 6 | 3 | **10** | 2 | 3 | 50 | siege | Siege ranged (minDomains **3**) |
| War Elephants | elephant + basic_spear + elephant_harness | 4 | 2 | 15 | 3 | 1 | 61 | elephant | Heavy melee |
| Slave Galley | galley + slaver_net + simple_armor | 4 | 4 | 16 | 5 | 3 | 39 | naval, capture | Naval transport capture |
| River Raiders | naval + ship_cannon + simple_armor + rivercraft_training | 5 | 3 | 8 | 4 | 3 | 50 | river | Fast naval ranged |
| Hill Engineer | infantry + basic_spear + fortress_training + simple_armor | 5 | 4 | **13** | 2 | 1 | 42 | fortress, priest | Hill priest (minDomains **3**) |

---

## Balance Anomalies & Flags

### ✅ Resolved Issues

#### ~~1. Frost Wardens — Potential Over-Tuning~~ (RESOLVED)
- Polar Bear cooldown increased 3 → 5
- Ice Archer cost increased 15 → 18
- Frost Guard cost increased 23 → 25
- Economy bonus scoped to tundra only (was all poor terrain)

#### ~~2. Desert Nomads Camel Warrior — Anti-Cavalry Stacking~~ (CORRECTED)
- Audit correction: anti-cavalry bonus is **+0.80** not +1.00
- The `camel` chassis tag does NOT count as a weapon tag in combat resolution
- Actual: spear (+0.50 weapon tag) + camel situational (+0.30 from preview.ts) = +0.80

#### ~~3. Assegai Impi — Stat Anomalies~~ (RESOLVED)
- **Double-count bug fixed:** `buildMvpScenario.ts` and `productionSystem.ts` no longer add `prototype.movesBonus` on top of `derivedStats.moves`
- Assegai Impi now correctly has 3 moves and 3 range (was 5 moves, 4 range)

#### ~~4. River People — Faction Bonus Disabled~~ (RESOLVED)
- `sneakAttackBonus` changed from 0 to 0.10
- Paired with River Priest minLearnedDomains 2 → 3 as compensating nerf

#### ~~5. Desert Immortals — Weakest Summon Offensively~~ (RESOLVED)
- ATK raised from 2 to 4
- Summon now accessible via priest tag on Camel Lancers

#### ~~6. Generic Archers — Identical Across Factions~~ (RESOLVED)
- Druid Archer: nature_binding → DEF 2, HP 10 (sustain theme)
- Hill Archer: hill_leather → DEF 4 (fortress theme)
- Desert Archer: desert_silk → DEF 2, 3 moves (mobility theme)

#### ~~7. Three Factions — No Summon Access~~ (RESOLVED)
- Priest tags added: Slaver (Pirate), Camel Lancers (Desert), War Chariot (Savannah — later removed)
- Savannah Lions lost priest tag on War Chariot in Cycle 3 (too powerful as combat+summon unit)

---

### 🟡 Medium-Priority Flags

#### 1. Pistol Gunner — Melee-Range Ranged Unit
- **Pistol has `rangeBonus: 0`**, so range stays at 1 (point-blank/melee)
- **No retaliation taken** (ranged unit classification)
- **ATK 6** is the second-highest point-blank damage output (after Druid Wizard ATK 8)
- Unique mechanic: ranged without range
- **Assessment:** Fair at cost 23. The point-blank limitation is a real constraint.

#### 2. Pirate Lords — Three Starting Units
- Only faction with 3 starting units (20+23+18 = 61 total cost)
- **Slave Galley (ATK 2)** is nearly useless offensively — only serves as capture platform
- Net offensive output remains low despite unit count advantage

#### 3. Hill Clan + Coral People — Pre-Seeded Domains
- Both factions start with 1 learned domain already unlocked
- **Hill Clan:** fortification (Fortress +30% aura)
- **Coral People:** seafaring (Galley bonuses)
- Gives both factions a turn-0 mechanical advantage

---

### 🟢 Confirmed Balanced Elements

- **Veteran progression** (0%, +10%, +20%, +30%) provides meaningful power scaling
- **Weapon effectiveness table** (spear vs cavalry +0.50, ranged vs cavalry -0.25) creates valid counter-play
- **Ranged units take no retaliation** is a fundamental and well-executed mechanic
- **Summon cooldowns** (3–7 turns) prevent game-breaking spam
- **Component slot system** (weapon + armor + training) provides meaningful build variety
- **Capture mechanics** (50% chance, cooldown 2) are gated enough to not dominate early game
- **Druid Wizard** (ATK 8, range 2, cost 50) provides Druid Circle a unique late-game power spike

---

## Ranged Unit Comparison (Post Balance Pass)

| Unit | ATK | DEF | HP | Moves | Range | Cost | Faction | Unique? |
|------|-----|-----|-----|-------|-------|------|---------|---------|
| **Druid Wizard** | **8** | 3 | 10 | 2 | 2 | 50 | Druid Circle | **Magic — highest ATK** |
| Pistol Gunner | 6 | 3 | 8 | 2 | 1 | 23 | Pirate Lords | Point-blank, no retaliation |
| Catapult | 6 | 3 | 10 | 2 | 3 | 50 | Hill Engineers | Siege, range 3 |
| Venom Archer | 5 | 1 | 8 | 2 | 2 | 23 | Jungle Clans | Poison |
| Ice Archer | 3 | 3 | 10 | 2 | 2 | 18 | Frost Wardens | Cheap + durable |
| Druid Archer | 3 | 2 | 10 | 2 | 2 | 20 | Druid Circle | Sustain (HP 10) |
| Hill Archer | 3 | **4** | 8 | 2 | 2 | 20 | Hill Engineers | Fortress (DEF 4) |
| Assegai Impi | 3 | 3 | 8 | 3 | 3 | 20 | Savannah Lions | Range 3 + ignore terrain |
| Desert Archer | 3 | 2 | 8 | **3** | 2 | 20 | Desert Nomads | Fastest archer |
| Horse Archer | 4 | 1 | 8 | **4** | 2 | 23 | Steppe Riders | Fastest unit |

---

## Data Integrity Notes

- All stats verified against JSON source files as of 2026-05-06 (post 3 balance cycles)
- Combat formulas extracted from combatSystem.ts:84–215
- Weapon/role effectiveness tables are canonical (no fallback assumptions)
- Veteran bonuses apply as multiplicative factors: `stat × (1 + veteranBonus%)`
- Damage formula uses floor division on defense: `max(minDamage, attackStrength - floor(defenseStrength / 3))`
- Variance range: ±10% (0.9–1.1 multiplier)
- Retaliation minimum: 1 damage; initial hit minimum: 3 damage
- `getWeaponTags()` only collects tags from weapon-slot components, not chassis tags
