import type { EnemySynergyIntel } from '../types/clientState';

export const ENCOUNTERS_TO_STUDY = 3;

export type IntelTier = 0 | 1 | 2;

export function intelTier(intel: EnemySynergyIntel | undefined): IntelTier {
  if (!intel) return 0;
  if (intel.studied || intel.encounters >= ENCOUNTERS_TO_STUDY) return 2;
  return 1;
}
