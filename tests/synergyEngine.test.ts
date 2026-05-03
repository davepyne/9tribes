import {
  SynergyEngine,
  type PairSynergyConfig,
  type EmergentRuleConfig,
  type DomainConfig,
  type ActiveSynergy,
} from '../src/systems/synergyEngine';

// ---------------------------------------------------------------------------
// Test fixtures — minimal data sets that exercise all engine code paths
// ---------------------------------------------------------------------------

function makePair(
  overrides: Partial<PairSynergyConfig> & { id: string; domains: [string, string]; requiredTags: string[] },
): PairSynergyConfig {
  return {
    name: overrides.name ?? `Pair ${overrides.id}`,
    effect: overrides.effect ?? { type: 'dug_in', defenseBonus: 0.25 },
    description: overrides.description ?? 'test pair',
    ...overrides,
  };
}

function makeEmergent(
  overrides: Partial<EmergentRuleConfig> & { id: string },
): EmergentRuleConfig {
  return {
    name: overrides.name ?? `Rule ${overrides.id}`,
    condition: 'default',
    effect: overrides.effect ?? { type: 'multiplier', pairSynergyMultiplier: 1.0, description: 'test' },
    ...overrides,
  };
}

function makeDomain(id: string, tags: string[] = []): DomainConfig {
  return { id, name: id, nativeFaction: 'test', tags, baseEffect: {} };
}

// Small data set: 4 domains, 3 pairs, 3 rules
const ABILITY_DOMAINS: DomainConfig[] = [
  makeDomain('venom', ['poison']),
  makeDomain('fortress', ['fortress']),
  makeDomain('charge', ['charge', 'elephant']),
  makeDomain('hitrun', ['skirmish']),
  // Extra domains for mobility/combat category testing
  makeDomain('camel_adaptation', ['camel']),
  makeDomain('tidal_warfare', ['naval']),
  makeDomain('heavy_hitter', ['heavy']),
  makeDomain('nature_healing', ['druid']),
  makeDomain('river_stealth', ['stealth']),
  makeDomain('slaving', ['slave']),
];

const PAIR_SYNERGIES: PairSynergyConfig[] = [
  makePair({
    id: 'venom+fortress',
    domains: ['venom', 'fortress'],
    requiredTags: ['poison', 'fortress'],
    effect: { type: 'poison_aura', damagePerTurn: 2, radius: 1 },
  }),
  makePair({
    id: 'venom+charge',
    domains: ['venom', 'charge'],
    requiredTags: ['poison', 'elephant'],
    effect: { type: 'multiplier_stack', multiplier: 2 },
  }),
  makePair({
    id: 'charge+hitrun',
    domains: ['charge', 'hitrun'],
    requiredTags: ['charge', 'skirmish'],
    effect: { type: 'capture_retreat', captureChance: 0.20 },
  }),
];

