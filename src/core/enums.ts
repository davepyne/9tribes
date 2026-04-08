// Core enums for war-civ-2
// Ported from war-civ reference implementation

export type VisibilityLevel = "hidden" | "seen" | "visible";
export type Elevation = "flat" | "hill";
export type UnitRole = "melee" | "ranged" | "mounted" | "support";

export type MovementClass = "infantry" | "cavalry" | "wheeled" | "flying" | "naval";
export type ComponentSlotType = "weapon" | "armor" | "training" | "utility";
export type VeteranLevel = "green" | "seasoned" | "veteran" | "elite";
export type ImprovementCategory = "fortification" | "infrastructure";
export type GameStatus = "in_progress" | "completed";
export type HistoryEntryType =
  | "created"
  | "promoted"
  | "battle_fought"
  | "unit_killed"
  | "city_defended"
  | "prototype_upgraded";
export type UnitStatus = "ready" | "fortified" | "spent";
export type ModifierSourceType =
  | "terrain"
  | "improvement"
  | "component"
  | "veteran_level"
  | "trait"
  | "status";
