import Phaser from 'phaser';
import type { WorldViewModel } from '../../types/worldView';
import { parseFreecivTagFrameLookup } from '../assets/freelandSpec';
import { FREELAND_SPECS, getFogRenderState, getFogTag, TEXTURES, type FogRenderState } from '../assets/keys';

const FOG_SPEC_COLUMNS = 3;
const FULLY_KNOWN_TAG = 't.fog_k_k_k_k';

const HEX_NEIGHBOR_OFFSETS: ReadonlyArray<{ dq: number; dr: number }> = [
  { dq: -1, dr: -1 }, // N  (directly above)
  { dq:  0, dr: -1 }, // NE (upper-right)
  { dq:  1, dr:  0 }, // SE (lower-right)
  { dq:  1, dr:  1 }, // S  (directly below)
  { dq:  0, dr:  1 }, // SW (lower-left)
  { dq: -1, dr:  0 }, // NW (upper-left)
];

const FOG_STATE_ORDER: Record<FogRenderState, number> = { u: 0, f: 1, k: 2 } as const;

function bestOf(a: FogRenderState, b: FogRenderState): FogRenderState {
  return FOG_STATE_ORDER[a] >= FOG_STATE_ORDER[b] ? a : b;
}

export class FogRenderer {
  private readonly fogTagToFrame: Map<string, number>;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Container,
    private readonly worldToScreen: (q: number, r: number) => { x: number; y: number },
  ) {
    const specText = this.scene.cache.text.get(FREELAND_SPECS.fog);
    if (typeof specText !== 'string' || specText.length === 0) {
      throw new Error(`Missing or empty Freeland fog spec "${FREELAND_SPECS.fog}" in Phaser text cache.`);
    }

    this.fogTagToFrame = parseFreecivTagFrameLookup(specText, FOG_SPEC_COLUMNS);
  }

  render(world: WorldViewModel) {
    this.layer.removeAll(true);
    const visibilityByHexKey = new Map(world.map.hexes.map((hex) => [hex.key, hex.visibility]));

    for (const hex of world.map.hexes) {
      if (hex.visibility === 'visible') {
        continue;
      }

      const point = this.worldToScreen(hex.q, hex.r);
      const [n, ne, se, s, sw, nw] = this.resolveNeighborFogStates(hex.q, hex.r, visibilityByHexKey);
      const fogTag = getFogTag(
        bestOf(ne, n),
        se,
        bestOf(sw, s),
        nw,
      );
      const fogFrame = this.resolveFogFrame(fogTag);
      if (fogFrame === null) {
        continue;
      }

      const fogSprite = this.scene.add.image(Math.round(point.x), Math.round(point.y), TEXTURES.fog, fogFrame)
        .setOrigin(0.5, 1);
      this.layer.add(fogSprite);
    }
  }

  private resolveNeighborFogStates(
    q: number,
    r: number,
    visibilityByHexKey: Map<string, 'visible' | 'explored' | 'hidden'>,
  ): [FogRenderState, FogRenderState, FogRenderState, FogRenderState, FogRenderState, FogRenderState] {
    const states = HEX_NEIGHBOR_OFFSETS.map(({ dq, dr }) => {
      const neighborVisibility = visibilityByHexKey.get(`${q + dq},${r + dr}`) ?? 'hidden';
      return getFogRenderState(neighborVisibility);
    });
    return [states[0], states[1], states[2], states[3], states[4], states[5]];
  }

  private resolveFogFrame(tag: string): number | null {
    // Freeciv fog specs intentionally omit the fully-known tile.
    if (tag === FULLY_KNOWN_TAG) {
      return null;
    }

    const frame = this.fogTagToFrame.get(tag);
    if (frame !== undefined) {
      return frame;
    }

    const message = `Freeland fog tag "${tag}" not found in fog.spec.`;
    console.error(message);
    throw new Error(message);
  }
}
