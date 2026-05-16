import Phaser from 'phaser';
import type { WorldViewModel } from '../../types/worldView';
import { CY_OFFSET } from '../assets/keys';

// ── Mutation animation kinds ────────────────────────────────────
// shockwave: expanding ring from center + staggered hex flashes (Oasis)
// sprout:    green burst — shrink-in → grow-out → fade (Sapling)
// pulse:     simple bright flash with slight expansion (Reshape / default)
type MutationKind = 'shockwave' | 'sprout' | 'pulse';

type PendingMutation = {
  q: number;
  r: number;
  kind: MutationKind;
  color: number;
  graphics: Phaser.GameObjects.Graphics;
  startTime: number;
  duration: number;
};

// Terrain → flash color. Determines visual identity of the mutation.
const TERRAIN_FLASH_COLORS: Record<string, number> = {
  desert: 0xFFB74D,   // warm amber
  forest: 0x66BB6A,   // green
  tundra: 0xB0BEC5,   // cool gray-blue
  savannah: 0xC0CA33,  // yellow-green
  swamp: 0x7E57C2,    // purple
  mountain: 0x8D6E63,  // brown
  coast: 0x4FC3F7,    // light blue
  jungle: 0x2E7D32,   // dark green
};

const DEFAULT_FLASH_COLOR = 0xFFFFFF;

/**
 * Detects terrain mutations between state renders and plays brief
 * procedural flash/shockwave/sprout animations on the affected hexes.
 *
 * Post-rebuild approach (Option A): the TileLayerRenderer has already
 * nuked and rebuilt all tiles by the time this runs. The animator
 * overlays a short-lived Graphics effect on the new terrain to sell
 * the "transformation" moment.
 *
 * No sprite sheets, no asset pipeline. Pure procedural Graphics + tweens.
 */
