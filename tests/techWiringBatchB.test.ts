// Batch B — combat-action wiring consumption tests.
// Each test observes a combat gameplay delta (damage, HP, movement, follow-up
// strikes), not just that a doctrine flag or synergy stat was set.
import { describe, it, expect } from 'vitest';
import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { previewCombatAction } from '../src/systems/combat-action/preview';
import { applyCombatAction } from '../src/systems/combatActionSystem';
import { createResearchState } from '../src/systems/researchSystem';
import { hexToKey } from '../src/core/grid';
import type { GameState } from '../src/game/types';
import type { Unit } from '../src/features/units/types';
import type { ActiveSynergy } from '../src/systems/synergyTypes';

const registry = loadRulesRegistry();

function addNodes(state: GameState, factionId: string, nodes: string[]) {
  let research = state.research.get(factionId as never);
  if (!research) {
    research = createResearchState(factionId as never);
    state.research.set(factionId as never, research);
  }
  const newNodes = nodes.filter((n) => !research!.completedNodes.includes(n as never));
  if (newNodes.length > 0) {
    research.completedNodes = [...research.completedNodes, ...(newNodes as never[])];
  }
}

function setDomains(state: GameState, factionId: string, nativeDomain: string, learned: string[]) {
  const f = state.factions.get(factionId as never)!;
  state.factions.set(factionId as never, {
    ...f,
    nativeDomain: nativeDomain as never,
    nativeDomains: [nativeDomain as never],
    learnedDomains: learned as never,
  });
}

function setTerrain(state: GameState, pos: { q: number; r: number }, terrain: string) {
  state.map!.tiles.set(hexToKey(pos), { position: pos, terrain: terrain as never });
}

function tagProto(state: GameState, unit: Unit, addTags: string[], patch?: Record<string, unknown>) {
  const proto = state.prototypes.get(unit.prototypeId)!;
  state.prototypes.set(unit.prototypeId, {
    ...proto,
    tags: [...new Set([...(proto.tags ?? []), ...addTags])],
    ...(patch ? { derivedStats: { ...proto.derivedStats, ...patch } } : {}),
  });
}

// Isolate one unit from each of two factions, place adjacent on plains.
function duel(seed: number, atkFid: string, defFid: string, opts: { atkHp?: number; defHp?: number } = {}) {
  const state = buildMvpScenario(seed, { registry, mapMode: 'fixed' });
  const atkF = state.factions.get(atkFid as never)!;
  const defF = state.factions.get(defFid as never)!;
  const atkId = atkF.unitIds[0];
  const defId = defF.unitIds[0];
  const atkPos = { q: 8, r: 8 };
  const defPos = { q: 9, r: 8 };
  const atk = { ...state.units.get(atkId)!, position: atkPos, status: 'ready' as const, attacksRemaining: 1, movesRemaining: 1, maxMoves: 1, hp: opts.atkHp ?? 100, maxHp: opts.atkHp ?? 100 };
  const def = { ...state.units.get(defId)!, position: defPos, status: 'ready' as const, attacksRemaining: 1, movesRemaining: 1, hp: opts.defHp ?? 100, maxHp: opts.defHp ?? 100 };
  state.units = new Map([[atkId, atk], [defId, def]]);
  for (const f of state.factions.values()) f.unitIds = f.unitIds.filter((id) => id === atkId || id === defId);
  setTerrain(state, atkPos, 'plains');
  setTerrain(state, defPos, 'plains');
  state.cities = new Map();
  state.activeFactionId = atkFid as never;
  return { state, atkId, defId, atkPos, defPos };
}

describe('Batch B — Row 15: fortifiedDefenseReduction (native heavy_hitter T1)', () => {
  it('native halves a bracing target defense bonus -> more damage than foreign', () => {
    function damage(native: boolean): number {
      const { state, atkId, defId } = duel(42, 'frost_wardens', 'hill_clan');
      if (native) setDomains(state, 'frost_wardens', 'heavy_hitter', ['heavy_hitter']);
      else setDomains(state, 'frost_wardens', 'venom', ['venom', 'heavy_hitter']);
      addNodes(state, 'frost_wardens', ['heavy_hitter_t1']);
      // Big stats so the brace-defense halving moves the integer damage.
      tagProto(state, state.units.get(atkId)!, [], { role: 'melee', range: 1, attack: 30 });
      tagProto(state, state.units.get(defId)!, [], { defense: 20 });
      // Defender braces (gives it a defense bonus to reduce).
      state.units.set(defId, { ...state.units.get(defId)!, preparedAbility: 'brace' });
      const preview = previewCombatAction(state, registry, atkId, defId);
      return preview!.result.defenderDamage;
    }
    const nativeDmg = damage(true);
    const foreignDmg = damage(false);
    expect(nativeDmg).toBeGreaterThan(foreignDmg);
  });
});

