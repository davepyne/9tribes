import { helpContent } from '../data/help-content';

export function CombatTab() {
  return (
    <div className="combat-tab">
      <div className="help-content">
        <div
          className="help-prose"
          dangerouslySetInnerHTML={{ __html: helpContent.combat.body }}
        />
      </div>
      <div className="combat-tab__synergy-cta">
        Want to see every synergy combo? Check the <strong>Synergies</strong> tab for the full encyclopedia.
      </div>
    </div>
  );
}
