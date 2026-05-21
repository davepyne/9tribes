// Fog of War System - Manages visibility and last seen snapshots for factions
import type { GameState } from '../game/types.js';
import type { FactionId, HexCoord, UnitId } from '../types.js';
import type { TerrainType } from '../world/map/types.js';
import { hexDistance, getHexesInRange, hexToKey, keyToHex } from '../core/grid.js';
import type { Unit } from '../features/units/types.js';
import type { Prototype } from '../features/prototypes/types.js';
import { resolveResearchDoctrine } from './capabilityDoctrine.js';
import { isUnitRiverStealthed } from './factionIdentitySystem.js';
import { resolveEffectiveSynergies } from './synergyRuntime.js';
import { isWaterTerrain } from './terrainUtils.js';
import { getUnitTransport } from './transportSystem.js';

// --- Types ---
export type HexVisibility = 'hidden' | 'explored' | 'visible';

export interface LastSeenSnapshot {
  round: number;
  terrain: TerrainType;
  unit?: { factionId: FactionId; prototypeName: string; hp: number; maxHp: number };
  city?: { factionId: FactionId; name: string };
  village?: { factionId: FactionId };
}

export interface FactionFogState {
  hexVisibility: Map<string, HexVisibility>;
  lastSeen: Map<string, LastSeenSnapshot>;
}

// Visibility radii
const UNIT_VISIBILITY_RADIUS = 3;
const CITY_VISIBILITY_RADIUS = 3;
const VILLAGE_VISIBILITY_RADIUS = 2;

/** Extra vision bonus for mounted/scout units */
const MOUNTED_SCOUT_VISIBILITY_BONUS = 1;
const STEALTH_CLOAK_RADIUS = 1;
const STEALTH_REVEAL_RADIUS = 2;

/** Rough/cover terrain that native Mirage (camel_adaptation_t2 native) extends to. */
const MIRAGE_ROUGH_TERRAINS = new Set<string>(['forest', 'jungle', 'hill', 'mountain']);

/**
 * Mirage (camel_adaptation_t2): a unit standing on qualifying terrain is invisible
 * to a viewer faction whose nearest unit/city is more than `mirageRange` hexes away.
 * Foreign mirage qualifies on desert/tundra; native mirage extends to all rough
 * cover terrain. Returns true when the unit should be hidden from `viewerFactionId`.
 */
export function isUnitMirageHidden(
  state: GameState,
  viewerFactionId: FactionId,
  unit: Unit
): boolean {
  if (unit.hp <= 0) return false;
  const ownerFaction = state.factions.get(unit.factionId);
  if (!ownerFaction) return false;

  const doctrine = resolveResearchDoctrine(state.research.get(unit.factionId), ownerFaction);
  if (!doctrine.mirageStealthEnabled || doctrine.mirageRange <= 0) return false;

  const terrainId = state.map?.tiles.get(hexToKey(unit.position))?.terrain ?? '';
  const qualifies = terrainId === 'desert' || terrainId === 'tundra'
    || (doctrine.mirageAllRoughEnabled && MIRAGE_ROUGH_TERRAINS.has(terrainId));
  if (!qualifies) return false;

  const range = doctrine.mirageRange;
  const viewer = state.factions.get(viewerFactionId);
  if (!viewer) return true;

  for (const uid of viewer.unitIds) {
    const vu = state.units.get(uid);
    if (vu && vu.hp > 0 && hexDistance(vu.position, unit.position) <= range) return false;
  }
  for (const cid of viewer.cityIds) {
    const c = state.cities.get(cid);
    if (c && hexDistance(c.position, unit.position) <= range) return false;
  }
  return true;
}

export function isUnitCloakedByRiverStealthAura(
  state: GameState,
  unit: Unit
): boolean {
  if (unit.hp <= 0) return false;

  const faction = state.factions.get(unit.factionId);
  if (!faction) return false;

  const doctrine = resolveResearchDoctrine(state.research.get(unit.factionId), faction);
  if (!doctrine.stealthCloakAuraEnabled) return false;

  for (const sourceId of faction.unitIds) {
    if (sourceId === unit.id) continue;

    const source = state.units.get(sourceId);
    if (!source || source.hp <= 0 || !source.isStealthed) continue;

    const sourcePrototype = state.prototypes.get(source.prototypeId);
    if (!(sourcePrototype?.tags?.includes('stealth') ?? false)) continue;

    if (hexDistance(source.position, unit.position) <= STEALTH_CLOAK_RADIUS) {
      return true;
    }
  }

  return false;
}

