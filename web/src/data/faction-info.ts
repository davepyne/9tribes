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
}

const FACTION_INFO_MAP: Record<string, FactionInfo> = {
  jungle_clan: {
    id: 'jungle_clan', name: 'Jungle Clans', color: '#2f7d4a', nativeDomain: 'Venomcraft', homeBiome: 'Jungle',
    intro: 'The Jungle Clans thrive where others fear to tread — deep in the canopy, where poison drips from every leaf and visibility ends at arm\'s reach.',
    strengths: ['Jungle interiors are your kingdom', 'Poison warfare means attrition advantage', 'Enemies fight blind while you strike from concealment'],
    weaknesses: ['Long-range armies outside the jungle are your nightmare', 'Struggle badly on open ground'],
    tip: 'Lure enemies into the jungle by retreating, then spring your real force on them.',
    signatureUnit: 'Serpent God',
    specialTrait: 'Jungle Stalkers',
    specialAbility: 'Poison on attacks + stealth in jungle; Serpent God applies 3 poison dmg/stack/turn',
    uniqueMechanic: 'jungle_poison', passiveTrait: 'jungle_stalkers',
    summonCondition: 'Your unit must be standing in Jungle or Swamp terrain.',
    unitStats: {
      attack: 5, defense: 2, health: 18, moves: 3, range: 1,
      tags: ['beast', 'jungle', 'poison', 'melee'],
      ability: 'Jungle Stalkers: +35% defense in jungle, +15% attack in jungle/forest. Serpent God applies 3 poison dmg/turn per stack. Immune to jungle attrition.',
      description: 'The colossal Serpent God coils through the jungle, its venomous bite capable of felling the toughest warriors.',
    },
  },
  druid_circle: {
    id: 'druid_circle', name: 'Druid Circle', color: '#5d8f57', nativeDomain: 'Nature Healing', homeBiome: 'Forest',
    intro: 'The Druid Circle believes the forest itself fights on their side — and honestly, it kind of does.',
    strengths: ['Healing Druids passive means faster recovery', 'Forest terrain amplifies everything good', 'Patient defensive play is incredibly strong'],
    weaknesses: ['Fast shock cavalry can run circles around you', 'Offensive punch is modest'],
    tip: 'Plant your forces just inside a forest edge and let enemies commit.',
    signatureUnit: 'Druid Wizard',
    specialTrait: 'Healing Aura',
    specialAbility: 'Druid units heal nearby allies 1 HP/turn; self-heal 2 HP/turn; +2 bonus healing in rough terrain',
    uniqueMechanic: 'healing_druids', passiveTrait: 'forest_regeneration',
    summonCondition: 'Your unit must be standing in Forest, Jungle, or City terrain.',
    unitStats: {
      attack: 3, defense: 3, health: 8, moves: 3, range: 3,
      tags: ['magic', 'ranged', 'healing'],
      ability: 'Healing Aura: Self-heals 2 HP/turn. Allied units within 1 hex heal 1 HP/turn. +2 bonus healing in rough terrain.',
      description: 'The Druid Wizard channels the forest\'s power, weaving spells that mend wounds and strengthen resolve.'
    },
  },
  hill_clan: {
    id: 'hill_clan', name: 'Hill Engineers', color: '#8b7355', nativeDomain: 'Fortress Discipline', homeBiome: 'Hill',
    intro: 'The Hill Engineers are the masters of high ground. They turn elevated terrain into impregnable positions.',
    strengths: ['Hill terrain gives massive defense bonus', 'Fortress structures are incredibly strong', 'Shock resistance is innate'],
    weaknesses: ['Need hills to be effective', 'Slow movement on flat ground'],
    tip: 'Secure high ground early and fortify. Let enemies come to you.',
    signatureUnit: 'Siege Golem',
    specialTrait: 'Hill Engineering',
    specialAbility: '+25% attack on hills; Fortress aura gives adjacent allies +30% defense; 7-turn summon duration',
    uniqueMechanic: 'fortressDefense', passiveTrait: 'hill_defenders',
    summonCondition: 'Your unit must be standing in Hill or City terrain.',
    unitStats: {
      attack: 6, defense: 5, health: 22, moves: 2, range: 1,
      tags: ['beast', 'siege', 'fortress'],
      ability: 'Fortress Aura: Adjacent allies gain +30% defense. +25% attack when fighting on hills. 7-turn summon duration.',
      description: 'The imposing Siege Golem stands as a bastion of hill defense, its elevated position commanding the battlefield.',
    },
  },
  savannah_lions: {
    id: 'savannah_lions', name: 'Savannah Lions', color: '#c9a227', nativeDomain: 'Charge', homeBiome: 'Savannah',
    intro: 'The Savannah Lions are all about momentum. Their Charge Momentum passive means their units hit harder after moving.',
    strengths: ['First-contact power is unmatched', 'War Elephants are devastating', 'Charge bonuses are massive'],
    weaknesses: ['Terrain that slows approach nullifies charge', 'Light infantry gets crushed'],
    tip: 'Angle your approach so War Elephants hit the flank — the bonus is just as devastating.',
    signatureUnit: 'War Elephant',
    specialTrait: 'Charge Momentum',
    specialAbility: 'Charge: strike first, no retaliation on kill; War Elephant tramples; +30% stampede bonus',
    uniqueMechanic: 'charge_momentum', passiveTrait: 'elephant_charge',
    summonCondition: 'Your unit must be standing in Savannah, Plains, or City terrain.',
    unitStats: {
      attack: 4, defense: 2, health: 14, moves: 3, range: 1,
      tags: ['beast', 'charge', 'trample'],
      ability: 'Charge: Strike first on charge. No retaliation if enemy is killed. Stampede knockback on massed charge. +30% charge damage.',
      description: 'The massive War Elephant crashes into enemy lines with terrifying force, trampling all who stand in its path.'
    },
  },
  desert_nomads: {
    id: 'desert_nomads', name: 'Desert Nomads', color: '#d4a574', nativeDomain: 'Camel Adaptation', homeBiome: 'Desert',
    intro: 'The Desert Nomads are forged in the harshest terrain. They turn desert disadvantages into advantages.',
    strengths: ['Ignore desert terrain penalties', 'Camel cavalry is unmatched', 'Desert survival is innate'],
    weaknesses: ['Need desert to be effective', 'Water maps are challenging'],
    tip: 'Use the desert as your highway. Enemies struggle where you thrive.',
    signatureUnit: 'Desert Immortals',
    specialTrait: 'Desert Adaptation',
    specialAbility: 'Ignore all terrain movement penalties; Desert Swarm (+1 attack, +10% defense when 3+ units nearby); immune to desert attrition',
    uniqueMechanic: 'desert_adaptation', passiveTrait: 'camel_mobility',
    summonCondition: 'Your unit must be standing in Desert or City terrain.',
    unitStats: {
      attack: 2, defense: 3, health: 12, moves: 3, range: 1,
      tags: ['camel', 'mounted', 'self_heal'],
      ability: 'Desert Adaptation: Ignores all terrain movement penalties. Desert Swarm (3+ units nearby): +1 attack, +10% defense. Immune to desert attrition.',
      description: 'The legendary Desert Immortals are unstoppable — they heal from any wound and march forever. Limited to 1 on map.'
    },
  },
  steppe_clan: {
    id: 'steppe_clan', name: 'Steppe Riders', color: '#b98a2f', nativeDomain: 'Mobility', homeBiome: 'Plains',
    intro: 'The Steppe Riders are masters of mobility. Their Horse Archers can move and shoot without penalty.',
    strengths: ['Hit and run tactics', 'Open terrain advantage', 'Fast movement'],
    weaknesses: ['Forest disadvantage', 'Siege weakness'],
    tip: 'Use your speed to flank enemies and retreat before they can respond.',
    signatureUnit: 'Warlord',
    specialTrait: 'Master Horsemen',
    specialAbility: 'Warlord aura (+10 morale/turn to cavalry/mounted within 3 hex); Hit & Run bonus damage',
    uniqueMechanic: 'horse_archers', passiveTrait: 'master_horsemen',
    summonCondition: 'Your unit must be standing in Plains or Savannah terrain.',
    unitStats: {
      attack: 5, defense: 3, health: 20, moves: 3, range: 1,
      tags: ['cavalry', 'mounted', 'warlord', 'summon', 'aura'],
      ability: 'Command Aura: +10 morale/turn to all friendly cavalry/mounted units within 3 hexes. Hit & Run: Bonus damage on move-then-attack.',
      description: 'The mighty Warlord leads the Steppe Riders with unmatched mobility and tactical flexibility.',
    },
  },
  coral_people: {
    id: 'coral_people', name: 'Pirate Lords', color: '#2a9d8f', nativeDomain: 'Slaving', homeBiome: 'Coast',
    intro: 'The Pirate Lords are the masters of coastal raiding. They capture enemy units and turn them into assets.',
    strengths: ['Can capture enemy units', 'Coastal mobility is unmatched', 'Naval superiority'],
    weaknesses: ['Weak deep inland', 'Need coastal access'],
    tip: 'Raid coastal settlements and capture valuable units.',
    signatureUnit: 'Galley',
    specialTrait: 'Greedy',
    specialAbility: '+25 village plunder; 50% unit capture chance on kill; 40% non-combat capture; Tidal Assault: -25% enemy defense on coast',
    uniqueMechanic: 'greedy', passiveTrait: 'capturer',
    summonCondition: 'Your unit must be standing in Coast, Ocean, or City terrain.',
    unitStats: {
      attack: 3, defense: 2, health: 14, moves: 5, range: 3,
      tags: ['naval', 'ranged', 'transport'],
      ability: 'Greedy: +25 village plunder value. 50% capture chance on kill. Non-combat capture 40%. Tidal Assault: -25% enemy defense on coast.',
      description: 'The versatile Galley carries raiders across shallow waters, perfect for coastal raids and capturing enemies.'
    },
  },
  river_people: {
    id: 'river_people', name: 'River People', color: '#4f86c6', nativeDomain: 'River Stealth', homeBiome: 'River',
    intro: 'The River People treat waterways like roads. They appear anywhere along the bank without warning.',
    strengths: ['River corridors give unmatched mobility', 'River Stealth is powerful', 'Amphibious assault is devastating'],
    weaknesses: ['Getting dragged into dry fights strips advantages', 'Opponents can bait you'],
    tip: 'Map out river networks early — they\'re your highway system.',
    signatureUnit: 'Ancient Alligator',
    specialTrait: 'River Assault',
    specialAbility: 'Auto-stealth on river/swamp; +50% ambush damage from stealth; amphibious (emerge from any river hex); immune to swamp attrition',
    uniqueMechanic: 'amphibious_assault', passiveTrait: 'river_assault',
    summonCondition: 'Your unit must be standing in River, Jungle, or Swamp terrain.',
    unitStats: {
      attack: 5, defense: 2, health: 15, moves: 3, range: 1,
      tags: ['beast', 'river', 'ambush', 'amphibious'],
      ability: 'River Stealth: Auto-stealth on river/swamp tiles. +50% ambush damage from stealth. Amphibious: Can emerge from any river hex. Immune to swamp attrition.',
      description: 'The Ancient Alligator lurks beneath river surfaces, emerging to drag unlucky foes into the depths.',
    },
  },
  frost_wardens: {
    id: 'frost_wardens', name: 'Arctic Wardens', color: '#a8dadc', nativeDomain: 'Heavy Hitter', homeBiome: 'Tundra',
    intro: 'The Arctic Wardens turn the game\'s worst terrain into the best neighborhood. They thrive in cold.',
    strengths: ['Poor terrain is your advantage', 'Cold-Hardened Growth means better economics', 'Polar Bear is devastating'],
    weaknesses: ['Need cold terrain to be effective', 'Warm terrain penalties'],
    tip: 'Own the frozen positions. Let opponents fight over "good" land.',
    signatureUnit: 'Polar Bear',
    specialTrait: 'Cold-Hardened',
    specialAbility: 'Heavy Hitter: ignore 50% enemy armor; +25% defense in tundra; shortest summon cooldown (3 turns); +10% economy in poor terrain',
    uniqueMechanic: 'cold_hardened', passiveTrait: 'heavy_defense',
    summonCondition: 'Your unit must be standing in Tundra or City terrain.',
    unitStats: {
      attack: 7, defense: 3, health: 25, moves: 3, range: 1,
      tags: ['beast', 'frost', 'cold'],
      ability: 'Heavy Hitter: Ignore 50% of enemy armor. +25% defense in tundra. Cold-Hardened: +10% economy in poor terrain. Shortest summon cooldown (3 turns).',
      description: 'The mighty Polar Bear is the apex predator of the frozen north, its icy roar freezing all who oppose the Wardens.',
    },
  },
};

export function getFactionInfo(factionId: string): FactionInfo | undefined {
  return FACTION_INFO_MAP[factionId];
}