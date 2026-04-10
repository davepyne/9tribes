import { describe, expect, it } from 'vitest';
import { buildMvpScenario } from '../src/game/buildMvpScenario.js';
import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry.js';
import { computeRetreatRisk, scoreAttackCandidate, scoreMoveCandidate, shouldEngageTarget, } from '../src/systems/aiTactics.js';
import { createEmptyAiPersonalitySnapshot } from '../src/systems/aiPersonality.js';
import { runWarEcologySimulation } from '../src/systems/warEcologySimulation.js';
import { GameSession } from '../web/src/game/controller/GameSession.js';
import { serializeGameState } from '../web/src/game/types/playState.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
function buildHeadToHeadState() {
    const registry = loadRulesRegistry();
    const state = buildMvpScenario(42, { registry, mapMode: 'fixed' });
    const steppeId = 'steppe_clan';
    const druidId = 'druid_circle';
    const steppeFaction = state.factions.get(steppeId);
    const druidFaction = state.factions.get(druidId);
    const steppeUnitId = steppeFaction.unitIds[0];
    const druidUnitId = druidFaction.unitIds[0];
    const steppeCityId = steppeFaction.cityIds[0];
    const druidCityId = druidFaction.cityIds[0];
    state.units = new Map([
        [steppeUnitId, { ...state.units.get(steppeUnitId), position: { q: 10, r: 10 }, attacksRemaining: 1, status: 'ready' }],
        [druidUnitId, { ...state.units.get(druidUnitId), position: { q: 11, r: 10 }, attacksRemaining: 1, status: 'ready' }],
    ]);
    state.cities = new Map([
        [steppeCityId, { ...state.cities.get(steppeCityId), position: { q: 8, r: 10 } }],
        [druidCityId, { ...state.cities.get(druidCityId), position: { q: 13, r: 10 } }],
    ]);
    state.factions = new Map([
        [steppeId, { ...steppeFaction, unitIds: [steppeUnitId], cityIds: [steppeCityId], villageIds: [] }],
        [druidId, { ...druidFaction, unitIds: [druidUnitId], cityIds: [druidCityId], villageIds: [] }],
    ]);
    state.villages = new Map();
    state.improvements = new Map();
    state.economy = new Map([
        [steppeId, state.economy.get(steppeId)],
        [druidId, state.economy.get(druidId)],
    ]);
    state.research = new Map([
        [steppeId, state.research.get(steppeId)],
        [druidId, state.research.get(druidId)],
    ]);
    state.warExhaustion = new Map([
        [steppeId, state.warExhaustion.get(steppeId)],
        [druidId, state.warExhaustion.get(druidId)],
    ]);
    state.activeFactionId = steppeId;
    return { state, registry, steppeId, druidId };
}
const THIS_DIR = dirname(fileURLToPath(import.meta.url));
function readCompiled(relativePath) {
    return readFileSync(resolve(THIS_DIR, relativePath), 'utf8');
}
describe('ai tactics scoring and gates', () => {
    it('scores attack candidates with deterministic weighted components', () => {
        const score = scoreAttackCandidate({
            roleEffectiveness: 0.5,
            weaponEffectiveness: 0.4,
            reverseRoleEffectiveness: 0.2,
            targetHpRatio: 0.5,
            targetRouted: true,
            strategicTargetScore: 6,
            extraScore: 3,
        });
        expect(score).toBeCloseTo(27.5);
    });
    it('scores move candidates with assignment modifiers and safety penalties', () => {
        const score = scoreMoveCandidate({
            assignment: 'defender',
            originWaypointDistance: 6,
            waypointDistance: 4,
            terrainScore: 2,
            supportScore: 3,
            originSupport: 1,
            originAnchorDistance: 5,
            anchorDistance: 3,
            cityDistance: 2,
            unsafeAfterMove: true,
        });
        expect(score).toBeCloseTo(20);
    });
    it('rejects low-advantage attacks and accepts high-advantage attacks through commit gate', () => {
        const snapshot = createEmptyAiPersonalitySnapshot('steppe_clan', 1);
        snapshot.thresholds.commitAdvantage = 1.15;
        snapshot.thresholds.retreatThreshold = 0.9;
        expect(shouldEngageTarget(snapshot, { attackScore: 2, retreatRisk: 0.1 })).toBe(false);
        expect(shouldEngageTarget(snapshot, { attackScore: 12, retreatRisk: 0.1 })).toBe(true);
    });
    it('blocks attacks when retreat risk exceeds threshold', () => {
        const snapshot = createEmptyAiPersonalitySnapshot('steppe_clan', 1);
        snapshot.thresholds.commitAdvantage = 1.05;
        snapshot.thresholds.retreatThreshold = 0.8;
        expect(shouldEngageTarget(snapshot, { attackScore: 12, retreatRisk: 1.0 })).toBe(false);
    });
    it('produces higher retreat risk for isolated and pressured units', () => {
        const safe = computeRetreatRisk({
            hpRatio: 0.9,
            nearbyEnemies: 1,
            nearbyFriendlies: 3,
            nearestFriendlyDistance: 1,
            anchorDistance: 1,
        });
        const risky = computeRetreatRisk({
            hpRatio: 0.35,
            nearbyEnemies: 3,
            nearbyFriendlies: 0,
            nearestFriendlyDistance: 5,
            anchorDistance: 6,
        });
        expect(risky).toBeGreaterThan(safe);
    });
});
describe('ai tactics integration', () => {
    it('live GameSession AI uses shared tactical attack scoring helper', () => {
        const { state, registry, druidId } = buildHeadToHeadState();
        new GameSession({ type: 'serialized', payload: serializeGameState(state) }, registry, { humanControlledFactionIds: [druidId] });
        expect(readCompiled('../web/src/game/controller/GameSession.js')).toContain('activateAiUnit');
        expect(readCompiled('../src/systems/unitActivationSystem.js')).toContain('scoreAttackCandidate');
    });
    it('simulation uses shared tactical attack scoring helper', () => {
        const { state, registry } = buildHeadToHeadState();
        runWarEcologySimulation(state, registry, 1);
        expect(readCompiled('../src/systems/warEcologySimulation.js')).toContain('activateUnit');
        expect(readCompiled('../src/systems/unitActivationSystem.js')).toContain('scoreAttackCandidate');
    });
    it('live GameSession AI routes through the shared unit activation module', () => {
        const { state, registry, druidId } = buildHeadToHeadState();
        new GameSession({ type: 'serialized', payload: serializeGameState(state) }, registry, { humanControlledFactionIds: [druidId] });
        expect(readCompiled('../web/src/game/controller/GameSession.js')).toContain('activateAiUnit');
    });
});
