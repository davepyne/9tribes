import React, { useEffect, useState } from 'react';
import { domainGlyph, domainColor, domainDisplayName } from './SynergyChip';
import { SynergySigil } from './SynergySigil';

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
  /** Optional faction id; used for art resolution (faction-specific triple art). */
  factionId?: string;
  compact?: boolean;
};

type FieldReportSynergyCardProps = {
  mode: 'field-report';
  synergy: SynergyDataBase;
  kind: 'pair' | 'triple';
  factionColor: string;
  factionName: string;
  factionId?: string;
  tier: 0 | 1 | 2;
  compact?: boolean;
};

export type SynergyCardProps = FriendlySynergyCardProps | FieldReportSynergyCardProps;

// ── Art resolver ──

/**
 * Resolves card art with a fallback chain:
 *   1. Faction-specific triple art    /assets/synergy-cards/triples/{factionId}_{tripleId}.jpg
 *   2. Generic pair art               /assets/synergy-cards/pairs/{domainA}_{domainB}.jpg   (alphabetical)
 *   3. Procedural SVG sigil           (always available)
 *
 * Returns the first URL whose image successfully loads, or null
 * if nothing exists yet — caller falls back to procedural sigil.
 */
function useArtUrl(
  synergyId: string,
  domains: string[],
  kind: 'pair' | 'triple',
  factionId: string | undefined,
): string | null {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const candidates: string[] = [];
    if (kind === 'triple' && factionId) {
      candidates.push(`/assets/synergy-cards/triples/${factionId}_${synergyId}.jpg`);
    }
    if (kind === 'pair' && domains.length >= 2) {
      const sorted = [...domains].sort();
      candidates.push(`/assets/synergy-cards/pairs/${sorted[0]}_${sorted[1]}.jpg`);
    }

    if (candidates.length === 0) {
      setResolvedUrl(null);
      return;
    }

    const tryLoad = async () => {
      for (const url of candidates) {
        const ok = await new Promise<boolean>((resolve) => {
          const img = new Image();
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = url;
        });
        if (cancelled) return;
        if (ok) {
          setResolvedUrl(url);
          return;
        }
      }
      if (!cancelled) setResolvedUrl(null);
    };
    void tryLoad();
    return () => { cancelled = true; };
  }, [synergyId, domains.join(','), kind, factionId]);

  return resolvedUrl;
}

// ── Particle accent: domain-flavored micro-motes ──

function DomainParticles({ domains, kind }: { domains: string[]; kind: 'pair' | 'triple' }) {
  if (domains.length === 0) return null;
  const count = kind === 'triple' ? 9 : 6;
  return (
    <div className="scard__particles" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => {
        const d = domains[i % domains.length];
        return (
          <span
            key={i}
            className="scard__particle"
            style={{
              ['--p-color' as string]: domainColor(d),
              ['--p-x' as string]: `${(i * 37 + 11) % 100}%`,
              ['--p-delay' as string]: `${(i * 0.43) % 4}s`,
              ['--p-duration' as string]: `${5 + ((i * 7) % 4)}s`,
            }}
          />
        );
      })}
    </div>
  );
}

// ── Component ──

export const SynergyCard = React.memo(function SynergyCard(props: SynergyCardProps) {
  const { mode, synergy, kind, factionColor } = props;
  const compact = 'compact' in props ? props.compact : false;
  const factionId = props.factionId;
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

  const obscured = !isFriendly && tier < 2;

  // Resolve external art (returns null until generated images are dropped in)
  const artUrl = useArtUrl(synergy.id, domains, kind, factionId);

  const rootClass = [
    'scard',
    compact ? 'scard--compact' : 'scard--full',
    `scard--${isFriendly ? 'friendly' : 'report'}`,
    kind === 'triple' ? 'scard--triple' : '',
    `scard--tier${tier}`,
    obscured ? 'scard--obscured' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={rootClass}
      style={{ ['--scard-accent' as string]: factionColor } as React.CSSProperties}
    >
      {/* Foil shimmer overlay (triple cards only) */}
      {kind === 'triple' && !compact && <div className="scard__foil" aria-hidden="true" />}

      {/* Title bar */}
      <div className="scard__title">
        <span className="scard__badge">{kind === 'pair' ? 'PAIR' : 'TRIPLE'}</span>
        <span className="scard__name">
          {obscured ? (
            <span className="scard__name-redacted">UNKNOWN ART</span>
          ) : title}
        </span>
      </div>

      {/* Art / Sigil (full mode only) */}
      {!compact && (
        <div className="scard__art">
          <div className="scard__art-parallax">
            {artUrl ? (
              <img
                className="scard__art-img"
                src={artUrl}
                alt=""
                draggable={false}
                style={obscured ? { filter: 'blur(6px) brightness(0.5)' } : undefined}
              />
            ) : (
              <SynergySigil
                domains={domains}
                factionColor={factionColor}
                kind={kind}
                seed={synergy.id}
                obscured={obscured}
              />
            )}
          </div>
          {!obscured && <DomainParticles domains={domains} kind={kind} />}
          <div className="scard__art-frame" aria-hidden="true" />
        </div>
      )}

      {/* Domain glyphs strip */}
      {domains.length > 0 && !compact && !obscured && (
        <div className="scard__domains">
          {domains.map((d) => (
            <span key={d} className="scard__domain-chip" style={{ color: domainColor(d) }}>
              {domainGlyph(d)} {domainDisplayName(d)}
            </span>
          ))}
        </div>
      )}

      {/* Compact domain dots */}
      {compact && domains.length > 0 && !obscured && (
        <span className="scard__compact-dots">
          {domains.map((d) => (
            <span key={d} style={{ color: domainColor(d) }}>{domainGlyph(d)}</span>
          ))}
        </span>
      )}

      {/* Prose body */}
      {prose && (
        <div className="scard__prose">
          <p>{compact ? (prose.length > 80 ? prose.slice(0, 77) + '…' : prose) : prose}</p>
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
