export type FreecivGridTile = {
  row: number;
  column: number;
  tags: string[];
};

export function parseFreecivGridMainTiles(specText: string): FreecivGridTile[] {
  const lines = specText.split(/\r?\n/);
  const tiles: FreecivGridTile[] = [];
  let inTilesBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!inTilesBlock) {
      if (trimmed.startsWith('tiles = {')) {
        inTilesBlock = true;
      }
      continue;
    }

    if (trimmed === '}') {
      break;
    }

    if (!trimmed || trimmed.startsWith(';') || trimmed.includes('"row"')) {
      continue;
    }

    const match = /^(-?\d+)\s*,\s*(-?\d+)\s*,\s*(.+)$/.exec(trimmed);
    if (!match) {
      throw new Error(`Malformed .spec tile entry: "${trimmed}"`);
    }

    const tags = Array.from(match[3].matchAll(/"([^"]+)"/g), (tagMatch) => tagMatch[1]);
    if (tags.length === 0) {
      throw new Error(`Missing tag list in .spec tile entry: "${trimmed}"`);
    }

    tiles.push({
      row: Number(match[1]),
      column: Number(match[2]),
      tags,
    });
  }

  if (!inTilesBlock) {
    throw new Error('Missing tiles block in Freeciv .spec.');
  }

  if (tiles.length === 0) {
    throw new Error('No tile entries found in Freeciv .spec.');
  }

  return tiles;
}

export function buildTagFrameLookup(tiles: ReadonlyArray<FreecivGridTile>, columns: number): Map<string, number> {
  if (columns <= 0) {
    throw new Error(`Invalid columns count: ${columns}`);
  }

  const lookup = new Map<string, number>();
  for (const tile of tiles) {
    const frame = tile.row * columns + tile.column;
    for (const tag of tile.tags) {
      if (lookup.has(tag)) {
        throw new Error(`Duplicate tag "${tag}" in Freeciv .spec.`);
      }
      lookup.set(tag, frame);
    }
  }
  return lookup;
}

export function parseFreecivTagFrameLookup(specText: string, columns: number): Map<string, number> {
  const tiles = parseFreecivGridMainTiles(specText);
  return buildTagFrameLookup(tiles, columns);
}