describe('Batch B — Row 16: nativeBloodtrail (native hitrun T2)', () => {
  it('native gains same-turn movement after taking a wound; foreign does not', () => {
    function movesAfter(native: boolean): { moves: number; tookDamage: boolean } {
      const { state, atkId, defId } = duel(42, 'steppe_clan', 'frost_wardens', { atkHp: 60 });
      if (native) setDomains(state, 'steppe_clan', 'hitrun', ['hitrun']);
      else setDomains(state, 'steppe_clan', 'venom', ['venom', 'hitrun']);
      addNodes(state, 'steppe_clan', ['hitrun_t1', 'hitrun_t2']);
      // Force a pure-melee attacker (no ranged weapon component) so it takes
      // retaliation, and a high-defense defender so the retaliation lands.
      const atkUnit = state.units.get(atkId)!;
      const atkProto = state.prototypes.get(atkUnit.prototypeId)!;
      state.prototypes.set(atkUnit.prototypeId, {
        ...atkProto,
        componentIds: [],
        tags: (atkProto.tags ?? []).filter((t) => t !== 'ranged'),
        derivedStats: { ...atkProto.derivedStats, role: 'melee', range: 1 },
      });
      tagProto(state, state.units.get(defId)!, [], { defense: 40 });
      const preview = previewCombatAction(state, registry, atkId, defId);
      const result = applyCombatAction(state, registry, preview!);
      const atk = result.state.units.get(atkId);
      return { moves: atk?.movesRemaining ?? -1, tookDamage: preview!.result.attackerDamage > 0 };
    }
    const nativeRes = movesAfter(true);
    expect(nativeRes.tookDamage).toBe(true); // melee retaliation landed
    expect(nativeRes.moves).toBe(2); // +2 per wound, same turn
    const foreignRes = movesAfter(false);
    expect(foreignRes.moves).toBe(0); // foreign gets the bonus next turn instead
  });
});

describe('Batch B — Row 3: spikeLines charge damage (fortress T2)', () => {
  it('charging a braced fortress unit deals 1 unavoidable damage to the attacker', () => {
    function chargeBracedFortress(defenderHasT2: boolean) {
      const { state, atkId, defId } = duel(42, 'savannah_lions', 'hill_clan', { atkHp: 100, defHp: 100 });
      // Attacker: charge-capable, forcedMarch so the attack counts as a charge.
      tagProto(state, state.units.get(atkId)!, ['mounted'], { role: 'mounted', range: 1 });
      addNodes(state, 'savannah_lions', ['charge_t1']);
      // Defender: braced fortress unit.
      tagProto(state, state.units.get(defId)!, ['fortress']);
      state.units.set(defId, { ...state.units.get(defId)!, preparedAbility: 'brace' });
      if (defenderHasT2) addNodes(state, 'hill_clan', ['fortress_t2']);
      const preview = previewCombatAction(state, registry, atkId, defId);
      expect(preview!.details.isChargeAttack).toBe(true);
      const result = applyCombatAction(state, registry, preview!);
      return { atkHp: result.state.units.get(atkId)!.hp, spike: result.feedback.resolution.spikeLineChargeDamage };
    }
    const withSpikes = chargeBracedFortress(true);
    const without = chargeBracedFortress(false);
    expect(withSpikes.spike).toBe(1);
    expect(without.spike).toBe(0);
    expect(without.atkHp - withSpikes.atkHp).toBe(1);
  });
});

