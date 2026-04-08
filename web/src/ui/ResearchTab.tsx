import { helpContent } from '../data/help-content';

const PIPELINE_STEPS = [
  {
    icon: '⚔️',
    label: 'Learn by Kill',
    desc: 'Defeat enemies to learn their abilities',
  },
  {
    icon: '🏛️',
    label: 'Sacrifice',
    desc: 'Bring the unit home and sacrifice to codify the domain',
  },
  {
    icon: '📖',
    label: 'Research',
    desc: 'Spend XP to upgrade the domain through 3 tiers',
  },
  {
    icon: '⚡',
    label: 'Synergies',
    desc: 'Combine domains for powerful combo effects',
  },
] as const;

export function ResearchTab() {
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
}
