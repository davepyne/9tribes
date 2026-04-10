import { useEffect, useState } from 'react';
import { GameShell } from '../GameShell.js';
import { findSaveGameByLabel, getSaveGame, writeSaveGame } from '../savegames.js';
import { GameController } from '../../game/controller/GameController.js';
import { GameSession } from '../../game/controller/GameSession.js';
import { createCuratedPlaytestPayload } from '../../game/fixtures/curatedPlaytest.js';
export function PlayClient() {
    const [controller, setController] = useState(null);
    const [error, setError] = useState(null);
    const currentSaveId = new URLSearchParams(window.location.search).get('save')?.trim() || null;
    const currentSave = currentSaveId ? getSaveGame(currentSaveId) : null;
    useEffect(() => {
        try {
            setController(createPlayController());
        }
        catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Unknown play bootstrap failure');
        }
    }, []);
    const handleRestartSession = () => {
        try {
            setController(createPlayController());
            setError(null);
        }
        catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Unknown play bootstrap failure');
        }
    };
    const handleSaveGame = () => {
        if (!controller) {
            return null;
        }
        const snapshot = controller.getSaveSnapshot();
        if (!snapshot) {
            return null;
        }
        const suggestedLabel = currentSave?.label
            ?? `${snapshot.preview.playerFactionName ?? snapshot.preview.activeFactionName} | Round ${snapshot.preview.round}`;
        const enteredLabel = window.prompt('Save slot name', suggestedLabel);
        if (enteredLabel === null) {
            return null;
        }
        const label = enteredLabel.trim();
        if (!label) {
            window.alert('Save cancelled: slot name cannot be empty.');
            return null;
        }
        const existing = findSaveGameByLabel(label);
        if (existing && existing.id !== currentSaveId) {
            const shouldOverwrite = window.confirm(`Overwrite existing save "${existing.label}"?`);
            if (!shouldOverwrite) {
                return null;
            }
            return writeSaveGame(snapshot, label, existing.id);
        }
        return writeSaveGame(snapshot, label, currentSaveId ?? undefined);
    };
    if (error) {
        return <div className="client-loading">Playable client unavailable: {error}</div>;
    }
    if (!controller) {
        return <div className="client-loading">Booting playable client scaffold…</div>;
    }
    return (<GameShell controller={controller} onRestartSession={handleRestartSession} onSaveGame={handleSaveGame}/>);
}
function createPlayController() {
    const search = new URLSearchParams(window.location.search);
    const hasMenuLaunchParams = search.has('map')
        || search.has('size')
        || search.has('player')
        || search.has('tribes');
    const useFreshBootstrap = search.get('bootstrap') === 'fresh' || hasMenuLaunchParams;
    const seed = Number(search.get('seed') ?? '42');
    const difficulty = parseDifficultyParam(search.get('difficulty'));
    const playerFactionId = search.get('player')?.trim() || 'steppe_clan';
    const selectedFactions = parseFactionList(search.get('tribes'));
    const mapMode = parseMapModeParam(search.get('map'));
    const mapSize = parseMapSizeParam(search.get('size'));
    const saveId = search.get('save')?.trim() || null;
    const saveRecord = saveId ? getSaveGame(saveId) : null;
    if (saveId && !saveRecord) {
        throw new Error('Requested save was not found in local storage.');
    }
    const session = new GameSession(saveRecord
        ? { type: 'serialized', payload: saveRecord.payload }
        : useFreshBootstrap
            ? {
                type: 'fresh',
                seed: Number.isFinite(seed) ? seed : 42,
                mapMode,
                mapSize,
                selectedFactionIds: selectedFactions,
            }
            : { type: 'serialized', payload: createCuratedPlaytestPayload() }, undefined, {
        humanControlledFactionIds: [playerFactionId],
        difficulty,
        mapMode,
        mapSize,
        selectedFactions,
    });
    return new GameController({ mode: 'play', session });
}
function parseDifficultyParam(value) {
    if (value === 'normal' || value === 'hard' || value === 'easy') {
        return value;
    }
    return 'easy';
}
function parseMapModeParam(value) {
    if (value === 'fixed') {
        return 'fixed';
    }
    return 'randomClimateBands';
}
function parseMapSizeParam(value) {
    if (value === 'small' || value === 'medium' || value === 'large') {
        return value;
    }
    return 'medium';
}
function parseFactionList(value) {
    if (!value) {
        return undefined;
    }
    const ids = value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
    return ids.length > 0 ? ids : undefined;
}
