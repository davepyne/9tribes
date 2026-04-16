import { useEffect } from 'react';
import type { ReplayCombatEvent } from '../game/types/replay';

type CombatDetailModalProps = {
  event: ReplayCombatEvent;
  onClose: () => void;
};

type ExtendedUnitBreakdown = {
  prototypeName?: string;
  terrain?: string;
  hpBefore?: number;
  hpAfter?: number;
  maxHp?: number;
  baseStat?: number;
};

type ExtendedModifiers = ReplayCombatEvent['breakdown']['modifiers'] & {
  roleModifier?: number;
  weaponModifier?: number;
  chargeBonus?: number;
  ambushBonus?: number;
  hiddenAttackBonus?: number;
  situationalAttackModifier?: number;
  synergyAttackModifier?: number;
  baseMultiplier?: number;
  positionalMultiplier?: number;
  improvementDefenseBonus?: number;
  wallDefenseBonus?: number;
  braceDefenseBonus?: number;
  situationalDefenseModifier?: number;
  synergyDefenseModifier?: number;
  damageVarianceMultiplier?: number;
  retaliationVarianceMultiplier?: number;
};

type ExtendedOutcome = ReplayCombatEvent['breakdown']['outcome'] & {
  defenderKnockedBack?: boolean;
  knockbackDistance?: number;
};

type ExtendedMorale = {
  attackerChange?: number;
  defenderChange?: number;
  attackerLoss?: number;
  defenderLoss?: number;
};

type ExtendedBreakdown = ReplayCombatEvent['breakdown'] & {
  attacker?: ExtendedUnitBreakdown;
  defender?: ExtendedUnitBreakdown;
  modifiers: ExtendedModifiers;
  outcome: ExtendedOutcome;
  morale?: ExtendedMorale;
};

