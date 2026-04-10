import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { MapScene } from './scenes/MapScene.js';
export function createGame(parent, controller) {
    return new Phaser.Game({
        type: Phaser.AUTO,
        parent,
        backgroundColor: '#17130e',
        scale: {
            mode: Phaser.Scale.RESIZE,
            autoCenter: Phaser.Scale.CENTER_BOTH,
            width: parent.clientWidth || 1280,
            height: parent.clientHeight || 720,
        },
        input: {
            windowEvents: false,
        },
        render: {
            antialias: false,
            pixelArt: true,
            roundPixels: true,
        },
        scene: [new BootScene(), new MapScene(controller)],
    });
}
