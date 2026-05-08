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

// ── Domain Rune SVG Shapes ──
// Each is centered at (0,0), roughly 10-unit radius. Stroke only — engraved look.

function DomainRune({ domain, color }: { domain: string; color: string }) {
  const s = { stroke: color, fill: 'none' } as const;
  switch (domain) {
    case 'venom':
      return (
        <g {...s}>
          <circle r="9" strokeWidth="1.5" strokeDasharray="5 2.2" />
          <circle r="5" strokeWidth="1" strokeDasharray="3 2" />
          <circle r="1.8" fill={color} strokeWidth="0" />
        </g>
      );
    case 'fortress':
      return (
        <g {...s}>
          <rect x="-8" y="-3" width="16" height="10" strokeWidth="1.5" />
          <rect x="-8" y="-8" width="5" height="5" strokeWidth="1" />
          <rect x="3" y="-8" width="5" height="5" strokeWidth="1" />
          <rect x="-1.5" y="-8" width="3" height="3" strokeWidth="1" />
        </g>
      );
    case 'charge':
      return (
        <g {...s}>
          <polyline points="-10,-5 2,0 -10,5" strokeWidth="2" strokeLinejoin="round" />
          <polyline points="-4,-5 8,0 -4,5" strokeWidth="1.5" strokeLinejoin="round" opacity="0.45" />
          <line x1="-12" y1="-8" x2="-7" y2="-8" strokeWidth="1" opacity="0.3" />
          <line x1="-12" y1="8" x2="-7" y2="8" strokeWidth="1" opacity="0.3" />
        </g>
      );
    case 'hitrun':
      return (
        <g stroke={color} fill="none">
          <line x1="-5" y1="-9" x2="5" y2="9" strokeWidth="2.5" />
          <line x1="1" y1="-9" x2="11" y2="9" strokeWidth="2" opacity="0.42" />
          <line x1="-11" y1="-9" x2="-1" y2="9" strokeWidth="1.5" opacity="0.18" />
        </g>
      );
    case 'tidal_warfare':
      return (
        <g stroke={color} fill="none">
          <path
            d="M-9,3 C-5.5,-4 -3.5,-4 0,3 C3.5,10 5.5,10 9,3"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M-9,-3 C-5.5,-10 -3.5,-10 0,-3 C3.5,4 5.5,4 9,-3"
            strokeWidth="1"
            strokeLinecap="round"
            opacity="0.38"
          />
        </g>
      );
    case 'slaving':
      return (
        <g stroke={color} fill="none">
          <ellipse cx="-4.5" cy="0" rx="4.5" ry="3.5" strokeWidth="1.5" />
          <ellipse cx="4.5" cy="0" rx="4.5" ry="3.5" strokeWidth="1.5" />
          <line x1="-4.5" y1="3.5" x2="4.5" y2="3.5" strokeWidth="0.75" opacity="0.35" />
          <line x1="-4.5" y1="-3.5" x2="4.5" y2="-3.5" strokeWidth="0.75" opacity="0.35" />
        </g>
      );
    case 'nature_healing':
      return (
        <g stroke={color} fill="none">
          <line x1="0" y1="-9" x2="0" y2="9" strokeWidth="1.5" />
          <line x1="-7.8" y1="-4.5" x2="7.8" y2="4.5" strokeWidth="1.5" />
          <line x1="7.8" y1="-4.5" x2="-7.8" y2="4.5" strokeWidth="1.5" />
          <circle r="3.5" strokeWidth="1" fill={color} fillOpacity="0.15" />
        </g>
      );
    case 'river_stealth':
      return (
        <g stroke={color} fill="none">
          <circle r="2.5" strokeWidth="1.5" />
          <circle r="6" strokeWidth="1" opacity="0.48" />
          <circle r="9.5" strokeWidth="0.75" opacity="0.2" />
          <line x1="0" y1="-9.5" x2="0" y2="-2.5" strokeWidth="1.5" opacity="0.6" />
        </g>
      );
    case 'camel_adaptation':
      return (
        <g stroke={color} fill={color}>
          <line x1="0" y1="-10" x2="0" y2="10" strokeWidth="0.75" opacity="0.28" />
          <line x1="-10" y1="0" x2="10" y2="0" strokeWidth="0.75" opacity="0.28" />
          <polygon points="0,-10 2.5,-4.5 0,-6.5 -2.5,-4.5" strokeWidth="0.5" />
          <polygon points="0,10 2.5,4.5 0,6.5 -2.5,4.5" strokeWidth="0.5" />
          <polygon points="-10,0 -4.5,2.5 -6.5,0 -4.5,-2.5" strokeWidth="0.5" />
          <polygon points="10,0 4.5,2.5 6.5,0 4.5,-2.5" strokeWidth="0.5" />
          <circle r="2.5" strokeWidth="0" />
        </g>
      );
    case 'heavy_hitter':
      return (
        <g stroke={color} fill="none">
          <rect x="-8.5" y="-5.5" width="17" height="11" rx="1.5" strokeWidth="2.5" />
          <line x1="0" y1="5.5" x2="0" y2="10" strokeWidth="3" />
          <line x1="-3.5" y1="10" x2="3.5" y2="10" strokeWidth="2" />
        </g>
      );
    default:
      return (
        <g stroke={color} fill="none">
          <polygon points="0,-9 7.8,4.5 -7.8,4.5" strokeWidth="1.5" />
          <circle r="3" fill={color} fillOpacity="0.28" strokeWidth="0" />
        </g>
      );
  }
}

