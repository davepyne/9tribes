import Phaser from 'phaser';
import type { WorldViewModel } from '../../types/worldView';
import { TEXTURES } from '../assets/keys';

export class SelectionRenderer {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Container,
    private readonly worldToScreen: (q: number, r: number) => { x: number; y: number },
  ) {}

  render(world: WorldViewModel, _selected: unknown, inspectedKey: string | null, hoveredKey: string | null) {
    this.layer.removeAll(true);

    if (hoveredKey) {
      const point = this.worldToScreen(...hoveredKey.split(',').map(Number) as [number, number]);
      this.layer.add(
        this.scene.add.image(point.x, point.y, TEXTURES.selection, 1)
          .setOrigin(0.5, 1)
          .setAlpha(0.45)
          .setTint(0xf7e7bf),
      );
    }

    if (inspectedKey) {
      const [q, r] = inspectedKey.split(',').map(Number);
      const point = this.worldToScreen(q, r);
      this.layer.add(
        this.scene.add.image(point.x, point.y, TEXTURES.selection, 0)
          .setOrigin(0.5, 1)
          .setScale(1.1)
          .setAlpha(0.9)
          .setTint(0xffd84d),
      );
    }
  }
}