/**
 * River Stealth T1 (native, coverProjectionEnabled): a unit adjacent to a
 * stealthed same-faction river-stealth unit is concealed from enemy fog. Unlike
 * the T3 cloak aura this is fog-only — it grants no combat ambush bonus.
 */
export function isUnitCoverProjected(state: GameState, unit: Unit): boolean {
  if (unit.hp <= 0) return false;
  const faction = state.factions.get(unit.factionId);
  if (!faction) return false;

  const doctrine = resolveResearchDoctrine(state.research.get(unit.factionId), faction);
  if (!doctrine.coverProjectionEnabled) return false;

  for (const sourceId of faction.unitIds) {
    if (sourceId === unit.id) continue;
    const source = state.units.get(sourceId);
    if (!source || source.hp <= 0 || !source.isStealthed) continue;
    const sourceProto = state.prototypes.get(source.prototypeId);
    if (!(sourceProto?.tags?.includes('stealth') ?? false)) continue;
    if (hexDistance(source.position, unit.position) <= STEALTH_CLOAK_RADIUS) return true;
  }
  return false;
}

export function isUnitEffectivelyStealthed(
  state: GameState,
  unit: Unit
): boolean {
  if (unit.hp <= 0) return false;

  // Check persistent stealth flag or aura cloak
  if (unit.isStealthed || isUnitCloakedByRiverStealthAura(state, unit)) {
    return true;
  }

  const faction = state.factions.get(unit.factionId);
  const terrainId = state.map?.tiles.get(hexToKey(unit.position))?.terrain;
  if (isUnitRiverStealthed(faction, terrainId ?? '')) {
    return true;
  }

  // Nature's Veil (nature_healing+river_stealth): adjacent stealthed ally shares stealth
  if (faction) {
    const prototype = state.prototypes.get(unit.prototypeId);
    const tags = prototype?.tags ?? [];
    const synergies = resolveEffectiveSynergies(faction, tags);
    for (const syn of synergies) {
      for (const eff of syn.effects) {
        if (eff.kind === 'statMod') {
          const sm = eff as Extract<typeof eff, { kind: 'statMod' }>;
          if (sm.stat === 'stealthAuraShareRadius' && sm.value > 0) {
            // Check if a nearby stealthed ally shares stealth within radius
            for (const sourceId of faction.unitIds) {
              if (sourceId === unit.id) continue;
              const source = state.units.get(sourceId);
              if (!source || source.hp <= 0 || !source.isStealthed) continue;
              if (hexDistance(source.position, unit.position) <= sm.value) return true;
            }
          }
        }
      }
    }

    // Silent Landing (tidal_warfare+river_stealth): transported troops gain stealth
    // Check if unit is embarked on a stealthed naval transport
    if (state.transportMap) {
      const transportState = getUnitTransport(unit.id, state.transportMap);
      if (transportState) {
        const transportUnit = state.units.get(transportState.transportId);
        if (transportUnit && transportUnit.isStealthed && transportUnit.hp > 0) {
          const transportProto = state.prototypes.get(transportUnit.prototypeId);
          const transportTags = transportProto?.tags ?? [];
          const transportSynergies = resolveEffectiveSynergies(faction, transportTags);
          const hasTransportedStealth = transportSynergies.some(s =>
            s.effects.some(e => e.kind === 'setFlag' && (e as { flag: string }).flag === 'transportedTroopsStealth')
          );
          if (hasTransportedStealth) return true;
        }
      }
    }
  }

  return false;
}

