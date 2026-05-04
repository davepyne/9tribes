import React, { useEffect } from 'react';
import type { ClientState } from '../game/types/clientState';

type ReportsOverlayProps = {
  reportType: 'faction_summary' | 'combat_log' | 'supply_report';
  state: ClientState;
  onClose: () => void;
};

const reportTitles: Record<string, string> = {
  faction_summary: 'Faction Summary',
  combat_log: 'Combat Log',
  supply_report: 'Supply & Logistics',
};

export const ReportsOverlay = React.memo(function ReportsOverlay({ reportType, state, onClose }: ReportsOverlayProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div className="rpt-overlay" onClick={onClose}>
      <div className="rpt-card" onClick={(e) => e.stopPropagation()}>
        <div className="rpt-header">
          <button type="button" className="rpt-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
          <h2 className="rpt-title">{reportTitles[reportType]}</h2>
        </div>

        <div className="rpt-body">
          {reportType === 'faction_summary' ? (
            <div className="rpt-faction-list">
              {state.hud.factionSummaries.map((faction) => (
                <div className="rpt-faction-row" key={faction.id}>
                  <span className="faction-swatch" style={{ background: faction.color }} />
                  <strong>{faction.name}</strong>
                  <span className="rpt-faction-stats">
                    {faction.livingUnits} units · {faction.cities} cities
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {reportType === 'combat_log' ? (
            <div className="rpt-combat-list">
              {state.hud.recentCombat.length === 0 ? (
                <p className="quiet-copy">No combat events recorded.</p>
              ) : (
                state.hud.recentCombat.map((event, i) => (
                  <div className="rpt-combat-entry" key={`${event.attackerUnitId}-${event.defenderUnitId}-${i}`}>
                    <p>{event.summary}</p>
                  </div>
                ))
              )}
            </div>
          ) : null}

          {reportType === 'supply_report' ? (
            <div className="rpt-supply-list">
              {state.hud.factionSummaries.map((faction) => (
                <div className="rpt-supply-row" key={faction.id}>
                  <span className="faction-swatch" style={{ background: faction.color }} />
                  <strong>{faction.name}</strong>
                  <span>{faction.cities} cities · {faction.livingUnits} units</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
});
