import React from 'react';
import type { ResearchNodeViewModel } from '../game/types/clientState';

type ResearchNodeProps = {
  node: ResearchNodeViewModel;
  selected: boolean;
  onSelect: () => void;
};

const stateIcons: Record<ResearchNodeViewModel['state'], string> = {
  completed: '\u2713',
  active: '\u25CF',
  available: '\u25CB',
  locked: '\u2298',
  insufficient: '\u25B3',
};

export const ResearchNode = React.memo(function ResearchNode({ node, selected, onSelect }: ResearchNodeProps) {
  const progressPct = node.xpCost > 0 ? Math.round((node.currentProgress / node.xpCost) * 100) : 0;
  const summary = node.qualitativeEffect ?? '';

  const isForeignAssimilating = node.isForeignAssimilating;
  const isPrereqLocked = node.state === 'locked' && !node.isDomainLocked;

  const classes = [
    'research-node',
    `research-node--${node.state}`,
    node.isLocked && !isForeignAssimilating ? 'research-node--domain-locked' : '',
    isForeignAssimilating ? 'research-node--assimilating' : '',
    node.isNative ? 'research-node--native' : '',
    selected ? 'research-node--selected' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      onClick={onSelect}
      role="button"
      tabIndex={isPrereqLocked ? -1 : 0}
      onKeyDown={(e) => {
        if (!isPrereqLocked && (e.key === 'Enter' || e.key === ' ')) {
          onSelect();
        }
      }}
    >
      <div className="research-node__header">
        <span className="research-node__tier-badge">T{node.tier}</span>
        <span className="research-node__icon" aria-hidden="true">{stateIcons[node.state]}</span>
      </div>
      <div className="research-node__name">{node.name}</div>
      {node.state !== 'completed' && node.xpCost > 0 && (
        <>
          <div className={`research-node__progress${node.isEcologyActive && node.state !== 'active' ? ' research-node__progress--ecology' : ''}${isForeignAssimilating ? ' research-node__progress--assimilation' : ''}`}>
            <div className="research-node__progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="research-node__progress-text">{node.currentProgress}/{node.xpCost}</div>
        </>
      )}
      {node.isEcologyActive && node.state !== 'completed' && (
        <div className="research-node__ecology-badge">
          <span className="research-node__ecology-icon" aria-label="Ecology progress">&#9889;</span>
          <span className="research-node__ecology-text">+{node.ecologyBonus?.toFixed(1) ?? 0}/turn</span>
        </div>
      )}
      {node.potentialEcologyBonus > 0 && node.state !== 'completed' && (
        <div className="research-node__potential-badge">
          <span className="research-node__potential-icon" aria-label="Potential passive progress">&#9889;</span>
          <span className="research-node__potential-text">+{node.potentialEcologyBonus.toFixed(1)}/turn</span>
        </div>
      )}
      {node.ecologyEstimatedTurns !== null && node.state !== 'completed' && node.state !== 'active' && (
        <div className="research-node__ecology-turns">
          ~{node.ecologyEstimatedTurns} turns
        </div>
      )}
      {node.state === 'completed' && (
        <div className="research-node__completed-label">Complete</div>
      )}
      {isForeignAssimilating && (
        <div className="research-node__assimilating-label">Assimilating...</div>
      )}
      {node.isDomainLocked && !isForeignAssimilating && (
        <div className="research-node__not-learned-label">Domain not learned</div>
      )}
      {summary && <div className="research-node__effect">{summary}</div>}
    </div>
  );
});
