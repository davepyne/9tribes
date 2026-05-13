import civilizationsData from '../../../src/content/base/civilizations.json';
import chassisData from '../../../src/content/base/chassis.json';

export interface FactionInfo {
  id: string;
  name: string;
  color: string;
  nativeDomain: string;
  homeBiome: string;
  intro: string;
  strengths: string[];
  weaknesses: string[];
  tip: string;
  signatureUnit: string;
  specialTrait: string;
  specialAbility: string;
  uniqueMechanic: string;
  passiveTrait: string;
  unitStats?: {
    attack: number;
    defense: number;
    health: number;
    moves: number;
    range: number;
    tags: string[];
    ability: string;
    description: string;
  };
  summonCondition?: string;
  menuSummary?: string;
}

type CivDef = { id: string; name: string; color: string; nativeDomain: string; homeBiome: string; signatureUnit: string; passiveTrait: string; uniqueMechanic: string };
type ChassisDef = { baseHp: number; baseAttack: number; baseDefense: number; baseMoves: number; baseRange?: number; tags: string[] };

const CIVS = civilizationsData as Record<string, CivDef>;
const CHASSIS = chassisData as Record<string, ChassisDef>;

const SIGNATURE_CHASSIS: Record<string, string> = {
  jungle_clan: 'serpent_frame',
  druid_circle: 'treefolk_frame',
  hill_clan: 'siege_golem_frame',
  savannah_lions: 'war_elephant_frame',
  desert_nomads: 'camel_frame',
  steppe_clan: 'warlord_frame',
  coral_people: 'galley_frame',
  river_people: 'alligator_frame',
  frost_wardens: 'polar_bear_frame',
};

