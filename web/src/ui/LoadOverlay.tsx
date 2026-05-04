import { useEffect, useState } from 'react';
import { deleteSaveGame, getSaveGame, listSaveGames, type SaveGameSummary } from '../app/savegames';

type LoadOverlayProps = {
  onClose: () => void;
};

export function LoadOverlay({ onClose }: LoadOverlayProps) {
  const [saves, setSaves] = useState<SaveGameSummary[]>([]);

  useEffect(() => {
    setSaves(listSaveGames());
  }, []);

  const handleLoad = (saveId: string) => {
    window.location.search = `?mode=play&save=${encodeURIComponent(saveId)}`;
  };

  const handleDelete = (saveId: string) => {
    if (window.confirm('Delete this save? This cannot be undone.')) {
      deleteSaveGame(saveId);
      setSaves(listSaveGames());
    }
  };

  return (
    <div className="syn-backdrop" onClick={onClose} style={{ zIndex: 50 }}>
      <div className="we-panel" onClick={(e) => e.stopPropagation()} style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 480 }}>
        <div className="syn-panel__header">
          <h3 className="syn-panel__title">Load Game</h3>
          <button type="button" className="syn-panel__close" onClick={onClose}>&#x2715;</button>
        </div>
        {saves.length > 0 ? (
          <div className="savegame-list">
            {saves.map((save) => (
              <div key={save.id} className="savegame-card">
                <div className="savegame-card__copy">
                  <h4>{save.label}</h4>
                  <p>{save.preview.playerFactionName ?? save.preview.activeFactionName} ┬╖ Round {save.preview.round}</p>
                  <span>{formatDate(save.savedAt)}</span>
                </div>
                <div className="savegame-card__actions">
                  <button type="button" className="menu-primary" onClick={() => handleLoad(save.id)}>Load</button>
                  <button type="button" className="menu-back" onClick={() => handleDelete(save.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="menu-empty-state" style={{ padding: '24px 0', textAlign: 'center' }}>
            <p className="menu-kicker">No Saves Yet</p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary, #c4b08a)', margin: '8px 0 0' }}>
              Use Game ΓåÆ Save (CTRL+S) during a campaign to save here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}
