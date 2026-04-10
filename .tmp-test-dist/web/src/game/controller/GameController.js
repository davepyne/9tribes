import { buildDebugViewModel, buildHudViewModel, buildResearchInspectorViewModel, buildWorldViewModel } from '../view-model/worldViewModel.js';
import { getVictoryStatus } from '../../../../src/systems/warEcologySimulation.js';
export class GameController {
    listeners = new Set();
    mode;
    replay;
    session;
    turnIndex = 0;
    combatPendingListener = null;
    selected = null;
    focusedUnitId = null;
    targetingMode = 'move';
    hoveredKey = null;
    zoom = 0.6;
    productionPopupCityId = null;
    inspectorRequestId = 0;
    constructor(options) {
        this.mode = options.mode;
        this.replay = options.mode === 'replay' ? options.replay : null;
        this.session = options.mode === 'play' ? options.session : null;
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
    getState() {
        if (this.mode === 'play') {
            return this.getPlayState();
        }
        return this.getReplayState();
    }
    dispatch(action) {
        switch (action.type) {
            case 'select_hex':
                this.targetingMode = 'move';
                this.focusedUnitId = null;
                this.selected = action.q === -1 && action.r === -1
                    ? null
                    : { type: 'hex', q: action.q, r: action.r, key: `${action.q},${action.r}` };
                this.productionPopupCityId = null;
                break;
            case 'select_unit':
                this.targetingMode = 'move';
                this.selected = { type: 'unit', unitId: action.unitId };
                this.productionPopupCityId = null;
                this.requestInspectorOpen();
                break;
            case 'focus_unit':
                this.targetingMode = 'move';
                this.focusedUnitId = action.unitId;
                this.selected = null;
                this.productionPopupCityId = null;
                break;
            case 'select_city':
                this.targetingMode = 'move';
                this.selected = { type: 'city', cityId: action.cityId };
                this.productionPopupCityId = null;
                this.requestInspectorOpen();
                break;
            case 'open_city_production':
                this.targetingMode = 'move';
                this.selected = { type: 'city', cityId: action.cityId };
                this.productionPopupCityId = action.cityId;
                this.requestInspectorOpen();
                break;
            case 'close_city_production':
                this.productionPopupCityId = null;
                break;
            case 'select_village':
                this.targetingMode = 'move';
                this.selected = { type: 'village', villageId: action.villageId };
                this.requestInspectorOpen();
                break;
            case 'set_city_production':
                if (this.session) {
                    this.session.dispatch(action);
                    this.targetingMode = 'move';
                    this.selected = { type: 'city', cityId: action.cityId };
                }
                break;
            case 'cancel_city_production':
            case 'remove_from_queue':
                if (this.session) {
                    this.session.dispatch(action);
                }
                break;
            case 'set_targeting_mode':
                this.targetingMode = action.mode;
                break;
            case 'move_unit':
                if (this.session) {
                    this.session.dispatch(action);
                    this.targetingMode = 'move';
                    this.selected = { type: 'unit', unitId: action.unitId };
                }
                break;
            case 'prepare_ability':
            case 'board_transport':
            case 'disembark_unit':
            case 'build_fort':
                if (this.session) {
                    this.session.dispatch(action);
                    this.targetingMode = 'move';
                    this.selected = { type: 'unit', unitId: action.unitId };
                }
                break;
            case 'build_city':
                if (this.session) {
                    const unit = this.session.getState().units.get(action.unitId);
                    const position = unit ? { ...unit.position } : null;
                    this.session.dispatch(action);
                    this.targetingMode = 'move';
                    if (position) {
                        const city = Array.from(this.session.getState().cities.values()).find((entry) => entry.position.q === position.q && entry.position.r === position.r);
                        this.selected = city ? { type: 'city', cityId: city.id } : null;
                        if (city) {
                            this.requestInspectorOpen();
                        }
                    }
                    else {
                        this.selected = null;
                    }
                }
                break;
            case 'attack_unit':
                if (this.session) {
                    this.session.dispatch(action);
                    const pending = this.session.getPendingCombat();
                    if (pending) {
                        // Signal to start animation — don't emit until animation completes
                        this.combatPendingListener?.(pending);
                    }
                    else {
                        // Fallback: should not happen, but emit if no pending
                        this.emit();
                    }
                }
                break;
            case 'end_turn':
                if (this.session) {
                    this.session.dispatch(action);
                    this.targetingMode = 'move';
                    this.clearSelectionIfInactive();
                    // Process any AI combats queued during AI turn processing
                    this.startAiCombats();
                }
                else if (this.replay) {
                    this.turnIndex = Math.min(this.replay.turns.length - 1, this.turnIndex + 1);
                }
                break;
            case 'set_replay_turn':
                if (this.replay) {
                    this.turnIndex = Math.max(0, Math.min(this.replay.turns.length - 1, action.turnIndex));
                }
                break;
            case 'start_research':
            case 'cancel_research':
            case 'sacrifice_unit':
                if (this.session) {
                    this.session.dispatch(action);
                }
                break;
            default:
                return;
        }
        this.emit();
    }
    setHoveredHex(key) {
        this.hoveredKey = key;
        this.emit();
    }
    setZoom(zoom) {
        this.zoom = zoom;
        this.emit();
    }
    getSaveSnapshot() {
        return this.session?.getSaveSnapshot() ?? null;
    }
    getReplayState() {
        const replay = this.replay;
        const turn = replay.turns[this.turnIndex] ?? replay.turns[0];
        const selectedUnitId = this.selected?.type === 'unit' ? this.selected.unitId : null;
        const activeUnitId = this.focusedUnitId ?? selectedUnitId;
        const reachableHexes = [];
        const attackHexes = [];
        const pathPreview = [];
        const hoveredMove = null;
        const hoveredAttackTarget = null;
        const world = buildWorldViewModel({
            kind: 'replay',
            replay,
            turnIndex: this.turnIndex,
            selectedUnitId,
            reachableHexes,
            attackHexes,
            pathPreview,
        });
        return {
            mode: this.mode,
            turn: turn.round,
            turnIndex: this.turnIndex,
            maxTurns: replay.maxTurns,
            activeFactionId: world.activeFactionId,
            selected: this.selected,
            hoveredHex: this.hoveredKey ? keyToCoord(this.hoveredKey) : null,
            camera: { zoom: this.zoom },
            world,
            hud: buildHudViewModel(replay, this.turnIndex, this.mode, this.selected, this.hoveredKey, world),
            actions: {
                selectedUnitId: activeUnitId,
                targetingMode: 'move',
                legalMoves: reachableHexes,
                attackTargets: attackHexes,
                pathPreview,
                canEndTurn: this.turnIndex < replay.turns.length - 1,
                interactionHint: 'Scrub the timeline or click entities to inspect the replay.',
                hoveredMove,
                hoveredAttackTarget,
            },
            debug: buildDebugViewModel(turn),
            replay,
            playFeedback: null,
            research: null,
            productionPopupCityId: null,
            inspectorRequestId: this.inspectorRequestId,
        };
    }
    getPlayState() {
        const session = this.session;
        const sessionState = session.getState();
        const selectedUnitId = this.selected?.type === 'unit' ? this.selected.unitId : null;
        const activeUnitId = this.focusedUnitId ?? selectedUnitId;
        const legalMoves = activeUnitId ? session.getLegalMoves(activeUnitId) : [];
        const attackTargets = activeUnitId ? session.getAttackTargets(activeUnitId) : [];
        const hoveredMove = this.hoveredKey && this.targetingMode === 'move'
            ? legalMoves.find((entry) => entry.key === this.hoveredKey) ?? null
            : null;
        const hoveredAttackTarget = this.hoveredKey && this.targetingMode === 'attack'
            ? attackTargets.find((entry) => entry.key === this.hoveredKey) ?? null
            : null;
        const pathPreview = this.targetingMode === 'move' ? buildPathPreview(this.hoveredKey, legalMoves) : [];
        const feedback = session.getFeedback();
        const victory = getVictoryStatus(sessionState);
        const playerFactionId = session.getPrimaryHumanFactionId();
        const world = buildWorldViewModel({
            kind: 'play',
            state: sessionState,
            registry: session.getRegistry(),
            reachableHexes: this.targetingMode === 'move' ? legalMoves : [],
            attackHexes: this.targetingMode === 'attack' ? attackTargets : [],
            pathPreview,
            lastMove: feedback.lastMove,
        });
        return {
            mode: this.mode,
            turn: sessionState.round,
            turnIndex: Math.max(0, sessionState.round - 1),
            maxTurns: session.getMaxTurns(),
            activeFactionId: sessionState.activeFactionId,
            selected: this.selected,
            hoveredHex: this.hoveredKey ? keyToCoord(this.hoveredKey) : null,
            camera: { zoom: this.zoom },
            world,
            hud: buildHudViewModel(sessionState, 0, this.mode, this.selected, this.hoveredKey, world, session.getRegistry(), feedback.liveCombatEvents),
            actions: {
                selectedUnitId: activeUnitId,
                targetingMode: this.targetingMode,
                legalMoves,
                attackTargets,
                pathPreview,
                canEndTurn: Boolean(sessionState.activeFactionId),
                interactionHint: describePlayHint(world, activeUnitId, this.targetingMode, legalMoves.length, attackTargets.length),
                hoveredMove,
                hoveredAttackTarget,
            },
            debug: buildDebugViewModel(null, session.getEvents()),
            replay: null,
            playFeedback: {
                eventSequence: feedback.eventSequence,
                moveCount: feedback.moveCount,
                endTurnCount: feedback.endTurnCount,
                isDirty: feedback.moveCount > 0 || feedback.endTurnCount > 0,
                playerFactionId,
                lastMove: feedback.lastMove ? {
                    unitId: feedback.lastMove.unitId,
                    destination: feedback.lastMove.destination,
                } : null,
                lastTurnChange: feedback.lastTurnChange?.factionId
                    ? {
                        factionId: feedback.lastTurnChange.factionId,
                        factionName: sessionState.factions.get(feedback.lastTurnChange.factionId)?.name ?? feedback.lastTurnChange.factionId,
                    }
                    : null,
                lastSacrifice: feedback.lastSacrifice ? { ...feedback.lastSacrifice } : null,
                lastLearnedDomain: feedback.lastLearnedDomain ? { ...feedback.lastLearnedDomain } : null,
                lastResearchCompletion: feedback.lastResearchCompletion ? { ...feedback.lastResearchCompletion } : null,
                hitAndRunRetreat: feedback.hitAndRunRetreat ? { ...feedback.hitAndRunRetreat } : null,
                lastSettlerVillageSpend: feedback.lastSettlerVillageSpend
                    ? {
                        factionId: feedback.lastSettlerVillageSpend.factionId,
                        villageIds: [...feedback.lastSettlerVillageSpend.villageIds],
                    }
                    : null,
                victory: {
                    winnerFactionId: victory.winnerFactionId,
                    victoryType: victory.victoryType,
                },
            },
            research: buildResearchInspectorViewModel(sessionState, session.getRegistry()),
            productionPopupCityId: this.productionPopupCityId,
            inspectorRequestId: this.inspectorRequestId,
        };
    }
    requestInspectorOpen() {
        this.inspectorRequestId += 1;
    }
    clearSelectionIfInactive() {
        if (!this.session || this.selected?.type !== 'unit') {
            return;
        }
        const unit = this.session.getState().units.get(this.selected.unitId);
        if (!unit || unit.factionId !== this.session.getState().activeFactionId) {
            this.targetingMode = 'move';
            this.selected = null;
        }
    }
    /** Register a listener for when combat is pending animation */
    onCombatPending(listener) {
        this.combatPendingListener = listener;
    }
    /** Called by MapScene/animation system when combat animation completes */
    applyPendingCombat() {
        const pending = this.session?.getPendingCombat();
        if (!pending)
            return;
        this.session.applyResolvedCombat(pending);
        this.session.clearPendingCombat();
        // Update selection state
        this.targetingMode = 'move';
        this.selected = this.session.getState().units.has(pending.attackerId)
            ? { type: 'unit', unitId: pending.attackerId }
            : null;
        // NOW trigger re-render with final state
        this.emit();
        // Chain: if more AI combats are queued, start the next one
        this.continueAiCombats();
    }
    /** Dequeue and fire the next AI combat from the queue */
    continueAiCombats() {
        const next = this.session?.dequeueAiCombat();
        if (!next)
            return;
        this.combatPendingListener?.(next);
    }
    /** Check if a combat involves any human-controlled faction */
    isCombatInvolvesHuman(attackerFactionId, defenderFactionId) {
        return this.session?.isCombatInvolvesHuman(attackerFactionId, defenderFactionId) ?? false;
    }
    /** Kick off processing of any AI combats queued during end_turn */
    startAiCombats() {
        const first = this.session?.dequeueAiCombat();
        if (!first)
            return;
        this.combatPendingListener?.(first);
    }
    isCombatInProgress() {
        return this.session?.getPendingCombat() !== null;
    }
    emit() {
        for (const listener of this.listeners) {
            listener();
        }
    }
}
function buildPathPreview(hoveredKey, legalMoves) {
    if (!hoveredKey) {
        return [];
    }
    const hoveredMove = legalMoves.find((entry) => entry.key === hoveredKey);
    if (!hoveredMove) {
        return [];
    }
    return hoveredMove.path.map((node, index) => ({
        key: `${node.q},${node.r}`,
        q: node.q,
        r: node.r,
        step: index,
    }));
}
function describePlayHint(world, selectedUnitId, targetingMode, legalMoveCount, attackTargetCount) {
    if (!selectedUnitId) {
        return 'Select a friendly unit to move, or press A after selecting one to target an attack.';
    }
    const unit = world.units.find((entry) => entry.id === selectedUnitId);
    if (!unit) {
        return 'Select a friendly unit to move, or press A after selecting one to target an attack.';
    }
    if (!unit.isActiveFaction) {
        return 'Only the active faction can receive movement orders.';
    }
    if (targetingMode === 'attack') {
        if (attackTargetCount === 0) {
            return 'No enemies are currently in attack range. Press Esc to exit attack mode.';
        }
        return 'Attack mode is active. Click a highlighted enemy to attack, or press Esc to cancel.';
    }
    if (legalMoveCount === 0 && attackTargetCount === 0) {
        return 'This unit has no legal moves or attack targets left this turn.';
    }
    if (legalMoveCount === 0) {
        return 'No legal moves remain. Press A to attack if an enemy is in range.';
    }
    return 'Drag the unit to a highlighted tile to move. Press A to switch into attack mode.';
}
function keyToCoord(key) {
    const [q, r] = key.split(',').map(Number);
    return { q, r };
}
