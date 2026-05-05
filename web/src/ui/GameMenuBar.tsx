import React, { type CSSProperties, useState, useEffect } from 'react';
import type { ClientState } from '../game/types/clientState';
import { getFactionInfo } from '../data/faction-info';
import { DropdownMenu } from './DropdownMenu';
import { SynergyChip } from './SynergyChip';
import { FactionInfoPopup } from './FactionInfoPopup';
import type { MenuEntry } from './DropdownMenu';

type GameMenuBarProps = {
  state: ClientState;
  onOpenResearch: () => void;
  onOpenHelp?: () => void;
  onOpenControls?: () => void;
  onRestartSession?: () => void;
  onMenuAction: (action: string) => void;
};

function buildGameMenu(canUndo: boolean): MenuEntry[] {
  return [
    { label: 'New Game', action: 'new_game' },
    { label: 'Save (Ctrl+S)', action: 'save' },
    { label: 'Load (Ctrl+L)', action: 'load' },
    { label: 'Preferences', action: 'preferences', disabled: true },
    { divider: true, id: 'game-divider-1' },
    { label: 'Undo (Ctrl+Z)', action: 'undo', disabled: !canUndo },
    { divider: true, id: 'game-divider-2' },
    { label: 'Restart Session', action: 'restart_session' },
  ];
}

const reportsMenu: MenuEntry[] = [
  { label: 'Faction Summary', action: 'open_faction_summary' },
  { label: 'Supply & Logistics', action: 'open_supply_report' },
  { label: 'Combat Log', action: 'open_combat_log' },
  { label: 'Research Tree', action: 'open_research' },
];

const viewMenu: MenuEntry[] = [
  { label: 'Toggle Grid', action: 'toggle_grid', disabled: true },
  { label: 'Toggle Borders', action: 'toggle_borders', disabled: true },
  { label: 'Toggle Fog of War', action: 'toggle_fog', disabled: true },
  { divider: true, id: 'view-divider-1' },
  { label: 'Zoom to Capital', action: 'zoom_to_capital', disabled: true },
  { label: 'Zoom to Selection', action: 'zoom_to_selection', disabled: true },
  { divider: true, id: 'view-divider-2' },
  { label: 'Debug Overlay', action: 'toggle_debug_overlay' },
];

const helpMenu: MenuEntry[] = [
  { label: 'How to Play', action: 'open_how_to_play' },
  { label: 'Controls', action: 'open_controls' },
  { label: 'About', action: 'open_about', disabled: true },
];

