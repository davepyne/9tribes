const SETTLEMENT_FRAME_COLUMNS = 12;
const VILLAGE_COLUMN = 0;
const CITY_COLUMN = 3;

const SETTLEMENT_ROW_BY_FACTION: Record<string, number> = {
  steppe_clan: 0,
  jungle_clan: 1,
  river_people: 1,
  savannah_lions: 1,
  druid_circle: 2,
  frost_wardens: 2,
  hill_clan: 3,
  desert_nomads: 4,
  coral_people: 6,
};

export type SettlementRenderKind = 'village' | 'city';

const frame = (row: number, col: number, columns: number) => row * columns + col;

export function getSettlementFrame(factionId: string, kind: SettlementRenderKind): number {
  const row = SETTLEMENT_ROW_BY_FACTION[factionId] ?? 0;
  const col = kind === 'village' ? VILLAGE_COLUMN : CITY_COLUMN;
  return frame(row, col, SETTLEMENT_FRAME_COLUMNS);
}
