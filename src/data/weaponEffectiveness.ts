// Weapon effectiveness table: weapon tag -> target movement class -> modifier
// Ported from war-civ first draft

export interface WeaponEffectivenessEntry {
  weaponTag: string;
  targetMovementClass: string;
  attackModifier: number;
}

export const weaponEffectivenessTable: WeaponEffectivenessEntry[] = [
  // Spears are strong against cavalry (reach advantage)
  { weaponTag: "spear", targetMovementClass: "cavalry", attackModifier: 0.5 },
  { weaponTag: "spear", targetMovementClass: "camel", attackModifier: 0.35 },
  { weaponTag: "spear", targetMovementClass: "beast", attackModifier: 0.15 },

  // Ranged weapons are weak against cavalry (hard to hit fast targets)
  { weaponTag: "ranged", targetMovementClass: "cavalry", attackModifier: -0.25 },
  { weaponTag: "ranged", targetMovementClass: "camel", attackModifier: -0.15 },
  { weaponTag: "ranged", targetMovementClass: "beast", attackModifier: 0 },

  // Camels unsettle horse cavalry in open warfare.
  { weaponTag: "camel", targetMovementClass: "cavalry", attackModifier: 0.5 },
];

export function getWeaponEffectiveness(
  weaponTags: string[],
  targetMovementClass: string
): number {
  let totalModifier = 0;

  for (const tag of weaponTags) {
    const entry = weaponEffectivenessTable.find(
      (e) => e.weaponTag === tag && e.targetMovementClass === targetMovementClass
    );
    if (entry) {
      totalModifier += entry.attackModifier;
    }
  }

  return totalModifier;
}
