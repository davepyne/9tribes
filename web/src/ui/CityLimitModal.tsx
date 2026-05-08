import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

// ── Context ──

type CityLimitContextValue = {
  showCityLimit: () => void;
};

const CityLimitContext = createContext<CityLimitContextValue | null>(null);

export function useCityLimitModal() {
  const ctx = useContext(CityLimitContext);
  if (!ctx) throw new Error('useCityLimitModal must be used within CityLimitModalProvider');
  return ctx;
}

// ── Detection Hook ──

export function useCityLimitDetector(
  factions: Array<{ id: string; cityIds?: string[] }>,
  playerFactionId: string | null,
  onDetect: () => void,
) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current || !playerFactionId) return;

    const player = factions.find((f) => f.id === playerFactionId);
    if (!player) return;

    if ((player.cityIds?.length ?? 0) >= 3) {
      firedRef.current = true;
      onDetect();
    }
  }, [factions, playerFactionId, onDetect]);
}

// ── Provider ──

export function CityLimitModalProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);

  const showCityLimit = useCallback(() => setVisible(true), []);
  const dismiss = useCallback(() => setVisible(false), []);

  const ctxValue = useMemo(() => ({ showCityLimit }), [showCityLimit]);

  return (
    <CityLimitContext.Provider value={ctxValue}>
      {children}
      {visible ? <CityLimitModalInner onDismiss={dismiss} /> : null}
    </CityLimitContext.Provider>
  );
}

// ── Modal ──

function CityLimitModalInner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="clm-overlay" onClick={(e) => e.target === e.currentTarget && onDismiss()}>
      <div className="clm-card">
        <div className="clm-glow" />
        <div className="clm-header">
          <span className="clm-icon">&#9670;</span>
          <h2 className="clm-title">City Limit Reached</h2>
          <span className="clm-icon">&#9670;</span>
        </div>
        <div className="clm-divider">
          <span className="clm-divider-gem" />
        </div>
        <div className="clm-body">
          <p className="clm-text">
            Your civilization has reached the maximum of <strong>3 cities</strong>.
            No additional settlements can be founded.
          </p>
          <p className="clm-hint">
            Focus on strengthening your existing cities and units to dominate the battlefield.
          </p>
        </div>
        <button type="button" className="clm-dismiss" onClick={onDismiss}>
          Got It
        </button>
      </div>
    </div>
  );
}
