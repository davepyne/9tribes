import React from 'react';
import type { ResearchNodeViewModel } from '../game/types/clientState';
import { ResearchNode } from './ResearchNode';

type ResearchTreeProps = {
  nodes: ResearchNodeViewModel[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
};

// All 10 research domains in display order
const DOMAINS = [
  { id: 'venom', name: 'Venom' },
  { id: 'fortress', name: 'Fortress' },
  { id: 'charge', name: 'Charge' },
  { id: 'hitrun', name: 'Hit & Run' },
  { id: 'nature_healing', name: 'Nature Healing' },
  { id: 'camel_adaptation', name: 'Camel Adapt' },
  { id: 'tidal_warfare', name: 'Tidal War' },
  { id: 'river_stealth', name: 'River Stealth' },
  { id: 'slaving', name: 'Slaving' },
  { id: 'heavy_hitter', name: 'Heavy Hitter' },
] as const;

const TIERS = [1, 2, 3] as const;

export const ResearchTree = React.memo(function ResearchTree({ nodes, selectedNodeId, onSelectNode }: ResearchTreeProps) {
  const nodeMap = new Map(nodes.map((node) => [node.nodeId, node]));

  // Only render domains that are unlocked (isLocked === false on T1)
  const unlockedDomains = DOMAINS.filter((domain) => {
    const t1 = nodeMap.get(`${domain.id}_t1`);
    return t1 && !t1.isLocked;
  });

  if (unlockedDomains.length === 0) {
    return (
      <div className="research-tree-empty">
        <p className="research-tree-empty__icon">&#9733;</p>
        <p>No domains unlocked yet.</p>
        <p className="research-tree-empty__hint">
          Your native domain will appear here. Foreign domains are unlocked through combat learning, captures, and exposure.
        </p>
      </div>
    );
  }

  return (
    <div className="research-tree-shell">
      <div className="research-tree__domains">
        {unlockedDomains.map((domain) => {
          const t1 = nodeMap.get(`${domain.id}_t1`);
          const t2 = nodeMap.get(`${domain.id}_t2`);
          const t3 = nodeMap.get(`${domain.id}_t3`);
          if (!t1 && !t2 && !t3) return null;

          const isNative = t1?.isNative ?? false;

          return (
            <div
              key={domain.id}
              className={`research-domain-row${isNative ? ' research-domain-row--native' : ''}`}
            >
              <div className="research-domain-row__label">
                <span className="research-domain-row__name">{domain.name}</span>
                {isNative && <span className="research-domain-row__native-badge" aria-label="Native">&#9733;</span>}
              </div>

              <div className="research-domain-row__nodes">
                {TIERS.map((tier) => {
                  const node = nodeMap.get(`${domain.id}_t${tier}`);
                  if (!node) return null;

                  return (
                    <div key={node.nodeId} className="research-domain-row__cell">
                      {tier < 3 && (
                        <div className="research-domain-row__connector" aria-hidden="true" />
                      )}
                      <ResearchNode
                        node={node}
                        selected={node.nodeId === selectedNodeId}
                        onSelect={() => onSelectNode(node.nodeId)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
