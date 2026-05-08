from __future__ import annotations

import argparse
import json
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class TrialConfig:
    label: str
    kind: str
    path: tuple[str, ...]
    low: float
    high: float


KNOBS = [
    # =========================================================================
    # TERRAIN YIELDS — all 12 terrain types
    # Each controls productionYield (0.0–1.0 fraction of base output).
    # Ranges centered on current value ±~50% with reasonable bounds.
    # =========================================================================
    TrialConfig("plains_yield",   "float", ("terrainYields", "plains", "productionYield"),   0.05, 0.25),
    TrialConfig("forest_yield",   "float", ("terrainYields", "forest", "productionYield"),   0.03, 0.15),
    TrialConfig("jungle_yield",   "float", ("terrainYields", "jungle", "productionYield"),   0.03, 0.15),
    TrialConfig("hill_yield",     "float", ("terrainYields", "hill", "productionYield"),     0.07, 0.28),
    TrialConfig("desert_yield",   "float", ("terrainYields", "desert", "productionYield"),   0.02, 0.10),
    TrialConfig("tundra_yield",   "float", ("terrainYields", "tundra", "productionYield"),   0.03, 0.12),
    TrialConfig("savannah_yield", "float", ("terrainYields", "savannah", "productionYield"), 0.06, 0.22),
    TrialConfig("river_yield",    "float", ("terrainYields", "river", "productionYield"),    0.06, 0.22),
    TrialConfig("swamp_yield",    "float", ("terrainYields", "swamp", "productionYield"),    0.03, 0.12),
    TrialConfig("ocean_yield",    "float", ("terrainYields", "ocean", "productionYield"),    0.01, 0.08),
    TrialConfig("coast_yield",    "float", ("terrainYields", "coast", "productionYield"),    0.07, 0.25),
    TrialConfig("oasis_yield",    "float", ("terrainYields", "oasis", "productionYield"),    0.05, 0.18),

    # =========================================================================
    # CHASSIS STATS — all 12 producible chassis x core stats (HP, ATK, DEF, MOVES)
    # Each range is +/-2-4 from the current base value for incremental tuning.
    # Summon-only chassis (polar_bear, serpent, alligator, warlord, siege_golem,
    # treefolk, war_elephant) are tuned via SIGNATURE ABILITY SUMMON dials below.
    # =========================================================================

    # --- 1. Infantry Frame (melee, 2-move, backbone of every army) ---
    TrialConfig("infantry_hp",     "int", ("chassis", "infantry_frame", "baseHp"),     7, 11),
    TrialConfig("infantry_attack", "int", ("chassis", "infantry_frame", "baseAttack"), 1, 4),
    TrialConfig("infantry_defense","int", ("chassis", "infantry_frame", "baseDefense"),1, 4),
    TrialConfig("infantry_moves",  "int", ("chassis", "infantry_frame", "baseMoves"),  1, 3),
    TrialConfig("infantry_supply", "float", ("chassis", "infantry_frame", "supplyCost"), 0.75, 1.25),

    # --- 2. Ranged Frame (ranged, 2-move, skirmish line) ---
    TrialConfig("ranged_hp",     "int", ("chassis", "ranged_frame", "baseHp"),     6, 10),
    TrialConfig("ranged_attack", "int", ("chassis", "ranged_frame", "baseAttack"), 1, 3),
    TrialConfig("ranged_defense","int", ("chassis", "ranged_frame", "baseDefense"),1, 3),
    TrialConfig("ranged_moves",  "int", ("chassis", "ranged_frame", "baseMoves"),  1, 3),
    TrialConfig("ranged_range",  "int", ("chassis", "ranged_frame", "baseRange"),  1, 2),
    TrialConfig("ranged_supply", "float", ("chassis", "ranged_frame", "supplyCost"), 0.75, 1.25),

    # --- 3. Cavalry Frame (mounted, 3-move, mid-tier) ---
    TrialConfig("cavalry_hp",     "int", ("chassis", "cavalry_frame", "baseHp"),     10, 16),
    TrialConfig("cavalry_attack", "int", ("chassis", "cavalry_frame", "baseAttack"), 1, 4),
    TrialConfig("cavalry_defense","int", ("chassis", "cavalry_frame", "baseDefense"),1, 4),
    TrialConfig("cavalry_moves",  "int", ("chassis", "cavalry_frame", "baseMoves"),  2, 4),
    TrialConfig("cavalry_supply", "float", ("chassis", "cavalry_frame", "supplyCost"), 1.25, 1.75),

    # --- 4. Naval Frame (melee, 3-move, basic ship) ---
    TrialConfig("naval_hp",     "int", ("chassis", "naval_frame", "baseHp"),     6, 11),
    TrialConfig("naval_attack", "int", ("chassis", "naval_frame", "baseAttack"), 1, 3),
    TrialConfig("naval_defense","int", ("chassis", "naval_frame", "baseDefense"),1, 3),
    TrialConfig("naval_moves",  "int", ("chassis", "naval_frame", "baseMoves"),  2, 4),
    TrialConfig("naval_supply", "float", ("chassis", "naval_frame", "supplyCost"), 1.0, 1.5),

    # --- 5. Camel Frame (mounted, 3-move, desert nomad signature) ---
    TrialConfig("camel_hp",     "int", ("chassis", "camel_frame", "baseHp"),     7, 12),
    TrialConfig("camel_attack", "int", ("chassis", "camel_frame", "baseAttack"), 1, 4),
    TrialConfig("camel_defense","int", ("chassis", "camel_frame", "baseDefense"),1, 4),
    TrialConfig("camel_moves",  "int", ("chassis", "camel_frame", "baseMoves"),  2, 4),
    TrialConfig("camel_supply", "float", ("chassis", "camel_frame", "supplyCost"), 1.25, 1.75),

    # --- 6. Elephant Frame (mounted, 3-move, savannah shock) ---
    TrialConfig("elephant_hp",     "int", ("chassis", "elephant_frame", "baseHp"),     11, 17),
    TrialConfig("elephant_attack", "int", ("chassis", "elephant_frame", "baseAttack"),  2, 5),
    TrialConfig("elephant_defense","int", ("chassis", "elephant_frame", "baseDefense"), 1, 4),
    TrialConfig("elephant_moves",  "int", ("chassis", "elephant_frame", "baseMoves"),   2, 4),
    TrialConfig("elephant_supply", "float", ("chassis", "elephant_frame", "supplyCost"), 1.75, 2.25),

    # --- 7. Heavy Cavalry (mounted, 3-move, late-game hammer) ---
    TrialConfig("heavy_cav_hp",     "int", ("chassis", "heavy_cavalry", "baseHp"),     12, 18),
    TrialConfig("heavy_cav_attack", "int", ("chassis", "heavy_cavalry", "baseAttack"),  2, 5),
    TrialConfig("heavy_cav_defense","int", ("chassis", "heavy_cavalry", "baseDefense"), 2, 5),
    TrialConfig("heavy_cav_moves",  "int", ("chassis", "heavy_cavalry", "baseMoves"),   2, 4),
    TrialConfig("heavy_cav_supply", "float", ("chassis", "heavy_cavalry", "supplyCost"), 1.5, 2.0),

    # --- 8. Heavy Infantry Frame (melee, 2-move, anvil) ---
    TrialConfig("heavy_inf_hp",     "int", ("chassis", "heavy_infantry_frame", "baseHp"),     9, 15),
    TrialConfig("heavy_inf_attack", "int", ("chassis", "heavy_infantry_frame", "baseAttack"), 1, 4),
    TrialConfig("heavy_inf_defense","int", ("chassis", "heavy_infantry_frame", "baseDefense"), 2, 5),
    TrialConfig("heavy_inf_moves",  "int", ("chassis", "heavy_infantry_frame", "baseMoves"),   1, 3),
    TrialConfig("heavy_inf_supply", "float", ("chassis", "heavy_infantry_frame", "supplyCost"), 1.25, 1.75),

    # --- 9. Chariot Frame (mounted, 4-move, fast shock) ---
    TrialConfig("chariot_hp",     "int", ("chassis", "chariot_frame", "baseHp"),     6, 11),
    TrialConfig("chariot_attack", "int", ("chassis", "chariot_frame", "baseAttack"), 2, 5),
    TrialConfig("chariot_defense","int", ("chassis", "chariot_frame", "baseDefense"),1, 3),
    TrialConfig("chariot_moves",  "int", ("chassis", "chariot_frame", "baseMoves"),  3, 5),
    TrialConfig("chariot_supply", "float", ("chassis", "chariot_frame", "supplyCost"), 1.25, 1.75),

    # --- 10. Catapult Frame (ranged, 2-move, hill clan siege) ---
    TrialConfig("catapult_hp",     "int", ("chassis", "catapult_frame", "baseHp"),     4, 9),
    TrialConfig("catapult_attack", "int", ("chassis", "catapult_frame", "baseAttack"), 2, 6),
    TrialConfig("catapult_defense","int", ("chassis", "catapult_frame", "baseDefense"),0, 3),
    TrialConfig("catapult_moves",  "int", ("chassis", "catapult_frame", "baseMoves"),  1, 3),
    TrialConfig("catapult_range",  "int", ("chassis", "catapult_frame", "baseRange"),  2, 5),
    TrialConfig("catapult_supply", "float", ("chassis", "catapult_frame", "supplyCost"), 1.75, 2.25),

    # --- 11. Ranged Warship (ranged, 3-move, naval skirmish) ---
    TrialConfig("ranged_naval_hp",     "int", ("chassis", "ranged_naval_frame", "baseHp"),     6, 11),
    TrialConfig("ranged_naval_attack", "int", ("chassis", "ranged_naval_frame", "baseAttack"), 1, 4),
    TrialConfig("ranged_naval_defense","int", ("chassis", "ranged_naval_frame", "baseDefense"),1, 3),
    TrialConfig("ranged_naval_moves",  "int", ("chassis", "ranged_naval_frame", "baseMoves"),  2, 4),
    TrialConfig("ranged_naval_range",  "int", ("chassis", "ranged_naval_frame", "baseRange"),  2, 4),
    TrialConfig("ranged_naval_supply", "float", ("chassis", "ranged_naval_frame", "supplyCost"), 1.25, 1.75),

    # --- 12. Galley (ranged, 5-move, coral pirate capital ship) ---
    TrialConfig("galley_hp",     "int", ("chassis", "galley_frame", "baseHp"),     11, 17),
    TrialConfig("galley_attack", "int", ("chassis", "galley_frame", "baseAttack"),  2, 5),
    TrialConfig("galley_defense","int", ("chassis", "galley_frame", "baseDefense"), 1, 4),
    TrialConfig("galley_moves",  "int", ("chassis", "galley_frame", "baseMoves"),   4, 6),
    TrialConfig("galley_range",  "int", ("chassis", "galley_frame", "baseRange"),   2, 4),
    TrialConfig("galley_supply", "float", ("chassis", "galley_frame", "supplyCost"), 1.75, 2.25),

    # =========================================================================
    # COMPONENT STATS (weapon / armor / training bonuses)
    # Each dial adjusts a component's numeric bonus to a specific stat.
    # Generic baseline components (basic_spear, basic_bow, simple_armor) are
    # included because they affect every faction's early-game power.
    # =========================================================================
    # --- GENERIC BASELINE COMPONENTS (shared by all factions) ---
    TrialConfig("basic_spear_attack",   "int", ("components", "basic_spear", "attackBonus"),     1, 5),
    TrialConfig("basic_bow_attack",     "int", ("components", "basic_bow", "attackBonus"),       1, 4),
    TrialConfig("basic_bow_range",      "int", ("components", "basic_bow", "rangeBonus"),        0, 2),
    TrialConfig("simple_armor_defense", "int", ("components", "simple_armor", "defenseBonus"),   1, 4),

    # --- JUNGLE CLAN (poison + stealth identity) ---
    TrialConfig("blowgun_attack",        "int", ("components", "blowgun", "attackBonus"),        0, 3),
    TrialConfig("poison_arrows_attack",  "int", ("components", "poison_arrows", "attackBonus"),  0, 4),
    TrialConfig("venom_rites_attack",    "int", ("components", "venom_rites", "attackBonus"),    0, 3),
    TrialConfig("venom_grenades_attack", "int", ("components", "venom_grenades", "attackBonus"), 0, 4),
    TrialConfig("jungle_mask_defense",   "int", ("components", "jungle_mask", "defenseBonus"),   0, 4),
    TrialConfig("jungle_mask_hp",        "int", ("components", "jungle_mask", "hpBonus"),        0, 4),

    # --- DRUID CIRCLE (sustain + forest magic) ---
    TrialConfig("druidic_rites_hp",       "int", ("components", "druidic_rites", "hpBonus"),        0, 5),
    TrialConfig("druidic_rites_defense",  "int", ("components", "druidic_rites", "defenseBonus"),   0, 5),
    TrialConfig("druidic_missiles_attack","int", ("components", "druidic_missiles", "attackBonus"), 4, 10),
    TrialConfig("druidic_missiles_range", "int", ("components", "druidic_missiles", "rangeBonus"),  0, 2),
    TrialConfig("nature_binding_hp",      "int", ("components", "nature_binding", "hpBonus"),      0, 4),
    TrialConfig("nature_binding_defense", "int", ("components", "nature_binding", "defenseBonus"), 0, 3),

    # --- STEPPE CLAN (mobility + cavalry identity) ---
    TrialConfig("light_mount_moves",       "int", ("components", "light_mount", "movesBonus"),      0, 2),
    TrialConfig("mounted_archer_attack",   "int", ("components", "mounted_archer", "attackBonus"),  0, 3),
    TrialConfig("mounted_archer_range",    "int", ("components", "mounted_archer", "rangeBonus"),   0, 2),
    TrialConfig("chariot_bow_attack",      "int", ("components", "chariot_bow", "attackBonus"),     1, 5),
    TrialConfig("chariot_bow_range",       "int", ("components", "chariot_bow", "rangeBonus"),      0, 2),
    TrialConfig("chariot_armor_defense",   "int", ("components", "chariot_armor", "defenseBonus"),  0, 4),
    TrialConfig("chariot_armor_hp",        "int", ("components", "chariot_armor", "hpBonus"),       0, 3),
    TrialConfig("chariot_drill_attack",    "int", ("components", "chariot_drill", "attackBonus"),   0, 3),
    TrialConfig("chariot_drill_moves",     "int", ("components", "chariot_drill", "movesBonus"),    0, 2),
    TrialConfig("skirmish_drill_attack",   "int", ("components", "skirmish_drill", "attackBonus"),  0, 3),
    TrialConfig("skirmish_drill_moves",    "int", ("components", "skirmish_drill", "movesBonus"),   0, 2),
    TrialConfig("warlord_standard_attack", "int", ("components", "warlord_standard", "attackBonus"),0, 3),
    TrialConfig("warlord_standard_hp",     "int", ("components", "warlord_standard", "hpBonus"),     0, 4),

    # --- HILL CLAN (fortification + siege identity) ---
    TrialConfig("fortress_training_defense","int", ("components", "fortress_training", "defenseBonus"),0, 5),
    TrialConfig("fortress_training_hp",    "int", ("components", "fortress_training", "hpBonus"),      0, 6),
    TrialConfig("field_forts_defense",     "int", ("components", "field_forts", "defenseBonus"),       1, 5),
    TrialConfig("field_forts_hp",          "int", ("components", "field_forts", "hpBonus"),            0, 3),
    TrialConfig("boiling_oil_attack",      "int", ("components", "boiling_oil", "attackBonus"),        0, 3),
    TrialConfig("boiling_oil_defense",     "int", ("components", "boiling_oil", "defenseBonus"),       1, 5),
    TrialConfig("boiling_oil_hp",          "int", ("components", "boiling_oil", "hpBonus"),            0, 4),
    TrialConfig("hill_leather_defense",    "int", ("components", "hill_leather", "defenseBonus"),      1, 5),
    TrialConfig("catapult_arm_attack",     "int", ("components", "catapult_arm", "attackBonus"),       0, 4),

    # --- CORAL PEOPLE / PIRATE LORDS (naval + capture identity) ---
    TrialConfig("pistol_attack",         "int", ("components", "pistol", "attackBonus"),         3, 7),
    TrialConfig("musket_attack",         "int", ("components", "musket", "attackBonus"),         2, 6),
    TrialConfig("musket_range",          "int", ("components", "musket", "rangeBonus"),          0, 2),
    TrialConfig("tidal_drill_attack",    "int", ("components", "tidal_drill", "attackBonus"),    0, 3),
    TrialConfig("tidal_drill_moves",     "int", ("components", "tidal_drill", "movesBonus"),     0, 2),
    TrialConfig("ship_cannon_attack",    "int", ("components", "ship_cannon", "attackBonus"),    0, 4),
    TrialConfig("slaver_net_attack",     "int", ("components", "slaver_net", "attackBonus"),     0, 3),
    TrialConfig("pirate_collar_attack",  "int", ("components", "pirate_collar", "attackBonus"),  0, 3),

    # --- DESERT NOMADS (survival + camel identity) ---
    TrialConfig("desert_forged_attack",  "int", ("components", "desert_forged", "attackBonus"),  0, 3),
    TrialConfig("desert_forged_defense", "int", ("components", "desert_forged", "defenseBonus"), 1, 5),
    TrialConfig("desert_forged_hp",      "int", ("components", "desert_forged", "hpBonus"),      1, 5),
    TrialConfig("desert_regen_hp",       "int", ("components", "desert_regen", "hpBonus"),       3, 9),
    TrialConfig("desert_regen_attack",   "int", ("components", "desert_regen", "attackBonus"),   0, 3),
    TrialConfig("desert_silk_defense",   "int", ("components", "desert_silk", "defenseBonus"),   0, 3),
    TrialConfig("desert_silk_moves",     "int", ("components", "desert_silk", "movesBonus"),     0, 2),

    # --- SAVANNAH LIONS (formation + shock identity) ---
    TrialConfig("shock_drill_attack",      "int", ("components", "shock_drill", "attackBonus"),      0, 4),
    TrialConfig("shock_drill_defense",     "int", ("components", "shock_drill", "defenseBonus"),     0, 3),
    TrialConfig("elephant_harness_attack", "int", ("components", "elephant_harness", "attackBonus"), 0, 4),
    TrialConfig("elephant_harness_hp",     "int", ("components", "elephant_harness", "hpBonus"),     0, 4),
    TrialConfig("war_drums_attack",        "int", ("components", "war_drums", "attackBonus"),        0, 3),
    TrialConfig("war_drums_moves",         "int", ("components", "war_drums", "movesBonus"),         0, 2),

    # --- RIVER PEOPLE (amphibious + navigation identity) ---
    TrialConfig("rivercraft_attack", "int", ("components", "rivercraft_training", "attackBonus"), 0, 3),
    TrialConfig("rivercraft_moves",  "int", ("components", "rivercraft_training", "movesBonus"),  0, 2),

    # --- FROST WARDENS (endurance + cold identity) ---
    TrialConfig("cold_provisions_hp",      "int", ("components", "cold_provisions", "hpBonus"),      0, 4),
    TrialConfig("cold_provisions_defense", "int", ("components", "cold_provisions", "defenseBonus"), 0, 4),
    TrialConfig("frost_forge_attack",      "int", ("components", "frost_forge", "attackBonus"),      0, 3),
    TrialConfig("frost_forge_defense",     "int", ("components", "frost_forge", "defenseBonus"),     0, 4),
    TrialConfig("frost_forge_hp",          "int", ("components", "frost_forge", "hpBonus"),          0, 4),

    # =========================================================================
    # FACTION CAPABILITY SEEDS
    # Each seed controls how quickly a faction progresses in a given domain.
    # Higher = faster research, higher cap pressure.
    # Ranges are +/-2 from the current baseline, clamped to [1, 8] globally.
    # =========================================================================

    # --- Jungle Clan (woodcraft=4, poisoncraft=3, stealth=3, endurance=2) ---
    TrialConfig("jungle_woodcraft",   "float", ("factions", "jungle_clan", "capabilitySeeds", "woodcraft"),   2, 7),
    TrialConfig("jungle_poisoncraft", "float", ("factions", "jungle_clan", "capabilitySeeds", "poisoncraft"), 2, 6),
    TrialConfig("jungle_stealth",     "float", ("factions", "jungle_clan", "capabilitySeeds", "stealth"),     2, 6),
    TrialConfig("jungle_endurance",   "float", ("factions", "jungle_clan", "capabilitySeeds", "endurance"),   1, 5),

    # --- Druid Circle (woodcraft=4, endurance=3, stealth=2, fortification=1) ---
    TrialConfig("druid_woodcraft",     "float", ("factions", "druid_circle", "capabilitySeeds", "woodcraft"),      2, 7),
    TrialConfig("druid_endurance",     "float", ("factions", "druid_circle", "capabilitySeeds", "endurance"),      2, 6),
    TrialConfig("druid_stealth",       "float", ("factions", "druid_circle", "capabilitySeeds", "stealth"),        1, 5),
    TrialConfig("druid_fortification", "float", ("factions", "druid_circle", "capabilitySeeds", "fortification"),  1, 5),

    # --- Steppe Clan (horsemanship=4, charge=4, mobility=4, woodcraft=2, stealth=2) ---
    TrialConfig("steppe_horsemanship", "float", ("factions", "steppe_clan", "capabilitySeeds", "horsemanship"), 2, 7),
    TrialConfig("steppe_charge",       "float", ("factions", "steppe_clan", "capabilitySeeds", "charge"),       2, 6),
    TrialConfig("steppe_mobility",     "float", ("factions", "steppe_clan", "capabilitySeeds", "mobility"),     2, 6),
    TrialConfig("steppe_woodcraft",    "float", ("factions", "steppe_clan", "capabilitySeeds", "woodcraft"),    1, 4),
    TrialConfig("steppe_stealth",      "float", ("factions", "steppe_clan", "capabilitySeeds", "stealth"),      1, 4),

    # --- Hill Clan (hill_fighting=4, fortification=4, formation_warfare=2) ---
    TrialConfig("hill_fortification", "float", ("factions", "hill_clan", "capabilitySeeds", "fortification"),     2, 7),
    TrialConfig("hill_fighting",      "float", ("factions", "hill_clan", "capabilitySeeds", "hill_fighting"),      2, 7),
    TrialConfig("hill_formation",     "float", ("factions", "hill_clan", "capabilitySeeds", "formation_warfare"),  1, 5),

    # --- Coral People / Pirate Lords (seafaring=5, navigation=4, mobility=3, formation_warfare=2) ---
    TrialConfig("coral_seafaring",         "float", ("factions", "coral_people", "capabilitySeeds", "seafaring"),         3, 7),
    TrialConfig("coral_navigation",        "float", ("factions", "coral_people", "capabilitySeeds", "navigation"),        2, 6),
    TrialConfig("coral_mobility",          "float", ("factions", "coral_people", "capabilitySeeds", "mobility"),          2, 5),
    TrialConfig("coral_formation_warfare", "float", ("factions", "coral_people", "capabilitySeeds", "formation_warfare"), 1, 4),

    # --- Desert Nomads (horsemanship=3, desert_survival=3, mobility=3) ---
    TrialConfig("desert_horsemanship", "float", ("factions", "desert_nomads", "capabilitySeeds", "horsemanship"),    2, 6),
    TrialConfig("desert_survival",     "float", ("factions", "desert_nomads", "capabilitySeeds", "desert_survival"), 2, 6),
    TrialConfig("desert_mobility",     "float", ("factions", "desert_nomads", "capabilitySeeds", "mobility"),        2, 5),

    # --- Savannah Lions (formation_warfare=4, mobility=3, shock_resistance=3, horsemanship=2) ---
    TrialConfig("savannah_formation",    "float", ("factions", "savannah_lions", "capabilitySeeds", "formation_warfare"), 2, 7),
    TrialConfig("savannah_mobility",     "float", ("factions", "savannah_lions", "capabilitySeeds", "mobility"),          2, 5),
    TrialConfig("savannah_shock_resist", "float", ("factions", "savannah_lions", "capabilitySeeds", "shock_resistance"),  2, 5),
    TrialConfig("savannah_horsemanship", "float", ("factions", "savannah_lions", "capabilitySeeds", "horsemanship"),      1, 4),

    # --- River People (navigation=4, seafaring=4, mobility=3, woodcraft=2) ---
    TrialConfig("river_navigation", "float", ("factions", "river_people", "capabilitySeeds", "navigation"), 2, 6),
    TrialConfig("river_seafaring",  "float", ("factions", "river_people", "capabilitySeeds", "seafaring"),  2, 6),
    TrialConfig("river_mobility",  "float", ("factions", "river_people", "capabilitySeeds", "mobility"),   2, 5),
    TrialConfig("river_woodcraft", "float", ("factions", "river_people", "capabilitySeeds", "woodcraft"),  1, 4),

    # --- Frost Wardens (fortification=4, hill_fighting=2, endurance=4) ---
    TrialConfig("frost_endurance",     "float", ("factions", "frost_wardens", "capabilitySeeds", "endurance"),      3, 7),
    TrialConfig("frost_fortification", "float", ("factions", "frost_wardens", "capabilitySeeds", "fortification"),  2, 6),
    TrialConfig("frost_hill_fighting", "float", ("factions", "frost_wardens", "capabilitySeeds", "hill_fighting"),  1, 5),

    # =========================================================================
    # SIGNATURE ABILITY PARAMETERS
    # Boolean toggles (endlessStride, hitAndRun) are NOT knobs -- they are
    # identity-defining and always on. Only numeric parameters are tuned.
    #
    # Each faction's summon can have its stats fine-tuned independently of
    # the base chassis, via the summon sub-object in signatureAbilities.
    # =========================================================================

    # --- Desert Nomads: Endless Stride + Desert Swarm ---
    TrialConfig("desert_swarm_threshold",       "int",   ("signatureAbilities", "desert_nomads", "desertSwarmThreshold"),         2, 5),
    TrialConfig("desert_swarm_attack",           "int",   ("signatureAbilities", "desert_nomads", "desertSwarmAttackBonus"),       0, 3),
    TrialConfig("desert_swarm_defense",          "float", ("signatureAbilities", "desert_nomads", "desertSwarmDefenseMultiplier"), 1.0, 1.3),
    TrialConfig("desert_nomads_cooldown",         "int",   ("signatureAbilities", "desert_nomads", "cooldownDuration"),             3, 7),

    # --- Savannah Lions: Stampede (elephant charge multiplier) ---
    TrialConfig("stampede_bonus", "float", ("signatureAbilities", "savannah_lions", "stampedeBonus"), 0.15, 0.5),

    # --- Savannah Lions: War Elephant Summon ---
    TrialConfig("war_elephant_summon_hp",      "int", ("signatureAbilities", "savannah_lions", "summon", "hp"),     10, 18),
    TrialConfig("war_elephant_summon_attack",  "int", ("signatureAbilities", "savannah_lions", "summon", "attack"),  2, 6),
    TrialConfig("war_elephant_summon_defense", "int", ("signatureAbilities", "savannah_lions", "summon", "defense"), 1, 4),
    TrialConfig("savannah_summon_duration",     "int", ("signatureAbilities", "savannah_lions", "summonDuration"),   3, 8),
    TrialConfig("savannah_cooldown",            "int", ("signatureAbilities", "savannah_lions", "cooldownDuration"), 3, 8),

    # --- Jungle Clan: Lethal Venom (poison damage per turn) + Serpent God Summon ---
    TrialConfig("venom_damage",            "float", ("signatureAbilities", "jungle_clan", "venomDamagePerTurn"),     1, 6),
    TrialConfig("serpent_summon_hp",       "int",   ("signatureAbilities", "jungle_clan", "summon", "hp"),          14, 22),
    TrialConfig("serpent_summon_attack",   "int",   ("signatureAbilities", "jungle_clan", "summon", "attack"),       3, 7),
    TrialConfig("serpent_summon_defense",  "int",   ("signatureAbilities", "jungle_clan", "summon", "defense"),      1, 4),
    TrialConfig("jungle_summon_duration",  "int",   ("signatureAbilities", "jungle_clan", "summonDuration"),         3, 8),
    TrialConfig("jungle_cooldown",         "int",   ("signatureAbilities", "jungle_clan", "cooldownDuration"),       3, 8),

    # --- Druid Circle: Treefolk Summon ---
    TrialConfig("treefolk_summon_hp",      "int", ("signatureAbilities", "druid_circle", "summon", "hp"),      16, 25),
    TrialConfig("treefolk_summon_attack",  "int", ("signatureAbilities", "druid_circle", "summon", "attack"),   2, 5),
    TrialConfig("treefolk_summon_defense", "int", ("signatureAbilities", "druid_circle", "summon", "defense"),  4, 8),
    TrialConfig("druid_summon_duration",   "int", ("signatureAbilities", "druid_circle", "summonDuration"),     4, 9),
    TrialConfig("druid_cooldown",          "int", ("signatureAbilities", "druid_circle", "cooldownDuration"),   3, 7),

    # --- Steppe Clan: Warlord Summon ---
    TrialConfig("warlord_summon_hp",      "int", ("signatureAbilities", "steppe_clan", "summon", "hp"),      16, 24),
    TrialConfig("warlord_summon_attack",  "int", ("signatureAbilities", "steppe_clan", "summon", "attack"),   3, 7),
    TrialConfig("warlord_summon_defense", "int", ("signatureAbilities", "steppe_clan", "summon", "defense"),  2, 5),
    TrialConfig("steppe_summon_duration", "int", ("signatureAbilities", "steppe_clan", "summonDuration"),     3, 8),
    TrialConfig("steppe_cooldown",        "int", ("signatureAbilities", "steppe_clan", "cooldownDuration"),   3, 8),

    # --- Hill Clan: Siege Golem Summon ---
    TrialConfig("golem_summon_hp",      "int", ("signatureAbilities", "hill_clan", "summon", "hp"),      18, 28),
    TrialConfig("golem_summon_attack",  "int", ("signatureAbilities", "hill_clan", "summon", "attack"),   4, 8),
    TrialConfig("golem_summon_defense", "int", ("signatureAbilities", "hill_clan", "summon", "defense"),  3, 7),
    TrialConfig("hill_summon_duration", "int", ("signatureAbilities", "hill_clan", "summonDuration"),     4, 9),
    TrialConfig("hill_cooldown",        "int", ("signatureAbilities", "hill_clan", "cooldownDuration"),   3, 7),

    # --- Coral People: Wall Defense + Galley Summon ---
    TrialConfig("coral_wall_multiplier",      "float", ("signatureAbilities", "coral_people", "wallDefenseMultiplier"),       1.0, 3.0),
    TrialConfig("coral_tidal_assault",        "float", ("signatureAbilities", "coral_people", "tidalAssaultBonus"),           0.1, 0.5),
    TrialConfig("galley_summon_hp",           "int",   ("signatureAbilities", "coral_people", "summon", "hp"),               10, 18),
    TrialConfig("galley_summon_attack",       "int",   ("signatureAbilities", "coral_people", "summon", "attack"),            2, 5),
    TrialConfig("galley_summon_defense",      "int",   ("signatureAbilities", "coral_people", "summon", "defense"),           1, 4),
    TrialConfig("coral_summon_duration",      "int",   ("signatureAbilities", "coral_people", "summonDuration"),             3, 8),
    TrialConfig("coral_cooldown",             "int",   ("signatureAbilities", "coral_people", "cooldownDuration"),           3, 8),
    TrialConfig("coral_greedy_bonus",         "int",   ("signatureAbilities", "coral_people", "greedyBonus"),               15, 35),
    TrialConfig("coral_greedy_capture_chance","float",  ("signatureAbilities", "coral_people", "greedyCaptureChance"),      0.3, 0.7),

    # --- River People: Sneak Attack + Alligator Summon ---
    TrialConfig("sneak_attack_bonus",         "float", ("signatureAbilities", "river_people", "sneakAttackBonus"),      0.1, 0.7),
    TrialConfig("alligator_summon_hp",        "int",   ("signatureAbilities", "river_people", "summon", "hp"),          12, 19),
    TrialConfig("alligator_summon_attack",    "int",   ("signatureAbilities", "river_people", "summon", "attack"),       3, 7),
    TrialConfig("alligator_summon_defense",   "int",   ("signatureAbilities", "river_people", "summon", "defense"),      1, 4),
    TrialConfig("river_summon_duration",      "int",   ("signatureAbilities", "river_people", "summonDuration"),         3, 8),
    TrialConfig("river_cooldown",             "int",   ("signatureAbilities", "river_people", "cooldownDuration"),       3, 8),

    # --- Frost Wardens: Polar Bear Summon ---
    TrialConfig("polar_bear_summon_hp",      "int", ("signatureAbilities", "frost_wardens", "summon", "hp"),      12, 30),
    TrialConfig("polar_bear_summon_attack",  "int", ("signatureAbilities", "frost_wardens", "summon", "attack"),   3, 9),
    TrialConfig("polar_bear_summon_defense", "int", ("signatureAbilities", "frost_wardens", "summon", "defense"),  1, 5),
    TrialConfig("frost_summon_duration",     "int", ("signatureAbilities", "frost_wardens", "summonDuration"),     3, 8),
    TrialConfig("frost_cooldown",            "int", ("signatureAbilities", "frost_wardens", "cooldownDuration"),   3, 8),
]


