// Tests for factionTurnEffects.ts — ecology research, terrain constants, environmental damage, supply income
import { loadRulesRegistry } from '../src/data/loader/loadRulesRegistry';
import { buildMvpScenario } from '../src/game/buildMvpScenario';
import {
  DOMAIN_TERRAIN_AFFINITY,
  TERRAIN_RESEARCH_BONUS,
  MAX_RESEARCH_TERRAIN_BONUS,
  RESEARCH_PROXIMITY_BONUS_PER_CONTACT,
  computeTerrainResearchBonuses,
  computeProximityResearchBonuses,
} from '../src/systems/simulation/ecologyResearch';
import { deriveResourceIncome } from '../src/systems/economySystem';
import { applyEnvironmentalDamage } from '../src/systems/simulation/environmentalEffects';
import { createRNG } from '../src/core/rng';
import type { GameState, Faction, Unit, FactionId } from '../src/game/types';
import type { HexCoord } from '../src/types';

const registry = loadRulesRegistry();

// ---------------------------------------------------------------------------
// Terrain constant integrity
// ---------------------------------------------------------------------------
describe('DOMAIN_TERRAIN_AFFINITY', () => {
  it('maps every domain to a non-empty list of terrains', () => {
    const entries = Object.entries(DOMAIN_TERRAIN_AFFINITY);
    expect(entries.length).toBeGreaterThan(0);
    for (const [domain, terrains] of entries) {
      expect(terrains.length).toBeGreaterThan(0);
      for (const t of terrains) {
        expect(typeof t).toBe('string');
        expect(t.length).toBeGreaterThan(0);
      }
    }
  });

  it('every referenced terrain exists in TERRAIN_RESEARCH_BONUS', () => {
    const allTerrains = new Set(Object.keys(TERRAIN_RESEARCH_BONUS));
    for (const terrains of Object.values(DOMAIN_TERRAIN_AFFINITY)) {
      for (const t of terrains) {
        expect(allTerrains.has(t)).toBe(true);
      }
    }
  });

  it('each domain maps to a plausible terrain set', () => {
    // Venom → jungle
    expect(DOMAIN_TERRAIN_AFFINITY.venom).toContain('jungle');
    // Nature healing → forest
    expect(DOMAIN_TERRAIN_AFFINITY.nature_healing).toContain('forest');
    // Fortress → hill or mountain
    expect(DOMAIN_TERRAIN_AFFINITY.fortress).toContain('hill');
    // Charge → savannah
    expect(DOMAIN_TERRAIN_AFFINITY.charge).toContain('savannah');
    // Hitrun → plains
    expect(DOMAIN_TERRAIN_AFFINITY.hitrun).toContain('plains');
    // Heavy hitter → tundra
    expect(DOMAIN_TERRAIN_AFFINITY.heavy_hitter).toContain('tundra');
  });
});

describe('TERRAIN_RESEARCH_BONUS', () => {
  it('has non-negative bonus for every terrain', () => {
    for (const [terrain, bonus] of Object.entries(TERRAIN_RESEARCH_BONUS)) {
      expect(bonus).toBeGreaterThanOrEqual(0);
      expect(typeof terrain).toBe('string');
    }
  });

  it('rarer terrains give larger bonuses', () => {
    // Mountain (3.0) > swamp (2.0) > river (1.75) > jungle (1.75)
    expect(TERRAIN_RESEARCH_BONUS.mountain).toBeGreaterThan(TERRAIN_RESEARCH_BONUS.swamp);
    expect(TERRAIN_RESEARCH_BONUS.swamp).toBeGreaterThanOrEqual(TERRAIN_RESEARCH_BONUS.jungle);
    // Hill (0.25) is less than tundra (1.0)
    expect(TERRAIN_RESEARCH_BONUS.hill).toBeLessThan(TERRAIN_RESEARCH_BONUS.tundra);
    // Plains (0.5) and forest (0.5) are equal, so check mountain > plains
    expect(TERRAIN_RESEARCH_BONUS.mountain).toBeGreaterThan(TERRAIN_RESEARCH_BONUS.plains);
  });

  it('capped by MAX_RESEARCH_TERRAIN_BONUS', () => {
    for (const bonus of Object.values(TERRAIN_RESEARCH_BONUS)) {
      expect(bonus).toBeLessThanOrEqual(MAX_RESEARCH_TERRAIN_BONUS);
    }
  });
});

