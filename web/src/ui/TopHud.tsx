import React, { type CSSProperties, useState, useMemo } from 'react';
import type { ClientState } from '../game/types/clientState';
import { getFactionInfo } from '../data/faction-info';
import { FactionInfoPopup } from './FactionInfoPopup';

type TopHudProps = {
  state: ClientState;
  turnBanner?: string | null;
  onOpenResearch?: () => void;
};

export const TopHud = React.memo(function TopHud({ state, turnBanner, onOpenResearch }: TopHudProps) {
  const [factionPopup, setFactionPopup] = useState<boolean>(false);
  const [supplyPopup, setSupplyPopup] = useState<boolean>(false);
  const [unitPopupOpen, setUnitPopupOpen] = useState<boolean>(false);
  const [traitPopupOpen, setTraitPopupOpen] = useState<boolean>(false);
  const activeFactionColor = state.world.factions.find((faction) => faction.id === state.activeFactionId)?.color ?? '#d6a34b';
  const recoveringCityCount = state.world.cities.filter(
    (city) => city.factionId === state.activeFactionId && city.turnsSinceCapture !== undefined,
  ).length;

  const factionInfo = useMemo(() => {
    const id = state.activeFactionId;
    if (!id) return null;
    return getFactionInfo(id) ?? null;
  }, [state.activeFactionId]);

  const handleFactionClick = () => {
    console.log('Faction click handler called, factionInfo:', factionInfo);
    setFactionPopup(true);
  };

  return (
    <header className="top-hud">
      <FactionInfoPopup
        factionInfo={factionInfo}
        open={factionPopup}
        onClose={() => setFactionPopup(false)}
        unitPopupOpen={unitPopupOpen}
        onUnitPopupClose={() => setUnitPopupOpen(false)}
        onUnitClick={() => setUnitPopupOpen(true)}
        traitPopupOpen={traitPopupOpen}
        onTraitPopupClose={() => setTraitPopupOpen(false)}
        onTraitClick={() => setTraitPopupOpen(true)}
      />
      <div>
        <p className="eyebrow">War-Civ 2</p>
        <h1>{state.hud.title}</h1>
        <p className="subtitle">{state.hud.subtitle}</p>
        {turnBanner ? <p className="turn-banner">{turnBanner}</p> : null}
      </div>

      <div className="top-hud__stats">
        <div className="status-chip">
          <span className="chip-label">Mode</span>
          <strong>{state.mode}</strong>
        </div>
<div
          className="status-chip status-chip--active-faction faction-click-target"
          style={{ '--chip-color': activeFactionColor } as CSSProperties}
          onClick={handleFactionClick}
        >
          <span className="chip-label">Faction</span>
          <strong>{state.hud.activeFactionName}</strong>
        </div>
        <div className="status-chip">
          <span className="chip-label">Phase</span>
          <strong>{state.hud.phaseLabel}</strong>
        </div>
        <div className="status-chip">
          <span className="chip-label">Round</span>
          <strong>{state.turn}</strong>
        </div>
        {state.hud.researchChip ? (
          <div className="status-chip status-chip--research" role="button" tabIndex={0} onClick={onOpenResearch} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpenResearch?.(); }}>
            <span className="chip-label">Research</span>
            <strong>{state.hud.researchChip.activeNodeName ?? 'Idle'}</strong>
          </div>
        ) : null}
        {state.hud.supply ? (
          <div
            className={`status-chip${state.hud.supply.deficit > 0 ? ' status-chip--deficit status-chip--over-capacity' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => { setSupplyPopup(true); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSupplyPopup(true); }}
          >
            <span className="chip-label">Supply</span>
            <strong>{state.hud.supply.used}/{Math.floor(state.hud.supply.income)}</strong>
          </div>
        ) : null}
      </div>
      {supplyPopup && state.hud.supply && (
        <div className="supply-popup-overlay" onClick={() => setSupplyPopup(false)}>
          <div className="supply-popup" onClick={(e) => e.stopPropagation()}>
            <button className="supply-popup__close" onClick={() => setSupplyPopup(false)}>├ù</button>
            <h3 className="supply-popup__title">Supply Breakdown</h3>
            <div className="supply-popup__stat">
              <span>Income</span>
              <strong>{Math.floor(state.hud.supply.income)}</strong>
            </div>
            <div className="supply-popup__stat">
              <span>Used</span>
              <strong>{state.hud.supply.used}</strong>
            </div>
            <div className="supply-popup__stat">
              <span>Balance</span>
              <strong className={state.hud.supply.deficit > 0 ? 'supply-popup--deficit' : 'supply-popup--surplus'}>
                {state.hud.supply.deficit > 0 ? `-${state.hud.supply.deficit.toFixed(1)}` : `+${(state.hud.supply.income - state.hud.supply.used).toFixed(1)}`} per turn
              </strong>
            </div>
            {state.hud.exhaustion && state.hud.exhaustion.points > 0 && (
              <>
                <div className="supply-popup__divider">Penalties</div>
                <div className="supply-popup__stat supply-popup__stat--penalty">
                  <span>Exhaustion</span>
                  <span>{state.hud.exhaustion.points.toFixed(1)} pts</span>
                </div>
                <div className="supply-popup__stat supply-popup__stat--penalty">
                  <span>Production</span>
                  <span>-{Math.round(state.hud.exhaustion.productionPenalty * 100)}%</span>
                </div>
                <div className="supply-popup__stat supply-popup__stat--penalty">
                  <span>Morale</span>
                  <span>-{state.hud.exhaustion.moralePenalty} per unit</span>
                </div>
              </>
            )}
            {recoveringCityCount > 0 && (
              <div className="supply-popup__note">
                ΓÜá {recoveringCityCount} city{recoveringCityCount !== 1 ? 'ies' : 'y'} recovering from capture
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
});
