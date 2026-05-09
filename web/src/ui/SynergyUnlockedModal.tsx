import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import pairSynergiesData from '../data/pair-synergies.json';
import emergentRulesData from '../data/emergent-rules.json';
import { SynergyCard } from './SynergyCard';
import type { PairSynergyData, EmergentRuleData } from './SynergyCard';
import { playSynergyUnlockSting } from '../app/audio/sfxManager';

// ── Types ──

type PairSynergy = {
  id: string;
  name: string;
  domains: string[];
  description: string;
};

type EmergentRule = {
  id: string;
  name: string;
  condition: string;
  domainSets: Record<string, string[]>;
  effect: { description: string };
};

type SynergyUnlockEvent = {
  synergies: Array<{ id: string; name: string; domains: string[]; description: string }>;
  tripleStack: { id: string; name: string; description: string } | null;
};

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

const EMERGENT_RULES: EmergentRule[] = (emergentRulesData as unknown as { rules: EmergentRule[] }).rules;

// ── Helpers ──

function formatDomainName(domainId: string): string {
  return domainId
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function newlyActivePairSynergies(
  prevDomains: string[],
  currDomains: string[],
): PairSynergy[] {
  if (currDomains.length < 2) return [];

  const addedDomains = currDomains.filter((d) => !prevDomains.includes(d));
  if (addedDomains.length === 0) return [];

  const matches: PairSynergy[] = [];
  for (const synergy of PAIR_SYNERGIES) {
    const hadAll = synergy.domains.every((d) => prevDomains.includes(d));
    const hasAll = synergy.domains.every((d) => currDomains.includes(d));
    if (!hadAll && hasAll) {
      matches.push(synergy);
    }
  }
  return matches;
}

function checkTripleStackActivation(
  prevDomains: string[],
  currDomains: string[],
): { id: string; name: string; description: string } | null {
  for (const rule of EMERGENT_RULES) {
    if (!rule.domainSets) continue;

    const categories = Object.keys(rule.domainSets);
    if (categories.length < 3) continue;

    const prevMet = categories.filter((cat) =>
      rule.domainSets[cat]?.some((d) => prevDomains.includes(d)),
    ).length;
    const currMet = categories.filter((cat) =>
      rule.domainSets[cat]?.some((d) => currDomains.includes(d)),
    ).length;

    if (prevMet < categories.length && currMet >= categories.length) {
      return { id: rule.id, name: rule.name, description: rule.effect.description };
    }
  }
  return null;
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
  factions: Array<{ id: string; learnedDomains?: string[] }>,
  playerFactionId: string | null,
  onDetect: (event: SynergyUnlockEvent) => void,
) {
  const prevRef = useRef<string[] | null>(null);

  useEffect(() => {
    if (!playerFactionId) return;

    const player = factions.find((f) => f.id === playerFactionId);
    if (!player) return;

    const current = player.learnedDomains ?? [];
    const previous = prevRef.current;

    if (previous !== null && current !== previous) {
      const synergies = newlyActivePairSynergies(previous, current);
      const tripleStack = checkTripleStackActivation(previous, current);

      if (synergies.length > 0 || tripleStack) {
        onDetect({ synergies, tripleStack });
      }
    }

    prevRef.current = current;
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