const FACTION_DISPLAY: Record<string, {
  intro: string;
  strengths: string[];
  weaknesses: string[];
  tip: string;
  specialTrait: string;
  specialAbility: string;
  summonCondition?: string;
  unitAbility?: string;
  unitDescription?: string;
  menuSummary?: string;
}> = {
  jungle_clan: {
    intro: 'The Jungle Clans thrive where others fear to tread — deep in the canopy, where poison drips from every leaf and visibility ends at arm\'s reach.',
    strengths: ['Jungle interiors are your kingdom', 'Poison warfare means attrition advantage', 'Enemies fight blind while you strike from concealment'],
    weaknesses: ['Long-range armies outside the jungle are your nightmare', 'Struggle badly on open ground'],
    tip: 'Lure enemies into the jungle by retreating, then spring your real force on them.',
    specialTrait: 'Jungle Stalkers',
    specialAbility: 'Poison on attacks + stealth in jungle; Serpent God applies 3 poison dmg/stack/turn',
    summonCondition: 'Your unit must be standing in Jungle or Swamp terrain.',
    unitAbility: 'Jungle Stalkers: +35% defense in jungle, +15% attack in jungle/forest. Serpent God applies 3 poison dmg/turn per stack. Immune to jungle attrition.',
    unitDescription: 'The colossal Serpent God coils through the jungle, its venomous bite capable of felling the toughest warriors.',
    menuSummary: 'Venom — units poison enemies for damage over time; summon Serpent Gods in jungle',
  },
  druid_circle: {
    intro: 'The Druid Circle believes the forest itself fights on their side — and honestly, it kind of does.',
    strengths: ['Healing Druids passive means faster recovery', 'Forest terrain amplifies everything good', 'Patient defensive play is incredibly strong'],
    weaknesses: ['Fast shock cavalry can run circles around you', 'Offensive punch is modest'],
    tip: 'Plant your forces just inside a forest edge and let enemies commit.',
    specialTrait: 'Healing Aura',
    specialAbility: 'Druid units heal nearby allies 1 HP/turn; self-heal 2 HP/turn; +2 bonus healing in rough terrain',
    summonCondition: 'Your unit must be standing in Forest, Jungle, or City terrain.',
    unitAbility: 'Forest Regeneration: Fully heals when ending a turn on Forest or Jungle terrain.',
    unitDescription: 'Ancient tree-guardians awakened by druidic ritual. Enormously tough, and nearly unkillable in their forest home.',
    menuSummary: 'Healing Druids — units heal in forest terrain each turn',
  },
  hill_clan: {
    intro: 'The Hill Engineers are the masters of high ground. They turn elevated terrain into impregnable positions.',
    strengths: ['Hill terrain gives massive defense bonus', 'Fortress structures are incredibly strong', 'Shock resistance is innate'],
    weaknesses: ['Need hills to be effective', 'Slow movement on flat ground'],
    tip: 'Secure high ground early and fortify. Let enemies come to you.',
    specialTrait: 'Hill Engineering',
    specialAbility: '+25% attack on hills; Fortress aura gives adjacent allies +30% defense; 7-turn summon duration',
    summonCondition: 'Your unit must be standing in Hill or City terrain.',
    unitAbility: 'Fortress Aura: Adjacent allies gain +30% defense. +25% attack when fighting on hills. 7-turn summon duration.',
    unitDescription: 'The imposing Siege Golem stands as a bastion of hill defense, its elevated position commanding the battlefield.',
    menuSummary: 'Engineering — can build Fortresses and a Catapult; fortified units gain extra defense on hills',
  },
  savannah_lions: {
    intro: 'The Savannah Lions are all about momentum. Their Charge Momentum passive means their units hit harder after moving.',
    strengths: ['First-contact power is unmatched', 'War Elephants are devastating', 'Charge bonuses are massive'],
    weaknesses: ['Terrain that slows approach nullifies charge', 'Light infantry gets crushed'],
    tip: 'Angle your approach so War Elephants hit the flank — the bonus is just as devastating.',
    specialTrait: 'Charge Momentum',
    specialAbility: 'Charge: strike first, no retaliation on kill; War Elephant tramples; +30% stampede bonus',
    summonCondition: 'Your unit must be standing in Savannah, Plains, or City terrain.',
    unitAbility: 'Charge: Strike first on charge. No retaliation if enemy is killed. Stampede knockback on massed charge. +30% charge damage.',
    unitDescription: 'The massive War Elephant crashes into enemy lines with terrifying force, trampling all who stand in its path.',
    menuSummary: 'Charge Momentum — units hit harder after moving, up to devastating impact',
  },
  desert_nomads: {
    intro: 'The Desert Nomads are forged in the harshest terrain. They turn desert disadvantages into advantages.',
    strengths: ['Ignore desert terrain penalties', 'Camel cavalry is unmatched', 'Desert survival is innate'],
    weaknesses: ['Need desert to be effective', 'Water maps are challenging'],
    tip: 'Use the desert as your highway. Enemies struggle where you thrive.',
    specialTrait: 'Desert Adaptation',
    specialAbility: 'Ignore all terrain movement penalties; Desert Swarm (+1 attack, +10% defense when 3+ units nearby); immune to desert attrition',
    summonCondition: 'Your unit must be standing in Desert or City terrain.',
    unitAbility: 'Desert Adaptation: Ignores all terrain movement penalties. Desert Swarm (3+ units nearby): +1 attack, +10% defense. Immune to desert attrition.',
    unitDescription: 'The legendary Desert Immortals are unstoppable — they heal from any wound and march forever. Limited to 1 on map.',
    menuSummary: 'Desert Swarm — bonuses when multiple units cluster; immune to desert attrition',
  },
  steppe_clan: {
    intro: 'The Steppe Riders are masters of mobility. Their Horse Archers can move and shoot without penalty.',
    strengths: ['Hit and run tactics', 'Open terrain advantage', 'Fast movement'],
    weaknesses: ['Forest disadvantage', 'Siege weakness'],
    tip: 'Use your speed to flank enemies and retreat before they can respond.',
    specialTrait: 'Master Horsemen',
    specialAbility: 'Warlord aura (+10 morale/turn to cavalry/mounted within 3 hex); Hit & Run bonus damage',
    summonCondition: 'Your unit must be standing in Plains or Savannah terrain.',
    unitAbility: 'Command Aura: +10 morale/turn to all friendly cavalry/mounted units within 3 hexes. Hit & Run: Bonus damage on move-then-attack.',
    unitDescription: 'The mighty Warlord leads the Steppe Riders with unmatched mobility and tactical flexibility.',
    menuSummary: 'Skirmish Pursuit — +2 bonus damage when winning exchanges; summon Warlords on open ground',
  },
  coral_people: {
    intro: 'The Pirate Lords are the masters of coastal raiding. They capture enemy units and turn them into assets.',
    strengths: ['Can capture enemy units', 'Coastal mobility is unmatched', 'Naval superiority'],
    weaknesses: ['Weak deep inland', 'Need coastal access'],
    tip: 'Raid coastal settlements and capture valuable units.',
    specialTrait: 'Greedy',
    specialAbility: '+25 village plunder; 50% unit capture chance on kill; 40% non-combat capture; Tidal Assault: -25% enemy defense on coast',
    summonCondition: 'Your unit must be standing in Coast, Ocean, or City terrain.',
    unitAbility: 'Greedy: +25 village plunder value. 50% capture chance on kill. Non-combat capture 40%. Tidal Assault: -25% enemy defense on coast.',
    unitDescription: 'The versatile Galley carries raiders across shallow waters, perfect for coastal raids and capturing enemies.',
    menuSummary: 'Greedy — capture villages for resources and enslave enemy units instead of killing them',
  },
  river_people: {
    intro: 'The River People treat waterways like roads. They appear anywhere along the bank without warning.',
    strengths: ['River corridors give unmatched mobility', 'River Stealth is powerful', 'Amphibious assault is devastating'],
    weaknesses: ['Getting dragged into dry fights strips advantages', 'Opponents can bait you'],
    tip: 'Map out river networks early — they\'re your highway system.',
    specialTrait: 'River Assault',
    specialAbility: 'Auto-stealth on river and swamp tiles only (not coast/ocean); +50% ambush damage from stealth; amphibious (emerge from any river hex); immune to swamp attrition',
    summonCondition: 'Your unit must be standing in River, Jungle, or Swamp terrain.',
    unitAbility: 'River Stealth: Auto-stealth on river and swamp tiles only (not coast/ocean). +50% ambush damage from stealth. Amphibious: Can emerge from any river hex. Immune to swamp attrition.',
    unitDescription: 'The Ancient Alligator lurks beneath river surfaces, emerging to drag unlucky foes into the depths.',
    menuSummary: 'River Stealth — units are invisible in river and swamp tiles; cavalry charge attacks deal extra damage; summon Ancient Alligators near water',
  },
  frost_wardens: {
    intro: 'The Arctic Wardens turn the game\'s worst terrain into the best neighborhood. They thrive in cold.',
    strengths: ['Poor terrain is your advantage', 'Cold-Hardened Growth means better economics', 'Polar Bear is devastating'],
    weaknesses: ['Need cold terrain to be effective', 'Warm terrain penalties'],
    tip: 'Own the frozen positions. Let opponents fight over "good" land.',
    specialTrait: 'Cold-Hardened',
    specialAbility: 'Heavy Hitter: ignore 50% enemy armor; +25% defense in tundra; shortest summon cooldown (3 turns); +10% economy in poor terrain',
    summonCondition: 'Your unit must be standing in Tundra or City terrain.',
    unitAbility: 'Heavy Hitter: Ignore 50% of enemy armor. +25% defense in tundra. Cold-Hardened: +10% economy in poor terrain. Shortest summon cooldown (3 turns).',
    unitDescription: 'The mighty Polar Bear is the apex predator of the frozen north, its icy roar freezing all who oppose the Wardens.',
    menuSummary: 'Cold Hardened — better growth from poor land; summon Polar Bears on tundra',
  },
};

