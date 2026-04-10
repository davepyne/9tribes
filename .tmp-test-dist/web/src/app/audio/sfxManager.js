const SOUND_SOURCES = {
    melee_infantry: '/assets/audio/sfx/swordfgt.wav',
    melee_cavalry: '/assets/audio/sfx/swrdhors.wav',
    catapult: '/assets/audio/sfx/catapult.wav',
    elephant: '/assets/audio/sfx/elephant.wav',
    pirate_gun: '/assets/audio/sfx/infantry.wav',
    pirate_galley: '/assets/audio/sfx/navbttle.wav',
    naval_battle: '/assets/audio/sfx/naval_battle.wav',
    chariot: '/assets/audio/sfx/chariot.wav',
    serpent_god: '/assets/audio/sfx/serpent_god.wav',
    polar_bear: '/assets/audio/sfx/polar_bear.wav',
    priest_spell: '/assets/audio/sfx/priest_spell.wav',
    wizard_spell: '/assets/audio/sfx/wizard_spell.wav',
    blowgun: '/assets/audio/sfx/blowgun.wav',
    crocodile: '/assets/audio/sfx/crocodile.wav',
    slaver_capture: '/assets/audio/sfx/spysound.wav',
    village_destroyed: '/assets/audio/sfx/drumcn.wav',
    city_built: '/assets/audio/sfx/bldcity.wav',
    city_captured: '/assets/audio/sfx/barracks.wav',
    sacrifice: '/assets/audio/sfx/drumbn.wav',
    learned_domain: '/assets/audio/sfx/druma0.wav',
    move: '/assets/audio/sfx/feedbkxx.wav',
    victory: '/assets/audio/sfx/fanfare6.wav',
    defeat: '/assets/audio/sfx/guillotn.wav',
    research_tier: '/assets/audio/sfx/druman.wav',
    ranged: '/assets/audio/sfx/archers_4s.wav',
    hit_and_run: '/assets/audio/sfx/feedbkxx.wav',
};
const SOUND_VOLUMES = {
    move: 0.55,
    research_tier: 0.7,
    victory: 0.7,
    defeat: 0.7,
    city_built: 0.7,
    city_captured: 0.7,
    village_destroyed: 0.7,
    sacrifice: 0.7,
    learned_domain: 0.7,
};
function playSound(soundId) {
    try {
        const sound = new Audio(SOUND_SOURCES[soundId]);
        sound.volume = SOUND_VOLUMES[soundId] ?? 0.6;
        void sound.play().catch(() => {
            // Ignore browser media-policy failures.
        });
    }
    catch {
        // Ignore environments that cannot construct audio.
    }
}
function isPirateLandUnit(unit) {
    return unit.factionId === 'coral_people' && unit.movementClass !== 'naval';
}
function isPirateNavalUnit(unit) {
    return unit.factionId === 'coral_people' && unit.movementClass === 'naval';
}
function isPirateBaseInfantry(attacker) {
    return attacker.factionId === 'coral_people'
        && attacker.chassisId === 'infantry_frame'
        && attacker.movementClass === 'infantry'
        && isMeleeRange(attacker);
}
function isMeleeRange(unit) {
    return (unit.range ?? 1) <= 1;
}
function classifyCombatSound(attacker) {
    // ── Special summon/beast units (most specific) ──
    if (attacker.chassisId === 'polar_bear_frame') {
        return 'polar_bear';
    }
    if (attacker.chassisId === 'serpent_frame') {
        return 'serpent_god';
    }
    if (attacker.chassisId === 'alligator_frame') {
        return 'crocodile';
    }
    if (attacker.chassisId === 'chariot_frame') {
        return 'chariot';
    }
    // ── Siege / existing special ──
    if (attacker.chassisId === 'catapult_frame' || attacker.prototypeId.includes('catapult')) {
        return 'catapult';
    }
    if (attacker.chassisId === 'elephant_frame' || attacker.prototypeId.includes('elephant')) {
        return 'elephant';
    }
    // ── Magic / spellcaster units ──
    if (attacker.prototypeId === 'druid_wizard') {
        return 'wizard_spell';
    }
    if (attacker.prototypeId.includes('_priest')) {
        return 'priest_spell';
    }
    if (attacker.prototypeId === 'blowgun_skirmishers') {
        return 'blowgun';
    }
    // ── Naval units ──
    if (isPirateNavalUnit(attacker)) {
        return 'pirate_galley';
    }
    if (attacker.movementClass === 'naval') {
        return 'naval_battle';
    }
    // ── Pirate land units ──
    if (isPirateBaseInfantry(attacker)) {
        return 'melee_infantry';
    }
    if (isPirateLandUnit(attacker)) {
        return 'pirate_gun';
    }
    if (attacker.factionId === 'steppe_clan' && attacker.chassisId === 'cavalry_frame') {
        return 'ranged';
    }
    // ── Ranged (non-pirate) ──
    if (attacker.role === 'ranged' && attacker.factionId !== 'coral_people') {
        return 'ranged';
    }
    // ── Melee fallbacks ──
    if (isMeleeRange(attacker) && ['cavalry', 'camel'].includes(attacker.movementClass ?? '')) {
        return 'melee_cavalry';
    }
    if (isMeleeRange(attacker) && attacker.movementClass === 'infantry') {
        return 'melee_infantry';
    }
    return null;
}
export function playCombatSoundForPendingCombat(_pending, attacker) {
    const soundId = classifyCombatSound(attacker);
    if (soundId) {
        playSound(soundId);
    }
}
function buildAudioSnapshot(state) {
    if (state.mode !== 'play' || !state.playFeedback) {
        return null;
    }
    const playerFactionId = state.playFeedback.playerFactionId;
    const cityOwners = new Map(state.world.cities.map((city) => [city.id, city.factionId]));
    const unitOwners = new Map(state.world.units.map((unit) => [unit.id, unit.factionId]));
    const villages = new Map(state.world.villages.map((village) => [village.id, { factionId: village.factionId, name: village.name }]));
    const suppressedVillageLossIds = state.playFeedback.lastSettlerVillageSpend?.factionId === playerFactionId
        ? new Set(state.playFeedback.lastSettlerVillageSpend.villageIds)
        : new Set();
    const playerCityCount = playerFactionId
        ? state.world.cities.filter((city) => city.factionId === playerFactionId).length
        : 0;
    const playerWon = Boolean(playerFactionId
        && state.playFeedback.victory?.winnerFactionId === playerFactionId
        && state.playFeedback.victory.victoryType !== 'unresolved');
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
        hitAndRunRetreatKey: state.playFeedback.hitAndRunRetreat
            ? `${state.playFeedback.hitAndRunRetreat.unitId}:${state.playFeedback.hitAndRunRetreat.to.q},${state.playFeedback.hitAndRunRetreat.to.r}`
            : null,
        suppressedVillageLossIds,
        playerCityCount,
        playerFactionId,
        cityOwners,
        unitOwners,
        villages,
        playerWon,
    };
}
export function getDestroyedPlayerVillages(prevState, nextState) {
    const prev = prevState ? buildAudioSnapshot(prevState) : null;
    const next = buildAudioSnapshot(nextState);
    if (!prev || !next || !prev.playerFactionId) {
        return [];
    }
    const destroyed = [];
    for (const [villageId, village] of prev.villages.entries()) {
        if (village.factionId !== prev.playerFactionId) {
            continue;
        }
        if (!next.villages.has(villageId) && !next.suppressedVillageLossIds.has(villageId)) {
            destroyed.push(village.name);
        }
    }
    return destroyed;
}
export function playSessionDeltaSounds(prevState, nextState) {
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
    if (next.hitAndRunRetreatKey && next.hitAndRunRetreatKey !== prev.hitAndRunRetreatKey) {
        playSound('hit_and_run');
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
    if (getDestroyedPlayerVillages(prevState, nextState).length > 0) {
        playSound('village_destroyed');
    }
    if (prev.playerCityCount > 0 && next.playerCityCount === 0) {
        playSound('defeat');
    }
    if (!prev.playerWon && next.playerWon) {
        playSound('victory');
    }
}
