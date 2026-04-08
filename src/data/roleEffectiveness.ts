// Role effectiveness table: attackerRole -> defenderRole -> modifier
// Ported from war-civ first draft

export interface RoleEffectivenessEntry {
  attackerRole: string;
  defenderRole: string;
  attackModifier: number;
}

export const roleEffectivenessTable: RoleEffectivenessEntry[] = [
  // Mounted units are strong against ranged (can close distance quickly)
  { attackerRole: "mounted", defenderRole: "ranged", attackModifier: 0.5 },

  // Melee units are weak against mounted (hard to hit fast targets)
  { attackerRole: "melee", defenderRole: "mounted", attackModifier: -0.25 },

  // Ranged units are weak against melee in close combat
  { attackerRole: "ranged", defenderRole: "melee", attackModifier: -0.25 },

  // All combat units are strong against support
  { attackerRole: "melee", defenderRole: "support", attackModifier: 0.25 },
  { attackerRole: "ranged", defenderRole: "support", attackModifier: 0.25 },
  { attackerRole: "mounted", defenderRole: "support", attackModifier: 0.25 },
];

export function getRoleEffectiveness(attackerRole: string, defenderRole: string): number {
  const entry = roleEffectivenessTable.find(
    (e) => e.attackerRole === attackerRole && e.defenderRole === defenderRole
  );
  return entry?.attackModifier ?? 0;
}