export const GameMenuBar = React.memo(function GameMenuBar({ state, onOpenResearch, onOpenHelp, onOpenControls, onRestartSession, onMenuAction }: GameMenuBarProps) {
  const [factionPopupOpen, setFactionPopupOpen] = useState(false);
  const [unitPopupOpen, setUnitPopupOpen] = useState(false);
  const [summonPopupOpen, setSummonPopupOpen] = useState(false);
  const [traitPopupOpen, setTraitPopupOpen] = useState(false);
  const [hoverSelectOpen, setHoverSelectOpen] = useState(false);
  const [hoverSelectPos, setHoverSelectPos] = useState({ x: 0, y: 0 });
  const [hoverSelectUnit, setHoverSelectUnit] = useState<{ id: string; name: string } | null>(null);
  const [hoverSelectCity, setHoverSelectCity] = useState<{ id: string; name: string } | null>(null);
  const activeFaction = state.world.factions.find((f) => f.id === state.activeFactionId);
  const activeFactionSummary = state.hud.factionSummaries.find((summary) => summary.id === state.activeFactionId);
  const factionColor = activeFaction?.color ?? '#d6a34b';
  const factionInfo = state.activeFactionId ? getFactionInfo(state.activeFactionId) : null;
  const unitStats = factionInfo?.unitStats;

  useEffect(() => {
    window.openFactionPopup = () => {
      setFactionPopupOpen(true);
    };
    window.openHoverSelect = (x: number, y: number, unit: { id: string; name: string } | null, city: { id: string; name: string } | null) => {
      setHoverSelectPos({ x, y });
      setHoverSelectUnit(unit);
      setHoverSelectCity(city);
      setHoverSelectOpen(true);
    };
    window.selectUnitFromHover = (unitId: string) => {
      onMenuAction(`hover_select_unit:${unitId}`);
    };
    window.selectCityFromHover = (cityId: string) => {
      onMenuAction(`hover_select_city:${cityId}`);
    };
    return () => {
      window.openFactionPopup = undefined;
      window.openHoverSelect = undefined;
      window.selectUnitFromHover = undefined;
      window.selectCityFromHover = undefined;
    };
  }, [onMenuAction]);

  const handleMenuAction = (action: string) => {
    if (action === 'open_research') {
      onOpenResearch();
      return;
    }
    if (action === 'open_how_to_play') {
      onOpenHelp?.();
      return;
    }
    if (action === 'open_controls') {
      onOpenControls?.();
      return;
    }
    if (action === 'restart_session') {
      onRestartSession?.();
      return;
    }
    onMenuAction(action);
  };

  const researchChip = state.hud.researchChip;

  return (
    <nav className="gmb-root" style={{ '--gmb-faction-color': factionColor } as CSSProperties}>
      <FactionInfoPopup
        factionInfo={factionInfo}
        open={factionPopupOpen}
        onClose={() => setFactionPopupOpen(false)}
        unitPopupOpen={unitPopupOpen}
        onUnitPopupClose={() => setUnitPopupOpen(false)}
        onUnitClick={() => setUnitPopupOpen(true)}
        traitPopupOpen={traitPopupOpen}
        onTraitPopupClose={() => setTraitPopupOpen(false)}
        onTraitClick={() => setTraitPopupOpen(true)}
        containerStyle={{ position: 'fixed', top: '50px', left: '200px', zIndex: 999 }}
        traitPopupStyle={{ position: 'fixed', top: 'var(--menubar-height)', alignItems: 'flex-start', paddingTop: 'var(--menubar-height)' }}
      />
      {summonPopupOpen && unitStats && (
        <div className="unit-stats-panel" onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', top: '60px', right: '20px', width: '320px', zIndex: 9999 }}>
          <button className="unit-stats-panel__close" onClick={() => setSummonPopupOpen(false)}>├ù</button>
          <h3 className="unit-stats-panel__name" style={{ color: '#fff', display: 'block', textAlign: 'center' }}>{factionInfo?.signatureUnit ?? 'Signature Unit'}</h3>
          <div className="unit-stats-panel__stats">
            <div><span>Attack</span><strong>{unitStats.attack}</strong></div>
            <div><span>Defense</span><strong>{unitStats.defense}</strong></div>
            <div><span>Health</span><strong>{unitStats.health}</strong></div>
            <div><span>Moves</span><strong>{unitStats.moves}</strong></div>
            <div><span>Range</span><strong>{unitStats.range}</strong></div>
          </div>
          <div className="unit-stats-panel__tags">
            {unitStats.tags.map((tag, i) => <span key={i} className="unit-tag">{tag}</span>)}
          </div>
          <div className="unit-stats-panel__ability">
            <strong>Ability:</strong> {unitStats.ability}
          </div>
          <p className="unit-stats-panel__desc">{unitStats.description}</p>
          <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', color: '#fff', fontWeight: 600, textAlign: 'center', fontSize: '13px' }}>
            SUMMON: {factionInfo?.summonCondition ?? 'Your unit must be standing in Plains or Savannah terrain.'}
          </div>
        </div>
      )}
      {hoverSelectOpen && (
        <div className="hover-select-popup" style={{ position: 'fixed', top: hoverSelectPos.y, left: hoverSelectPos.x, zIndex: 99999 }} onClick={(e) => e.stopPropagation()}>
          <div className="hover-select-title">Select:</div>
          {hoverSelectUnit && (
            <button className="hover-select-btn" onClick={() => { window.selectUnitFromHover?.(hoverSelectUnit.id); setHoverSelectOpen(false); }}>
              Unit: {hoverSelectUnit.name}
            </button>
          )}
          {hoverSelectCity && (
            <button className="hover-select-btn" onClick={() => { window.selectCityFromHover?.(hoverSelectCity.id); setHoverSelectOpen(false); }}>
              Settlement: {hoverSelectCity.name}
            </button>
          )}
        </div>
      )}
      <div className="gmb-menus">
        <DropdownMenu label="Game" items={buildGameMenu(state.actions.canUndo)} onAction={handleMenuAction} />
        <DropdownMenu label="Reports" items={reportsMenu} onAction={handleMenuAction} />
        <DropdownMenu label="View" items={viewMenu} onAction={handleMenuAction} />
        <DropdownMenu label="Help" items={helpMenu} onAction={handleMenuAction} />
      </div>

      <div className="gmb-status">
        <div className="gmb-chip gmb-chip--faction" onClick={() => setFactionPopupOpen(true)}>
          <span className="gmb-swatch" style={{ background: factionColor }} />
          <span>{state.hud.activeFactionName}</span>
        </div>

        <div className="gmb-chip gmb-chip--round">
          <span className="gmb-chip-label">Round</span>
          <span>{state.turn}</span>
        </div>

        <div
          className={`gmb-chip gmb-chip--villages${(activeFactionSummary?.villages ?? 0) > 5 ? ' gmb-chip--villages-surplus' : ''}`}
          title={`${state.hud.activeFactionName} controls ${activeFactionSummary?.villages ?? 0} villages.`}
        >
          <span className="gmb-chip-label">Villages</span>
          <span>{(activeFactionSummary?.villages ?? 0)}</span>
        </div>

        {researchChip ? (
          <button
            type="button"
            className="gmb-chip gmb-chip--research"
            onClick={onOpenResearch}
          >
            <span className="gmb-chip-label">Research</span>
            <span>{researchChip.activeNodeName ?? 'Idle'}</span>
          </button>
        ) : null}

        {state.hud.summonTimer ? (
          state.hud.summonTimer.isActive ? (
            <button type="button" className="gmb-chip gmb-chip--summon-active" onClick={() => setSummonPopupOpen(true)}>
              <span className="gmb-chip-label">Summon</span>
              <span>Active ({state.hud.summonTimer.turnsRemaining})</span>
            </button>
          ) : (
            <button type="button" className="gmb-chip gmb-chip--summon-cooldown" title={`${state.hud.summonTimer.cooldownRemaining} turns until ${factionInfo?.signatureUnit ?? 'signature'} unit is summoned`} onClick={() => setSummonPopupOpen(true)}>
              <span className="gmb-chip-label">Summon</span>
              <span>{state.hud.summonTimer.cooldownRemaining}</span>
            </button>
          )
        ) : null}

        {state.hud.supply ? (
          <div
            className={`gmb-chip gmb-chip--supply${state.hud.supply.deficit > 0 ? ' gmb-chip--deficit' : ''}`}
            title={state.hud.supply.deficit > 0
              ? `DEFICIT: -${state.hud.supply.deficit.toFixed(1)} supply/turn\nMorale drain: ~${state.hud.supply.deficit.toFixed(1)} per unit/turn\nExhaustion: ${state.hud.exhaustion?.points?.toFixed(1) ?? 0} pts (+${(state.hud.supply.deficit * 2).toFixed(1)}/turn)\nProduction output reduced by ${Math.round((state.hud.exhaustion?.productionPenalty ?? 0) * 100)}%\nMorale penalty: ${state.hud.exhaustion?.moralePenalty ?? 0} per unit`
              : 'Supply is balanced. No penalties in effect.'}
          >
            <span className="gmb-chip-label">Supply</span>
            <span>{state.hud.supply.used}/{Math.floor(state.hud.supply.income)}</span>
          </div>
        ) : null}

        <SynergyChip state={state} />

      </div>
    </nav>
  );
});
