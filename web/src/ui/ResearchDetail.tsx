import React from 'react';
import type { ResearchNodeViewModel } from '../game/types/clientState';

type ResearchDetailProps = {
  node: ResearchNodeViewModel | null;
  researchRate: number;
  onStartResearch: (nodeId: string) => void;
  onCancelResearch: () => void;
  hasActiveResearch: boolean;
  activeNodeName: string | null;
};

const unlockGlyphs: Record<ResearchNodeViewModel['unlocks'][0]['type'], string> = {
  component: '◆',
  chassis: '■',
  recipe: '⬢',
  improvement: '▣',
};

export const ResearchDetail = React.memo(function ResearchDetail({
  node,
  researchRate,
  onStartResearch,
  onCancelResearch,
  hasActiveResearch,
  activeNodeName,
}: ResearchDetailProps) {
  if (!node) {
    return (
      <div className="research-detail research-detail--empty">
        <p className="panel-kicker">Node Inspector</p>
        <div className="research-detail__empty-state">
          <p>Select a node to inspect</p>
        </div>
      </div>
    );
  }

  const displayCost = node.discountedXpCost ?? node.xpCost;
  const progressPct = displayCost > 0 ? Math.round((node.currentProgress / displayCost) * 100) : 0;
  const isDiscounted = node.discountedXpCost !== null;
  const tierLabel = node.tier === 1 ? 'Foundation' : node.tier === 2 ? 'Mastery' : 'Transcendence';
  const synergyRole = node.tier === 1
    ? 'Tier 1 establishes this domain and unlocks its base research track.'
    : node.tier === 2
      ? 'Tier 2 unlocks emergent rule matching for this domain.'
      : node.isNative
        ? 'Tier 3 grants the native faction-altering version of this domain and activates its pair synergies.'
        : 'Tier 3 grants the shared foreign-domain version of this domain and activates its pair synergies.';

  let buttonLabel = 'Start Research';
  let buttonHint = '';

  if (node.state === 'active') {
    buttonLabel = 'In Progress';
  } else if (node.state === 'locked' || node.isLocked) {
    buttonLabel = 'Locked';
    buttonHint = node.isLocked
      ? 'Learn this domain from enemies or exposure to unlock its research track.'
      : 'Complete prerequisites first';
  } else if (node.state === 'completed') {
    buttonLabel = 'Completed';
  } else if (hasActiveResearch) {
    buttonLabel = `Researching ${activeNodeName}`;
  }

  const turnsLabel = node.estimatedTurns !== null && node.estimatedTurns > 0
    ? `${node.estimatedTurns} turn${node.estimatedTurns === 1 ? '' : 's'}`
    : null;

  return (
    <div className="research-detail">
      <div className="panel-heading compact">
        <p className="panel-kicker">Tier {node.tier} · {tierLabel}</p>
        <h3>{node.name}</h3>
      </div>

      <div className="research-detail__section">
        <div className="meta-row">
          <span>XP Cost</span>
          <strong>
            {isDiscounted ? <span className="research-detail__original-cost">{node.xpCost}</span> : null}
            {displayCost}
          </strong>
        </div>
        {isDiscounted ? <div className="research-detail__discount-note">Knowledge discount applied</div> : null}
        <div className="meta-row">
          <span>Progress</span>
          <strong>{node.currentProgress} / {displayCost} ({progressPct}%)</strong>
        </div>
        {turnsLabel ? (
          <div className="meta-row">
            <span>Estimated Turns</span>
            <strong>{turnsLabel}</strong>
          </div>
        ) : null}
        <div className="meta-row">
          <span>Research Rate</span>
          <strong>{researchRate} XP/turn</strong>
        </div>
      </div>

      <div className="research-detail__section">
        <p className="panel-kicker">Requirements</p>
        <div className="research-detail__req-list">
          <div className={`research-detail__req-item ${!node.isLocked ? 'research-detail__req-item--met' : 'research-detail__req-item--unmet'}`}>
            <span>Domain</span>
            <strong>{node.isLocked ? '\u2717 Locked' : '\u2713 Unlocked'}</strong>
          </div>
          {node.prerequisites.length > 0 ? (
            <div className="research-detail__req-item research-detail__req-item--met">
              <span>Prerequisites</span>
              <strong>{node.prerequisiteNames.join(', ')}</strong>
            </div>
          ) : null}
        </div>
      </div>

      {node.unlocks.length > 0 ? (
        <div className="research-detail__section">
          <p className="panel-kicker">Unlocks</p>
          <div className="research-detail__unlock-list">
            {node.unlocks.map((unlock) => (
              <div key={`${unlock.type}:${unlock.id}`} className="research-detail__unlock-item">
                <span>{unlockGlyphs[unlock.type]}</span>
                <strong>{unlock.name}</strong>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="research-detail__section">
        <p className="panel-kicker">Synergy Role</p>
        <div className="research-detail__effect-box">{synergyRole}</div>
      </div>

      {node.qualitativeEffect ? (
      <div className="research-detail__section">
        <p className="panel-kicker">Effect</p>
        <div className="research-detail__effect-box">{node.qualitativeEffect}</div>
      </div>
      ) : null}

      <div className="research-detail__action-row">
        {node.state === 'available' && !hasActiveResearch ? (
          <button
            className="research-detail__action research-detail__action--primary"
            onClick={() => onStartResearch(node.nodeId)}
          >
            Start Research
          </button>
        ) : node.state === 'active' ? (
          <button
            className="research-detail__action research-detail__action--danger"
            onClick={onCancelResearch}
          >
            Cancel Research
          </button>
        ) : (
          <button className="research-detail__action" disabled>
            {buttonLabel}
          </button>
        )}
        {buttonHint ? <span className="research-detail__hint">{buttonHint}</span> : null}
      </div>
    </div>
  );
});
