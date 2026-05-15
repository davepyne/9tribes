# 9 Tribes — Synergy Effect Primitives Design

> Status: Design document (no code changes). Companion to `synergy-rework-notes.md`.
> Goal: Collapse ~50 `SynergyEffect` variants + 11 `EmergentEffect` variants into 12 composable primitives so that future synergies are declarative records, not new discriminated-union branches requiring hand-written consumer code.

---

## 1. Proposed Primitive Set

```ts
// ---------------------------------------------------------------------------
// Composable Synergy Primitives
// ---------------------------------------------------------------------------

// --- Shared sub-types ---

type TargetSpec =
  | 'self' | 'attacker' | 'defender'
  | { alliesInRadius: number }
  | { enemiesInRadius: number }
  | { role: string }          // 'slaves', 'overseers', 'healers', etc.
  | 'position';               // Affects a map position, not a unit

type TriggerSpec =
  | 'onKill' | 'onDeath' | 'onHit' | 'onCapture'
  | 'onKillFromStealth' | 'onAdjacentAllyDeath'
  | 'onExecution' | 'mercyKillOfCaptive'
  | 'onEnterAura' | 'onTurnEnd' | 'onPhase'
  | { event: string; filter?: string };

/** Every primitive may carry condition (gate during resolution)
 *  and trigger (fires at a different time from normal resolution). */
interface PrimitiveBase {
  condition?: string;   // 'isCharge' | 'isStealthAttack' | 'isRetreat' | 'terrain:desert' | etc.
  target?: TargetSpec;
  trigger?: TriggerSpec;
}

// --- 1. statMod — modify a numeric property ---

interface StatMod extends PrimitiveBase {
  kind: 'statMod';
  stat: string;         // 'damage' | 'defense' | 'armorPiercing' | 'movement' |
                        // 'accuracy' | 'healingReceived' | 'damageReflection' |
                        // 'minHp' | 'resourcePerTurn' | 'slaveDamage' |
                        // 'rangedRange' | 'coastalPoisonDamage' |
                        // 'allyMovement' | 'counterDamage' | etc.
  op: 'add' | 'multiply' | 'set' | 'min' | 'max';
  value: number;        // Numeric only. Boolean/string flags use setFlag.
  scaling?: {
    per: 'stackingAttacker' | 'chainedUnit' | 'runUpHex'
       | 'poisonStack' | 'woundsReceived';
    max?: number;
  };
  permanent?: boolean;  // Persists beyond combat (e.g., armorBroken)
}

// --- 2. setFlag — set a boolean/string flag ---

interface SetFlag extends PrimitiveBase {
  kind: 'setFlag';
  flag: string;         // 'countsAsCity' | 'treatCoastAsWater' |
                        // 'transportedTroopsStealth' | 'terrainIsNeutral' |
                        // 'visionShared' | 'defenseBonusIgnored' | etc.
}

// --- 3. applyStatus — apply a status effect with stacks/duration ---

interface ApplyStatus extends PrimitiveBase {
  kind: 'applyStatus';
  status: string;       // 'poison' | 'stun' | 'slow' | 'stealth' | 'bleed' |
                        // 'armorBroken' | 'rage' | 'corruptionAura' | 'cleanse' |
                        // 'decoy' | 'frostbite' | etc.
  stacks?: number;
  duration?: number | 'permanent';
  radius?: number;      // Apply to ALL units in radius (e.g., toxic_spread)
  fields?: Record<string, unknown>;  // Status-specific params (e.g., {damageBonus: 0.5})
}

// --- 4. knockback — displace a unit ---

interface Knockback extends PrimitiveBase {
  kind: 'knockback';
  distance: number;
  collisionDamage?: number;     // Damage on collision with unit/terrain
  collisionStun?: number;       // Stun turns on collision
  randomDrift?: number;         // Random lateral hexes
  extendMultiplier?: number;    // Multiply existing knockback (e.g., 1.5×)
}

// --- 5. heal — restore HP ---

interface Heal extends PrimitiveBase {
  kind: 'heal';
  amount: number;
  mode: 'flat' | 'percentDamage' | 'percentMaxHp';
}

// --- 6. projectAura — persistent area effect around a unit ---

interface ProjectAura extends PrimitiveBase {
  kind: 'projectAura';
  radius: number;
  effects: PrimitiveEffect[];     // Recursive composition. Inner effects
                                  // inherit the aura's targeting scope unless
                                  // they specify their own `target`. An inner
                                  // `statMod` with no explicit target applies
                                  // to all units covered by the aura. An inner
                                  // effect with `target: {enemiesInRadius: N}`
                                  // overrides to target enemies only.
  damagePerTurn?: number;         // Zone damage
  movementPenalty?: number;       // Zone movement debuff
  terrain?: string;               // Only active on this terrain
  globalApply?: boolean;          // Ignore terrain restriction
  pulse?: {                       // Periodic burst within aura
    interval: number;             // Every N turns
    effects: PrimitiveEffect[];
  };
}

// --- 7. capture — modify capture mechanics ---

interface Capture extends PrimitiveBase {
  kind: 'capture';
  chanceBonus?: number;
  countMultiplier?: number;       // 2 = double toward Captive Champion
  hpThreshold?: number;           // Auto-capture below this HP fraction
  silent?: boolean;
  instantRetreat?: boolean;
  rangeFromWater?: number;
  instantEmbark?: boolean;
  doubleDelivery?: boolean;       // Delivery counts double for production
}

// --- 8. preventAction — block or bypass a game action ---

interface PreventAction extends PrimitiveBase {
  kind: 'preventAction';
  action: string;       // 'displacement' | 'retreat' | 'attackSource' |
                        // 'zoc' | 'instantKill' | 'movementThrough' |
                        // 'pursue' | 'captureEscape' | 'terrainPenalty' |
                        // 'impassableBlocksRetreat' | 'heal' | etc.
}

// --- 9. spawnOnMap — create a persistent map entity ---

interface SpawnOnMap extends PrimitiveBase {
  kind: 'spawnOnMap';
  effectType: string;   // 'poisonTrap' | 'sandstorm' | 'contamination' |
                         // 'decoy' | 'raidCamp' | 'poisonCloud' | etc.
  position: 'attacker' | 'defender' | 'path' | 'coastal';
  radius?: number;
  duration?: number;
  fields?: Record<string, unknown>;   // Extra effect-type-specific params
}

// --- 10. grantVerb — grant a new player action ---

interface GrantVerb extends PrimitiveBase {
  kind: 'grantVerb';
  verb: string;         // 'secondCharge' | 'positionSwap' | 'reEnterStealth' |
                         // 'retreatThroughImpassable' | 'waiveChargeCooldown' |
                         // 'fortUp' | 'decamp' | 'terraform' | 'submerge' |
                         // 'declareOasis' | 'carryCaptured' | 'relayMarch' |
                         // 'phase' | 'redeployOnKill' | 'repositionAfterKill' |
                         // 'opportunityStrikeOnDisengage' | 'shareVision' | etc.
  range?: number;
  uses?: number | 'unlimited';
  cooldown?: number;
  fields?: Record<string, unknown>;
}

// --- 11. instantKill — bypass HP entirely ---

interface InstantKill extends PrimitiveBase {
  kind: 'instantKill';
  apCostToVictim?: number;   // Action point cost imposed on victim's team
}

// --- 12. modeSelect — conditional branching ---

interface ModeSelect extends PrimitiveBase {
  kind: 'modeSelect';
  selector: string;       // 'stance' | 'domain' | 'terrain' | 'combatContext' |
                           // 'playerChoice'
  collectMode: 'pickOne' | 'collectAll';
  modes: Record<string, PrimitiveEffect[]>;
}

// --- Union ---

type PrimitiveEffect =
  | StatMod | SetFlag | ApplyStatus | Knockback | Heal | ProjectAura
  | Capture | PreventAction | SpawnOnMap | GrantVerb | InstantKill
  | ModeSelect;
```

