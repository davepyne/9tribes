import Phaser from 'phaser';
import type { BorderEdgeView, WorldViewModel } from '../../types/worldView';
import { CY_OFFSET, TILE_HEIGHT, TILE_WIDTH } from '../assets/keys';

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
      const point = this.worldToScreen(edge.q, edge.r);
      const color = Phaser.Display.Color.HexStringToColor(edge.color).color;
      graphics.lineStyle(5, color, 0.95);
      drawEdge(graphics, point.x, point.y + CY_OFFSET, edge);
      graphics.lineStyle(2, 0xf7e7bf, 0.22);
      drawEdge(graphics, point.x, point.y + CY_OFFSET, edge);
    }

    this.layer.add(graphics);
  }
}

function drawEdge(graphics: Phaser.GameObjects.Graphics, x: number, y: number, edge: BorderEdgeView) {
  const left = x - TILE_WIDTH / 2;
  const right = x + TILE_WIDTH / 2;
  const top = y - TILE_HEIGHT / 2;
  const bottom = y + TILE_HEIGHT / 2;
  const nwMidX = left + TILE_WIDTH / 4;
  const nwMidY = top + TILE_HEIGHT / 4;
  const neMidX = right - TILE_WIDTH / 4;
  const neMidY = top + TILE_HEIGHT / 4;
  const seMidX = right - TILE_WIDTH / 4;
  const seMidY = bottom - TILE_HEIGHT / 4;
  const swMidX = left + TILE_WIDTH / 4;
  const swMidY = bottom - TILE_HEIGHT / 4;

  switch (edge.side) {
    case 'nw':
      graphics.lineBetween(left, y, x, top);
      break;
    case 'n':
      graphics.lineBetween(x, top, neMidX, neMidY);
      graphics.lineBetween(x, top, nwMidX, nwMidY);
      break;
    case 'ne':
      graphics.lineBetween(x, top, right, y);
      break;
    case 'se':
      graphics.lineBetween(right, y, x, bottom);
      break;
    case 's':
      graphics.lineBetween(x, bottom, swMidX, swMidY);
      graphics.lineBetween(x, bottom, seMidX, seMidY);
      break;
    case 'sw':
      graphics.lineBetween(x, bottom, left, y);
      break;
  }
}
