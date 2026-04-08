import type { ClientState } from '../../game/types/clientState';
import type { PendingCombat } from '../../game/controller/GameSession';
import type { UnitView } from '../../game/types/worldView';

type SoundId =
  | 'melee_infantry'
  | 'melee_cavalry'
  | 'catapult'
  | 'elephant'
  | 'pirate_gun'
  | 'pirate_galley'
  | 'slaver_capture'
  | 'city_built'
  | 'city_captured'
  | 'sacrifice'
  | 'learned_domain'
  | 'move'
  | 'victory'
  | 'defeat'
  | 'research_tier'
  | 'ranged';

type AudioSnapshot = {
  moveCount: number;
  lastMoveUnitId: string | null;
  lastSacrificeKey: string | null;
  lastLearnedDomainKey: string | null;
  lastResearchCompletionKey: string | null;
  playerCityCount: number;
  cityOwners: Map<string, string>;
  unitOwners: Map<string, string>;
  playerWon: boolean;
};

const SOUND_SOURCES: Record<SoundId, string> = {
  melee_infantry: '/assets/audio/sfx/swordfgt.wav',
  melee_cavalry: '/assets/audio/sfx/swrdhors.wav',
  catapult: '/assets/audio/sfx/catapult.wav',
  elephant: '/assets/audio/sfx/elephant.wav',
  pirate_gun: '/assets/audio/sfx/infantry.wav',
  pirate_galley: '/assets/audio/sfx/navbttle.wav',
  slaver_capture: '/assets/audio/sfx/spysound.wav',
  city_built: '/assets/audio/sfx/bldcity.wav',
  city_captured: '/assets/audio/sfx/barracks.wav',
  sacrifice: '/assets/audio/sfx/drumbn.wav',
  learned_domain: '/assets/audio/sfx/druma0.wav',
  move: '/assets/audio/sfx/feedbkxx.wav',
  victory: '/assets/audio/sfx/fanfare6.wav',
  defeat: '/assets/audio/sfx/guillotn.wav',
  research_tier: '/assets/audio/sfx/druman.wav',
  ranged: '/assets/audio/sfx/archers_4s.wav',
};

const SOUND_VOLUMES: Partial<Record<SoundId, number>> = {
  move: 0.55,
  research_tier: 0.7,
  victory: 0.7,
  defeat: 0.7,
  city_built: 0.7,
  city_captured: 0.7,
  sacrifice: 0.7,
  learned_domain: 0.7,
};

function playSound(soundId: SoundId) {
  try {
    const sound = new Audio(SOUND_SOURCES[soundId]);
    sound.volume = SOUND_VOLUMES[soundId] ?? 0.6;
    void sound.play().catch(() => {
      // Ignore browser media-policy failures.
    });
  } catch {
    // Ignore environments that cannot construct audio.
  }
}

function isPirateLandUnit(unit: Pick<UnitView, 'factionId' | 'movementClass'>): boolean {
  return unit.factionId === 'coral_people' && unit.movementClass !== 'naval';
}

function isPirateNavalUnit(unit: Pick<UnitView, 'factionId' | 'movementClass'>): boolean {
  return unit.factionId === 'coral_people' && unit.movementClass === 'naval';
}

function isPirateBaseInfantry(attacker: Pick<UnitView, 'factionId' | 'chassisId' | 'movementClass' | 'range'>): boolean {
  return attacker.factionId === 'coral_people'
    && attacker.chassisId === 'infantry_frame'
    && attacker.movementClass === 'infantry'
    && isMeleeRange(attacker);
}

function isMeleeRange(unit: Pick<UnitView, 'range'>): boolean {
  return (unit.range ?? 1) <= 1;
}

