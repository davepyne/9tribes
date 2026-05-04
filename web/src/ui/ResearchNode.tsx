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

  const classes = [
    'research-node',
    `research-node--${node.state}`,
    node.isLocked ? 'research-node--domain-locked' : '',
    node.isNative ? 'research-node--native' : '',
    selected ? 'research-node--selected' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      onClick={onSelect}
      role="button"
      tabIndex={node.isLocked ? -1 : 0}
      onKeyDown={(e) => {
        if (!node.isLocked && (e.key === 'Enter' || e.key === ' ')) {
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
          <div className="research-node__progress">
            <div className="research-node__progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="research-node__progress-text">{node.currentProgress}/{node.xpCost}</div>
        </>
      )}
      {node.state === 'completed' && (
        <div className="research-node__completed-label">Complete</div>
      )}
      {summary && <div className="research-node__effect">{summary}</div>}
    </div>
  );
});
