import { getTerrainOverlayTagForTile } from '../web/src/game/phaser/assets/keys.js';

describe('getTerrainOverlayTagForTile', () => {
  it('builds swamp overlay tags from connected hex neighbors', () => {
    const terrainByKey = new Map<string, string>([
      ['5,4', 'swamp'],
      ['6,5', 'swamp'],
      ['5,6', 'swamp'],
    ]);

    expect(getTerrainOverlayTagForTile('swamp', 5, 5, (q, r) => terrainByKey.get(`${q},${r}`))).toBe(
      't.l1.swamp_nw0n0ne1se1s0sw1',
    );
  });

  it('uses the mountains tag prefix for mountain overlay resolution', () => {
    const terrainByKey = new Map<string, string>([
      ['4,5', 'mountain'],
      ['5,6', 'mountain'],
    ]);

    expect(getTerrainOverlayTagForTile('mountain', 5, 5, (q, r) => terrainByKey.get(`${q},${r}`))).toBe(
      't.l1.mountains_nw1n0ne0se0s0sw1',
    );
  });
});
