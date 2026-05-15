// Non-combat tuning values for emergent rules.
// Combat effects live in each rule's PrimitiveEffect[] (resolved by the
// primitive dispatcher). This file holds values used by non-combat systems
// (healing, movement, economy, etc.).

export const EMERGENT_PARAMS = {
  terrain_lord: {
    nativeTerrainDamageBonus: 0.5,
    doubleChargeRangeInNativeTerrain: true,
    terraformCharges: 3,
  },
  paladin: {
    healPercentOfDamage: 0.5,
    minHp: 1,
    smiteBonusAtFullHp: 1.0,
  },
  terrain_assassin: {
    terrainTypes: ['desert', 'coast', 'hill'],
  },
  standing_stone: {
    anchoredAuraRadius: 4,
    anchoredDefenseBonus: 0.3,
    anchoredHealPerTurn: 5,
    anchoredSelfRegen: 8,
    anchoredAdjacentDamage: 2,
    damageSharePercent: 0.5,
    tarPitMovementPenalty: 2,
    marchAuraRadius: 1,
    marchDefenseBonus: 0.15,
    marchHealPerTurn: 2,
  },
  ghost_army: {
    phaseDistance: 4,
    killChainRedeployRange: 99,
    phaseAlliesMovementBonus: 2,
  },
  juggernaut: {
    domainSignatures: {
      venom: { poisonPerHit: 1 },
      fortress: { damageReflection: 0.3 },
      charge: { knockbackOnKill: 1, damageBehindPercent: 0.5 },
      hitrun: { freeRepositionAfterKill: 1 },
      heavy_hitter: { armorPiercePercent: 0.5 },
      slaving: { captureBelowHpPercent: 0.25 },
      tidal_warfare: { bonusDamageAdjacentToWater: 2 },
    },
    undyingOncePerCombat: true,
    ignoreZoc: true,
  },
  slave_empire: {
    captureAuraRadius: 2,
    captureChanceBonus: 0.2,
    slaveProductionBonus: 0.5,
  },
  raid_camp: {
    campPlacementRange: 5,
    campDuration: 2,
    campStealthDuration: 1,
    campMovementBonus: 2,
    campEnemyRadius: 3,
    campEnemyDefensePenalty: 0.25,
    captureBonus: 0.3,
  },
  poison_shadow: {
    stealthPoisonStacks: 3,
    retreatPoisonCloud: true,
    poisonCloudDamage: 2,
  },
  iron_turtle: {
    crushingZoneRadius: 3,
    crushingZoneDamage: 2,
    crushingZoneMovementPenalty: 1,
    damageReflection: 0.5,
    ignoreZoc: true,
  },
  many_faced: {
    bulwarkDefense: 0.4,
    bulwarkReflection: 0.25,
    predatorDamage: 0.4,
    predatorRangeBonus: 1,
    phantomMovementBonus: 1,
  },
} as const;
