import React, { useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { ClientState } from '../game/types/clientState';
import type { CapabilityPipViewModel } from '../game/types/clientState';
import pairSynergiesData from '../../../src/content/base/pair-synergies.json';
import emergentRulesData from '../../../src/content/base/emergent-rules.json';
import { ABILITY_DOMAINS, RESEARCH_DOMAINS, getAbilityDomainById } from '../../../src/content/domains/index.js';
import { DOMAIN_COLORS, DOMAIN_ICONS, DOMAIN_NAMES } from '../data/domainMeta';
import { SynergyCard, type TierDescriptions } from './SynergyCard';

type PairSynergy = typeof pairSynergiesData.pairSynergies[number];
type EmergentRule = typeof emergentRulesData.rules[number];

// Emergent rule descriptions for popup
const EMERGENT_DESCRIPTIONS: Record<string, { effect: string; requirement: string }> = {
  terrain_lord: {
    effect: "Charges ignore all terrain penalties. In native terrain: double charge range + +50% damage. Reshape: permanently convert 3 hexes to your native terrain type.",
    requirement: "1 terrain domain + 1 combat domain + 1 mobility domain (all to T2)",
  },
  paladin: {
    effect: "Heals for 50% of damage dealt; can't drop below 1 HP from a single hit. At full HP, next attack deals +100% damage (Radiant Smite).",
    requirement: "1 healing domain + 1 defensive domain + 1 offensive domain (all to T2)",
  },
  terrain_assassin: {
    effect: "Attacks from stealth in matching terrain type are permanent stealth — enemies never detect you regardless of proximity.",
    requirement: "1 stealth domain + 1 combat domain + 1 terrain domain (all to T2)",
  },
  standing_stone: {
    effect: "Toggle stance each turn. Anchored: 3-hex aura (+30% defense, 5 HP/turn, damage share, enemies lose 2 movement). Marching: 1-hex aura, can move.",
    requirement: "1 fortress domain + 1 healing domain + 1 defensive domain (all to T2)",
  },
  ghost_army: {
    effect: "Phase: teleport up to 3 hexes through anything. On kill: re-stealth + re-emerge near any ally. Adjacent allies gain +2 movement when phasing.",
    requirement: "3 mobility domains to T2 (camel adaptation, charge, hit run, or river stealth)",
  },
  iron_turtle: {
    effect: "2-hex crushing zone deals 2 damage/turn and -1 movement to enemies. 50% damage reflection. Cannot be displaced. Ignores zone of control.",
    requirement: "1 fortress + 1 heavy + 1 terrain domain (all to T2)",
  },
  slave_empire: {
    effect: "Fortress zones auto-capture wounded enemies below 25% HP. Captured slaves produce +50% resources. Slaves immune to rout.",
    requirement: "1 slaving + 1 heavy + 1 fortress domain (all to T2)",
  },
  raid_camp: {
    effect: "Place Raid Camps within 5 hexes. Allies entering gain +2 movement and stealth. Enemies near camps suffer -25% defense. Capture chance +30%.",
    requirement: "1 camel adaptation + 1 slaving + 1 mobility domain (all to T2)",
  },
  poison_shadow: {
    effect: "Stealth attacks apply 3 poison stacks instantly. Retreating from stealth leaves a poison cloud. Enemies can't heal in the cloud.",
    requirement: "1 venom + 1 stealth + 1 combat domain (all to T2)",
  },
  juggernaut: {
    effect: "Each combat domain contributes a signature ability. 3-combat unit collects 3 signatures. Survives lethal hits at 1 HP once. Ignores zone of control.",
    requirement: "3 combat domains to T2 (venom, fortress, charge, slaving, heavy hitter, hit run, or tidal warfare)",
  },
  many_faced: {
    effect: "Cycles stances based on combat context. Took damage → Bulwark. Dealt damage → Predator. Moving → Phantom. Each stance grants unique combat bonuses.",
    requirement: "3 domains that don't match any specific pattern (all to T2)",
  },
};

// ── Resolution logic ──

export function domainGlyph(domainId: string): string {
  return DOMAIN_ICONS[domainId] ?? domainId.slice(0, 2).toUpperCase();
}

export function domainColor(domainId: string): string {
  return DOMAIN_COLORS[domainId] ?? '#888';
}

export function domainDisplayName(domainId: string): string {
  return DOMAIN_NAMES[domainId] ?? domainId.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

export function domainBenefit(domainId: string): string {
  return getAbilityDomainById(domainId)?.baseEffect.description ?? '';
}

function buildTierDescriptions(domainId: string, capabilities: CapabilityPipViewModel[]): TierDescriptions {
  const nodes = RESEARCH_DOMAINS[domainId]?.nodes;
  const cap = capabilities.find((c) => c.domainId === domainId);
  return {
    t1: nodes?.[`${domainId}_t1`]?.qualitativeEffect?.description ?? '',
    t2: nodes?.[`${domainId}_t2`]?.qualitativeEffect?.description ?? '',
    t3: nodes?.[`${domainId}_t3`]?.qualitativeEffect?.description ?? '',
    t1Complete: cap?.t1Ready ?? false,
    t2Complete: cap?.t2Ready ?? false,
    t3Complete: (cap?.level ?? 0) >= 3,
  };
}

function buildSoloSynergyData(domainId: string) {
  const domain = ABILITY_DOMAINS[domainId];
  const description = domain?.baseEffect.description ?? '';
  return {
    id: domainId,
    name: domain?.name ?? domainId,
    domains: [domainId],
    description,
    friendlyFlavor: description,
    enemyFlavor: '',
  };
}

// ── Sub-components ──

function DomainDot({
  domainId,
  size = 16,
  isNative = false,
}: {
  domainId: string;
  size?: number;
  isNative?: boolean;
}) {
  const color = domainColor(domainId);
  const glyph = domainGlyph(domainId);

  return (
    <span
      className="syn-dot"
      style={{
        '--syn-dot-color': color,
        '--syn-dot-size': `${size}px`,
      } as React.CSSProperties}
      title={domainDisplayName(domainId)}
      data-native={isNative || undefined}
    >
      <span className="syn-dot__glyph">{glyph}</span>
    </span>
  );
}

// ── Main Component ──

type SynergyChipProps = {
  state: ClientState;
};

export const SynergyChip = React.memo(function SynergyChip({ state }: SynergyChipProps) {
  const [expanded, setExpanded] = useState(false);

  const capabilities = state.research?.capabilities ?? [];
  const activeFaction = state.world.factions.find((f) => f.id === state.activeFactionId);
  const nativeDomain = activeFaction?.nativeDomain ?? '';
  const factionLearnedDomains = activeFaction?.learnedDomains ?? [];
  const factionColor = activeFaction?.color ?? '#d6a34b';

  const learnedDomains = useMemo(() => {
    if (factionLearnedDomains.length > 0) return factionLearnedDomains;
    return [nativeDomain];
  }, [factionLearnedDomains, nativeDomain]);

  const foreignDomains = useMemo(
    () => learnedDomains.filter((d) => d !== nativeDomain),
    [learnedDomains, nativeDomain],
  );

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((v) => !v);
  }, []);

  const handleClose = useCallback(() => setExpanded(false), []);
  const handlePanelClick = useCallback((e: React.MouseEvent) => e.stopPropagation(), []);

  const activeNativePairId = activeFaction?.activeNativePairId;
  const activeDoubleStackPairIds = activeFaction?.activeDoubleStackPairIds ?? [];
  const hasActiveTriple = activeFaction?.hasActiveTriple ?? false;
  const activeTriplePairIds = activeFaction?.activeTriplePairIds ?? [];
  const activeTripleEmergentRuleId = activeFaction?.activeTripleEmergentRuleId;

  const activePairCount = useMemo(() => {
    const ids = new Set<string>();
    if (hasActiveTriple) {
      for (const id of activeTriplePairIds) ids.add(id);
    } else {
      if (activeNativePairId) ids.add(activeNativePairId);
      for (const id of activeDoubleStackPairIds) ids.add(id);
    }
    return ids.size;
  }, [hasActiveTriple, activeNativePairId, activeDoubleStackPairIds, activeTriplePairIds]);

  const activeTripleRule = useMemo(() => {
    if (!hasActiveTriple || !activeTripleEmergentRuleId) return null;
    return (emergentRulesData.rules as EmergentRule[]).find((r) => r.id === activeTripleEmergentRuleId) ?? null;
  }, [hasActiveTriple, activeTripleEmergentRuleId]);

  const hasContent = foreignDomains.length > 0 || activePairCount > 0;

  // Build all cards for the hand using backend state
  const handCards = useMemo(() => {
    const cards: Array<{ key: string; kind: 'solo' | 'pair' | 'triple'; synergy: any; tierDescriptions?: TierDescriptions; inactive?: boolean }> = [];
    const allPairs = pairSynergiesData.pairSynergies as PairSynergy[];
    const allRules = emergentRulesData.rules as EmergentRule[];

    for (const d of learnedDomains) {
      cards.push({
        key: `solo-${d}`,
        kind: 'solo',
        synergy: buildSoloSynergyData(d),
        tierDescriptions: buildTierDescriptions(d, capabilities),
      });
    }

    if (hasActiveTriple) {
      // Triple stack: show all pairs from triple + emergent rule card
      const nativeId = activeNativePairId;
      for (const pairId of activeTriplePairIds) {
        const pairData = allPairs.find((p) => p.id === pairId);
        if (!pairData) continue;
        const isNative = pairId === nativeId;
        cards.push({
          key: `pair-${pairId}`,
          kind: 'pair',
          synergy: pairData,
          inactive: !isNative,
        });
      }
      if (activeTripleEmergentRuleId) {
        const ruleData = allRules.find((r) => r.id === activeTripleEmergentRuleId);
        if (ruleData) {
          cards.push({ key: `triple-${ruleData.id}`, kind: 'triple', synergy: ruleData });
        }
      }
    } else {
      // No triple: show native self-pair + double stack pairs
      if (activeNativePairId) {
        const pairData = allPairs.find((p) => p.id === activeNativePairId);
        if (pairData) {
          cards.push({ key: `pair-${activeNativePairId}`, kind: 'pair', synergy: pairData });
        }
      }
      for (const pairId of activeDoubleStackPairIds) {
        const pairData = allPairs.find((p) => p.id === pairId);
        if (pairData) {
          cards.push({ key: `pair-${pairId}`, kind: 'pair', synergy: pairData });
        }
      }
    }

    return cards;
  }, [learnedDomains, capabilities, hasActiveTriple, activeTriplePairIds, activeTripleEmergentRuleId, activeNativePairId, activeDoubleStackPairIds]);

  return (
    <div className="syn-chip-wrap" onClick={handleClick}>
      {/* ── Compact Chip ── */}
      <button
        type="button"
        className={`syn-chip ${hasContent ? 'syn-chip--active' : ''} ${expanded ? 'syn-chip--open' : ''}`}
        style={{ '--syn-accent': factionColor } as React.CSSProperties}
        title="Ability Synergies — click to view cards"
      >
        <span className="syn-chip__label">ABILITY SYNERGIES</span>
        <span className="syn-chip__domains">
          <DomainDot domainId={nativeDomain} size={14} isNative />
          {foreignDomains.slice(0, 3).map((d) => (
            <DomainDot key={d} domainId={d} size={14} />
          ))}
          {foreignDomains.length > 3 && (
            <span className="syn-chip__more">+{foreignDomains.length - 3}</span>
          )}
        </span>

        {activePairCount > 0 && (
          <span className="syn-chip__pairs">
            <svg width="12" height="12" viewBox="0 0 12 12" className="syn-icon-link">
              <circle cx="3" cy="6" r="2" fill="currentColor" opacity="0.5" />
              <circle cx="9" cy="6" r="2" fill="currentColor" />
              <line x1="5" y1="6" x2="7" y2="6" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            {activePairCount}
          </span>
        )}

        {activeTripleRule && (
          <span className="syn-chip__triple" style={{ color: factionColor }}>
            &#9733; {activeTripleRule.name}
          </span>
        )}
      </button>

      {/* ── Card Hand Overlay (ported to body to escape backdrop-filter containing block) ── */}
      {expanded && createPortal(
        <>
          <div className="syn-hand-backdrop" onClick={handleClose} />
          <div className="syn-hand-overlay" onClick={handlePanelClick}>
            <div className="syn-hand-header">
              <h3 className="syn-hand-title">Ability Synergies</h3>
              <span className="syn-hand-count">{handCards.length} card{handCards.length !== 1 ? 's' : ''}</span>
              <button type="button" className="syn-hand-close" onClick={handleClose}>
                &#x2715;
              </button>
            </div>
            <div className="syn-hand">
              {handCards.map((card, i) => (
                <div
                  key={card.key}
                  className="syn-hand__card"
                  style={{ '--hand-index': i, '--hand-total': handCards.length } as React.CSSProperties}
                >
                  <SynergyCard
                    mode="friendly"
                    kind={card.kind}
                    synergy={card.synergy}
                    factionColor={factionColor}
                    factionId={activeFaction?.id}
                    tierDescriptions={card.tierDescriptions}
                    isNativeDomain={card.kind === 'solo' && card.key === `solo-${nativeDomain}`}
                    inactive={card.inactive}
                  />
                </div>
              ))}
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
});
