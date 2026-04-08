import { useEffect, useRef, useState } from 'react';
import type { ReplayCombatEvent } from '../game/types/replay';

type CombatLogPanelProps = {
  events: ReplayCombatEvent[];
};

type ModifierEntry = {
  label: string;
  value: string;
  detail: string;
  kind: 'positive' | 'negative' | 'neutral' | 'synergy';
};

function buildModifierEntries(event: ReplayCombatEvent): ModifierEntry[] {
  const entries: ModifierEntry[] = [];
  const { modifiers, triggeredEffects } = event.breakdown;

  if (modifiers.flankingBonus !== 0) {
    entries.push({
      label: 'Flanking',
      value: modifiers.flankingBonus > 0 ? `+${(modifiers.flankingBonus * 100).toFixed(0)}%` : `${(modifiers.flankingBonus * 100).toFixed(0)}%`,
      detail: 'Attacked from the side — enemy cannot brace properly',
      kind: modifiers.flankingBonus > 0 ? 'positive' : 'negative',
    });
  }

  if (modifiers.rearAttackBonus !== 0) {
    entries.push({
      label: 'Rear Attack',
      value: modifiers.rearAttackBonus > 0 ? `+${(modifiers.rearAttackBonus * 100).toFixed(0)}%` : `${(modifiers.rearAttackBonus * 100).toFixed(0)}%`,
      detail: 'Struck from behind — no shield coverage',
      kind: modifiers.rearAttackBonus > 0 ? 'positive' : 'negative',
    });
  }

  if (modifiers.stealthAmbushBonus !== 0) {
    entries.push({
      label: 'Ambush',
      value: `+${(modifiers.stealthAmbushBonus * 100).toFixed(0)}%`,
      detail: 'Stealthed unit struck unseen — devastating opener',
      kind: 'positive',
    });
  }

  for (const effect of triggeredEffects) {
    entries.push({
      label: effect.label,
      value: '',
      detail: effect.detail,
      kind: effect.category === 'synergy' ? 'synergy' : effect.category === 'positioning' ? 'positive' : effect.category === 'aftermath' ? 'neutral' : 'positive',
    });
  }

  return entries;
}

function formatOutcome(event: ReplayCombatEvent): string {
  const parts: string[] = [];

  if (event.defenderDestroyed) {
    parts.push(`${event.defenderPrototypeName} destroyed`);
  } else if (event.defenderRouted) {
    parts.push(`${event.defenderPrototypeName} routed`);
  } else if (event.defenderFled) {
    parts.push(`${event.defenderPrototypeName} fled`);
  }

  if (event.attackerDestroyed) {
    parts.push(`${event.attackerPrototypeName} destroyed`);
  } else if (event.attackerRouted) {
    parts.push(`${event.attackerPrototypeName} routed`);
  } else if (event.attackerFled) {
    parts.push(`${event.attackerPrototypeName} fled`);
  }

  return parts.length > 0 ? parts.join(' \u00b7 ') : '';
}

export function CombatLogPanel({ events }: CombatLogPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [localEvents, setLocalEvents] = useState<ReplayCombatEvent[]>(events);

  // Sync incoming events into local state so we can clear independently
  useEffect(() => {
    setLocalEvents((prev) => {
      if (events.length === 0) return prev;
      // Merge: keep existing, append new ones not already present
      const existingIds = new Set(prev.map((e) => `${e.attackerUnitId}-${e.defenderUnitId}-${e.round}`));
      const fresh = events.filter((e) => !existingIds.has(`${e.attackerUnitId}-${e.defenderUnitId}-${e.round}`));
      return [...fresh.reverse(), ...prev].slice(0, 50);
    });
  }, [events]);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (scrollRef.current && isOpen) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [localEvents.length, isOpen]);

  const handleClear = () => {
    setLocalEvents([]);
  };

  return (
    <div className={`clp-root${isOpen ? ' clp-root--open' : ''}`}>
      {/* Toggle tab */}
      <button
        type="button"
        className="clp-toggle"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? 'Close combat log' : 'Open combat log'}
      >
        <span className="clp-toggle__icon">{isOpen ? '\u2715' : '\u2694'}</span>
        <span className="clp-toggle__label">{isOpen ? '' : 'Combat'}</span>
      </button>

      {/* Panel body */}
      <div className="clp-body">
        <div className="clp-header">
          <h2 className="clp-title">Combat Log</h2>
          <button
            type="button"
            className="clp-clear"
            onClick={handleClear}
            disabled={localEvents.length === 0}
          >
            Clear
          </button>
        </div>

        <div className="clp-scroll" ref={scrollRef}>
          {localEvents.length === 0 ? (
            <p className="clp-empty">No combat recorded yet.</p>
          ) : (
            localEvents.map((event, idx) => (
              <CombatEntry key={`${event.attackerUnitId}-${event.defenderUnitId}-${event.round}-${idx}`} event={event} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function CombatEntry({ event }: { event: ReplayCombatEvent }) {
  const modifiers = buildModifierEntries(event);
  const outcome = formatOutcome(event);

  return (
    <div className="clp-entry">
      {/* Combat header */}
      <div className="clp-entry__header">
        <span className="clp-entry__units">
          {event.attackerPrototypeName} → {event.defenderPrototypeName}
        </span>
        <span className="clp-entry__round">R{event.round}</span>
      </div>

      {/* Damage summary line */}
      <div className="clp-entry__damage">
        <span className="clp-damage--dealt">
          {event.defenderDamage} dmg dealt
        </span>
        <span className="clp-separator">\u00b7</span>
        <span className={event.attackerDamage > 0 ? 'clp-damage--taken' : 'clp-damage--taken-zero'}>
          {event.attackerDamage} taken
        </span>
      </div>

      {/* Modifier breakdown */}
      {modifiers.length > 0 && (
        <div className="clp-modifiers">
          {modifiers.map((mod, i) => (
            <div key={`${mod.label}-${i}`} className={`clp-modifier clp-modifier--${mod.kind}`}>
              <span className="clp-modifier__label">{mod.label}</span>
              {mod.value && <span className="clp-modifier__value">{mod.value}</span>}
              <span className="clp-modifier__detail">{mod.detail}</span>
            </div>
          ))}
        </div>
      )}

      {/* Outcome */}
      {outcome && (
        <div className="clp-outcome">{outcome}</div>
      )}

      {/* Strength values */}
      <div className="clp-strengths">
        <span>ATK: {event.breakdown.modifiers.finalAttackStrength}</span>
        <span>DEF: {event.breakdown.modifiers.finalDefenseStrength}</span>
      </div>
    </div>
  );
}
