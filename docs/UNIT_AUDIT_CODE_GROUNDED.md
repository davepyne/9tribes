# Unit Audit — War-Civ V2 (from code, not docs)

All stats computed via `calculatePrototypeStats()` (chassis base + component bonuses). Formula: `stat = chassis.base + sum(component.bonuses)`.

---

## 1. Jungle Clans (`jungle_clan`) — Native Domain: Venom

### Starting Units
| Unit | Chassis | Components | HP | ATK | DEF | MOV | RNG | Cost | Supply | Special |
|------|---------|-----------|----|-----|-----|-----|-----|------|--------|---------|
| **Venom Spearman** | infantry_frame | basic_spear + venom_rites | 9 | 6 | 2 | 2 | 1 | 20 | 1 | Poison-tagged; applies venom stacks on hit |
| **Venom Archer** | ranged_frame | basic_bow + poison_arrows | 8 | 5 | 1 | 2 | 2 | 23 | 1 | Poison arrows; higher ranged poison output |

### Unlockable (Hybrid Recipes)
| Unit | Tier | Chassis | Components | HP | ATK | DEF | MOV | RNG | Cost | Special |
|------|------|---------|-----------|----|-----|-----|-----|-----|------|---------|
| **Blowgun Skirmishers** | Mid | ranged_frame | blowgun + simple_armor | 8 | 2 | 3 | 2 | 2 | 27 | Stealth + poison; glass skirmisher |
| **Serpent Priest** | Late | ranged_frame | druidic_missiles + venom_grenades + jungle_mask | 10 | 10 | 3 | 2 | 2 | 54 | Glass cannon; AoE poison; stealth; jungle_mask armor |

### Signature Summon
| Unit | HP | ATK | DEF | MOV | RNG | Supply | Duration | CD | Special |
|------|----|-----|-----|-----|-----|--------|----------|-----|---------|
| **Serpent God** | 18 | 5 | 2 | 3 | 1 | 2.5 | 5 turns | 5 | Applies 3 poison dmg/turn (other jungle units: faction `venomDamagePerTurn` = 1); terrain: jungle/swamp |

### Faction Passive: Jungle Poison
- `venomDamagePerTurn: 1` — poison-tagged units deal 1 damage per stack per turn
- Domain Venom T1: extra poison stack on hit; T2: contaminates hex on kill; T3: +50% poison damage

---

## 2. Druid Circle (`druid_circle`) — Native Domain: Nature Healing

### Starting Units
| Unit | Chassis | Components | HP | ATK | DEF | MOV | RNG | Cost | Supply |
|------|---------|-----------|----|-----|-----|-----|-----|------|--------|
| **Druid Guardian** | infantry_frame | basic_spear + druidic_rites | 11 | 5 | 4 | 2 | 1 | 20 | 1 |
| **Druid Archer** | ranged_frame | basic_bow + nature_binding | 10 | 3 | 2 | 2 | 2 | 20 | 1 |

### Unlockable
| Unit | Tier | Chassis | Components | HP | ATK | DEF | MOV | RNG | Cost | Special |
|------|------|---------|-----------|----|-----|-----|-----|-----|------|---------|
| **Healing Druids** | Mid | ranged_frame | basic_bow + druidic_rites | 10 | 3 | 3 | 2 | 2 | 31 | Healing aura; forest synergy |
| **Druid Wizard** | Late | ranged_frame | druidic_missiles + druidic_rites | 10 | 8 | 3 | 2 | 2 | 50 | Glass cannon; high ranged output; healing + nature tags |

### Signature Summon
| Unit | HP | ATK | DEF | MOV | RNG | Supply | Duration | CD | Special |
|------|----|-----|-----|-----|-----|--------|----------|-----|---------|
| **Treefolk** | 20 | 3 | 6 | 2 | 1 | 2 | 7 turns | 4 | Highest DEF in game; tank wall; terrain: forest/jungle/city |

### Faction Passive: Healing Druids
- Domain Nature Healing T1: +1 HP regen/turn for all units + first-strike in forests; T2: +30% ranged defense in forest/jungle; T3: healing aura range doubled (2 hexes)

---

## 3. Steppe Riders (`steppe_clan`) — Native Domain: Hit & Run

### Starting Units
| Unit | Chassis | Components | HP | ATK | DEF | MOV | RNG | Cost | Supply |
|------|---------|-----------|----|-----|-----|-----|-----|------|--------|
| **Horse Archer** | ranged_frame | basic_bow + skirmish_drill + light_mount | 8 | 4 | 1 | 4 | 2 | 23 | 1 |
| **Steppe Warrior** | infantry_frame | basic_spear + skirmish_drill | 9 | 6 | 2 | 3 | 1 | 15 | 1 |