### Design principles

- **Primitives are plain records** discriminated by `kind`. No inheritance, no classes.
- **`stat` / `flag` / `status` / `action` / `verb` / `effectType` are open string enums.** New T1-T3 hooks (bloodtrail wounds, Captive Champion counter, Maelstrom, Bastion, Sapling, Submerge, Oasis, Toxic Bloom, Mycelium) introduce new string values for these fields, not new primitive types.
- **`statMod` handles numeric properties only.** Boolean and string flags (countsAsCity, treatCoastAsWater, defenseBonusIgnored, visionShared) use the separate `setFlag` primitive. This keeps `value: number` honest — no `setFlag(countsAsCity, 1)` pretending a boolean is a number.
- **`condition` and `trigger` are orthogonal.** `condition` gates whether the effect applies during normal resolution (e.g., `isCharge`). `trigger` fires the effect at a different time (e.g., `onKill`, `onTurnEnd`). An effect with no `trigger` applies immediately during combat resolution.
- **`scaling`** handles per-unit stacking (`per: 'stackingAttacker'`), per-hex scaling (`per: 'runUpHex'`), and per-stack scaling (`per: 'poisonStack'`) as metadata on `statMod`, not new primitives.
- **Recursive composition** (`projectAura.effects`, `modeSelect.modes`) allows multi-layer effects without new union variants. Inner effects within `projectAura.effects` inherit the aura's targeting scope unless they specify their own `target`.
- **Temporally-scoped stat changes** (slave_coercion rage, slave_horde rage) use `applyStatus` with `duration`, `radius`, and `trigger`, where the status name implies the stat modification. `statMod` has no `radius` or `duration` — if a stat change has spatial or temporal scope, it goes through a status or aura, not directly through `statMod`.
- **`capture` is the sole primitive for capture mechanics.** Capture-specific fields (silent, instantRetreat, rangeFromWater, doubleDelivery, hpThreshold) do not generalize to `statMod`, so all capture bonuses route through `capture` rather than splitting some into `statMod(captureChance)`.

