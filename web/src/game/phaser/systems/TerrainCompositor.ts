import Phaser from 'phaser';
import { TILE_HEIGHT, TILE_WIDTH } from '../assets/keys';
import { type RectCorner, RECT_CELLS, RECT_CORNER_NEIGHBORS } from './TerrainGeometry';

export { type RectCorner, RECT_CELLS, RECT_CORNER_NEIGHBORS } from './TerrainGeometry';

export type ComposedLayer = {
  texture: string;
  frame: number;
  xOffset?: number;
  yOffset?: number;
  crop?: { x: number; y: number; width: number; height: number };
  maskTexture?: string;
  maskFrame?: number;
  maskXOffset?: number;
  maskYOffset?: number;
};

// --- Canvas composition engine ---

export class TerrainCompositor {
  private composedTileCache = new Map<string, string>();
  private composedTileCounter = 0;

  constructor(private readonly scene: Phaser.Scene) {}

  /**
   * Compose multiple cropped layers onto a single canvas texture.
   * Uses nearest-neighbor filtering for crisp pixel art.
   * Results are cached by layer fingerprint.
   */
  composeLayers(layers: ComposedLayer[]): string {
    const croppedLayers = layers.filter((l) => l.crop);
    if (croppedLayers.length === 0) {
      return '';
    }

    const cacheKey = JSON.stringify(croppedLayers.map((layer) => ({
      texture: layer.texture,
      frame: layer.frame,
      xOffset: layer.xOffset ?? 0,
      yOffset: layer.yOffset ?? 0,
      crop: layer.crop,
      maskTexture: layer.maskTexture,
      maskFrame: layer.maskFrame,
      maskXOffset: layer.maskXOffset ?? 0,
      maskYOffset: layer.maskYOffset ?? 0,
    })));

    const cached = this.composedTileCache.get(cacheKey);
    if (cached) return cached;

    const textureKey = `terrain-composed-${this.composedTileCounter++}`;
    const canvas = document.createElement('canvas');
    canvas.width = TILE_WIDTH;
    canvas.height = TILE_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return croppedLayers[0].texture;

    ctx.imageSmoothingEnabled = false;

    for (const layer of croppedLayers) {
      const frame = this.scene.textures.get(layer.texture).get(layer.frame);
      const crop = layer.crop;
      if (!frame || !crop) continue;

      const source = frame.source.image as CanvasImageSource;
      const sourceX = frame.cutX + crop.x;
      const sourceY = frame.cutY + crop.y;
      const destX = Math.round((layer.xOffset ?? 0) + TILE_WIDTH / 2);
      const destY = Math.round((layer.yOffset ?? 0) + TILE_HEIGHT);

      // Draw cropped quarter into temp canvas
      const quarterCanvas = document.createElement('canvas');
      quarterCanvas.width = crop.width;
      quarterCanvas.height = crop.height;
      const quarterCtx = quarterCanvas.getContext('2d');
      if (!quarterCtx) continue;

      quarterCtx.imageSmoothingEnabled = false;
      quarterCtx.drawImage(source, sourceX, sourceY, crop.width, crop.height, 0, 0, crop.width, crop.height);

      // Apply mask via destination-in composite
      if (layer.maskTexture && layer.maskFrame !== undefined) {
        const maskFrame = this.scene.textures.get(layer.maskTexture).get(layer.maskFrame);
        if (maskFrame) {
          quarterCtx.globalCompositeOperation = 'destination-in';
          quarterCtx.drawImage(
            maskFrame.source.image as CanvasImageSource,
            maskFrame.cutX, maskFrame.cutY, maskFrame.cutWidth, maskFrame.cutHeight,
            (layer.maskXOffset ?? 0) - crop.x, (layer.maskYOffset ?? 0) - crop.y,
            maskFrame.cutWidth, maskFrame.cutHeight,
          );
          quarterCtx.globalCompositeOperation = 'source-over';
        }
      }

      // Blit quarter onto main tile canvas
      ctx.drawImage(quarterCanvas, destX, destY);
    }

    this.scene.textures.addCanvas(textureKey, canvas);
    this.scene.textures.get(textureKey).setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.composedTileCache.set(cacheKey, textureKey);
    return textureKey;
  }

  /** Clear the composition cache (call on scene shutdown or map change) */
  clearCache(): void {
    for (const key of this.composedTileCache.values()) {
      if (this.scene.textures.exists(key)) {
        this.scene.textures.remove(key);
      }
    }
    this.composedTileCache.clear();
  }
}
