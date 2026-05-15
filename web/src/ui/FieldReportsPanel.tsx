import React, { useState } from 'react';
import { SynergyCard } from './SynergyCard';
import type { PairSynergyData, EmergentRuleData } from './SynergyCard';
import type { EnemySynergyIntelMap } from '../game/types/clientState';
import { intelTier } from '../game/synergy/intelTiers';
import { PAIR_SYNERGY_BY_ID, EMERGENT_RULE_BY_ID } from '../data/synergyLookup';

type FactionSummary = {
  id: string;
  name: string;
  color: string;
};

type FieldReportsPanelProps = {
  intel: EnemySynergyIntelMap;
  factionSummaries: FactionSummary[];
};

export const FieldReportsPanel = React.memo(function FieldReportsPanel({
  intel,
  factionSummaries,
}: FieldReportsPanelProps) {
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);

  // Build per-faction intel entries
  const factionReports = factionSummaries
    .filter((f) => intel[f.id] && Object.keys(intel[f.id]).length > 0)
    .map((faction) => {
      const factionIntel = intel[faction.id];
      const cards: Array<{ data: PairSynergyData | EmergentRuleData; kind: 'pair' | 'triple'; tier: number }> = [];

      for (const [synergyId, entry] of Object.entries(factionIntel)) {
        const tier = intelTier(entry);
        if (tier < 1) continue;
        const pairData = PAIR_SYNERGY_BY_ID.get(synergyId);
        if (pairData) { cards.push({ data: pairData, kind: 'pair', tier }); continue; }
        const ruleData = EMERGENT_RULE_BY_ID.get(synergyId);
        if (ruleData) { cards.push({ data: ruleData, kind: 'triple', tier }); }
      }

      return { faction, cards };
    })
    .filter((r) => r.cards.length > 0);

  if (factionReports.length === 0) {
    return <p className="quiet-copy">No enemy intelligence gathered yet. Engage enemy units in combat to discover their synergies.</p>;
  }

  return (
    <div className="frp-list">
      {factionReports.map(({ faction, cards }) => (
        <div key={faction.id} className="frp-faction">
          <div className="frp-faction__header">
            <span className="faction-swatch" style={{ background: faction.color }} />
            <strong>{faction.name}</strong>
            <span className="frp-faction__count">{cards.length} {cards.length === 1 ? 'synergy' : 'synergies'}</span>
          </div>
          <div className="ci-synergy-cards">
            {cards.map(({ data, kind, tier }) => (
              <div
                key={data.id}
                onClick={() => setExpandedCardId(expandedCardId === data.id ? null : data.id)}
              >
                <SynergyCard
                  mode="field-report"
                  synergy={data}
                  kind={kind}
                  factionColor={faction.color}
                  factionName={faction.name}
                  tier={tier as 0 | 1 | 2}
                  compact={expandedCardId !== data.id}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
});
