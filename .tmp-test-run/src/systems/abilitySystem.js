import { getNeighbors, hexToKey } from '../core/grid.js';
import { isUnitVisibleTo } from './fogSystem.js';
function getPrototypeTags(prototype) {
    return new Set([prototype.chassisId, ...(prototype.tags ?? [])]);
}
export function canUseCharge(prototype) {
    const tags = getPrototypeTags(prototype);
    return prototype.derivedStats.role === 'mounted' || tags.has('shock') || tags.has('mounted');
}
export function canUseBrace(prototype) {
    const tags = getPrototypeTags(prototype);
    return tags.has('formation') || tags.has('spear') || tags.has('defensive');
}
export function canUseAmbush(prototype, terrainId) {
    const tags = getPrototypeTags(prototype);
    return (terrainId === 'forest' || terrainId === 'hill')
        && (prototype.derivedStats.role === 'ranged' || tags.has('skirmish') || tags.has('forest'));
}
export function hasAdjacentEnemy(state, unit) {
    for (const hex of getNeighbors(unit.position)) {
        for (const [, other] of state.units) {
            if (other.hp > 0 &&
                other.factionId !== unit.factionId &&
                other.position.q === hex.q &&
                other.position.r === hex.r &&
                isUnitVisibleTo(state, unit.factionId, other)) {
                return true;
            }
        }
    }
    return false;
}
export function shouldClearAmbush(unit, state) {
    return unit.preparedAbility === 'ambush' && hasAdjacentEnemy(state, unit);
}
export function prepareAbility(unit, ability, round) {
    return {
        ...unit,
        preparedAbility: ability,
        preparedAbilityExpiresOnRound: round + 1,
        attacksRemaining: 0,
        status: 'spent',
        activatedThisRound: true,
    };
}
export function clearPreparedAbility(unit) {
    return {
        ...unit,
        preparedAbility: undefined,
        preparedAbilityExpiresOnRound: undefined,
    };
}
export function getTerrainAt(state, pos) {
    return state.map?.tiles.get(hexToKey(pos))?.terrain ?? 'plains';
}
