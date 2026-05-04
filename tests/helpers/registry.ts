import { loadRulesRegistry } from '../../src/data/loader/loadRulesRegistry.js';

/**
 * Shared registry singleton for tests.
 * Avoids 50+ separate loadRulesRegistry() calls at module scope.
 */
let _instance: ReturnType<typeof loadRulesRegistry> | null = null;

export function getTestRegistry() {
  if (!_instance) {
    _instance = loadRulesRegistry();
  }
  return _instance;
}
