import React from 'react';
import { helpContent } from '../data/help-content';

const PIPELINE_STEPS = [
  {
    icon: '⚔️',
    label: 'Learn',
    desc: 'Defeat enemies or capture cities to learn abilities on a unit',
  },
  {
    icon: '🌿',
    label: 'Awareness',
    desc: 'Domain enters your research list (exposure/ecology/absorption)',
  },
  {
    icon: '📖',
    label: 'Research',
    desc: 'Ecology XP pays scaled T1 cost (20/40/60...), then T2/T3',
  },
  {
    icon: '🔥',
    label: 'Sacrifice',
    desc: 'Sacrifice unit at city — grants synergy eligibility, zero tech',
  },
] as const;

export const ResearchTab = React.memo(function ResearchTab() {
  return (
    <div className="research-tab">
      <div className="help-content">
        <div
          className="help-prose"
          dangerouslySetInnerHTML={{ __html: helpContent.research.body }}
        />
      </div>

      <div className="research-tab__pipeline">
        {PIPELINE_STEPS.map((step, i) => (
          <div key={step.label} className="research-tab__pipeline-segment">
            <div className="research-tab__step">
              <span className="research-tab__step-icon">{step.icon}</span>
              <span className="research-tab__step-label">{step.label}</span>
              <span className="research-tab__step-desc">{step.desc}</span>
            </div>
            {i < PIPELINE_STEPS.length - 1 && (
              <span className="research-tab__arrow">→</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
});
