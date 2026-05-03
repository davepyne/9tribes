// Comprehensive technology tree verification for all 9 tribes
//
// Section 1: Research domain data integrity
// Section 2: Tribe-to-domain mapping
// Section 3: Runtime wiring via buildMvpScenario
// Section 4: Research system behavior
// Section 5: Domain progression

import { describe, it, expect } from 'vitest';
import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import { createResearchState, startResearch, addResearchProgress, isNodeCompleted, getDomainTier } from '../src/systems/researchSystem';
import { getDomainProgression, getDomainTierFromProgression } from '../src/systems/domainProgression';
import civsData from '../src/content/base/civilizations.json';
import researchData from '../src/content/base/research.json';
import abilityDomainsData from '../src/content/base/ability-domains.json';
import type { MvpFactionConfig } from '../src/game/scenarios/mvp';
import { getMvpFactionConfigs } from '../src/game/scenarios/mvp';
import type { FactionId, ResearchNodeId } from '../src/types';
import type { ResearchState } from '../src/features/research/types';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const registry = loadRulesRegistry();
const factionConfigs = getMvpFactionConfigs();
const researchDomains = registry.getAllResearchDomains();
const allDomainIds = researchDomains.map((d) => d.id);

// Map of tribal IDs from civilization configs
const tribalIds = Object.keys(researchData);

// The domain ID list from research.json (all 10)
const researchDomainIds = tribalIds; // ['venom','fortress','charge','hitrun','nature_healing','camel_adaptation','tidal_warfare','river_stealth','slaving','heavy_hitter']

// Map tribe config ID -> nativeDomain
const tribeNativeDomains = new Map<string, string>();
for (const config of factionConfigs) {
  tribeNativeDomains.set(config.id, config.nativeDomain);
}

/** Build a scenario with a single tribe (fast, small map) */
function buildSingleTribeScenario(tribeId: string) {
  return buildMvpScenario(42, { registry, selectedFactionIds: [tribeId] });
}

// ---------------------------------------------------------------------------
// Section 1: Research Domain Definitions
// ---------------------------------------------------------------------------

