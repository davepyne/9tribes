import React from 'react';
import { domainGlyph, domainColor, domainDisplayName } from './SynergyChip';

// ── Types ──

export type PairSynergyData = {
  id: string;
  name: string;
  domains: string[];
  description: string;
  friendlyFlavor: string;
  enemyFlavor: string;
};

export type EmergentRuleData = {
  id: string;
  name: string;
  condition: string;
  domainSets?: Record<string, string[]>;
  mobilityDomains?: string[];
  combatDomains?: string[];
  effect: { description: string };
  friendlyFlavor: string;
  enemyFlavor: string;
};

export type SynergyDataBase = PairSynergyData | EmergentRuleData;

function isPairSynergy(s: SynergyDataBase): s is PairSynergyData {
  return 'domains' in s;
}

// ── Props ──

type FriendlySynergyCardProps = {
  mode: 'friendly';
  synergy: SynergyDataBase;
  kind: 'pair' | 'triple';
  factionColor: string;
  compact?: boolean;
};

type FieldReportSynergyCardProps = {
  mode: 'field-report';
  synergy: SynergyDataBase;
  kind: 'pair' | 'triple';
  factionColor: string;
  factionName: string;
  tier: 0 | 1 | 2;
  compact?: boolean;
};

export type SynergyCardProps = FriendlySynergyCardProps | FieldReportSynergyCardProps;

// ── Component ──

export const SynergyCard = React.memo(function SynergyCard(props: SynergyCardProps) {
  const { mode, synergy, kind, factionColor } = props;
  const compact = 'compact' in props ? props.compact : false;
  const isFriendly = mode === 'friendly';
  const tier = isFriendly ? 2 : (props as FieldReportSynergyCardProps).tier;

  const domains = isPairSynergy(synergy) ? synergy.domains : [];

  const title = synergy.name;
  const prose = isFriendly
    ? synergy.friendlyFlavor
    : (tier >= 1 ? synergy.enemyFlavor : '');
  const mechanics = isPairSynergy(synergy)
    ? synergy.description
    : synergy.effect?.description ?? '';

  const rootClass = [
    'scard',
    compact ? 'scard--compact' : 'scard--full',
    `scard--${isFriendly ? 'friendly' : 'report'}`,
    kind === 'triple' ? 'scard--triple' : '',
    `scard--tier${tier}`,
  ].filter(Boolean).join(' ');

  return (
    <div className={rootClass} style={{ '--scard-accent': factionColor } as React.CSSProperties}>
      {/* Title bar */}
      <div className="scard__title">
        <span className="scard__badge">{kind === 'pair' ? 'PAIR' : 'TRIPLE'}</span>
        <span className="scard__name">{title}</span>
      </div>

      {/* Art / Sigil (full mode only) */}
      {!compact && (
        <div className="scard__art">
          <div className="scard__sigil">
            {domains.length > 0
              ? domains.slice(0, 2).map((d) => (
                <span key={d} className="scard__sigil-glyph" style={{ color: domainColor(d) }}>
                  {domainGlyph(d)}
                </span>
              ))
              : <span className="scard__sigil-glyph" style={{ color: factionColor }}>{'★'}</span>
            }
          </div>
        </div>
      )}

      {/* Domain glyphs strip */}
      {domains.length > 0 && !compact && (
        <div className="scard__domains">
          {domains.map((d) => (
            <span key={d} className="scard__domain-chip" style={{ color: domainColor(d) }}>
              {domainGlyph(d)} {domainDisplayName(d)}
            </span>
          ))}
        </div>
      )}

      {/* Compact domain dots */}
      {compact && domains.length > 0 && (
        <span className="scard__compact-dots">
          {domains.map((d) => (
            <span key={d} style={{ color: domainColor(d) }}>{domainGlyph(d)}</span>
          ))}
        </span>
      )}

      {/* Prose body */}
      {prose && (
        <div className="scard__prose">
          <p>{compact ? (prose.length > 80 ? prose.slice(0, 77) + '...' : prose) : prose}</p>
        </div>
      )}

      {/* Mechanics block (friendly always, field-report tier 2) */}
      {(isFriendly || tier === 2) && mechanics && (
        <div className="scard__mechanics">
          <p>{mechanics}</p>
        </div>
      )}
    </div>
  );
});