// ── SVG Art Scene ──

function SynergyArt({
  synergy,
  domains,
  factionColor,
  kind,
  isFriendly,
  tier,
}: {
  synergy: SynergyDataBase;
  domains: string[];
  factionColor: string;
  kind: 'pair' | 'triple';
  isFriendly: boolean;
  tier: number;
}) {
  const W = 280;
  const H = 110;
  const cx = W / 2;
  const cy = H / 2;

  // Anchor positions: pair = left/right, triple = equilateral triangle
  const anchors =
    kind === 'triple' && domains.length >= 3
      ? [
          { x: cx, y: 26 },
          { x: cx - 54, y: cy + 22 },
          { x: cx + 54, y: cy + 22 },
        ]
      : [
          { x: 62, y: cy },
          { x: W - 62, y: cy },
        ];

  const dColors = domains.map((d) => domainColor(d));

  // Field-report tier 1: ghost the art
  const artOpacity = !isFriendly && tier <= 1 ? 0.22 : 1;

  // Stable unique ID per card (synergy IDs are globally unique)
  const uid = `sart-${synergy.id.replace(/[^a-z0-9]/gi, '-')}`;

  // Build connection arcs: for pairs, single arc between two anchors; for triples, lines to center
  const arcs: Array<{ d: string; color: string }> = [];
  if (kind === 'pair' && anchors.length >= 2) {
    const a = anchors[0];
    const b = anchors[1];
    arcs.push({
      d: `M ${a.x} ${a.y} Q ${cx} ${cy - 22} ${b.x} ${b.y}`,
      color: dColors[0] ?? factionColor,
    });
  } else {
    // Triple: each anchor connects to center nexus
    anchors.forEach((a, i) => {
      arcs.push({
        d: `M ${a.x} ${a.y} L ${cx} ${cy}`,
        color: dColors[i] ?? factionColor,
      });
    });
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid slice"
      className="scard__art-svg"
      style={{ opacity: artOpacity }}
      aria-hidden="true"
    >
      <defs>
        {/* Dot-grid background — tactical map texture */}
        <pattern
          id={`${uid}-grid`}
          x="0"
          y="0"
          width="18"
          height="18"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="0" cy="0" r="0.65" fill="rgba(255,255,255,0.065)" />
        </pattern>

        {/* Faction-color center glow */}
        <radialGradient id={`${uid}-fg`} cx="50%" cy="50%" r="45%">
          <stop offset="0%" stopColor={factionColor} stopOpacity="0.2" />
          <stop offset="100%" stopColor={factionColor} stopOpacity="0" />
        </radialGradient>

        {/* Soft anchor halos */}
        <filter id={`${uid}-halo`} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" />
        </filter>

        {/* Rune glow filter */}
        <filter id={`${uid}-glow`} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Dot-grid base */}
      <rect width={W} height={H} fill={`url(#${uid}-grid)`} />

      {/* Faction color bloom at center */}
      <rect width={W} height={H} fill={`url(#${uid}-fg)`} />

      {/* Soft domain halos at anchors */}
      {anchors.map((anchor, i) => (
        <circle
          key={`halo-${i}`}
          cx={anchor.x}
          cy={anchor.y}
          r="30"
          fill={dColors[i] ?? factionColor}
          fillOpacity="0.06"
          filter={`url(#${uid}-halo)`}
        />
      ))}

      {/* Connection arcs — animated dashed flow */}
      {arcs.map((arc, i) => (
        <path
          key={`arc-${i}`}
          d={arc.d}
          fill="none"
          stroke={arc.color}
          strokeWidth="1"
          strokeOpacity="0.32"
          strokeDasharray="3 5"
          className="scard__art-arc"
        />
      ))}

      {/* Nexus outer breathing ring */}
      <circle
        cx={cx}
        cy={cy}
        r="12"
        fill="none"
        stroke={factionColor}
        strokeWidth="0.75"
        strokeOpacity="0.25"
        className="scard__nexus-outer"
      />

      {/* Nexus ring */}
      <circle
        cx={cx}
        cy={cy}
        r="6"
        fill="none"
        stroke={factionColor}
        strokeWidth="1"
        strokeOpacity="0.55"
        className="scard__nexus-ring"
      />

      {/* Nexus core dot */}
      <circle
        cx={cx}
        cy={cy}
        r="2.5"
        fill={factionColor}
        fillOpacity="0.9"
        filter={`url(#${uid}-glow)`}
      />

      {/* Domain runes at anchor positions */}
      {anchors.map((anchor, i) => {
        const domain = domains[i] ?? '';
        const color = dColors[i] ?? factionColor;
        return (
          <g
            key={domain || `d-${i}`}
            transform={`translate(${anchor.x}, ${anchor.y})`}
            filter={`url(#${uid}-glow)`}
          >
            <DomainRune domain={domain} color={color} />
          </g>
        );
      })}
    </svg>
  );
}

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
    : tier >= 1
      ? synergy.enemyFlavor
      : '';
  const mechanics = isPairSynergy(synergy)
    ? synergy.description
    : synergy.effect?.description ?? '';

  const rootClass = [
    'scard',
    compact ? 'scard--compact' : 'scard--full',
    `scard--${isFriendly ? 'friendly' : 'report'}`,
    kind === 'triple' ? 'scard--triple' : '',
    `scard--tier${tier}`,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={rootClass}
      style={{ '--scard-accent': factionColor } as React.CSSProperties}
    >
      {/* Title bar */}
      <div className="scard__title">
        <span className="scard__badge">{kind === 'pair' ? 'PAIR' : 'TRIPLE'}</span>
        <span className="scard__name">{title}</span>
      </div>

      {/* Art scene — full mode only */}
      {!compact && (
        <div className="scard__art">
          <SynergyArt
            synergy={synergy}
            domains={domains}
            factionColor={factionColor}
            kind={kind}
            isFriendly={isFriendly}
            tier={tier}
          />
          {/* Edge vignette overlay */}
          <div className="scard__art-vignette" />
        </div>
      )}

      {/* Domain glyphs strip */}
      {domains.length > 0 && !compact && (
        <div className="scard__domains">
          {domains.map((d) => (
            <span
              key={d}
              className="scard__domain-chip"
              style={{ color: domainColor(d) }}
            >
              {domainGlyph(d)} {domainDisplayName(d)}
            </span>
          ))}
        </div>
      )}

      {/* Compact domain dots */}
      {compact && domains.length > 0 && (
        <span className="scard__compact-dots">
          {domains.map((d) => (
            <span key={d} style={{ color: domainColor(d) }}>
              {domainGlyph(d)}
            </span>
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
