import React, { useState } from 'react';
import type { UnitView } from '../../game/types/worldView';
import type { ClientState, SettlementPreviewViewModel, EnemySynergyIntelMap } from '../../game/types/clientState';
import type { FactionInfo } from '../../data/faction-info';
import { getFactionInfo } from '../../data/faction-info';
import { MetaRow } from './MetaRow';
import { formatNativeDomainName, getDomainDescription } from './domainFormatters';
import { SynergyCard } from '../SynergyCard';
import type { ResolvedActiveSynergies } from '../resolveActiveSynergies';
import { intelTier } from '../../game/synergy/intelTiers';
import pairSynergiesData from '../../data/pair-synergies.json';
import emergentRulesData from '../../data/emergent-rules.json';
import type { PairSynergyData, EmergentRuleData } from '../SynergyCard';

type UnitInspectorSectionProps = {
  unit: UnitView;
  mode: ClientState['mode'];
  settlementPreview: SettlementPreviewViewModel | null;
  activeSynergies?: ResolvedActiveSynergies | null;
  enemySynergyIntel?: EnemySynergyIntelMap;
  enemyFactionId?: string;
  factionColor?: string;
  onPrepareAbility: (unitId: string, ability: 'brace' | 'ambush') => void;
  onBoardTransport: (unitId: string, transportId: string) => void;
  onDisembarkUnit: (unitId: string, transportId: string, destination: { q: number; r: number }) => void;
  onFactionPopup: (info: FactionInfo) => void;
  onDomainPopup: (popup: { domainId: string; name: string; description: string }) => void;
};

