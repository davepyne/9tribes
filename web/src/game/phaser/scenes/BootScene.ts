import Phaser from 'phaser';
import { assetManifest } from '../assets/assetManifest';
import { initializeFreelandTerrainFrames } from '../assets/keys';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    for (const asset of assetManifest) {
      if (asset.kind === 'sheet') {
        this.load.spritesheet(asset.key, asset.path, asset.frameConfig);
      } else if (asset.kind === 'text') {
        this.load.text(asset.key, asset.path);
      } else {
        this.load.image(asset.key, asset.path);
      }
    }
  }

  create() {
    initializeFreelandTerrainFrames(this);
    this.scene.start('MapScene');
  }
}
