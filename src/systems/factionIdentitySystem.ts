import type { GameState } from '../game/types.js';
import type { Faction } from '../features/factions/types.js';
import type { Unit } from '../features/units/types.js';
import type { TerrainDef } from '../data/registry/types.js';
import { getHexesInRange } from '../core/grid.js';
import { getUnitAtHex } from './occupancySystem.js';
import { isWaterTerrain, isRiverStealthTerrain, isWetlandTerrain } from './terrainUtils.js';

const POOR_TERRAINS = new Set(['tundra', 'desert', 'hill', 'river', 'coast']);
const OPEN_GROUND_TERRAINS = new Set(['plains', 'savannah']);
const CHARGE_MOMENTUM_TERRAINS = new Set(['savannah', 'plains']);

export { isWaterTerrain, isRiverStealthTerrain };

export function isPoorTerrain(terrainId: string | undefined): boolean {
  return terrainId ? POOR_TERRAINS.has(terrainId) : false;
}

export function getFactionForUnit(state: GameState, unit: Unit): Faction | undefined {
  return state.factions.get(unit.factionId);
}

const ROUGH_TERRAINS = new Set(['forest', 'jungle', 'hill', 'tundra', 'desert']);

export function getHealingBonus(faction: Faction | undefined, terrainId: string): number {
  const passive = faction?.identityProfile.passiveTrait;
  if (passive === 'healing_druids') {
    if (terrainId === 'forest') return 2;
    if (ROUGH_TERRAINS.has(terrainId)) return 2;
    return 1;
  }
  return 0;
}

export function getMovementCostModifier(
  faction: Faction | undefined,
  originTerrainId: string,
  targetTerrainId: string
): number {
  const passive = faction?.identityProfile.passiveTrait;

  if (passive === 'river_assault' && isWaterTerrain(targetTerrainId)) {
    return -2;
  }

  if (passive === 'greedy' && (targetTerrainId === 'coast' || targetTerrainId === 'ocean')) {
    return -1;
  }

  if (passive === 'foraging_riders' && OPEN_GROUND_TERRAINS.has(targetTerrainId)) {
    return -1;
  }

  if (passive === 'healing_druids' && targetTerrainId === 'forest') {
    return -1;
  }

  if (passive === 'jungle_stalkers' && targetTerrainId === 'jungle') {
    return -2;
  }

  if (passive === 'jungle_stalkers' && (targetTerrainId === 'forest' || targetTerrainId === 'swamp')) {
    return -1;
  }

  if (passive === 'cold_hardened_growth' && targetTerrainId === 'tundra') {
    return -1;
  }

  if (passive === 'charge_momentum' && CHARGE_MOMENTUM_TERRAINS.has(targetTerrainId)) {
    return -1;
  }

  if (passive === 'hill_engineering' && targetTerrainId === 'hill') {
    return -1;
  }

  if (passive === 'river_assault' && ROUGH_MOVEMENT_TERRAINS.has(targetTerrainId)) {
    return -1;
  }

  return 0;
}

export function getCombatAttackModifier(
  faction: Faction | undefined,
  attackerTerrain: TerrainDef | undefined,
  defenderTerrain: TerrainDef | undefined
): number {
  const passive = faction?.identityProfile.passiveTrait;
  const attackerTerrainId = attackerTerrain?.id ?? '';
  const defenderTerrainId = defenderTerrain?.id ?? '';

  if (passive === 'charge_momentum' && CHARGE_MOMENTUM_TERRAINS.has(attackerTerrainId)) {
    return 0.15;
  }

  if (passive === 'river_assault' && isWaterTerrain(attackerTerrainId)) {
    return 0.1;
  }

  if (passive === 'greedy' && (attackerTerrainId === 'coast' || attackerTerrainId === 'ocean')) {
    return 0.15;
  }

  if (passive === 'jungle_stalkers' && (attackerTerrainId === 'jungle' || attackerTerrainId === 'forest')) {
    return 0.15;
  }

  if (passive === 'foraging_riders' && OPEN_GROUND_TERRAINS.has(attackerTerrainId)) {
    return 0.15;
  }

  if (passive === 'hill_engineering' && attackerTerrainId === 'hill') {
    return 0.25;
  }

  if (passive === 'healing_druids' && attackerTerrainId === 'forest') {
    return 0.15;
  }

  if (passive === 'cold_hardened_growth' && attackerTerrainId === 'tundra') {
    return 0;
  }

  if (passive === 'desert_logistics' && attackerTerrainId === 'desert') {
    return 0.10;
  }

  return 0;
}