function isRevealedByStealthAura(
  state: GameState,
  factionId: FactionId,
  unit: Unit
): boolean {
  const faction = state.factions.get(factionId);
  if (!faction) return false;

  const doctrine = resolveResearchDoctrine(state.research.get(factionId), faction);
  if (!doctrine.stealthRevealEnabled) return false;

  for (const scoutId of faction.unitIds) {
    const scout = state.units.get(scoutId);
    if (!scout || scout.hp <= 0 || !scout.isStealthed) continue;

    const prototype = state.prototypes.get(scout.prototypeId);
    if (!(prototype?.tags?.includes('stealth') ?? false)) continue;

    if (hexDistance(scout.position, unit.position) <= STEALTH_REVEAL_RADIUS) {
      return true;
    }
  }

  return false;
}

/**
 * River Stealth T3 (foreign, stealthRevealEnabled): enemy stealthed units revealed
 * by this faction's stealthed scouts lose `revealMovementPenalty` movement on their
 * next turn. The penalty is stored on the enemy unit and consumed when its owning
 * faction's turn starts (turnSystem / unitRefresh read nextTurnMovePenalty).
 */
export function applyStealthRevealPenalty(state: GameState, factionId: FactionId): GameState {
  const faction = state.factions.get(factionId);
  if (!faction) return state;

  const doctrine = resolveResearchDoctrine(state.research.get(factionId), faction);
  if (!doctrine.stealthRevealEnabled || doctrine.revealMovementPenalty <= 0) return state;

  let newUnits: Map<UnitId, Unit> | null = null;
  for (const [uid, unit] of state.units) {
    if (unit.factionId === factionId || unit.hp <= 0) continue;
    if (!isUnitEffectivelyStealthed(state, unit)) continue;
    if (!isRevealedByStealthAura(state, factionId, unit)) continue;
    if ((unit.nextTurnMovePenalty ?? 0) >= doctrine.revealMovementPenalty) continue;
    if (!newUnits) newUnits = new Map(state.units);
    newUnits.set(uid, { ...unit, nextTurnMovePenalty: doctrine.revealMovementPenalty });
  }
  return newUnits ? { ...state, units: newUnits } : state;
}

/**
 * Calculate current visibility for a faction.
 * Returns a new FactionFogState with visible hexes set to 'visible',
 * previously explored hexes set to 'explored'.
 * Also updates lastSeen snapshots for hexes transitioning from visible→explored.
 */