export function CombatDetailModal({ event, onClose }: CombatDetailModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const breakdown = event.breakdown as ExtendedBreakdown;
  const mods = breakdown.modifiers;
  const attacker = breakdown.attacker;
  const defender = breakdown.defender;

  const roleModifier = mods.roleModifier ?? 0;
  const weaponModifier = mods.weaponModifier ?? 0;
  const chargeBonus = mods.chargeBonus ?? 0;
  const ambushBonus = mods.ambushBonus ?? 0;
  const hiddenAttackBonus = mods.hiddenAttackBonus ?? 0;
  const situationalAttackModifier = mods.situationalAttackModifier ?? 0;
  const synergyAttackModifier = mods.synergyAttackModifier ?? 0;
  const baseMultiplier = mods.baseMultiplier ?? 1;
  const positionalMultiplier = mods.positionalMultiplier ?? 1;
  const improvementDefenseBonus = mods.improvementDefenseBonus ?? 0;
  const wallDefenseBonus = mods.wallDefenseBonus ?? 0;
  const braceDefenseBonus = mods.braceDefenseBonus ?? 0;
  const situationalDefenseModifier = mods.situationalDefenseModifier ?? 0;
  const synergyDefenseModifier = mods.synergyDefenseModifier ?? 0;
  const damageVarianceMultiplier = mods.damageVarianceMultiplier ?? 0;
  const retaliationVarianceMultiplier = mods.retaliationVarianceMultiplier ?? 0;

  const moraleAttackerDelta = breakdown.morale?.attackerChange
    ?? (typeof breakdown.morale?.attackerLoss === 'number' ? -breakdown.morale.attackerLoss : 0);
  const moraleDefenderDelta = breakdown.morale?.defenderChange
    ?? (typeof breakdown.morale?.defenderLoss === 'number' ? -breakdown.morale.defenderLoss : 0);

  return (
    <div className="cd-overlay" onClick={onClose}>
      <div className="cd-card" onClick={(e) => e.stopPropagation()}>
        <header className="cd-card__header">
          <h2 className="cd-card__title">Combat Breakdown</h2>
          <button className="cd-card__close" onClick={onClose} aria-label="Close">&times;</button>
        </header>

        <div className="cd-card__body">
          {(attacker || defender) && (
            <section className="cd-section">
              <h3 className="cd-section__title">Units</h3>
              <div className="cd-units">
                {attacker && <UnitSnapshot unit={attacker} fallbackName={event.attackerPrototypeName} label="Attacker" side="attacker" />}
                {defender && <UnitSnapshot unit={defender} fallbackName={event.defenderPrototypeName} label="Defender" side="defender" />}
              </div>
            </section>
          )}

          <section className="cd-section">
            <h3 className="cd-section__title">
              Attack Strength <span className="cd-value">{mods.finalAttackStrength}</span>
            </h3>
            <ModifierTable
              rows={[
                { label: 'Base attack', value: attacker?.baseStat ?? mods.finalAttackStrength, isBase: true },
                ...(roleModifier !== 0 ? [{ label: 'Role effectiveness', value: roleModifier, pct: true }] : []),
                ...(weaponModifier !== 0 ? [{ label: 'Weapon effectiveness', value: weaponModifier, pct: true }] : []),
                ...(chargeBonus !== 0 ? [{ label: 'Charge', value: chargeBonus, pct: true }] : []),
                ...(mods.stealthAmbushBonus !== 0 ? [{ label: 'Stealth ambush', value: mods.stealthAmbushBonus, pct: true }] : []),
                ...(ambushBonus !== 0 ? [{ label: 'Ambush (prepared)', value: ambushBonus, pct: true }] : []),
                ...(hiddenAttackBonus !== 0 ? [{ label: 'Hidden attack', value: hiddenAttackBonus, pct: true }] : []),
                ...(situationalAttackModifier !== 0 ? [{ label: 'Situational (terrain/faction)', value: situationalAttackModifier, pct: true }] : []),
                ...(synergyAttackModifier !== 0 ? [{ label: 'Synergy attack', value: synergyAttackModifier, pct: true }] : []),
                ...(baseMultiplier !== 1 ? [{ label: 'Base multiplier', value: baseMultiplier, isFormula: true }] : []),
                ...(mods.flankingBonus !== 0 || mods.rearAttackBonus !== 0 || positionalMultiplier !== 1
                  ? [{ label: 'Positional mult.', value: positionalMultiplier, isFormula: true }]
                  : []),
                { label: 'FINAL ATK', value: mods.finalAttackStrength, isFinal: true },
              ]}
            />
          </section>

          <section className="cd-section">
            <h3 className="cd-section__title">
              Defense Strength <span className="cd-value">{mods.finalDefenseStrength}</span>
            </h3>
            <ModifierTable
              rows={[
                { label: 'Base defense', value: defender?.baseStat ?? mods.finalDefenseStrength, isBase: true },
                ...(improvementDefenseBonus !== 0 ? [{ label: 'Improvement (fort/city/village)', value: improvementDefenseBonus, pct: true }] : []),
                ...(wallDefenseBonus !== 0 ? [{ label: 'Wall defense', value: wallDefenseBonus, pct: true }] : []),
                ...(braceDefenseBonus !== 0 ? [{ label: 'Brace', value: braceDefenseBonus, pct: true }] : []),
                ...(situationalDefenseModifier !== 0 ? [{ label: 'Situational (terrain/doctrine)', value: situationalDefenseModifier, pct: true }] : []),
                ...(synergyDefenseModifier !== 0 ? [{ label: 'Synergy defense', value: synergyDefenseModifier, pct: true }] : []),
                { label: 'FINAL DEF', value: mods.finalDefenseStrength, isFinal: true },
              ]}
            />
          </section>

          <section className="cd-section">
            <h3 className="cd-section__title">Damage</h3>
            <div className="cd-damage-grid">
              <div className="cd-damage-block cd-damage-block--dealt">
                <span className="cd-damage-block__label">To Defender</span>
                <span className="cd-damage-block__value">{event.defenderDamage}</span>
                <span className="cd-damage-block__formula">
                  max(3, {mods.finalAttackStrength} - floor({mods.finalDefenseStrength} / 3))
                  {damageVarianceMultiplier > 0 && <> x {damageVarianceMultiplier.toFixed(2)} (variance)</>}
                </span>
              </div>
              <div className="cd-damage-block cd-damage-block--taken">
                <span className="cd-damage-block__label">Retaliation</span>
                <span className="cd-damage-block__value">{event.attackerDamage}</span>
                {event.attackerDamage > 0 && (
                  <span className="cd-damage-block__formula">
                    max(1, floor({mods.finalDefenseStrength} x 0.6) - floor({attacker?.baseStat ?? 0} / 3))
                    {retaliationVarianceMultiplier > 0 && <> x {retaliationVarianceMultiplier.toFixed(2)}</>}
                  </span>
                )}
              </div>
            </div>
          </section>

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
              <p className="cd-knockback">Knocked back {breakdown.outcome.knockbackDistance ?? 0} hex{(breakdown.outcome.knockbackDistance ?? 0) > 1 ? 'es' : ''}</p>
            )}
            {(moraleAttackerDelta !== 0 || moraleDefenderDelta !== 0) && (
              <div className="cd-morale">
                <span>
                  Morale - attacker:{' '}
                  <span className={moraleAttackerDelta >= 0 ? 'cd-morale--gain' : 'cd-morale--loss'}>
                    {moraleAttackerDelta >= 0 ? '+' : ''}{moraleAttackerDelta.toFixed(1)}
                  </span>
                  {' · '}defender:{' '}
                  <span className={moraleDefenderDelta >= 0 ? 'cd-morale--gain' : 'cd-morale--loss'}>
                    {moraleDefenderDelta >= 0 ? '+' : ''}{moraleDefenderDelta.toFixed(1)}
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

function UnitSnapshot({
  unit,
  fallbackName,
  label,
  side,
}: {
  unit: ExtendedUnitBreakdown;
  fallbackName: string;
  label: string;
  side: 'attacker' | 'defender';
}) {
  return (
    <div className={`cd-unit cd-unit--${side}`}>
      <span className="cd-unit__label">{label}</span>
      <span className="cd-unit__name">{unit.prototypeName ?? fallbackName}</span>
      {unit.terrain && <span className="cd-unit__terrain">Terrain: {unit.terrain}</span>}
      {(typeof unit.hpBefore === 'number' && typeof unit.hpAfter === 'number' && typeof unit.maxHp === 'number') && (
        <span className="cd-unit__hp">
          HP: {unit.hpBefore} &rarr; {unit.hpAfter} / {unit.maxHp}
        </span>
      )}
      {typeof unit.baseStat === 'number' && <span className="cd-unit__base-stat">Base stat: {unit.baseStat}</span>}
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