---

## 2. Mapping Table

Every current `SynergyEffect` and `EmergentEffect` variant mapped to primitive composition. Primitives shown with key params inline; full type details in Section 1.

### Pair SynergyEffect variants (69)

| # | Variant | Primitive Composition |
|---|---------|----------------------|
| 1 | `poison_aura` | `projectAura(radius, effects:[applyStatus(poison, stacks:dpt)])` + `preventAction(attackSource, condition:'poisoned')` |
| 2 | `charge_shield` | `statMod(incomingDamageAfterCharge, set 0)` + `statMod(chargeDamageBonus, add 0.5, condition:'adjacentToFortress')` |
| 3 | `dug_in` | `statMod(defense, add 0.75, condition:'afterRetreat')` + `statMod(counterDamage, add 0.5, condition:'dugIn')` |
| 4 | `land_aura` | `projectAura(radius, effects:[statMod(defense, add bonus)])` |
| 5 | `extended_healing` | `projectAura(radius 2, effects:[heal(flat 3, self), heal(flat 3, alliesInRadius:2)])` + `setFlag(countsAsCity)` + `statMod(resourcePerTurn, add 1)` |
| 6 | `stealth_aura` | `statMod(firstAttackCritMultiplier, set 2.0)` + `statMod(creepMovement, add 1)` + `statMod(firstAttackAfterLandingDmg, add 0.5, condition:'afterLanding')` + `setFlag(transportedTroopsStealth)` |
| 7 | `terrain_fortress` | `statMod(defense, add bonus, condition:'terrain:type')` |
| 8 | `ram_attack` | `knockback(distance, randomDrift)` + `statMod(damage, add ramBonus, condition:'isRam')` |
| 9 | `combat_healing` | `heal(percentDamage 1.0, self)` + `statMod(movementPoints, add 1, condition:'onCharge')` |
| 10 | `sandstorm` | `statMod(aoeDamage, set value)` + `statMod(accuracy, add -debuff)` + `knockback(1)` + `spawnOnMap(sandstorm, attacker, duration:persistentTurns)` |
| 11 | `double_charge` | `grantVerb(secondCharge, condition:'hasMovement')` |
| 12 | `poison_trap` | `spawnOnMap(poisonTrap, attacker, condition:'isRetreat')` + `applyStatus(poison, stacks:dpt)` + `applyStatus(slow, stacks:slowAmount)` |
| 13 | `contaminate` | `spawnOnMap(contamination, coastal, duration:N, fields:{stackCap})` + `statMod(coastalPoisonDamage, set dpt)` |
| 14 | `withering` | `statMod(healingReceived, set 0)` + `statMod(corruptionDamageOnHealAttempt, set 1)` |
| 15 | `stealth_healing` | `heal(flat baseHeal, self, condition:'isStealthed')` |
| 16 | `terrain_poison` | `applyStatus(poison, stacks:dpt, condition:'terrain:type')` + `preventAction(retreat, condition:'poisonedOnRoughTerrain')` |
| 17 | `multiplier_stack` | `statMod(damage, multiply value)` |
| 18 | `aura_overlap` | `statMod(defense, add bonus)` |
| 19 | `stealth_recharge` | `grantVerb(reEnterStealth, condition:'afterRetreatFromStealth')` |
| 20 | `oasis` | `setFlag(terrainIsNeutral)` + `heal(flat full, self, trigger:'onTurnEnd', condition:'atFullHp')` + `statMod(cooldown, set N)` |
| 21 | `permanent_stealth_terrain` | `applyStatus(stealth, duration:'permanent', condition:'terrain:type')` + `spawnOnMap(decoy, path, duration:N, condition:'movingInDesert')` |
| 22 | `shadow_network` | `grantVerb(positionSwap, range:3, uses:1)` + `preventAction(revealNetworkOnKill)` |
| 23 | `nomad_network` | `grantVerb(relayMarch, range:1)` + `projectAura(radius:3, effects:[setFlag(visionShared)])` |
| 24 | `heal_on_retreat` | `heal(flat amount, self, condition:'isRetreat')` |
| 25 | `impassable_retreat` | `preventAction(impassableBlocksRetreat)` |
| 26 | `swarm_speed` | `statMod(movement, add bonus)` |
| 27 | `formation_crush` | `knockback(distance)` + `applyStatus(stun, duration:1)` |
| 28 | `coastal_nomad` | `statMod(defense, add bonus, condition:'isWater')` + `statMod(movement, add bonus, condition:'isWater')` |
| 29 | `sandstorm_aura` | `projectAura(radius:2, effects:[statMod(accuracy, add -debuff)], globalApply:bool)` |
| 30 | `poison_capture` | `applyStatus(poison, stacks:dpt)` + `statMod(slaveDamage, add 0.25)` + `statMod(slaveHealPenalty, set 0.5)` + `applyStatus(poison, stacks:5, radius:1, trigger:'mercyKillOfCaptive')` |
| 31 | `heavy_poison` | `applyStatus(poison, stacks:1)` + `statMod(armorPiercing, add 0.5)` + `statMod(armorPiercing, add 0.25, scaling:{per:'poisonStack', max:1.0})` + `applyStatus(stun, duration:1, condition:'fullPoison')` |
| 32 | `prison_fortress` | `statMod(defense, add 0.5)` + `preventAction(captureEscape)` + `statMod(counterDamage, add 0.25, scaling:{per:'hpLost'})` |
| 33 | `heavy_fortress` | `statMod(damageReflection, add 0.25)` + `statMod(damageReflection, max 0.5, condition:'incomingDamage>=5')` + `preventAction(displacement, target:{alliesInRadius:1})` |
| 34 | `capture_charge` | `capture(chanceBonus:0.30, condition:'isCharge')` + `knockback(2, condition:'isCharge')` |
| 35 | `heavy_charge` | `applyStatus(stun, duration:1)` + `knockback(extend:1.5×, condition:'isCharge')` + `statMod(damage, add 0.05, scaling:{per:'runUpHex', max:0.5}, condition:'isCharge')` |
| 36 | `capture_retreat` | `capture(chanceBonus:0.15, condition:'isRetreat')` + `capture(chanceBonus:0.40, condition:'isRetreat AND targetHp<25')` + `grantVerb(instantRetreatWithCaptive)` |
| 37 | `heavy_retreat` | `statMod(damageReduction, set value, condition:'isRetreat')` |
| 38 | `naval_capture` | `capture(chanceBonus:0.3, rangeFromWater:1, instantEmbark:true, doubleDelivery:true, condition:'isWater')` |
| 39 | `heavy_naval` | `statMod(damage, add 0.5, condition:'isWater')` + `setFlag(treatCoastAsWater)` + `statMod(ramDamage, set 2, condition:'isWater')` |
| 40 | `slave_healing` | `heal(flat amount, target:{role:'slave'})` |
| 41 | `heavy_regen` | `heal(percentDamage 0.3, self)` + `heal(percentMaxHp 0.5, self, trigger:'onKill')` |
| 42 | `stealth_capture` | `capture(chanceBonus:0.4, condition:'isStealthAttack', silent:true)` + `statMod(movement, add 1, trigger:'onCapture')` |
| 43 | `armor_shred` | `statMod(armor, set 0, permanent:true, condition:'isStealthAttack')` |
| 44 | `lethal_ambush` | `instantKill(condition:'isStealthAttack')` + `applyStatus(poison, stacks:N, condition:'isStealthAttack')` + `statMod(enemyActionPoints, add -1, condition:'isStealthAttack')` |
| 45 | `ambush_charge` | `statMod(damage, multiply 1.5, condition:'isChargeAndStealth')` + `grantVerb(waiveChargeCooldown)` |
| 46 | `terrain_slave` | `statMod(movement, add bonus, condition:'terrain:desert')` |
| 47 | `slave_army` | `statMod(slaveDamage, add bonus)` + `statMod(slaveDefense, add -penalty)` |
| 48 | `slave_coercion` | `statMod(slaveDamage, add 0.5)` + `statMod(slaveAttackRange, add 1, condition:'adjacentToOverseer')` + `applyStatus(rage, duration:1, radius:1, fields:{damageBonus:0.5}, trigger:'onExecution', target:{role:'slave'})` |
| 49 | `heavy_mass` | `knockback(distance)` |
| 50 | `toxic_spread` | `applyStatus(poison, stacks:1, radius:N, trigger:'onDeath')` |
| 51 | `formation_wall` | `preventAction(movementThrough)` + `statMod(rangedRange, multiply 0.5)` |
| 52 | `formation_pinball` | `knockback(collisionDamage:N, collisionStun:1)` |
| 53 | `formation_focus` | `statMod(damage, add 0.30, scaling:{per:'stackingAttacker'})` + `setFlag(defenseBonusIgnored)` |
| 54 | `formation_chain` | `statMod(damage, add 1, scaling:{per:'chainedUnit', max:4})` |
| 55 | `bloom_pulse` | `projectAura(radius:3, effects:[heal(flat 4, alliesInRadius:3), heal(flat 6, self)], pulse:{interval:3, effects:[heal(flat 8, alliesInRadius:3), statMod(movement, add 1)]})` |
| 56 | `position_swap` | `grantVerb(positionSwap, range:3, uses:1)` + `preventAction(revealNetworkOnKill)` |
| 57 | `caravan_relay` | `projectAura(radius:3, effects:[setFlag(visionShared)])` + `grantVerb(relayMarch, range:1)` |
| 58 | `slave_horde` | `statMod(damage, multiply 1.5)` + `statMod(defense, add -0.3)` + `preventAction(zoc, condition:'groupSize>=3')` + `applyStatus(rage, duration:1, fields:{movementBonus:1}, trigger:'onAdjacentAllyDeath', target:{role:'slave'})` |
| 59 | `caravan_passenger` | `grantVerb(carryCaptured)` + `grantVerb(releaseAnywhereOnPath)` + `grantVerb(instantSlaveOnDelivery)` |
| 60 | `bombardment` | `statMod(rangedDamage, multiply 1.5, condition:'isNaval')` + `projectAura(radius:2, effects:[statMod(defense, add 0.25)])` |
| 61 | `mobile_stronghold` | `modeSelect(selector:'playerChoice', pickOne, modes:{fortUp:[statMod(defense, add 0.75), projectAura(radius:2, effects:[statMod(defense, add 0.25)])], mobile:[]})` + `preventAction(displacement)` |
| 62 | `beach_raid` | `statMod(damage, multiply 1.25, condition:'fromWater')` + `grantVerb(retreatToWater, range:2)` + `preventAction(pursue, target:'landUnits')` |
| 63 | `vampiric_strike` | `heal(percentDamage 1.0, self, condition:'isHitRun')` |
| 64 | `ghost_pass` | `grantVerb(retreatThroughImpassable, condition:'isRetreat')` + `statMod(movement, add 1, condition:'afterImpassable')` + `applyStatus(stealth, condition:'afterImpassable')` |
| 65 | `fighting_retreat` | `grantVerb(opportunityStrikeOnDisengage, condition:'isRetreat')` + `statMod(strikeDamage, multiply 1.0, condition:'isRetreat')` |
| 66 | `tidal_cleanse` | `projectAura(radius:2, effects:[heal(flat 4, alliesInRadius:2), applyStatus(cleanse, fields:{debuffs:['poison','stun','slow']})])` |
| 67 | `amphibious` | `statMod(movementCost, set 1, condition:'terrain:coast,desert,shallow_water')` + `statMod(movement, add 1)` |
| 68 | `stealth_aura_share` | `projectAura(radius:1, effects:[applyStatus(stealth, target:{alliesInRadius:1})])` |
| 69 | `slave_economy` | `heal(flat 4, target:{role:'slave'}, condition:'adjacentToHealer')` + `statMod(resourceProduction, add 1, target:{role:'slave'}, condition:'atFullHp')` |

