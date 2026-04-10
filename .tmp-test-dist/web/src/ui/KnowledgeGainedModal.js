import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import pairSynergiesData from '../data/pair-synergies.json' with { type: 'json' };
import emergentRulesData from '../data/emergent-rules.json' with { type: 'json' };
// ── Typed data imports ──
const PAIR_SYNERGIES = pairSynergiesData.pairSynergies.map((s) => ({
    id: s.id,
    name: s.name,
    domains: s.domains,
    description: s.description,
}));
const EMERGENT_RULES = emergentRulesData.rules;
// ── Synergy Lookup Logic ──
function findActiveSynergies(learnedDomains) {
    if (learnedDomains.length < 2)
        return [];
    const matches = [];
    for (const synergy of PAIR_SYNERGIES) {
        const hasAll = synergy.domains.every((d) => learnedDomains.includes(d));
        if (hasAll) {
            matches.push(synergy);
        }
    }
    return matches;
}
function findNearMisses(learnedDomains) {
    const misses = [];
    for (const rule of EMERGENT_RULES) {
        if (!rule.domainSets)
            continue;
        // Collect all domain categories this rule cares about
        const ruleDomainCategories = Object.keys(rule.domainSets);
        if (ruleDomainCategories.length === 0)
            continue;
        // For each category, check if the unit has ANY domain in that set
        let matchedCategories = 0;
        let totalCategories = ruleDomainCategories.length;
        let missingCategory = null;
        let missingDomainForCategory = null;
        for (const category of ruleDomainCategories) {
            const domainsInCategory = rule.domainSets[category];
            const hasAny = domainsInCategory.some((d) => learnedDomains.includes(d));
            if (hasAny) {
                matchedCategories++;
            }
            else {
                missingCategory = category;
                missingDomainForCategory = domainsInCategory[0] ?? category;
            }
        }
        // Near miss: exactly one category away
        if (matchedCategories === totalCategories - 1 && missingCategory && missingDomainForCategory) {
            misses.push({ rule, missingDomain: missingDomainForCategory });
        }
    }
    return misses;
}
const KnowledgeModalContext = createContext(null);
export function useKnowledgeModal() {
    const ctx = useContext(KnowledgeModalContext);
    if (!ctx) {
        throw new Error('useKnowledgeModal must be used within KnowledgeGainedModalProvider');
    }
    return ctx;
}
// ── Detection Hook ──
/**
 * Watches ClientState world.units for newly learned abilities.
 * Returns a callback to invoke when a learn event is detected.
 */
export function useLearnDetector(units, factions, playerFactionId, onDetect) {
    const prevRef = useRef(new Map());
    useEffect(() => {
        const prev = prevRef.current;
        for (const unit of units) {
            // Only show popup for the human player's own units
            if (playerFactionId && unit.factionId !== playerFactionId)
                continue;
            const current = unit.learnedAbilities ?? [];
            const previous = prev.get(unit.id);
            if (previous !== undefined) {
                // Find newly added domains
                const newDomains = current.filter((d) => !previous.includes(d));
                for (const domainId of newDomains) {
                    const enemyFaction = factions.find((f) => f.nativeDomain === domainId || f.id === domainId);
                    onDetect({
                        unitId: unit.id,
                        unitName: unit.prototypeName,
                        domainName: formatDomainName(domainId),
                        enemyFactionName: enemyFaction?.name ?? domainId,
                        learnedDomains: [...current],
                    });
                }
            }
            prev.set(unit.id, current);
        }
    }, [units, factions, playerFactionId, onDetect]);
}
// ── Domain Name Formatter ──
function formatDomainName(domainId) {
    return domainId
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}
// ── Provider + Modal Component ──
export function KnowledgeGainedModalProvider({ children }) {
    const [event, setEvent] = useState(null);
    const showKnowledgeGained = useCallback((e) => {
        setEvent(e);
    }, []);
    const dismiss = useCallback(() => {
        setEvent(null);
    }, []);
    const ctxValue = useMemo(() => ({ event, showKnowledgeGained, dismiss }), [event, showKnowledgeGained, dismiss]);
    return (<KnowledgeModalContext.Provider value={ctxValue}>
      {children}
      {event ? <KnowledgeGainedModalInner event={event} onDismiss={dismiss}/> : null}
    </KnowledgeModalContext.Provider>);
}
function KnowledgeGainedModalInner({ event, onDismiss }) {
    const synergies = useMemo(() => findActiveSynergies(event.learnedDomains), [event.learnedDomains]);
    const nearMisses = useMemo(() => findNearMisses(event.learnedDomains), [event.learnedDomains]);
    return (<div className="kgm-overlay" onClick={(e) => e.target === e.currentTarget && onDismiss()}>
      <div className="kgm-card">
        {/* Header */}
        <div className="kgm-header">
          <span className="kgm-icon">&#9733;</span>
          <h2 className="kgm-title">Knowledge Gained!</h2>
        </div>

        {/* Unit announcement */}
        <p className="kgm-announcement">
          <strong>{event.unitName}</strong> learned{' '}
          <span className="kgm-domain">{event.domainName}</span> from the{' '}
          <strong>{event.enemyFactionName}</strong>!
        </p>

        {/* Active synergies */}
        {synergies.length > 0 ? (<div className="kgm-section">
            <h3 className="kgm-section-title">Synergies Unlocked</h3>
            {synergies.map((s) => (<div key={s.id} className="kgm-synergy">
                <span className="kgm-synergy-name">{s.name}</span>
                <p className="kgm-synergy-desc">{s.description}</p>
              </div>))}
          </div>) : null}

        {/* Near-miss teasers */}
        {nearMisses.length > 0 ? (<div className="kgm-section kgm-section--nearmiss">
            <h3 className="kgm-section-title">Within Reach</h3>
            {nearMisses.map(({ rule, missingDomain }) => (<p key={rule.id} className="kgm-nearmiss">
                If this unit also learns{' '}
                <span className="kgm-missing-domain">{formatDomainName(missingDomain)}</span>, it could unlock:{' '}
                <strong>{rule.name}</strong> &mdash; {rule.effect.description}
              </p>))}
          </div>) : null}

        {/* Footer instruction */}
        <p className="kgm-instruction">
          Return this unit to your Home City to sacrifice it and unlock this domain for your entire faction.
        </p>

        {/* Dismiss button */}
        <button type="button" className="kgm-dismiss" onClick={onDismiss}>
          OK
        </button>
      </div>
    </div>);
}