def set_nested(target: dict[str, Any], path: tuple[str, ...], value: Any) -> None:
    current = target
    for key in path[:-1]:
        current = current.setdefault(key, {})
    current[path[-1]] = value


def build_overrides(trial: Any) -> dict[str, Any]:
    overrides: dict[str, Any] = {}
    for knob in KNOBS:
        if knob.kind == "int":
            value = trial.suggest_int(knob.label, int(knob.low), int(knob.high))
        else:
            value = trial.suggest_float(knob.label, knob.low, knob.high)
        set_nested(overrides, knob.path, value)
    return overrides


def run_trial(
    evaluate_script: Path,
    overrides: dict[str, Any],
    turns: int,
    stratified: bool,
    random_map: bool,
) -> dict[str, Any]:
    payload = {
        "overrides": overrides,
        "maxTurns": turns,
        "stratified": stratified,
        "mapMode": "randomClimateBands" if random_map else "fixed",
    }
    repo_root = evaluate_script.resolve().parents[1]
    tsx_cli = repo_root / "node_modules" / "tsx" / "dist" / "cli.mjs"
    command = ["node", str(tsx_cli), str(evaluate_script)]
    result = subprocess.run(
        command,
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            result.stderr.strip() or result.stdout.strip() or "evaluateBalance failed"
        )
    return json.loads(result.stdout)