### EmergentEffect variants (11)

| # | Variant | Primitive Composition |
|---|---------|----------------------|
| 70 | `terrain_lord` | `statMod(damage, add 0.5, condition:'isCharge')` + `grantVerb(doubleChargeRange, condition:'nativeTerrain')` + `grantVerb(terraform, uses:3)` + `preventAction(terrainPenaltyOnCharge)` |
| 71 | `paladin` | `heal(percentDamage 0.5, self)` + `statMod(minHp, set 1)` + `statMod(damage, multiply 2.0, condition:'atFullHp')` |
| 72 | `permanent_stealth` | `applyStatus(stealth, duration:'permanent', condition:'terrain:desert,coast,hill')` |
| 73 | `standing_stone` | `modeSelect(selector:'stanceToggle', pickOne, modes:{anchored:[projectAura(radius:4, effects:[statMod(defense, add 0.3), heal(flat 5, alliesInRadius:4), statMod(damageReflection, add 0.5), statMod(movement, add -2, target:{enemiesInRadius:4}), statMod(adjacentDamage, set 2)]), heal(flat 8, self)], marching:[projectAura(radius:1, effects:[statMod(defense, add 0.15), heal(flat 2, alliesInRadius:1)])]})` + `preventAction(displacement)` |
| 74 | `ghost_army` | `grantVerb(phase, range:4)` + `grantVerb(redeployOnKill, range:99)` + `statMod(allyMovement, add 2, trigger:'onPhase')` |
| 75 | `juggernaut` | `modeSelect(selector:'domainSignature', collectAll, modes:{venom:[applyStatus(poison, stacks:1)], fortress:[statMod(damageReflection, add 0.3)], charge:[knockback(1), statMod(damageBehind, set 0.5)], hitrun:[grantVerb(repositionAfterKill)], heavy_hitter:[statMod(armorPiercing, set 0.5)], slaving:[capture(hpThreshold:0.25)], tidal_warfare:[statMod(damage, add 2, condition:'adjacentToWater')]})` + `preventAction(instantKill)` + `preventAction(zoc)` |
| 76 | `slave_empire` | `projectAura(radius:2, effects:[capture(hpThreshold:0.25)])` + `statMod(slaveProduction, add 0.5)` + `preventAction(rout, target:{role:'slave'})` |
| 77 | `raid_camp` | `grantVerb(placeRaidCamp, range:5, cooldown:1, duration:2)` + `projectAura(radius:3, effects:[statMod(movement, add 2, target:'allies'), applyStatus(stealth, duration:1), statMod(defense, add -0.25, target:{enemiesInRadius:3})])` + `capture(chanceBonus:0.3)` |
| 78 | `poison_shadow` | `applyStatus(poison, stacks:3, condition:'isStealthAttack')` + `spawnOnMap(poisonCloud, attacker, condition:'isRetreat', fields:{damage:2})` + `statMod(healingReceived, set 0, condition:'inPoisonCloud')` |
| 79 | `iron_turtle` | `projectAura(radius:3, effects:[statMod(damage, set 2, target:{enemiesInRadius:3}), statMod(movement, add -1, target:{enemiesInRadius:3})])` + `statMod(damageReflection, set 0.5)` + `preventAction(displacement)` + `preventAction(zoc)` |
| 80 | `many_faced` | `modeSelect(selector:'combatContext', pickOne, modes:{bulwark:[statMod(defense, add 0.4), statMod(damageReflection, add 0.25)], predator:[statMod(damage, multiply 1.4), statMod(range, add 1)], phantom:[statMod(movement, add 1), preventAction(zoc)]})` |

