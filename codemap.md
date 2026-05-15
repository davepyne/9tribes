# Codemap — War-Civ V2

Auto-generated contract summaries for complex subsystems. See `.slim/symbols.json` and `.slim/imports.json` for full symbol/import data.

---

## Strategic AI — Rendezvous (`src/systems/strategic-ai/rendezvous.ts`)

- INPUT: GameState, FactionId, HexCoord (objective/anchor), previous FactionStrategy, UnitStrategicIntent map
- OUTPUT: computeRendezvousHex → HexCoord; reconstructSquads → Map<string, SquadState>; applySquadGate → SquadGateStats
- SIDE EFFECTS: `applySquadGate` mutates `intents` record in-place and `squad.phase` (assembling→ready→engaging; disbanded is terminal)
- INVARIANTS: Staleness = estimatedTravelTurns + STALE_BUFFER(2). Previous-turn squad matching uses objectiveCityId/objectiveUnitId + role as key. Phase progression is one-way.
- CALLERS: unit-activation/movement.ts, strategic-ai/assignments.ts, unit-activation/activateUnit.ts, strategic-ai/difficultyCoordinator.ts

## Simulation — Environmental Effects (`src/systems/simulation/environmentalEffects.ts`)

- INPUT: GameState, Unit, FactionId, RulesRegistry, optional SimulationTrace
- OUTPUT: getHealRate → number; getTerrainAt → string; occupiesFriendlySettlement → boolean; applyEnvironmentalDamage → GameState
- SIDE EFFECTS: Returns new GameState (immutable). Removes dead units, logs to trace.
- INVARIANTS: Poison 1.5x if doctrine. Jungle attrition 1 HP/turn (suppressed in settlement + jungle_stalkers). Contamination 1 HP/turn (suppressed in settlement). Frostbite DoT decrements duration each turn, clears frozen at 0. toxicBulwark applies 1 damage to adjacent enemies.
- CALLERS: warEcologySimulation.ts, simulation/factionTurnEffects.ts

## Simulation — Faction Turn Effects (`src/systems/simulation/factionTurnEffects.ts`)

- INPUT: GameState, FactionId, RulesRegistry, optional SimulationTrace + AiDifficultyProfile
- OUTPUT: GameState (new, immutable); also exports: applyEcologyResearchPass → GameState, buildEcologyBreakdown, computeProximityResearchBonuses, computeTerrainResearchBonuses
- SIDE EFFECTS: Orchestrates entire AI faction turn: fog update, strategy compute, triple-synergy resolve, ecology pressure, force composition pressure, codification/research (base 4 XP/turn, modified by difficulty profile: easy=4, normal=5, hard=7), ecology research pass via applyEcologyResearchPass (terrain bonus: DOMAIN_TERRAIN_AFFINITY × TERRAIN_RESEARCH_BONUS per hex, capped at MAX_RESEARCH_TERRAIN_BONUS=5 per domain; proximity bonus: RESEARCH_PROXIMITY_BONUS_PER_CONTACT=0.5 per enemy within hex distance 2 whose native domain matches a learned domain; combat bonus: +1 XP to target native domain), hybrid recipe unlock, capture timer advancement, economy, production, environmental damage, summon tick (tickSummonState: summoned→expires→cooldown→re-summon), warlord aura, unit healing/refresh (including stealth cooldown and prepared ability expiry), exposure from proximity (seenEnemyDomains loop), village spawn, siege management, war exhaustion
- INVARIANTS: Must be called once per faction per round. Triple-stack resolved before production/healing. Exposure thresholds [20,120,200] for successive foreign domains. Warlord aura radius-3, +10 morale, cavalry/mounted only. Summon cycle: summoned→expires→cooldown→re-summon. Dead units skipped in loop. Ecology research uses addResearchProgressToNode (ungated, bypasses activeNodeId).
- CALLERS: warEcologySimulation.ts

## Simulation — Trace Recorder (`src/systems/simulation/traceRecorder.ts`)

- INPUT: SimulationTrace (mutable ref), game state, typed event objects
- OUTPUT: createSimulationTrace → SimulationTrace; recordAbilityLearned/recordDomainLearned/recordResearch/recordSynergyPair/recordTripleStack → void; all others void
- SIDE EFFECTS: All functions mutate the trace object (push to arrays). maybeRecordEndSnapshot is idempotent.
- INVARIANTS: log appends to both trace.lines and trace.events. Event recorders guard with optional chaining.
- CALLERS: warEcologySimulation.ts, simulation/factionTurnEffects.ts, simulation/environmentalEffects.ts

## Simulation — Victory (`src/systems/simulation/victory.ts`)

- INPUT: GameState
- OUTPUT: getVictoryStatus → VictoryStatus {winnerFactionId, victoryType, controlledCities, dominationThreshold}; getAliveFactions → Set<FactionId>; isFactionEliminated → boolean
- SIDE EFFECTS: None (pure)
- INVARIANTS: Alive = any unit with hp>0 OR any non-besieged city. Elimination = exactly 1 alive. Domination = >= ceil(totalCities * 0.40). Besieged cities don't count for elimination check.
- CALLERS: warEcologySimulation.ts

## Combat Action — Apply (`src/systems/combat-action/apply.ts`)