def ensure_output_dir(base_dir: Path | None) -> Path:
    if base_dir is not None:
        base_dir.mkdir(parents=True, exist_ok=True)
        return base_dir

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    output_dir = Path("artifacts") / "balance-optimization" / timestamp
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run Optuna balance search against the war-civ evaluation harness."
    )
    parser.add_argument(
        "--trials", type=int, default=25, help="Number of optimization trials to run."
    )
    parser.add_argument(
        "--turns",
        type=int,
        default=150,
        help="Turn cap passed to the evaluation harness.",
    )
    parser.add_argument(
        "--output-dir", type=Path, default=None, help="Directory for trial artifacts."
    )
    parser.add_argument(
        "--study-name", type=str, default="war-civ-balance", help="Optuna study name."
    )
    parser.add_argument(
        "--random", action="store_true", help="Use random climate-band maps."
    )
    parser.add_argument(
        "--stratified",
        action="store_true",
        help="Use the built-in stratified seed set.",
    )
    args = parser.parse_args()

    import optuna  # Imported lazily so --help works without the dependency.

    repo_root = Path(__file__).resolve().parents[1]
    evaluate_script = repo_root / "scripts" / "evaluateBalance.ts"
    output_dir = ensure_output_dir(args.output_dir)
    trials_path = output_dir / "trials.jsonl"
    candidates_path = output_dir / "best_candidates.json"

    def objective(trial: Any) -> float:
        overrides = build_overrides(trial)
        try:
            evaluation = run_trial(
                evaluate_script, overrides, args.turns, args.stratified, args.random
            )
        except RuntimeError as e:
            print(f"[W] Trial {trial.number} failed: {e}", file=sys.stderr)
            return 999.0
        score = float(evaluation["objective"]["score"])
        trial.set_user_attr("evaluation", evaluation)
        with trials_path.open("a", encoding="utf-8") as handle:
            handle.write(
                json.dumps(
                    {
                        "trial": trial.number,
                        "score": score,
                        "params": trial.params,
                        "evaluation": evaluation,
                    }
                )
            )
            handle.write("\n")
        return score

    study = optuna.create_study(direction="minimize", study_name=args.study_name)
    study.optimize(objective, n_trials=args.trials)

    best_trials = [
        {
            "trial": trial.number,
            "score": trial.value,
            "params": trial.params,
            "evaluation": trial.user_attrs.get("evaluation"),
        }
        for trial in sorted(
            study.trials,
            key=lambda item: float(
                item.value if item.value is not None else sys.float_info.max
            ),
        )[:5]
    ]
    candidates_path.write_text(
        json.dumps(
            {
                "studyName": args.study_name,
                "bestValue": study.best_value,
                "bestParams": study.best_params,
                "bestTrials": best_trials,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    print(
        json.dumps(
            {
                "outputDir": str(output_dir),
                "bestValue": study.best_value,
                "bestParams": study.best_params,
                "bestCandidatesFile": str(candidates_path),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
