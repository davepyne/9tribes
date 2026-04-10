import Phaser from 'phaser';
import { TILE_HEIGHT, TILE_WIDTH } from '../assets/keys.js';
export class BorderRenderer {
    scene;
    layer;
    worldToScreen;
    constructor(scene, layer, worldToScreen) {
        this.scene = scene;
        this.layer = layer;
        this.worldToScreen = worldToScreen;
    }
    render(world) {
        this.layer.removeAll(true);
        const graphics = this.scene.add.graphics();
        for (const edge of world.overlays.borders) {
            const point = this.worldToScreen(edge.q, edge.r);
            const color = Phaser.Display.Color.HexStringToColor(edge.color).color;
            graphics.lineStyle(5, color, 0.95);
            drawEdge(graphics, point.x, point.y, edge);
            graphics.lineStyle(2, 0xf7e7bf, 0.22);
            drawEdge(graphics, point.x, point.y, edge);
        }
        this.layer.add(graphics);
    }
}
function drawEdge(graphics, x, y, edge) {
    const left = x - TILE_WIDTH / 2;
    const right = x + TILE_WIDTH / 2;
    const top = y - TILE_HEIGHT / 2;
    const bottom = y + TILE_HEIGHT / 2;
    switch (edge.side) {
        case 'north':
            graphics.lineBetween(x, top, right, y);
            break;
        case 'east':
            graphics.lineBetween(right, y, x, bottom);
            break;
        case 'south':
            graphics.lineBetween(x, bottom, left, y);
            break;
        case 'west':
            graphics.lineBetween(left, y, x, top);
            break;
    }
}