export function getCombatDefenseModifier(
  faction: Faction | undefined,
  defenderTerrain: TerrainDef | undefined
): number {
  const passive = faction?.identityProfile.passiveTrait;
  const terrainId = defenderTerrain?.id ?? '';

  if (passive === 'foraging_riders' && OPEN_GROUND_TERRAINS.has(terrainId)) {
    return 0.2;
  }

  if (passive === 'hill_engineering' && ROUGH_TERRAINS.has(terrainId)) {
    return terrainId === 'hill' ? 0.15 : 0.1;
  }

  if (passive === 'healing_druids' && ROUGH_TERRAINS.has(terrainId)) {
    return terrainId === 'forest' ? 0.1 : 0.05;
  }

  if (passive === 'cold_hardened_growth' && terrainId === 'tundra') {
    return 0.1;
  }

  if (passive === 'jungle_stalkers' && terrainId === 'jungle') {
    return 0.35;
  }

  // Jungle stalkers have guerrilla training on all rough terrain
  if (passive === 'jungle_stalkers' && (terrainId === 'forest' || terrainId === 'swamp')) {
    return 0.15;
  }

  if (passive === 'desert_logistics' && terrainId === 'desert') {
    return 0.15;
  }

  if (passive === 'charge_momentum' && CHARGE_MOMENTUM_TERRAINS.has(terrainId)) {
    return 0.15;
  }

  if (passive === 'greedy') {
    if (terrainId === 'coast' || terrainId === 'ocean') return 0.15;
    return 0.05; // pirate grit ΓÇö always a little tougher
  }

  return 0;
}

export function getEconomyProductionBonus(
  faction: Faction | undefined,
  terrainId: string
): number {
  const passive = faction?.identityProfile.passiveTrait;

  if (passive === 'cold_hardened_growth' && terrainId === 'tundra') {
    return 0.10;
  }

  if (passive === 'greedy' && (terrainId === 'coast' || terrainId === 'ocean')) {
    return 0.10;
  }

  if (passive === 'river_assault' && terrainId === 'river') {
    return 0.02;
  }

  if (passive === 'healing_druids' && ROUGH_TERRAINS.has(terrainId)) {
    return 0.04;
  }

  if (passive === 'hill_engineering' && terrainId === 'hill') {
    return 0.04;
  }

  if (passive === 'hill_engineering' && ROUGH_TERRAINS.has(terrainId)) {
    return 0.02;
  }

  if (passive === 'jungle_stalkers' && terrainId === 'jungle') {
    return 0.05;
  }

  if (passive === 'desert_logistics' && terrainId === 'desert') {
    return 0.08;
  }

  if (passive === 'foraging_riders' && OPEN_GROUND_TERRAINS.has(terrainId)) {
    return 0.04;
  }

  if (passive === 'charge_momentum' && terrainId === 'savannah') {
    return 0.10;
  }

  if (passive === 'charge_momentum' && terrainId === 'plains') {
    return 0.03;
  }

  return 0;
}

export function getEconomySupplyBonus(
  faction: Faction | undefined,
  terrainId: string
): number {
  const passive = faction?.identityProfile.passiveTrait;

  if (passive === 'desert_logistics' && terrainId === 'desert') {
    return 0.10;
  }

  if (passive === 'desert_logistics' && terrainId === 'savannah') {
    return 0.20;
  }

  if (passive === 'desert_logistics' && terrainId === 'plains') {
    return 0.20;
  }

  if (passive === 'foraging_riders' && OPEN_GROUND_TERRAINS.has(terrainId)) {
    return 0.03;
  }

  if (passive === 'charge_momentum' && terrainId === 'savannah') {
    return 0.06;
  }

  if (passive === 'charge_momentum' && terrainId === 'plains') {
    return 0;
  }

  if (passive === 'jungle_stalkers' && terrainId === 'jungle') {
    return 0.05;
  }

  if (passive === 'greedy' && (terrainId === 'coast' || terrainId === 'ocean')) {
    return 0.10;
  }

  return 0;
}

export function isUnitRiverStealthed(faction: Faction | undefined, terrainId: string): boolean {
  const passive = faction?.identityProfile.passiveTrait;
  return passive === 'river_assault' && isRiverStealthTerrain(terrainId);
}

export function getTerrainPreferenceScore(
  faction: Faction | undefined,
  terrainId: string
): number {
  if (!faction) {
    return 0;
  }

  if (terrainId === faction.identityProfile.homeBiome) {
    return 2;
  }

  const passive = faction.identityProfile.passiveTrait;
  if (passive === 'greedy' && (terrainId === 'coast' || terrainId === 'ocean')) {
    return 2;
  }
  if (passive === 'river_assault' && isRiverStealthTerrain(terrainId)) {
    return 1.5;
  }
  if (passive === 'foraging_riders' && OPEN_GROUND_TERRAINS.has(terrainId)) {
    return 1;
  }
  if (passive === 'desert_logistics' && terrainId === 'desert') {
    return 1;
  }
  if (passive === 'healing_druids' && terrainId === 'forest') {
    return 3;
  }
  if (passive === 'healing_druids' && ROUGH_TERRAINS.has(terrainId)) {
    return 1.5;
  }
  if (passive === 'jungle_stalkers' && terrainId === 'jungle') {
    return 3;
  }
  if (passive === 'jungle_stalkers' && terrainId === 'forest') {
    return 1;
  }

  if (passive === 'hill_engineering' && ROUGH_TERRAINS.has(terrainId)) {
    return 1;
  }

  if (passive === 'cold_hardened_growth' && terrainId === 'tundra') {
    return 3;
  }

  return 0;
}

