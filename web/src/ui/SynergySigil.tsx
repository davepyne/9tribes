import React, { useMemo } from 'react';
import { domainGlyph, domainColor } from './SynergyChip';

type SynergySigilProps = {
  domains: string[];
  factionColor: string;
  kind: 'pair' | 'triple';
  /** Stable seed for procedural variations (e.g. synergy id). */
  seed: string;
  /** Tier-1 field-report blurs the composition. */
  obscured?: boolean;
};

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Heraldic procedural sigil. Renders a layered SVG composition:
 *   - faction-tinted starburst rays (back layer)
 *   - twin/triple domain glyphs in shielded medallions
 *   - rune-arc text framing
 *   - parchment grain via SVG filter
 *
 * Art shape is deterministic per `seed` so the same synergy looks
 * the same every render, but different synergies feel distinct.
 */
export const SynergySigil = React.memo(function SynergySigil({
  domains,
  factionColor,
  kind,
  seed,
  obscured = false,
}: SynergySigilProps) {
  const rngSeed = useMemo(() => hash(seed), [seed]);

  // Pick variation parameters from seed
  const rayCount = kind === 'triple' ? 16 : 12;
  const rotation = (rngSeed % 360);
  const useDoubleRing = ((rngSeed >> 8) & 1) === 1;
  const usePoints = (rngSeed >> 4) & 0x3;  // 0..3 corner motifs

  const glyphs = domains.length > 0 ? domains.slice(0, kind === 'triple' ? 3 : 2) : [];
  const hasGlyphs = glyphs.length > 0;

  // SVG ids — must be unique per instance to avoid filter collisions
  const fid = `sigil-${rngSeed.toString(36)}`;

  return (
    <svg
      className={`scard-sigil-svg ${obscured ? 'scard-sigil-svg--obscured' : ''}`}
      viewBox="0 0 200 120"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`${fid}-bg`} cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor={factionColor} stopOpacity="0.32" />
          <stop offset="55%" stopColor={factionColor} stopOpacity="0.08" />
          <stop offset="100%" stopColor="#0a0807" stopOpacity="0.85" />
        </radialGradient>
        <filter id={`${fid}-grain`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={rngSeed % 9999} />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.18 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <filter id={`${fid}-glow`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
        {obscured && (
          <filter id={`${fid}-blur`}>
            <feGaussianBlur stdDeviation="3.2" />
          </filter>
        )}
      </defs>

      {/* Background wash */}
      <rect width="200" height="120" fill={`url(#${fid}-bg)`} />

      {/* Starburst rays */}
      <g
        transform={`translate(100 60) rotate(${rotation})`}
        opacity={obscured ? 0.18 : 0.32}
        filter={obscured ? `url(#${fid}-blur)` : undefined}
      >
        {Array.from({ length: rayCount }).map((_, i) => {
          const angle = (i * 360) / rayCount;
          const long = i % 2 === 0;
          const len = long ? 80 : 52;
          return (
            <line
              key={i}
              x1={0}
              y1={0}
              x2={len}
              y2={0}
              transform={`rotate(${angle})`}
              stroke={factionColor}
              strokeWidth={long ? 1.1 : 0.6}
              strokeLinecap="round"
            />
          );
        })}
      </g>

      {/* Outer heraldic ring(s) */}
      <g
        transform="translate(100 60)"
        fill="none"
        stroke={factionColor}
        opacity={obscured ? 0.25 : 0.55}
        filter={obscured ? `url(#${fid}-blur)` : undefined}
      >
        <circle r="42" strokeWidth="0.8" />
        {useDoubleRing && <circle r="46" strokeWidth="0.4" strokeDasharray="2 3" />}
        <circle r="34" strokeWidth="0.5" strokeDasharray="1 2" />
      </g>

      {/* Corner motifs (tiny diamonds at cardinal points) */}
      {usePoints > 0 && (
        <g
          transform="translate(100 60)"
          fill={factionColor}
          opacity={obscured ? 0.2 : 0.6}
        >
          {[0, 90, 180, 270].map((a) => (
            <rect
              key={a}
              x={-1.6}
              y={-46}
              width="3.2"
              height="3.2"
              transform={`rotate(${a}) translate(0 0) rotate(45)`}
            />
          ))}
        </g>
      )}

      {/* Domain medallions */}
      {hasGlyphs && (
        <g
          filter={obscured ? `url(#${fid}-blur)` : undefined}
          opacity={obscured ? 0.55 : 1}
        >
          {glyphs.map((d, i) => {
            const n = glyphs.length;
            // Triple: triangle layout. Pair: side-by-side.
            const cx = n === 3
              ? 100 + Math.cos(((i / 3) * Math.PI * 2) - Math.PI / 2) * 28
              : 100 + (i === 0 ? -22 : 22);
            const cy = n === 3
              ? 60 + Math.sin(((i / 3) * Math.PI * 2) - Math.PI / 2) * 22
              : 60;
            const c = domainColor(d);
            return (
              <g key={d} transform={`translate(${cx} ${cy})`}>
                {/* Glow */}
                <circle r="20" fill={c} opacity="0.18" filter={`url(#${fid}-glow)`} />
                {/* Medallion plate */}
                <circle r="15" fill="#0c0a08" stroke={c} strokeWidth="1.2" />
                <circle r="15" fill={c} opacity="0.12" />
                {/* Glyph */}
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="16"
                  fill={c}
                  fontFamily="'Cinzel', 'Palatino', serif"
                  style={{ filter: `drop-shadow(0 0 4px ${c})` }}
                >
                  {domainGlyph(d)}
                </text>
              </g>
            );
          })}

          {/* Connecting filaments between medallions */}
          {glyphs.length === 2 && (
            <line
              x1="78" y1="60" x2="122" y2="60"
              stroke={factionColor}
              strokeWidth="0.6"
              strokeDasharray="1 2"
              opacity="0.7"
            />
          )}
          {glyphs.length === 3 && (
            <polygon
              points="100,38 76,73 124,73"
              fill="none"
              stroke={factionColor}
              strokeWidth="0.5"
              strokeDasharray="1 2"
              opacity="0.6"
            />
          )}
        </g>
      )}

      {/* Triple-only crown spike */}
      {kind === 'triple' && !obscured && (
        <g transform="translate(100 16)" fill={factionColor} opacity="0.85">
          <polygon points="0,-6 -3,2 3,2" />
          <polygon points="-7,-2 -10,4 -4,4" opacity="0.7" />
          <polygon points="7,-2 10,4 4,4" opacity="0.7" />
        </g>
      )}

      {/* Parchment grain overlay */}
      <rect width="200" height="120" filter={`url(#${fid}-grain)`} opacity="0.4" />

      {/* Vignette */}
      <rect
        width="200" height="120"
        fill="url(#scard-vignette-shared)"
        pointerEvents="none"
      />
    </svg>
  );
});

/** Shared vignette gradient — emit once per page. */
export const SynergySigilDefs = React.memo(function SynergySigilDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <radialGradient id="scard-vignette-shared" cx="50%" cy="50%" r="65%">
          <stop offset="50%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.55" />
        </radialGradient>
      </defs>
    </svg>
  );
});