---

## 3. Exceptions

Effects where the primitive mapping is slightly forced, with recommendations.

### Reactive/triggered effects (5 effects)

`withering` corruption damage on heal, `poison_capture` mercy kill burst, `slave_horde` rage on adjacent slave death, `slave_coercion` execute rage, `toxic_spread` on-death transfer — these use the `trigger` field, which delegates the "when does this fire?" question to the consumer.

**Recommendation:** Accept. The `trigger` field is intentionally open-ended. The consumer must map trigger strings to game events, but this is a lookup table, not hand-written branching per effect type.

### Status-implied stat modifications (3 effects)

`slave_coercion` execute rage, `slave_horde` rage on adjacent slave death, and `heavy_poison` per-stack armor piercing — these express a stat modification through `applyStatus` (for the first two) or `statMod` with `scaling` (for the third) rather than as a direct `statMod` with `radius`/`duration`. The rage status names (`rage`) carry an implicit stat modification (`+damage`) defined by the consumer.

**Recommendation:** Accept. `statMod` intentionally has no `radius` or `duration` — if a stat change needs spatial or temporal scope, it routes through `applyStatus` (which has both) or `projectAura`. The status name-to-mechanic mapping is no different from the current `poison` → damage-over-time or `stun` → skip-action mappings the consumer already maintains.