/**
 * Desert Swarm (desert_logistics passive): when N+ living friendly units
 * (same faction, HP > 0) are within Chebyshev distance 2, the unit gains
 * a configurable attack bonus and defense multiplier.
 */
export interface DesertSwarmConfig {
  threshold: number;
  attackBonus: number;
  defenseMultiplier: number;
}

const DEFAULT_DESERT_SWARM_CONFIG: DesertSwarmConfig = {
  threshold: 3,
  attackBonus: 1,
  defenseMultiplier: 1.10,
};

export function getDesertSwarmBonus(
  faction: Faction | undefined,
  unit: Unit,
  state: GameState,
  config: DesertSwarmConfig = DEFAULT_DESERT_SWARM_CONFIG,
): { attackBonus: number; defenseMultiplier: number } {
  if (faction?.identityProfile.passiveTrait !== 'desert_logistics') {
    return { attackBonus: 0, defenseMultiplier: 1.0 };
  }

  const nearbyHexes = getHexesInRange(unit.position, 2);
  let friendlyCount = 0;
  for (const hex of nearbyHexes) {
    const unitId = getUnitAtHex(state, hex);
    if (unitId) {
      const nearbyUnit = state.units.get(unitId);
      if (nearbyUnit && nearbyUnit.factionId === unit.factionId && nearbyUnit.hp > 0) {
        friendlyCount++;
      }
    }
  }

  if (friendlyCount >= config.threshold) {
    return { attackBonus: config.attackBonus, defenseMultiplier: config.defenseMultiplier };
  }
  return { attackBonus: 0, defenseMultiplier: 1.0 };
}

// Phase 2 — Tribe Identity passives

const ROUGH_MOVEMENT_TERRAINS = new Set(['forest', 'jungle', 'hill', 'tundra', 'desert', 'swamp']);
const JUNGLE_STALKER_POISON_TERRAINS = new Set(['jungle', 'forest', 'swamp']);

/** river_assault passive: wetland stealth without needing river_stealth_t1 */
export function isPassiveWetlandStealth(faction: Faction | undefined): boolean {
  return faction?.identityProfile.passiveTrait === 'river_assault';
}

/** river_assault passive: +1 movement in rough terrain */
export function getRoughTerrainMovementBonus(faction: Faction | undefined, targetTerrainId: string): number {
  if (faction?.identityProfile.passiveTrait === 'river_assault' && ROUGH_MOVEMENT_TERRAINS.has(targetTerrainId)) {
    return -1;
  }
  return 0;
}

/** foraging_riders passive: war exhaustion decays 1 extra per turn */
export function getForagingRidersExhaustionBonus(faction: Faction | undefined): number {
  return faction?.identityProfile.passiveTrait === 'foraging_riders' ? 1 : 0;
}

/** foraging_riders passive: +1 movement back after kill */
export function getPursuitMovementOnKill(faction: Faction | undefined): number {
  return faction?.identityProfile.passiveTrait === 'foraging_riders' ? 1 : 0;
}

/** greedy passive: loot on kill */
export function getGreedyLootOnKill(faction: Faction | undefined): { gold: number; supplies: number } | null {
  return faction?.identityProfile.passiveTrait === 'greedy' ? { gold: 2, supplies: 1 } : null;
}

/** jungle_stalkers passive: poison stacks on attack in jungle/forest/swamp */
export function getPoisonOnAttack(faction: Faction | undefined, attackerTerrainId: string): { stacks: number } | null {
  if (faction?.identityProfile.passiveTrait === 'jungle_stalkers' && JUNGLE_STALKER_POISON_TERRAINS.has(attackerTerrainId)) {
    return { stacks: 1 };
  }
  return null;
}

/** charge_momentum passive (Savannah Lions): +15% damage when moved >= 2 hexes */
export function getChargeMomentumBonus(faction: Faction | undefined, unit: Unit): number {
  if (faction?.identityProfile.passiveTrait !== 'charge_momentum') return 0;
  const hexesMoved = unit.maxMoves - unit.movesRemaining;
  return hexesMoved >= 2 ? 0.15 : 0;
}

/** cold_hardened_growth passive (Arctic Wardens): +10% defense */
export function getColdHardenedDefense(faction: Faction | undefined): number {
  return faction?.identityProfile.passiveTrait === 'cold_hardened_growth' ? 0.1 : 0;
}
