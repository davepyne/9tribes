import React, { useState, useMemo } from 'react';
import { helpContent } from '../data/help-content';
import {
  PAIR_SYNERGIES as PAIR_SYNERGIES_BACKEND,
  EMERGENT_RULES as EMERGENT_RULES_BACKEND,
} from '../../../src/content/synergies/index';
import { SynergyCard } from './SynergyCard';
import type { PairSynergyData, EmergentRuleData } from './SynergyCard';

const ALL_PAIR_SYNERGIES: PairSynergyData[] = PAIR_SYNERGIES_BACKEND.map((s) => ({
  id: s.id,
  name: s.name,
  domains: [...s.domains],
  description: s.description,
  friendlyFlavor: s.friendlyFlavor,
  enemyFlavor: s.enemyFlavor,
}));

const ALL_EMERGENT_RULES: EmergentRuleData[] = EMERGENT_RULES_BACKEND.map((r) => ({
  id: r.id,
  name: r.name,
  condition: r.condition,
  domainSets: r.domainSets,
  mobilityDomains: r.mobilityDomains,
  combatDomains: r.combatDomains,
  effect: { description: r.effect.description },
  friendlyFlavor: r.friendlyFlavor,
  enemyFlavor: r.enemyFlavor,
}));
import { domainGlyph, domainColor, domainDisplayName } from './SynergyChip';
import { DOMAIN_IDS } from '../data/domainMeta';

function emergentConditionLabel(rule: EmergentRuleData): string {
  switch (rule.condition) {
    case 'contains_terrain AND contains_combat AND contains_mobility':
      return 'Requires: one terrain + one combat + one mobility domain';
    case 'contains_healing AND contains_defensive AND contains_offensive':
      return 'Requires: one healing + one defensive + one offensive domain';
    case 'contains_stealth AND contains_combat AND contains_terrain':
      return 'Requires: one stealth + one combat + one terrain domain';
    case 'contains_fortress AND contains_healing AND contains_defensive':
      return 'Requires: fortress + one healing + one defensive domain';
    case 'contains_3_mobility':
      return 'Requires: three mobility domains (charge, skirmish, camel, or stealth)';
    case 'contains_3_combat':
      return 'Requires: three combat domains (any combat-oriented)';
    case 'contains_slaving AND contains_heavy AND contains_fortress':
      return 'Requires: slaving + heavy_hitter + fortress domains';
    case 'contains_camels AND contains_slaving AND contains_mobility':
      return 'Requires: camel + slaving + one mobility domain';
    case 'contains_venom AND contains_stealth AND contains_combat':
      return 'Requires: venom + stealth + one combat domain';
    case 'contains_fortress AND contains_heavy AND contains_terrain':
      return 'Requires: fortress + heavy_hitter + one terrain domain';
    default:
      return rule.condition;
  }
}

export const SynergyEncyclopediaTab = React.memo(function SynergyEncyclopediaTab() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);

  const toggleFilter = (domainId: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(domainId)) {
        next.delete(domainId);
      } else {
        next.add(domainId);
      }
      return next;
    });
  };

  const clearFilters = () => setActiveFilters(new Set());

  const guideMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of helpContent.synergyGuide) {
      map.set(entry.pairId, entry.playerDescription);
    }
    return map;
  }, []);

  const filteredSynergies = useMemo(() => {
    const search = searchTerm.toLowerCase().trim();
    return ALL_PAIR_SYNERGIES.filter((pair) => {
      if (activeFilters.size > 0) {
        for (const f of activeFilters) {
          if (!pair.domains.includes(f)) return false;
        }
      }
      if (search) {
        const nameMatch = pair.name.toLowerCase().includes(search);
        const descMatch = (guideMap.get(pair.id) ?? pair.description ?? '').toLowerCase().includes(search);
        if (!nameMatch && !descMatch) return false;
      }
      return true;
    });
  }, [searchTerm, activeFilters, guideMap]);

  const emergentRules = useMemo(
    () => ALL_EMERGENT_RULES.filter((r) => r.condition !== 'default'),
    [],
  );

  const neutralColor = '#a8a29e';

  return (
    <div className="syn-enc">
      <input
        type="text"
        className="syn-enc__search"
        placeholder="Search synergies by name, tag, or description…"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />

      <div className="syn-enc__filters">
        {activeFilters.size > 0 && (
          <button
            type="button"
            className="syn-enc__filter-clear"
            onClick={clearFilters}
          >
            All
          </button>
        )}
        {DOMAIN_IDS.map((domainId) => {
          const isActive = activeFilters.has(domainId);
          return (
            <button
              key={domainId}
              type="button"
              className={`syn-enc__filter-dot${isActive ? ' syn-enc__filter-dot--active' : ''}`}
              style={{ '--dot-color': domainColor(domainId) } as React.CSSProperties}
              onClick={() => toggleFilter(domainId)}
              title={domainDisplayName(domainId)}
            >
              <span className="syn-enc__filter-dot__glyph">{domainGlyph(domainId)}</span>
            </button>
          );
        })}
      </div>

      <div className="syn-enc__count">
        Showing {filteredSynergies.length} of {ALL_PAIR_SYNERGIES.length} synergies
      </div>

      {filteredSynergies.length > 0 ? (
        <div className="syn-enc__list">
          {filteredSynergies.map((pair) => (
            <div
              key={pair.id}
              className="syn-enc__card-wrap"
              onClick={() => setExpandedCardId(expandedCardId === pair.id ? null : pair.id)}
            >
              <SynergyCard
                mode="friendly"
                synergy={pair}
                kind="pair"
                factionColor={neutralColor}
                compact={expandedCardId !== pair.id}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="syn-enc__empty">No synergies match your filters.</div>
      )}

      <div className="syn-enc__section">Emergent Triple Stacks</div>
      <div className="syn-enc__list">
        {emergentRules.map((rule) => (
          <div
            key={rule.id}
            className="syn-enc__card-wrap"
            onClick={() => setExpandedCardId(expandedCardId === rule.id ? null : rule.id)}
          >
            <SynergyCard
              mode="friendly"
              synergy={rule}
              kind="triple"
              factionColor={neutralColor}
              compact={expandedCardId !== rule.id}
            />
          </div>
        ))}
      </div>
    </div>
  );
});
