import { TEXTURES } from './constants';

export const UNIT_FRAMES: Record<string, number> = {
  infantry: 18,
  ranged: 28,
  cavalry: 8,
  camel: 8,
  elephant: 50,
  naval: 27,
  settler: 24,
};

export type UnitTextureSpec =
  | { kind: 'sheet'; texture: string; frame: number; displayWidth: number; displayHeight: number; yOffset: number }
  | { kind: 'image'; texture: string; displayWidth: number; displayHeight: number; yOffset: number };

const PLAYTEST_SPRITE_KEYS: Record<string, string> = {
  druid_spear_infantry: 'druidSpearInfantry',
  druid_archer: 'druidArcher',
  druid_healer: 'druidHealer',
  druid_wizard: 'druidWizard',
  steppe_horse_archer: 'steppeHorseArcher',
  steppe_spear_infantry: 'steppeSpearInfantry',
  steppe_raiders: 'steppeRaiders',
  steppe_priestess: 'steppePriestess',
  steppe_warlord: 'steppeWarlord',
  jungle_spearman: 'jungleSpearman',
  jungle_archer: 'jungleArcher',
  jungle_blowgun: 'jungleBlowgun',
  jungle_priest: 'junglePriest',
  jungle_serpent: 'jungleSerpent',
  hill_spear_infantry: 'hillSpearInfantry',
  hill_archer: 'hillArcher',
  hill_fortress_archer: 'hillFortressArcher',
  hill_catapult: 'hillCatapult',
  hill_siege_golem: 'hillSiegeGolem',
  hill_fortress: 'hillFortress',
  hill_engineer: 'hillEngineer',
  pirate_infantry: 'pirateInfantry',
  pirate_ranged: 'pirateRanged',
  pirate_slaver: 'pirateSlaver',
  pirate_slaver_ship: 'pirateSlaverShip',
  pirate_galley: 'pirateGalley',
  desert_camel: 'desertCamel',
  desert_spearman: 'desertSpearman',
  desert_archer: 'desertArcher',
  desert_camel_lancers: 'desertCamelLancers',
  desert_immortal: 'desertImmortal',
  savannah_spearman: 'savannahSpearman',
  savannah_javelin: 'savannahJavelin',
  savannah_elephant: 'savannahElephant',
  savannah_chariot: 'savannahChariot',
  river_spearman: 'riverSpearman',
  river_canoe: 'riverCanoe',
  river_raiders: 'riverRaiders',
  river_priestess: 'riverPriestess',
  river_crocodile: 'riverCrocodile',
  frost_spearman: 'frostSpearman',
  frost_archer: 'frostArcher',
  frost_ice_defenders: 'frostIceDefenders',
  frost_priest: 'frostPriest',
  frost_polar_bear: 'frostPolarBear',
};

const REAR_SPRITE_KEYS: Record<string, string> = {
  druid_spear_infantry: 'druidSpearInfantryRear',
  druid_archer: 'druidArcherRear',
  druid_healer: 'druidHealerRear',
  druid_wizard: 'druidWizardRear',
  steppe_horse_archer: 'steppeHorseArcherRear',
  steppe_spear_infantry: 'steppeSpearInfantryRear',
  steppe_raiders: 'steppeRaidersRear',
  steppe_priestess: 'steppePriestessRear',
  steppe_warlord: 'steppeWarlordRear',
  jungle_spearman: 'jungleSpearmanRear',
  jungle_archer: 'jungleArcherRear',
  jungle_blowgun: 'jungleBlowgunRear',
  jungle_priest: 'junglePriestRear',
  jungle_serpent: 'jungleSerpentRear',
  hill_spear_infantry: 'hillSpearInfantryRear',
  hill_archer: 'hillArcherRear',
  hill_fortress_archer: 'hillFortressArcherRear',
  hill_catapult: 'hillCatapultRear',
  hill_siege_golem: 'hillSiegeGolemRear',
  hill_fortress: 'hillFortressRear',
  hill_engineer: 'hillEngineerRear',
  pirate_infantry: 'pirateInfantryRear',
  pirate_ranged: 'pirateRangedRear',
  pirate_slaver: 'pirateSlaverRear',
  pirate_slaver_ship: 'pirateSlaverShipRear',
  pirate_galley: 'pirateGalleyRear',
  desert_camel: 'desertCamelRear',
  desert_spearman: 'desertSpearmanRear',
  desert_archer: 'desertArcherRear',
  desert_camel_lancers: 'desertCamelLancersRear',
  desert_immortal: 'desertImmortalRear',
  savannah_spearman: 'savannahSpearmanRear',
  savannah_javelin: 'savannahJavelinRear',
  savannah_elephant: 'savannahElephantRear',
  savannah_chariot: 'savannahChariotRear',
  river_spearman: 'riverSpearmanRear',
  river_canoe: 'riverCanoeRear',
  river_raiders: 'riverRaidersRear',
  river_priestess: 'riverPriestessRear',
  river_crocodile: 'riverCrocodileRear',
  frost_spearman: 'frostSpearmanRear',
  frost_archer: 'frostArcherRear',
  frost_ice_defenders: 'frostIceDefendersRear',
  frost_priest: 'frostPriestRear',
  frost_polar_bear: 'frostPolarBearRear',
};

export function getUnitTextureSpec(spriteKey: string): UnitTextureSpec {
  const textureConst = PLAYTEST_SPRITE_KEYS[spriteKey];
  if (textureConst) {
    return {
      kind: 'image',
      texture: (TEXTURES as Record<string, string>)[textureConst],
      displayWidth: 48,
      displayHeight: 64,
      yOffset: 8,
    };
  }
  return {
    kind: 'sheet',
    texture: TEXTURES.units,
    frame: UNIT_FRAMES[spriteKey] ?? UNIT_FRAMES.infantry,
    displayWidth: 64,
    displayHeight: 48,
    yOffset: 10,
  };
}

export function getUnitRearTextureSpec(spriteKey: string): UnitTextureSpec | null {
  const textureConst = REAR_SPRITE_KEYS[spriteKey];
  if (textureConst) {
    return {
      kind: 'image',
      texture: (TEXTURES as Record<string, string>)[textureConst],
      displayWidth: 48,
      displayHeight: 64,
      yOffset: 8,
    };
  }
  return null;
}
