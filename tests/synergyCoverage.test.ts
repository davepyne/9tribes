import { describe, it, expect } from 'vitest';
import { runAudit } from '../scripts/auditSynergyCoverage.js';

/**
 * Synergy Coverage Guard (Phase 1 of synergy-primitives cleanup plan).
 *
 * These counts start at today's actual values. Every subsequent phase that
 * fixes fields should decrement the relevant constant. CI fails if the count
 * grows — meaning a new vestigial/dead/orphan field was introduced.
 */
const EXPECTED_COUNTS = {
  dead: 0,
  vestigial: 11,
  orphan: 14,
  live: 90,
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
});
