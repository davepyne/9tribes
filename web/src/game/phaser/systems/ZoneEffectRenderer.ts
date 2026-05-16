import Phaser from 'phaser';
import type { WorldViewModel, ZoneEffectType } from '../../types/worldView';
import { TEXTURES, CY_OFFSET } from '../assets/keys';

type SpriteEffectInstance = {
  zoneId: string;
  type: ZoneEffectType;
  sprite: Phaser.GameObjects.Sprite;
  ring?: Phaser.GameObjects.Graphics;
  ringTween?: Phaser.Tweens.Tween;
  phase: number;
  procedural: false;
};

type ProceduralEffectInstance = {
  zoneId: string;
  type: ZoneEffectType;
  q: number;
  r: number;
  radius: number;
  graphics: Phaser.GameObjects.Graphics;
  ring?: Phaser.GameObjects.Graphics;
  ringTween?: Phaser.Tweens.Tween;
  phase: number;
  procedural: true;
};

type EffectInstance = SpriteEffectInstance | ProceduralEffectInstance;

const FRAME_COUNTS: Record<ZoneEffectType, number> = {
  toxic_bloom: 11,
  maelstrom: 11,
  crushing_zone: 11,
  raid_camp: 11,
  poison_cloud: 11,
  venomous_tide: 1,
  poison_trap: 1,
};

const TEXTURE_KEYS: Record<ZoneEffectType, string> = {
  toxic_bloom: TEXTURES.vfxToxicBloom,
  maelstrom: TEXTURES.vfxMaelstrom,
  crushing_zone: TEXTURES.vfxCrushingZone,
  raid_camp: TEXTURES.vfxRaidCamp,
  poison_cloud: TEXTURES.vfxPoisonCloud,
  venomous_tide: TEXTURES.vfxToxicBloom,
  poison_trap: TEXTURES.vfxPoisonTrap,
};

// Visual config for ring overlays (hex boundary outlines)
const RING_CONFIGS: Record<ZoneEffectType, { color: number; lineWidth: number; pulseAlpha: [number, number]; pulseDuration: number }> = {
  maelstrom: { color: 0x0097A7, lineWidth: 3, pulseAlpha: [0.25, 0.65], pulseDuration: 2000 },
  toxic_bloom: { color: 0x000000, lineWidth: 0, pulseAlpha: [0, 0], pulseDuration: 0 },
  crushing_zone: { color: 0x5D4037, lineWidth: 3, pulseAlpha: [0.2, 0.5], pulseDuration: 2500 },
  raid_camp: { color: 0xD4813F, lineWidth: 3, pulseAlpha: [0.2, 0.55], pulseDuration: 2200 },
  poison_cloud: { color: 0x556B2F, lineWidth: 3, pulseAlpha: [0.2, 0.5], pulseDuration: 2400 },
  venomous_tide: { color: 0x004D40, lineWidth: 2, pulseAlpha: [0.15, 0.45], pulseDuration: 3000 },
  poison_trap: { color: 0x000000, lineWidth: 0, pulseAlpha: [0, 0], pulseDuration: 0 },
};

// Procedural zone effect types (rendered via Graphics instead of sprite sheets)
const PROCEDURAL_TYPES = new Set<ZoneEffectType>(['venomous_tide']);

// Iridescent color palette for oily sheen effect
const VENOMOUS_TIDE_COLORS = [
  0x1B5E20, // dark green
  0x004D40, // dark teal
  0x2E7D32, // green
  0x388E3C, // light green
  0x00695C, // teal
  0x1A237E, // deep blue-purple
  0x006064, // cyan-teal
  0x33691E, // olive green
];

// Axial hex directions for neighbor checks
const HEX_DIRECTIONS = [
  { q: 1, r: 0 }, { q: -1, r: 0 },
  { q: 0, r: 1 }, { q: 0, r: -1 },
  { q: 1, r: -1 }, { q: -1, r: 1 },
];