- INPUT: GameState, RulesRegistry, CombatActionPreview, learnChanceScale = 1
- OUTPUT: {state: GameState, feedback: CombatActionFeedback}
- SIDE EFFECTS: Returns new GameState. Applies HP damage (with paladin min-HP floor, juggernaut undying at 1 HP), morale loss, routing, stealth break, brace clear. Handles lethal ambush instant kill, slave coercion damage, heavy naval ram, learn-by-kill (scaled by learnChanceScale), XP/promotion, paladin smite/sustain, pursuit bonus, capture on kill, greedy coastal capture, melee advance, retreat capture, knockback, transport destruction, combat signals, contact transfer, faction absorption, hybrid recipe unlock, combat record streaks, war exhaustion, hit-and-run retreat, battle history recording, poison DoT (tag-based + synergy), contamination, facing rotation, damage reflection (doctrine + synergy), stampede extra move, charge cooldown waived, stealth recharge. Synergy aftermath: poison traps on retreat, retreat healing, combat healing, heavy regen, slave healing, sandstorm splash AoE, synergy AoE, contamination, frostbite, stun, formation crush, sandstorm accuracy aura, lethal ambush poison splash, withering reduction, slave army buffs, capture aftermath (poison/slave damage/heal penalty/escape prevention), many-faced stance. Final pruneDeadUnits.
- INVARIANTS: Paladin emergent sustain caps minimum HP from single hit. Pursuit bonus: +2 damage dealt to defender when attacker wins damage exchange. Hit-and-run requires doctrine OR (cavalry+skirmish + doctrine). Melee advance only on kill, not capture/ranged. Stealth breaks on attack unless permanent. AI path passes learnChanceScale=2.
- CALLERS: combatActionSystem.ts (re-export facade), GameSession.ts

## Combat Action — Preview (`src/systems/combat-action/preview.ts`)

- INPUT: GameState, RulesRegistry, attackerId, defenderId
- OUTPUT: CombatActionPreview | null
- SIDE EFFECTS: None (pure)
- INVARIANTS: Returns null if unit missing/dead/wrong faction/no attacks/canAttackTarget fails/prototype missing. Naval without amphibious doctrine limited to WATER_TERRAIN. Calculates 20+ modifier sources. Forest first strike requires forestAmbushEnabled + forest terrain. Charge = moved melee OR forced-march/charge-transcendence doctrine. Brace defense 0.2 (0.4 with fortress transcendence).
- CALLERS: combatActionSystem.ts, GameSession.ts, tests

## Combat Action — Faction Absorption (`src/systems/combat-action/factionAbsorption.ts`)

- INPUT: GameState, victorFactionId, defeatedFactionId, RulesRegistry
- OUTPUT: {state: GameState, absorbedDomains: string[]}
- SIDE EFFECTS: Returns new GameState. Transfers contact, combat records, domains (NO cap — conquest event, not ecology). Grants domain awareness only: adds to learnedDomains + sets domainAcquisitionMethod='absorption'. No T1 auto-complete or synergy eligibility. Razes defeated faction's cities and destroys their villages (does NOT transfer ownership).
- INVARIANTS: Only fires when defeated faction has zero living units. Duplicate domains filtered, native domain excluded, restricted domains excluded via `isDomainRestricted()` from knowledgeSystem. Defeated faction's cities are deleted from the map; their villages are destroyed via destroyVillagesInCityTerritory. Sets recentSacrificeDomainIds on victor's research state for AI strategy.
- CALLERS: combat-action/apply.ts

## Sacrifice System (`src/systems/sacrificeSystem.ts`)

- INPUT: unit, faction, state, RulesRegistry, optional SimulationTrace
- OUTPUT: canSacrifice → boolean; performSacrifice → GameState; codifyDomainsForFaction → GameState
- SIDE EFFECTS: Returns new GameState. Non-destructive: strips unit's learnedAbilities (keeps unit alive). Grants synergy eligibility only — does NOT add to learnedDomains or auto-complete T1 research. Evaluates triple synergy from synergyEligibleDomains. Sets recentSacrificeDomainIds/recentSacrificeRound on faction research state for AI strategy.
- INVARIANTS: Sacrifice range = hexDistance(unit, homeCity) <= 1. Home city must not be besieged. Home city must belong to faction. Unit must have learnedAbilities (length > 0). No MAX_LEARNED_DOMAINS cap enforced here. SynergyEngine accessed via synergyRuntime singleton.
- CALLERS: unit-activation/activateUnit.ts (canSacrifice, performSacrifice), GameSession.ts (performSacrifice)

## Knowledge System (`src/systems/knowledgeSystem.ts`)

- INPUT: GameState, FactionId, domainId, amount, optional trace + registry
- OUTPUT: gainExposure → GameState; getNextExposureThreshold → number; isForeignDomain → boolean; checkDomainLearned → string|null; isDomainRestricted → boolean; getForeignT1Cost → number; getDomainCostMultiplier → number; getEffectiveXpCost → number; getPrototypeCostModifier → number; incrementPrototypeMastery → GameState; getExposedDomains → string[]; getExposureDetails → {current, threshold, progress}|null; isUnlockPrototype → boolean; calculatePrototypeCost → number; getDomainIdByTag → string|null; getDomainIdsByTags → string[]
- SIDE EFFECTS: Returns new GameState. Accumulates exposure progress, learns domains on threshold crossing. Grants domain awareness (adds to learnedDomains) but NOT T1 auto-complete — T1 must be earned via ecology assimilation at scaled cost (getForeignT1Cost = 20 * (assimilatedCount + 1)). Sets domainAcquisitionMethod='exposure'. getDomainCostMultiplier returns native=1.0x, foreign scaled by mastery. getEffectiveXpCost applies cost multiplier to base cost.
- INVARIANTS: EXPOSURE_THRESHOLDS = [20, 120, 200, 300, 400, 500, 600, 700, 800] (9 tiers). No hard MAX_LEARNED_DOMAINS cap. RESTRICTED_DOMAINS derived from ability-domains.json `restrictedToNative` flag — exposure silently skipped for restricted domains. Early return if domain is native/already-learned/restricted. Threshold index = foreign domain count. Prototype mastery: 0 builds=2.0x, 1=1.5x, 2=1.2x, 3+=1.0x. isUnlockPrototype gates mastery modifier to hybrid recipe prototypes only.
- CALLERS: factionTurnEffects.ts, factionAbsorption.ts (isDomainRestricted), productionSystem.ts, aiProductionStrategy.ts, aiProductionScoring.ts, strategicAi.ts, sessionUtils.ts, capabilityDoctrine.ts (getForeignT1Cost)