export function calculateVisibility(state: GameState, factionId: FactionId): FactionFogState {
  const newVisibleKeys = new Set<string>();
  const faction = state.factions.get(factionId);
  if (!faction) {
    return {
      hexVisibility: new Map(),
      lastSeen: new Map(),
    };
  }

  // Pirate Lords (tidal_warfare_t1 native): +1 vision while standing on coast/river.
  const pirateNavalVision = resolveResearchDoctrine(
    state.research.get(factionId),
    faction,
  ).pirateNavalVisionEnabled;

  // 1. Get all living friendly units and add their visibility range
  const camelUnitPositions: HexCoord[] = [];
  for (const unitId of faction.unitIds) {
    const unit = state.units.get(unitId);
    if (unit && unit.hp > 0) {
      const prototype = state.prototypes.get(unit.prototypeId);
      const role = prototype?.derivedStats?.role;
      const isMounted = role === 'mounted';
      const isCamel = prototype?.chassisId === 'camel_frame';
      if (isCamel) {
        camelUnitPositions.push(unit.position);
      }
      const unitTerrain = state.map?.tiles.get(hexToKey(unit.position))?.terrain;
      const navalVisionBonus = pirateNavalVision && (unitTerrain === 'coast' || unitTerrain === 'river')
        ? 1 : 0;
      const radius = UNIT_VISIBILITY_RADIUS + (isMounted ? MOUNTED_SCOUT_VISIBILITY_BONUS : 0) + navalVisionBonus;
      const visibleHexes = getHexesInRange(unit.position, radius);
      for (const hex of visibleHexes) {
        newVisibleKeys.add(hexToKey(hex));
      }
    }
  }

  // 2. Get all friendly cities and add their visibility range
  for (const cityId of faction.cityIds) {
    const city = state.cities.get(cityId);
    if (city) {
      const visibleHexes = getHexesInRange(city.position, CITY_VISIBILITY_RADIUS);
      for (const hex of visibleHexes) {
        newVisibleKeys.add(hexToKey(hex));
      }
    }
  }

  // 3. Get all friendly villages and add their visibility range
  for (const villageId of faction.villageIds) {
    const village = state.villages.get(villageId);
    if (village) {
      const visibleHexes = getHexesInRange(village.position, VILLAGE_VISIBILITY_RADIUS);
      for (const hex of visibleHexes) {
        newVisibleKeys.add(hexToKey(hex));
      }
    }
  }

  // Nomad Network (camel_adaptation+camel_adaptation): camel units within range share vision
  let caravanRelayRange = 0;
  for (const camelPos of camelUnitPositions) {
    if (caravanRelayRange > 0) break; // Only need to compute once per faction
    for (const unitId of faction.unitIds) {
      const u = state.units.get(unitId);
      if (!u || u.hp <= 0) continue;
      const proto = state.prototypes.get(u.prototypeId);
      if (proto?.chassisId !== 'camel_frame') continue;
      const tags = proto?.tags ?? [];
      const syns = resolveEffectiveSynergies(faction, tags);
      for (const syn of syns) {
        for (const eff of syn.effects) {
          if (eff.kind === 'statMod') {
            const sm = eff as Extract<typeof eff, { kind: 'statMod' }>;
            if (sm.stat === 'caravanRelayVisionRange') {
              caravanRelayRange = Math.max(caravanRelayRange, sm.value);
            }
          }
        }
      }
      if (caravanRelayRange > 0) break;
    }
  }
  if (caravanRelayRange > 0 && camelUnitPositions.length >= 2) {
    // Each camel sees what other camels within relay range see
    for (const camelPos of camelUnitPositions) {
      for (const otherCamelPos of camelUnitPositions) {
        if (hexDistance(camelPos, otherCamelPos) <= caravanRelayRange) {
          // Extend visibility around the other camel
          const relayRadius = UNIT_VISIBILITY_RADIUS;
          const relayHexes = getHexesInRange(otherCamelPos, relayRadius);
          for (const hex of relayHexes) {
            newVisibleKeys.add(hexToKey(hex));
          }
        }
      }
    }
  }

  // 4. Merge with previous fog state
  const previousFogState = state.fogState?.get(factionId);
  const previousVisibility = previousFogState?.hexVisibility ?? new Map();
  const previousLastSeen = previousFogState?.lastSeen ?? new Map();

  const hexVisibility = new Map<string, HexVisibility>();
  const lastSeen = new Map<string, LastSeenSnapshot>(previousLastSeen);

  // First, preserve previously visible/explored oasis hexes permanently
  for (const [key, prevVis] of previousVisibility) {
    const tile = state.map?.tiles.get(key);
    if (tile?.terrain === 'oasis' && (prevVis === 'visible' || prevVis === 'explored')) {
      hexVisibility.set(key, 'visible');
    }
  }

  // Keys in new visible set → 'visible'
  for (const key of newVisibleKeys) {
    const tile = state.map?.tiles.get(key);
    if (tile?.terrain === 'oasis') {
      if (camelUnitPositions.length > 0) {
        const inRange = camelUnitPositions.some((camelPos) => {
          return hexDistance(camelPos, tile.position) <= 4;
        });
        if (inRange) {
          hexVisibility.set(key, 'visible');
        }
      }
    } else {
      hexVisibility.set(key, 'visible');
    }
  }

  // Keys that were 'visible' or 'explored' before → keep visibility for oasis
  for (const [key, visibility] of previousVisibility) {
    if (visibility === 'visible' || visibility === 'explored') {
      if (!newVisibleKeys.has(key)) {
        const tile = state.map?.tiles.get(key);
        // Once an oasis is spotted, it stays visible forever
        if (tile?.terrain === 'oasis') {
          hexVisibility.set(key, 'visible');
        } else {
          // Transitioning from visible to explored - capture snapshot
          captureLastSeenSnapshot(state, key, lastSeen);
          hexVisibility.set(key, 'explored');
        }
      }
    }
  }

  return {
    hexVisibility,
    lastSeen,
  };
}

/**
 * Capture a last seen snapshot for a hex transitioning from visible to explored
 */