export class ZoneEffectRenderer {
  private effects: Map<string, EffectInstance> = new Map();
  private proceduralUpdateBound: ((time: number, _delta: number) => void) | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Container,
    private readonly worldToScreen: (q: number, r: number) => { x: number; y: number },
  ) {}

  render(world: WorldViewModel): void {
    const activeIds = new Set(world.overlays.zoneEffects.map(ze => ze.id));

    // Remove destroyed effects
    for (const [zoneId, inst] of this.effects) {
      if (!activeIds.has(zoneId)) {
        inst.ringTween?.stop();
        inst.ring?.destroy();
        if (inst.procedural) {
          inst.graphics.destroy();
        } else {
          inst.sprite.destroy();
        }
        this.effects.delete(zoneId);
      }
    }

    // Create effects (zone effects are stationary — only create new, never update existing)
    for (const ze of world.overlays.zoneEffects) {
      if (!this.effects.has(ze.id)) {
        const isProcedural = PROCEDURAL_TYPES.has(ze.type);

        if (isProcedural) {
          this.createProceduralEffect(ze);
        } else {
          this.ensureAnimation(ze.type);
          this.createSpriteEffect(ze);
        }
      }
    }

    // Ensure procedural update loop is running if we have procedural effects
    const hasProcedural = Array.from(this.effects.values()).some(e => e.procedural);
    if (hasProcedural && !this.proceduralUpdateBound) {
      this.proceduralUpdateBound = this.proceduralUpdate.bind(this);
      this.scene.events.on('update', this.proceduralUpdateBound);
    } else if (!hasProcedural && this.proceduralUpdateBound) {
      this.scene.events.off('update', this.proceduralUpdateBound);
      this.proceduralUpdateBound = null;
    }
  }

  /** Per-frame redraw of procedural (Graphics-based) zone effects. */
  private proceduralUpdate(_time: number, _delta: number): void {
    for (const inst of this.effects.values()) {
      if (!inst.procedural) continue;
      this.drawProceduralSheen(inst);
    }
  }

  private createSpriteEffect(ze: { id: string; type: ZoneEffectType; q: number; r: number; radius: number }): void {
    const screen = this.worldToScreen(ze.q, ze.r);
    const textureKey = TEXTURE_KEYS[ze.type];
    const sprite = this.scene.add.sprite(screen.x, screen.y + CY_OFFSET, textureKey);
    sprite.setOrigin(0.5, 0.5);
    sprite.play(`vfx-${ze.type}`);
    const phase = (ze.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 100) / 100;

    let ring: Phaser.GameObjects.Graphics | undefined;
    let ringTween: Phaser.Tweens.Tween | undefined;
    const ringConfig = RING_CONFIGS[ze.type];
    if (ze.radius > 0 && ringConfig.lineWidth > 0) {
      ring = this.createRing(ze, ringConfig);
      this.layer.add(ring);
      ringTween = this.scene.tweens.add({
        targets: ring,
        alpha: ringConfig.pulseAlpha[1],
        duration: ringConfig.pulseDuration,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      });
    }

    this.layer.add(sprite);
    this.effects.set(ze.id, { zoneId: ze.id, type: ze.type, sprite, ring, ringTween, phase, procedural: false });
  }

  private createProceduralEffect(ze: { id: string; type: ZoneEffectType; q: number; r: number; radius: number }): void {
    const graphics = this.scene.add.graphics();
    const phase = (ze.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 100) / 100;

    let ring: Phaser.GameObjects.Graphics | undefined;
    let ringTween: Phaser.Tweens.Tween | undefined;
    const ringConfig = RING_CONFIGS[ze.type];
    if (ze.radius > 0 && ringConfig.lineWidth > 0) {
      ring = this.createRing(ze, ringConfig);
      this.layer.add(ring);
      ringTween = this.scene.tweens.add({
        targets: ring,
        alpha: ringConfig.pulseAlpha[1],
        duration: ringConfig.pulseDuration,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      });
    }

    this.layer.add(graphics);
    this.effects.set(ze.id, {
      zoneId: ze.id,
      type: ze.type,
      q: ze.q,
      r: ze.r,
      radius: ze.radius,
      graphics,
      ring,
      ringTween,
      phase,
      procedural: true,
    });
  }

  /** Draw the procedural oily sheen effect for a zone. Called every frame. */
  private drawProceduralSheen(inst: ProceduralEffectInstance): void {
    const graphics = inst.graphics;
    graphics.clear();

    const screen = this.worldToScreen(inst.q, inst.r);
    const cx = screen.x;
    const cy = screen.y + CY_OFFSET;

    const t = Date.now() / 1000;

    // Color cycle for iridescence
    const colorIdx1 = Math.floor((t * 0.5 + inst.phase * VENOMOUS_TIDE_COLORS.length) % VENOMOUS_TIDE_COLORS.length);
    const colorIdx2 = (colorIdx1 + 1) % VENOMOUS_TIDE_COLORS.length;
    const colorIdx3 = (colorIdx1 + 2) % VENOMOUS_TIDE_COLORS.length;

    // Pulse for spreading/contracting effect
    const pulse = 0.85 + 0.15 * Math.sin(t * 1.2 + inst.phase * Math.PI * 2);
    const baseAlpha = 0.45 * pulse;

    // Draw sheen layers (concentric blobs with organic offsets)
    const layers = [
      { radius: 46, alpha: baseAlpha * 0.6 },
      { radius: 38, alpha: baseAlpha * 0.8 },
      { radius: 28, alpha: baseAlpha },
      { radius: 18, alpha: baseAlpha * 0.7 },
      { radius: 10, alpha: baseAlpha * 0.5 },
    ];

    const palette = [VENOMOUS_TIDE_COLORS[colorIdx1], VENOMOUS_TIDE_COLORS[colorIdx2], VENOMOUS_TIDE_COLORS[colorIdx3]];
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      const color = palette[i % 3];
      const ox = Math.sin(t * 0.7 + i * 1.3) * 3;
      const oy = Math.cos(t * 0.5 + i * 0.9) * 2;
      graphics.fillStyle(color, layer.alpha);
      graphics.fillCircle(cx + ox, cy + oy, layer.radius);
    }

    // Contamination boundary ring if radius > 0
    if (inst.radius > 0) {
      this.drawContaminationBoundary(graphics, inst, t);
    }
  }

  private drawContaminationBoundary(
    graphics: Phaser.GameObjects.Graphics,
    inst: ProceduralEffectInstance,
    t: number,
  ): void {
    // Build set of hexes within radius
    const zoneHexes = new Set<string>();
    for (let q = -inst.radius; q <= inst.radius; q++) {
      const rMin = Math.max(-inst.radius, -q - inst.radius);
      const rMax = Math.min(inst.radius, -q + inst.radius);
      for (let r = rMin; r <= rMax; r++) {
        zoneHexes.add(`${q},${r}`);
      }
    }

    // Find boundary hexes
    const boundaryHexes: { q: number; r: number }[] = [];
    for (const key of zoneHexes) {
      const [hq, hr] = key.split(',').map(Number);
      const hasNeighborOutside = HEX_DIRECTIONS.some(dir =>
        !zoneHexes.has(`${hq + dir.q},${hr + dir.r}`),
      );
      if (hasNeighborOutside) {
        boundaryHexes.push({ q: hq, r: hr });
      }
    }

    if (boundaryHexes.length === 0) return;

    // Convert to screen coords
    const screenPoints = boundaryHexes.map(hex => {
      const s = this.worldToScreen(inst.q + hex.q, inst.r + hex.r);
      return { x: s.x, y: s.y + CY_OFFSET };
    });

    // Angular sort
    const centerScreen = this.worldToScreen(inst.q, inst.r);
    screenPoints.sort((a, b) => {
      const ca = centerScreen.y + CY_OFFSET;
      return Math.atan2(a.y - ca, a.x - centerScreen.x) - Math.atan2(b.y - ca, b.x - centerScreen.x);
    });

    // Pulsing boundary ring
    const colorIdx = Math.floor((t * 0.5 + inst.phase * VENOMOUS_TIDE_COLORS.length) % VENOMOUS_TIDE_COLORS.length);
    const boundaryAlpha = 0.3 + 0.25 * Math.sin(t * 1.5 + inst.phase * Math.PI * 2);
    const ringColor = VENOMOUS_TIDE_COLORS[colorIdx];

    graphics.lineStyle(2, ringColor, boundaryAlpha);
    for (let i = 0; i < screenPoints.length; i++) {
      const curr = screenPoints[i];
      const next = screenPoints[(i + 1) % screenPoints.length];
      graphics.lineBetween(curr.x, curr.y, next.x, next.y);
    }

    // Dots at boundary points
    graphics.fillStyle(ringColor, boundaryAlpha * 0.8);
    for (const pt of screenPoints) {
      graphics.fillCircle(pt.x, pt.y, 3);
    }
  }

  private createRing(ze: { q: number; r: number; radius: number }, config: { color: number; lineWidth: number; pulseAlpha: [number, number] }): Phaser.GameObjects.Graphics {
    const zoneHexes = new Set<string>();
    for (let q = -ze.radius; q <= ze.radius; q++) {
      const rMin = Math.max(-ze.radius, -q - ze.radius);
      const rMax = Math.min(ze.radius, -q + ze.radius);
      for (let r = rMin; r <= rMax; r++) {
        zoneHexes.add(`${q},${r}`);
      }
    }

    const boundaryHexes: { q: number; r: number }[] = [];
    for (const key of zoneHexes) {
      const [hq, hr] = key.split(',').map(Number);
      const hasNeighborOutside = HEX_DIRECTIONS.some(dir =>
        !zoneHexes.has(`${hq + dir.q},${hr + dir.r}`),
      );
      if (hasNeighborOutside) {
        boundaryHexes.push({ q: hq, r: hr });
      }
    }

    if (boundaryHexes.length === 0) {
      return this.scene.add.graphics();
    }

    const screenPoints = boundaryHexes.map(hex => {
      const screen = this.worldToScreen(ze.q + hex.q, ze.r + hex.r);
      return { x: screen.x, y: screen.y + CY_OFFSET };
    });

    const centerScreen = this.worldToScreen(ze.q, ze.r);
    screenPoints.sort((a, b) => {
      const ca = centerScreen.y + CY_OFFSET;
      return Math.atan2(a.y - ca, a.x - centerScreen.x) - Math.atan2(b.y - ca, b.x - centerScreen.x);
    });

    const graphics = this.scene.add.graphics();
    graphics.lineStyle(config.lineWidth, config.color, 0.85);

    for (let i = 0; i < screenPoints.length; i++) {
      const curr = screenPoints[i];
      const next = screenPoints[(i + 1) % screenPoints.length];
      graphics.lineBetween(curr.x, curr.y, next.x, next.y);
    }

    graphics.fillStyle(config.color, 0.6);
    for (const pt of screenPoints) {
      graphics.fillCircle(pt.x, pt.y, 4);
    }

    graphics.setAlpha(config.pulseAlpha[0]);
    return graphics;
  }

  private ensureAnimation(type: ZoneEffectType): void {
    const animKey = `vfx-${type}`;
    if (this.scene.anims.exists(animKey)) return;
    const textureKey = TEXTURE_KEYS[type];
    const frameCount = FRAME_COUNTS[type] ?? 6;
    this.scene.anims.create({
      key: animKey,
      frames: this.scene.anims.generateFrameNumbers(textureKey, { start: 0, end: frameCount - 1 }),
      frameRate: 8,
      repeat: -1,
      yoyo: false,
    });
  }

  destroy(): void {
    if (this.proceduralUpdateBound) {
      this.scene.events.off('update', this.proceduralUpdateBound);
      this.proceduralUpdateBound = null;
    }
    for (const [, inst] of this.effects) {
      inst.ringTween?.stop();
      inst.ring?.destroy();
      if (inst.procedural) {
        inst.graphics.destroy();
      } else {
        inst.sprite.destroy();
      }
    }
    this.effects.clear();
  }
}
