import type { CombatActionEffect, CombatActionEffectCategory } from './types.js';

export function formatPercent(value: number): string {
  return `${value > 0 ? '+' : ''}${Math.round(value * 100)}%`;
}

export function humanizeCombatEffect(effect: string): { label: string; detail: string } | null {
  const poisonAura = effect.match(/^poison_aura_radius_(\d+)$/);
  if (poisonAura) {
    return { label: 'Poison Aura', detail: `Applied poison pressure in radius ${poisonAura[1]}.` };
  }
  const landAura = effect.match(/^land_aura_radius_(\d+)$/);
  if (landAura) {
    return { label: 'Land Aura', detail: `Granted a defensive aura in radius ${landAura[1]}.` };
  }
  const healingRadius = effect.match(/^extended_healing_radius_(\d+)$/);
  if (healingRadius) {
    return { label: 'Extended Healing', detail: `Healing aura extended to radius ${healingRadius[1]}.` };
  }
  const stealthReveal = effect.match(/^stealth_aura_reveal_(\d+)$/);
  if (stealthReveal) {
    return { label: 'Stealth Aura', detail: `Threatened hidden enemies within radius ${stealthReveal[1]}.` };
  }
  const combatHealing = effect.match(/^combat_healing_(\d+)%$/);
  if (combatHealing) {
    return { label: 'Combat Healing', detail: `Converted ${combatHealing[1]}% of dealt damage into healing.` };
  }
  const sandstorm = effect.match(/^sandstorm_damage_(\d+)_accuracy_debuff_(\d+\.?\d*)$/);
  if (sandstorm) {
    return { label: 'Sandstorm', detail: `Dealt ${sandstorm[1]} area damage and reduced accuracy by ${formatPercent(-Number(sandstorm[2]))}.` };
  }
  const withering = effect.match(/^withering_healing_reduction_(\d+)%$/);
  if (withering) {
    return { label: 'Withering', detail: `Reduced incoming healing by ${withering[1]}%.` };
  }
  const poisonMultiplier = effect.match(/^poison_multiplier_(\d+\.?\d*)x$/);
  if (poisonMultiplier) {
    return { label: 'Poison Multiplier', detail: `Amplified attack output by ${poisonMultiplier[1]}x.` };
  }
  const frostSpeed = effect.match(/^frost_speed_movement_(\d+)$/);
  if (frostSpeed) {
    return { label: 'Frost Speed', detail: `Adjusted movement by ${frostSpeed[1]} on frozen ground.` };
  }
  const healOnRetreat = effect.match(/^heal_on_retreat_(\d+)$/);
  if (healOnRetreat) {
    return { label: 'Heal On Retreat', detail: `Recovered ${healOnRetreat[1]} HP after disengaging.` };
  }
  const swarmSpeed = effect.match(/^swarm_speed_(\d+)$/);
  if (swarmSpeed) {
    return { label: 'Swarm Speed', detail: `Reduced movement cost by ${swarmSpeed[1]}.` };
  }
  const adaptiveMultiplier = effect.match(/^adaptive_multiplier_(\d+\.?\d*)x$/);
  if (adaptiveMultiplier) {
    return { label: 'Adaptive Multiplier', detail: `Triple-stack multiplier boosted combat by ${adaptiveMultiplier[1]}x.` };
  }
  const terrainLordCharge = effect.match(/^terrain_lord_charge$/);
  if (terrainLordCharge) {
    return { label: 'Terrain Lord Charge', detail: 'Terrain Lord charge gained terrain penetration and bonus damage.' };
  }
  const terrainLordTerraform = effect.match(/^terrain_lord_terraform_(\d+)$/);
  if (terrainLordTerraform) {
    return { label: 'Terrain Lord Terraform', detail: `${terrainLordTerraform[1]} terraform charges available.` };
  }
  const ghostArmyPhase = effect.match(/^ghost_army_phase_(\d+)$/);
  if (ghostArmyPhase) {
    return { label: 'Ghost Army Phase', detail: `Phase teleport up to ${ghostArmyPhase[1]} hexes.` };
  }
  const ghostArmyKillChain = effect.match(/^ghost_army_kill_chain$/);
  if (ghostArmyKillChain) {
    return { label: 'Ghost Army Kill Chain', detail: 'On kill: re-stealth and redeploy near any ally.' };
  }
  const ghostArmyMovement = effect.match(/^ghost_army_ally_movement_(\d+)$/);
  if (ghostArmyMovement) {
    return { label: 'Ghost Army Rally', detail: `Adjacent allies gain +${ghostArmyMovement[1]} movement.` };
  }
  const raidCampDefense = effect.match(/^raid_camp_enemy_def_penalty_([\d.]+)$/);
  if (raidCampDefense) {
    return { label: 'Raid Camp', detail: `Enemies near raid camps suffer -${Math.round(Number(raidCampDefense[1]) * 100)}% defense.` };
  }
  const raidCampMovement = effect.match(/^raid_camp_ally_movement_(\d+)$/);
  if (raidCampMovement) {
    return { label: 'Raid Camp Speed', detail: `Allies in camp gain +${raidCampMovement[1]} movement.` };
  }
  const juggernautIgnoreZoc = effect.match(/^juggernaut_ignore_zoc$/);
  if (juggernautIgnoreZoc) {
    return { label: 'Juggernaut Unstoppable', detail: 'Juggernaut ignores zone of control.' };
  }
  const juggernautSigs = effect.match(/^juggernaut_signatures$/);
  if (juggernautSigs) {
    return { label: 'Juggernaut Signatures', detail: 'Per-domain combat signatures active.' };
  }
  const standingStoneAnchored = effect.match(/^standing_stone_anchored_radius_(\d+)$/);
  if (standingStoneAnchored) {
    return { label: 'Standing Stone Aura', detail: `Anchored aura radius ${standingStoneAnchored[1]} hexes.` };
  }
  const standingStoneDamageShare = effect.match(/^standing_stone_damage_share_([\d.]+)$/);
  if (standingStoneDamageShare) {
    return { label: 'Damage Share', detail: `Allies split ${Math.round(Number(standingStoneDamageShare[1]) * 100)}% damage with Standing Stone.` };
  }
  const standingStoneTarPit = effect.match(/^standing_stone_tar_pit_(\d+)$/);
  if (standingStoneTarPit) {
    return { label: 'Tar Pit', detail: `Enemies in aura lose ${standingStoneTarPit[1]} movement.` };
  }
  const standingStoneAdjDamage = effect.match(/^standing_stone_adjacent_damage_(\d+)$/);
  if (standingStoneAdjDamage) {
    return { label: 'Crushing Aura', detail: `Adjacent enemies take ${standingStoneAdjDamage[1]} damage/turn.` };
  }
  const manyFacedBulwark = effect.match(/^many_faced_bulwark$/);
  if (manyFacedBulwark) {
    return { label: 'Many-Faced: Bulwark', detail: 'Adapted to defense — bonus defense and damage reflection.' };
  }
  const manyFacedPredator = effect.match(/^many_faced_predator$/);
  if (manyFacedPredator) {
    return { label: 'Many-Faced: Predator', detail: 'Adapted to offense — bonus damage and extended range.' };
  }
  const manyFacedPhantom = effect.match(/^many_faced_phantom$/);
  if (manyFacedPhantom) {
    return { label: 'Many-Faced: Phantom', detail: 'Adapted to movement — ignores ZoC and gains movement.' };
  }
  const ironTurtleIgnoreZoc = effect.match(/^iron_turtle_ignore_zoc$/);
  if (ironTurtleIgnoreZoc) {
    return { label: 'Iron Turtle Unstoppable', detail: 'Iron Turtle ignores zone of control.' };
  }
  const ironTurtleCrushing = effect.match(/^iron_turtle_crushing_zone_(\d+)_radius_(\d+)$/);
  if (ironTurtleCrushing) {
    return { label: 'Iron Turtle Crushing Zone', detail: `Deals ${ironTurtleCrushing[1]} damage/turn in ${ironTurtleCrushing[2]}-hex radius.` };
  }
  const ironTurtleReflection = effect.match(/^iron_turtle_reflection_([\d.]+)$/);
  if (ironTurtleReflection) {
    return { label: 'Iron Turtle Reflection', detail: `Reflects ${Math.round(Number(ironTurtleReflection[1]) * 100)}% of damage.` };
  }

  const labels: Record<string, string> = {
    charge_shield: 'Charge Shield',
    anti_displacement: 'Anti-Displacement',
    dug_in: 'Dug In',
    terrain_fortress: 'Terrain Fortress',
    charge_cooldown_reset: 'Charge Reset',
    ram_attack: 'Ram Attack',
    stealth_charge: 'Stealth Charge',
    double_charge: 'Double Charge',
    poison_trap: 'Poison Trap',
    contaminate_coastal: 'Contaminate',
    stealth_healing: 'Stealth Healing',
    terrain_poison: 'Terrain Poison',
    aura_overlap: 'Aura Overlap',
    wave_cavalry_amphibious: 'Wave Cavalry',
    stealth_recharge: 'Stealth Recharge',
    desert_fortress: 'Desert Fortress',
    frostbite: 'Frostbite',
    frost_defense: 'Frost Defense',
    bear_charge: 'Bear Charge',
    bear_cover: 'Bear Cover',
    ice_zone_difficult_terrain: 'Ice Zone',
    bear_mount: 'Bear Mount',
    terrain_share: 'Terrain Share',
    pack_bonus: 'Pack Bonus',
    oasis_neutral_terrain: 'Oasis',
    permanent_stealth_terrain: 'Permanent Stealth Terrain',
    shadow_network: 'Shadow Network',
    nomad_network: 'Nomad Network',
    impassable_retreat: 'Impassable Retreat',
    paladin_sustain: 'Paladin Sustain',
    terrain_charge_penetration: 'Terrain Charge',
    juggernaut_doubled: 'Juggernaut Doubled',
    ambush_damage: 'Ambush Damage',
  };

  const label = labels[effect];
  if (!label) {
    return null;
  }

  return { label, detail: label };
}

export function pushCombatEffect(
  effects: CombatActionEffect[],
  label: string,
  detail: string,
  category: CombatActionEffectCategory,
): void {
  effects.push({ label, detail, category });
}
