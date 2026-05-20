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
  createdRound: number;
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
  spike_line: 1,
  bloodtrail: 1,
  life_bloom: 1,
  citadel: 1,
};

const TEXTURE_KEYS: Partial<Record<ZoneEffectType, string>> = {
  toxic_bloom: TEXTURES.vfxToxicBloom,
  maelstrom: TEXTURES.vfxMaelstrom,
  crushing_zone: TEXTURES.vfxCrushingZone,
  raid_camp: TEXTURES.vfxRaidCamp,
  poison_cloud: TEXTURES.vfxPoisonCloud,
  poison_trap: TEXTURES.vfxPoisonTrap,
  spike_line: TEXTURES.vfxSpikeLine,
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
  spike_line: { color: 0x000000, lineWidth: 0, pulseAlpha: [0, 0], pulseDuration: 0 },
  bloodtrail: { color: 0x000000, lineWidth: 0, pulseAlpha: [0, 0], pulseDuration: 0 },
  life_bloom: { color: 0x66BB6A, lineWidth: 2, pulseAlpha: [0.2, 0.55], pulseDuration: 2800 },
  citadel: { color: 0xD4A057, lineWidth: 2, pulseAlpha: [0.2, 0.5], pulseDuration: 3200 },
};

// Procedural zone effect types (rendered via Graphics instead of sprite sheets)
const PROCEDURAL_TYPES = new Set<ZoneEffectType>(['venomous_tide', 'bloodtrail', 'life_bloom', 'citadel']);

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

// Blood splotch palette — dark reds and maroons
const BLOODTRAIL_COLORS = [
  0x8B0000, // dark red
  0x6B1A1A, // maroon-brown
  0x7B1818, // deep crimson
  0x5C1010, // very dark red
  0x9B2020, // brighter blood red (center accent)
];

// Life Bloom palette — warm greens, golds, and luminous yellows
const LIFE_BLOOM_COLORS = [
  0x4CAF50, // vibrant green
  0x8BC34A, // light green
  0xCDDC39, // lime
  0xFFEB3B, // yellow
  0x66BB6A, // soft green
  0xAED581, // pale green
  0xFDD835, // golden yellow
  0x7CB342, // mid green
];

