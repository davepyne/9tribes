import type { GameState } from '../../game/types.js';
import type { RulesRegistry } from '../../data/registry/types.js';
import type { CombatActionApplyResult, CombatActionPreview } from './types.js';
import { createCombatContext, resolveDamage, processKillAndState, applyPostDamageEffects } from './resolveDamage.js';
import { processCapture, applyPostKillEffects } from './resolveCapture.js';
import { applyKnockbackAndRout, finalizeCombatState } from './resolveAftermath.js';
import { applyStatusEffects } from './resolveStatus.js';
import { buildCombatLabels, assembleResult } from './resolveLabels.js';

export function applyCombatAction(
  state: GameState,
  registry: RulesRegistry,
  preview: CombatActionPreview,
  learnChanceScale = 1,
): CombatActionApplyResult {
  const result = createCombatContext(state, registry, preview, learnChanceScale);
  if ('earlyReturn' in result) return result.earlyReturn;

  const ctx = result.ctx;

  resolveDamage(ctx);
  processKillAndState(ctx);
  applyPostDamageEffects(ctx);
  processCapture(ctx);
  applyPostKillEffects(ctx);
  applyKnockbackAndRout(ctx);
  finalizeCombatState(ctx);
  applyStatusEffects(ctx);
  buildCombatLabels(ctx);

  return assembleResult(ctx);
}
