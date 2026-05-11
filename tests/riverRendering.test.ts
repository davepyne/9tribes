import { getRiverOverlayFrameForTile } from '../web/src/game/phaser/assets/keys.js';

describe('getRiverOverlayFrameForTile', () => {
  it('maps N-S hex neighbors to the correct frame', () => {
    const terrainByKey = new Map<string, string>([
      ['4,5', 'river'],
      ['6,6', 'river'],
    ]);

    // nw=true(1) + s=true(4) = 5
    expect(getRiverOverlayFrameForTile(5, 5, (q, r) => terrainByKey.get(`${q},${r}`))).toBe(5);
  });

  it('maps NE-SW hex neighbors to the correct frame', () => {
    const terrainByKey = new Map<string, string>([
      ['5,4', 'river'],
      ['5,6', 'river'],
    ]);

    // ne=true(16) + sw=true(2) = 18
    expect(getRiverOverlayFrameForTile(5, 5, (q, r) => terrainByKey.get(`${q},${r}`))).toBe(18);
  });

  it('connects river mouths into adjacent coast tiles', () => {
    const terrainByKey = new Map<string, string>([
      ['4,5', 'river'],
      ['6,6', 'coast'],
    ]);

    // nw=true(1) + s=true(4) = 5
    expect(getRiverOverlayFrameForTile(5, 5, (q, r) => terrainByKey.get(`${q},${r}`))).toBe(5);
  });
});
