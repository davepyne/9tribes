import { helpContent } from '../data/help-content.js';
import { domainGlyph, domainColor, domainDisplayName } from './SynergyChip.js';
export function TribesTab() {
    return (<div className="tribe-list">
      {helpContent.tribes.map((tribe) => (<article key={tribe.id} className="tribe-card" style={{ '--tribe-accent': tribe.color }}>
          {/* Header */}
          <div className="tribe-card__header">
            <span className="tribe-card__swatch" style={{ backgroundColor: tribe.color }}/>
            <span className="tribe-card__name">{tribe.name}</span>
            <span className="tribe-card__domain" style={{ color: domainColor(tribe.nativeDomain) }} title={domainDisplayName(tribe.nativeDomain)}>
              {domainGlyph(tribe.nativeDomain)} {domainDisplayName(tribe.nativeDomain)}
            </span>
          </div>

          {/* Biome tag */}
          <span className="tribe-card__biome">{tribe.homeBiome}</span>

          {/* Intro */}
          <p className="tribe-card__intro">{tribe.intro}</p>

          {/* Strengths */}
          <div className="tribe-card__strengths">
            <h4 className="tribe-card__label tribe-card__label--strength">Strengths</h4>
            <ul>
              {tribe.strengths.map((s, i) => (<li key={i}>{s}</li>))}
            </ul>
          </div>

          {/* Weaknesses */}
          <div className="tribe-card__weaknesses">
            <h4 className="tribe-card__label tribe-card__label--weakness">Weaknesses</h4>
            <ul>
              {tribe.weaknesses.map((w, i) => (<li key={i}>{w}</li>))}
            </ul>
          </div>

          {/* Tip */}
          <div className="tribe-card__tip">
            <span className="tribe-card__tip-icon">💡</span>
            <span>{tribe.tip}</span>
          </div>
        </article>))}
    </div>);
}