### Unlockable
| Unit | Tier | Chassis | Components | HP | ATK | DEF | MOV | RNG | Cost | Special |
|------|------|---------|-----------|----|-----|-----|-----|-----|------|---------|
| **Lancers** | Mid | cavalry_frame | basic_spear + skirmish_drill | 13 | 6 | 2 | 4 | 2 | 38 | Cavalry + skirmish; fast flanker |
| **Steppe Priest** | Late | infantry_frame | basic_spear + simple_armor + druidic_rites | 11 | 5 | 6 | 2 | 1 | 35 | Healing + durable infantry |

### Signature Summon
| Unit | HP | ATK | DEF | MOV | RNG | Supply | Duration | CD | Special |
|------|----|-----|-----|-----|-----|--------|----------|-----|---------|
| **Warlord** | 20 | 5 | 3 | 3 | 1 | 2.5 | 5 turns | 5 | Aura warlord tag; cavalry; terrain: plains/savannah |

### Faction Passive: Hit & Run
- Domain Hit & Run T1: reduces war exhaustion by 1/turn; T2: cavalry can attack then retreat same turn; T3: hit-run units ignore ZoC (native: all units can attack-then-retreat)
- `hitAndRun: true` on faction signature

---

## 4. Hill Engineers (`hill_clan`) — Native Domain: Fortress

### Starting Units
| Unit | Chassis | Components | HP | ATK | DEF | MOV | RNG | Cost | Supply |
|------|---------|-----------|----|-----|-----|-----|-----|------|--------|
| **Hill Defender** | infantry_frame | basic_spear + fortress_training | 13 | 5 | 4 | 2 | 1 | 21 | 1 |
| **Hill Archer** | ranged_frame | basic_bow + hill_leather | 8 | 3 | 4 | 2 | 2 | 20 | 1 |

### Unlockable
| Unit | Tier | Chassis | Components | HP | ATK | DEF | MOV | RNG | Cost | Special |
|------|------|---------|-----------|----|-----|-----|-----|-----|------|---------|
| **Hill Engineer** | Mid | infantry_frame | basic_spear + fortress_training + simple_armor | 13 | 5 | 6 | 2 | 1 | 42 | Fortress wall; engineer tag |
| **Fortress Archer** | Late | ranged_frame | basic_bow + fortress_training | 12 | 3 | 3 | 2 | 2 | 31 | Ranged + fortress durability |
| **Catapult** | Late | catapult_frame | catapult_arm + fortress_training | 10 | 6 | 3 | 2 | 3 | 50 | Siege; range 3; no_fort_build tag |

### Signature Summon
| Unit | HP | ATK | DEF | MOV | RNG | Supply | Duration | CD | Special |
|------|----|-----|-----|-----|-----|--------|----------|-----|---------|
| **Siege Golem** | 22 | 6 | 5 | 2 | 1 | 2.5 | 7 turns | 4 | Highest raw stats of any summon; siege + fortress tags; terrain: hill/city |

### Faction Passive: Hill Engineering
- Starts with `fortification` domain already learned
- Domain Fortress T1: +15% defense adjacent to ally; T2: infantry/ranged build field forts + ZoC projection; T3: aura defense +25%
- Bulwark mechanic: fortress-tagged units grant defense bonus to adjacent allies (in `combat-action/preview.ts:166`)

---

## 5. Pirate Lords (`coral_people`) — Native Domain: Slaving

### Starting Units
| Unit | Chassis | Components | HP | ATK | DEF | MOV | RNG | Cost | Supply |
|------|---------|-----------|----|-----|-----|-----|-----|------|--------|
| **Boarding Party** | infantry_frame | pirate_collar + simple_armor | 9 | 3 | 4 | 2 | 1 | 20 | 1 |
| **Pistol Gunner** | ranged_frame | pistol + simple_armor | 8 | 6 | 3 | 2 | 1 | 23 | 1 |
| **Slave Trireme** | naval_frame | slaver_net + simple_armor | 8 | 2 | 3 | 3 | 1 | 18 | 1.25 |

### Unlockable
| Unit | Tier | Chassis | Components | HP | ATK | DEF | MOV | RNG | Cost | Special |
|------|------|---------|-----------|----|-----|-----|-----|-----|------|---------|
| **Slaver** | Mid | heavy_infantry_frame | slaver_net + simple_armor + musket | 12 | 7 | 5 | 2 | 2 | 43 | Capture on kill + musket ranged |
| **Slave Galley** | Late | galley_frame | slaver_net + simple_armor | 14 | 4 | 4 | 5 | 3 | 39 | Naval ranged; transport capacity 4; capture ability |

