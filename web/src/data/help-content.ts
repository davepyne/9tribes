import civilizationsData from '../../../src/content/base/civilizations.json';
import pairSynergiesData from '../../../src/content/base/pair-synergies.json';

// ── Help System Content ──
// All player-facing prose for the in-game Help Panel.
// Each section is rendered as HTML (safe, curated content only).

export interface HelpSection {
  id: string;
  title: string;
  body: string; // HTML-safe prose
}

export interface TribeProfile {
  id: string;
  name: string;
  color: string;
  nativeDomain: string;
  homeBiome: string;
  behavior: string;
  intro: string;
  strengths: string[];
  weaknesses: string[];
  tip: string;
}

export interface SynergyGuideEntry {
  pairId: string;
  playerDescription: string;
}

export interface HelpContent {
  quickStart: HelpSection;
  combat: HelpSection;
  research: HelpSection;
  tribes: TribeProfile[];
  synergyGuide: SynergyGuideEntry[];
}

type CivDef = { id: string; name: string; color: string; nativeDomain: string; homeBiome: string };
const CIVS = civilizationsData as Record<string, CivDef>;

// Frontend-only tribe display text
const TRIBE_DISPLAY: Record<string, {
  behavior: string;
  intro: string;
  strengths: string[];
  weaknesses: string[];
  tip: string;
}> = {
  jungle_clan: {
    behavior: 'Attrition stalker — poisons and ambushes from cover, never fights fair',
    intro: 'The Jungle Clans wage war through attrition. Every unit they field carries poison — a damage-over-time effect that keeps hurting long after the battle ends. Enemies who disengage from a Jungle Clan fight don\'t escape clean; they limp away bleeding, making every follow-up engagement easier than the last. Their Serpent God summon radiates a far stronger poison aura than regular units, turning clustered enemy formations into death zones. Late-game Serpent Priests add stealth and area-of-effect poison to the mix, letting you assassinate key targets from inside enemy lines. Play this faction if you enjoy wearing opponents down until they collapse under accumulated wounds.',
    strengths: [
      'Poison creates compounding pressure. Even exchanges favor you because the enemy keeps taking damage after you disengage — chip away and they eventually crumble.',
      'You control where fights happen. Lure enemies into jungle terrain where your poison units thrive, then fade back as they bog down in difficult ground.',
      'Late-game Serpent Priests are devastating flankers. Stealth lets them bypass frontlines entirely, and AoE poison grenades punish grouped-up enemies caught off guard.',
    ],
    weaknesses: [
      'Your units are glass cannons — they hit hard but fold if cornered. You must dictate terms of engagement or get crushed in fair trades.',
      'Enemies who sit outside your range and bombard you neutralize poison entirely. No contact means no stacks applied.',
      'Open plains strip away your positional edge. Without dense terrain to hide in, fragile poison units have nowhere to survive an even fight.',
    ],
    tip: 'Apply early poison pressure with your spearman, then use your archer to finish off weakened targets. Save the Serpent God for moments when enemies cluster together — its poison aura punishes tight formations brutally.',
  },
  druid_circle: {
    behavior: 'Cautious defender — fortifies, heals, and waits for attackers to overcommit',
    intro: 'The Druid Circle wins wars of exhaustion. Every unit regenerates health each turn, and fighting in forests grants first-strike — meaning you attack before the enemy counters. Their Treefolk summon is the single toughest creature you can put on a battlefield, capable of anchoring a defensive line that grinds attackers into dust. Late-game Druid Wizards bring serious ranged firepower while keeping the healing and nature synergy intact. This faction doesn\'t win flashy battles; it wins by still standing when everyone else has run out of bodies. Play Druid Circle if you love defensive holds that make attackers regret every hex of progress.',
    strengths: [
      'You outlast everyone. Regeneration means your units recover between fights while enemies stay damaged — time is always on your side.',
      'Forest combat is your kingdom. First-strike, healing bonuses, and terrain synergy mean enemies who chase you into woods are fighting on your terms.',
      'The Treefolk is an unbreakable anchor. Park it at a chokepoint and watch enemy after enemy break against a wall that simply won\'t fall.',
    ],
    weaknesses: [
      'Fast cavalry kites around your regenerating line. By the time healing kicks in, they\'ve already struck and repositioned — you can\'t pin what won\'t stand still.',
      'Your offensive ceiling is modest. You\'re exceptional at not losing, but actually crushing a determined opponent takes patience and positioning.',
      'The Treefolk commits wherever you place it. It\'s powerful but immobile — once anchored, it can\'t shift to respond to threats elsewhere.',
    ],
    tip: 'Fight just inside forest edges so your units get first-strike and healing bonuses while enemies eat terrain penalties. Anchor your center on the Treefolk and let attackers wear themselves down against it.',
  },
  steppe_clan: {
    behavior: 'Aggressive skirmisher — hits fast, retreats, and never stands still',
    intro: 'The Steppe Riders never fight fair — and they don\'t have to. Every unit in their roster can attack and retreat in the same turn, meaning they choose when engagements start and stop. Their starters are faster than equivalent units from any other faction, giving them tempo control from the very first turn. The Warlord summon amplifies nearby cavalry into a blur of steel that strikes and vanishes before defenders can reposition. Mid-game Lancers add cavalry-level speed to skirmish tactics for flanking strikes that hit the exact moment enemies overcommit. Play Steppe Riders if you want to dance circles around opponents who never get a clean shot at you.',
    strengths: [
      'You own the tempo. Attack, retreat, reposition — repeat. The enemy reacts to you; you never react to them.',
      'Skirmish Pursuit rewards winning trades with bonus damage. Each successful hit-and-run chips away more than the raw numbers suggest.',
      'Your fastest units are also your starters. You don\'t need to tech up to be mobile — you\'re outrunning opponents from turn one.',
    ],
    weaknesses: [
      'Your units die if caught in a fair fight. Fragile speedsters must avoid extended exchanges or get annihilated.',
      'Fortified positions that won\'t move neuter your hit-and-run. You can\'t skirmish around an army that refuses to leave its walls.',
      'Desert Nomad camels trade favorably against you in open terrain due to their durability and swarm bonuses — avoid extended skirmishes on open ground where they can leverage those advantages.',
    ],
    tip: 'Probe with fast units to draw enemies out of position, then crash into their exposed flank with everything you have. Keep the Warlord near your main strike force — its cavalry aura turns "fast" into "unstoppable."',
  },
  hill_clan: {
    behavior: 'Methodical builder — fortifies positions, advances slowly under cover',
    intro: 'The Hill Engineers build the battlefield into a weapon. They begin the game with Fortification already mastered — a free head start no other faction gets. Their fortress-tagged units project a defensive aura to all adjacent allies, meaning clustering your forces makes every single unit tougher. The Siege Golem summon is the hardest-hitting creature you can call onto any field, and late-game Catapults let you pound enemies from outside their retaliation range. This faction doesn\'t chase victories — it builds positions so formidable that enemies break themselves trying to crack them. Play Hill Engineers if you want to make attackers pay for every hex of ground.',
    strengths: [
      'Free Fortification research gives you a structural edge from day one. Your forts are stronger and cheaper than anyone else\'s.',
      'The bulwark aura means your whole army benefits from sticking together. Cluster near fortress units and every adjacent ally gains defense.',
      'Your starter infantry trades better than almost any other faction\'s opener. You win early skirmishes through sheer durability.',
      'The Siege Golem is the ultimate anchor — nothing else matches its combination of durability and offensive presence.',
    ],
    weaknesses: [
      'You\'re glacially slow. Armies that refuse to engage can raid around your static positions while you plod toward threats you can\'t reach.',
      'Caught in open ground away from forts, your units lose what makes them special. You\'re average at best outside prepared positions.',
      'Catapults can\'t contribute to your defensive network — your best siege tool can\'t build the forts that define your strategy.',
    ],
    tip: 'Fortify hill chokepoints on turn one and cluster your forces around them. The bulwark aura multiplies your defensive strength the tighter you group. Save the Siege Golem for the moment enemies commit their main assault — it turns a desperate hold into an impenetrable wall.',
  },
  coral_people: {
    behavior: 'Opportunistic raider — raids coasts, captures units, snowballs through theft',
    intro: 'The Pirate Lords are the only faction that starts with three units — giving them more board presence than anyone else from moment one. Their defining gimmick is capture: instead of killing enemies, they enslave them and add those units to their own roster. Every raid feeds their economy through the Greedy passive, and they begin the game with Seafaring already researched alongside doubled city wall defenses. Their signature <strong>Galley</strong> summon is a formidable naval warship that anchors their mid-game fleet. Naval units gain bonuses when assaulting from water to land, making coastal cities vulnerable to lightning strikes they can\'t see coming. Play Pirate Lords if you want to snowball through theft — every enemy you defeat makes you stronger.',
    strengths: [
      'Three starting units give you immediate tactical flexibility that no other faction matches — infantry, ranged, and naval coverage from turn one.',
      'Capture turns enemy strength into yours. Every enslaved unit joins your roster, and each capture pays economic dividends on top.',
      'Naval dominance is built-in. Free Seafaring research, tougher coastal cities, and amphibious assault bonuses make you ruler of the coastline.',
      'Pistol weaponry hits hard at close range without risking retaliation — a unique combat tool nobody else has access to.',
    ],
    weaknesses: [
      'Inland maps gut your identity. No water means no naval mobility, no amphibious flanking, and half your economic engine goes quiet.',
      'Individual land units are mediocre. You win through numbers and captures, not elite unit quality — fair fights go badly.',
      'Opponents who turtle far from the coast starve your raid economy. No coastal targets means no Greedy payouts.',
    ],
    tip: 'Use your trireme to ferry troops for early coastal drops while opponents are still walking into position. Chain raids along the shoreline — each captured settlement funds the next wave. Target wounded enemies for capture attempts and watch your stolen army grow.',
  },
  desert_nomads: {
    behavior: 'Mobile striker — exploits terrain gaps, swarms in open ground',
    intro: 'The Desert Nomads treat the harshest terrain on the map as home turf. They ignore all movement penalties in desert, striking from angles that other factions physically cannot reach. Their camel units hard-counter horse cavalry — crushing Steppe Riders and Savannah chariots in direct confrontations. When camel units cluster together, they grow stronger through a swarm bonus that rewards keeping your army tight. Late-game Immortals are self-regenerating anchors that refuse to die. Play Desert Nomads if you want to own terrain that everyone else avoids and counter the fastest factions in the game.',
    strengths: [
      'Desert is your highway. Strike from directions enemies thought were impassable — they avoid the sands while you sprint through them.',
      'Your camel units trade well against cavalry in open terrain thanks to durability and swarm bonuses, giving you an edge against Steppe Riders and Savannah charge armies on favorable ground.',
      'Clustering your camel army activates swarm bonuses — the tighter your formation, the tougher and harder-hitting every unit becomes.',
      'Your starter camel is durable and mobile — it trades well against almost any opening unit and reaches fights others can\'t get to in time.',
    ],
    weaknesses: [
      'Enemies dug into rough terrain box you in completely. If they won\'t leave hills or forests, your mobility advantage means nothing.',
      'Maps light on desert reduce your uniqueness considerably. You\'re still functional, but you lose the terrain identity that defines you.',
      'Your late-game anchors are slow despite their toughness — they hold ground but can\'t pursue fleeing enemies.',
    ],
    tip: 'Keep your camel units grouped to maintain swarm bonuses, and use desert corridors to bypass enemy front lines entirely. Against cavalry factions, seek open-ground engagements where your durability and swarm advantages give you the edge.',
  },
  savannah_lions: {
    behavior: 'Shock charger — commits fully to devastating frontal assaults',
    intro: 'The Savannah Lions decide battles in a single collision. Their playstyle is pure momentum — commit fully, hit hard, and end the fight before the enemy recovers. Their mid-game War Chariots are the fastest units in existence, able to reposition faster than any opponent can react. Late-game War Elephants smash through fortified positions with stampede knockback and siege-breaker traits that crumble walls other factions spend turns battering down. Charge Momentum amplifies damage when you commit to the attack — the harder you go in, the more it hurts. Play Savannah Lions if you want thunderous, decisive engagements where one good charge ends the battle.',
    strengths: [
      'Opening impact is devastating. Your melee starter hits harder than any other faction\'s — you win initial trades through raw aggression.',
      'War Chariots outmaneuver everything. Nothing catches them, and their speed lets you pick exactly where and when the battle happens.',
      'War Elephants crack fortified positions that stall other armies. Stampede knockback and siege-breaker traits make walls and spears feel optional.',
      'Charge Momentum rewards commitment. The deeper you commit to an assault, the more damage it deals — hesitation is punished, boldness rewarded.',
    ],
    weaknesses: [
      'Disciplined anti-large formations shred your signature units. Spear walls braced for impact and focused missile fire turn elephants into expensive casualties.',
      'Rough terrain kills your momentum dead. Forests, hills, and jungles slow you to a crawl where charge bonuses don\'t exist.',
      'Your units are fragile on the defensive. They hit hard but can\'t absorb counterattacks — a failed charge leaves you exposed and hurting.',
    ],
    tip: 'Never charge headlong into a prepared position. Use your chariots\' speed to outmaneuver enemies into exposing their flank, then commit the elephants from the angle they least expect. One good charge from the side ends fights that frontal assaults would lose.',
  },
  river_people: {
    behavior: 'Stealth ambusher — strikes from water, vanishes, controls sight lines',
    intro: 'The River People fight from angles the enemy can\'t cover. Waterways become their road network — invisible approach vectors that let forces appear anywhere along a bank without warning. Their River Assault passive tips routine fights in their favor whenever water is nearby, and their stealth capabilities let them ambush enemies who thought they knew where the threat was. The Ancient Alligator summon lurks in river crossings waiting to drag unsuspecting prey underwater. At higher tiers, stealth units can cloak nearby allies for coordinated surprise strikes. Play River People if you want to control sight lines and strike from directions enemies left unguarded.',
    strengths: [
      'Rivers are your highway system. Move forces along water faster than any land route, appearing where defenders aren\'t looking.',
      'Stealth lets you pick which fight happens and when. Ambush enemies who thought they were safe, then vanish before reinforcements arrive.',
      'Cities bisected by water are sitting ducks. Strike from the river side while defenders watch the land approaches — classic envelopment they can\'t defend against.',
      'Fights near water naturally tilt your way. Seek riverbanks and crossings to stack the deck in routine engagements.',
    ],
    weaknesses: [
      'Dry inland ground strips away every advantage. Without water nearby, you\'re fighting on even terms — and "even" isn\'t where you want to be.',
      'Opponents who recognize your river dependency can bait you into bad terrain. Don\'t chase victories too far from water.',
      'Your power scales with map features. Maps sparse on rivers or waterways significantly reduce what makes you dangerous.',
    ],
    tip: 'Map the river network before committing forces — it dictates every approach you have available. Hide the Ancient Alligator in a river hex near a crossing point and let enemies walk into it. At higher stealth tiers, keep a hidden scout behind your vanguard to cloak the entire contact point for surprise-strike pressure.',
  },
  frost_wardens: {
    behavior: 'Patient anchor — claims territory slowly, holds ground through sheer durability',
    intro: 'The Arctic Wardens turn the map\'s worst land into their best asset. While other factions fight over fertile heartland, the Wardens claim frozen wasteland that nobody else wants — and build functioning economies on it. Their heavy units hit harder and last longer than anything else on the field, with the Polar Bear summon ranking among the toughest creatures in existence. Their Heavy Hitter domain shatters fortified positions, reflects damage back at attackers, and eventually ignores armor entirely. This is a slow-burn faction that rewards claiming ignored territory and grinding down opponents through superior durability. Play Arctic Wardens if you want to win the war of attrition that starts on turn one.',
    strengths: [
      'You thrive where others starve. Claim frozen and marginal territory that opponents write off, then build a quiet economic base they never notice growing.',
      'Heavy units dominate sustained fights. You may not arrive first, but whatever you hit stays hit — trading blows with your heavies is a losing proposition.',
      'Economic resilience on poor land lets you weather setbacks that cripple other factions. Your infrastructure survives in places theirs cannot.',
      'The Polar Bear is an endgame anchor that controls space through raw presence alone. Few things willingly approach it.',
    ],
    weaknesses: [
      'Factions that snowball economies on fertile land will eventually drown you in numbers if left unchecked. Your resilience has limits.',
      'Fast factions claim key positions while you\'re still marching into position. You must plan expansion routes carefully or get outpaced.',
      'Your heavies are vulnerable to being kited around the battlefield. Mobile enemies can choose where and when to engage — and you can\'t force the issue.',
    ],
    tip: 'Claim frozen and marginal hexes that other factions ignore — your economy works on land they consider worthless. Let opponents bleed each other fighting over the fertile center while you build a quiet power base they won\'t notice until it\'s too late.',
  },
};

