/**
 * Runtime validators for JSON content files loaded by the frontend.
 * Shared across modal components to avoid copy-paste divergence.
 */

// ── Types ──

export type PairSynergy = {
  id: string;
  name: string;
  domains: string[];
  description: string;
};

export type EmergentRule = {
  id: string;
  name: string;
  condition: string;
  domainSets: Record<string, string[]>;
  effect: { description: string };
};

// ── Validators ──

export function validatePairSynergiesData(data: unknown): asserts data is { pairSynergies: PairSynergy[] } {
  if (typeof data !== 'object' || data === null) {
    throw new Error('pair-synergies.json: expected an object at top level');
  }
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.pairSynergies)) {
    throw new Error('pair-synergies.json: expected "pairSynergies" to be an array');
  }
  for (let i = 0; i < obj.pairSynergies.length; i++) {
    const s = obj.pairSynergies[i];
    if (typeof s !== 'object' || s === null) {
      throw new Error(`pair-synergies.json[${i}]: expected an object`);
    }
    const entry = s as Record<string, unknown>;
    if (typeof entry.id !== 'string') throw new Error(`pair-synergies.json[${i}]: missing or invalid "id"`);
    if (typeof entry.name !== 'string') throw new Error(`pair-synergies.json[${i}]: missing or invalid "name"`);
    if (!Array.isArray(entry.domains)) throw new Error(`pair-synergies.json[${i}]: missing or invalid "domains"`);
    if (typeof entry.description !== 'string') throw new Error(`pair-synergies.json[${i}]: missing or invalid "description"`);
  }
}

export function validateEmergentRulesData(data: unknown): asserts data is { rules: EmergentRule[] } {
  if (typeof data !== 'object' || data === null) {
    throw new Error('emergent-rules.json: expected an object at top level');
  }
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.rules)) {
    throw new Error('emergent-rules.json: expected "rules" to be an array');
  }
  for (let i = 0; i < obj.rules.length; i++) {
    const r = obj.rules[i];
    if (typeof r !== 'object' || r === null) {
      throw new Error(`emergent-rules.json[${i}]: expected an object`);
    }
    const rule = r as Record<string, unknown>;
    if (typeof rule.id !== 'string') throw new Error(`emergent-rules.json[${i}]: missing or invalid "id"`);
    if (typeof rule.name !== 'string') throw new Error(`emergent-rules.json[${i}]: missing or invalid "name"`);
    if (typeof rule.condition !== 'string') throw new Error(`emergent-rules.json[${i}]: missing or invalid "condition"`);
    if (typeof rule.domainSets !== 'object' || rule.domainSets === null) {
      throw new Error(`emergent-rules.json[${i}]: missing or invalid "domainSets"`);
    }
    if (typeof rule.effect !== 'object' || rule.effect === null) {
      throw new Error(`emergent-rules.json[${i}]: missing or invalid "effect"`);
    }
    if (typeof (rule.effect as Record<string, unknown>).description !== 'string') {
      throw new Error(`emergent-rules.json[${i}]: effect missing "description"`);
    }
  }
}
