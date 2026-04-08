// Improvement entity types
import type { ImprovementId } from '../../types.js';
import type { HexCoord } from '../../types.js';
import type { FactionId } from '../../types.js';
import type { ImprovementCategory } from '../../core/enums.js';

export interface Improvement {
  id: ImprovementId;
  type: ImprovementCategory;
  position: HexCoord;
  ownerFactionId: FactionId | null;
  defenseBonus: number;
}
