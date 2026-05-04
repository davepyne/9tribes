import Phaser from 'phaser';
import { parseFreecivTagFrameLookup } from './freelandSpec';
import { TEXTURES, FREELAND_SPECS } from './constants';

const frame = (row: number, col: number, columns: number) => row * columns + col;

export const TERRAIN_FRAMES = {
  grassBase: frame(7, 1, 6),
  savannahBase: frame(14, 2, 6),
  desertBase: frame(21, 3, 6),
  tundraBase: frame(28, 4, 6),
  overlayDefault: 0,
  oceanBase: 0,
  riverStraight: 0,
};

const TERRAIN_SPEC_COLUMNS = 6;
const TERRAIN_OVERLAY_SPEC_COLUMNS = 4;

const TERRAIN_BASE_TAGS = {
  grassBase: 't.l0.grassland1',
  savannahBase: 't.l0.plains1',
  desertBase: 't.l0.desert1',
  tundraBase: 't.l0.tundra1',
} as const;

const TERRAIN_FRAME_SPEC_KEYS = {
  grassBase: FREELAND_SPECS.grassTerrain,
  savannahBase: FREELAND_SPECS.savannahTerrain,
  desertBase: FREELAND_SPECS.desertTerrain,
  tundraBase: FREELAND_SPECS.tundraTerrain,
} as const;

const TERRAIN_OVERLAY_FRAME_SPEC_KEYS = {
  swamp: FREELAND_SPECS.swampTerrain,
  mountain: FREELAND_SPECS.mountainTerrain,
} as const;

const TERRAIN_OVERLAY_TAG_PREFIXES = {
  swamp: 't.l1.swamp',
  mountain: 't.l1.mountains',
} as const;

type TerrainOverlayKind = keyof typeof TERRAIN_OVERLAY_FRAME_SPEC_KEYS;

let resolvedTerrainFrames = { ...TERRAIN_FRAMES };
let resolvedTerrainOverlayFrames: Record<TerrainOverlayKind, Map<string, number>> = {
  swamp: new Map(),
  mountain: new Map(),
};

function getRequiredSpecText(scene: Phaser.Scene, key: string): string {
  const specText = scene.cache.text.get(key);
  if (typeof specText !== 'string' || specText.length === 0) {
    throw new Error(`Missing or empty Freeland terrain spec "${key}" in Phaser text cache.`);
  }
  return specText;
}

export function initializeFreelandTerrainFrames(scene: Phaser.Scene) {
  const nextFrames = { ...TERRAIN_FRAMES };
  const nextOverlayFrames: Record<TerrainOverlayKind, Map<string, number>> = {
    swamp: new Map(),
    mountain: new Map(),
  };

  for (const [terrainKey, specKey] of Object.entries(TERRAIN_FRAME_SPEC_KEYS) as Array<[keyof typeof TERRAIN_FRAME_SPEC_KEYS, string]>) {
    const tagLookup = parseFreecivTagFrameLookup(getRequiredSpecText(scene, specKey), TERRAIN_SPEC_COLUMNS);
    const tag = TERRAIN_BASE_TAGS[terrainKey];
    const frameIndex = tagLookup.get(tag);
    if (frameIndex === undefined) {
      throw new Error(`Freeland terrain tag "${tag}" not found in spec "${specKey}".`);
    }
    nextFrames[terrainKey] = frameIndex;
  }

  for (const [terrainKey, specKey] of Object.entries(TERRAIN_OVERLAY_FRAME_SPEC_KEYS) as Array<[TerrainOverlayKind, string]>) {
    nextOverlayFrames[terrainKey] = parseFreecivTagFrameLookup(
      getRequiredSpecText(scene, specKey),
      TERRAIN_OVERLAY_SPEC_COLUMNS,
    );
  }

  resolvedTerrainFrames = nextFrames;
  resolvedTerrainOverlayFrames = nextOverlayFrames;
}

export type TerrainRenderSpec = {
  baseTexture?: string;
  baseFrame?: number;
  baseTint?: number;
  baseAlpha?: number;
  overlayTexture?: string;
  overlayFrame?: number;
  overlayTint?: number;
  overlayAlpha?: number;
  fallbackColor: number;
};

type RiverConnectionFlags = {
  north: boolean;
  east: boolean;
  south: boolean;
  west: boolean;
};

function encodeRiverConnectionFlags(flags: RiverConnectionFlags): number {
  return (flags.north ? 8 : 0)
    + (flags.east ? 4 : 0)
    + (flags.south ? 2 : 0)
    + (flags.west ? 1 : 0);
}

function getConnectionFlags(
  q: number,
  r: number,
  getTerrainAt: (q: number, r: number) => string | null | undefined,
  isConnectedTerrain: (terrain: string | null | undefined) => boolean,
): RiverConnectionFlags {
  const isConnection = (dq: number, dr: number) => isConnectedTerrain(getTerrainAt(q + dq, r + dr));

  return {
    north: isConnection(0, -1) || isConnection(-1, -1) || isConnection(1, -1),
    east: isConnection(1, 0),
    south: isConnection(0, 1) || isConnection(-1, 1) || isConnection(1, 1),
    west: isConnection(-1, 0),
  };
}

