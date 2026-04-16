import Phaser from 'phaser';
import type { WorldViewModel } from '../../types/worldView';
import { getUnitTextureSpec } from '../assets/keys';

export class ImprovementRenderer {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Container,
    private readonly worldToScreen: (q: number, r: number) => { x: number; y: number },
  ) {}

  render(world: WorldViewModel) {
    this.layer.removeAll(true);

    for (const improvement of world.improvements) {
      if (improvement.type !== 'fortification') {
        continue;
      }

      if (!improvement.visible) {
        continue;
      }

      const point = this.worldToScreen(improvement.q, improvement.r);
      const ownerColor = world.factions.find((faction) => faction.id === improvement.ownerFactionId)?.color ?? null;
      const texture = getUnitTextureSpec(improvement.spriteKey);
      const sprite = (
        texture.kind === 'sheet'
          ? this.scene.add.image(point.x, point.y - texture.yOffset, texture.texture, texture.frame)
          : this.scene.add.image(point.x, point.y - texture.yOffset, texture.texture)
      )
        .setOrigin(0.5, 1)
        .setDisplaySize(texture.displayWidth, texture.displayHeight)
        .setAlpha(0.95);

      if (ownerColor) {
        sprite.setTint(Phaser.Display.Color.HexStringToColor(ownerColor).color);
      }

      this.layer.add(sprite);
    }
  }
}
