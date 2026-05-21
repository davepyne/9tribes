import { describe, it, expect } from 'vitest';
import { resolvePrimitives } from '../src/systems/primitiveDispatcher.js';
import { makeEmptyResult } from '../src/systems/synergyEffects.js';
import type { CombatContext, SynergyCombatResult } from '../src/systems/synergyTypes.js';
import type { PrimitiveEffect } from '../src/systems/synergyPrimitives.js';

function makeContext(overrides: Partial<CombatContext> = {}): CombatContext {
  return {
    attackerId: 'a1', defenderId: 'd1',
    attackerTags: [], defenderTags: [],
    attackerHp: 100, defenderHp: 100,
    terrain: 'plains', isCharge: false,
    isStealthAttack: false, isRetreat: false,
    isStealthed: false,
    position: { x: 0, y: 0 },
    attackerPosition: { x: 0, y: 0 },
    defenderPosition: { x: 1, y: 1 },
    attackerLearnedDomains: [],
    ...overrides,
  };
}

function resolve(effects: PrimitiveEffect[], ctx: Partial<CombatContext> = {}): SynergyCombatResult {
  const result = makeEmptyResult();
  resolvePrimitives(effects, makeContext(ctx), result);
  return result;
}

// ---------------------------------------------------------------------------
// statMod
// ---------------------------------------------------------------------------

describe('statMod', () => {
  it('adds to defense', () => {
    const r = resolve([{ kind: 'statMod', stat: 'defense', op: 'add', value: 0.75 }]);
    expect(r.getStat('defense')).toBe(0.75);
  });

  it('multiplies damage', () => {
    const r = resolve([{ kind: 'statMod', stat: 'damage', op: 'multiply', value: 2 }]);
    expect(r.getStat('damage')).toBe(0); // 0 * 2 = 0
  });

  it('multiplies non-zero damage', () => {
    const r = makeEmptyResult();
    r.stats.set('damage', 10);
    resolvePrimitives(
      [{ kind: 'statMod', stat: 'damage', op: 'multiply', value: 1.5 }],
      makeContext(), r,
    );
    expect(r.getStat('damage')).toBe(15);
  });

  it('sets multiplierStackValue', () => {
    const r = resolve([{ kind: 'statMod', stat: 'multiplierStackValue', op: 'set', value: 2 }]);
    expect(r.getStat('multiplierStackValue')).toBe(2);
  });

  it('adds to both defense and dugInDefense', () => {
    const r = resolve([
      { kind: 'statMod', stat: 'defense', op: 'add', value: 0.75 },
      { kind: 'statMod', stat: 'dugInDefense', op: 'add', value: 0.75 },
    ]);
    expect(r.getStat('defense')).toBe(0.75);
    expect(r.getStat('dugInDefense')).toBe(0.75);
  });

  it('respects condition: isCharge blocks when false', () => {
    const r = resolve([
      { kind: 'statMod', stat: 'defense', op: 'add', value: 0.5, condition: 'isCharge' },
    ]);
    expect(r.getStat('defense')).toBe(0);
  });

  it('respects condition: isCharge passes when true', () => {
    const r = resolve([
      { kind: 'statMod', stat: 'defense', op: 'add', value: 0.5, condition: 'isCharge' },
    ], { isCharge: true });
    expect(r.getStat('defense')).toBe(0.5);
  });

  it('respects condition: isWater', () => {
    const r = resolve([
      { kind: 'statMod', stat: 'coastalNomadDefense', op: 'set', value: 0.5, condition: 'isWater' },
    ], { terrain: 'coast' });
    expect(r.getStat('coastalNomadDefense')).toBe(0.5);
  });

  it('respects condition: terrain:desert', () => {
    const r = resolve([
      { kind: 'statMod', stat: 'sandstormDamage', op: 'set', value: 2, condition: 'terrain:desert' },
    ], { terrain: 'desert' });
    expect(r.getStat('sandstormDamage')).toBe(2);
  });

  it('adds to auraOverlapDefense', () => {
    const r = resolve([
      { kind: 'statMod', stat: 'defense', op: 'add', value: 0.3 },
      { kind: 'statMod', stat: 'auraOverlapDefense', op: 'add', value: 0.3 },
    ]);
    expect(r.getStat('defense')).toBe(0.3);
    expect(r.getStat('auraOverlapDefense')).toBe(0.3);
  });
});