### Expression-based values (2 effects)

`prison_fortress` counter damage scales with HP lost. `heavy_charge` run-up damage per hex. These use `scaling` metadata on `statMod` to express per-unit/per-hex scaling rather than literal values.

**Recommendation:** Accept. The `scaling` field is bounded to 5 known scaling axes (stackingAttacker, chainedUnit, runUpHex, poisonStack, woundsReceived). If new scaling axes appear, they extend the union, not the primitive shape. Note: `prison_fortress` uses `scaling:{per:'hpLost'}` which adds a sixth axis — this should be added to the `scaling.per` union during implementation.

### `standing_stone` heal-on-self (1 effect)

The anchored mode heals self for 8 HP/turn *in addition to* the aura heal of 5 HP/turn for allies. This requires two `heal` primitives at different targets inside the same mode, which is valid composition.

**Recommendation:** Accept. No issue.

### `mobile_stronghold` player-initiated toggle (1 effect)

The fortUp/decamp toggle is player-initiated, not context-driven. `modeSelect(selector:'playerChoice', pickOne)` captures this — the consumer exposes the choice to the player instead of evaluating combat context.

**Recommendation:** Accept. The `selector` field's open string enum naturally includes `'playerChoice'` as a mode.

### No bespoke exceptions needed

All 80 variants map without requiring a "keep as bespoke" carve-out. The closest candidates (`withering`, `juggernaut`, `standing_stone`) decompose cleanly once `modeSelect` and `trigger` are available.

---

## 4. Quality Check — Complex Synergy Walkthroughs

### Juggernaut emergent (`juggernaut`)

The juggernaut is the most complex emergent rule: it collects per-domain signature abilities based on which combat domains the unit has learned, then adds universal undying + ZoC-ignoring on top.

**Decomposition:**

1. The universal effects are two `preventAction` primitives:
   - `preventAction(instantKill)` — undying: survive a lethal blow at 1 HP once per combat.
   - `preventAction(zoc)` — ignore zone of control.

