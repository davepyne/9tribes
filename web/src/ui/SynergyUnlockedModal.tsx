import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import pairSynergiesData from '../data/pair-synergies.json';
import emergentRulesData from '../data/emergent-rules.json';
import { SynergyCard } from './SynergyCard';
import type { PairSynergyData, EmergentRuleData } from './SynergyCard';
import { playSynergyUnlockSting } from '../app/audio/sfxManager';
import type { BackendSynergyState } from './resolveActiveSynergies';

// ── Types ──

type PairSynergy = {
  id: string;
  name: string;
  domains: string[];
  description: string;
};

type SynergyUnlockEvent = {
  synergies: Array<{ id: string; name: string; domains: string[]; description: string }>;
  tripleStack: { id: string; name: string; description: string } | null;
};

type FactionSynergyState = BackendSynergyState & { id: string };

// ── Typed data ──

const PAIR_SYNERGIES: PairSynergy[] = (pairSynergiesData as { pairSynergies: Array<{
  id: string; name: string; domains: string[]; description: string;
}> }).pairSynergies.map((s) => ({
  id: s.id,
  name: s.name,
  domains: s.domains,
  description: s.description,
}));

const PAIR_SYNERGIES_FULL: PairSynergyData[] = (pairSynergiesData as { pairSynergies: PairSynergyData[] }).pairSynergies;

const EMERGENT_RULES_FULL: EmergentRuleData[] = (emergentRulesData as unknown as { rules: EmergentRuleData[] }).rules;

// ── Helpers ──

function formatDomainName(domainId: string): string {
  return domainId
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ── Context ──

type SynergyModalContextValue = {
  showSynergyUnlock: (event: SynergyUnlockEvent) => void;
};

const SynergyModalContext = createContext<SynergyModalContextValue | null>(null);

export function useSynergyModal() {
  const ctx = useContext(SynergyModalContext);
  if (!ctx) throw new Error('useSynergyModal must be used within SynergyUnlockedModalProvider');
  return ctx;
}

// ── Detection Hook ──

export function useSynergyUnlockDetector(
  factions: FactionSynergyState[],
  playerFactionId: string | null,
  onDetect: (event: SynergyUnlockEvent) => void,
) {
  const prevRef = useRef<FactionSynergyState | null>(null);

  useEffect(() => {
    if (!playerFactionId) return;

    const player = factions.find((f) => f.id === playerFactionId);
    if (!player) return;

    const prev = prevRef.current;
    prevRef.current = player;

    if (!prev) return;

    const allPairs = PAIR_SYNERGIES;
    const allRules = EMERGENT_RULES_FULL;

    // Detect native self-pair unlock
    if (!prev.activeNativePairId && player.activeNativePairId) {
      const pair = allPairs.find((p) => p.id === player.activeNativePairId);
      if (pair) {
        onDetect({
          synergies: [{ id: pair.id, name: pair.name, domains: pair.domains, description: pair.description }],
          tripleStack: null,
        });
        return;
      }
    }

    // Detect double stack unlock (new pair IDs appeared)
    const prevDouble = new Set(prev.activeDoubleStackPairIds ?? []);
    const currDouble = player.activeDoubleStackPairIds ?? [];
    const newDoubleIds = currDouble.filter((id) => !prevDouble.has(id));
    if (newDoubleIds.length > 0 && !player.hasActiveTriple) {
      const synergies: SynergyUnlockEvent['synergies'] = [];
      for (const id of newDoubleIds) {
        const pair = allPairs.find((p) => p.id === id);
        if (pair) synergies.push({ id: pair.id, name: pair.name, domains: pair.domains, description: pair.description });
      }
      if (synergies.length > 0) {
        onDetect({ synergies, tripleStack: null });
        return;
      }
    }

    // Detect triple stack unlock
    if (!prev.hasActiveTriple && player.hasActiveTriple && player.activeTripleEmergentRuleId) {
      const rule = allRules.find((r) => r.id === player.activeTripleEmergentRuleId);
      if (rule) {
        // Include all triple pair cards as synergies
        const pairIds = player.activeTriplePairIds ?? [];
        const synergies: SynergyUnlockEvent['synergies'] = [];
        for (const id of pairIds) {
          const pair = allPairs.find((p) => p.id === id);
          if (pair) synergies.push({ id: pair.id, name: pair.name, domains: pair.domains, description: pair.description });
        }
        onDetect({
          synergies,
          tripleStack: { id: rule.id, name: rule.name, description: rule.effect.description },
        });
      }
    }
  }, [factions, playerFactionId, onDetect]);
}

// ── Provider ──

export function SynergyUnlockedModalProvider({ children }: { children: React.ReactNode }) {
  const [event, setEvent] = useState<SynergyUnlockEvent | null>(null);

  const showSynergyUnlock = useCallback((e: SynergyUnlockEvent) => setEvent(e), []);
  const dismiss = useCallback(() => setEvent(null), []);

  const ctxValue = useMemo(() => ({ showSynergyUnlock }), [showSynergyUnlock]);

  return (
    <SynergyModalContext.Provider value={ctxValue}>
      {children}
      {event ? <SynergyModalInner event={event} onDismiss={dismiss} /> : null}
    </SynergyModalContext.Provider>
  );
}

// ── Modal ──

type ModalInnerProps = {
  event: SynergyUnlockEvent;
  onDismiss: () => void;
};

function SynergyModalInner({ event, onDismiss }: ModalInnerProps) {
  // Synergy unlock sting fires once on mount (per event).
  useEffect(() => {
    playSynergyUnlockSting();
  }, []);

  // Resolve full synergy data with flavor strings
  const pairCards = event.synergies.map((s) => {
    const full = PAIR_SYNERGIES_FULL.find((p) => p.id === s.id);
    return full ?? null;
  }).filter(Boolean) as PairSynergyData[];

  const tripleCard: EmergentRuleData | null = event.tripleStack
    ? EMERGENT_RULES_FULL.find((r) => r.id === event.tripleStack!.id) ?? null
    : null;

  return (
    <div className="sym-overlay" onClick={(e) => e.target === e.currentTarget && onDismiss()}>
      <div className="sym-card">
        <div className="sym-glow" />
        <div className="sym-header">
          <span className="sym-icon">&#10038;</span>
          <h2 className="sym-title">Synergy Unlocked!</h2>
          <span className="sym-icon">&#10038;</span>
        </div>
        <div className="sym-divider">
          <span className="sym-divider-gem" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '60vh', overflowY: 'auto', padding: '0 4px' }}>
          {tripleCard && (
            <SynergyCard
              mode="friendly"
              synergy={tripleCard}
              kind="triple"
              factionColor="#d6a34b"
            />
          )}
          {pairCards.map((data) => (
            <SynergyCard
              key={data.id}
              mode="friendly"
              synergy={data}
              kind="pair"
              factionColor="#d6a34b"
            />
          ))}
        </div>

        <button type="button" className="sym-dismiss" onClick={onDismiss}>
          Continue
        </button>
      </div>
    </div>
  );
}