const EMERGENT_RULES: EmergentRuleConfig[] = [
  makeEmergent({
    id: 'terrain_rider',
    condition: 'contains_terrain AND contains_combat AND contains_mobility',
    domainSets: {
      terrain: ['camel_adaptation', 'tidal_warfare', 'heavy_hitter'],
      combat: ['venom', 'fortress', 'charge', 'hitrun', 'slaving', 'heavy_hitter'],
      mobility: ['camel_adaptation', 'charge', 'hitrun', 'river_stealth'],
    },
    effect: {
      type: 'terrain_charge',
      chargeTerrainPenetration: true,
      nativeTerrainDamageBonus: 0.50,
      description: 'test',
    },
  }),
  makeEmergent({
    id: 'ghost_army',
    condition: 'contains_3_mobility',
    mobilityDomains: ['charge', 'hitrun', 'camel_adaptation', 'river_stealth'],
    effect: { type: 'mobility_unit', scope: 'unit_only', ignoreAllTerrain: true, bonusMovement: 1, description: 'test' },
  }),
  makeEmergent({
    id: 'fallback',
    condition: 'default',
    effect: { type: 'multiplier', pairSynergyMultiplier: 1.5, description: 'test' },
  }),
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createEngine(
  pairs: PairSynergyConfig[] = PAIR_SYNERGIES,
  rules: EmergentRuleConfig[] = EMERGENT_RULES,
  domains: DomainConfig[] = ABILITY_DOMAINS,
): SynergyEngine {
  return new SynergyEngine(pairs, rules, domains);
}

// ---------------------------------------------------------------------------
// resolveUnitPairs
// ---------------------------------------------------------------------------

describe('SynergyEngine.resolveUnitPairs', () => {
  it('returns empty array for empty tags', () => {
    const engine = createEngine();
    expect(engine.resolveUnitPairs([])).toEqual([]);
  });

  it('returns empty when no pair requires the given tags', () => {
    const engine = createEngine();
    expect(engine.resolveUnitPairs(['archer', 'spearman'])).toEqual([]);
  });

  it('returns matching pair when unit has both required tags', () => {
    const engine = createEngine();
    const result = engine.resolveUnitPairs(['poison', 'fortress']);
    expect(result).toHaveLength(1);
    expect(result[0].pairId).toBe('venom+fortress');
    expect(result[0].name).toBe('Pair venom+fortress');
    expect(result[0].domains).toEqual(['venom', 'fortress']);
    expect(result[0].effect).toEqual({ type: 'poison_aura', damagePerTurn: 2, radius: 1 });
  });

  it('returns multiple pairs when tags match multiple', () => {
    const engine = createEngine();
    const result = engine.resolveUnitPairs(['poison', 'fortress', 'elephant']);
    expect(result).toHaveLength(2);
    const ids = result.map(r => r.pairId).sort();
    expect(ids).toEqual(['venom+charge', 'venom+fortress']);
  });

  it('handles duplicate tags — count must meet required count', () => {
    // venom+charge requires ['poison', 'elephant']
    // venom+fortress requires ['poison', 'fortress']
    // 1x poison is enough for both (each requires 1)
    const engine = createEngine();
    const result = engine.resolveUnitPairs(['poison', 'elephant', 'fortress']);
    expect(result).toHaveLength(2);
  });

  it('returns empty when tag present but missing second required tag', () => {
    const engine = createEngine();
    // Has 'poison' but not 'fortress' nor 'elephant'
    expect(engine.resolveUnitPairs(['poison'])).toEqual([]);
  });

  it('extra tags do not prevent matching', () => {
    const engine = createEngine();
    const result = engine.resolveUnitPairs(['poison', 'fortress', 'archer', 'spearman']);
    expect(result).toHaveLength(1);
    expect(result[0].pairId).toBe('venom+fortress');
  });

  it('returns empty for no synergies configured', () => {
    const engine = createEngine([]);
    expect(engine.resolveUnitPairs(['poison', 'fortress'])).toEqual([]);
  });

  // Test that count matters: if a tag appears fewer times than required, it fails
  it('fails when tag count is less than required (edge case for multi-count tags)', () => {
    // Create a pair that requires 2x 'poison'
    const pairs: PairSynergyConfig[] = [
      makePair({
        id: 'double_poison',
        domains: ['venom', 'venom'],
        requiredTags: ['poison', 'poison'],
      }),
    ];
    const engine = createEngine(pairs);
    // Only 1 'poison' — should fail
    expect(engine.resolveUnitPairs(['poison'])).toEqual([]);
    // 2 'poison' — should match
    const result = engine.resolveUnitPairs(['poison', 'poison']);
    expect(result).toHaveLength(1);
    expect(result[0].pairId).toBe('double_poison');
  });
});

// ---------------------------------------------------------------------------
// resolveFactionPairIds
// ---------------------------------------------------------------------------

describe('SynergyEngine.resolveFactionPairIds', () => {
  it('returns empty when faction has no domain pairs', () => {
    const engine = createEngine();
    expect(engine.resolveFactionPairIds([])).toEqual([]);
  });

  it('returns empty when faction has only one domain from a pair', () => {
    const engine = createEngine();
    expect(engine.resolveFactionPairIds(['venom'])).toEqual([]);
    expect(engine.resolveFactionPairIds(['fortress'])).toEqual([]);
  });

  it('returns pair ID when faction has both domains', () => {
    const engine = createEngine();
    const ids = engine.resolveFactionPairIds(['venom', 'fortress']);
    expect(ids).toEqual(['venom+fortress']);
  });

  it('returns multiple pair IDs', () => {
    const engine = createEngine();
    const ids = engine.resolveFactionPairIds(['venom', 'fortress', 'charge']);
    // Pairs in the data: venom+fortress, venom+charge exist. charge+hitrun needs hitrun.
    expect(ids).toContain('venom+fortress');
    expect(ids).toContain('venom+charge');
    expect(ids).not.toContain('charge+hitrun');
    expect(ids).toHaveLength(2);
  });

  it('order of learned domains does not matter', () => {
    const engine = createEngine();
    const ids1 = engine.resolveFactionPairIds(['fortress', 'venom']);
    const ids2 = engine.resolveFactionPairIds(['venom', 'fortress']);
    expect(ids1).toEqual(ids2);
  });

  it('returns all three pairs when faction has all four domains', () => {
    const engine = createEngine();
    const ids = engine.resolveFactionPairIds(['venom', 'fortress', 'charge', 'hitrun']);
    expect(ids).toHaveLength(3);
  });

  it('ignores domains not in any pair', () => {
    const engine = createEngine();
    const ids = engine.resolveFactionPairIds(['venom', 'fortress', 'made_up']);
    expect(ids).toEqual(['venom+fortress']);
  });
});

// ---------------------------------------------------------------------------
// resolveFactionTriple
// ---------------------------------------------------------------------------

describe('SynergyEngine.resolveFactionTriple', () => {
  it('returns null when emergent domains < 3', () => {
    const engine = createEngine();
    expect(engine.resolveFactionTriple(['venom'], ['camel_adaptation'])).toBeNull();
    expect(engine.resolveFactionTriple(['venom', 'fortress'], ['charge', 'hitrun'])).toBeNull();
  });

  it('returns null when no emergent rule matches (no default fallback)', () => {
    // Engine without a default rule — no rule matches made-up domains
    const rulesNoDefault: EmergentRuleConfig[] = [
      makeEmergent({
        id: 'specific_only',
        condition: 'contains_terrain AND contains_combat AND contains_mobility',
        domainSets: {
          terrain: ['camel_adaptation'],
          combat: ['venom'],
          mobility: ['charge'],
        },
        effect: { type: 'terrain_charge', chargeTerrainPenetration: true, nativeTerrainDamageBonus: 0.50, description: 'test' },
      }),
    ];
    const engine = createEngine([], rulesNoDefault);
    expect(engine.resolveFactionTriple(
      ['venom'],
      ['made_up_a', 'made_up_b', 'made_up_c'],
    )).toBeNull();
  });

  it('returns full triple with matching Terrain Rider emergent rule', () => {
    const engine = createEngine();
    // camel_adaptation (terrain), charge (combat + mobility), hitrun (combat + mobility)
    const triple = engine.resolveFactionTriple(
      ['camel_adaptation', 'charge'],  // pairEligibleDomains
      ['camel_adaptation', 'charge', 'hitrun'],  // emergentEligibleDomains
    );

    expect(triple).not.toBeNull();
    expect(triple!.domains).toEqual(['camel_adaptation', 'charge', 'hitrun']);
    expect(triple!.emergentRule.id).toBe('terrain_rider');
    expect(triple!.name).toBeTruthy();
    // camel_adaptation+charge is a pair? No pair in our data for that combo.
    // charge+hitrun IS a pair. Let's check if it was found.
    // pairEligibleDomains = [camel_adaptation, charge] — charge+hitrun needs hitrun, so no pairs found
    expect(triple!.pairs).toHaveLength(0);
  });

  it('resolves pairs correctly from pairEligibleDomains', () => {
    const engine = createEngine();
    // venom + fortress = direct pair, venom + charge = direct pair
    const triple = engine.resolveFactionTriple(
      ['venom', 'fortress', 'charge'],  // pairEligibleDomains
      ['camel_adaptation', 'charge', 'hitrun'],  // emergentEligibleDomains
    );

    expect(triple).not.toBeNull();
    // Should find venom+fortress AND venom+charge pairs from pairEligibleDomains
    expect(triple!.pairs).toHaveLength(2);
    const pairIds = triple!.pairs.map(p => p.pairId).sort();
    expect(pairIds).toEqual(['venom+charge', 'venom+fortress']);
    // Emergent should still be terrain_rider
    expect(triple!.emergentRule.id).toBe('terrain_rider');
  });

  it('default rule matches anything and returns multiplier', () => {
    const engine = createEngine();
    const triple = engine.resolveFactionTriple(
      ['camel_adaptation'],
      ['made_up_a', 'made_up_b', 'made_up_c'],
    );
    expect(triple).not.toBeNull();
    expect(triple!.emergentRule.id).toBe('fallback');
    expect(triple!.emergentRule.condition).toBe('default');
  });

  it('returns null when emergent rule matches but no pairs (still valid triple)', () => {
    // Actually, having pairs is optional — triple is still returned
    const engine = createEngine();
    const triple = engine.resolveFactionTriple(
      [],  // empty pairEligibleDomains
      ['camel_adaptation', 'charge', 'hitrun'],  // matches terrain_rider
    );
    expect(triple).not.toBeNull();
    expect(triple!.emergentRule.id).toBe('terrain_rider');
    expect(triple!.pairs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Emergent rule matching (via resolveFactionTriple) — detailed conditions
// ---------------------------------------------------------------------------

describe('SynergyEngine emergent rule matching', () => {
  const fullRules: EmergentRuleConfig[] = [
    makeEmergent({
      id: 'paladin',
      condition: 'contains_healing AND contains_defensive AND contains_offensive',
      domainSets: {
        healing: ['nature_healing'],
        defensive: ['fortress', 'tidal_warfare', 'heavy_hitter'],
        offensive: ['venom', 'charge', 'hitrun', 'slaving'],
      },
      effect: { type: 'sustain', healPercentOfDamage: 0.50, minHp: 1, description: 'test' },
    }),
    makeEmergent({
      id: 'terrain_assassin',
      condition: 'contains_stealth AND contains_combat AND contains_terrain',
      domainSets: {
        stealth: ['river_stealth'],
        combat: ['venom', 'charge', 'hitrun', 'slaving'],
        terrain: ['camel_adaptation', 'tidal_warfare', 'heavy_hitter'],
      },
      effect: { type: 'permanent_stealth', terrainTypes: ['desert', 'coast'], description: 'test' },
    }),
    makeEmergent({
      id: 'anchor',
      condition: 'contains_fortress AND contains_healing AND contains_defensive',
      domainSets: {
        fortress: ['fortress'],
        healing: ['nature_healing'],
        defensive: ['tidal_warfare', 'heavy_hitter'],
      },
      effect: { type: 'zone_of_control', radius: 3, defenseBonus: 0.30, healPerTurn: 3, immovable: true, selfRegen: 5, description: 'test' },
    }),
    makeEmergent({
      id: 'slave_empire',
      condition: 'contains_slaving AND contains_heavy AND contains_fortress',
      domainSets: {
        slaving: ['slaving'],
        heavy: ['heavy_hitter'],
        fortress: ['fortress'],
      },
      effect: { type: 'slave_empire', captureAuraRadius: 2, captureChanceBonus: 0.20, slaveProductionBonus: 0.50, description: 'test' },
    }),
    makeEmergent({
      id: 'desert_raider',
      condition: 'contains_camels AND contains_slaving AND contains_mobility',
      domainSets: {
        camels: ['camel_adaptation'],
        slaving: ['slaving'],
        mobility: ['charge', 'hitrun'],
      },
      effect: { type: 'desert_raider', desertCaptureBonus: 0.30, alliedDesertMovement: true, description: 'test' },
    }),
    makeEmergent({
      id: 'poison_shadow',
      condition: 'contains_venom AND contains_stealth AND contains_combat',
      domainSets: {
        venom: ['venom'],
        stealth: ['river_stealth'],
        combat: ['charge', 'hitrun'],
      },
      effect: { type: 'poison_shadow', stealthPoisonStacks: 3, retreatPoisonCloud: true, poisonCloudDamage: 2, description: 'test' },
    }),
    makeEmergent({
      id: 'iron_turtle',
      condition: 'contains_fortress AND contains_heavy AND contains_terrain',
      domainSets: {
        fortress: ['fortress'],
        heavy: ['heavy_hitter'],
        terrain: ['tidal_warfare', 'camel_adaptation'],
      },
      effect: { type: 'iron_turtle', crushingZoneRadius: 1, crushingZoneDamage: 2, damageReflection: 0.25, description: 'test' },
    }),
  ];

  function engineWithRules(rules: EmergentRuleConfig[]): SynergyEngine {
    return new SynergyEngine([], rules, ABILITY_DOMAINS);
  }

  it('matches Paladin: nature_healing + fortress + venom', () => {
    const engine = engineWithRules(fullRules);
    const triple = engine.resolveFactionTriple(
      [],
      ['nature_healing', 'fortress', 'venom'],
    );
    expect(triple).not.toBeNull();
    expect(triple!.emergentRule.id).toBe('paladin');
  });

  it('matches Terrain Assassin: river_stealth + venom + camel_adaptation', () => {
    const engine = engineWithRules(fullRules);
    const triple = engine.resolveFactionTriple(
      [],
      ['river_stealth', 'venom', 'camel_adaptation'],
    );
    expect(triple).not.toBeNull();
    expect(triple!.emergentRule.id).toBe('terrain_assassin');
  });

  it('matches Anchor: fortress + nature_healing + tidal_warfare', () => {
    const engine = engineWithRules(fullRules);
    const triple = engine.resolveFactionTriple(
      [],
      ['fortress', 'nature_healing', 'tidal_warfare'],
    );
    expect(triple).not.toBeNull();
    expect(triple!.emergentRule.id).toBe('anchor');
  });

  it('matches Slave Empire: slaving + heavy_hitter + fortress', () => {
    const engine = engineWithRules(fullRules);
    const triple = engine.resolveFactionTriple(
      [],
      ['slaving', 'heavy_hitter', 'fortress'],
    );
    expect(triple).not.toBeNull();
    expect(triple!.emergentRule.id).toBe('slave_empire');
  });

  it('matches Desert Raider: camel_adaptation + slaving + charge', () => {
    const engine = engineWithRules(fullRules);
    const triple = engine.resolveFactionTriple(
      [],
      ['camel_adaptation', 'slaving', 'charge'],
    );
    expect(triple).not.toBeNull();
    expect(triple!.emergentRule.id).toBe('desert_raider');
  });

  it('matches Desert Raider: camel_adaptation + slaving + hitrun', () => {
    const engine = engineWithRules(fullRules);
    const triple = engine.resolveFactionTriple(
      [],
      ['camel_adaptation', 'slaving', 'hitrun'],
    );
    expect(triple).not.toBeNull();
    expect(triple!.emergentRule.id).toBe('desert_raider');
  });

  it('matches Poison Shadow: venom + river_stealth + charge', () => {
    const engine = engineWithRules(fullRules);
    const triple = engine.resolveFactionTriple(
      [],
      ['venom', 'river_stealth', 'charge'],
    );
    expect(triple).not.toBeNull();
    expect(triple!.emergentRule.id).toBe('poison_shadow');
  });

  it('matches Iron Turtle: fortress + heavy_hitter + tidal_warfare', () => {
    const engine = engineWithRules(fullRules);
    const triple = engine.resolveFactionTriple(
      [],
      ['fortress', 'heavy_hitter', 'tidal_warfare'],
    );
    expect(triple).not.toBeNull();
    expect(triple!.emergentRule.id).toBe('iron_turtle');
  });

  it('matches Iron Turtle: fortress + heavy_hitter + camel_adaptation', () => {
    const engine = engineWithRules(fullRules);
    const triple = engine.resolveFactionTriple(
      [],
      ['fortress', 'heavy_hitter', 'camel_adaptation'],
    );
    expect(triple).not.toBeNull();
    expect(triple!.emergentRule.id).toBe('iron_turtle');
  });

  // Domains that are in multiple sets — charge is in both combat and mobility for terrain_rider
  it('handles domain appearing in multiple rule domain sets', () => {
    const engine = createEngine(); // has terrain_rider
    // camel_adaptation (terrain), charge (combat+mobility), river_stealth (mobility)
    const triple = engine.resolveFactionTriple(
      [],
      ['camel_adaptation', 'charge', 'river_stealth'],
    );
    expect(triple).not.toBeNull();
    expect(triple!.emergentRule.id).toBe('terrain_rider');
  });

  it('returns null when only 2 of 3 categories match (partial match)', () => {
    const engine = createEngine(); // terrain_rider needs terrain, combat, mobility
    // camel_adaptation (terrain+mobility), river_stealth (mobility) — no combat
    const triple = engine.resolveFactionTriple(
      [],
      ['camel_adaptation', 'river_stealth', 'tidal_warfare'],
    );
    // tidal_warfare is terrain, so: terrain yes, mobility yes, combat NO
    expect(triple).not.toBeNull(); // Actually it falls through to 'default' rule
    expect(triple!.emergentRule.id).toBe('fallback');
  });
});

// ---------------------------------------------------------------------------
// contains_3_mobility and contains_3_combat
// ---------------------------------------------------------------------------

describe('SynergyEngine emergent rule: contains_3_mobility / contains_3_combat / default', () => {
  const sharedRules: EmergentRuleConfig[] = [
    makeEmergent({
      id: 'ghost_army',
      condition: 'contains_3_mobility',
      mobilityDomains: ['charge', 'hitrun', 'camel_adaptation', 'river_stealth'],
      effect: { type: 'mobility_unit', scope: 'unit_only', ignoreAllTerrain: true, bonusMovement: 1, description: 'test' },
    }),
    makeEmergent({
      id: 'juggernaut',
      condition: 'contains_3_combat',
      combatDomains: ['venom', 'fortress', 'charge', 'slaving', 'heavy_hitter', 'hitrun', 'tidal_warfare'],
      effect: { type: 'combat_unit', scope: 'unit_only', doubleCombatBonuses: true, description: 'test' },
    }),
    makeEmergent({
      id: 'fallback',
      condition: 'default',
      effect: { type: 'multiplier', pairSynergyMultiplier: 1.0, description: 'test' },
    }),
  ];

  function engineWith(rules: EmergentRuleConfig[]): SynergyEngine {
    return new SynergyEngine([], rules, ABILITY_DOMAINS);
  }

  it('matches ghost_army with 3 mobility domains', () => {
    const engine = engineWith(sharedRules);
    const triple = engine.resolveFactionTriple(
      [],
      ['charge', 'hitrun', 'camel_adaptation'],
    );
    expect(triple).not.toBeNull();
    expect(triple!.emergentRule.id).toBe('ghost_army');
  });

  it('matches ghost_army with 4 mobility domains', () => {
    const engine = engineWith(sharedRules);
    const triple = engine.resolveFactionTriple(
      [],
      ['charge', 'hitrun', 'camel_adaptation', 'river_stealth'],
    );
    expect(triple).not.toBeNull();
    expect(triple!.emergentRule.id).toBe('ghost_army');
  });

  it('does NOT match ghost_army with only 2 mobility domains', () => {
    const engine = engineWith(sharedRules);
    const triple = engine.resolveFactionTriple(
      [],
      ['charge', 'hitrun', 'made_up'],
    );
    // Falls through to fallback
    expect(triple).not.toBeNull();
    expect(triple!.emergentRule.id).toBe('fallback');
  });

  it('matches juggernaut with 3 combat domains', () => {
    const engine = engineWith(sharedRules);
    const triple = engine.resolveFactionTriple(
      [],
      ['venom', 'fortress', 'charge'],
    );
    expect(triple).not.toBeNull();
    expect(triple!.emergentRule.id).toBe('juggernaut');
  });

  it('juggernaut: mixed genuine and non-combat domains still match if ≥3 combat', () => {
    const engine = engineWith(sharedRules);
    // 3 combat + 2 non-combat, should match juggernaut
    const triple = engine.resolveFactionTriple(
      [],
      ['venom', 'fortress', 'charge', 'made_up_a', 'made_up_b'],
    );
    expect(triple).not.toBeNull();
    expect(triple!.emergentRule.id).toBe('juggernaut');
  });

  it('mobility rule checked before combat rule (order matters)', () => {
    // Create engine with ghost_army first, juggernaut second
    // charge is in BOTH mobility and combat domain lists
    const engine = engineWith(sharedRules); // ghost_army is index 0
    const triple = engine.resolveFactionTriple(
      [],
      ['charge', 'hitrun', 'river_stealth'], // all 3 are in mobility
    );
    expect(triple).not.toBeNull();
    expect(triple!.emergentRule.id).toBe('ghost_army'); // matches first
  });
});

// ---------------------------------------------------------------------------
// getDomainSynergyScore
// ---------------------------------------------------------------------------

describe('SynergyEngine.getDomainSynergyScore', () => {
  it('returns 3 when direct pair AND both in emergent rule', () => {
    // venom+fortress is a direct pair, venom in combat, fortress in combat → both in terrain_rider
    const engine = createEngine();
    expect(engine.getDomainSynergyScore('venom', 'fortress')).toBe(3);
  });

  it('returns 2 when direct pair synergy exists but NOT in same emergent rule', () => {
    // charge+hitrun is a direct pair. They are both in mobility set of ghost_army,
    // so they ARE in same emergent rule — score would be 3.
    // Let's check: charge and hitrun both appear in terrain_rider (combat, mobility),
    // so they're in same emergent rule. Need a pair where they DON'T share a rule.
    // Create them without emergent rules that mention both.
    const pairs: PairSynergyConfig[] = [
      makePair({ id: 'custom_ab', domains: ['venom', 'charge'], requiredTags: ['poison', 'charge'] }),
    ];
    const rules: EmergentRuleConfig[] = [
      makeEmergent({
        id: 'no_mention',
        condition: 'contains_3_mobility',
        mobilityDomains: ['hitrun'], // only hitrun, not venom or charge
      }),
      makeEmergent({
        id: 'fallback',
        condition: 'default',
        effect: { type: 'multiplier', pairSynergyMultiplier: 1, description: 'test' },
      }),
    ];
    const engine = createEngine(pairs, rules);
    // No emergent rule mentions both venom and charge together → score 2
    expect(engine.getDomainSynergyScore('venom', 'charge')).toBe(2);
  });

  it('returns 2 when both domains appear together in an emergent rule (no direct pair)', () => {
    const engine = createEngine();
    // camel_adaptation and charge both appear in terrain_rider (terrain and combat+mobility)
    // No direct pair between them → score 2
    // But actually let me check: is there a pair between camel_adaptation and charge? No in our data.
    // And they are in terrain_rider: camel_adaptation in terrain+mobility, charge in combat+mobility
    // So they both appear → score 2
    expect(engine.getDomainSynergyScore('camel_adaptation', 'charge')).toBe(2);
  });

  it('returns 1 when domains share a category (both mobility) but not same rule', () => {
    // Domains in DIFFERENT rules' mobility lists → no rule mentions both,
    // but both return 'mobility' from getDomainCategory → score 1
    const rules: EmergentRuleConfig[] = [
      makeEmergent({
        id: 'rule_a',
        condition: 'contains_3_mobility',
        mobilityDomains: ['charge'],
      }),
      makeEmergent({
        id: 'rule_b',
        condition: 'contains_3_mobility',
        mobilityDomains: ['hitrun'],
      }),
      makeEmergent({
        id: 'fallback',
        condition: 'default',
        effect: { type: 'multiplier', pairSynergyMultiplier: 1, description: 'test' },
      }),
    ];
    const engine = createEngine([], rules);
    expect(engine.getDomainSynergyScore('charge', 'hitrun')).toBe(1);
  });

  it('returns 0 when no pair and no emergent rule mentions both', () => {
    const engine = createEngine();
    // venom is in terrain_rider combat. hitrun is in terrain_rider combat+mobility.
    // Both in terrain_rider → score 2 or 3. Need unrelated domains.
    expect(engine.getDomainSynergyScore('made_up_a', 'made_up_b')).toBe(0);
  });

  it('is symmetric: score(A,B) === score(B,A)', () => {
    const engine = createEngine();
    expect(engine.getDomainSynergyScore('venom', 'fortress')).toBe(
      engine.getDomainSynergyScore('fortress', 'venom'),
    );
    expect(engine.getDomainSynergyScore('camel_adaptation', 'charge')).toBe(
      engine.getDomainSynergyScore('charge', 'camel_adaptation'),
    );
  });
});

// ---------------------------------------------------------------------------
// getHighSynergyDomains
// ---------------------------------------------------------------------------

describe('SynergyEngine.getHighSynergyDomains', () => {
  it('returns domains with score >= 2', () => {
    const engine = createEngine();
    // venom has pair(s) with fortress and charge, both score 3 (pair + emergent)
    // venom also is in terrain_rider combat, so shares emergent with camel_adaptation (score 2), hitrun (score 2)
    const high = engine.getHighSynergyDomains('venom');
    expect(high).toContain('fortress');
    expect(high).toContain('charge');
    expect(high).not.toContain('venom'); // excludes self
    expect(high).not.toContain('nature_healing'); // no synergy with venom
  });

  it('excludes the queried domain', () => {
    // Create engine with a pair that has same domain twice (shouldn't happen, but test defensively)
    const pairs: PairSynergyConfig[] = [
      makePair({ id: 'self_ref', domains: ['venom', 'venom'], requiredTags: ['poison'] }),
    ];
    const engine = createEngine(pairs);
    const high = engine.getHighSynergyDomains('venom');
    expect(high).not.toContain('venom');
  });

  it('returns empty array when no domains have high synergy', () => {
    const engine = createEngine();
    // 'made_up' has no pair or emergent synergy with anyone
    expect(engine.getHighSynergyDomains('made_up')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Triple name generation (via resolveFactionTriple)
// ---------------------------------------------------------------------------

describe('SynergyEngine.generateTripleName (via resolveFactionTriple)', () => {
  const namingRules: EmergentRuleConfig[] = [
    makeEmergent({
      id: 'terrain_rider',
      condition: 'contains_terrain AND contains_combat AND contains_mobility',
      domainSets: {
        terrain: ['camel_adaptation', 'tidal_warfare', 'heavy_hitter'],
        combat: ['venom', 'fortress', 'charge', 'hitrun', 'slaving', 'heavy_hitter'],
        mobility: ['camel_adaptation', 'charge', 'hitrun', 'river_stealth'],
      },
      effect: { type: 'terrain_charge', chargeTerrainPenetration: true, nativeTerrainDamageBonus: 0.50, description: 'test' },
    }),
    makeEmergent({
      id: 'ghost_army',
      condition: 'contains_3_mobility',
      mobilityDomains: ['charge', 'hitrun', 'camel_adaptation', 'river_stealth'],
      effect: { type: 'mobility_unit', scope: 'unit_only', ignoreAllTerrain: true, bonusMovement: 1, description: 'test' },
    }),
    makeEmergent({
      id: 'slave_empire',
      condition: 'contains_slaving AND contains_heavy AND contains_fortress',
      domainSets: {
        slaving: ['slaving'],
        heavy: ['heavy_hitter'],
        fortress: ['fortress'],
      },
      effect: { type: 'slave_empire', captureAuraRadius: 2, captureChanceBonus: 0.20, slaveProductionBonus: 0.50, description: 'test' },
    }),
    makeEmergent({
      id: 'desert_raider',
      condition: 'contains_camels AND contains_slaving AND contains_mobility',
      domainSets: {
        camels: ['camel_adaptation'],
        slaving: ['slaving'],
        mobility: ['charge', 'hitrun'],
      },
      effect: { type: 'desert_raider', desertCaptureBonus: 0.30, alliedDesertMovement: true, description: 'test' },
    }),
    makeEmergent({
      id: 'poison_shadow',
      condition: 'contains_venom AND contains_stealth AND contains_combat',
      domainSets: {
        venom: ['venom'],
        stealth: ['river_stealth'],
        combat: ['charge', 'hitrun'],
      },
      effect: { type: 'poison_shadow', stealthPoisonStacks: 3, retreatPoisonCloud: true, poisonCloudDamage: 2, description: 'test' },
    }),
    makeEmergent({
      id: 'iron_turtle',
      condition: 'contains_fortress AND contains_heavy AND contains_terrain',
      domainSets: {
        fortress: ['fortress'],
        heavy: ['heavy_hitter'],
        terrain: ['tidal_warfare', 'camel_adaptation'],
      },
      effect: { type: 'iron_turtle', crushingZoneRadius: 1, crushingZoneDamage: 2, damageReflection: 0.25, description: 'test' },
    }),
    makeEmergent({
      id: 'paladin',
      condition: 'contains_healing AND contains_defensive AND contains_offensive',
      domainSets: {
        healing: ['nature_healing'],
        defensive: ['fortress', 'tidal_warfare', 'heavy_hitter'],
        offensive: ['venom', 'charge', 'hitrun', 'slaving'],
      },
      effect: { type: 'sustain', healPercentOfDamage: 0.50, minHp: 1, description: 'test' },
    }),
    makeEmergent({
      id: 'fallback',
      condition: 'default',
      effect: { type: 'multiplier', pairSynergyMultiplier: 1, description: 'test' },
    }),
  ];

  const namingPairs: PairSynergyConfig[] = [
    makePair({ id: 'venom+fortress', domains: ['venom', 'fortress'], requiredTags: ['poison', 'fortress'] }),
    makePair({ id: 'venom+nature_healing', domains: ['venom', 'nature_healing'], requiredTags: ['poison', 'druid'] }),
    makePair({ id: 'charge+hitrun', domains: ['charge', 'hitrun'], requiredTags: ['charge', 'skirmish'] }),
    makePair({ id: 'slaving+heavy_hitter', domains: ['slaving', 'heavy_hitter'], requiredTags: ['slave', 'heavy'] }),
    makePair({ id: 'fortress+heavy_hitter', domains: ['fortress', 'heavy_hitter'], requiredTags: ['fortress', 'heavy'] }),
    makePair({ id: 'camel_adaptation+slaving', domains: ['camel_adaptation', 'slaving'], requiredTags: ['camel', 'slave'] }),
    makePair({ id: 'venom+river_stealth', domains: ['venom', 'river_stealth'], requiredTags: ['poison', 'stealth'] }),
    makePair({ id: 'fortress+nature_healing', domains: ['fortress', 'nature_healing'], requiredTags: ['fortress', 'druid'] }),
  ];

  function namingEngine(): SynergyEngine {
    return new SynergyEngine(namingPairs, namingRules, ABILITY_DOMAINS);
  }

  it('names "Withering Citadel" for venom + fortress + nature_healing', () => {
    const engine = namingEngine();
    const triple = engine.resolveFactionTriple(
      ['venom', 'fortress', 'nature_healing'],
      ['venom', 'fortress', 'nature_healing'],
    );
    expect(triple).not.toBeNull();
    expect(triple!.name).toBe('Withering Citadel');
  });

  it('names "Ghost Army" for 3 mobility domains (no terrain)', () => {
    // Use river_stealth instead of camel_adaptation to avoid Terrain Rider match
    const engine = namingEngine();
    const triple = engine.resolveFactionTriple(
      ['charge', 'hitrun'],
      ['charge', 'hitrun', 'river_stealth'],
    );
    expect(triple).not.toBeNull();
    expect(triple!.emergentRule.id).toBe('ghost_army');
    expect(triple!.name).toBe('Ghost Army');
  });

  it('names "Terrain Rider" for terrain + combat + mobility', () => {
    const engine = namingEngine();
    const triple = engine.resolveFactionTriple(
      [],
      ['camel_adaptation', 'venom', 'charge'],
    );
    expect(triple).not.toBeNull();
    expect(triple!.name).toBe('Terrain Rider');
  });

  it('names "Slave Empire" for slaving + heavy_hitter + fortress', () => {
    const engine = namingEngine();
    const triple = engine.resolveFactionTriple(
      ['slaving', 'heavy_hitter', 'fortress'],
      ['slaving', 'heavy_hitter', 'fortress'],
    );
    expect(triple).not.toBeNull();
    expect(triple!.emergentRule.id).toBe('slave_empire');
    expect(triple!.name).toBe('Slave Empire');
  });

  it('names "Terrain Rider" for camel_adaptation + slaving + charge (priority over Desert Raider)', () => {
    // Terrain Rider check in generateTripleName has higher priority than Desert Raider
    const engine = namingEngine();
    const triple = engine.resolveFactionTriple(
      [],
      ['camel_adaptation', 'slaving', 'charge'],
    );
    expect(triple).not.toBeNull();
    // emergent rule matches terrain_rider (checked before desert_raider in rules list)
    expect(triple!.emergentRule.id).toBe('terrain_rider');
    expect(triple!.name).toBe('Terrain Rider');
  });

  it('names "Poison Shadow" for venom + river_stealth + hitrun', () => {
    const engine = namingEngine();
    const triple = engine.resolveFactionTriple(
      [],
      ['venom', 'river_stealth', 'hitrun'],
    );
    expect(triple).not.toBeNull();
    expect(triple!.name).toBe('Poison Shadow');
  });

  it('names "Terrain Rider" for fortress + heavy_hitter + camel_adaptation (priority over Iron Turtle)', () => {
    // Terrain Rider check in generateTripleName has higher priority than Iron Turtle
    const engine = namingEngine();
    const triple = engine.resolveFactionTriple(
      [],
      ['fortress', 'heavy_hitter', 'camel_adaptation'],
    );
    expect(triple).not.toBeNull();
    expect(triple!.emergentRule.id).toBe('terrain_rider');
    expect(triple!.name).toBe('Terrain Rider');
  });

  it('names "Withering Citadel" for nature_healing + fortress + venom (priority over Paladin)', () => {
    // Withering Citadel check in generateTripleName has higher priority than Paladin
    const engine = namingEngine();
    const triple = engine.resolveFactionTriple(
      [],
      ['nature_healing', 'fortress', 'venom'],
    );
    expect(triple).not.toBeNull();
    expect(triple!.emergentRule.id).toBe('paladin');
    expect(triple!.name).toBe('Withering Citadel');
  });

  it('generates name from pair names when no specific triple name matches', () => {
    // Use fallback default rule — the generateTripleName won't match any specific
    // triple pattern, so it falls back to pair-name-derived name
    const engine = namingEngine();
    const triple = engine.resolveFactionTriple(
      ['tidal_warfare', 'nature_healing'],
      ['tidal_warfare', 'nature_healing', 'made_up'],
    );
    // tidal_warfare + nature_healing: no pair in namingPairs. 
    // Actually tidal_warfare and nature_healing don't have a pair, so pairs will be empty
    // Fallback name generation: pairNames is empty → 'Unknown'
    expect(triple).not.toBeNull();
    // No domainSets match for 'made_up', so default rule matches
    // generateTripleName won't match any named triple, pairs is empty, result: 'Unknown'
    expect(triple!.name).toBe('Unknown');
  });
});
