import { describe, it, expect } from 'vitest';
import { runAudit } from '../scripts/auditSynergyCoverage.js';

/**
 * Synergy Coverage Guard (Phase 1 of synergy-primitives cleanup plan).
 *
 * After Phase 3, the audit operates on StatName/FlagName/VerbName unions
 * (the contract surface of the generic SynergyCombatResult). Each entry is
 * classified as live/dead/vestigial/orphan based on whether the dispatcher
 * writes it (via content primitives) and whether any consumer reads it via
 * the helper API (getStat/hasFlag/hasVerb/data.get/getList).
 *
 * The counts below start at the post-Phase-3 actuals. Subsequent phases that
 * fix entries should decrement the relevant constant; CI fails if a count
 * grows.
 */
const EXPECTED_COUNTS = {
  dead: 0,
  vestigial: 0,
  orphan: 0,
  live: 92,
} as const;

describe('synergy coverage audit', () => {
  it('field classification counts match EXPECTED_COUNTS', () => {
    const result = runAudit();

    expect(result.fields.length).toBe(
      EXPECTED_COUNTS.dead + EXPECTED_COUNTS.vestigial + EXPECTED_COUNTS.orphan + EXPECTED_COUNTS.live,
    );

    for (const cls of ['dead', 'vestigial', 'orphan', 'live'] as const) {
      expect(result.counts[cls], `expected ${cls} count`).toBe(EXPECTED_COUNTS[cls]);
    }
  });

  it('no primitive in content uses trigger, target, or scaling', () => {
    const result = runAudit();
    expect(result.triggerTargetScaling).toHaveLength(0);
  });

  it('no declared primitive field is silently ignored by the dispatcher', () => {
    const result = runAudit();
    expect(result.unreadFieldViolations).toHaveLength(0);
  });
});
