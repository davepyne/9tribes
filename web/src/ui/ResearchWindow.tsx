import React, { useEffect, useState } from 'react';
import type { ClientState } from '../game/types/clientState';
import { ResearchDetail } from './ResearchDetail';
import { ResearchTree } from './ResearchTree';

type ResearchWindowProps = {
  state: ClientState;
  onStartResearch: (nodeId: string) => void;
  onCancelResearch: () => void;
  onClose: () => void;
};

export const ResearchWindow = React.memo(function ResearchWindow({ state, onStartResearch, onCancelResearch, onClose }: ResearchWindowProps) {
  const research = state.research;
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!research) { setSelectedNodeId(null); return; }
    if (selectedNodeId && research.nodes.some((n) => n.nodeId === selectedNodeId)) return;

    const fallback =
      research.nodes.find((n) => n.state === 'active')
      ?? research.nodes.find((n) => n.state === 'available' && !n.isLocked)
      ?? research.nodes.find((n) => !n.isLocked)
      ?? research.nodes[0]
      ?? null;

    setSelectedNodeId(fallback?.nodeId ?? null);
  }, [research, selectedNodeId]);

  if (!research) return null;

  const selectedNode = selectedNodeId
    ? research.nodes.find((n) => n.nodeId === selectedNodeId) ?? null
    : null;

  const activeProgress = research.activeNodeProgress !== null && research.activeNodeXpCost !== null
    ? Math.round((research.activeNodeProgress / research.activeNodeXpCost) * 100)
    : null;

  return (
    <div className="research-overlay" onClick={onClose}>
      <div className="research-window" onClick={(e) => e.stopPropagation()}>
        <header className="research-window__header">
          <div className="research-window__header-left">
            <div className="panel-heading compact">
              <p className="panel-kicker">Knowledge Codex</p>
              <h2>Domain Research</h2>
            </div>
            <div className="research-header-stats">
              <span className="research-header-stat">
                <strong>{research.rateBreakdown.total}</strong> XP/turn
              </span>
              {research.activeNodeName && (
                <span className="research-header-stat research-header-stat--active">
                  <span className="research-header-pulse" />
                  <strong>{research.activeNodeName}</strong>
                  {activeProgress !== null ? ` ${activeProgress}%` : ''}
                </span>
              )}
            </div>
          </div>
          <button className="research-window__close" onClick={onClose} aria-label="Close">&times;</button>
        </header>

        <div className="research-window__body">
          <section className="research-window__tree-pane">
            <ResearchTree
              nodes={research.nodes}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
            />
          </section>

          <aside className="research-window__detail-pane">
            <ResearchDetail
              node={selectedNode}
              researchRate={research.rateBreakdown.total}
              onStartResearch={onStartResearch}
              onCancelResearch={onCancelResearch}
              hasActiveResearch={research.activeNodeId !== null}
              activeNodeName={research.activeNodeName}
            />
          </aside>
        </div>

        <div className="research-window__action-footer">
          {research.activeNodeId ? (
            <button className="research-action-btn research-action-btn--danger" onClick={onCancelResearch}>
              Cancel Research
            </button>
          ) : null}
          <button className="research-action-btn research-action-btn--primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
});