const FACTION_INFO_MAP: Record<string, FactionInfo> = Object.fromEntries(
  Object.entries(CIVS).map(([id, civ]) => {
    const display = FACTION_DISPLAY[id];
    const chassisId = SIGNATURE_CHASSIS[id];
    const chassis = chassisId ? CHASSIS[chassisId] : undefined;
    return [id, {
      id: civ.id,
      name: civ.name,
      color: civ.color,
      nativeDomain: civ.nativeDomain,
      homeBiome: civ.homeBiome,
      signatureUnit: civ.signatureUnit,
      uniqueMechanic: civ.uniqueMechanic,
      passiveTrait: civ.passiveTrait,
      intro: display?.intro ?? '',
      strengths: display?.strengths ?? [],
      weaknesses: display?.weaknesses ?? [],
      tip: display?.tip ?? '',
      specialTrait: display?.specialTrait ?? '',
      specialAbility: display?.specialAbility ?? '',
      summonCondition: display?.summonCondition,
      menuSummary: display?.menuSummary,
      unitStats: chassis ? {
        attack: chassis.baseAttack,
        defense: chassis.baseDefense,
        health: chassis.baseHp,
        moves: chassis.baseMoves,
        range: chassis.baseRange ?? 1,
        tags: [...chassis.tags],
        ability: display?.unitAbility ?? '',
        description: display?.unitDescription ?? '',
      } : undefined,
    }];
  })
);

export function getFactionInfo(factionId: string): FactionInfo | undefined {
  return FACTION_INFO_MAP[factionId];
}