describe('Batch B — Row 5: phalanxDamageShare (foreign fortress T3)', () => {
  it('a fortress unit with 2+ adjacent fortress allies shares 50% of damage taken', () => {
    function fight(withPhalanx: boolean) {
      const { state, atkId, defId, defPos } = duel(42, 'savannah_lions', 'hill_clan', { defHp: 100 });
      // Defender = FOREIGN fortress T3.
      if (withPhalanx) {
        setDomains(state, 'hill_clan', 'venom', ['venom', 'fortress']);
        addNodes(state, 'hill_clan', ['fortress_t1', 'fortress_t2', 'fortress_t3']);
      }
      tagProto(state, state.units.get(defId)!, ['fortress']);
      // Two adjacent fortress allies of the defender.
      const allyIds: string[] = [];
      const allyHexes = [{ q: defPos.q + 1, r: defPos.r }, { q: defPos.q, r: defPos.r + 1 }];
      const defFaction = state.factions.get('hill_clan' as never)!;
      const baseDef = state.units.get(defId)!;
      allyHexes.forEach((hex, i) => {
        const aid = `phalanx_ally_${i}` as never;
        setTerrain(state, hex, 'plains');
        state.units.set(aid, { ...baseDef, id: aid, position: hex, hp: 100, maxHp: 100 });
        allyIds.push(aid);
      });
      state.factions.set('hill_clan' as never, { ...defFaction, unitIds: [defId, ...(allyIds as never[])] });
      const preview = previewCombatAction(state, registry, atkId, defId);
      const result = applyCombatAction(state, registry, preview!);
      return {
        defHp: result.state.units.get(defId)?.hp ?? 0,
        allyHp: result.state.units.get(allyIds[0] as never)?.hp ?? 100,
        shared: result.feedback.resolution.phalanxDamageShared,
        rawDamage: preview!.result.defenderDamage,
      };
    }
    const phalanx = fight(true);
    const control = fight(false);
    expect(phalanx.rawDamage).toBeGreaterThan(0);
    expect(phalanx.shared).toBeGreaterThan(0);
    expect(control.shared).toBe(0);
    // Defender keeps more HP under phalanx (half the damage refunded)...
    expect(phalanx.defHp).toBeGreaterThan(control.defHp);
    // ...and an adjacent ally absorbs some of it.
    expect(phalanx.allyHp).toBeLessThan(100);
  });
});

describe('Batch B — Row 10: sunderingChargeContinue (foreign charge T3)', () => {
  it('a charge kill lets the attacker strike a second enemy in range', () => {
    function chargeKill(withT3: boolean) {
      const { state, atkId, defId, defPos } = duel(42, 'frost_wardens', 'hill_clan', { defHp: 1 });
      setDomains(state, 'frost_wardens', 'venom', ['venom', 'charge']);
      tagProto(state, state.units.get(atkId)!, ['mounted'], { role: 'mounted', range: 1 });
      addNodes(state, 'frost_wardens', withT3 ? ['charge_t1', 'charge_t2', 'charge_t3'] : ['charge_t1']);
      // Second enemy adjacent to the (soon-dead) defender's hex.
      const secondHex = { q: defPos.q + 1, r: defPos.r };
      setTerrain(state, secondHex, 'plains');
      const defFaction = state.factions.get('hill_clan' as never)!;
      const secondId = 'sunder_second' as never;
      state.units.set(secondId, { ...state.units.get(defId)!, id: secondId, position: secondHex, hp: 100, maxHp: 100, preparedAbility: undefined });
      state.factions.set('hill_clan' as never, { ...defFaction, unitIds: [defId, secondId] });
      const preview = previewCombatAction(state, registry, atkId, defId);
      expect(preview!.details.isChargeAttack).toBe(true);
      const result = applyCombatAction(state, registry, preview!);
      return {
        applied: result.feedback.resolution.sunderingChargeApplied,
        secondHp: result.state.units.get(secondId)?.hp ?? 100,
      };
    }
    const sundered = chargeKill(true);
    const control = chargeKill(false);
    expect(sundered.applied).toBe(true);
    expect(sundered.secondHp).toBeLessThan(100);
    expect(control.applied).toBe(false);
    expect(control.secondHp).toBe(100);
  });
});

describe('Batch B — Row 17: Swarm Tactics formation focus-fire (hitrun+hitrun)', () => {
  const swarm: ActiveSynergy = {
    pairId: 'hitrun+hitrun',
    name: 'Swarm Tactics',
    domains: ['hitrun', 'hitrun'],
    effects: [
      { kind: 'statMod', stat: 'formationFocusBonus', op: 'set', value: 0.3 },
      { kind: 'setFlag', flag: 'formationFocusIgnoresDefense' },
    ],
  };

  it('focus bonus applies only when an ally already attacked the same target', () => {
    function damage(focusActive: boolean): number {
      const { state, atkId, defId } = duel(42, 'steppe_clan', 'hill_clan');
      const atkFaction = state.factions.get('steppe_clan' as never)!;
      state.factions.set('steppe_clan' as never, { ...atkFaction, activeNativeSelfPair: swarm });
      if (focusActive) {
        // An allied unit that already focused this target this turn.
        const allyId = 'focus_ally' as never;
        const ally = { ...state.units.get(atkId)!, id: allyId, position: { q: 7, r: 8 }, attackedTargetsThisTurn: [defId] };
        state.units.set(allyId, ally);
        state.factions.set('steppe_clan' as never, {
          ...state.factions.get('steppe_clan' as never)!,
          unitIds: [...state.factions.get('steppe_clan' as never)!.unitIds, allyId],
        });
      }
      const preview = previewCombatAction(state, registry, atkId, defId);
      return preview!.result.defenderDamage;
    }
    const focused = damage(true);
    const unfocused = damage(false);
    expect(focused).toBeGreaterThan(unfocused);
  });
});