// Player-facing synergy descriptions (frontend-only prose — not duplicating JSON mechanic text)
const SYNERGY_PLAYER_DESCRIPTIONS: Record<string, string> = {
  'venom+fortress': 'Your fortress units leak poison into the air around them. Anything standing within 1 hex takes 2 damage per turn — no attack needed. Phenomenal for holding choke points. Enemies can\'t approach without burning.',
  'venom+charge': 'Charging with venom doubles your poison duration. Enemies knocked back land in their new position already coated in toxins. Essential for elephant poison builds — every charge is a two-for-one.',
  'venom+hitrun': 'After a hit-and-run retreat, your unit leaves a poison trap on the hex it just vacated. Pursuers step right into 2 damage per turn plus a movement slow. Great for baiting aggressive enemies into a death march.',
  'venom+tidal_warfare': 'Naval poison units contaminate coastal hexes, dealing 2 damage per turn to anything standing on the shore. Zone control from the water. Forces enemies to abandon coastline positions or burn.',
  'venom+nature_healing': 'Poisoned enemies heal at only 50% effectiveness. This shuts down druid stacking and regeneration builds completely. Pair with sustained poison pressure to make attrition fights unwinnable for the opponent.',
  'venom+river_stealth': 'A stealth ambush backed by venom deals double damage, instantly applies 2 poison stacks, and costs the victim 1 action point to respond. The hardest opener in the game. Devastating when you control sight lines.',
  'venom+camel_adaptation': 'Camel poison units weaponize difficult terrain itself. Enemies standing in desert or mountain hexes near your camel take 2 passive poison damage per turn. Turns the map against them. Niche but oppressive on desert-heavy maps.',
  'venom+slaving': 'Captured units are poisoned at 3 damage per turn, making them ticking time bombs. Your slave armies gain +25% damage output but heal at only half rate — disposable shock troops that hit harder than they should.',
  'venom+heavy_hitter': 'Heavy strikes ignore 50% of enemy armor when the target is already poisoned. Every poison stack amplifies the heavy hit further. Stack poison first, then send in the hammer. Core combo for any poison-focused army.',
  'venom+venom': 'Poison damage multiplies instead of stacking linearly. Two poison sources deal 3× damage; three sources hit 6×. The scaling is absurd. Building around double-venom is the fastest way to melt anything with HP.',
  'fortress+charge': 'Charging near fortress allies grants a charge shield — the first hit after you charge deals zero damage to you. Lets elephant units dive into enemy lines without fear. Incredible for aggressive fortress plays.',
  'fortress+hitrun': 'After retreating, the unit digs in for one turn with +75% defense. You get the mobility of skirmish and the resilience of a fortification in alternating turns. Punishes enemies who chase without thinking.',
  'fortress+tidal_warfare': 'Naval fortress units project a +30% defense aura onto adjacent land hexes. Park your ships near the coast and your land forces fight like they\'re behind walls. Excellent for amphibious defensive positions.',
  'fortress+nature_healing': 'Combining fortress and healing creates a 2-hex healing aura where allies recover 3 HP per turn. The tradeoff: the unit cannot be moved. Think of it as a mobile hospital that becomes stationary once deployed.',
  'fortress+river_stealth': 'A stealth fortress is invisible until it attacks or an enemy walks adjacent. Imagine a fortification that doesn\'t exist — until you\'re already next to it. Brutal ambush defense. Enemies never see the wall coming.',
  'fortress+camel_adaptation': 'Camel fortress units ignore terrain penalties and project a fortress aura on desert hexes. Build fortifications where nobody else can, with +30% defense in the harshest terrain. Desert maps become your fortress.',
  'fortress+slaving': 'Fortress units guarding captured slaves gain +50% defense, and those slaves cannot escape. Build a prison that literally cannot be broken. Great for locking down high-value captives deep in your territory.',
  'fortress+heavy_hitter': 'Heavy units in fortress formation reflect 25% of incoming damage back to attackers and cannot be displaced by knockback. An immovable wall that punishes you for hitting it. Core defensive anchor for late-game armies.',
  'fortress+fortress': 'Overlapping fortress auras stack at +50% each instead of the normal +30%. Cluster your fortress units to create zones where the defense bonus scales exponentially. The more forts you stack, the harder the position becomes.',
  'charge+hitrun': 'Units with both charge and skirmish can charge, retreat, and charge again in the same turn if they have the movement points. Hit-and-run on steroids. The mobility ceiling is absurd if you manage your action economy well.',
  'charge+tidal_warfare': 'Naval charges become devastating rams that knock enemy ships 1 hex back. Combines charge burst damage with positional disruption on the water. Dominates ship-to-ship combat and pushes enemies into worse positions.',
  'charge+nature_healing': 'Charging units near healers recover 100% of the damage they deal as HP. You charge in, deal massive damage, and come out healthier than you went in. The ultimate sustain charge combo. Nearly unkillable on offense.',
  'charge+river_stealth': 'Charging from stealth deals +50% damage from surprise, but reveals you until your next turn. One devastating alpha strike per stealth cycle. Best used to eliminate high-value targets before they can react.',
  'charge+camel_adaptation': 'Camel charges through desert deal 2 AoE damage to adjacent enemies and raise a sandstorm that gives all nearby enemies -25% accuracy. Area denial on top of burst damage. Phenomenal for desert battles where you charge into clusters.',
  'charge+slaving': 'Charge attacks have a 30% chance to capture the target instead of killing it. Captured units join your faction immediately. Every charge is a recruitment drive. Build elephant-cavalry armies and watch your roster grow mid-fight.',
  'charge+heavy_hitter': 'Heavy charges deal massive knockback and stun enemies for 1 full turn. The charger also ignores opportunity attacks when moving through enemy zones. Nothing stops the momentum. Devastating against fortified positions.',
  'charge+charge': 'When two or more charge units attack from adjacent hexes simultaneously, the knockback becomes a 2-hex push and stuns for 1 turn. Formation charges become artillery. Coordinate your elephants for maximum impact.',
  'hitrun+tidal_warfare': 'Naval hit-and-run units retreat into water after attacking. Land-based enemies cannot retaliate. Attack from the shore, vanish into the waves. Perfect for coastal harassment — hit docks and coastal cities with impunity.',
  'hitrun+nature_healing': 'Skirmish units heal for 3 HP every time they retreat. Chip away at the enemy, fall back, recover, and repeat. Sustained harassment with built-in sustain. Very hard to kill if you alternate attacks and retreats.',
  'hitrun+river_stealth': 'Stealth skirmishers automatically re-enter stealth after attacking and retreating — no cooldown, no delay. Perpetual hit-and-run from the shadows. The enemy never knows where the next strike comes from. Core stealth build.',
  'hitrun+camel_adaptation': 'Horse and camel skirmishers can retreat through impassable terrain — mountains, cliffs, any obstacle. You can chase them, but you can\'t follow. Elite kiting on rough terrain maps. Nearly impossible to pin down.',
  'hitrun+slaving': 'Hit-and-run attacks have a 15% chance to capture wounded enemies below 50% HP. Weaken them with skirmish fire, then snatch them on retreat. Slow but reliable slave generation from any fight you\'re winning.',
  'hitrun+heavy_hitter': 'Heavy units with skirmish take 30% less damage when retreating and can retreat through enemy-occupied hexes. A heavy that can disengage at will and barely takes damage doing so. Breaks the usual heavy unit weakness of getting surrounded.',
  'hitrun+hitrun': 'Skirmish units that retreat near another skirmish ally gain +1 movement on their next turn. Swarm coordination — the more skirmishers you field, the faster they all become. Scales with army size. Core for skirmish-focused compositions.',
  'tidal_warfare+nature_healing': 'Naval healing units project a 2-hex healing aura from water onto adjacent land hexes. Friendly land units near your ships heal 2 HP per turn. Park your healer ships near the front line for mobile field hospitals.',
  'tidal_warfare+river_stealth': 'Stealth naval units can make amphibious landings without breaking stealth. Disembark invisible troops directly onto the beach. Perfect for coastal invasions — the enemy sees your ships but not the forces you\'ve already landed.',
  'tidal_warfare+camel_adaptation': 'Camel units adjacent to water gain +25% defense and +1 movement. They patrol desert and shoreline with equal ease. Versatile for maps with mixed terrain. Strong for defending coastal desert cities.',
  'tidal_warfare+slaving': 'Naval units gain +30% capture chance on coastal hexes. Raid enemy shores and drag captives back to your ships. Naval slave raids are fast, safe, and highly productive. Core combo for coastal slaver strategies.',
  'tidal_warfare+heavy_hitter': 'Heavy naval units deal massive ram damage and ignore enemy armor entirely. Ship-to-ship, nothing survives a heavy ram. Your heavy ships become battering rams that shred armor. Dominates any naval engagement.',
  'tidal_warfare+tidal_warfare': 'Multiple naval units in formation project an extended control zone — all enemy ships within 3 hexes of any fleet member suffer -20% attack. Fleet coordination suppresses enemy navy just by existing near them. Numbers matter.',
  'nature_healing+river_stealth': 'Stealth healers can restore HP without breaking their stealth state. Heal your army from the shadows, invisible and untouchable. The enemy can\'t prioritize your healers if they can\'t see them. Core for stealth support builds.',
  'nature_healing+camel_adaptation': 'Camel healing units create an oasis: the hex they occupy and all adjacent hexes count as neutral terrain for movement. Your entire army ignores terrain penalties near the healer. Mobile terrain conversion. Incredibly strong on harsh maps.',
  'nature_healing+slaving': 'Slave units regenerate 2 HP per turn but deal 25% less damage. Slaves near healing units heal at double rate. Keeps your expendable units alive longer at the cost of offensive output. Ideal for slave-wall strategies.',
  'nature_healing+heavy_hitter': 'Heavy units regenerate 30% of all damage they deal as HP. The harder they hit, the more they heal. Sustain through prolonged fights just by swinging. Turns heavy units into self-healing juggernauts. Core combo for heavy sustain builds.',
  'nature_healing+nature_healing': 'Double healing sources create a massive 3-hex aura: allies within range heal 4 HP per turn, and the unit itself regenerates 6 HP per turn. The strongest healing in the game. Build your entire army around protecting this unit.',
  'river_stealth+camel_adaptation': 'Camel stealth units in desert terrain are permanently invisible — no cooldown, no proximity reveal, nothing. Desert becomes a kill zone where your enemies literally cannot see the threat. Map-defining on desert-heavy worlds.',
  'river_stealth+slaving': 'Stealth attacks have a 40% chance to capture enemies instead of killing them, and captured units don\'t alert nearby enemies. Silent recruitment from the shadows. Extremely high-value for building slave armies without triggering alarms.',
  'river_stealth+heavy_hitter': 'Heavy attacks from stealth permanently shred 100% of enemy armor. One hit from stealth and the target has zero armor for the rest of the fight. The ultimate assassin opener. Send in the heavy stealth unit first, then everyone else benefits.',
  'river_stealth+river_stealth': 'Multiple stealth units within 3 hexes share stealth state. Killing or revealing one reveals nothing about the others. Shadow networks make your stealth units exponentially harder to root out. The more you field, the stronger the system becomes.',
  'camel_adaptation+slaving': 'Slave caravans move 1 hex faster across desert terrain and traverse any desert without penalty. Logistics solved for desert maps. Keeps your slave economy flowing even through the harshest terrain. Essential for desert slaver strategies.',
  'camel_adaptation+heavy_hitter': 'Heavy camel units project a sandstorm aura with 2-hex radius, inflicting -30% accuracy on all enemies inside. Your heavy units become walking weather systems that blind the enemy. Dominates open desert battles where positioning is everything.',
  'camel_adaptation+camel_adaptation': 'Horse and camel units within 3 hexes share terrain ignore — if one unit can traverse a terrain type, all units in the network can. Terrain mastery spreads through proximity. Scales beautifully with larger armies. Core for any terrain-heavy strategy.',
  'slaving+slaving': 'Multiple slave units fighting together gain +25% attack but suffer -15% defense. Quantity over quality — your slave swarm hits harder as it grows. Risky if caught out, but devastating when you have numbers. Core for slave army compositions.',
  'slaving+heavy_hitter': 'Heavy units commanding slaves boost slave damage by 50%, and nearby slaves cannot rout. Your enforcers keep the fodder in line and hitting hard. The backbone of any serious slave army. Always keep heavy units near your slave clusters.',
  'heavy_hitter+heavy_hitter': 'Heavy units fighting together knock enemies back 1 hex on every single hit. The front line becomes a battering ram that shoves everything backward. Disrupts enemy formations with every exchange. Core for heavy-heavy compositions.',
};

