// Branded ID factory functions for type-safe identifiers
// Uses nominal typing pattern to prevent ID mixing

import type { 
  FactionId, UnitId, CityId, PrototypeId, ImprovementId,
  ChassisId, ComponentId, ResearchNodeId, VillageId
} from '../types.js';

// Counter-based ID generation (deterministic within a session)
// For cross-session determinism, use IDs from game state serialization
let idCounter = 0;

const resetCounter = (value = 0): void => {
  idCounter = value;
};

// Format: {prefix}_{counter} - simple and deterministic
const generateId = (prefix: string): string => {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
};

// Branded ID factories - cast string to branded type
export const createFactionId = (id?: string): FactionId =>
  (id ?? generateId('faction')) as FactionId;

export const createUnitId = (id?: string): UnitId =>
  (id ?? generateId('unit')) as UnitId;

export const createCityId = (id?: string): CityId =>
  (id ?? generateId('city')) as CityId;

export const createPrototypeId = (id?: string): PrototypeId =>
  (id ?? generateId('prototype')) as PrototypeId;

export const createImprovementId = (id?: string): ImprovementId =>
  (id ?? generateId('improvement')) as ImprovementId;

export const createChassisId = (id?: string): ChassisId =>
  (id ?? generateId('chassis')) as ChassisId;

export const createComponentId = (id?: string): ComponentId =>
  (id ?? generateId('component')) as ComponentId;

export const createResearchNodeId = (id?: string): ResearchNodeId =>
  (id ?? generateId('research')) as ResearchNodeId;

export const createVillageId = (id?: string): VillageId =>
  (id ?? generateId('village')) as VillageId;

// Type guards for runtime validation
export const isFactionId = (value: unknown): value is FactionId =>
  typeof value === 'string' && value.startsWith('faction_');

export const isUnitId = (value: unknown): value is UnitId =>
  typeof value === 'string' && value.startsWith('unit_');

export const isCityId = (value: unknown): value is CityId =>
  typeof value === 'string' && value.startsWith('city_');

export const isPrototypeId = (value: unknown): value is PrototypeId =>
  typeof value === 'string' && value.startsWith('prototype_');

export const isImprovementId = (value: unknown): value is ImprovementId =>
  typeof value === 'string' && value.startsWith('improvement_');

export const isChassisId = (value: unknown): value is ChassisId =>
  typeof value === 'string' && value.startsWith('chassis_');

export const isComponentId = (value: unknown): value is ComponentId =>
  typeof value === 'string' && value.startsWith('component_');

export const isResearchNodeId = (value: unknown): value is ResearchNodeId =>
  typeof value === 'string' && value.startsWith('research_');

export const isVillageId = (value: unknown): value is VillageId =>
  typeof value === 'string' && value.startsWith('village_');

// Export for testing - allows resetting counter between tests
export const _resetIdCounter = resetCounter;