## Learn-by-Kill System (`src/systems/learnByKillSystem.ts`)

- INPUT: attacker Unit, defender Unit, GameState, RNGState, optional trace, optional learnChanceScale
- OUTPUT: tryLearnFromKill → {unit, learned, domainId?, fromFactionId?}; tryLearnFromCityCapture → {state, learned, unitId?, domainId?}
- SIDE EFFECTS: tryLearnFromKill returns new Unit (no state write). tryLearnFromCityCapture returns new GameState.
- INVARIANTS: Base learn chances: Green 12%, Seasoned 20%, Veteran 28%, Elite 35%. AI doubles these via learnChanceScale=2. Domain learned = defender's faction nativeDomain. Max 3 learned abilities per unit. City capture learning is 100% (no RNG). Same-faction kills never learn.
- CALLERS: combat-action/apply.ts, siegeSystem.ts

## Siege System (`src/systems/siegeSystem.ts`)

- INPUT: City, FactionId, GameState
- OUTPUT: captureCityWithResult → {state, learnedDomain?}; degradeWalls → City; isCityVulnerable → boolean; getCapturingFaction → FactionId|null
- SIDE EFFECTS: captureCityWithResult returns new GameState. RAZES city (deletes from map), destroys city's villages, applies war exhaustion, triggers domain learning.
- INVARIANTS: Wall damage 20/turn (10 coastal). Repair 3/turn when not besieged. Vulnerable = wallHP<=0 AND encircled AND no garrison. City capture = raze, not transfer — victor does NOT gain the city. Faction-level domain transfer on capture (loser's nativeDomain to victor).
- CALLERS: combat-action/apply.ts, factionTurnEffects.ts, sessionUtils.ts

## Village System (`src/systems/villageSystem.ts`)

- INPUT: GameState, City, FactionId, HexCoord, RulesRegistry
- OUTPUT: destroyVillagesInCityTerritory → GameState; destroyVillage → GameState; spawnVillage → GameState; evaluateAndSpawnVillage → GameState
- SIDE EFFECTS: Returns new GameState. Deletes village entries, updates faction villageIds, syncs settlement IDs.
- INVARIANTS: VILLAGES_PER_CITY_CAP = 6. BASE_VILLAGE_SPAWN_GAP = 4 rounds. destroyVillagesInCityTerritory destroys villages of ANY faction within city.territoryRadius (positional check).
- CALLERS: siegeSystem.ts, factionAbsorption.ts, factionTurnEffects.ts

## Synergy Engine (`src/systems/synergyEngine.ts`)

- INPUT: pair-eligible domain IDs, emergent-eligible domain IDs, unit tags
- OUTPUT: resolveFactionTriple → ActiveTripleStack|null; resolveUnitPairs → ActiveSynergy[]; getDomainSynergyScore → number
- SIDE EFFECTS: None (pure computation). Types (DomainConfig, PairSynergyConfig, EmergentRuleConfig, ActiveSynergy, ActiveTripleStack) moved to synergyTypes.ts.
- INVARIANTS: Triple-stack gate requires emergentEligibleDomains.length >= 3. Emergent rules match by domain-category conditions (terrain+combat+mobility, healing+defensive+offensive, etc). Pair synergies require both domains at T1 (pairEligibleDomains sourced from t1Domains in domainProgression).
- CALLERS: synergyRuntime.ts, factionTurnEffects.ts (type imports), aiResearchScoring.ts, learnLoopCoordinator.ts

## Synergy Effects (`src/systems/synergyEffects.ts`)

- INPUT: CombatContext (attacker/defender prototypes, roles, synergies), ActiveSynergy[], ActiveTripleStack|null
- OUTPUT: applyCombatSynergies → SynergyCombatResult; applyHealingSynergies → number (bonus heal amount); makeEmptyResult → SynergyCombatResult
- SIDE EFFECTS: None (pure). Dispatches to handler registry, mutates a fresh SynergyCombatResult object.
- INVARIANTS: ~45 pair synergy handlers via synergyEffectHandlers Map. 14 emergent triple-stack rules (paladin, terrain_lord, permanent_stealth, standing_stone, ghost_army, juggernaut, slave_empire, raid_camp, poison_shadow, iron_turtle, many_faced). Stealth attack: damage *= 1.5 when context.isStealthAttack + stealth tag. Healing: stealth_healing resets to base, extended_healing/oasis/slave_heavy_regen stack additively.
- CALLERS: combat-action/preview.ts, combat-action/apply.ts, factionTurnEffects.ts

## Synergy Runtime (`src/systems/synergyRuntime.ts`)

- INPUT: Faction (synergyEligibleDomains, pairEligibleDomains), unit tags
- OUTPUT: getSynergyEngine → SynergyEngine (singleton); resolveEffectiveSynergies → ActiveSynergy[]; calculateSynergyAttackBonus/DefenseBonus → number
- SIDE EFFECTS: getSynergyEngine lazy-loads singleton from JSON files (pair-synergies, emergent-rules, ability-domains).
- INVARIANTS: Resolution priority: triple stack > faction native self-pair/double stack > unit tag-based. Attack bonus: multiplierStackValue - 1 (floored at 0). Defense bonus: dugInDefense + auraOverlapDefense.
- CALLERS: combat-action/preview.ts, combat-action/apply.ts

## Synergy Primitives (`src/systems/synergyPrimitives.ts`)

- INPUT: Declarative records defining synergy effects via 12 primitive kinds
- OUTPUT: Type definitions only (no runtime exports): StatName (30+ stat fields), FlagName (15 flags), StatusName (13 statuses), ActionName (13 actions), VerbName (17 verbs), EffectTypeName (6), PrimitiveEffect union (12 kinds: StatMod, SetFlag, ApplyStatus, Knockback, Heal, ProjectAura, Capture, PreventAction, SpawnOnMap, GrantVerb, InstantKill, ModeSelect)
- SIDE EFFECTS: None — this is a type definition module. Replaces the 69 SynergyEffect variants and 11 EmergentEffect variants. Future synergies are declarative records, not discriminated-union branches.
- INVARIANTS: Each primitive has optional condition (string evaluated by primitiveEvaluator), target (TargetSpec), and trigger (TriggerSpec). ModeSelect supports stance-based mode selection (combatContext, stance, stanceToggle → 'bulwark'/'predator'/'phantom').
- CALLERS: primitiveDispatcher.ts (consumes PrimitiveEffect[]), synergyTypes.ts (imports types)

## Primitive Dispatcher (`src/systems/primitiveDispatcher.ts`)

- INPUT: PrimitiveEffect[], CombatContext, SynergyCombatResult (mutable)
- OUTPUT: resolvePrimitives → void (mutates result); resolveHealingPrimitives → number (bonus heal)
- SIDE EFFECTS: Mutates the SynergyCombatResult object in-place. Each dispatcher pushes to result.additionalEffects[] for debugging.
- INVARIANTS: 12 dispatch functions, one per primitive kind. statMod: add/multiply/set/min/max ops on numeric fields. setFlag: boolean flags on result. applyStatus: poison/stun/slow/formationCrush counters. knockback: max-distance with extendMultiplier. capture: context-dependent (charge/retreat/stealth/naval). preventAction: antiDisplacement/emergentUndying/emergentIgnoreZoc/captureEscapePrevented. spawnOnMap: poisonTrap/poisonCloud positions. grantVerb: positionSwap/secondCharge/retreatThroughImpassable/opportunityStrikeOnDisengage/fortUp/carryCaptured/retreatToWater. projectAura: recursively dispatches inner effects. modeSelect: picks one or collects all modes.
- CALLERS: synergyEffects.ts (applyCombatSynergies calls resolvePrimitives)

## Primitive Evaluator (`src/systems/primitiveEvaluator.ts`)

- INPUT: ConditionSpec string, CombatContext; TargetSpec; TriggerSpec
- OUTPUT: evaluateCondition → boolean; resolveTarget → ResolvedTarget; triggerMatches → boolean
- SIDE EFFECTS: None (pure)
- INVARIANTS: Conditions support AND/OR/negation (!). Built-in: isCharge, isStealthAttack, isRetreat, isStealthed, isWater, afterRetreat. Tag checks (tag:poison, tag:heavy, etc.). Terrain conditions (terrain:desert, terrain:desert,coast,hill). HP thresholds (targetHp<0.25). TargetSpec: self/attacker/defender/position/alliesInRadius/enemiesInRadius/role. TriggerSpec: onKill/onDeath/onHit/onCapture/onKillFromStealth/onAdjacentAllyDeath/onExecution/onEnterAura/onTurnEnd/onPhase.
- CALLERS: primitiveDispatcher.ts (every dispatch checks evaluateCondition first)

## Faction Identity System (`src/systems/factionIdentitySystem.ts`)

- INPUT: Faction, terrainId/terrainDef, Unit, GameState (for desert swarm)
- OUTPUT: getHealingBonus/MovementCostModifier/CombatAttackModifier/CombatDefenseModifier/EconomyProductionBonus/EconomySupplyBonus/PursuitMovement/GreedyLoot/PoisonOnAttack → number|object; isUnitRiverStealthed/isPassiveWetlandStealth/isPoorTerrain → boolean; getTerrainPreferenceScore/DesertSwarmBonus → number/object; DesertSwarmConfig interface; isRiverStealthTerrain → boolean; isDeepWaterTerrain → boolean
- SIDE EFFECTS: None (pure lookups). Re-exports isWaterTerrain, isDeepWaterTerrain, isRiverStealthTerrain from terrainUtils.
- INVARIANTS: 9 passive traits: river_assault, greedy, foraging_riders, healing_druids, jungle_stalkers, cold_hardened_growth, charge_momentum, hill_engineering, desert_logistics. Attack bonuses 0.10–0.25, defense 0.05–0.35, movement -1 to -2. Greedy loot: {gold:2, supplies:1}. Foraging riders: +1 exhaustion decay, +1 pursuit. Desert swarm: threshold=3 units, +1 attack, 1.10x defense. Rough terrains: forest/jungle/hill/tundra/desert. Open ground: plains/savannah. Jungle stalker poison: jungle/forest/swamp.
- CALLERS: combat-action/apply.ts, movementSystem.ts, economySystem.ts, healingSystem.ts, targeting.ts, strategicAi.ts, factionTurnEffects.ts, fogSystem.ts

## Research System (`src/systems/researchSystem.ts`)

- INPUT: ResearchState, nodeId, xpCost, amount, faction
- OUTPUT: createResearchState → ResearchState; startResearch/addResearchProgress/advanceResearch/isNodeCompleted/isResearching/setResearchRate → ResearchState|boolean; addResearchProgressToNode → {state, completed}; getNextResearchNodeForDomain → {nodeId, tier}|null; isDomainUnlocked/getDomainTier/getResearchProgress/getResearchRate → number|boolean
- SIDE EFFECTS: Pure/immutable — all return new ResearchState via spread copies. addResearchProgressToNode returns {state, completed} tuple.
- INVARIANTS: Native domain T1 auto-completed on faction creation. Node IDs: {domain}_t{tier} (venom_t2). Tiers T1→T2→T3. startResearch enforces domain unlocked + prerequisites met + not completed. addResearchProgress requires activeNodeId set; addResearchProgressToNode bypasses activeNodeId (used by ecology). Completion: newProgress >= xpCost.
- CALLERS: factionTurnEffects.ts (ecology + directed), buildMvpScenario.ts, combat-action/apply.ts

## Transport System (`src/systems/transportSystem.ts`)

- INPUT: GameState, UnitId, transportId, RulesRegistry, TransportMap, HexCoord
- OUTPUT: isTransportUnit/canBoardTransport/canDisembark/isUnitEmbarked → boolean; boardTransport/disembarkUnit/destroyTransport → {state, transportMap}; getTransportCapacity/getEmbarkedCount/getEmbarkedUnits/getUnitTransport/updateEmbarkedPositions/getValidDisembarkHexes → various
- SIDE EFFECTS: Returns new state/maps. destroyTransport removes ALL embarked units from state.units and faction unitIds. TransportMap managed OUTSIDE GameState (per AGENTS.md convention).
- INVARIANTS: Transport: tags includes 'transport' + transportCapacity > 0. Boarding: both 'ready', same faction, hexDistance=1, has capacity. Disembark: transport 'ready', target hexDistance=1, not 'ocean'/'fish', hex unoccupied. Disembark consumes moves (both land unit and transport set movesRemaining=0). Transport destruction cascades to embarked units.
- CALLERS: unit-activation/activateUnit.ts, combat-action/helpers.ts, GameSession.ts, strategic-ai/assignments.ts, worldViewModel.ts

## Combat Signal System (`src/systems/combatSignalSystem.ts`)

- INPUT: attacker/defender terrain, attacker role/weaponTags/tags, defender movementClass
- OUTPUT: collectCombatSignals → Set<string>; applyCombatSignals → GameState; CombatSignalMapping interface
- SIDE EFFECTS: applyCombatSignals chains addCapabilityProgress calls, returning new GameState each iteration.
- INVARIANTS: 13 signal-to-capability mappings: forest→woodcraft(1.5)+stealth(0.5), hill→hill_fighting(1.5)+fortification(0.5), plains→charge(1.0), water→navigation(1.5)+seafaring(0.5), mounted→charge(2.0), ranged→woodcraft(1.0), spear+cavalry→formation_warfare(2.0), shock→formation_warfare(1.5), poison→poisoncraft(1.5), ambush→stealth(2.0). Ambush signal: forest terrain + ranged attacker role.
- CALLERS: combat-action/apply.ts, combatSystem.ts

## City Site System (`src/systems/citySiteSystem.ts`)

- INPUT: GameMap, HexCoord, City, GameState, FactionId
- OUTPUT: evaluateCitySiteBonuses/getCitySiteBonuses/createCitySiteBonuses → CitySiteBonuses; getSettlementOccupancyBlocker → 'city'|'village'|'improvement'|null; getFactionVillageCooldownReduction → number; findBestCitySiteForFaction → HexCoord|null
- SIDE EFFECTS: Pure/immutable. findBestCitySiteForFaction is read-only scan.
- INVARIANTS: Territory radius=2. Traits: fresh_water (river), oasis, fish, woodland (forest/jungle +0.5 production), open_land (plains/savannah +0.5 supply). Water bonus: villageCooldownReduction=1. Oasis/fish: researchBonus=2. Min spacing: 3 hexes from cities, 2 from villages. findBestCitySite: max 20 hexes from settler, friendly city sweet spot 4–8 hexes.
- CALLERS: economySystem.ts, villageSystem.ts, activateUnit.ts, GameSession.ts, terrainInspectorViewModel.ts, strategic-ai/assignments.ts

## Combat Action — Helpers (`src/systems/combat-action/helpers.ts`)

- INPUT: Various (GameState, Unit, UnitId, HexCoord, RulesRegistry)
- OUTPUT: Pure functions returning GameState/boolean/number/CombatActionPreview as appropriate
- SIDE EFFECTS: All pure-functional (return new state). No input mutation.
- INVARIANTS: writeUnitToState deletes hp<=0 units from map and cleans faction unitIds. pruneDeadUnits is idempotent. applyKnockbackDistance iterates step-by-step re-reading units each step.
- CALLERS: combat-action/preview.ts, unit-activation/helpers.ts, combat-action/apply.ts

## Unit Activation — Activate (`src/systems/unit-activation/activateUnit.ts`)

- INPUT: GameState, UnitId, RulesRegistry, optional UnitActivationOptions
- OUTPUT: UnitActivationResult {state: GameState, pendingCombat: CombatActionPreview | null}
- SIDE EFFECTS: Returns new GameState. Increments turnNumber. Decision cascade: routed→flee, target→attack, charge→move+attack, brace→brace, ambush→prepare, transport+capture→non-combat capture, else→strategic movement→post-move attack. New T3 capstones: bastion (Hill Engineers fortress), maelstrom (Tidal Warfare zone), oasis (Desert Nomad terrain mutation), submerge (Naval stealth teleport).
- INVARIANTS: combatMode 'preview' returns preview without applying; 'apply' (default) applies immediately. Post-movement attack gated by shouldEngageFromPosition. Bastion attempted after every branch (replaces field fort). Squad rendezvous hold: squadId + within RENDEZVOUS_READY_DISTANCE = no charge. HIGH_VALUE_ATTACK_SCORE=10 forces engagement.
- CALLERS: unitActivationSystem.ts (re-export facade)

## Unit Activation — Targeting (`src/systems/unit-activation/targeting.ts`)

- INPUT: GameState, UnitId, HexCoord, FactionId, prototype, RulesRegistry, optional threatenedCityPosition
- OUTPUT: {target: Unit | null, score: number}
- SIDE EFFECTS: None (pure)
- INVARIANTS: findBestTargetChoice = adjacent only. findBestRangedTarget = getHexesInRange. River-stealthed/effectively-stealthed units invisible to AI. Fort targets skipped if HP>35% and not routed (suicide avoidance). Fort penalty: -4 (with support) / -18 (without). Ranged +12 score bonus. Pirate Lord greedy +3 for water targets.
- CALLERS: unit-activation/activateUnit.ts

## Unit Activation — Bastion (`src/systems/unit-activation/bastion.ts`)

- INPUT: GameState, FactionId, UnitId, RulesRegistry, optional bastionsBuiltThisRound set
- OUTPUT: getBastionOpportunity → BastionOpportunity {score, reason}|null; buildBastionIfEligible → GameState
- SIDE EFFECTS: buildBastionIfEligible mutates bastionsBuiltThisRound set. Creates fortification improvement (defenseBonus=4/+400%). Increments faction.bastionsBuilt (3-per-game cap enforced by doctrine.canBuildBastion).
- INVARIANTS: Hill Engineers (hill_clan) exclusive. Requires fortress T3 doctrine (canBuildBastion). Infantry/ranged only. Full moves + status 'ready'. BASTION_DECISION_SCORE=10 threshold, BASTION_ATTACK_MARGIN=1. Scoring: friendly support × 1.5, enemies × 3, hill terrain +3, defensive assignment +3, city proximity bonus (1=+2.5, 2=+1.5, 3=+0.5). Requires nearby friendly support > 0 and no existing fort within radius 2.
- CALLERS: unit-activation/activateUnit.ts (called after every decision branch)

## Unit Activation — Brace and Dug-In (`src/systems/unit-activation/braceAndDugIn.ts`)

- INPUT: Unit, prototype, GameState (shouldBrace); GameState, FactionId, UnitId (applyHillDugInIfEligible)
- OUTPUT: shouldBrace → boolean; applyHillDugInIfEligible → GameState
- SIDE EFFECTS: applyHillDugInIfEligible returns new state with unit.hillDugIn=true
- INVARIANTS: shouldBrace: unit must have brace tag or canUniversalBrace, must have adjacent enemy, and an adjacent enemy must be charge-capable. applyHillDugInIfEligible: requires rapidEntrenchEnabled doctrine + hill terrain.
- CALLERS: unit-activation/activateUnit.ts (brace branch), unit-activation/activateUnit.ts (post-branch dug-in)

## Unit Activation — Maelstrom (`src/systems/unit-activation/maelstrom.ts`)

- INPUT: GameState, FactionId, UnitId, RulesRegistry
- OUTPUT: getMaelstromOpportunity → MaelstromOpportunity {score, reason}|null
- SIDE EFFECTS: None (pure heuristic, actual declaration via maelstromSystem.ts)
- INVARIANTS: Requires canDeclareMaelstrom doctrine, unit ready, on water terrain. Needs 3+ enemies within maelstromRadius (3 foreign, 5 native Pirate Lords). Score = enemies × 2 (+ enemies × 1.5 if maelstromAutoCaptureEnabled). MAELSTROM_DECISION_SCORE=8 threshold.
- CALLERS: unit-activation/activateUnit.ts (T3 capstone check)

## Unit Activation — Oasis (`src/systems/unit-activation/oasis.ts`)

- INPUT: GameState, FactionId, UnitId, RulesRegistry
- OUTPUT: getOasisOpportunity → OasisOpportunity {score, reason}|null
- SIDE EFFECTS: None (pure heuristic, actual declaration via oasisSystem.ts)
- INVARIANTS: Requires canDeclareOasis doctrine, unit ready, on land terrain. Once-per-game (faction.oasisDeclared > 0 blocks). Needs 2+ friendlies within OASIS_RADIUS (2). Score = friendly × 3 + enemies × 1.5. OASIS_DECISION_SCORE=8 threshold.
- CALLERS: unit-activation/activateUnit.ts (T3 capstone check)

## Unit Activation — Submerge (`src/systems/unit-activation/submerge.ts`)

- INPUT: GameState, FactionId, UnitId, RulesRegistry
- OUTPUT: getSubmergeOpportunity → SubmergeOpportunity {score, reason, destination}|null
- SIDE EFFECTS: None (pure heuristic, actual execution via submergeSystem.ts)
- INVARIANTS: Requires canSubmerge (doctrine + on water + ready status). BFS finds all connected waterway hexes (up to SUBMERGE_MAX_RANGE=8). Scores each by enemy proximity (×4), distance (×0.5 capped at 5), stealth penalty (-2). SUBMERGE_DECISION_SCORE=6 threshold.
- CALLERS: unit-activation/activateUnit.ts (T3 capstone check)

## Unit Activation — Movement (`src/systems/unit-activation/movement.ts`)

- INPUT: GameState, UnitId, RulesRegistry, UnitStrategicIntent, optional SimulationTrace
- OUTPUT: buildFallbackIntent → UnitStrategicIntent; resolveWaypoint → HexCoord; wouldBeUnsafeAfterMove → boolean; performStrategicMovement → GameState
- SIDE EFFECTS: performStrategicMovement returns new state, logs to trace, can board transport (mutates transportMap).
- INVARIANTS: Squad hold filters valid moves to HOLD_DEFENSE_RADIUS (1) hex of rendezvous. Pirate Lord greedy infantry evaluate boarding transports. Transport with embarked delegates to moveTransportAndDisembark. Embarked units skip movement.
- CALLERS: unit-activation/activateUnit.ts

## Unit Activation — Transport (`src/systems/unit-activation/transport.ts`)

- INPUT: GameState, transportId, RulesRegistry, waypoint, UnitStrategicIntent, optional trace
- OUTPUT: moveTransportAndDisembark → GameState; autoDisembark → GameState
- SIDE EFFECTS: Returns new state, logs to trace.
- INVARIANTS: Coast/river terrain +1 scoring. If no valid moves, still attempts disembark. Each embarked unit consumes one disembark hex (removed from options after use). Auto-disembark near enemy objectives (villages≤2, cities≤3, enemies≤2).
- CALLERS: unit-activation/movement.ts

## Zone Effect System (`src/systems/zoneEffectSystem.ts`)

- INPUT: GameState, HexCoord, FactionId, ZoneEffect, ZoneEffectId
- OUTPUT: getZoneEffectsAtHex → ZoneEffect[]; getZoneEffectDamageOnHex → number; getZoneEffectMovementPenalty → number; addZoneEffect → GameState; removeZoneEffect → GameState; tickZoneEffectLifetimes → GameState; exports ZONE_EFFECT_LABEL
- SIDE EFFECTS: add/remove return new GameState with updated zoneEffects Map. tickZoneEffectLifetimes decrements turnsRemaining and drops expired effects (permanent = -1 untouched).
- INVARIANTS: O(n) scan per query (n = active effects, expected single-digit). Coverage: hexDistance(hex, effect.center) <= effect.radius. radius=0 means center hex only. Damage/penalty: sums from all non-owner effects (no friendly fire). Stacks additively — two overlapping Toxic Blooms = 4 dmg.
- CALLERS: maelstromSystem.ts (addZoneEffect), toxicBloomSystem.ts (addZoneEffect, removeZoneEffect), turnSystem.ts (tickZoneEffectLifetimes), environmentalEffects.ts (damage queries)

## Terrain Mutation System (`src/systems/terrainMutationSystem.ts`)

- INPUT: GameState, HexCoord, TerrainType, optional radius
- OUTPUT: setTerrainAt → GameState; setTerrainInRadius → GameState
- SIDE EFFECTS: Mutates state.map.tiles directly (one-way, no reversal). Returns new GameState with updated tiles Map. All downstream systems (movement cost, defense modifier, vision, ecology research) read tile.terrain and pick up changes automatically.
- INVARIANTS: One-way mutation — no automatic reversal. Stacking: last-write-wins (Sapling forest overwrites Oasis desert on same hex). setTerrainInRadius iterates all tiles computing hex distance, atomic state transition.
- CALLERS: oasisSystem.ts (setTerrainInRadius), sapling/nature healing T3 (setTerrainAt)

## Maelstrom System (`src/systems/maelstromSystem.ts`)

- INPUT: GameState, FactionId, centerHex
- OUTPUT: DeclareMaelstromResult {state, declared, reason?}
- SIDE EFFECTS: Returns new GameState. Creates ZoneEffect (type: 'maelstrom', radius 3/5, duration 3/5 turns). Increments faction.maelstromsDeclared.
- INVARIANTS: Foreign tidal_warfare T3: radius=3, duration=3 turns. Native Pirate Lords (coral_people): radius=5, duration=5 turns, maelstromAutoCaptureEnabled (naval kills inside = auto-capture). Once-per-game per faction. Center hex must be water terrain. MAELSTROM_DAMAGE_PER_TURN=2, MAELSTROM_MOVEMENT_PENALTY=1.
- CALLERS: unit-activation/maelstrom.ts (heuristic), sessionUtils.ts (player path)

## Oasis System (`src/systems/oasisSystem.ts`)

- INPUT: GameState, FactionId, centerHex
- OUTPUT: DeclareOasisResult {state, declared, reason?}; exports OASIS_RADIUS (2)
- SIDE EFFECTS: Returns new GameState. Calls terrainMutationSystem.setTerrainInRadius to permanently convert 2-hex radius to desert. Increments faction.oasisDeclared.
- INVARIANTS: Camel Adaptation T3 native mechanic. Once-per-game per faction (tracked on faction.oasisDeclared). Center hex must be land terrain. No ZoneEffect — pure terrain mutation.
- CALLERS: unit-activation/oasis.ts (heuristic), sessionUtils.ts (player path)

## Submerge System (`src/systems/submergeSystem.ts`)

- INPUT: GameState, FactionId, UnitId, destination HexCoord
- OUTPUT: canSubmerge → {canSubmerge, reason?}; executeSubmerge → SubmergeResult {state, submerged, reason?, destination?}; getConnectedWaterway → HexCoord[]
- SIDE EFFECTS: executeSubmerge returns new GameState with unit moved to destination, isStealthed=true, turnsSinceStealthBreak=0, movesRemaining=0, attacksRemaining=0, status='spent'.
- INVARIANTS: BFS finds connected waterway hexes (up to SUBMERGE_MAX_RANGE=8). Requires doctrine.submergeEnabled, unit ready, on water terrain. Destination must be in connected waterway and unoccupied. Submerge consumes all moves/attacks and sets spent status.
- CALLERS: unit-activation/submerge.ts (heuristic), sessionUtils.ts (player path)

## Toxic Bloom System (`src/systems/toxicBloomSystem.ts`)

- INPUT: GameState
- OUTPUT: detectAndSpawnToxicBlooms → GameState; cleanseToxicBlooms → GameState
- SIDE EFFECTS: detectAndSpawnToxicBlooms adds ZoneEffect(s) of type 'toxic_bloom'. cleanseToxicBlooms removes them. Both return new GameState.
- INVARIANTS: Trigger: 3+ poisoned units within hex distance 1 of a candidate center hex. ANY poisoned unit counts (not just owner faction). Spawning faction = Venom-T3 faction with most adjacent poisoned units. Foreign Venom-T3: turnsRemaining=3. Native Jungle Clan: turnsRemaining=-1 (permanent). Suppression: candidate hex with existing toxic_bloom doesn't respawn. Cleansing: Druid Circle (nature_healing native T3) units standing on bloom center remove it. Runs once per round at rollover after tickZoneEffectLifetimes.
- CALLERS: turnSystem.ts (round rollover), warEcologySimulation.ts (simulation loop)

## Game Controller — Combat Session (`web/src/game/controller/combatSession.ts`)

- INPUT: GameState, RulesRegistry, CombatActionPreview
- OUTPUT: PendingCombat {attackerId, defenderId, preview, result: CombatResult, combatEvent: ReplayCombatEvent}
- SIDE EFFECTS: None (pure). Throws if units/prototypes missing.
- INVARIANTS: Pre-computes attackerHpAfter/defenderHpAfter. Decomposes situationalAttackModifier by subtracting charge+synergy. Builds complete ReplayCombatEvent breakdown.
- CALLERS: GameSession.ts, useCombatBridge.ts

## Game Controller — Move Queue (`web/src/game/controller/moveQueueSession.ts`)

- INPUT: GameState, UnitId, Registry, destination HexCoord
- OUTPUT: {state, arrived, blocked, stoppedByZoC}
- SIDE EFFECTS: Returns new GameState, clears moveQueueDestination.
- INVARIANTS: ZoC stop if enteredZoCThisActivation set after move (unless at destination). blocked=true only if unit disappears. stoppedByZoC=true if ZoC stopped mid-path.
- CALLERS: GameSession.ts

## Game Controller — Movement Explorer (`web/src/game/controller/movementExplorer.ts`)

- INPUT: GameState, UnitId, GameMap, RulesRegistry
- OUTPUT: ReachableHexView[] sorted by cost then path length
- SIDE EFFECTS: None (pure BFS)
- INVARIANTS: Best-remaining-moves pruning. Tracks best movesRemainingAfterMove per hex key. Excludes starting hex. Path includes full route.
- CALLERS: GameSession.ts

## Game Controller — Session Utils (`web/src/game/controller/sessionUtils.ts`)

- INPUT: GameState, RulesRegistry, Unit, HexCoord, various
- OUTPUT: Various pure helpers (GameState, boolean, number, string)
- SIDE EFFECTS: All pure-functional on GameState.
- INVARIANTS: updateSiegeState idempotent. buildFortAtUnit zeros moves/attacks. getPrototypeCost has hardcoded chassis table for starters. getAiUnitIds sorted by status (ready first). Also exports: attemptPriestSummon, canPriestSummon, destroyFortAtUnit, getFortDestroyEligibility, hasCaptureAbility.
- CALLERS: GameSession.ts

## View Model — City Inspector (`web/src/game/view-model/inspectors/cityInspectorViewModel.ts`)

- INPUT: GameState, cityId, RulesRegistry, selection state
- OUTPUT: CityInspectorViewModel | null, SettlementBonusSummaryViewModel, SettlementPreviewViewModel | null
- SIDE EFFECTS: None (pure view-model builders)
- INVARIANTS: Returns null if city not found or no active faction. Production disabled if besieged/not active-faction. Settlement preview only for settler + reachable hovered hex. Cost modifier: >=2.0 = "Culture Shock", else "Integrating".
- CALLERS: worldViewModel.ts

## View Model — Research Inspector (`web/src/game/view-model/inspectors/researchInspectorViewModel.ts`)

- INPUT: GameState, RulesRegistry
- OUTPUT: ResearchInspectorViewModel | null
- SIDE EFFECTS: None (pure view-model builder)
- INVARIANTS: Returns null if no active faction. Nodes across all domains; locked/unlocked by learnedDomains. estimatedTurns null for non-active nodes.
- CALLERS: worldViewModel.ts

## View Model — Sprite Keys (`web/src/game/view-model/spriteKeys.ts`)

- INPUT: factionId, prototypeName, chassisId, sourceRecipeId
- OUTPUT: Sprite key strings (e.g. 'jungle_spearman', 'hill_fortress')
- SIDE EFFECTS: None (pure lookup)
- INVARIANTS: Settler always 'settler'. Hybrid by sourceRecipeId (18 hardcoded recipes). Summon/signature by special chassisId. Starting by faction+chassis (9-faction table). inferChassisId heuristic by name substrings.
- CALLERS: worldViewModel.ts

## UI — Tutorial Overlay (`web/src/ui/TutorialOverlay.tsx`)

- INPUT: {step: TutorialStep, onDismiss: () => void}
- OUTPUT: React element or null
- SIDE EFFECTS: None (pure presentational)
- INVARIANTS: Steps without content in CONTENT map render nothing. Welcome step gets tut-overlay--welcome CSS.
- CALLERS: GameShell.tsx

## UI — Victory Overlay (`web/src/ui/VictoryOverlay.tsx`)

- INPUT: {victoryType, controlledCities, totalCities, rounds, maxRounds, difficulty, onDismiss}
- OUTPUT: React element (victory dialog with score)
- SIDE EFFECTS: "New Game" sets window.location.search = ''
- INVARIANTS: Score = 10000 * max(0.5, maxRounds/rounds) * difficultyMult * dominationBonus. Difficulty: easy=0.5, normal=1, hard=2. Domination victory 1.2x.
- CALLERS: GameShell.tsx

## Hooks — useCombatBridge (`web/src/app/hooks/useCombatBridge.ts`)

- INPUT: GameController, React.RefObject<Game | null>
- OUTPUT: {combatLocked: boolean}
- SIDE EFFECTS: Registers onCombatPending callback, starts Phaser combat animation, blocks interaction during animation. Skips animation for non-visible units. AI-vs-AI instant. Cleanup cancels animation on unmount.
- INVARIANTS: Neither visible = immediate apply. combatLocked true from start until callback. Re-runs when game scene changes.
- CALLERS: GameShell.tsx

## Hooks — useTutorial (`web/src/app/hooks/useTutorial.ts`)

- INPUT: ClientState
- OUTPUT: {step: TutorialStep, popupVisible: boolean, onDismiss: () => void}
- SIDE EFFECTS: Manages tutorial progression React state. Only enabled with ?tutorial=1. Auto-advances on game state changes.
- INVARIANTS: Step flow: welcome→build_city→production→explore→research→synergies→wait_for_combat_turn→combat→help_button→done. No ?tutorial=1 → done immediately.
- CALLERS: GameShell.tsx

## Hooks — useSessionAudio (`web/src/app/hooks/useSessionAudio.ts`)

- INPUT: ClientState, combatLocked: boolean
- OUTPUT: void (side effects only)
- SIDE EFFECTS: Detects destroyed player villages, plays delta sounds, shows window.alert deferred until combatLocked===false.
- INVARIANTS: Single vs multiple village destruction have different phrasing.
- CALLERS: GameShell.tsx

## Hooks — useEscapeHandler (`web/src/app/hooks/useEscapeHandler.ts`)

- INPUT: {activeOverlay, helpOpen, researchOpen, inspectorOpen, combatLogOpen, debugVisible, ...setters}
- OUTPUT: void (registers keydown listener)
- SIDE EFFECTS: Closes panels in priority order on Escape. Cleans up on unmount.
- INVARIANTS: One panel per Escape press (first match wins).
- CALLERS: GameShell.tsx
