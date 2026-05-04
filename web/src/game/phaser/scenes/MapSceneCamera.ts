import type { ClientState } from '../../types/clientState';
import { TILE_HALF_HEIGHT, TILE_HALF_WIDTH } from '../assets/constants';

export class MapSceneCamera {
  private cameraInitialized = false;
  private cachedBounds: { minX: number; minY: number; width: number; height: number } | null = null;
  private cachedBoundsHexCount = 0;

  constructor(
    private readonly camera: Phaser.Cameras.Scene2D.Camera,
    private readonly worldToScreen: (q: number, r: number) => { x: number; y: number },
  ) {}

  layout(state: ClientState): void {
    const hexCount = state.world.map.hexes.length;
    if (!this.cachedBounds || this.cachedBoundsHexCount !== hexCount) {
      const points = state.world.map.hexes.map((hex) => this.worldToScreen(hex.q, hex.r));
      const minX = Math.min(...points.map((point) => point.x - 96));
      const maxX = Math.max(...points.map((point) => point.x + 96));
      const minY = Math.min(...points.map((point) => point.y - 96));
      const maxY = Math.max(...points.map((point) => point.y + 96));
      this.cachedBounds = { minX, minY, width: maxX - minX, height: maxY - minY };
      this.cachedBoundsHexCount = hexCount;
    }

    const { minX, minY, width, height } = this.cachedBounds;
    this.camera.setBounds(minX, minY, width, height);
    if (!this.cameraInitialized) {
      const startPos = this.findPlayerStart(state);
      const screenPos = this.worldToScreen(startPos.q, startPos.r);
      this.camera.centerOn(screenPos.x, screenPos.y);
      this.cameraInitialized = true;
    }
    this.camera.setZoom(state.camera.zoom);
  }

  handleResize(width: number, height: number): void {
    this.camera.setSize(width, height);
  }

  panToMidpoint(q1: number, r1: number, q2: number, r2: number, duration: number): void {
    const p1 = this.worldToScreen(q1, r1);
    const p2 = this.worldToScreen(q2, r2);
    const targetX = (p1.x + p2.x) / 2;
    const targetY = (p1.y + p2.y) / 2;
    this.camera.pan(targetX, targetY, duration, 'Sine.easeInOut', true);
  }

  resetFX(): void {
    this.camera.resetFX();
  }

  private findPlayerStart(state: ClientState): { q: number; r: number } {
    const activeFaction = state.world.factions.find((f) => f.id === state.world.activeFactionId);
    if (activeFaction?.homeCityId) {
      const homeCity = state.world.cities.find((c) => c.id === activeFaction.homeCityId);
      if (homeCity) return { q: homeCity.q, r: homeCity.r };
    }

    const factionCity = state.world.cities.find(
      (c) => c.factionId === state.world.activeFactionId && c.visible,
    );
    if (factionCity) return { q: factionCity.q, r: factionCity.r };

    const activeUnit = state.world.units.find(
      (u) => u.isActiveFaction && u.visible,
    );
    if (activeUnit) return { q: activeUnit.q, r: activeUnit.r };

    return { q: 0, r: 0 };
  }
}

export function screenToWorld(x: number, y: number) {
  const q = Math.round(((x / TILE_HALF_WIDTH) + (y / TILE_HALF_HEIGHT)) / 2);
  const r = Math.round(((y / TILE_HALF_HEIGHT) - (x / TILE_HALF_WIDTH)) / 2);
  return Number.isFinite(q) && Number.isFinite(r) ? { q, r } : null;
}

export function worldToScreen(q: number, r: number) {
  return {
    x: (q - r) * TILE_HALF_WIDTH,
    y: (q + r) * TILE_HALF_HEIGHT,
  };
}
