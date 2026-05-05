import { memo } from 'react';
import type { CSSProperties } from 'react';
import type { FactionInfo } from '../data/faction-info';

type FactionInfoPopupProps = {
  /** Faction data to display; if null/undefined, nothing renders */
  factionInfo: FactionInfo | null | undefined;
  /** Whether the main faction info popup is open */
  open: boolean;
  /** Called when the main popup should close */
  onClose: () => void;
  /** Whether the unit stats sub-popup is open */
  unitPopupOpen: boolean;
  /** Called when the unit stats sub-popup should close */
  onUnitPopupClose: () => void;
  /** Called when the signature unit label is clicked (opens unit stats) */
  onUnitClick: () => void;
  /** Whether the trait detail sub-popup is open */
  traitPopupOpen: boolean;
  /** Called when the trait detail sub-popup should close */
  onTraitPopupClose: () => void;
  /** Called when the special trait label is clicked (opens trait popup) */
  onTraitClick: () => void;
  /**
   * Optional inline style for the main popup container.
   * GameMenuBar uses fixed positioning; the other two use an overlay pattern.
   * When provided, the component renders a plain div instead of the overlay pattern.
   */
  containerStyle?: CSSProperties;
  /** Optional style overrides for the trait detail popup (e.g. fixed positioning) */
  traitPopupStyle?: CSSProperties;
  /** Fallback color used for unit stats header when factionInfo is somehow null */
  fallbackColor?: string;
};

export const FactionInfoPopup = memo(function FactionInfoPopup({
  factionInfo,
  open,
  onClose,
  unitPopupOpen,
  onUnitPopupClose,
  onUnitClick,
  traitPopupOpen,
  onTraitPopupClose,
  onTraitClick,
  containerStyle,
  traitPopupStyle,
  fallbackColor,
}: FactionInfoPopupProps) {
  if (!factionInfo) return null;

// Shared sub-popups (trait detail + unit stats) — always rendered when open,
  // regardless of whether the main popup uses overlay or fixed positioning.
  const traitPopup = traitPopupOpen && (
    <div className="faction-popup-overlay" onClick={onTraitPopupClose} style={traitPopupStyle}>
      <div className="faction-popup" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
        <button className="faction-popup__close" onClick={onTraitPopupClose}>×</button>
        <h3 className="faction-popup__name" style={{ color: factionInfo.color }}>{factionInfo.specialTrait}</h3>
        <p className="faction-popup__intro" style={{ fontSize: 14, lineHeight: 1.6 }}>{factionInfo.specialAbility}</p>
      </div>
    </div>
  );

  const unitPopup = unitPopupOpen && factionInfo.unitStats && (
    <div className="faction-popup-overlay" onClick={onUnitPopupClose}>
      <div className="faction-popup unit-stats-popup" onClick={(e) => e.stopPropagation()}>
        <button className="faction-popup__close" onClick={onUnitPopupClose}>×</button>
        <h3 className="unit-stats-panel__name" style={{ color: factionInfo.color }}>{factionInfo.signatureUnit}</h3>
        <div className="unit-stats-panel__stats">
          <div><span>Attack</span><strong>{factionInfo.unitStats.attack}</strong></div>
          <div><span>Defense</span><strong>{factionInfo.unitStats.defense}</strong></div>
          <div><span>Health</span><strong>{factionInfo.unitStats.health}</strong></div>
          <div><span>Moves</span><strong>{factionInfo.unitStats.moves}</strong></div>
          <div><span>Range</span><strong>{factionInfo.unitStats.range}</strong></div>
        </div>
        <div className="unit-stats-panel__tags">
          {factionInfo.unitStats.tags.map((tag, i) => <span key={i} className="unit-tag">{tag}</span>)}
        </div>
        <div className="unit-stats-panel__ability">
          <strong>Ability:</strong> {factionInfo.unitStats.ability}
        </div>
        <p className="unit-stats-panel__desc">{factionInfo.unitStats.description}</p>
      </div>
    </div>
  );

  // Main faction info popup — two rendering modes:
  // 1. With containerStyle: plain div (GameMenuBar fixed-position style)
  // 2. Without containerStyle: overlay pattern (ContextInspector, TopHud)
  const mainPopupContent = (
    <>
      <button className="faction-popup__close" onClick={onClose}>×</button>
      <h3 className="faction-popup__name" style={{ color: factionInfo.color }}>{factionInfo.name} — {factionInfo.specialTrait}</h3>
      <div className="faction-popup__section">
        <span className="faction-popup__label">Native Ability</span>
        <span>{factionInfo.nativeDomain}</span>
      </div>
      <div className="faction-popup__section">
        <span className="faction-popup__label">Home Biome</span>
        <span>{factionInfo.homeBiome}</span>
      </div>
      <div className="faction-popup__section">
        <span className="faction-popup__label">Signature Unit</span>
        <span className="signature-unit-click" onClick={onUnitClick}>{factionInfo.signatureUnit}</span>
      </div>
      <div className="faction-popup__section">
        <span className="faction-popup__label">Special Ability</span>
        <span>{factionInfo.specialAbility}</span>
      </div>
      <p className="faction-popup__intro">{factionInfo.intro}</p>
      <div className="faction-popup__section">
        <span className="faction-popup__label">Strengths</span>
        <ul className="faction-popup__list">
          {factionInfo.strengths.map((s, i) => <li key={i}>{s}</li>)}
        </ul>
      </div>
      <div className="faction-popup__section">
        <span className="faction-popup__label">Weaknesses</span>
        <ul className="faction-popup__list">
          {factionInfo.weaknesses.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      </div>
      <div className="faction-popup__section">
        <span className="faction-popup__label">Tip</span>
        <p className="faction-popup__tip">{factionInfo.tip}</p>
      </div>
    </>
  );

  if (!open) {
    // Main popup closed — only render sub-popups if they're open
    return (
      <>
        {traitPopupOpen && (
          <div className="faction-popup-overlay" onClick={onTraitPopupClose} style={traitPopupStyle}>
            <div className="faction-popup" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
              <button className="faction-popup__close" onClick={onTraitPopupClose}>×</button>
              <h3 className="faction-popup__name" style={{ color: factionInfo.color }}>{factionInfo.specialTrait}</h3>
              <p className="faction-popup__intro" style={{ fontSize: 14, lineHeight: 1.6 }}>{factionInfo.specialAbility}</p>
            </div>
          </div>
        )}
        {unitPopup}
      </>
    );
  }

  if (containerStyle) {
    // GameMenuBar mode: fixed-position container, no overlay
    return (
      <>
        <div className="faction-info-panel" onClick={(e) => e.stopPropagation()} style={containerStyle}>
          {mainPopupContent}
        </div>
        {traitPopupOpen && (
          <div className="faction-popup-overlay" onClick={onTraitPopupClose} style={traitPopupStyle}>
            <div className="faction-popup" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
              <button className="faction-popup__close" onClick={onTraitPopupClose}>×</button>
              <h3 className="faction-popup__name" style={{ color: factionInfo.color }}>{factionInfo.specialTrait}</h3>
              <p className="faction-popup__intro" style={{ fontSize: 14, lineHeight: 1.6 }}>{factionInfo.specialAbility}</p>
            </div>
          </div>
        )}
        {unitPopup}
      </>
    );
  }

  // Default mode: overlay pattern (ContextInspector, TopHud)
  return (
    <>
      <div className="faction-popup-overlay" onClick={onClose}>
        <div className="faction-popup" onClick={(e) => e.stopPropagation()}>
          {mainPopupContent}
        </div>
      </div>
      {traitPopup}
      {unitPopup}
    </>
  );
});