### Signature Summon
| Unit | HP | ATK | DEF | MOV | RNG | Supply | Duration | CD | Special |
|------|----|-----|-----|-----|-----|--------|----------|-----|---------|
| **Galley** | 14 | 3 | 2 | 5 | 3 | 2 | 5 turns | 5 | Naval ranged + transport tag; terrain: coast/ocean/city |

### Faction Passive: Greedy
- `greedyBonus: 25` (gold bonus on capture/raid)
- `captureChance: 0.5`, `captureHpFraction: 0.5`, `captureCooldown: 3`
- `nonCombatCaptureChance: 0.4`
- `wallDefenseMultiplier: 2` — doubled wall defense bonus for Pirate cities
- `tidalAssaultBonus: 0.2` — naval units gain +20% attack on water-to-land assaults
- `villageCaptureDestroys: true` — villages are destroyed, not kept
- Starts with `seafaring` domain learned
- Domain Slaving T1: +15% vs wounded; T2: 15% capture-on-retreat; T3: auto-capture below 25% HP

---

## 6. Desert Nomads (`desert_nomads`) — Native Domain: Camel Adaptation

### Starting Units
| Unit | Chassis | Components | HP | ATK | DEF | MOV | RNG | Cost | Supply |
|------|---------|-----------|----|-----|-----|-----|-----|------|--------|
| **Desert Archer** | ranged_frame | basic_bow + desert_silk | 8 | 3 | 2 | 3 | 2 | 20 | 1 |
| **Camel Warrior** | camel_frame | basic_spear + desert_forged | 12 | 6 | 5 | 3 | 1 | 23 | 1.5 |

### Unlockable
| Unit | Tier | Chassis | Components | HP | ATK | DEF | MOV | RNG | Cost | Special |
|------|------|---------|-----------|----|-----|-----|-----|-----|------|---------|
| **Camel Lancers** | Mid | camel_frame | basic_spear + desert_forged + skirmish_drill | 12 | 7 | 5 | 4 | 1 | 35 | Fast camel shock |
| **Desert Immortals** | Late | camel_frame | desert_forged + desert_regen | 18 | 4 | 5 | 2 | 1 | 35 | Self-heal (desert_regen); -1 moves from recipe penalty; tanky |

### Faction Passive: Desert Logistics
- `endlessStride: true` — no movement penalty in desert terrain (`movementSystem.ts:136`)
- `desertSwarmThreshold: 3`, `desertSwarmAttackBonus: 1`, `desertSwarmDefenseMultiplier: 1.1` — when 3+ desert/camel-tagged allies nearby, +1 ATK and +10% DEF
- Camel vs cavalry: +30% ATK when camel attacks cavalry; -20% ATK when non-camel attacks camel cavalry
- Domain Camel Adaptation T1: no desert movement penalty; T2: permanent stealth in desert; T3: +20% defense in rough terrain

---

## 7. Savannah Lions (`savannah_lions`) — Native Domain: Charge

### Starting Units
| Unit | Chassis | Components | HP | ATK | DEF | MOV | RNG | Cost | Supply |
|------|---------|-----------|----|-----|-----|-----|-----|------|--------|
| **Shock Infantry** | infantry_frame | basic_spear + shock_drill | 9 | 7 | 3 | 2 | 1 | 21 | 1 |
| **Assegai Impi** | ranged_frame | basic_bow + simple_armor | 8 | 3 | 3 | 3 | 2 | 20 | 1 |

### Unlockable
| Unit | Tier | Chassis | Components | HP | ATK | DEF | MOV | RNG | Cost | Special |
|------|------|---------|-----------|----|-----|-----|-----|-----|------|---------|
| **War Chariot** | Mid | chariot_frame | chariot_bow + chariot_armor + chariot_drill | 9 | 7 | 3 | 5 | 2 | 43 | Fastest unit in game (MOV 5); shock + ranged |
| **War Elephants** | Late | elephant_frame | basic_spear + elephant_harness | 15 | 7 | 2 | 3 | 1 | 61 | Stampede; knockback; siege-breaker |

### Signature Summon
| Unit | HP | ATK | DEF | MOV | RNG | Supply | Duration | CD | Special |
|------|----|-----|-----|-----|-----|--------|----------|-----|---------|
| **War Elephant** | 14 | 4 | 2 | 3 | 1 | 2.5 | 5 turns | 5 | Charge + trample tags; terrain: savannah/plains/city |