function classifyCombatSound(attacker: Pick<UnitView, 'factionId' | 'prototypeId' | 'chassisId' | 'movementClass' | 'role' | 'range'>): SoundId | null {
  if (attacker.chassisId === 'catapult_frame' || attacker.prototypeId.includes('catapult')) {
    return 'catapult';
  }

  if (attacker.chassisId === 'elephant_frame' || attacker.prototypeId.includes('elephant')) {
    return 'elephant';
  }

  if (isPirateNavalUnit(attacker)) {
    return 'pirate_galley';
  }

  if (isPirateBaseInfantry(attacker)) {
    return 'melee_infantry';
  }

  if (isPirateLandUnit(attacker)) {
    return 'pirate_gun';
  }

  if (attacker.role === 'ranged' && attacker.factionId !== 'coral_people') {
    return 'ranged';
  }

  if (isMeleeRange(attacker) && ['cavalry', 'camel'].includes(attacker.movementClass ?? '')) {
    return 'melee_cavalry';
  }

  if (isMeleeRange(attacker) && attacker.movementClass === 'infantry') {
    return 'melee_infantry';
  }

  return null;
}

export function playCombatSoundForPendingCombat(_pending: PendingCombat, attacker: UnitView) {
  const soundId = classifyCombatSound(attacker);
  if (soundId) {
    playSound(soundId);
  }
}

function buildAudioSnapshot(state: ClientState): AudioSnapshot | null {
  if (state.mode !== 'play' || !state.playFeedback) {
    return null;
  }

  const playerFactionId = state.playFeedback.playerFactionId;
  const cityOwners = new Map(state.world.cities.map((city) => [city.id, city.factionId]));
  const unitOwners = new Map(state.world.units.map((unit) => [unit.id, unit.factionId]));
  const playerCityCount = playerFactionId
    ? state.world.cities.filter((city) => city.factionId === playerFactionId).length
    : 0;
  const playerWon = Boolean(
    playerFactionId
      && state.playFeedback.victory?.winnerFactionId === playerFactionId
      && state.playFeedback.victory.victoryType !== 'unresolved',
  );

  return {
    moveCount: state.playFeedback.moveCount,
    lastMoveUnitId: state.playFeedback.lastMove?.unitId ?? null,
    lastSacrificeKey: state.playFeedback.lastSacrifice
      ? `${state.playFeedback.lastSacrifice.unitId}:${state.playFeedback.lastSacrifice.domains.join(',')}`
      : null,
    lastLearnedDomainKey: state.playFeedback.lastLearnedDomain
      ? `${state.playFeedback.lastLearnedDomain.unitId}:${state.playFeedback.lastLearnedDomain.domainId}`
      : null,
    lastResearchCompletionKey: state.playFeedback.lastResearchCompletion
      ? `${state.playFeedback.lastResearchCompletion.nodeId}:${state.playFeedback.lastResearchCompletion.tier}`
      : null,
    playerCityCount,
    cityOwners,
    unitOwners,
    playerWon,
  };
}

export function playSessionDeltaSounds(prevState: ClientState | null, nextState: ClientState) {
  const prev = prevState ? buildAudioSnapshot(prevState) : null;
  const next = buildAudioSnapshot(nextState);

  if (!prev || !next) {
    return;
  }

  if (next.moveCount > prev.moveCount) {
    playSound('move');
  }

  if (next.lastSacrificeKey && next.lastSacrificeKey !== prev.lastSacrificeKey) {
    playSound('sacrifice');
  }

  if (next.lastLearnedDomainKey && next.lastLearnedDomainKey !== prev.lastLearnedDomainKey) {
    playSound('learned_domain');
  }

  if (next.lastResearchCompletionKey && next.lastResearchCompletionKey !== prev.lastResearchCompletionKey) {
    playSound('research_tier');
  }

  if ([...next.cityOwners.keys()].some((cityId) => !prev.cityOwners.has(cityId))) {
    playSound('city_built');
  }

  if ([...next.cityOwners.entries()].some(([cityId, factionId]) => {
    const previousOwner = prev.cityOwners.get(cityId);
    return previousOwner !== undefined && previousOwner !== factionId;
  })) {
    playSound('city_captured');
  }

  if ([...next.unitOwners.entries()].some(([unitId, factionId]) => {
    const previousOwner = prev.unitOwners.get(unitId);
    return previousOwner !== undefined && previousOwner !== factionId;
  })) {
    playSound('slaver_capture');
  }

  if (prev.playerCityCount > 0 && next.playerCityCount === 0) {
    playSound('defeat');
  }

  if (!prev.playerWon && next.playerWon) {
    playSound('victory');
  }
}
