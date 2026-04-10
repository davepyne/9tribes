import Phaser from 'phaser';
import { getSettlementFrame, TEXTURES } from '../assets/keys.js';
export class SettlementRenderer {
    scene;
    layer;
    worldToScreen;
    constructor(scene, layer, worldToScreen) {
        this.scene = scene;
        this.layer = layer;
        this.worldToScreen = worldToScreen;
    }
    render(world, callbacks) {
        this.layer.removeAll(true);
        for (const city of world.cities) {
            const point = this.worldToScreen(city.q, city.r);
            const factionColor = Phaser.Display.Color.HexStringToColor(world.factions.find((faction) => faction.id === city.factionId)?.color ?? '#c8b68e').color;
            const backing = this.scene.add.ellipse(point.x, point.y - 16, 58, 30, 0x120f0c, 0.72)
                .setStrokeStyle(3, factionColor, 0.82);
            this.layer.add(backing);
            const sprite = this.scene.add.image(point.x, point.y - 6, TEXTURES.cities, getSettlementFrame(city.factionId, 'city'))
                .setOrigin(0.5, 1)
                .setInteractive({ cursor: 'pointer' });
            sprite.on('pointerdown', (pointer) => callbacks.onCitySelected(city.id, pointer));
            this.layer.add(sprite);
            const label = this.scene.add.text(point.x, point.y - 60, city.name, {
                fontFamily: 'Georgia, serif',
                fontSize: '12px',
                color: '#f7e7bf',
                stroke: '#1b140f',
                strokeThickness: 3,
            }).setOrigin(0.5, 1);
            this.layer.add(label);
        }
        for (const village of world.villages) {
            const point = this.worldToScreen(village.q, village.r);
            const factionColor = Phaser.Display.Color.HexStringToColor(world.factions.find((faction) => faction.id === village.factionId)?.color ?? '#d7c692').color;
            const sprite = this.scene.add.image(point.x, point.y - 4, TEXTURES.cities, getSettlementFrame(village.factionId, 'village'))
                .setOrigin(0.5, 1)
                .setScale(0.9)
                .setInteractive({ cursor: 'pointer' });
            sprite.on('pointerdown', () => callbacks.onVillageSelected(village.id));
            this.layer.add(sprite);
        }
    }
}