### Faction Passive: Charge Momentum
- `stampedeBonus: 0.3` — elephants/chariots gain +30% ATK on charge attacks (knockback triggered)
- Domain Charge T1: no cooldown on first charge; T2: elephant knockback 2 hexes; T3: +50% charge damage vs routed enemies

---

## 8. River People (`river_people`) — Native Domain: River Stealth

### Starting Units
| Unit | Chassis | Components | HP | ATK | DEF | MOV | RNG | Cost | Supply |
|------|---------|-----------|----|-----|-----|-----|-----|------|--------|
| **River Infantry** | infantry_frame | basic_spear + rivercraft_training | 9 | 6 | 2 | 3 | 1 | 20 | 1 |
| **River Galley** | naval_frame | basic_spear + simple_armor | 8 | 4 | 3 | 3 | 1 | 16 | 1.25 |

### Unlockable
| Unit | Tier | Chassis | Components | HP | ATK | DEF | MOV | RNG | Cost | Special |
|------|------|---------|-----------|----|-----|-----|-----|-----|------|---------|
| **River Priest** | Mid | ranged_frame | basic_bow + simple_armor + cold_provisions | 10 | 3 | 5 | 2 | 2 | 31 | Healing + endurance; ranged support |
| **River Raiders** | Late | naval_frame | ship_cannon + simple_armor + rivercraft_training | 8 | 4 | 3 | 4 | 1 | 50 | Cannon-armed naval; amphibious; fast |

### Signature Summon
| Unit | HP | ATK | DEF | MOV | RNG | Supply | Duration | CD | Special |
|------|----|-----|-----|-----|-----|--------|----------|-----|---------|
| **Ancient Alligator** | 15 | 5 | 2 | 3 | 1 | 2.5 | 5 turns | 5 | Beast; river/jungle/swamp terrain |

### Faction Passive: River Assault
- `sneakAttackBonus: 0.10` — +10% ATK when attacking from river or swamp terrain
- Domain River Stealth T1: +1 movement in rough terrain; T2: re-enter stealth after attacking; T3: reveal stealthed enemies within 2 hexes

---

## 9. Arctic Wardens (`frost_wardens`) — Native Domain: Heavy Hitter

### Starting Units
| Unit | Chassis | Components | HP | ATK | DEF | MOV | RNG | Cost | Supply |
|------|---------|-----------|----|-----|-----|-----|-----|------|--------|
| **Frost Guard** | infantry_frame | basic_spear + frost_forge | 11 | 6 | 4 | 2 | 1 | 25 | 1 |
| **Ice Archer** | ranged_frame | basic_bow + cold_provisions | 10 | 3 | 3 | 2 | 2 | 18 | 1 |

### Unlockable
| Unit | Tier | Chassis | Components | HP | ATK | DEF | MOV | RNG | Cost | Special |
|------|------|---------|-----------|----|-----|-----|-----|-----|------|---------|
| **Frost Reaver** | Mid | ranged_frame | basic_bow + frost_forge + cold_provisions | 12 | 4 | 5 | 2 | 2 | 38 | Tanky ranged; endurance stacking |
| **Polar Priest** | Late | heavy_infantry_frame | basic_spear + frost_forge + cold_provisions | 16 | 6 | 7 | 2 | 1 | 54 | Highest DEF of any non-summon unit; healing; priest |

### Signature Summon
| Unit | HP | ATK | DEF | MOV | RNG | Supply | Duration | CD | Special |
|------|----|-----|-----|-----|-----|--------|----------|-----|---------|
| **Polar Bear** | 25 | 7 | 3 | 3 | 1 | 2.5 | 7 turns | 5 | Highest HP of any unit in the game; beast; terrain: tundra/city |

### Faction Passive: Cold Hardened Growth
- Domain Heavy Hitter T1: +20% damage vs fortified/bracing enemies; T2: reflect 25% damage back; T3: ignore 50% armor + cannot be displaced
- Best growth from poor land (tundra) — economic passive

---

## Cross-Cutting Observations

**Pirate Lords** are the only faction with 3 starting units (others have 2). They're also the only faction with capture mechanics (`pirate_collar`, `slaver_net`).

**Assegai Impi** (Savannah Lions) is the only starting unit with a civ-level `movesBonus` (+1), giving it 3 moves — exceptional for a starter ranged unit. Range bonus was removed; now derives range 2 from chassis + bow only.

**Desert Immortals** exist only as a late-game camel_frame recipe (HP 18, DEF 5, self-heal, MOV 2 due to -1 recipe penalty). The former summon variant was removed.

**Camel anti-cavalry bonus** (+30% ATK, -20% ATK for non-camel vs camel) is hardcoded in `combat-action/preview.ts:146-153`, not in any component or chassis definition.
