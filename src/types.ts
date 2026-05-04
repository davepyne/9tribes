// War-Civ-2 Type Definitions

// Branded types for type-safe IDs
export type FactionId = string & { readonly __brand: 'FactionId' };
export type UnitId = string & { readonly __brand: 'UnitId' };
export type CityId = string & { readonly __brand: 'CityId' };
export type PrototypeId = string & { readonly __brand: 'PrototypeId' };
export type ImprovementId = string & { readonly __brand: 'ImprovementId' };
export type ChassisId = string & { readonly __brand: 'ChassisId' };
export type ComponentId = string & { readonly __brand: 'ComponentId' };
export type ResearchNodeId = string & { readonly __brand: 'ResearchNodeId' };
export type VillageId = string & { readonly __brand: 'VillageId' };

// Square isometric grid coordinate. Property names q/r are preserved from the
// old hex system to avoid touching every property access site.
export interface TileCoord {
  q: number;  // x (column)
  r: number;  // y (row)
}

// Backwards-compatible alias — remove after full migration
export type HexCoord = TileCoord;
