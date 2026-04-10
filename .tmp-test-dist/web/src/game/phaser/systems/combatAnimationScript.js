const MIN_INTENSITY = 0.72;
const MAX_INTENSITY = 1.35;
export function buildCombatAnimationScript(outcome, attacker, defender) {
    const attackerEndHp = Math.max(0, attacker.hp - outcome.attackerDamage);
    const defenderEndHp = Math.max(0, defender.hp - outcome.defenderDamage);
    const attackerHits = splitDamageIntoHits(outcome.defenderDamage, pickHitCount(outcome.defenderDamage, defender.maxHp, false), true);
    const defenderHits = splitDamageIntoHits(outcome.attackerDamage, pickHitCount(outcome.attackerDamage, attacker.maxHp, true), false);
    const rawBeats = interleaveHits(attackerHits, defenderHits);
    const enrichedBeats = injectGlanceBeats(rawBeats, outcome, attacker, defender);
    let attackerHp = attacker.hp;
    let defenderHp = defender.hp;
    const beats = enrichedBeats.map((beat, index) => {
        if (beat.actor === 'attacker') {
            defenderHp = Math.max(0, defenderHp - beat.damage);
        }
        else {
            attackerHp = Math.max(0, attackerHp - beat.damage);
        }
        return {
            ...beat,
            attackerHpAfter: attackerHp,
            defenderHpAfter: defenderHp,
            intensity: computeBeatIntensity(beat, attacker, defender, index === enrichedBeats.length - 1),
        };
    });
    return {
        beats,
        attackerEndHp,
        defenderEndHp,
    };
}
function pickHitCount(totalDamage, targetMaxHp, isCounter) {
    if (totalDamage <= 0) {
        return 0;
    }
    const share = totalDamage / Math.max(1, targetMaxHp);
    let count = 1;
    if (totalDamage >= 5 || share >= 0.28) {
        count += 1;
    }
    if (totalDamage >= 10 || share >= 0.58) {
        count += 1;
    }
    if (!isCounter && (totalDamage >= 15 || share >= 0.85)) {
        count += 1;
    }
    return Math.max(1, Math.min(isCounter ? 3 : 4, count));
}
function splitDamageIntoHits(totalDamage, hitCount, frontLoaded) {
    if (totalDamage <= 0 || hitCount <= 0) {
        return [];
    }
    const hits = Array.from({ length: hitCount }, () => Math.floor(totalDamage / hitCount));
    let remainder = totalDamage % hitCount;
    for (let i = 0; i < hits.length && remainder > 0; i += 1) {
        const index = frontLoaded ? i : hits.length - 1 - i;
        hits[index] += 1;
        remainder -= 1;
    }
    return hits.filter((damage) => damage > 0);
}
function interleaveHits(attackerHits, defenderHits) {
    const beats = [];
    let attackerIndex = 0;
    let defenderIndex = 0;
    let nextActor = 'attacker';
    if (attackerHits.length > 0) {
        beats.push({ actor: 'attacker', kind: 'hit', damage: attackerHits[attackerIndex] });
        attackerIndex += 1;
        nextActor = 'defender';
    }
    while (attackerIndex < attackerHits.length || defenderIndex < defenderHits.length) {
        if (nextActor === 'defender' && defenderIndex < defenderHits.length) {
            beats.push({ actor: 'defender', kind: 'hit', damage: defenderHits[defenderIndex] });
            defenderIndex += 1;
            nextActor = 'attacker';
            continue;
        }
        if (nextActor === 'attacker' && attackerIndex < attackerHits.length) {
            beats.push({ actor: 'attacker', kind: 'hit', damage: attackerHits[attackerIndex] });
            attackerIndex += 1;
            nextActor = 'defender';
            continue;
        }
        if (attackerIndex < attackerHits.length) {
            beats.push({ actor: 'attacker', kind: 'hit', damage: attackerHits[attackerIndex] });
            attackerIndex += 1;
            nextActor = 'defender';
            continue;
        }
        if (defenderIndex < defenderHits.length) {
            beats.push({ actor: 'defender', kind: 'hit', damage: defenderHits[defenderIndex] });
            defenderIndex += 1;
            nextActor = 'attacker';
        }
    }
    if (beats.length === 0 && defenderHits.length > 0) {
        return defenderHits.map((damage) => ({ actor: 'defender', kind: 'hit', damage }));
    }
    return beats;
}
function injectGlanceBeats(beats, outcome, attacker, defender) {
    const duelRange = Math.max(attacker.range ?? 1, defender.range ?? 1);
    const bothSurvive = !outcome.attackerDestroyed && !outcome.defenderDestroyed;
    const closeMatchup = getCombatCloseness(attacker, defender) >= 0.7;
    const minimumBeatCount = duelRange <= 1
        ? (bothSurvive && closeMatchup ? 4 : 3)
        : 2;
    const enriched = [...beats];
    if (outcome.defenderDamage === 0 && outcome.attackerDamage > 0) {
        enriched.unshift({ actor: 'attacker', kind: 'glance', damage: 0 });
    }
    if (outcome.attackerDamage === 0 && outcome.defenderDamage === 0 && enriched.length === 0) {
        enriched.push({ actor: 'attacker', kind: 'glance', damage: 0 });
    }
    if (enriched.length === 0) {
        return enriched;
    }
    let insertIndex = 1;
    while (enriched.length < minimumBeatCount) {
        const previousActor = enriched[Math.max(0, insertIndex - 1)]?.actor ?? 'defender';
        enriched.splice(insertIndex, 0, {
            actor: previousActor === 'attacker' ? 'defender' : 'attacker',
            kind: 'glance',
            damage: 0,
        });
        insertIndex = Math.min(enriched.length, insertIndex + 2);
    }
    return enriched;
}
function getCombatCloseness(attacker, defender) {
    const attackerPower = attacker.attack + attacker.effectiveDefense;
    const defenderPower = defender.attack + defender.effectiveDefense;
    const spread = Math.abs(attackerPower - defenderPower);
    const total = Math.max(1, attackerPower + defenderPower);
    return 1 - Math.min(1, spread / total);
}
function computeBeatIntensity(beat, attacker, defender, isLastBeat) {
    if (beat.kind === 'glance') {
        return 0.78;
    }
    const targetMaxHp = beat.actor === 'attacker' ? defender.maxHp : attacker.maxHp;
    const damageShare = beat.damage / Math.max(1, targetMaxHp);
    const actorPower = beat.actor === 'attacker'
        ? attacker.attack + attacker.effectiveDefense
        : defender.attack + defender.effectiveDefense;
    const targetPower = beat.actor === 'attacker'
        ? defender.attack + defender.effectiveDefense
        : attacker.attack + attacker.effectiveDefense;
    const statEdge = actorPower / Math.max(1, targetPower);
    const finisherBonus = isLastBeat ? 0.08 : 0;
    return clamp(0.8 + damageShare * 1.45 + Math.min(0.18, Math.max(-0.06, (statEdge - 1) * 0.12)) + finisherBonus, MIN_INTENSITY, MAX_INTENSITY);
}
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