function captureLastSeenSnapshot(
  state: GameState,
  key: string,
  lastSeen: Map<string, LastSeenSnapshot>
): void {
  const hex = keyToHex(key);
  const terrain = state.map?.tiles.get(key)?.terrain ?? 'plains';

  // Check for unit at this position
  for (const unit of state.units.values()) {
    if (unit.position.q === hex.q && unit.position.r === hex.r && unit.hp > 0) {
      const prototype = state.prototypes.get(unit.prototypeId);
      lastSeen.set(key, {
        round: state.round,
        terrain,
        unit: {
          factionId: unit.factionId,
          prototypeName: prototype?.name ?? 'Unknown',
          hp: unit.hp,
          maxHp: unit.maxHp,
        },
      });
      return;
    }
  }

  // Check for city at this position
  for (const city of state.cities.values()) {
    if (city.position.q === hex.q && city.position.r === hex.r) {
      lastSeen.set(key, {
        round: state.round,
        terrain,
        city: {
          factionId: city.factionId,
          name: city.name,
        },
      });
      return;
    }
  }

  // Check for village at this position
  for (const village of state.villages.values()) {
    if (village.position.q === hex.q && village.position.r === hex.r) {
      lastSeen.set(key, {
        round: state.round,
        terrain,
        village: {
          factionId: village.factionId,
        },
      });
      return;
    }
  }

  // Just terrain
  lastSeen.set(key, {
    round: state.round,
    terrain,
  });
}

/**
 * Get all enemy units from last-seen snapshots (includes recently expired visibility)
 */
export function getLastSeenEnemyUnits(
  state: GameState,
  factionId: FactionId
): Array<{ position: HexCoord; factionId: FactionId; prototypeName: string; hp: number; maxHp: number; roundsAgo: number }> {
  const fogState = state.fogState?.get(factionId);
  if (!fogState) return [];

  const result: Array<{ position: HexCoord; factionId: FactionId; prototypeName: string; hp: number; maxHp: number; roundsAgo: number }> = [];
  const currentRound = state.round;

  for (const [key, snapshot] of fogState.lastSeen) {
    if (!snapshot.unit) continue;
    if (snapshot.unit.factionId === factionId) continue;
    const position = keyToHex(key);
    result.push({
      position,
      factionId: snapshot.unit.factionId,
      prototypeName: snapshot.unit.prototypeName,
      hp: snapshot.unit.hp,
      maxHp: snapshot.unit.maxHp,
      roundsAgo: currentRound - snapshot.round,
    });
  }

  return result;
}

/**
 * Get all enemy cities from last-seen snapshots
 */
export function getLastSeenEnemyCities(
  state: GameState,
  factionId: FactionId
): Array<{ position: HexCoord; cityId: string; factionId: FactionId; name: string; roundsAgo: number }> {
  const fogState = state.fogState?.get(factionId);
  if (!fogState) return [];

  const result: Array<{ position: HexCoord; cityId: string; factionId: FactionId; name: string; roundsAgo: number }> = [];
  const currentRound = state.round;

  // Use a stable cityId derived from position to avoid needing actual city objects
  for (const [key, snapshot] of fogState.lastSeen) {
    if (!snapshot.city) continue;
    if (snapshot.city.factionId === factionId) continue;
    const position = keyToHex(key);
    // Find the actual city to get its id
    const actualCity = Array.from(state.cities.values()).find(
      (c) => c.position.q === position.q && c.position.r === position.r
    );
    result.push({
      position,
      cityId: actualCity?.id ?? `lastSeen_${key}`,
      factionId: snapshot.city.factionId,
      name: snapshot.city.name,
      roundsAgo: currentRound - snapshot.round,
    });
  }

  return result;
}

/**
 * Get all explored (visible OR explored, not hidden) hex keys for a faction
 */
export function getExploredHexKeys(state: GameState, factionId: FactionId): Set<string> {
  const fogState = state.fogState?.get(factionId);
  if (!fogState) return new Set();

  const keys = new Set<string>();
  for (const [key, visibility] of fogState.hexVisibility) {
    if (visibility === 'visible' || visibility === 'explored') {
      keys.add(key);
    }
  }
  return keys;
}

