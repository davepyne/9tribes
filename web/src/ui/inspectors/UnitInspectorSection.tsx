import React from 'react';
import type { UnitView } from '../../game/types/worldView';
import type { ClientState, SettlementPreviewViewModel } from '../../game/types/clientState';
import type { FactionInfo } from '../../data/faction-info';
import { getFactionInfo } from '../../data/faction-info';
import { MetaRow } from './MetaRow';
import { formatNativeDomainName, getDomainDescription } from './domainFormatters';

type UnitInspectorSectionProps = {
  unit: UnitView;
  mode: ClientState['mode'];
  settlementPreview: SettlementPreviewViewModel | null;
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
  onPrepareAbility,
  onBoardTransport,
  onDisembarkUnit,
  onFactionPopup,
  onDomainPopup,
}: UnitInspectorSectionProps) {
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
                Learned domains are codified for your faction automatically and appear in the research tree right away.
              </p>
            </>
          ) : null}
        </div>
      ) : null}

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
            <button
              type="button"
              className="ci-action-btn"
              onClick={() => onPrepareAbility(unit.id, 'brace')}
            >
              Brace
            </button>
          ) : null}
          {unit.canAmbush ? (
            <button
              type="button"
              className="ci-action-btn"
              onClick={() => onPrepareAbility(unit.id, 'ambush')}
            >
              Ambush
            </button>
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
