import { useEffect } from 'react';
import type { ReplayCombatEvent } from '../game/types/replay';

type CombatDetailModalProps = {
  event: ReplayCombatEvent;
  onClose: () => void;
};

export function CombatDetailModal({ event, onClose }: CombatDetailModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const { breakdown } = event;
  const mods = breakdown.modifiers;

  return (
    <div className="cd-overlay" onClick={onClose}>
      <div className="cd-card" onClick={(e) => e.stopPropagation()}>
        <header className="cd-card__header">
          <h2 className="cd-card__title">Combat Breakdown</h2>
          <button className="cd-card__close" onClick={onClose} aria-label="Close">&times;</button>
        </header>

        <div className="cd-card__body">
          {/* Units Snapshot */}
          <section className="cd-section">
            <h3 className="cd-section__title">Units</h3>
            <div className="cd-units">
              {breakdown.attacker && <UnitSnapshot unit={breakdown.attacker} label="Attacker" side="attacker" />}
              {breakdown.defender && <UnitSnapshot unit={breakdown.defender} label="Defender" side="defender" />}
            </div>
          </section>

          {/* Attack Strength */}
          <section className="cd-section">
            <h3 className="cd-section__title">
              Attack Strength <span className="cd-value">{mods.finalAttackStrength}</span>
            </h3>
            <ModifierTable
              rows={[
                { label: 'Base attack', value: breakdown.attacker?.baseStat ?? 0, isBase: true },
                ...(mods.roleModifier !== 0 ? [{ label: 'Role effectiveness', value: mods.roleModifier, pct: true }] : []),
                ...(mods.weaponModifier !== 0 ? [{ label: 'Weapon effectiveness', value: mods.weaponModifier, pct: true }] : []),
                ...(mods.chargeBonus !== 0 ? [{ label: 'Charge', value: mods.chargeBonus, pct: true }] : []),
                ...(mods.stealthAmbushBonus !== 0 ? [{ label: 'Stealth ambush', value: mods.stealthAmbushBonus, pct: true }] : []),
                ...(mods.ambushBonus !== 0 ? [{ label: 'Ambush (prepared)', value: mods.ambushBonus, pct: true }] : []),
                ...(mods.hiddenAttackBonus !== 0 ? [{ label: 'Hidden attack', value: mods.hiddenAttackBonus, pct: true }] : []),
                ...(mods.situationalAttackModifier !== 0 ? [{ label: 'Situational (terrain/faction)', value: mods.situationalAttackModifier, pct: true }] : []),
                ...(mods.synergyAttackModifier !== 0 ? [{ label: 'Synergy attack', value: mods.synergyAttackModifier, pct: true }] : []),
                { label: 'Base multiplier', value: mods.baseMultiplier, isFormula: true },
                ...(mods.flankingBonus !== 0 || mods.rearAttackBonus !== 0 ? [
                  { label: 'Positional mult.', value: mods.positionalMultiplier, isFormula: true },
                ] : []),
                { label: 'FINAL ATK', value: mods.finalAttackStrength, isFinal: true },
              ]}
            />
          </section>

          {/* Defense Strength */}
          <section className="cd-section">
            <h3 className="cd-section__title">
              Defense Strength <span className="cd-value">{mods.finalDefenseStrength}</span>
            </h3>
            <ModifierTable
              rows={[
                { label: 'Base defense', value: breakdown.defender?.baseStat ?? 0, isBase: true },
                ...(mods.improvementDefenseBonus !== 0 ? [{ label: 'Improvement (fort/city/village)', value: mods.improvementDefenseBonus, pct: true }] : []),
                ...(mods.wallDefenseBonus !== 0 ? [{ label: 'Wall defense', value: mods.wallDefenseBonus, pct: true }] : []),
                ...(mods.braceDefenseBonus !== 0 ? [{ label: 'Brace', value: mods.braceDefenseBonus, pct: true }] : []),
                ...(mods.situationalDefenseModifier !== 0 ? [{ label: 'Situational (terrain/doctrine)', value: mods.situationalDefenseModifier, pct: true }] : []),
                ...(mods.synergyDefenseModifier !== 0 ? [{ label: 'Synergy defense', value: mods.synergyDefenseModifier, pct: true }] : []),
                { label: 'FINAL DEF', value: mods.finalDefenseStrength, isFinal: true },
              ]}
            />
          </section>

          {/* Damage Calculation */}
          <section className="cd-section">
            <h3 className="cd-section__title">Damage</h3>
            <div className="cd-damage-grid">
              <div className="cd-damage-block cd-damage-block--dealt">
                <span className="cd-damage-block__label">To Defender</span>
                <span className="cd-damage-block__value">{event.defenderDamage}</span>
                <span className="cd-damage-block__formula">
                  max(3, {mods.finalAttackStrength} &minus; floor({mods.finalDefenseStrength} / 3))
                  {mods.damageVarianceMultiplier > 0 && <> &times; {mods.damageVarianceMultiplier.toFixed(2)} (variance)</>}
                </span>
              </div>
              <div className="cd-damage-block cd-damage-block--taken">
                <span className="cd-damage-block__label">Retaliation</span>
                <span className="cd-damage-block__value">{event.attackerDamage}</span>
                {event.attackerDamage > 0 && (
                  <span className="cd-damage-block__formula">
                    max(1, floor({mods.finalDefenseStrength} &times; 0.6) &minus; floor({breakdown.attacker?.baseStat ?? 0} / 3))
                    {mods.retaliationVarianceMultiplier > 0 && <> &times; {mods.retaliationVarianceMultiplier.toFixed(2)}</>}
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* Triggered Effects */}
          {breakdown.triggeredEffects.length > 0 && (
            <section className="cd-section">
              <h3 className="cd-section__title">Triggered Effects</h3>
              <div className="cd-effects">
                {breakdown.triggeredEffects.map((effect, i) => (
                  <div key={`${effect.label}-${i}`} className={`cd-effect cd-effect--${effect.category}`}>
                    <span className="cd-effect__label">{effect.label}</span>
                    <span className="cd-effect__detail">{effect.detail}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Outcome */}
          <section className="cd-section cd-section--outcome">
            <h3 className="cd-section__title">Outcome</h3>
            <div className="cd-outcome-row">
              {event.defenderDestroyed && <span className="cd-outcome-tag cd-outcome-tag--destroyed">{event.defenderPrototypeName} destroyed</span>}
              {event.defenderRouted && <span className="cd-outcome-tag cd-outcome-tag--routed">{event.defenderPrototypeName} routed</span>}
              {event.defenderFled && <span className="cd-outcome-tag cd-outcome-tag--fled">{event.defenderPrototypeName} fled</span>}
              {event.attackerDestroyed && <span className="cd-outcome-tag cd-outcome-tag--destroyed">{event.attackerPrototypeName} destroyed</span>}
              {event.attackerRouted && <span className="cd-outcome-tag cd-outcome-tag--routed">{event.attackerPrototypeName} routed</span>}
              {event.attackerFled && <span className="cd-outcome-tag cd-outcome-tag--fled">{event.attackerPrototypeName} fled</span>}
            </div>
            {breakdown.outcome.defenderKnockedBack && (
              <p className="cd-knockback">Knocked back {breakdown.outcome.knockbackDistance} hex{breakdown.outcome.knockbackDistance > 1 ? 'es' : ''}</p>
            )}
            {breakdown.morale && (breakdown.morale.attackerChange !== 0 || breakdown.morale.defenderChange !== 0) && (
              <div className="cd-morale">
                <span>Morale &mdash; attacker:{' '}
                  <span className={breakdown.morale.attackerChange >= 0 ? 'cd-morale--gain' : 'cd-morale--loss'}>
                    {breakdown.morale.attackerChange >= 0 ? '+' : ''}{breakdown.morale.attackerChange.toFixed(1)}
                  </span>
                  {' \u00b7 '} defender:{' '}
                  <span className={breakdown.morale.defenderChange >= 0 ? 'cd-morale--gain' : 'cd-morale--loss'}>
                    {breakdown.morale.defenderChange >= 0 ? '+' : ''}{breakdown.morale.defenderChange.toFixed(1)}
                  </span>
                </span>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──

function UnitSnapshot({ unit, label, side }: { unit: NonNullable<ReplayCombatEvent['breakdown']['attacker']>; label: string; side: 'attacker' | 'defender' }) {
  return (
    <div className={`cd-unit cd-unit--${side}`}>
      <span className="cd-unit__label">{label}</span>
      <span className="cd-unit__name">{unit.prototypeName}</span>
      <span className="cd-unit__terrain">Terrain: {unit.terrain}</span>
      <span className="cd-unit__hp">
        HP: {unit.hpBefore} &rarr; {unit.hpAfter} / {unit.maxHp}
      </span>
      <span className="cd-unit__base-stat">Base stat: {unit.baseStat}</span>
    </div>
  );
}

type ModifierRow = {
  label: string;
  value: number;
  isBase?: boolean;
  isFinal?: boolean;
  isFormula?: boolean;
  pct?: boolean;
};

function ModifierTable({ rows }: { rows: ModifierRow[] }) {
  return (
    <table className="cd-mod-table">
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className={`cd-mod-row${row.isFinal ? ' cd-mod-row--final' : ''}${row.isBase ? ' cd-mod-row--base' : ''}${row.isFormula ? ' cd-mod-row--formula' : ''}`}>
            <td className="cd-mod-row__label">{row.label}</td>
            <td className={`cd-mod-row__value${row.value > 0 && !row.isBase && !row.isFinal ? ' cd-mod-row__value--pos' : row.value < 0 ? ' cd-mod-row__value--neg' : ''}`}>
              {row.pct ? `${row.value > 0 ? '+' : ''}${(row.value * 100).toFixed(0)}%` : row.value.toFixed(2)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