/**
 * Get visibility level for a specific hex
 */
export function getHexVisibility(
  state: GameState,
  factionId: FactionId,
  hex: HexCoord
): HexVisibility {
  const fogState = state.fogState?.get(factionId);
  return fogState?.hexVisibility.get(hexToKey(hex)) ?? 'hidden';
}

/**
 * Is this hex currently visible to this faction?
 */
export function isHexVisible(
  state: GameState,
  factionId: FactionId,
  hex: HexCoord
): boolean {
  return getHexVisibility(state, factionId, hex) === 'visible';
}

/**
 * Get all enemy units currently visible to this faction (non-stealthed)
 */
export function getVisibleEnemyUnits(
  state: GameState,
  factionId: FactionId
): Array<{ unit: Unit; prototype: Prototype }> {
  const result: Array<{ unit: Unit; prototype: Prototype }> = [];
  const visibleKeys = getVisibleHexKeys(state, factionId);

  for (const unit of state.units.values()) {
    // Skip dead units
    if (unit.hp <= 0) continue;

    // Skip friendly units
    if (unit.factionId === factionId) continue;

    // Check if unit is in a visible hex
    const unitKey = hexToKey(unit.position);
    if (visibleKeys.has(unitKey)) {
      if (isUnitEffectivelyStealthed(state, unit) && !isRevealedByStealthAura(state, factionId, unit)) {
        continue;
      }
      if (isUnitMirageHidden(state, factionId, unit)) {
        continue;
      }
      if (isUnitCoverProjected(state, unit) && !isRevealedByStealthAura(state, factionId, unit)) {
        continue;
      }
      const prototype = state.prototypes.get(unit.prototypeId);
      if (prototype) {
        result.push({ unit, prototype });
      }
    }
  }

  return result;
}

/**
 * Can this faction see a specific unit?
 */
export function isUnitVisibleTo(
  state: GameState,
  factionId: FactionId,
  unit: Unit
): boolean {
  // Dead units are not visible
  if (unit.hp <= 0) return false;

  // Friendly units are visible to themselves
  if (unit.factionId === factionId) {
    // Check if the hex is visible (could be hidden or explored)
    const visibility = getHexVisibility(state, factionId, unit.position);
    return visibility === 'visible' || visibility === 'explored';
  }

  if (isUnitEffectivelyStealthed(state, unit)) {
    return isRevealedByStealthAura(state, factionId, unit);
  }

  if (isUnitMirageHidden(state, factionId, unit)) {
    return false;
  }

  if (isUnitCoverProjected(state, unit) && !isRevealedByStealthAura(state, factionId, unit)) {
    return false;
  }

  // Enemy units must be in a currently visible hex
  return isHexVisible(state, factionId, unit.position);
}

/**
 * Get all visible hex keys for a faction (for batch checks)
 */
export function getVisibleHexKeys(state: GameState, factionId: FactionId): Set<string> {
  const fogState = state.fogState?.get(factionId);
  if (!fogState) return new Set();

  const visibleKeys = new Set<string>();
  for (const [key, visibility] of fogState.hexVisibility) {
    if (visibility === 'visible') {
      visibleKeys.add(key);
    }
  }
  return visibleKeys;
}

/**
 * Initialize fog state for a faction if not already present.
 * Useful for tests that call computeFactionStrategy directly without running simulation.
 */
export function initializeFogForFaction(state: GameState, factionId: FactionId): GameState {
  if (!state.fogState?.has(factionId)) {
    return updateFogState(state, factionId);
  }
  return state;
}

/**
 * Update fog state for a faction in game state.
 * Returns new GameState with updated fogState.
 */
export function updateFogState(state: GameState, factionId: FactionId): GameState {
  // Create new fogState Map if it doesn't exist
  const newFogState = new Map(state.fogState ?? new Map());

  // Calculate new visibility for this faction
  const newFactionFogState = calculateVisibility(state, factionId);

  // Store the new state
  newFogState.set(factionId, newFactionFogState);

  // Return new GameState with updated fogState
  return {
    ...state,
    fogState: newFogState,
  };
}
