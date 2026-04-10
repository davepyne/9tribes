import Phaser from 'phaser';
import { TEXTURES } from '../assets/keys.js';
export class ImprovementRenderer {
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
        for (const improvement of world.improvements) {
            if (improvement.type !== 'fortification') {
                continue;
            }
            const point = this.worldToScreen(improvement.q, improvement.r);
            const ownerColor = world.factions.find((faction) => faction.id === improvement.ownerFactionId)?.color ?? null;
            const sprite = this.scene.add.image(point.x, point.y - 8, TEXTURES.hillFortress)
                .setOrigin(0.5, 1)
                .setDisplaySize(48, 64)
                .setAlpha(0.95);
            if (ownerColor) {
                sprite.setTint(Phaser.Display.Color.HexStringToColor(ownerColor).color);
            }
            this.layer.add(sprite);
        }
    }
}
