import React, { useState, useEffect } from 'react';
import type { ClientState } from '../game/types/clientState';
import type { FactionInfo } from '../data/faction-info';
import { FactionInfoPopup } from './FactionInfoPopup';
import { MetaRow } from './inspectors/MetaRow';
import { UnitInspectorSection } from './inspectors/UnitInspectorSection';
import { CityInspectorSection } from './inspectors/CityInspectorSection';

type ContextInspectorProps = {
  state: ClientState;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSetCityProduction: (cityId: string, prototypeId: string) => void;
  onCancelCityProduction: (cityId: string) => void;
  onRemoveFromQueue: (cityId: string, queueIndex: number) => void;
  onReorderQueue: (cityId: string, fromIndex: number, toIndex: number) => void;
  onSetTargetingMode: (mode: 'move' | 'attack') => void;
  onPrepareAbility: (unitId: string, ability: 'brace' | 'ambush') => void;
  onBoardTransport: (unitId: string, transportId: string) => void;
  onDisembarkUnit: (unitId: string, transportId: string, destination: { q: number; r: number }) => void;
  onDeselect: () => void;
  onCloseCityProduction?: () => void;
};

export const ContextInspector = React.memo(function ContextInspector({ state, isOpen, onOpen, onClose, onSetCityProduction, onCancelCityProduction, onRemoveFromQueue, onReorderQueue, onSetTargetingMode, onPrepareAbility, onBoardTransport, onDisembarkUnit, onDeselect, onCloseCityProduction }: ContextInspectorProps) {
  const [factionPopup, setFactionPopup] = useState<FactionInfo | null>(null);
  const [domainPopup, setDomainPopup] = useState<{domainId: string; name: string; description: string} | null>(null);
  const [unitPopupOpen, setUnitPopupOpen] = useState(false);
  const [traitPopupOpen, setTraitPopupOpen] = useState(false);

  // Auto-open to production tab when city production popup is requested
  useEffect(() => {
    if (state.productionPopupCityId) {
      onOpen();
    }
  }, [state.productionPopupCityId, onOpen]);

  useEffect(() => {
    if (!state.selected) {
      return;
    }

    onOpen();
  }, [state.inspectorRequestId, onOpen]);

  const selection = state.selected;

  // Only render full panel when explicitly open
  if (!isOpen || !selection) {
    return (
      <aside className="ci-root">
        {selection && !isOpen && (
          <button
            type="button"
            className="ci-toggle"
            onClick={() => onOpen()}
            aria-label="Open inspector"
          >
            <span className="ci-toggle__icon">&#9776;</span>
          </button>
        )}
      </aside>
    );
  }

  const selectedUnitId = selection.type === 'unit' ? selection.unitId : null;
  const selectedUnit = selectedUnitId
    ? state.world.units.find((u) => u.id === selectedUnitId)
    : null;
  const selectedCity = state.hud.selectedCity;
  const showRestrictedEnemyCityInfo = !!selectedCity && !selectedCity.isFriendly;
  const settlementPreview = state.hud.settlementPreview;
  const hoveredKey = state.hoveredHex ? `${state.hoveredHex.q},${state.hoveredHex.r}` : null;
  const hoveredTile = hoveredKey ? state.world.map.hexes.find((hex) => hex.key === hoveredKey) : null;

  return (
    <aside className="ci-root ci-root--open">
      {/* Faction Popup */}
      <FactionInfoPopup
        factionInfo={factionPopup}
        open={factionPopup !== null}
        onClose={() => setFactionPopup(null)}
        unitPopupOpen={unitPopupOpen}
        onUnitPopupClose={() => setUnitPopupOpen(false)}
        onUnitClick={() => setUnitPopupOpen(true)}
        traitPopupOpen={traitPopupOpen}
        onTraitPopupClose={() => setTraitPopupOpen(false)}
        onTraitClick={() => setTraitPopupOpen(true)}
      />
      {/* Domain Popup */}
      {domainPopup && (
        <div className="faction-popup-overlay" onClick={() => setDomainPopup(null)}>
          <div className="faction-popup" onClick={(e) => e.stopPropagation()}>
            <button className="faction-popup__close" onClick={() => setDomainPopup(null)}>×</button>
            <h3 className="faction-popup__name">{domainPopup.name}</h3>
            <p className="faction-popup__intro">{domainPopup.description}</p>
          </div>
        </div>
      )}
      <div className="ci-scroll">
        {/* Header */}
        <div className="ci-header">
          <button type="button" className="ci-close" onClick={() => { onClose(); onCloseCityProduction?.(); }} aria-label="Close inspector">
            &times;
          </button>
          <div className="ci-header-text">
            <p className="panel-kicker">
              {selection.type === 'unit' ? 'Unit' : selection.type === 'city' ? 'Settlement' : selection.type === 'village' ? 'Village' : 'Tile'}
            </p>
            <h2>{state.hud.selectedTitle}</h2>
          </div>
        </div>

        {/* Unit Inspector */}
        {selectedUnit ? (
          <>
            <p className="ci-desc">{state.hud.selectedDescription}</p>
            <UnitInspectorSection
              unit={selectedUnit}
              mode={state.mode}
              settlementPreview={settlementPreview}
              onPrepareAbility={onPrepareAbility}
              onBoardTransport={onBoardTransport}
              onDisembarkUnit={onDisembarkUnit}
              onFactionPopup={(info) => setFactionPopup(info)}
              onDomainPopup={(popup) => setDomainPopup(popup)}
            />
          </>
        ) : null}

        {/* City Inspector */}
        {selectedCity ? (
          <CityInspectorSection
            city={selectedCity}
            showRestrictedEnemyCityInfo={showRestrictedEnemyCityInfo}
            onSetCityProduction={onSetCityProduction}
            onCancelCityProduction={onCancelCityProduction}
            onRemoveFromQueue={onRemoveFromQueue}
            onReorderQueue={onReorderQueue}
          />
        ) : null}

        {/* Hex Inspector */}
        {selection.type === 'hex' ? (
          <div className="ci-section">
            <p className="ci-desc">{state.hud.selectedDescription}</p>
            {state.hud.selectedMeta.map((entry) => (
              <MetaRow label={entry.label} key={entry.label}>{entry.value}</MetaRow>
            ))}
            {hoveredTile ? (
              <>
                <MetaRow label="Terrain">{hoveredTile.terrain}</MetaRow>
                <MetaRow label="Owner">{hoveredTile.ownerFactionName ?? hoveredTile.ownerFactionId ?? 'Neutral'}</MetaRow>
                <MetaRow label="Visibility">{hoveredTile.visibility}</MetaRow>
              </>
            ) : null}
          </div>
        ) : null}

        {/* Village Inspector */}
        {selection.type === 'village' ? (
          <div className="ci-section">
            <p className="ci-desc">{state.hud.selectedDescription}</p>
            {state.hud.selectedMeta.map((entry) => (
              <MetaRow label={entry.label} key={entry.label}>{entry.value}</MetaRow>
            ))}
          </div>
        ) : null}

        {/* Replay-mode combat/intent details */}
      </div>
    </aside>
  );
});