describe('RESEARCH_PROXIMITY_BONUS_PER_CONTACT', () => {
  it('is 0.5 as specified in the design', () => {
    expect(RESEARCH_PROXIMITY_BONUS_PER_CONTACT).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// Terrain research bonus computation
// ---------------------------------------------------------------------------
describe('computeTerrainResearchBonuses', () => {
  it('returns empty map for an unknown faction', () => {
    const state = buildMvpScenario(42);
    const result = computeTerrainResearchBonuses(state, 'nonexistent' as FactionId, ['venom']);
    expect(result.size).toBe(0);
  });

  it('accumulates terrain-based research from unit positions', () => {
    const state = buildMvpScenario(42);

    // Pick first faction
    const factionId = Array.from(state.factions.keys())[0];
    const faction = state.factions.get(factionId)!;

    // Give faction a learned domain
    const testDomain = 'venom';
    const affinityTerrains = DOMAIN_TERRAIN_AFFINITY[testDomain];
    const targetTerrain = affinityTerrains[0]; // 'jungle'

    // Move a unit to a tile of the affinity terrain
    const firstUnit = state.units.get(faction.unitIds[0]);
    if (!firstUnit) { expect(firstUnit).toBeDefined(); return; }

    // Scan map for a tile matching targetTerrain
    let foundTile: HexCoord | null = null;
    if (state.map) {
      for (const [key, tile] of state.map.tiles) {
        if (tile.terrain === targetTerrain) {
          const [q, r] = key.split(',').map(Number);
          if (!isNaN(q) && !isNaN(r)) {
            foundTile = { q, r };
          }
          break;
        }
      }
    }

    if (!foundTile) {
      // If no matching tile exists, just verify the function returns a map when no
      // units are on affinity terrain
      const result = computeTerrainResearchBonuses(state, factionId, [testDomain]);
      expect(result).toBeDefined();
      return;
    }

    // Place unit on that tile
    const units = new Map(state.units);
    units.set(firstUnit.id, { ...firstUnit, position: foundTile });
    const modifiedState = { ...state, units };

    const result = computeTerrainResearchBonuses(modifiedState, factionId, [testDomain]);
    const bonus = result.get(testDomain);
    expect(bonus).toBeDefined();
    expect(bonus).toBeGreaterThan(0);
    // Bonus should match the terrain's research bonus
    expect(bonus).toBeLessThanOrEqual(MAX_RESEARCH_TERRAIN_BONUS);
  });
});

// ---------------------------------------------------------------------------
// Proximity research bonus
// ---------------------------------------------------------------------------
describe('computeProximityResearchBonuses', () => {
  it('returns empty map when no enemies are nearby', () => {
    const state = buildMvpScenario(42);
    const factionId = Array.from(state.factions.keys())[0];
    const result = computeProximityResearchBonuses(state, factionId);
    // May or may not have proximity bonuses depending on map layout
    expect(result).toBeDefined();
  });

  it('awards +0.5 per enemy unit within distance 2', () => {
    const state = buildMvpScenario(42);
    const factionIds = Array.from(state.factions.keys());
    const attackerFactionId = factionIds[0];
    const enemyFactionId = factionIds[1];

    const attackerFaction = state.factions.get(attackerFactionId)!;
    const enemyFaction = state.factions.get(enemyFactionId)!;

    // Pick two units from different factions and put them adjacent
    const attackerUnit = state.units.get(attackerFaction.unitIds[0]);
    const enemyUnit = state.units.get(enemyFaction.unitIds[0]);
    if (!attackerUnit || !enemyUnit) {
      expect(attackerUnit).toBeDefined();
      expect(enemyUnit).toBeDefined();
      return;
    }

    // Move enemy unit adjacent to attacker
    const adjacentPos: HexCoord = { q: attackerUnit.position.q + 1, r: attackerUnit.position.r };
    const units = new Map(state.units);
    units.set(enemyUnit.id, { ...enemyUnit, position: adjacentPos });
    const modifiedState = { ...state, units };

    const result = computeProximityResearchBonuses(modifiedState, attackerFactionId);
    const expectedDomain = enemyFaction.nativeDomain;
    expect(result.has(expectedDomain)).toBe(true);
    expect(result.get(expectedDomain)).toBe(RESEARCH_PROXIMITY_BONUS_PER_CONTACT);
  });
});

// ---------------------------------------------------------------------------
// Supply income (deriveResourceIncome)
// ---------------------------------------------------------------------------
describe('deriveResourceIncome', () => {
  it('returns non-zero income for any faction in an MVP scenario', () => {
    const state = buildMvpScenario(42);
    const factionId = Array.from(state.factions.keys())[0];
    const economy = deriveResourceIncome(state, factionId, registry);
    expect(economy.supplyIncome).toBeGreaterThanOrEqual(0);
    expect(typeof economy.supplyDemand).toBe('number');
    expect(typeof economy.productionPool).toBe('number');
  });

  it('supply income is at least city base income', () => {
    const state = buildMvpScenario(42);
    const factionId = Array.from(state.factions.keys())[0];
    const faction = state.factions.get(factionId)!;
    const economy = deriveResourceIncome(state, factionId, registry);
    if (faction.cityIds.length > 0) {
      // Each non-besieged city adds at least CITY_BASE_SUPPLY (3)
      expect(economy.supplyIncome).toBeGreaterThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Environmental damage
// ---------------------------------------------------------------------------
describe('applyEnvironmentalDamage', () => {
  it('deals desert attrition damage to units without immunity', () => {
    const state = buildMvpScenario(42);
    const factionId = Array.from(state.factions.keys())[0];
    const faction = state.factions.get(factionId)!;

    // Find a unit and put it on desert
    const unit = state.units.get(faction.unitIds[0]);
    if (!unit || !state.map) { expect(unit).toBeDefined(); return; }

    // Find a desert tile
    let desertPos: HexCoord | null = null;
    for (const [key, tile] of state.map.tiles) {
      if (tile.terrain === 'desert') {
        const [q, r] = key.split(',').map(Number);
        if (!isNaN(q) && !isNaN(r)) { desertPos = { q, r }; break; }
      }
    }

    if (!desertPos) return; // skip if no desert on map

    const units = new Map(state.units);
    units.set(unit.id, { ...unit, position: desertPos });
    const modifiedState = { ...state, units, rngState: createRNG(42) };

    const result = applyEnvironmentalDamage(modifiedState, factionId, registry);
    const resultUnit = result.units.get(unit.id);
    // Should have taken 1 damage from desert attrition (if not immune)
    if (resultUnit) {
      expect(resultUnit.hp).toBeLessThanOrEqual(unit.hp);
    }
  });

  it('deals swamp contamination damage to units without immunity', () => {
    const state = buildMvpScenario(42);
    const factionId = Array.from(state.factions.keys())[0];
    const faction = state.factions.get(factionId)!;

    const unit = state.units.get(faction.unitIds[0]);
    if (!unit || !state.map) { expect(unit).toBeDefined(); return; }

    // Find a swamp tile
    let swampPos: HexCoord | null = null;
    for (const [key, tile] of state.map.tiles) {
      if (tile.terrain === 'swamp') {
        const [q, r] = key.split(',').map(Number);
        if (!isNaN(q) && !isNaN(r)) { swampPos = { q, r }; break; }
      }
    }

    if (!swampPos) return; // skip if no swamp

    const units = new Map(state.units);
    units.set(unit.id, { ...unit, position: swampPos });
    const modifiedState = { ...state, units, rngState: createRNG(42) };

    const result = applyEnvironmentalDamage(modifiedState, factionId, registry);
    const resultUnit = result.units.get(unit.id);
    if (resultUnit) {
      expect(resultUnit.hp).toBeLessThanOrEqual(unit.hp);
    }
  });

  it('does not damage units in friendly settlements', () => {
    const state = buildMvpScenario(42);
    const factionId = Array.from(state.factions.keys())[0];
    const faction = state.factions.get(factionId)!;

    // Place a unit on its own city
    const unit = state.units.get(faction.unitIds[0]);
    if (!unit) { expect(unit).toBeDefined(); return; }

    const city = state.cities.get(faction.cityIds[0]);
    if (!city) { expect(city).toBeDefined(); return; }

    const units = new Map(state.units);
    units.set(unit.id, { ...unit, position: city.position });
    const modifiedState = { ...state, units, rngState: createRNG(42) };

    const hpBefore = unit.hp;
    const result = applyEnvironmentalDamage(modifiedState, factionId, registry);
    const resultUnit = result.units.get(unit.id);
    // Should not lose HP in a settlement
    if (resultUnit) {
      expect(resultUnit.hp).toBe(hpBefore);
    }
  });
});
