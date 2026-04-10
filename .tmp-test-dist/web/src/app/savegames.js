const STORAGE_KEY = 'war-civ-v2.savegames.v1';
export function listSaveGames() {
    return readRecords().map(({ payload: _payload, ...summary }) => summary);
}
export function getSaveGame(id) {
    return readRecords().find((record) => record.id === id) ?? null;
}
export function findSaveGameByLabel(label) {
    const normalized = normalizeLabel(label);
    if (!normalized) {
        return null;
    }
    const record = readRecords().find((entry) => normalizeLabel(entry.label) === normalized);
    if (!record) {
        return null;
    }
    const { payload: _payload, ...summary } = record;
    return summary;
}
export function writeSaveGame(snapshot, label, overwriteId) {
    const records = readRecords();
    const resolvedLabel = label?.trim() || buildDefaultLabel(snapshot.preview);
    const recordId = overwriteId ?? createSaveId();
    const record = {
        id: recordId,
        label: resolvedLabel,
        savedAt: new Date().toISOString(),
        preview: snapshot.preview,
        payload: snapshot.payload,
    };
    const nextRecords = records.filter((entry) => entry.id !== recordId);
    nextRecords.unshift(record);
    writeRecords(nextRecords.slice(0, 12));
    const { payload: _payload, ...summary } = record;
    return summary;
}
export function deleteSaveGame(id) {
    writeRecords(readRecords().filter((record) => record.id !== id));
}
function readRecords() {
    if (typeof window === 'undefined') {
        return [];
    }
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return [];
        }
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed.filter(isSaveGameRecord);
    }
    catch {
        return [];
    }
}
function writeRecords(records) {
    if (typeof window === 'undefined') {
        return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}
function isSaveGameRecord(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const candidate = value;
    return typeof candidate.id === 'string'
        && typeof candidate.label === 'string'
        && typeof candidate.savedAt === 'string'
        && typeof candidate.payload === 'object'
        && candidate.payload !== null
        && typeof candidate.preview === 'object'
        && candidate.preview !== null;
}
function createSaveId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `save-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}
function buildDefaultLabel(preview) {
    const owner = preview.playerFactionName ?? preview.activeFactionName;
    return `${owner} | Round ${preview.round}`;
}
function normalizeLabel(value) {
    return value.trim().toLocaleLowerCase();
}