export class TerrainMutationAnimator {
  private previousTerrains: Map<string, string> = new Map();
  private pending: PendingMutation[] = [];
  private updateBound: ((time: number, delta: number) => void) | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Container,
    private readonly worldToScreen: (q: number, r: number) => { x: number; y: number },
  ) {}

  render(world: WorldViewModel): void {
    // Build current terrain snapshot
    const currentTerrains = new Map<string, string>();
    for (const hex of world.map.hexes) {
      currentTerrains.set(hex.key, hex.terrain);
    }

    // Diff: only hexes that existed before AND changed terrain
    const changed: { q: number; r: number; key: string; newTerrain: string }[] = [];
    for (const hex of world.map.hexes) {
      const prev = this.previousTerrains.get(hex.key);
      if (prev !== undefined && prev !== hex.terrain) {
        changed.push({ q: hex.q, r: hex.r, key: hex.key, newTerrain: hex.terrain });
      }
    }

    if (changed.length > 0) {
      this.spawnMutations(changed);
    }

    // Update snapshot for next diff
    this.previousTerrains = currentTerrains;

    // Ensure per-frame update loop is running
    if (this.pending.length > 0 && !this.updateBound) {
      this.updateBound = this.update.bind(this);
      this.scene.events.on('update', this.updateBound);
    }
  }

  // ── Mutation spawning ────────────────────────────────────────

  private spawnMutations(changes: { q: number; r: number; newTerrain: string }[]): void {
    // Group changes by new terrain type
    const byTerrain = new Map<string, { q: number; r: number; newTerrain: string }[]>();
    for (const c of changes) {
      let group = byTerrain.get(c.newTerrain);
      if (!group) {
        group = [];
        byTerrain.set(c.newTerrain, group);
      }
      group.push(c);
    }

    for (const [, group] of byTerrain) {
      const color = TERRAIN_FLASH_COLORS[group[0].newTerrain] ?? DEFAULT_FLASH_COLOR;

      if (group.length >= 5) {
        // Multi-hex mutation — likely Oasis (2-hex radius = 7+ hexes).
        // Shockwave ring from center + staggered hex flashes per ring.
        const { q: cq, r: cr } = this.centroid(group);

        // Expanding shockwave ring from center
        this.addPending(cq, cr, 'shockwave', color, 1500);

        // Stagger individual hex flashes outward
        for (const hex of group) {
          const dist = hexDistance(cq, cr, hex.q, hex.r);
          const delay = dist * 150; // 150ms per hex ring
          this.scene.time.delayedCall(delay, () => {
            this.addPending(hex.q, hex.r, 'pulse', color, 500);
          });
        }
      } else if (group.length === 1 && group[0].newTerrain === 'forest') {
        // Single hex → forest: Sapling sprout
        this.addPending(group[0].q, group[0].r, 'sprout', color, 700);
      } else {
        // Default: bright pulse on each hex (Reshape, misc)
        for (const hex of group) {
          this.addPending(hex.q, hex.r, 'pulse', color, 600);
        }
      }
    }
  }

  private addPending(q: number, r: number, kind: MutationKind, color: number, duration: number): void {
    const graphics = this.scene.add.graphics();
    this.layer.add(graphics);

    this.pending.push({ q, r, kind, color, graphics, startTime: Date.now(), duration });

    // Ensure loop is running
    if (!this.updateBound) {
      this.updateBound = this.update.bind(this);
      this.scene.events.on('update', this.updateBound);
    }
  }

  // ── Per-frame update ─────────────────────────────────────────

  private update(_time: number, _delta: number): void {
    const now = Date.now();
    const remaining: PendingMutation[] = [];

    for (const mut of this.pending) {
      const elapsed = now - mut.startTime;
      const progress = Math.min(elapsed / mut.duration, 1);

      if (progress >= 1) {
        mut.graphics.destroy();
        continue;
      }

      mut.graphics.clear();

      switch (mut.kind) {
        case 'shockwave':
          this.drawShockwave(mut, progress);
          break;
        case 'sprout':
          this.drawSprout(mut, progress);
          break;
        case 'pulse':
          this.drawPulse(mut, progress);
          break;
      }

      remaining.push(mut);
    }

    this.pending = remaining;

    // Stop loop when all effects are done
    if (this.pending.length === 0 && this.updateBound) {
      this.scene.events.off('update', this.updateBound);
      this.updateBound = null;
    }
  }

  // ── Drawing routines ─────────────────────────────────────────

  /** Expanding ring with inner glow — the Oasis shockwave. */
  private drawShockwave(mut: PendingMutation, progress: number): void {
    const { cx, cy } = this.screenCenter(mut);
    const maxRadius = 160; // ~3 hex-radii, covers a 2-hex zone
    const radius = progress * maxRadius;
    const alpha = 0.7 * (1 - progress);

    // Expanding ring
    mut.graphics.lineStyle(4, mut.color, alpha);
    mut.graphics.strokeCircle(cx, cy, radius);

    // Inner glow fading behind the ring
    mut.graphics.fillStyle(mut.color, alpha * 0.3);
    mut.graphics.fillCircle(cx, cy, radius * 0.5);
  }

  /**
   * Three-phase sprout animation:
   *   0.0–0.35  Converge — ring shrinks from hex edges to center
   *   0.35–0.65 Burst   — green orb expands from center + leaf particles
   *   0.65–1.00 Fade    — soft glow dissipates
   */
  private drawSprout(mut: PendingMutation, progress: number): void {
    const { cx, cy } = this.screenCenter(mut);

    if (progress < 0.35) {
      // Phase 1: shrinking ring converging to center
      const p = progress / 0.35;
      const radius = 46 * (1 - p);
      const alpha = 0.6 * p;
      mut.graphics.fillStyle(mut.color, alpha);
      mut.graphics.fillCircle(cx, cy, radius);
      mut.graphics.lineStyle(2, mut.color, alpha);
      mut.graphics.strokeCircle(cx, cy, radius);
    } else if (progress < 0.65) {
      // Phase 2: burst from center + leaf-like dots
      const p = (progress - 0.35) / 0.3;
      const radius = 22 * p;
      const alpha = 0.85;
      mut.graphics.fillStyle(mut.color, alpha);
      mut.graphics.fillCircle(cx, cy, radius);

      // 6 leaf particles radiating outward
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 + p * 0.5;
        const dist = radius * 1.8;
        const px = cx + Math.cos(angle) * dist;
        const py = cy + Math.sin(angle) * dist * 0.6; // squish for hex perspective
        mut.graphics.fillStyle(0x81C784, alpha * 0.7);
        mut.graphics.fillCircle(px, py, 3);
      }
    } else {
      // Phase 3: fading glow
      const p = (progress - 0.65) / 0.35;
      const alpha = 0.5 * (1 - p);
      mut.graphics.fillStyle(mut.color, alpha * 0.3);
      mut.graphics.fillCircle(cx, cy, 30);
    }
  }

  /** Simple bright flash that fades with slight expansion. */
  private drawPulse(mut: PendingMutation, progress: number): void {
    const { cx, cy } = this.screenCenter(mut);
    const alpha = 0.8 * (1 - progress * progress); // ease-out
    const radius = 30 + 15 * progress; // slight expansion

    mut.graphics.fillStyle(mut.color, alpha);
    mut.graphics.fillCircle(cx, cy, radius);

    // Edge ring
    mut.graphics.lineStyle(2, mut.color, alpha * 0.6);
    mut.graphics.strokeCircle(cx, cy, radius);
  }

  // ── Helpers ──────────────────────────────────────────────────

  private screenCenter(mut: { q: number; r: number }): { cx: number; cy: number } {
    const screen = this.worldToScreen(mut.q, mut.r);
    return { cx: screen.x, cy: screen.y + CY_OFFSET };
  }

  private centroid(hexes: { q: number; r: number }[]): { q: number; r: number } {
    let sq = 0, sr = 0;
    for (const h of hexes) { sq += h.q; sr += h.r; }
    return { q: Math.round(sq / hexes.length), r: Math.round(sr / hexes.length) };
  }

  destroy(): void {
    if (this.updateBound) {
      this.scene.events.off('update', this.updateBound);
      this.updateBound = null;
    }
    for (const mut of this.pending) {
      mut.graphics.destroy();
    }
    this.pending = [];
  }
}

// Axial hex distance
function hexDistance(q1: number, r1: number, q2: number, r2: number): number {
  return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
}