export function getRiverOverlayFrameForTile(
  q: number,
  r: number,
  getTerrainAt: (q: number, r: number) => string | null | undefined,
): number {
  return encodeRiverConnectionFlags(
    getConnectionFlags(
      q,
      r,
      getTerrainAt,
      (terrain) => terrain === 'river' || terrain === 'coast',
    ),
  );
}

export function getTerrainOverlayTagForTile(
  terrain: TerrainOverlayKind,
  q: number,
  r: number,
  getTerrainAt: (q: number, r: number) => string | null | undefined,
): string {
  const flags = getConnectionFlags(q, r, getTerrainAt, (candidate) => candidate === terrain);
  const prefix = TERRAIN_OVERLAY_TAG_PREFIXES[terrain];
  return `${prefix}_n${flags.north ? 1 : 0}e${flags.east ? 1 : 0}s${flags.south ? 1 : 0}w${flags.west ? 1 : 0}`;
}

export function getTerrainOverlayFrameForTile(
  terrain: TerrainOverlayKind,
  q: number,
  r: number,
  getTerrainAt: (q: number, r: number) => string | null | undefined,
): number {
  const tag = getTerrainOverlayTagForTile(terrain, q, r, getTerrainAt);
  return resolvedTerrainOverlayFrames[terrain].get(tag) ?? TERRAIN_FRAMES.overlayDefault;
}

export function getTerrainRenderSpec(terrain: string): TerrainRenderSpec {
  switch (terrain) {
    case 'forest':
      return {
        baseTexture: TEXTURES.grassBase,
        baseFrame: resolvedTerrainFrames.grassBase,
        overlayTexture: TEXTURES.forestOverlay,
        overlayFrame: TERRAIN_FRAMES.overlayDefault,
        fallbackColor: 0x4c7247,
      };
    case 'jungle':
      return {
        baseTexture: TEXTURES.grassBase,
        baseFrame: resolvedTerrainFrames.grassBase,
        overlayTexture: TEXTURES.jungleOverlay,
        overlayFrame: TERRAIN_FRAMES.overlayDefault,
        fallbackColor: 0x35583a,
      };
    case 'hill':
      return {
        baseTexture: TEXTURES.grassBase,
        baseFrame: resolvedTerrainFrames.grassBase,
        overlayTexture: TEXTURES.hillOverlay,
        overlayFrame: TERRAIN_FRAMES.overlayDefault,
        fallbackColor: 0x8b6a4c,
      };
    case 'swamp':
      return {
        baseTexture: TEXTURES.grassBase,
        baseFrame: resolvedTerrainFrames.grassBase,
        overlayTexture: TEXTURES.swampOverlay,
        overlayFrame: TERRAIN_FRAMES.overlayDefault,
        fallbackColor: 0x58654d,
      };
    case 'mountain':
      return {
        baseTexture: TEXTURES.grassBase,
        baseFrame: resolvedTerrainFrames.grassBase,
        overlayTexture: TEXTURES.mountainOverlay,
        overlayFrame: TERRAIN_FRAMES.overlayDefault,
        fallbackColor: 0x7a7a7a,
      };
    case 'savannah':
      return {
        baseTexture: TEXTURES.savannahBase,
        baseFrame: resolvedTerrainFrames.savannahBase,
        fallbackColor: 0xa18a4a,
      };
    case 'desert':
      return {
        baseTexture: TEXTURES.desertBase,
        baseFrame: resolvedTerrainFrames.desertBase,
        fallbackColor: 0xd8c07a,
      };
    case 'tundra':
      return {
        baseTexture: TEXTURES.tundraBase,
        baseFrame: resolvedTerrainFrames.tundraBase,
        fallbackColor: 0x99a9b0,
      };
    case 'coast':
      return {
        baseTexture: TEXTURES.grassBase,
        baseFrame: resolvedTerrainFrames.grassBase,
        overlayTexture: TEXTURES.oceanBase,
        overlayFrame: TERRAIN_FRAMES.oceanBase,
        overlayTint: 0x8ecae6,
        overlayAlpha: 0.72,
        fallbackColor: 0x79adc7,
      };
    case 'river':
      return {
        baseTexture: TEXTURES.grassBase,
        baseFrame: resolvedTerrainFrames.grassBase,
        overlayTexture: TEXTURES.riverOverlay,
        overlayFrame: TERRAIN_FRAMES.riverStraight,
        fallbackColor: 0x6b9863,
      };
    case 'ocean':
      return {
        baseTexture: TEXTURES.oceanBase,
        baseFrame: TERRAIN_FRAMES.oceanBase,
        fallbackColor: 0x1a4a6e,
      };
    case 'oasis':
      return {
        baseTexture: TEXTURES.desertBase,
        baseFrame: resolvedTerrainFrames.desertBase,
        overlayTexture: TEXTURES.oasisOverlay,
        fallbackColor: 0xd8c07a,
      };
    default:
      return {
        baseTexture: TEXTURES.grassBase,
        baseFrame: resolvedTerrainFrames.grassBase,
        fallbackColor: 0x7b9b5e,
      };
  }
}