2. The per-domain signatures are a `modeSelect` with `collectMode: 'collectAll'` and `selector: 'domainSignature'`. Each mode key is a domain ID and the mode's effects are standard primitives:
   - **venom** → `applyStatus(poison, stacks:1)` — simple status application.
   - **fortress** → `statMod(damageReflection, add 0.3)` — stat modification.
   - **charge** → `knockback(1)` + `statMod(damageBehind, set 0.5)` — two primitives composed.
   - **hitrun** → `grantVerb(repositionAfterKill)` — grants a new action.
   - **heavy_hitter** → `statMod(armorPiercing, set 0.5)` — stat modification.
   - **slaving** → `capture(hpThreshold:0.25)` — capture mechanic.
   - **tidal_warfare** → `statMod(damage, add 2, condition:'adjacentToWater')` — conditional stat mod.

3. When the consumer evaluates a juggernaut unit that has learned venom + fortress + charge, it resolves the `modeSelect` by collecting all modes whose domain key matches a learned domain: `[applyStatus(poison), statMod(damageReflection), knockback(1), statMod(damageBehind)]`. The two `preventAction` primitives always apply.

**Why this works:** The current code has a 7-branch `if (sigs.domain)` chain in the handler, each branch writing to different fields of `SynergyCombatResult`. With primitives, each branch becomes a list of primitive records. The consumer iterates the list instead of switching on domain names. Adding a new domain signature (camel, river_stealth, nature_healing — as the rework notes recommend) means adding a new key to the `modes` record, not adding a new handler branch.

### Overseer's Rule (`slaving+heavy_hitter` → `slave_coercion`)

Overseer's Rule is a slaving/heavy cross-pair that modifies slave behavior when near a heavy overseer, plus a triggered rage effect on enemy execution.

**Decomposition:**

1. `statMod(slaveDamage, add 0.5)` — flat +50% damage to all slaves. Target is `{role:'slave'}`.

2. `statMod(slaveAttackRange, add 1, condition:'adjacentToOverseer')` — +1 attack range for slaves adjacent to a heavy-tagged unit. The condition references positioning relative to a unit with a specific tag.

3. `applyStatus(rage, duration:1, radius:1, fields:{damageBonus:0.5}, trigger:'onExecution', target:{role:'slave'})` — when the overseer executes an enemy, all slaves within 1 hex receive the `rage` status for 1 turn. The `rage` status implicitly grants +50% damage (carried in `fields`). This goes through `applyStatus` rather than `statMod` because the effect has both spatial scope (`radius:1`) and temporal scope (`duration:1`) — `statMod` intentionally has neither.

**Why this works:** The current handler writes to `slaveCoercionDamageBonus` on the result object. The consumer in `apply.ts` reads that field and applies it to slave damage calculations. With primitives, the first `statMod(slaveDamage)` handles the static bonus, and the `applyStatus(rage)` handles the triggered, spatially-scoped bonus. The consumer doesn't need to know the effect came from Overseer's Rule — it sees "modify slave damage" and "on execution, apply rage to nearby slaves." The `rage` status is a status like any other (poison, stun) — the consumer already knows what each status name does mechanically.

### Armada (`tidal_warfare+tidal_warfare` → `formation_chain`)

Armada is the tidal self-pair: ships within 2 hexes chain attacks, each chained ship contributing +1 damage to the attack (cap +4).

**Decomposition:**

1. `statMod(damage, add 1, scaling:{per:'chainedUnit', max:4})` — a single `statMod` with the `scaling` field. `per:'chainedUnit'` tells the consumer to count the number of friendly naval units within `chainRange` hexes and add `value` per unit, capping at `max`. No need for the `formation_chain` variant at all.

**Future plug-in (from rework notes):** The synergy should also extend the active Maelstrom's radius by +1 per chained ship. This adds a second primitive:

2. `statMod(maelstromRadiusBonus, add 1, scaling:{per:'chainedUnit'}, trigger:'onChain')` — modifies a stat that the Maelstrom consumer reads. The `trigger:'onChain'` means this fires when the chain resolves, not during normal combat damage. No new variant needed; the Maelstrom consumer checks `maelstromRadiusBonus` and extends the zone effect accordingly.

**Why this works:** The current `formation_chain` variant has three fields: `chainRange`, `perChainShipBonus`, `maxChainBonus`. All three map to parameters of a single `statMod` with `scaling`. The Maelstrom plug-in is a second `statMod` targeting a different stat with the same scaling axis — it reuses the composition pattern rather than requiring a new variant.

---

## 5. What This Does NOT Solve

1. **Consumer wiring.** This design defines the data shapes. It does not specify how `synergyEffects.ts`, `apply.ts`, `factionTurnEffects.ts`, and `applyHealingSynergies` consume the primitives. A consumer layer (likely a primitive dispatcher that replaces the current 69-entry handler map) is a separate downstream PR.

2. **Condition evaluation.** The `condition` field is an open string. The consumer must implement an evaluator that maps strings like `'isCharge'`, `'terrain:desert'`, `'adjacentToOverseer'`, `'groupSize>=3'` to runtime checks. This design does not prescribe a condition DSL — that's a consumer concern.

