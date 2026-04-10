import { shouldCommitAttack, shouldRetreat } from './aiPersonality.js';
export function scoreStrategicTarget(input) {
    let score = 0;
    if (input.isFocusTarget)
        score += 6;
    if (input.isAdjacentToPrimaryObjectiveCity)
        score += 4;
    if (input.isRouted)
        score += 2;
    if (input.hpRatio <= 0.4)
        score += 3;
    if (input.attacksFromThreatenedCityHex)
        score += 4;
    if (input.finishOffPriorityTarget)
        score += 3;
    if (input.isolatedFromAnchor)
        score -= 6;
    return score;
}
export function scoreAttackCandidate(input) {
    let score = 0;
    score += input.roleEffectiveness * 10;
    score += input.weaponEffectiveness * 10;
    score += (1 - input.targetHpRatio) * 5;
    if (input.targetRouted)
        score += 8;
    score -= input.reverseRoleEffectiveness * 5;
    score += input.strategicTargetScore;
    score += input.extraScore ?? 0;
    score -= input.distancePenalty ?? 0;
    if (input.isSiegeVsCity)
        score += 12;
    if (input.isSiegeVsFort)
        score += 6;
    return score;
}
export function scoreMoveCandidate(input) {
    let score = (input.originWaypointDistance - input.waypointDistance) * 8;
    score += input.terrainScore * 1.5;
    score += input.supportScore - input.originSupport;
    if (input.assignment === 'defender' || input.assignment === 'recovery') {
        score += Math.max(0, input.originAnchorDistance - input.anchorDistance) * 3;
        score += Math.max(0, 4 - input.cityDistance) * 1.5;
    }
    if (input.assignment === 'siege_force') {
        score += Math.max(0, input.originWaypointDistance - input.waypointDistance) * 2;
    }
    if (input.assignment === 'reserve' && input.anchorDistance <= 2) {
        score += 1.5;
    }
    if (input.hiddenExplorationBonus) {
        score += 6;
    }
    if (input.unsafeAfterMove) {
        score -= 10;
    }
    return score;
}
export function computeRetreatRisk(input) {
    const hpPressure = Math.max(0, 0.6 - input.hpRatio) * 1.25;
    const enemyPressure = Math.max(0, input.nearbyEnemies - input.nearbyFriendlies) * 0.12;
    const isolationPressure = input.nearestFriendlyDistance > 3 ? 0.2 : 0;
    const anchorPressure = input.anchorDistance > 4 ? 0.2 : 0;
    return Math.min(1.25, hpPressure + enemyPressure + isolationPressure + anchorPressure);
}
export function computeAttackAdvantageFromScore(score) {
    return 1 + score / 60;
}
export function shouldEngageTarget(snapshot, input) {
    if (!snapshot) {
        return input.attackScore > 0;
    }
    if (shouldRetreat(snapshot, { retreatRisk: input.retreatRisk })) {
        return false;
    }
    return shouldCommitAttack(snapshot, {
        attackAdvantage: computeAttackAdvantageFromScore(input.attackScore),
    });
}
