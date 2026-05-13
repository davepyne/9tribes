import React from 'react';
import type { ResearchNodeViewModel } from '../game/types/clientState';
import { ResearchNode } from './ResearchNode';
import { DOMAIN_IDS, DOMAIN_TREE_NAMES } from '../data/domainMeta';

type ResearchTreeProps = {
  nodes: ResearchNodeViewModel[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
};

const DOMAINS: ReadonlyArray<{readonly id: string; readonly name: string}> =
  DOMAIN_IDS.map((id) => ({ id, name: DOMAIN_TREE_NAMES[id] ?? id }));

const TIERS = [1, 2, 3] as const;

export const ResearchTree = React.memo(function ResearchTree({ nodes, selectedNodeId, onSelectNode }: ResearchTreeProps) {
  const nodeMap = new Map(nodes.map((node) => [node.nodeId, node]));

  // Determine sort priority: active research domain > native > learned/unlocked > locked
  const activeDomainId = (() => {
    const active = nodes.find((n) => n.state === 'active');
    return active?.domain ?? null;
  })();

  const nativeDomainId = (() => {
    const t1 = nodes.find((n) => n.tier === 1 && n.isNative);
    return t1?.domain ?? null;
  })();

  const sortedDomains = [...DOMAINS].sort((a, b) => {
    const aT1 = nodeMap.get(`${a.id}_t1`);
    const bT1 = nodeMap.get(`${b.id}_t1`);
    const aUnlocked = aT1 && !aT1.isLocked;
    const bUnlocked = bT1 && !bT1.isLocked;

    if (a.id === activeDomainId && b.id !== activeDomainId) return -1;
    if (b.id === activeDomainId && a.id !== activeDomainId) return 1;
    if (a.id === nativeDomainId && b.id !== nativeDomainId) return -1;
    if (b.id === nativeDomainId && a.id !== nativeDomainId) return 1;
    if (aUnlocked && !bUnlocked) return -1;
    if (!aUnlocked && bUnlocked) return 1;
    return 0;
  });

  return (
    <div className="research-tree-shell">
      <div className="research-tree__domains">
        {sortedDomains.map((domain) => {
          const t1 = nodeMap.get(`${domain.id}_t1`);
          const t2 = nodeMap.get(`${domain.id}_t2`);
          const t3 = nodeMap.get(`${domain.id}_t3`);
          if (!t1 && !t2 && !t3) return null;

          const isNative = t1?.isNative ?? false;
          const isLocked = t1?.isLocked ?? true;
          const hasEcology = [t1, t2, t3].some((n) => n != null && n.isEcologyActive);

          return (
            <div
              key={domain.id}
              className={`research-domain-row${isNative ? ' research-domain-row--native' : ''}${hasEcology ? ' research-domain-row--ecology' : ''}${isLocked ? ' research-domain-row--locked' : ''}`}
            >
              <div className="research-domain-row__label">
                <span className="research-domain-row__name">{domain.name}</span>
                {isNative && <span className="research-domain-row__native-badge" aria-label="Native">&#9733;</span>}
                {isLocked && <span className="research-domain-row__locked-badge" aria-label="Locked">&#128274;</span>}
                {(() => {
                  const ecologyCount = [t1, t2, t3].filter((n): n is NonNullable<typeof n> => n != null && n.isEcologyActive).length;
                  return ecologyCount > 0
                    ? <span className="research-domain-row__ecology-count" aria-label={`${ecologyCount} nodes with ecology progress`}>&#9889;{ecologyCount}</span>
                    : null;
                })()}
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
