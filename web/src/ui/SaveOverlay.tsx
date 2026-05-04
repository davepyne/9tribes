import { useState } from 'react';
import { findSaveGameByLabel, writeSaveGame, type SaveGameSummary } from '../app/savegames';
import type { SessionSaveSnapshot } from '../game/controller/GameSession';

type SaveOverlayProps = {
  onClose: () => void;
  getSaveSnapshot: () => SessionSaveSnapshot | null;
};

export function SaveOverlay({ onClose, getSaveSnapshot }: SaveOverlayProps) {
  const [label, setLabel] = useState('');

  const snapshot = getSaveSnapshot();
  const suggested = snapshot
    ? `${snapshot.preview.playerFactionName ?? snapshot.preview.activeFactionName} | Round ${snapshot.preview.round}`
    : '';

  const handleSave = () => {
    if (!snapshot) return;
    const trimmed = label.trim() || suggested;
    if (!trimmed) {
      window.alert('Please enter a save name.');
      return;
    }
    const existing = findSaveGameByLabel(trimmed);
    if (existing) {
      if (!window.confirm(`Overwrite existing save "${existing.label}"?`)) {
        return;
      }
      writeSaveGame(snapshot, trimmed, existing.id);
    } else {
      writeSaveGame(snapshot, trimmed);
    }
    onClose();
  };

  return (
    <div className="syn-backdrop" onClick={onClose} style={{ zIndex: 50 }}>
      <div className="we-panel" onClick={(e) => e.stopPropagation()} style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 400 }}>
        <div className="syn-panel__header">
          <h3 className="syn-panel__title">Save Game</h3>
          <button type="button" className="syn-panel__close" onClick={onClose}>&#x2715;</button>
        </div>
        <div style={{ padding: '4px 0 0' }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #c4b08a)', marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Save Name
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
            placeholder={suggested || 'e.g. Round 15 — Plains campaign'}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '8px 12px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 6,
              color: 'var(--text)',
              fontSize: 14,
              fontFamily: 'inherit',
              outline: 'none',
              marginBottom: 16,
            }}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="menu-back" onClick={onClose}>Cancel</button>
            <button type="button" className="menu-primary" onClick={handleSave} disabled={!snapshot}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