// Citadel palette — warm stone, amber gold, and soft green (fortress + healing)
const CITADEL_COLORS = [
  0xD4A057, // warm amber
  0xC49A3C, // deep gold
  0xB8860B, // dark goldenrod
  0x8BC34A, // light green (healing touch)
  0xAED581, // pale green
  0xE8C872, // light gold
  0x66BB6A, // soft green
  0xDAB86A, // sandy gold
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
  private currentRound: number = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Container,
    private readonly worldToScreen: (q: number, r: number) => { x: number; y: number },
  ) {}

  render(world: WorldViewModel): void {
    this.currentRound = world.round;
    const visibleEffects = world.overlays.zoneEffects.filter(ze => ze.visible);
    const activeIds = new Set(visibleEffects.map(ze => ze.id));

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

    // Create effects or update position for mobile zone effects (e.g., life_bloom)
    for (const ze of visibleEffects) {
      const existing = this.effects.get(ze.id);
      if (existing) {
        // Update position for procedural effects that moved
        if (existing.procedural && (existing.q !== ze.q || existing.r !== ze.r)) {
          (existing as ProceduralEffectInstance).q = ze.q;
          (existing as ProceduralEffectInstance).r = ze.r;
          // Rebuild static ring overlay at new position
          if (existing.ring) {
            existing.ring.destroy();
            const ringConfig = RING_CONFIGS[ze.type];
            existing.ring = this.createRing(ze, ringConfig);
            this.layer.add(existing.ring);
            existing.ringTween?.stop();
            existing.ringTween = this.scene.tweens.add({
              targets: existing.ring,
              alpha: ringConfig.pulseAlpha[1],
              duration: ringConfig.pulseDuration,
              ease: 'Sine.easeInOut',
              yoyo: true,
              repeat: -1,
            });
          }
        }
        continue;
      }

      const isProcedural = PROCEDURAL_TYPES.has(ze.type);

      if (isProcedural) {
        this.createProceduralEffect(ze);
      } else {
        this.ensureAnimation(ze.type);
        this.createSpriteEffect(ze);
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
  private proceduralUpdate(time: number, _delta: number): void {
    const t = time / 1000;
    for (const inst of this.effects.values()) {
      if (!inst.procedural) continue;
      if (inst.type === 'life_bloom') {
        this.drawLifeBloom(inst, t);
      } else if (inst.type === 'citadel') {
        this.drawCitadel(inst, t);
      } else {
        this.drawProceduralSheen(inst, t);
      }
    }
  }

  private createSpriteEffect(ze: { id: string; type: ZoneEffectType; q: number; r: number; radius: number }): void {
    const screen = this.worldToScreen(ze.q, ze.r);
    const textureKey = TEXTURE_KEYS[ze.type];
    if (!textureKey) return;
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

  private createProceduralEffect(ze: { id: string; type: ZoneEffectType; q: number; r: number; radius: number; createdRound: number }): void {
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
    const inst: ProceduralEffectInstance = {
      zoneId: ze.id,
      type: ze.type,
      q: ze.q,
      r: ze.r,
      radius: ze.radius,
      createdRound: ze.createdRound,
      graphics,
      ring,
      ringTween,
      phase,
      procedural: true,
    };

    // Static procedural effects: draw once at creation
    if (ze.type === 'bloodtrail') {
      this.drawBloodtrailSplotch(inst);
    }

    this.effects.set(ze.id, inst);
  }

  /** Draw the procedural oily sheen effect for a zone. Called every frame. */
  private drawProceduralSheen(inst: ProceduralEffectInstance, t: number): void {
    if (inst.type === 'bloodtrail') return; // static — drawn once at creation
    const graphics = inst.graphics;
    graphics.clear();

    const screen = this.worldToScreen(inst.q, inst.r);
    const cx = screen.x;
    const cy = screen.y + CY_OFFSET;

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

  /** Compute sorted screen-space boundary points for a hex radius zone. */
  private getBoundaryScreenPoints(centerQ: number, centerR: number, radius: number): { x: number; y: number }[] {
    const zoneHexes = new Set<string>();
    for (let q = -radius; q <= radius; q++) {
      const rMin = Math.max(-radius, -q - radius);
      const rMax = Math.min(radius, -q + radius);
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

    if (boundaryHexes.length === 0) return [];

    const screenPoints = boundaryHexes.map(hex => {
      const s = this.worldToScreen(centerQ + hex.q, centerR + hex.r);
      return { x: s.x, y: s.y + CY_OFFSET };
    });

    const centerScreen = this.worldToScreen(centerQ, centerR);
    const ca = centerScreen.y + CY_OFFSET;
    screenPoints.sort((a, b) =>
      Math.atan2(a.y - ca, a.x - centerScreen.x) - Math.atan2(b.y - ca, b.x - centerScreen.x),
    );

    return screenPoints;
  }

  private drawContaminationBoundary(
    graphics: Phaser.GameObjects.Graphics,
    inst: ProceduralEffectInstance,
    t: number,
  ): void {
    const screenPoints = this.getBoundaryScreenPoints(inst.q, inst.r, inst.radius);
    if (screenPoints.length === 0) return;

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
    const screenPoints = this.getBoundaryScreenPoints(ze.q, ze.r, ze.radius);

    if (screenPoints.length === 0) {
      return this.scene.add.graphics();
    }

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
    if (!textureKey) return;
    const frameCount = FRAME_COUNTS[type] ?? 6;
    this.scene.anims.create({
      key: animKey,
      frames: this.scene.anims.generateFrameNumbers(textureKey, { start: 0, end: frameCount - 1 }),
      frameRate: 8,
      repeat: -1,
      yoyo: false,
    });
  }

  private drawBloodtrailSplotch(inst: ProceduralEffectInstance): void {
    const graphics = inst.graphics;
    const screen = this.worldToScreen(inst.q, inst.r);
    const cx = screen.x;
    const cy = screen.y + CY_OFFSET;

    const seed = inst.zoneId.split('').reduce((acc, c, i) => acc + c.charCodeAt(0) * (i + 1), 0);
    const prng = (offset: number) => {
      const x = Math.sin(seed + offset) * 10000;
      return x - Math.floor(x);
    };

    const scale = 24;
    const splotches = [
      { radiusFactor: 0.45, alpha: 0.55, colorIdx: 0, xOff: -0.08, yOff: 0.02 },
      { radiusFactor: 0.35, alpha: 0.6, colorIdx: 1, xOff: 0.1, yOff: -0.05 },
      { radiusFactor: 0.25, alpha: 0.7, colorIdx: 2, xOff: -0.04, yOff: -0.08 },
      { radiusFactor: 0.18, alpha: 0.75, colorIdx: 4, xOff: 0.06, yOff: 0.06 },
      { radiusFactor: 0.12, alpha: 0.65, colorIdx: 0, xOff: -0.12, yOff: 0.1 },
      { radiusFactor: 0.08, alpha: 0.5, colorIdx: 3, xOff: 0.15, yOff: -0.1 },
      { radiusFactor: 0.06, alpha: 0.4, colorIdx: 1, xOff: -0.15, yOff: -0.12 },
    ];

    for (let i = 0; i < splotches.length; i++) {
      const s = splotches[i];
      const jx = (prng(i * 3) - 0.5) * 6;
      const jy = (prng(i * 3 + 1) - 0.5) * 4;
      const ox = s.xOff * scale + jx;
      const oy = s.yOff * scale + jy;
      const r = s.radiusFactor * scale + (prng(i * 3 + 2) - 0.5) * 4;

      graphics.fillStyle(BLOODTRAIL_COLORS[s.colorIdx], s.alpha);
      graphics.fillCircle(cx + ox, cy + oy, Math.max(2, r));
    }

    for (let i = 0; i < 3; i++) {
      const dx = (prng(i * 7 + 50) - 0.5) * 30;
      const dy = (prng(i * 7 + 51) - 0.5) * 18;
      const dr = 1.5 + prng(i * 7 + 52) * 2.5;
      graphics.fillStyle(BLOODTRAIL_COLORS[3], 0.35 + prng(i * 7 + 53) * 0.2);
      graphics.fillCircle(cx + dx, cy + dy, dr);
    }
  }

  /**
   * Life Bloom — Citadel healing aura.
   * Radius-2 zone: concentric pulsing green/gold rings, rising light motes,
   * and a soft radial glow centred on the source hex.
   */
  private drawLifeBloom(inst: ProceduralEffectInstance, t: number): void {
    const graphics = inst.graphics;
    graphics.clear();

    const screen = this.worldToScreen(inst.q, inst.r);
    const cx = screen.x;
    const cy = screen.y + CY_OFFSET;
    const phase = inst.phase;

    // Slow breathing pulse
    const breath = 0.8 + 0.2 * Math.sin(t * 0.6 + phase * Math.PI * 2);

    // --- Layer 1: Soft radial glow (large, faint) ---
    const glowLayers = [
      { radius: 42 * breath, alpha: 0.08 },
      { radius: 34 * breath, alpha: 0.14 },
      { radius: 26 * breath, alpha: 0.18 },
      { radius: 18 * breath, alpha: 0.12 },
    ];
    for (let i = 0; i < glowLayers.length; i++) {
      const gl = glowLayers[i];
      const ox = Math.sin(t * 0.3 + i * 1.7) * 2;
      const oy = Math.cos(t * 0.25 + i * 1.1) * 1.5;
      const colorIdx = Math.floor((t * 0.4 + phase * LIFE_BLOOM_COLORS.length + i) % LIFE_BLOOM_COLORS.length);
      graphics.fillStyle(LIFE_BLOOM_COLORS[colorIdx], gl.alpha);
      graphics.fillCircle(cx + ox, cy + oy, gl.radius);
    }

    // --- Layer 2: Concentric healing rings expanding outward ---
    const ringCount = 3;
    for (let i = 0; i < ringCount; i++) {
      const cycleProgress = ((t * 0.35 + phase + i / ringCount) % 1);
      const ringRadius = 8 + cycleProgress * 38;
      const ringAlpha = (1 - cycleProgress) * 0.35 * breath;
      const colorIdx = Math.floor((t * 0.3 + phase * LIFE_BLOOM_COLORS.length + i * 2) % LIFE_BLOOM_COLORS.length);
      graphics.lineStyle(2, LIFE_BLOOM_COLORS[colorIdx], ringAlpha);
      graphics.strokeCircle(cx, cy, ringRadius);
    }

    // --- Layer 3: Rising light motes ---
    const moteCount = 5;
    for (let i = 0; i < moteCount; i++) {
      const motePhase = (t * 0.5 + phase * 7 + i * 1.37) % 3;
      const my = cy - motePhase * 14; // rise upward
      const mx = cx + Math.sin(t * 0.8 + i * 2.1) * (6 + i * 3);
      const moteAlpha = motePhase < 2 ? (1 - motePhase / 2) * 0.55 * breath : 0;
      if (moteAlpha > 0.01) {
        const colorIdx = Math.floor((t * 0.6 + i * 1.5) % LIFE_BLOOM_COLORS.length);
        graphics.fillStyle(LIFE_BLOOM_COLORS[colorIdx], moteAlpha);
        graphics.fillCircle(mx, my, 2.5 - motePhase * 0.5);
      }
    }

    // --- Layer 4: Center bloom — bright pulsing core ---
    const coreAlpha = 0.3 + 0.15 * Math.sin(t * 1.2 + phase * Math.PI * 2);
    const coreRadius = 6 + 2 * Math.sin(t * 0.8);
    graphics.fillStyle(0xFFEB3B, coreAlpha); // golden center
    graphics.fillCircle(cx, cy, coreRadius);
    graphics.fillStyle(0xCDDC39, coreAlpha * 0.6); // lime halo
    graphics.fillCircle(cx, cy, coreRadius * 1.8);

    // --- Layer 5: Burst flash — bright radial pulse every 3rd round ---
    const roundsSinceCreation = this.currentRound - inst.createdRound;
    if (roundsSinceCreation > 0 && roundsSinceCreation % 3 === 0) {
      const burstCycle = (t * 0.8) % 3; // 3-second visual cycle
      const burstIntensity = burstCycle < 1.5
        ? Math.sin(burstCycle / 1.5 * Math.PI) // ramp up then down
        : 0;
      if (burstIntensity > 0.01) {
        const burstRadius = 30 + burstIntensity * 20;
        const burstAlpha = burstIntensity * 0.5;
        // Bright white-gold flash
        graphics.fillStyle(0xFFFFCC, burstAlpha);
        graphics.fillCircle(cx, cy, burstRadius);
        graphics.fillStyle(0xFFFFFF, burstAlpha * 0.6);
        graphics.fillCircle(cx, cy, burstRadius * 0.5);
        // Expanding ring
        const ringR = 10 + burstCycle * 25;
        graphics.lineStyle(3, 0xFFFFCC, burstAlpha * 0.8);
        graphics.strokeCircle(cx, cy, ringR);
      }
    }

    // --- Layer 6: Contamination-style boundary ring for radius > 0 ---
    if (inst.radius > 0) {
      this.drawLifeBloomBoundary(graphics, inst, t);
    }
  }

  /** Boundary ring for Life Bloom aura zone — soft green dots connected by faint lines. */
  private drawLifeBloomBoundary(
    graphics: Phaser.GameObjects.Graphics,
    inst: ProceduralEffectInstance,
    t: number,
  ): void {
    const screenPoints = this.getBoundaryScreenPoints(inst.q, inst.r, inst.radius);
    if (screenPoints.length === 0) return;

    const boundaryAlpha = 0.25 + 0.15 * Math.sin(t * 0.8 + inst.phase * Math.PI * 2);
    const ringColor = 0x66BB6A; // soft green

    graphics.lineStyle(2, ringColor, boundaryAlpha * 0.7);
    for (let i = 0; i < screenPoints.length; i++) {
      const curr = screenPoints[i];
      const next = screenPoints[(i + 1) % screenPoints.length];
      graphics.lineBetween(curr.x, curr.y, next.x, next.y);
    }

    graphics.fillStyle(ringColor, boundaryAlpha);
    for (const pt of screenPoints) {
      graphics.fillCircle(pt.x, pt.y, 3);
    }
  }

  /**
   * Citadel — fortress + nature_healing synergy.
   * Radius-2 zone: warm amber/gold glow with stone-green accents, a steady
   * pulsing ring, and slow-drifting dust motes. Sturdy and grounded feel
   * (defensive fortress) with a subtle healing undertone (green tinge).
   */
  private drawCitadel(inst: ProceduralEffectInstance, t: number): void {
    const graphics = inst.graphics;
    graphics.clear();

    const screen = this.worldToScreen(inst.q, inst.r);
    const cx = screen.x;
    const cy = screen.y + CY_OFFSET;
    const phase = inst.phase;

    const pulse = 0.85 + 0.15 * Math.sin(t * 0.4 + phase * Math.PI * 2);

    // --- Layer 1: Warm radial glow (stone/amber) ---
    const glowLayers = [
      { radius: 36 * pulse, alpha: 0.07 },
      { radius: 28 * pulse, alpha: 0.12 },
      { radius: 20 * pulse, alpha: 0.16 },
      { radius: 12 * pulse, alpha: 0.10 },
    ];
    for (let i = 0; i < glowLayers.length; i++) {
      const gl = glowLayers[i];
      const ox = Math.sin(t * 0.2 + i * 2.1) * 1.5;
      const oy = Math.cos(t * 0.18 + i * 1.4) * 1;
      const colorIdx = Math.floor((t * 0.25 + phase * CITADEL_COLORS.length + i) % CITADEL_COLORS.length);
      graphics.fillStyle(CITADEL_COLORS[colorIdx], gl.alpha);
      graphics.fillCircle(cx + ox, cy + oy, gl.radius);
    }

    // --- Layer 2: Slow-expanding ring (one at a time, calm) ---
    const ringProgress = (t * 0.2 + phase) % 1;
    const ringRadius = 6 + ringProgress * 30;
    const ringAlpha = (1 - ringProgress) * 0.3 * pulse;
    const colorIdx = Math.floor((t * 0.2 + phase * CITADEL_COLORS.length) % CITADEL_COLORS.length);
    graphics.lineStyle(1.5, CITADEL_COLORS[colorIdx], ringAlpha);
    graphics.strokeCircle(cx, cy, ringRadius);

    // --- Layer 3: Slow-drifting dust motes (grounded, not rising) ---
    const moteCount = 4;
    for (let i = 0; i < moteCount; i++) {
      const motePhase = (t * 0.3 + phase * 5 + i * 1.73) % 4;
      const mx = cx + Math.sin(t * 0.4 + i * 2.5) * (8 + i * 4);
      const my = cy + Math.cos(t * 0.35 + i * 1.9) * (6 + i * 3);
      const moteAlpha = motePhase < 3 ? (1 - motePhase / 3) * 0.35 * pulse : 0;
      if (moteAlpha > 0.01) {
        const ci = Math.floor((t * 0.3 + i * 1.7) % CITADEL_COLORS.length);
        graphics.fillStyle(CITADEL_COLORS[ci], moteAlpha);
        graphics.fillCircle(mx, my, 2 - motePhase * 0.3);
      }
    }

    // --- Layer 4: Center glow — warm amber core ---
    const coreAlpha = 0.25 + 0.1 * Math.sin(t * 0.7 + phase * Math.PI * 2);
    const coreRadius = 5 + 1.5 * Math.sin(t * 0.5);
    graphics.fillStyle(0xD4A057, coreAlpha);
    graphics.fillCircle(cx, cy, coreRadius);
    graphics.fillStyle(0xB8860B, coreAlpha * 0.5);
    graphics.fillCircle(cx, cy, coreRadius * 1.6);

    // --- Layer 5: Boundary ring ---
    if (inst.radius > 0) {
      this.drawCitadelBoundary(graphics, inst, t);
    }
  }

  /** Boundary ring for Citadel — warm amber dots connected by faint gold lines. */
  private drawCitadelBoundary(
    graphics: Phaser.GameObjects.Graphics,
    inst: ProceduralEffectInstance,
    t: number,
  ): void {
    const screenPoints = this.getBoundaryScreenPoints(inst.q, inst.r, inst.radius);
    if (screenPoints.length === 0) return;

    const boundaryAlpha = 0.2 + 0.1 * Math.sin(t * 0.5 + inst.phase * Math.PI * 2);
    const ringColor = 0xD4A057;

    graphics.lineStyle(2, ringColor, boundaryAlpha * 0.6);
    for (let i = 0; i < screenPoints.length; i++) {
      const curr = screenPoints[i];
      const next = screenPoints[(i + 1) % screenPoints.length];
      graphics.lineBetween(curr.x, curr.y, next.x, next.y);
    }

    graphics.fillStyle(ringColor, boundaryAlpha);
    for (const pt of screenPoints) {
      graphics.fillCircle(pt.x, pt.y, 3);
    }
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
