import Phaser from 'phaser';
import type { BorderEdgeView, WorldViewModel } from '../../types/worldView';
import { TILE_HALF_WIDTH, TILE_HALF_HEIGHT } from '../assets/keys';

export class BorderRenderer {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Container,
    private readonly worldToScreen: (q: number, r: number) => { x: number; y: number },
  ) {}

  render(world: WorldViewModel) {
    this.layer.removeAll(true);
    const graphics = this.scene.add.graphics();

    for (const edge of world.overlays.borders) {
      const { x, y } = this.worldToScreen(edge.q, edge.r);
      const color = Phaser.Display.Color.HexStringToColor(edge.color).color;

      graphics.lineStyle(5, color, 0.95);
      this.drawHexEdge(graphics, x, y, edge.side);
      graphics.lineStyle(2, 0xf7e7bf, 0.22);
      this.drawHexEdge(graphics, x, y, edge.side);
    }

    this.layer.add(graphics);
  }

  private drawHexEdge(graphics: Phaser.GameObjects.Graphics, x: number, y: number, side: BorderEdgeView['side']) {
    const HW = TILE_HALF_WIDTH;
    const TH = TILE_HALF_HEIGHT;

    switch (side) {
      case 'west':
        graphics.lineBetween(x - HW, y - TH, x - HW, y + TH);
        break;
      case 'east':
        graphics.lineBetween(x + HW, y - TH, x + HW, y + TH);
        break;
      case 'north':
        graphics.lineBetween(x, y - TH, x - HW, y - TH);
        break;
      case 'south':
        graphics.lineBetween(x, y + TH, x + HW, y + TH);
        break;
    }
  }
}