export const helpContent: HelpContent = {
  quickStart: {
    id: 'quick-start',
    title: 'Quick Start',
    body: `
<h3>Welcome, Commander</h3>
<p>You're looking at a war map populated by rival factions. There are two ways to win: <strong>eliminate</strong> all rival tribes, or <strong>control over half the cities</strong> on the map (domination — 51% threshold). Expand your territory, build cities, and crush the competition. Here's everything you need to play your first few turns.</p>

<h3>Moving Units</h3>
<p><strong>Click</strong> any of your units to select it. You'll see highlighted hexes showing where it can move. <strong>Right-click</strong> a highlighted hex (or click it directly) to send your unit there. Each unit has limited movement per turn — use it wisely.</p>

<h3>Attacking Enemies</h3>
<p>When a unit is selected, enemy units within range will be highlighted as attack targets. <strong>Click an enemy</strong> to attack. Combat resolves instantly: the attacker deals damage, then the defender <strong>counter-attacks</strong> (unless destroyed). Terrain, unit type, and faction abilities all affect the outcome.</p>

<h3>Turn Flow</h3>
<p>During your turn, activate each unit — move, attack, or both. When you're done, click <strong>End Turn</strong> in the command tray at the bottom of the screen. The AI factions take their turns, then control returns to you.</p>

<h3>Building &amp; Expanding</h3>
<p>Select a unit near a suitable hex to <strong>found a city</strong>. Cities produce new units over time. You can possess up to <strong>3 cities total</strong> — plan their placement carefully. If you capture an enemy city by moving a unit onto it, the city is <strong>razed to the ground</strong> (you never take possession). However, the unit that captured it <strong>learns of their culture</strong>, gaining that faction's domain. <strong>Hill Engineers</strong> can build field forts to secure strategic positions — these grant defensive bonuses and project unignorable Zone of Control.</p>

<h3>Opening Panels</h3>
<ul>
  <li><strong>Reports</strong> — Click the <em>Reports</em> menu to see faction summaries, supply logistics, combat logs, and AI intents.</li>
  <li><strong>Research</strong> — Click the <em>Research</em> chip in the top bar (or use Reports → Research Tree) to open the Domain Research panel. Choose which domain receives your focused research (1 XP/turn). All other known domains advance automatically from terrain and combat.</li>
  <li><strong>Help</strong> — You're reading it! Click <em>Help → How to Play</em> anytime to return here.</li>
</ul>

<h3>What's Next?</h3>
<p>Once you've got the basics down, dig into <strong>Synergies</strong> — the deep strategic system that lets you combine abilities from different factions for devastating combos. Check the Synergies tab to learn more.</p>
`,
  },

  combat: {
    id: 'combat',
    title: 'Combat',
    body: `
<h3>How Combat Works</h3>
<p>Combat in War &amp; Civilization is straightforward: <strong>select a unit</strong>, then <strong>click an enemy</strong> within attack range. Your unit deals damage based on its attack stat, and then the defender <strong>counter-attacks</strong> — unless you killed them outright. <strong>Ranged attacks never trigger counter-attacks</strong> — archers and gunners fire safely from a distance. Three big factors shape every fight: terrain, unit type, and faction abilities. A hilltop archer fights very differently than a plains cavalryman.</p>

<h3>Terrain Effects</h3>
<p>The ground under your feet matters. <strong>Forests, hills, and fortifications</strong> grant defense bonuses that make units significantly harder to damage. A unit dug in behind walls or perched on high ground can hold off forces twice their size. On the flip side, open plains leave you fully exposed — great for charging, terrible for surviving.</p>
<p>Some factions laugh at terrain penalties. <strong>Desert Nomads</strong> treat sand dunes like paved roads, and <strong>Jungle Clans</strong> move through dense vegetation without penalty. If you're fighting them on their home turf, don't expect terrain to save you.</p>

<h3>Opportunity Attacks</h3>
<p>Most units project a <strong>Zone of Control (ZoC)</strong> over adjacent hexes. If you march through an enemy-controlled hex, that unit may get a <strong>free opportunity attack</strong> — no action required. Key exceptions: <strong>routed and dead units don't project ZoC</strong>, naval units don't exert ZoC on land units (and vice versa), and <strong>mounted units ignore normal ZoC</strong> when moving (though they can still be hit by opportunity attacks). Only <strong>melee units</strong> can deliver opportunity attacks, and these deal <strong>25% of a normal attack's damage</strong> (40% from fortifications). Field forts project unignorable ZoC that even mounted units cannot bypass. Plan your routes carefully, or you'll arrive already nicked up.</p>

<h3>Skirmish Pursuit</h3>
<p>Factions with the <strong>Skirmish Pursuit</strong> domain press their advantage in combat. When one of their units deals more damage than it takes in an exchange, they deal <strong>+2 bonus damage</strong> — pressing the wound before the enemy can recover. This rewards winning trades and makes skirmishers dangerous in sustained exchanges where they consistently come out ahead. Combined with research upgrades that add mobility and disengage options, pursuit forms the foundation of a hit-and-run playstyle built around attrition through repeated favorable exchanges.</p>

<h3>Morale &amp; Rout</h3>
<p>Units aren't mindless — each has a <strong>morale</strong> stat starting at 100. Taking damage reduces morale, and when it drops below 25, the unit may <strong>rout</strong> — flee the battlefield entirely. A routed unit fights at 25% strength with a desperate attack penalty. It can rally if morale recovers above 60. Keep your units' morale healthy, and watch for enemies who are one good hit away from breaking. Nearby ally deaths also cause morale loss, so clustered formations can trigger cascade routs. Certain synergy effects can adjust the rout threshold.</p>

<h3>Melee Advance</h3>
<p>When a <strong>melee attacker</strong> kills an enemy unit (and survives), it <strong>advances into the defender's hex</strong>. Ranged attackers and capture outcomes don't trigger this — only a clean melee kill. This means successful melee pushes your line forward automatically, which is critical for controlling key terrain after engagements.</p>

<h3>How Synergies Change Combat</h3>
<p>Here's where things get wild. <strong>Synergies</strong> are combo abilities that activate when a unit carries tags from two different domains. Think of them as hidden power-ups unlocked by mixing playstyles. Here are three to get your imagination going:</p>

<p><strong>Toxic Bulwark</strong> <em>(Venom + Fortress)</em> — Your fortress units radiate a poison zone. Enemies standing next to them take 2 damage per turn even without being attacked. Park one at a choke point and watch the enemy wither as they try to push through. You don't even need to lift a finger.</p>

<p><strong>Unstoppable Momentum</strong> <em>(Charge + Heavy)</em> — Heavy charges deal massive knockback and stun enemies for a full turn. The enemy can't move, can't attack, can't retreat. Perfect for smashing through fortified lines and creating chaos in the back row.</p>

<p><strong>Death from the Shadows</strong> <em>(Venom + Stealth)</em> — Stealth ambushes with poison deal double damage and instantly apply 2 poison stacks. The enemy doesn't see it coming — and by the time they notice, they're already dying. This is the assassin's dream combo.</p>

<h3>Explore Them All</h3>
<p>There are 55 pair synergies and even more emergent triple-stack combos that trigger when you stack three domain tags on a single unit. Every combination opens a new strategic door. Check the <strong>Synergies</strong> tab to browse them all and plan your faction's build.
`,
  },

  research: {
    id: 'research',
    title: 'Research & Synergies',
    body: `
<h3>The Big Picture</h3>
<p>You start with your faction's <strong>native domain</strong> — its T1 is unlocked automatically. Everything else comes from war and the land. Technology in 9 Tribes runs on two <strong>parallel tracks</strong> that never overlap:</p>
<ul>
  <li><strong>Technology Track (Research)</strong> — what domains you can study and build units from. Earned via ecology assimilation, exposure, or absorption. Foreign T1 always costs scaled XP.</li>
  <li><strong>Synergy Track (Sacrifice)</strong> — what domains activate pair/triple combat synergies. Earned ONLY by sacrificing a unit that learned enemy abilities in combat. Gives zero technology.</li>
</ul>
<p>Your base research rate is only 1 XP/turn on your chosen focus, but terrain presence and combat multiply that dramatically across every domain you know simultaneously.</p>

<h3>Learn by Kill</h3>
<p>When your units destroy an enemy, there's a chance they'll <strong>learn</strong> one of that enemy's faction domains. The chance scales with veterancy: <strong>Green 12%</strong>, <strong>Seasoned 20%</strong>, <strong>Veteran 28%</strong>, <strong>Elite 35%</strong>. Each unit can hold up to <strong>3 learned abilities</strong>. You can't learn your own faction's domains.</p>
<p>Your faction's <strong>capability level</strong> in a domain also boosts learn chance. There are three tiers:</p>
<ul>
  <li><strong>Tier 1 (cap 10):</strong> +5% learn chance</li>
  <li><strong>Tier 2 (cap 30):</strong> +10% learn chance</li>
  <li><strong>Tier 3 (cap 60):</strong> +15% learn chance</li>
</ul>
<p>Capabilities build up passively from terrain and combat, so a faction that has fought extensively against venom units becomes better at absorbing venom knowledge from future kills.</p>

<h3>Capture a City, Learn Its Culture</h3>
<p>Capturing an enemy city by moving a unit onto it <strong>razes the city to the ground</strong> — you never take possession. But the unit that took it <strong>learns of their culture</strong>, gaining that faction's domain as a learned ability. This is a reliable way to acquire a foreign domain from a faction you're at war with, especially if their units are avoiding combat.</p>

<h3>Three Paths to Domain Awareness</h3>
<p>A domain enters your <strong>research tree</strong> (technology track) through three paths. All three add the domain to your learned list — but <strong>none of them grant T1 for free</strong>:</p>
<ul>
  <li><strong>Ecology Assimilation (passive):</strong> Your ecology system passively grinds XP toward foreign domain T1 nodes. The cost <strong>scales with each new domain</strong>: 20 XP for your first foreign domain, 40 for the second, 60 for the third, and so on. Terrain affinity, enemy proximity, and combat all feed this progress automatically each turn. Once the scaled cost is paid, T1 completes and the domain becomes fully researchable (T2, T3). There is <strong>no cap</strong> on how many domains you can assimilate.</li>
  <li><strong>Exposure (proximity):</strong> When your units sit within 2 hexes of enemies, your faction accumulates exposure points per contact per turn. Crossing the threshold (<strong>20</strong> for the first foreign domain, <strong>120</strong> for the second, <strong>200</strong> for the third) adds the domain to your learned list immediately — but T1 still requires paying the scaled ecology cost. Exposure gives you <strong>awareness</strong>, not technology.</li>
  <li><strong>Absorption (city capture):</strong> Capturing an enemy city teaches the capturing unit that faction's domain. Like exposure, this adds the domain to your learned list — T1 must still be earned via ecology at the scaled cost.</li>
</ul>

<h3>Sacrifice — The Synergy Track (Separate from Technology)</h3>
<p>This is critical: <strong>sacrifice gives synergies, not technology</strong>. When a unit has learned enemy abilities (from kills or city capture), you may <strong>sacrifice it at a friendly city</strong> (not under siege). The unit survives — its abilities are stripped, but it lives. What sacrifice actually does:</p>
<ul>
  <li><strong>Grants synergy eligibility</strong> for the learned domains — they now count toward pair and triple combat synergies.</li>
  <li><strong>Evaluates triple stacks</strong> — if you have 3+ sacrifice-eligible domains at T2 matching an emergent pattern, the Emergent Rule activates.</li>
  <li><strong>Does NOT</strong> add domains to your research tree. Does NOT complete T1. Does NOT grant any technology.</li>
</ul>
<p>Your native domain is always synergy-eligible. Only sacrifice (and your native domain) unlock synergies — ecology, exposure, and absorption give tech access but <strong>never</strong> synergies.</p>

<h3>Ecology-Driven Research</h3>
<p>All known domains progress simultaneously every turn, driven by three ecological sources:</p>

<h4>Terrain Affinity</h4>
<p>Each domain has specific terrain types where it thrives. Units and city territory on matching terrain generate research progress for that domain. The per-hex bonus scales with how rare that terrain is on the map:</p>

<table>
  <tr><th>Terrain</th><th>XP/hex</th><th>Domain</th></tr>
  <tr><td>Hill</td><td>+0.25</td><td>Fortress</td></tr>
  <tr><td>Coast</td><td>+0.25</td><td>Tidal Warfare, Slaving</td></tr>
  <tr><td>Plains</td><td>+0.50</td><td>Skirmish Pursuit</td></tr>
  <tr><td>Savannah</td><td>+0.50</td><td>Charge</td></tr>
  <tr><td>Forest</td><td>+0.50</td><td>Nature Healing</td></tr>
  <tr><td>Desert</td><td>+0.50</td><td>Camel Adaptation</td></tr>
  <tr><td>Ocean</td><td>+0.50</td><td>Tidal Warfare, Slaving</td></tr>
  <tr><td>Tundra</td><td>+1.00</td><td>Heavy Hitter</td></tr>
  <tr><td>River</td><td>+1.75</td><td>River Stealth</td></tr>
  <tr><td>Jungle</td><td>+1.75</td><td>Venom</td></tr>
  <tr><td>Swamp</td><td>+2.00</td><td>River Stealth</td></tr>
  <tr><td>Oasis</td><td>+2.00</td><td>Camel Adaptation</td></tr>
  <tr><td>Mountain</td><td>+3.00</td><td>Fortress (impassable — city territory only)</td></tr>
</table>

<p>Terrain bonuses are capped at <strong>+5 XP per domain per turn</strong>. Your city territory on matching hexes also contributes — expanding into rare terrain is a powerful research strategy.</p>

<h4>War Proximity</h4>
<p>When your units are within 2 hexes of enemy forces, each contact generates <strong>+0.5 XP per turn</strong> toward that enemy faction's native domain (if you've already learned it). This rewards aggressive positioning and border warfare.</p>

<h4>Combat Bonus</h4>
<p>Every battle — win or lose — grants <strong>+1.0 XP</strong> toward the opponent's native domain (if you've already learned it). Both attacker and defender receive this bonus. Fighting is the most concentrated source of research progress.</p>

<h3>Base Research Rate</h3>
<p>In addition to ecology, you have a <strong>focused research slot</strong> that contributes 1 XP/turn to whichever domain you choose. This is your only manually directed research — everything else is automatic. AI factions research faster (2–3 XP/turn base) to compensate for lack of human strategic planning.</p>

<h3>The Research Tree — Three Tiers</h3>
<ul>
  <li><strong>T1 — Foundation (scaled cost):</strong> Your first foreign domain costs 20 XP via ecology, the second 40, the third 60, and so on. T1 unlocks the domain for research progression but does <strong>not</strong> activate synergies on its own.</li>
  <li><strong>T2 — Mastery (60 XP):</strong> Enhanced domain effects. T2 is required alongside <strong>sacrifice eligibility</strong> for <strong>Emergent Rule</strong> activation — you need both T2 completion AND sacrifice-granted synergy eligibility for a domain to count toward triple-stack patterns.</li>
  <li><strong>T3 — Transcendence (100 XP):</strong> The ultimate domain effect. Each domain has a unique T3 bonus, with an extra-powerful version for your <strong>native</strong> domain. T3 deepens one domain but does not unlock new synergy tiers.</li>
</ul>

<h3>Pair Synergies (55 total)</h3>
<p>Pair synergies activate when your faction holds <strong>synergy eligibility</strong> for two different domains (from sacrifice or native) AND has completed <strong>T1 or higher</strong> in both. Simply knowing a domain via ecology/exposure is not enough — you must have sacrificed a unit that carried that domain's abilities (or it's your native domain). For example, a unit with both <em>poison</em> and <em>fortress</em> tags gains <strong>Toxic Bulwark</strong> only when both Venom and Fortress are sacrifice-eligible (or native) at T1+. Check the <strong>Synergies</strong> tab to browse them all.</p>

<h3>Emergent Triple Stacks</h3>
<p>When you have <strong>T2 completed AND sacrifice eligibility</strong> in 3 domains that match a specific pattern, you unlock a powerful faction-wide bonus called an <strong>Emergent Rule</strong>. Examples include <em>Ghost Army</em> (3 mobility domains = ignore all terrain penalties), <em>Iron Turtle</em> (fortress + heavy + terrain = damage reflection + zone control), and <em>Withering Citadel</em> (venom + fortress + healing = sustained poison fortress). These are the endgame goals — they demand both deep research (T2 in multiple domains) AND successful combat learning followed by sacrifice.</p>

<h3>How It Plays Out — An Example</h3>
<p>You're playing <strong>Jungle Clans</strong> (native: Venom). You send your Serpent God into Steppe Rider territory and kill one of their units — the Serpent God learns <strong>Skirmish Pursuit</strong> (the Steppe Riders' native domain). Now you have two choices:</p>
<p><strong>Path A — Synergies (Sacrifice):</strong> Return the Serpent God to a friendly city and sacrifice it. The unit survives (abilities stripped), and Skirmish Pursuit becomes <strong>synergy-eligible</strong>. If you already have Venom at T1+, the <strong>Poisoned Skirmish</strong> pair synergy activates immediately. No research was granted — only synergy activation.</p>
<p><strong>Path B — Technology (Ecology):</strong> Skirmish Pursuit is now in your learned domains list (from the kill). Your ecology system starts grinding XP toward its T1 node at the scaled cost (20 XP if it's your first foreign domain). Units on plains terrain generate skirmish research each turn. Combat against Steppe Riders gives +1.0 XP per battle. Once T1 completes, you can research T2 (60 XP) and T3 (100 XP).</p>
<p><strong>The real power move: do both.</strong> Sacrifice for synergies, let ecology fill the tech. <em>Fight, learn, sacrifice for combos, let the land fill the research tree.</em></p>

<h3>Strategic Tips</h3>
<ul>
  <li><strong>Terrain is your primary research engine.</strong> Position units and expand cities onto hexes that match your known domains — every turn on matching terrain is free research.</li>
  <li><strong>Rare terrain is worth fighting for.</strong> A single swamp hex generates 4× the venom research of a plains hex. Control rare terrain that matches your domains.</li>
  <li><strong>Battles accelerate everything.</strong> Every fight grants +1.0 XP to the opponent's domain. Aggressive play produces faster tech than turtling.</li>
  <li><strong>Sacrifice early for synergies.</strong> Synergy eligibility is gated behind combat learning + city return, not research. A single sacrificed unit can unlock pair synergies long before ecology finishes T1 on those domains.</li>
  <li><strong>Pair synergies require sacrifice</strong> — simply researching a domain to T1 is not enough. Both domains must be sacrifice-eligible (or native) for pairs to activate. Plan your sacrifices around the combos you want.</li>
  <li><strong>Breadth before depth</strong> — T2 in three domains (with sacrifice eligibility) unlocks emergent rules, which are far more impactful than T3 in one domain. Spread your ecology across domains early.</li>
  <li><strong>Capabilities snowball.</strong> Higher capability levels in a domain increase learn-by-kill chance, so fighting extensively against a domain makes you better at absorbing it — a virtuous cycle.</li>
  <li><strong>No domain cap.</strong> You can assimilate as many domains as you want via ecology. Each additional domain costs more T1 XP (20, 40, 60...), but there's no hard limit stopping you.</li>
</ul>
`,
  },

  tribes: Object.entries(CIVS).map(([id, civ]) => {
    const display = TRIBE_DISPLAY[id];
    return {
      id: civ.id,
      name: civ.name,
      color: civ.color,
      nativeDomain: civ.nativeDomain,
      homeBiome: civ.homeBiome,
      behavior: display?.behavior ?? '',
      intro: display?.intro ?? '',
      strengths: display?.strengths ?? [],
      weaknesses: display?.weaknesses ?? [],
      tip: display?.tip ?? '',
    };
  }),

  synergyGuide: pairSynergiesData.pairSynergies.map((s: { id: string }) => ({
    pairId: s.id,
    playerDescription: SYNERGY_PLAYER_DESCRIPTIONS[s.id] ?? `Combination synergy: ${s.id.replace(/\+/g, ' + ')}`,
  })),
};