describe('Research Domain Definitions', () => {
  describe('domain count', () => {
    it('has 10 research domains', () => {
      expect(researchDomains).toHaveLength(10);
      expect(researchDomainIds).toHaveLength(10);
    });

    it('research domain IDs match expected list', () => {
      const expected = [
        'venom', 'fortress', 'charge', 'hitrun', 'nature_healing',
        'camel_adaptation', 'tidal_warfare', 'river_stealth', 'slaving', 'heavy_hitter',
      ].sort();
      expect([...researchDomainIds].sort()).toEqual(expected);
    });
  });

  describe('node count per domain', () => {
    it('every domain has exactly 3 tier nodes (T1, T2, T3)', () => {
      for (const domain of researchDomains) {
        const nodeIds = Object.keys(domain.nodes);
        expect(nodeIds).toHaveLength(3);
        expect(domain.nodes).toHaveProperty(`${domain.id}_t1`);
        expect(domain.nodes).toHaveProperty(`${domain.id}_t2`);
        expect(domain.nodes).toHaveProperty(`${domain.id}_t3`);
      }
    });
  });

  describe('T1 node properties', () => {
    it('T1 nodes have xpCost 0, no prerequisites, and codify their domain', () => {
      for (const domain of researchDomains) {
        const t1 = domain.nodes[`${domain.id}_t1`];
        expect(t1, `T1 missing for ${domain.id}`).toBeDefined();
        expect(t1!.xpCost, `T1 xpCost for ${domain.id}`).toBe(0);
        expect(t1!.prerequisites ?? [], `T1 prerequisites for ${domain.id}`).toEqual([]);
        expect(t1!.codifies ?? [], `T1 codifies for ${domain.id}`).toContain(domain.id);
      }
    });

    it('T1 nodes have their domain in codifies array', () => {
      for (const domain of researchDomains) {
        const t1 = domain.nodes[`${domain.id}_t1`];
        expect(t1!.codifies).toBeDefined();
        expect(t1!.codifies).toContain(domain.id);
      }
    });
  });

  describe('T2 node properties', () => {
    it('T2 nodes have xpCost 60 and require T1', () => {
      for (const domain of researchDomains) {
        const t2 = domain.nodes[`${domain.id}_t2`];
        expect(t2, `T2 missing for ${domain.id}`).toBeDefined();
        expect(t2!.xpCost, `T2 xpCost for ${domain.id}`).toBe(60);
        expect(t2!.prerequisites ?? [], `T2 prerequisites for ${domain.id}`).toEqual([`${domain.id}_t1`]);
      }
    });
  });

  describe('T3 node properties', () => {
    it('T3 nodes have xpCost 100 and require T2', () => {
      for (const domain of researchDomains) {
        const t3 = domain.nodes[`${domain.id}_t3`];
        expect(t3, `T3 missing for ${domain.id}`).toBeDefined();
        expect(t3!.xpCost, `T3 xpCost for ${domain.id}`).toBe(100);
        expect(t3!.prerequisites ?? [], `T3 prerequisites for ${domain.id}`).toEqual([`${domain.id}_t2`]);
      }
    });
  });

  describe('node domain/tier metadata', () => {
    it('node domain field matches parent domain id', () => {
      for (const domain of researchDomains) {
        for (const suffix of ['_t1', '_t2', '_t3']) {
          const nodeId = `${domain.id}${suffix}`;
          const node = domain.nodes[nodeId];
          expect(node, `node ${nodeId} missing`).toBeDefined();
          expect(node!.domain, `node ${nodeId} domain`).toBe(domain.id);
        }
      }
    });

    it('node tier field matches tier number', () => {
      const tierMap = { _t1: 1, _t2: 2, _t3: 3 };
      for (const domain of researchDomains) {
        for (const [suffix, expectedTier] of Object.entries(tierMap)) {
          const nodeId = `${domain.id}${suffix}`;
          const node = domain.nodes[nodeId];
          expect(node, `node ${nodeId} missing`).toBeDefined();
          expect(node!.tier, `node ${nodeId} tier`).toBe(expectedTier);
        }
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Section 2: Tribe-to-Domain Mapping
// ---------------------------------------------------------------------------

describe('Tribe-to-Domain Mapping', () => {
  it('has exactly 9 tribes', () => {
    expect(factionConfigs).toHaveLength(9);
    expect(tribeNativeDomains.size).toBe(9);
  });

  it('all 9 tribes have a valid nativeDomain (exists in research.json)', () => {
    for (const config of factionConfigs) {
      const nativeDomain = config.nativeDomain;
      expect(nativeDomain, `${config.id} missing nativeDomain`).toBeTruthy();
      const domainDef = registry.getResearchDomain(nativeDomain);
      expect(domainDef, `${config.id} nativeDomain "${nativeDomain}" not found in research`).toBeDefined();
      expect(domainDef!.id).toBe(nativeDomain);
    }
  });

  it('each nativeDomain maps to exactly one tribe (1:1)', () => {
    // Collect nativeDomain per tribe
    const domainToTribe = new Map<string, string[]>();
    for (const config of factionConfigs) {
      const list = domainToTribe.get(config.nativeDomain) ?? [];
      list.push(config.id);
      domainToTribe.set(config.nativeDomain, list);
    }
    // Every research domain that is a nativeDomain should map to exactly one tribe
    for (const [domain, tribes] of domainToTribe) {
      expect(tribes, `domain "${domain}" assigned to multiple tribes: ${tribes.join(', ')}`).toHaveLength(1);
    }
    // Verify tidal_warfare is not a nativeDomain for any tribe
    expect(domainToTribe.has('tidal_warfare')).toBe(false);
  });

  it('tribes with startingLearnedDomains have those domains listed in faction config', () => {
    const hillEngineers = factionConfigs.find((c) => c.id === 'hill_clan');
    expect(hillEngineers).toBeDefined();
    expect(hillEngineers!.startingLearnedDomains).toBeDefined();
    expect(hillEngineers!.startingLearnedDomains).toContain('fortification');

    const pirateLords = factionConfigs.find((c) => c.id === 'coral_people');
    expect(pirateLords).toBeDefined();
    expect(pirateLords!.startingLearnedDomains).toBeDefined();
    expect(pirateLords!.startingLearnedDomains).toContain('seafaring');

    // Verify these are NOT research domains (capability-only domains)
    expect(registry.getResearchDomain('fortification')).toBeUndefined();
    expect(registry.getResearchDomain('seafaring')).toBeUndefined();
  });

  it('all research domains have an entry in ability-domains.json', () => {
    const abilityDomainIds = Object.keys(abilityDomainsData.domains);
    for (const researchDomainId of researchDomainIds) {
      expect(
        abilityDomainIds,
        `Research domain "${researchDomainId}" not found in ability-domains.json`,
      ).toContain(researchDomainId);
    }
    // All 10 research domains should be present
    expect(abilityDomainIds.length).toBeGreaterThanOrEqual(10);
  });

  it('each research domain in ability-domains has a valid nativeFaction', () => {
    const validTribes = new Set(factionConfigs.map((c) => c.id));
    for (const [domainId, domainEntry] of Object.entries(abilityDomainsData.domains)) {
      const nativeFaction = (domainEntry as { nativeFaction?: string }).nativeFaction;
      expect(nativeFaction, `domain "${domainId}" missing nativeFaction`).toBeTruthy();
      expect(validTribes, `domain "${domainId}" has invalid nativeFaction "${nativeFaction}"`).toContain(nativeFaction);
    }
  });
});

// ---------------------------------------------------------------------------
// Section 3: Runtime Wiring via buildMvpScenario
// ---------------------------------------------------------------------------

describe('Runtime Wiring via buildMvpScenario', () => {
  const fullScenario = buildMvpScenario(42, { registry });

  // Collect all factions from the full scenario
  const allFactions = Array.from(fullScenario.factions.values());

  it('builds a scenario with all 9 factions', () => {
    expect(allFactions).toHaveLength(9);
  });

  describe('native T1 auto-completion', () => {
    for (const faction of allFactions) {
      const nativeDomain = faction.nativeDomain;
      const research = fullScenario.research.get(faction.id);

      it(`${faction.name} gets its native T1 (${nativeDomain}_t1) auto-completed`, () => {
        expect(research, `research state missing for ${faction.id}`).toBeDefined();
        expect(research!.completedNodes).toContain(`${nativeDomain}_t1` as never);
      });
    }
  });

  it('non-native T1 nodes are NOT auto-completed', () => {
    // Use Jungle Clans (native: venom) as reference
    const state = buildSingleTribeScenario('jungle_clan');
    const faction = Array.from(state.factions.values())[0]!;
    const research = state.research.get(faction.id)!;

    // Jungle Clans' native is venom, so venom_t1 should be completed
    expect(research.completedNodes).toContain('venom_t1' as never);

    // But fortress_t1 (Hill Engineers' native) should NOT be completed
    expect(research.completedNodes).not.toContain('fortress_t1' as never);
    // charge_t1 (Savannah Lions' native) should NOT be completed
    expect(research.completedNodes).not.toContain('charge_t1' as never);
    // hitrun_t1 (Steppe Riders' native) should NOT be completed
    expect(research.completedNodes).not.toContain('hitrun_t1' as never);
  });

  describe('startingLearnedDomains behavior', () => {
    it("Hill Engineers learn fortification domain but no fortification research nodes exist", () => {
      const state = buildSingleTribeScenario('hill_clan');
      const faction = Array.from(state.factions.values())[0]!;
      const research = state.research.get(faction.id);

      // fortification should be in learnedDomains
      expect(faction.learnedDomains).toContain('fortification');

      // Verify no fortification research domain exists
      expect(registry.getResearchDomain('fortification')).toBeUndefined();

      // getDomainTier should return 0 for fortification (no research nodes)
      const tier = getDomainTier(faction, 'fortification', research?.completedNodes.map(String) ?? []);
      expect(tier).toBe(0);
    });

    it("Pirate Lords learn seafaring domain but no seafaring research nodes exist", () => {
      const state = buildSingleTribeScenario('coral_people');
      const faction = Array.from(state.factions.values())[0]!;
      const research = state.research.get(faction.id);

      // seafaring should be in learnedDomains
      expect(faction.learnedDomains).toContain('seafaring');

      // Verify no seafaring research domain exists
      expect(registry.getResearchDomain('seafaring')).toBeUndefined();

      // getDomainTier should return 0 for seafaring (no research nodes)
      const tier = getDomainTier(faction, 'seafaring', research?.completedNodes.map(String) ?? []);
      expect(tier).toBe(0);
    });
  });

  describe('learnedDomains composition', () => {
    it('faction learnedDomains includes nativeDomain + startingLearnedDomains', () => {
      // Hill Engineers: nativeDomain='fortress', startingLearnedDomains=['fortification']
      const hillConfig = factionConfigs.find((c) => c.id === 'hill_clan')!;
      const state = buildSingleTribeScenario('hill_clan');
      const faction = Array.from(state.factions.values())[0]!;

      expect(faction.learnedDomains).toContain(hillConfig.nativeDomain);
      for (const d of hillConfig.startingLearnedDomains ?? []) {
        expect(faction.learnedDomains).toContain(d);
      }
      // Should have exactly 2 learned domains (no extras)
      expect(faction.learnedDomains.length).toBe(
        1 + (hillConfig.startingLearnedDomains?.length ?? 0),
      );
    });

    it("Pirate Lords learnedDomains includes slaving + seafaring", () => {
      const state = buildSingleTribeScenario('coral_people');
      const faction = Array.from(state.factions.values())[0]!;
      expect(faction.learnedDomains).toContain('slaving');
      expect(faction.learnedDomains).toContain('seafaring');
      expect(faction.learnedDomains.length).toBe(2);
    });

    it("most tribes have exactly 1 learned domain (nativeDomain only)", () => {
      // Tribes without startingLearnedDomains should have only their native domain
      const singleDomainTribes = ['jungle_clan', 'druid_circle', 'steppe_clan',
        'desert_nomads', 'savannah_lions', 'river_people', 'frost_wardens'];

      for (const tribeId of singleDomainTribes) {
        const state = buildSingleTribeScenario(tribeId);
        const faction = Array.from(state.factions.values())[0]!;
        expect(
          faction.learnedDomains.length,
          `${tribeId} should have exactly 1 learned domain (native only), got: ${faction.learnedDomains.join(', ')}`,
        ).toBe(1);
        // Verify it's their nativeDomain
        expect(faction.learnedDomains[0]).toBe(faction.nativeDomain);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Section 4: Research System Behavior
// ---------------------------------------------------------------------------

describe('Research System Behavior', () => {
  describe('startResearch validation', () => {
    it('startResearch rejects locked domains', () => {
      // Create a state where only 'venom' is learned
      const state = createResearchState('jungle_clan' as FactionId, 'venom');
      // Attempt to research fortress_t1 — fortress is not in learnedDomains
      const result = startResearch(state, 'fortress_t1' as ResearchNodeId, [], ['venom']);
      // State should be unchanged (activeNodeId remains null)
      expect(result.activeNodeId).toBeNull();
      expect(result.completedNodes).toEqual(state.completedNodes);
    });

    it('startResearch rejects if prerequisites not met', () => {
      // Create state with no completed nodes
      const state: ResearchState = {
        factionId: 'test' as FactionId,
        activeNodeId: null,
        progressByNodeId: {},
        completedNodes: [],
        researchPerTurn: 4,
      };
      // Try to research venom_t2 (requires venom_t1) but venom_t1 is not completed
      const result = startResearch(state, 'venom_t2' as ResearchNodeId, ['venom_t1'], ['venom']);
      expect(result.activeNodeId).toBeNull();
      expect(result.completedNodes).toEqual([]);
    });

    it('startResearch accepts if prerequisites met and domain unlocked', () => {
      // Create state with venom_t1 completed
      const state: ResearchState = {
        factionId: 'test' as FactionId,
        activeNodeId: null,
        progressByNodeId: {},
        completedNodes: ['venom_t1' as ResearchNodeId],
        researchPerTurn: 4,
      };
      // venom_t2 requires venom_t1 (which is completed) and domain 'venom' is unlocked
      const result = startResearch(state, 'venom_t2' as ResearchNodeId, ['venom_t1'], ['venom']);
      expect(result.activeNodeId).toBe('venom_t2');
    });

    it('startResearch rejects already-completed nodes', () => {
      // Create state with venom_t2 already completed
      const state: ResearchState = {
        factionId: 'test' as FactionId,
        activeNodeId: null,
        progressByNodeId: {},
        completedNodes: ['venom_t1' as ResearchNodeId, 'venom_t2' as ResearchNodeId],
        researchPerTurn: 4,
      };
      // Try to start venom_t2 again — should reject
      const result = startResearch(state, 'venom_t2' as ResearchNodeId, ['venom_t1'], ['venom']);
      expect(result.completedNodes).toContain('venom_t2' as never);
      // activeNodeId should remain null since node is already completed
      expect(result.activeNodeId).toBeNull();
    });

    it('startResearch is idempotent when same node already active', () => {
      const state: ResearchState = {
        factionId: 'test' as FactionId,
        activeNodeId: 'venom_t2' as ResearchNodeId,
        progressByNodeId: {},
        completedNodes: ['venom_t1' as ResearchNodeId],
        researchPerTurn: 4,
      };
      // Trying to start the same active node should return state unchanged
      const result = startResearch(state, 'venom_t2' as ResearchNodeId, ['venom_t1'], ['venom']);
      expect(result).toBe(state);
    });
  });

  describe('addResearchProgress', () => {
    it('addResearchProgress completes node when xpCost is reached', () => {
      // Start venom_t2 (60xp)
      let state: ResearchState = {
        factionId: 'test' as FactionId,
        activeNodeId: 'venom_t2' as ResearchNodeId,
        progressByNodeId: {},
        completedNodes: ['venom_t1' as ResearchNodeId],
        researchPerTurn: 4,
      };
      // Add 60 progress — should complete
      state = addResearchProgress(state, 60, 60);
      expect(isNodeCompleted(state, 'venom_t2' as ResearchNodeId)).toBe(true);
      expect(state.activeNodeId).toBeNull();
      expect(state.completedNodes).toContain('venom_t2' as never);
    });

    it('addResearchProgress does not complete when under xpCost', () => {
      // Start venom_t2 (60xp)
      let state: ResearchState = {
        factionId: 'test' as FactionId,
        activeNodeId: 'venom_t2' as ResearchNodeId,
        progressByNodeId: {},
        completedNodes: ['venom_t1' as ResearchNodeId],
        researchPerTurn: 4,
      };
      // Add only 30 progress (half of 60xp)
      state = addResearchProgress(state, 60, 30);
      expect(isNodeCompleted(state, 'venom_t2' as ResearchNodeId)).toBe(false);
      expect(state.activeNodeId).toBe('venom_t2'); // Still researching
      // Progress should be accumulated
      const progress = state.progressByNodeId['venom_t2' as ResearchNodeId] ?? 0;
      expect(progress).toBe(30);
    });

    it('addResearchProgress accumulates progress across multiple calls', () => {
      let state: ResearchState = {
        factionId: 'test' as FactionId,
        activeNodeId: 'venom_t2' as ResearchNodeId,
        progressByNodeId: {},
        completedNodes: ['venom_t1' as ResearchNodeId],
        researchPerTurn: 4,
      };
      // Add 20 progress twice (total 40)
      state = addResearchProgress(state, 60, 20);
      expect(isNodeCompleted(state, 'venom_t2' as ResearchNodeId)).toBe(false);
      state = addResearchProgress(state, 60, 20);
      expect(isNodeCompleted(state, 'venom_t2' as ResearchNodeId)).toBe(false);
      expect(state.progressByNodeId['venom_t2' as ResearchNodeId]).toBe(40);

      // Add final 20 to reach 60
      state = addResearchProgress(state, 60, 20);
      expect(isNodeCompleted(state, 'venom_t2' as ResearchNodeId)).toBe(true);
      expect(state.activeNodeId).toBeNull();
      expect(state.progressByNodeId['venom_t2' as ResearchNodeId]).toBe(60);
    });

    it('addResearchProgress is a no-op when no active node', () => {
      const state: ResearchState = {
        factionId: 'test' as FactionId,
        activeNodeId: null,
        progressByNodeId: {},
        completedNodes: ['venom_t1' as ResearchNodeId],
        researchPerTurn: 4,
      };
      const result = addResearchProgress(state, 60, 10);
      expect(result.activeNodeId).toBeNull();
      expect(result.completedNodes).toEqual(state.completedNodes);
    });
  });

  describe('T1→T2→T3 full research chain', () => {
    it('complete research chain: venom T1→T2→T3 with correct xpCosts', () => {
      // Start with T1 auto-completed (as native domain setup)
      let state: ResearchState = {
        factionId: 'test' as FactionId,
        activeNodeId: null,
        progressByNodeId: {},
        completedNodes: ['venom_t1' as ResearchNodeId],
        researchPerTurn: 4,
      };

      // Verify T1 is completed
      expect(isNodeCompleted(state, 'venom_t1' as ResearchNodeId)).toBe(true);

      // Research T2 (60xp)
      state = startResearch(state, 'venom_t2' as ResearchNodeId, ['venom_t1'], ['venom']);
      expect(state.activeNodeId).toBe('venom_t2');

      state = addResearchProgress(state, 60, 60);
      expect(isNodeCompleted(state, 'venom_t2' as ResearchNodeId)).toBe(true);
      expect(state.activeNodeId).toBeNull();

      // Research T3 (100xp)
      state = startResearch(state, 'venom_t3' as ResearchNodeId, ['venom_t2'], ['venom']);
      expect(state.activeNodeId).toBe('venom_t3');

      state = addResearchProgress(state, 100, 100);
      expect(isNodeCompleted(state, 'venom_t3' as ResearchNodeId)).toBe(true);
      expect(state.activeNodeId).toBeNull();

      // Verify all three tiers are completed
      expect(state.completedNodes).toContain('venom_t1' as never);
      expect(state.completedNodes).toContain('venom_t2' as never);
      expect(state.completedNodes).toContain('venom_t3' as never);
    });

    it('cannot research T3 without completing T2 first', () => {
      // Only T1 completed, no T2
      let state: ResearchState = {
        factionId: 'test' as FactionId,
        activeNodeId: null,
        progressByNodeId: {},
        completedNodes: ['venom_t1' as ResearchNodeId],
        researchPerTurn: 4,
      };

      // Try to start T3 directly — should fail
      state = startResearch(state, 'venom_t3' as ResearchNodeId, ['venom_t2'], ['venom']);
      expect(state.activeNodeId).toBeNull();
    });

    it('research chain works for a non-native domain when manually completed', () => {
      // Simulate a faction that learned 'fortress' via sacrifice/codification
      // Manually add fortress_t1 to simulate it being codified
      let state: ResearchState = {
        factionId: 'test' as FactionId,
        activeNodeId: null,
        progressByNodeId: {},
        completedNodes: ['fortress_t1' as ResearchNodeId],
        researchPerTurn: 4,
      };

      // Research fortress_t2
      state = startResearch(state, 'fortress_t2' as ResearchNodeId, ['fortress_t1'], ['fortress']);
      expect(state.activeNodeId).toBe('fortress_t2');

      state = addResearchProgress(state, 60, 60);
      expect(isNodeCompleted(state, 'fortress_t2' as ResearchNodeId)).toBe(true);

      // Research fortress_t3
      state = startResearch(state, 'fortress_t3' as ResearchNodeId, ['fortress_t2'], ['fortress']);
      expect(state.activeNodeId).toBe('fortress_t3');

      state = addResearchProgress(state, 100, 100);
      expect(isNodeCompleted(state, 'fortress_t3' as ResearchNodeId)).toBe(true);

      // All three completed
      expect(state.completedNodes).toContain('fortress_t1' as never);
      expect(state.completedNodes).toContain('fortress_t2' as never);
      expect(state.completedNodes).toContain('fortress_t3' as never);
    });
  });
});

// ---------------------------------------------------------------------------
// Section 5: Domain Progression
// ---------------------------------------------------------------------------

describe('Domain Progression', () => {
  // Build a full scenario to get real faction objects
  const state = buildMvpScenario(42, { registry });
  const factions = Array.from(state.factions.values());
  const jungleClans = factions.find((f) => f.nativeDomain === 'venom')!;
  const hillEngineers = factions.find((f) => f.nativeDomain === 'fortress')!;

  describe('getDomainTierFromProgression', () => {
    it('returns 0 for a domain not in learnedDomains', () => {
      // Jungle Clans don't know 'fortress' (unless they sacrifice)
      const tier = getDomainTierFromProgression(jungleClans, 'fortress');
      expect(tier).toBe(0);
    });

    it('returns 1 for native domain T1 auto-completed', () => {
      // Jungle Clans' native is venom, T1 auto-completed
      const research = state.research.get(jungleClans.id);
      expect(research).toBeDefined();
      const tier = getDomainTierFromProgression(jungleClans, 'venom', research);
      expect(tier).toBe(1);
    });

    it('returns 2 when T2 is completed', () => {
      // Build a synthetic research state with T2 completed
      const research: ResearchState = {
        factionId: jungleClans.id,
        activeNodeId: null,
        progressByNodeId: {},
        completedNodes: ['venom_t1' as ResearchNodeId, 'venom_t2' as ResearchNodeId],
        researchPerTurn: 4,
      };
      const tier = getDomainTierFromProgression(jungleClans, 'venom', research);
      expect(tier).toBe(2);
    });

    it('returns 3 when T3 is completed', () => {
      const research: ResearchState = {
        factionId: jungleClans.id,
        activeNodeId: null,
        progressByNodeId: {},
        completedNodes: [
          'venom_t1' as ResearchNodeId,
          'venom_t2' as ResearchNodeId,
          'venom_t3' as ResearchNodeId,
        ],
        researchPerTurn: 4,
      };
      const tier = getDomainTierFromProgression(jungleClans, 'venom', research);
      expect(tier).toBe(3);
    });
  });

  describe('getDomainTier (researchSystem wrapper)', () => {
    it('works for native domain with auto-completed T1', () => {
      const research = state.research.get(hillEngineers.id);
      const completed = research?.completedNodes.map(String) ?? [];
      const tier = getDomainTier(hillEngineers, 'fortress', completed);
      expect(tier).toBe(1);
    });

    it('returns 0 for capability-only domains like fortification', () => {
      const research = state.research.get(hillEngineers.id);
      const completed = research?.completedNodes.map(String) ?? [];
      const tier = getDomainTier(hillEngineers, 'fortification', completed);
      expect(tier).toBe(0);
    });

    it('returns 0 for unlearned foreign domains', () => {
      const research = state.research.get(hillEngineers.id);
      const completed = research?.completedNodes.map(String) ?? [];
      // Hill Engineers don't know 'venom'
      const tier = getDomainTier(hillEngineers, 'venom', completed);
      expect(tier).toBe(0);
    });
  });

  describe('getDomainProgression', () => {
    it('has 1 learned domain and 1 T1 domain for faction with only native T1 (no extra learnedDomains)', () => {
      // Most tribes start with exactly 1 learned domain
      // Pass the research state so the auto-completed T1 node is counted
      const research = state.research.get(jungleClans.id);
      const progression = getDomainProgression(jungleClans, research);
      expect(progression.learnedDomainCount).toBe(1);
      expect(progression.t1Domains.length).toBe(1);
      expect(progression.t2Domains.length).toBe(0);
      expect(progression.t3Domains.length).toBe(0);
    });

    it('includes native domain in t1Domains even without explicit completedNodes', () => {
      // Use the research state that has T1 auto-completed
      const research = state.research.get(jungleClans.id);
      const progression = getDomainProgression(jungleClans, research);
      expect(progression.t1Domains).toContain('venom');
      expect(progression.learnedDomainCount).toBe(1);
    });

    it('advances to mid-tier when 2 domains are learned', () => {
      // Hill Engineers have 2 learned domains: fortress + fortification
      const progression = getDomainProgression(hillEngineers);
      expect(progression.learnedDomainCount).toBe(2);
      expect(progression.canBuildMidTier).toBe(true);
      expect(progression.canBuildLateTier).toBe(false);
    });

    it('does not flag late-tier with only 2 learned domains', () => {
      const progression = getDomainProgression(hillEngineers);
      expect(progression.canBuildLateTier).toBe(false);
    });

    it('flags late-tier when 3 domains are learned', () => {
      // Create a synthetic faction with 3 learned domains
      const faction = { ...jungleClans, learnedDomains: ['venom', 'fortress', 'charge'] };
      const progression = getDomainProgression(faction);
      expect(progression.learnedDomainCount).toBe(3);
      expect(progression.canBuildLateTier).toBe(true);
      expect(progression.canBuildMidTier).toBe(true);
    });

    it('pairEligibleDomains includes all t1 domains', () => {
      const research = state.research.get(jungleClans.id);
      const progression = getDomainProgression(jungleClans, research);
      // pairEligibleDomains should match t1Domains
      expect(progression.pairEligibleDomains.sort()).toEqual(progression.t1Domains.sort());
    });

    it('emergentEligibleDomains includes all t2 domains', () => {
      const research = state.research.get(jungleClans.id);
      const progression = getDomainProgression(jungleClans, research);
      // emergentEligibleDomains should match t2Domains
      expect(progression.emergentEligibleDomains.sort()).toEqual(progression.t2Domains.sort());
    });

    it('distinguishes native from foreign T3 domains', () => {
      // Create a synthetic faction with both native and foreign T3
      const faction = {
        ...jungleClans,
        nativeDomain: 'venom',
        learnedDomains: ['venom', 'fortress'],
      };
      const research: ResearchState = {
        factionId: faction.id,
        activeNodeId: null,
        progressByNodeId: {},
        completedNodes: [
          'venom_t1' as ResearchNodeId,
          'venom_t2' as ResearchNodeId,
          'venom_t3' as ResearchNodeId,
          'fortress_t1' as ResearchNodeId,
          'fortress_t2' as ResearchNodeId,
          'fortress_t3' as ResearchNodeId,
        ],
        researchPerTurn: 4,
      };
      const progression = getDomainProgression(faction, research);
      expect(progression.nativeT3Domains).toContain('venom');
      expect(progression.foreignT3Domains).toContain('fortress');
      expect(progression.nativeT3Domains).not.toContain('fortress');
      expect(progression.foreignT3Domains).not.toContain('venom');
    });
  });
});