3. **Trigger routing.** The `trigger` field identifies when a reactive effect fires (`onKill`, `onDeath`, `onTurnEnd`), but the infrastructure that routes game events to triggered primitives (a post-combat trigger queue, a turn-end sweep, etc.) is not designed here.

4. **Content (synergy names, flavor text, requiredTags, domain pairings).** This design touches only the effect-shape layer. All content changes proposed in the synergy rework notes (renaming Oasis, escalating venom+venom, etc.) are orthogonal.

5. **Emergent rule conditions.** The `condition` and `domainSets` fields on `EmergentRuleConfig` (e.g., `contains_terrain AND contains_combat`) are outside scope. This design addresses only the `effect` field.

6. **Result object shape.** The current `SynergyCombatResult` has ~120 fields, one per effect variant. Collapsing that into a smaller result structure (perhaps a map of stat overrides + a list of active statuses) is a separate design pass that should follow this one.

7. **Frontend compatibility.** The frontend reads synergy data to display effects. The transition from `effect.type === 'poison_aura'` to reading a list of `{kind: 'statMod', stat: 'defense'}` records requires UI-side changes not covered here.

8. **Performance.** Iterating a list of primitives per combat instead of doing a single Map lookup per effect type has different performance characteristics. For the current scale (2-5 active synergies per faction, ~3 primitives per synergy = ~15 primitives per combat resolution) this is negligible, but it should be measured during implementation.

9. **The string-sprawl tradeoff.** Collapsing ~80 effect-type variants into 12 primitives moves the validation cost sideways. The `stat` field on `statMod` has ~30 known values, `status` on `applyStatus` has ~12, `action` on `preventAction` has ~10, `verb` on `grantVerb` has ~17, `flag` on `setFlag` has ~6, `effectType` on `spawnOnMap` has ~6, plus open-ended `condition` and `trigger` strings — roughly 150 string-enum members total across the system. This is the explicit trade: fewer type branches to maintain (12 `kind` values vs 80 `type` values), but the compile-time guarantee weakens at the string boundary. A typo in `stat: 'defnse'` compiles cleanly today, just as it did under the old JSON regime. **Mitigation:** constrain these as string literal unions per primitive (e.g., `type StatName = 'damage' | 'defense' | 'armorPiercing' | ...`) and extend the union when new T1-T3 hooks introduce new stat names. This preserves the type-safety win while keeping the 12-primitive ceiling. The cost is that adding a new stat/status/action requires updating the corresponding union — but that is a single-line addition to one type, not a new discriminated-union branch with a hand-written handler.

10. **`grantVerb` is a data-layer primitive, not a consumer-side simplification.** The ~17 verbs (`submerge`, `terraform`, `placeRaidCamp`, `phase`, `fortUp`, `relayMarch`, `repositionAfterKill`, etc.) each require bespoke consumer code. `grantVerb` makes the *data* uniform — every verb is a record with `kind`, `verb`, optional `range`/`uses`/`cooldown`/`fields` — but the consumer still needs a handler per verb name to execute the action in the game engine. The win is that the data layer stops growing: adding a new verb is adding a record, not adding a new `SynergyEffect` variant. The consumer-side savings come from the dispatcher pattern (one `switch` on `kind` dispatching to shared logic, with `verb` as a parameter), not from eliminating verb-specific code entirely.

---

## Appendix: Primitive Count Justification

| Primitive | Variants it replaces (approx) | Unique capability |
|-----------|-------------------------------|-------------------|
| `statMod` | ~25 | Numeric property modification (damage, defense, armor, movement, accuracy, etc.) |
| `setFlag` | ~6 | Boolean/string flag setting (countsAsCity, treatCoastAsWater, visionShared, etc.) |
| `applyStatus` | ~12 | Status effect application (poison, stun, slow, stealth, bleed, rage, etc.) |
| `knockback` | ~6 | Unit displacement with collision effects |
| `heal` | ~10 | HP restoration (flat, percent, vampiric, triggered) |
| `projectAura` | ~8 | Area-of-effect projection with periodic pulses |
| `capture` | ~7 | Capture chance, auto-capture, delivery mechanics |
| `preventAction` | ~10 | Block/bypass game actions (displacement, ZoC, retreat, instant kill) |
| `spawnOnMap` | ~5 | Create persistent map entities (traps, storms, camps) |
| `grantVerb` | ~12 | New player actions (double charge, swap, submerge, etc.) |
| `instantKill` | 1 | Bypass HP entirely |
| `modeSelect` | 5 | Conditional branching (juggernaut domains, standing_stone stances, many_faced) |

The 12 primitives cover 80 variants with no bespoke exceptions. Each primitive captures a distinct mechanical verb (modify, flag, apply, displace, heal, project, capture, prevent, spawn, grant, kill, branch) that cannot be expressed by composing the others.
