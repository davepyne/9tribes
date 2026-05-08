import React, { useEffect, useState, useCallback } from 'react';
import { SynergyCard } from './SynergyCard';
import type { PairSynergyData, EmergentRuleData } from './SynergyCard';
import type { EnemySynergyIntelMap } from '../game/types/clientState';
import { intelTier } from '../game/synergy/intelTiers';
import pairSynergiesData from '../data/pair-synergies.json';
import emergentRulesData from '../data/emergent-rules.json';

type FirstContactEvent = {
  factionId: string;
  synergyId: string;
  synergyName: string;
};

type EnemySynergyContactModalProps = {
  firstContactQueue: FirstContactEvent[];
  intel: EnemySynergyIntelMap;
  factionNames: Record<string, string>;
  factionColors: Record<string, string>;
  onDismiss: () => void;
};

export const EnemySynergyContactModal = React.memo(function EnemySynergyContactModal({
  firstContactQueue,
  intel,
  factionNames,
  factionColors,
  onDismiss,
}: EnemySynergyContactModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const current = firstContactQueue[currentIndex];
  const hasMore = currentIndex < firstContactQueue.length - 1;

  const handleNext = useCallback(() => {
    if (hasMore) {
      setCurrentIndex((i) => i + 1);
    } else {
      setCurrentIndex(0);
      onDismiss();
    }
  }, [hasMore, onDismiss]);

  if (!current) return null;

  // Resolve full synergy data
  const pairData = (pairSynergiesData.pairSynergies as PairSynergyData[])
    .find((p) => p.id === current.synergyId);
  const emergentData = (emergentRulesData.rules as EmergentRuleData[])
    .find((r) => r.id === current.synergyId);

  const synergyData = pairData ?? emergentData;
  if (!synergyData) return null;

  const kind = pairData ? 'pair' as const : 'triple' as const;
  const factionName = factionNames[current.factionId] ?? 'Unknown Faction';
  const factionColor = factionColors[current.factionId] ?? '#888';
  const tier = intelTier(intel[current.factionId]?.[current.synergyId]);

  return (
    <div className="sym-overlay" onClick={(e) => e.target === e.currentTarget && handleNext()}>
      <div className="sym-card">
        <div className="sym-glow" style={{ background: `radial-gradient(ellipse, ${factionColor}15, transparent 70%)` }} />
        <div className="sym-header">
          <h2 className="sym-title" style={{ color: factionColor }}>Field Report</h2>
        </div>
        <div className="sym-divider">
          <span className="sym-divider-gem" style={{ background: factionColor }} />
        </div>
        <p style={{ margin: '0 0 12px', fontSize: '11px', color: '#9ca3af', fontStyle: 'italic' }}>
          New intelligence from contact with {factionName}
        </p>
        <SynergyCard
          mode="field-report"
          synergy={synergyData}
          kind={kind}
          factionColor={factionColor}
          factionName={factionName}
          tier={tier}
        />
        <button type="button" className="sym-dismiss" onClick={handleNext}>
          {hasMore ? 'Next Report' : 'Close'}
        </button>
      </div>
    </div>
  );
});