// ---------------------------------------------------------------------------
// setFlag
// ---------------------------------------------------------------------------

describe('setFlag', () => {
  it('sets chargeShield', () => {
    const r = resolve([{ kind: 'setFlag', flag: 'chargeShield' }]);
    expect(r.hasFlag('chargeShield')).toBe(true);
  });

  it('sets antiDisplacement', () => {
    const r = resolve([{ kind: 'setFlag', flag: 'antiDisplacement' }]);
    expect(r.hasFlag('antiDisplacement')).toBe(true);
  });

  it('sets emergentUndying', () => {
    const r = resolve([{ kind: 'setFlag', flag: 'emergentUndying' }]);
    expect(r.hasFlag('emergentUndying')).toBe(true);
  });

  it('sets emergentIgnoreZoc', () => {
    const r = resolve([{ kind: 'setFlag', flag: 'emergentIgnoreZoc' }]);
    expect(r.hasFlag('emergentIgnoreZoc')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// applyStatus
// ---------------------------------------------------------------------------

describe('applyStatus', () => {
  it('applies poison stacks', () => {
    const r = resolve([{ kind: 'applyStatus', status: 'poison', stacks: 2 }]);
    expect(r.getStat('poisonStacks')).toBe(2);
  });

  it('applies stun duration', () => {
    const r = resolve([{ kind: 'applyStatus', status: 'stun', duration: 1 }]);
    expect(r.getStat('stunDuration')).toBe(1);
  });

  it('applies frostbite status', () => {
    const r = resolve([{ kind: 'applyStatus', status: 'frostbite', stacks: 2 }]);
    expect(r.statuses).toEqual([expect.objectContaining({ name: 'frostbite', stacks: 2 })]);
  });

  it('respects condition: isStealthAttack', () => {
    const r = resolve([
      { kind: 'applyStatus', status: 'poison', stacks: 3, condition: 'isStealthAttack' },
    ]);
    expect(r.getStat('poisonStacks')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// knockback
// ---------------------------------------------------------------------------

describe('knockback', () => {
  it('sets knockback distance', () => {
    const r = resolve([{ kind: 'knockback', distance: 2 }]);
    expect(r.getStat('knockbackDistance')).toBe(2);
  });

  it('takes max of multiple knockbacks', () => {
    const r = resolve([
      { kind: 'knockback', distance: 1 },
      { kind: 'knockback', distance: 3 },
    ]);
    expect(r.getStat('knockbackDistance')).toBe(3);
  });

  it('extends existing knockback', () => {
    const r = makeEmptyResult();
    r.stats.set('knockbackDistance', 2);
    resolvePrimitives(
      [{ kind: 'knockback', distance: 0, extendMultiplier: 1.5 }],
      makeContext(), r,
    );
    expect(r.getStat('knockbackDistance')).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// capture
// ---------------------------------------------------------------------------

describe('capture', () => {
  it('routes chanceBonus to chargeCaptureChance on charge', () => {
    const r = resolve(
      [{ kind: 'capture', chanceBonus: 0.3 }],
      { isCharge: true },
    );
    expect(r.getStat('chargeCaptureChance')).toBe(0.3);
  });

  it('routes chanceBonus to retreatCaptureChance on retreat', () => {
    const r = resolve(
      [{ kind: 'capture', chanceBonus: 0.15 }],
      { isRetreat: true },
    );
    expect(r.getStat('retreatCaptureChance')).toBe(0.15);
  });

  it('routes chanceBonus to stealthCaptureBonus on stealth', () => {
    const r = resolve(
      [{ kind: 'capture', chanceBonus: 0.4 }],
      { isStealthAttack: true },
    );
    expect(r.getStat('stealthCaptureBonus')).toBe(0.4);
  });

  it('sets hpThreshold', () => {
    const r = resolve([{ kind: 'capture', hpThreshold: 0.25 }]);
    expect(r.getStat('emergentCaptureBelowHpPercent')).toBe(0.25);
  });
});

// ---------------------------------------------------------------------------
// preventAction
// ---------------------------------------------------------------------------

describe('preventAction', () => {
  it('prevents displacement', () => {
    const r = resolve([{ kind: 'preventAction', action: 'displacement' }]);
    expect(r.hasFlag('antiDisplacement')).toBe(true);
  });

  it('prevents instantKill (undying)', () => {
    const r = resolve([{ kind: 'preventAction', action: 'instantKill' }]);
    expect(r.hasFlag('emergentUndying')).toBe(true);
  });

  it('prevents zoc', () => {
    const r = resolve([{ kind: 'preventAction', action: 'zoc' }]);
    expect(r.hasFlag('emergentIgnoreZoc')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// instantKill
// ---------------------------------------------------------------------------

describe('instantKill', () => {
  it('sets instantKill flag', () => {
    const r = resolve([{ kind: 'instantKill' }]);
    expect(r.hasFlag('instantKill')).toBe(true);
  });

  it('respects condition', () => {
    const r = resolve([{ kind: 'instantKill', condition: 'isStealthAttack' }]);
    expect(r.hasFlag('instantKill')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// grantVerb
// ---------------------------------------------------------------------------

describe('grantVerb', () => {
  it('grants positionSwap', () => {
    const r = resolve([{ kind: 'grantVerb', verb: 'positionSwap' }]);
    expect(r.hasVerb('positionSwap')).toBe(true);
  });

  it('setFlag sets chargeCooldownWaived', () => {
    const r = resolve([{ kind: 'setFlag', flag: 'chargeCooldownWaived' }]);
    expect(r.hasFlag('chargeCooldownWaived')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// spawnOnMap
// ---------------------------------------------------------------------------

describe('spawnOnMap', () => {
  it('spawns poison trap at attacker position', () => {
    const ctx = { attackerPosition: { x: 5, y: 3 } };
    const r = resolve(
      [{ kind: 'spawnOnMap', effectType: 'poisonTrap', position: 'attacker' }],
      ctx,
    );
    expect(r.data.get('poisonTrapPositions')).toEqual([{ x: 5, y: 3 }]);
    expect(r.getSpawns('poisonTrap').length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// projectAura (recursive)
// ---------------------------------------------------------------------------

describe('projectAura', () => {
  it('recursively dispatches inner effects', () => {
    const r = resolve([{
      kind: 'projectAura',
      radius: 2,
      effects: [
        { kind: 'statMod', stat: 'defense', op: 'add', value: 0.25 },
      ],
    }]);
    expect(r.getStat('defense')).toBe(0.25);
  });

  it('nests projectAura within projectAura', () => {
    const r = resolve([{
      kind: 'projectAura',
      radius: 3,
      effects: [
        {
          kind: 'projectAura',
          radius: 2,
          effects: [
            { kind: 'statMod', stat: 'defense', op: 'add', value: 0.5 },
          ],
        },
      ],
    }]);
    expect(r.getStat('defense')).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// modeSelect
// ---------------------------------------------------------------------------

describe('modeSelect', () => {
  it('picks bulwark when retreating', () => {
    const r = resolve([{
      kind: 'modeSelect',
      selector: 'combatContext',
      collectMode: 'pickOne',
      modes: {
        bulwark: [{ kind: 'statMod', stat: 'defense', op: 'add', value: 0.4 }],
        predator: [{ kind: 'statMod', stat: 'damage', op: 'multiply', value: 1.4 }],
        phantom: [{ kind: 'setFlag', flag: 'emergentIgnoreZoc' }],
      },
    }], { isRetreat: true });
    expect(r.getStat('defense')).toBe(0.4);
    expect(r.hasFlag('emergentIgnoreZoc')).toBe(false);
  });

  it('picks predator on charge', () => {
    const r = makeEmptyResult();
    r.stats.set('damage', 10);
    resolvePrimitives([{
      kind: 'modeSelect',
      selector: 'combatContext',
      collectMode: 'pickOne',
      modes: {
        bulwark: [{ kind: 'statMod', stat: 'defense', op: 'add', value: 0.4 }],
        predator: [{ kind: 'statMod', stat: 'damage', op: 'multiply', value: 1.4 }],
        phantom: [{ kind: 'setFlag', flag: 'emergentIgnoreZoc' }],
      },
    }], makeContext({ isCharge: true }), r);
    expect(r.getStat('damage')).toBe(14);
  });

  it('collectAll applies all modes', () => {
    const r = resolve([{
      kind: 'modeSelect',
      selector: 'domainSignature',
      collectMode: 'collectAll',
      modes: {
        venom: [{ kind: 'applyStatus', status: 'poison', stacks: 1 }],
        fortress: [{ kind: 'statMod', stat: 'damageReflection', op: 'add', value: 0.3 }],
      },
    }]);
    expect(r.getStat('poisonStacks')).toBe(1);
    expect(r.getStat('damageReflection')).toBe(0.3);
  });
});

// ---------------------------------------------------------------------------
// Composite synergy tests (matching old handler behavior)
// ---------------------------------------------------------------------------

describe('composite: dug_in', () => {
  it('adds defense to both defense and dugInDefense stats', () => {
    const r = resolve([
      { kind: 'statMod', stat: 'defense', op: 'add', value: 0.75 },
      { kind: 'statMod', stat: 'dugInDefense', op: 'add', value: 0.75 },
    ]);
    expect(r.getStat('defense')).toBe(0.75);
    expect(r.getStat('dugInDefense')).toBe(0.75);
  });
});

describe('composite: poison_aura', () => {
  it('applies poison and additionalEffects', () => {
    const r = resolve([
      { kind: 'applyStatus', status: 'poison', stacks: 2 },
    ]);
    expect(r.getStat('poisonStacks')).toBe(2);
  });
});

describe('composite: lethal_ambush', () => {
  it('kills and poisons on stealth attack', () => {
    const r = resolve([
      { kind: 'instantKill', condition: 'isStealthAttack' },
      { kind: 'applyStatus', status: 'poison', stacks: 2, condition: 'isStealthAttack' },
    ], { isStealthAttack: true });
    expect(r.hasFlag('instantKill')).toBe(true);
    expect(r.getStat('poisonStacks')).toBe(2);
  });

  it('does nothing without stealth attack', () => {
    const r = resolve([
      { kind: 'instantKill', condition: 'isStealthAttack' },
      { kind: 'applyStatus', status: 'poison', stacks: 2, condition: 'isStealthAttack' },
    ]);
    expect(r.hasFlag('instantKill')).toBe(false);
    expect(r.getStat('poisonStacks')).toBe(0);
  });
});

describe('composite: capture_charge', () => {
  it('captures and knocks back on charge', () => {
    const r = resolve([
      { kind: 'capture', chanceBonus: 0.3, condition: 'isCharge' },
      { kind: 'knockback', distance: 2, condition: 'isCharge' },
    ], { isCharge: true });
    expect(r.getStat('chargeCaptureChance')).toBe(0.3);
    expect(r.getStat('knockbackDistance')).toBe(2);
  });
});

describe('composite: heavy_fortress', () => {
  it('reflects damage and prevents displacement', () => {
    const r = resolve([
      { kind: 'statMod', stat: 'damageReflection', op: 'add', value: 0.25 },
      { kind: 'preventAction', action: 'displacement' },
    ]);
    expect(r.getStat('damageReflection')).toBe(0.25);
    expect(r.hasFlag('antiDisplacement')).toBe(true);
  });
});

describe('composite: coastal_nomad on water', () => {
  it('sets defense bonus on water terrain', () => {
    const r = resolve([
      { kind: 'statMod', stat: 'coastalNomadDefense', op: 'set', value: 0.5, condition: 'isWater' },
      { kind: 'statMod', stat: 'defense', op: 'add', value: 0.5, condition: 'isWater' },
    ], { terrain: 'coast' });
    expect(r.getStat('coastalNomadDefense')).toBe(0.5);
    expect(r.getStat('defense')).toBe(0.5);
  });
});