export const UnitInspectorSection = React.memo(function UnitInspectorSection({
  unit,
  mode,
  settlementPreview,
  activeSynergies,
  enemySynergyIntel,
  enemyFactionId,
  factionColor,
  onPrepareAbility,
  onBoardTransport,
  onDisembarkUnit,
  onFactionPopup,
  onDomainPopup,
}: UnitInspectorSectionProps) {
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);

  const hasSynergies = activeSynergies && (
    activeSynergies.activePairs.length > 0 || activeSynergies.activeTriple
  );

  // Build enemy intel cards from intel state
  const enemyIntelCards = (() => {
    if (!enemySynergyIntel || !enemyFactionId) return [];
    const factionIntel = enemySynergyIntel[enemyFactionId] ?? {};
    const cards: Array<{ data: PairSynergyData | EmergentRuleData; kind: 'pair' | 'triple'; tier: number }> = [];
    for (const [synergyId, intel] of Object.entries(factionIntel)) {
      const tier = intelTier(intel);
      if (tier < 1) continue;
      const pairData = (pairSynergiesData.pairSynergies as PairSynergyData[]).find(p => p.id === synergyId);
      if (pairData) { cards.push({ data: pairData, kind: 'pair', tier }); continue; }
      const ruleData = (emergentRulesData.rules as EmergentRuleData[]).find(r => r.id === synergyId);
      if (ruleData) { cards.push({ data: ruleData, kind: 'triple', tier }); }
    }
    return cards;
  })();

  const hasEnemyIntel = enemyIntelCards.length > 0;
  return (
    <div className="ci-section">
      {/* STATS */}
      <div className="ci-unit-combat">
        <p className="panel-kicker">STATS</p>
        <div className="ci-stat-grid">
          <div className="ci-stat-cell">
            <span className="ci-stat-value">{unit.hp}</span>
            <span className="ci-stat-label">HP</span>
            <span className="ci-stat-sub">/ {unit.maxHp}</span>
          </div>
          <div className="ci-stat-cell">
            <span className="ci-stat-value ci-stat-value--atk">{unit.attack}</span>
            <span className="ci-stat-label">Attack</span>
          </div>
          <div className="ci-stat-cell">
            <span className="ci-stat-value ci-stat-value--def">{unit.defense}</span>
            {unit.effectiveDefense !== unit.defense && (
              <span className="ci-stat-sub">→ {unit.effectiveDefense}</span>
            )}
            <span className="ci-stat-label">Defense</span>
          </div>
          <div className="ci-stat-cell">
            <span className="ci-stat-value">{unit.range > 1 ? unit.range : 'Melee'}</span>
            <span className="ci-stat-label">Range</span>
          </div>
          {unit.isPrototype !== true && (
            <div className="ci-stat-cell">
              <span className="ci-stat-value">{unit.supplyCost ?? 1}</span>
              <span className="ci-stat-label">Supply</span>
            </div>
          )}
          <div className="ci-stat-cell">
            <span className="ci-stat-value">{unit.movesMax}</span>
            <span className="ci-stat-label">MOVES</span>
          </div>
        </div>
      </div>

      {/* Movement & Status */}
      <div className="ci-unit-details">
        <MetaRow label="Moves">
          {unit.movesRemaining}/{unit.movesMax}
        </MetaRow>
        <MetaRow label="Status">
          {unit.status.charAt(0).toUpperCase() + unit.status.slice(1)}
        </MetaRow>
        {unit.veteranLevel ? (
          <MetaRow label="Experience Level">
            {unit.veteranLevel}{unit.xp != null ? ` (${unit.xp} XP)` : ''}
          </MetaRow>
        ) : null}
        <MetaRow label="Morale">
          <span className={`ci-morale-value${unit.morale <= 25 ? ' ci-morale-value--routed' : unit.morale <= 60 ? ' ci-morale-value--low' : ''}`}>
            {Math.round(unit.morale)}
          </span>
          <span className="ci-stat-sub">/ 100</span>
        </MetaRow>
        <div className="ci-morale-bar">
          <div
            className={`ci-morale-bar__fill${unit.morale <= 25 ? ' ci-morale-bar__fill--routed' : unit.morale <= 60 ? ' ci-morale-bar__fill--low' : ''}`}
            style={{ width: `${Math.round(unit.morale)}%` }}
          />
        </div>
      </div>

      {/* Skills */}
      {(unit.factionId || (unit.learnedAbilities && unit.learnedAbilities.length > 0)) ? (
        <div className="ci-domains">
          <p className="panel-kicker">Skills</p>
          {unit.factionId && (
            <MetaRow label="Faction">
              <span
                className="ci-domain--native"
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  const info = getFactionInfo(unit.factionId);
                  if (info) onFactionPopup(info);
                }}
              >
                {unit.factionName}
              </span>
            </MetaRow>
          )}
          {unit.nativeDomain && (
            <MetaRow label="Native Ability">
              <span
                className="ci-domain--native"
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  const domainId = unit.nativeDomain!;
                  const desc = getDomainDescription(domainId);
                  const name = formatNativeDomainName(domainId) ?? domainId;
                  onDomainPopup({ domainId, name, description: desc || 'No description available.' });
                }}
              >
                {formatNativeDomainName(unit.nativeDomain)}
              </span>
            </MetaRow>
          )}
          {unit.learnedAbilities && unit.learnedAbilities.length > 0 ? (
            <>
              <MetaRow label="Learned Abilities" />
              {unit.learnedAbilities.map((domainId) => (
                <div key={domainId} className="ci-learned-ability">
                  <span className="ci-knowledge__pip">{formatNativeDomainName(domainId)}</span>
                  {getDomainDescription(domainId) && (
                    <p className="ci-learned-ability__desc">{getDomainDescription(domainId)}</p>
                  )}
                </div>
              ))}
              <p className="ci-knowledge__hint">
                Return this unit to a friendly city and sacrifice it to grant synergy eligibility for these domains. Technology (T1/T2/T3) must still be earned via ecology research.
              </p>
            </>
          ) : null}
        </div>
      ) : null}

      {/* Active Synergies */}
      {hasSynergies && (
        <div className="ci-domains ci-synergy-section">
          <p className="panel-kicker">Synergies</p>
          <div className="ci-synergy-cards">
            {activeSynergies!.activeTriple && (
              <div
                onClick={() => setExpandedCardId(
                  expandedCardId === activeSynergies!.activeTriple!.id
                    ? null
                    : activeSynergies!.activeTriple!.id
                )}
              >
                <SynergyCard
                  mode="friendly"
                  synergy={activeSynergies!.activeTriple!}
                  kind="triple"
                  factionColor={factionColor ?? '#d6a34b'}
                  compact={expandedCardId !== activeSynergies!.activeTriple!.id}
                />
              </div>
            )}
            {activeSynergies!.activePairs.map(({ data }) => (
              <div
                key={data.id}
                onClick={() => setExpandedCardId(
                  expandedCardId === data.id ? null : data.id
                )}
              >
                <SynergyCard
                  mode="friendly"
                  synergy={data}
                  kind="pair"
                  factionColor={factionColor ?? '#d6a34b'}
                  compact={expandedCardId !== data.id}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Enemy Intel */}
      {hasEnemyIntel && (
        <div className="ci-domains ci-synergy-section">
          <p className="panel-kicker">Intel</p>
          <div className="ci-synergy-cards">
            {enemyIntelCards.map(({ data, kind, tier }) => (
              <div
                key={data.id}
                onClick={() => setExpandedCardId(
                  expandedCardId === data.id ? null : data.id
                )}
              >
                <SynergyCard
                  mode="field-report"
                  synergy={data}
                  kind={kind}
                  factionColor={factionColor ?? '#888'}
                  factionName={unit.factionName}
                  tier={tier as 0 | 1 | 2}
                  compact={expandedCardId !== data.id}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conditions */}
      {(unit.isStealthed || unit.poisoned || unit.routed || unit.preparedAbility) ? (
        <div className="ci-conditions">
          <p className="panel-kicker">Conditions</p>
          {unit.isStealthed && (
            <MetaRow label="Stealthed" className="ci-condition ci-condition--stealth">
              Hidden from enemy sight
            </MetaRow>
          )}
          {unit.poisoned && (
            <MetaRow label="Poisoned" className="ci-condition ci-condition--poison">
              Taking damage over time
            </MetaRow>
          )}
          {unit.routed && (
            <MetaRow label="Routed" className="ci-condition ci-condition--routed">
              Broken morale — unable to act
            </MetaRow>
          )}
          {unit.preparedAbility && (
            <MetaRow label="Prepared" className="ci-condition ci-condition--prepared">
              {unit.preparedAbility === 'brace' ? 'Bracing (counter-attack bonus)' : 'Ambush (first-strike bonus)'}
            </MetaRow>
          )}
        </div>
      ) : null}

      {settlementPreview ? (
        <div className="ci-conditions">
          <p className="panel-kicker">Settlement Site</p>
          <MetaRow label="Target">
            {settlementPreview.terrain}
          </MetaRow>
          <MetaRow label="Status">
            {settlementPreview.canFoundNow
              ? 'Ready to found'
              : settlementPreview.blockedReason ?? 'Preview only'}
          </MetaRow>
          {settlementPreview.traits.map((trait) => (
            <MetaRow label={trait.label} key={trait.key}>
              {trait.active ? trait.effect : 'None'}
            </MetaRow>
          ))}
        </div>
      ) : null}

      {/* Action Buttons */}
      {mode === 'play' ? (
        <div className="ci-actions">
          {unit.canBrace ? (
            <div className="ci-action-group">
              <button
                type="button"
                className="ci-action-btn"
                onClick={() => onPrepareAbility(unit.id, 'brace')}
              >
                Brace
              </button>
              <p className="ci-action-hint">
                Counter-attack bonus when an adjacent enemy attacks you this turn.
                Requires an enemy already nearby.
              </p>
            </div>
          ) : null}
          {unit.canAmbush ? (
            <div className="ci-action-group">
              <button
                type="button"
                className="ci-action-btn"
                onClick={() => onPrepareAbility(unit.id, 'ambush')}
              >
                Ambush
              </button>
              <p className="ci-action-hint">
                First-strike attack bonus (+15%) when an enemy moves adjacent next turn.
                Requires forest/hill terrain with no enemies nearby. Stacks with stealth (+50%).
              </p>
            </div>
          ) : null}
          {unit.boardableTransportIds?.map((transportId) => (
            <button
              key={transportId}
              type="button"
              className="ci-action-btn"
              onClick={() => onBoardTransport(unit.id, transportId)}
            >
              Board
            </button>
          ))}
          {unit.transportId && unit.validDisembarkHexes?.map((hex) => (
            <button
              key={`${hex.q},${hex.r}`}
              type="button"
              className="ci-action-btn"
              onClick={() => onDisembarkUnit(unit.id, unit.transportId!, hex)}
            >
              Land {hex.q},{hex.r}
            </button>
          ))}
        </div>
      ) : null}

      {!unit.canAct ? (
        <p className="quiet-copy">
          {unit.isActiveFaction
            ? 'This unit is spent or has no legal moves remaining.'
            : 'This unit cannot act until its faction is active.'}
        </p>
      ) : null}
    </div>
  );
});
