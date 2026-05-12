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
- OUTPUT: GameState (new, immutable)
- SIDE EFFECTS: Orchestrates entire AI faction turn: fog update, strategy compute, triple-synergy resolve, ecology pressure, force composition pressure, codification/research (base 4 XP/turn, modified by difficulty profile: easy=4, normal=5, hard=7), hybrid recipe unlock, capture timer advancement, economy, production, environmental damage, summon tick, warlord aura, unit healing/refresh (including stealth cooldown and prepared ability expiry), exposure from proximity (seenEnemyDomains loop), village spawn, siege management, war exhaustion
- INVARIANTS: Must be called once per faction per round. Triple-stack resolved before production/healing. Exposure thresholds [20,120,200] for successive foreign domains. Warlord aura radius-3, +10 morale, cavalry/mounted only. Summon cycle: summoned→expires→cooldown→re-summon. Dead units skipped in loop.
- CALLERS: warEcologySimulation.ts

## Simulation — Trace Recorder (`src/systems/simulation/traceRecorder.ts`)

- INPUT: SimulationTrace (mutable ref), game state, typed event objects
- OUTPUT: createSimulationTrace → SimulationTrace; all others void
- SIDE EFFECTS: All functions mutate the trace object (push to arrays). maybeRecordEndSnapshot is idempotent.
- INVARIANTS: log appends to both trace.lines and trace.events. Event recorders guard with optional chaining.
- CALLERS: warEcologySimulation.ts, simulation/factionTurnEffects.ts, simulation/environmentalEffects.ts

## Simulation — Victory (`src/systems/simulation/victory.ts`)

- INPUT: GameState
- OUTPUT: getVictoryStatus → VictoryStatus {winnerFactionId, victoryType, controlledCities, dominationThreshold}; getAliveFactions → Set<FactionId>
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
- OUTPUT: gainExposure → GameState; getNextExposureThreshold → number; isForeignDomain → boolean; checkDomainLearned → string|null; isDomainRestricted → boolean; getForeignT1Cost → number; getPrototypeCostModifier → number; incrementPrototypeMastery → GameState; getExposedDomains → string[]; getExposureDetails → {current, threshold, progress}|null; isUnlockPrototype → boolean; calculatePrototypeCost → number; getDomainIdByTag → string|null; getDomainIdsByTags → string[]
- SIDE EFFECTS: Returns new GameState. Accumulates exposure progress, learns domains on threshold crossing. Grants domain awareness (adds to learnedDomains) but NOT T1 auto-complete — T1 must be earned via ecology assimilation at scaled cost (getForeignT1Cost = 20 * (assimilatedCount + 1)). Sets domainAcquisitionMethod='exposure'.
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
- SIDE EFFECTS: None (pure computation).
- INVARIANTS: Triple-stack gate requires emergentEligibleDomains.length >= 3. Emergent rules match by domain-category conditions (terrain+combat+mobility, healing+defensive+offensive, etc). Pair synergies require both domains at T1 (pairEligibleDomains sourced from t1Domains in domainProgression).
- CALLERS: synergyRuntime.ts, factionTurnEffects.ts (type imports), aiResearchScoring.ts, learnLoopCoordinator.ts

## Combat Action — Helpers (`src/systems/combat-action/helpers.ts`)

- INPUT: Various (GameState, Unit, UnitId, HexCoord, RulesRegistry)
- OUTPUT: Pure functions returning GameState/boolean/number/CombatActionPreview as appropriate
- SIDE EFFECTS: All pure-functional (return new state). No input mutation.
- INVARIANTS: writeUnitToState deletes hp<=0 units from map and cleans faction unitIds. pruneDeadUnits is idempotent. applyKnockbackDistance iterates step-by-step re-reading units each step.
- CALLERS: combat-action/preview.ts, unit-activation/helpers.ts, combat-action/apply.ts

## Unit Activation — Activate (`src/systems/unit-activation/activateUnit.ts`)

- INPUT: GameState, UnitId, RulesRegistry, optional UnitActivationOptions
- OUTPUT: UnitActivationResult {state: GameState, pendingCombat: CombatActionPreview | null}
- SIDE EFFECTS: Returns new GameState. Increments turnNumber. Decision cascade: routed→flee, target→attack, charge→move+attack, brace→brace, ambush→prepare, transport+capture→non-combat capture, else→strategic movement→post-move attack.
- INVARIANTS: combatMode 'preview' returns preview without applying; 'apply' (default) applies immediately. Post-movement attack gated by shouldEngageFromPosition. Field fort attempted after every branch. Squad rendezvous hold: squadId + within RENDEZVOUS_READY_DISTANCE = no charge. HIGH_VALUE_ATTACK_SCORE=10 forces engagement.
- CALLERS: unitActivationSystem.ts (re-export facade)

## Unit Activation — Targeting (`src/systems/unit-activation/targeting.ts`)

- INPUT: GameState, UnitId, HexCoord, FactionId, prototype, RulesRegistry, optional threatenedCityPosition
- OUTPUT: {target: Unit | null, score: number}
- SIDE EFFECTS: None (pure)
- INVARIANTS: findBestTargetChoice = adjacent only. findBestRangedTarget = getHexesInRange. River-stealthed/effectively-stealthed units invisible to AI. Fort targets skipped if HP>35% and not routed (suicide avoidance). Fort penalty: -4 (with support) / -18 (without). Ranged +12 score bonus. Pirate Lord greedy +3 for water targets.
- CALLERS: unit-activation/activateUnit.ts

## Unit Activation — Field Fort (`src/systems/unit-activation/fieldFort.ts`)

- INPUT: GameState, FactionId, UnitId, RulesRegistry, optional fortsBuiltThisRound set
- OUTPUT: shouldBrace → boolean; getFieldFortOpportunity → FieldFortOpportunity | null; buildFieldFortIfEligible → GameState; applyHillDugInIfEligible → GameState
- SIDE EFFECTS: buildFieldFortIfEligible mutates fortsBuiltThisRound set. Both pure-functional on state.
- INVARIANTS: hill_clan exclusive. Requires canBuildFieldForts doctrine. Infantry/ranged only. Full moves + status 'ready'. DECISION_SCORE=6 minimum, ATTACK_MARGIN=1 won't build if immediate attack exceeds. Hill dug-in requires rapidEntrenchEnabled + hill terrain.
- CALLERS: unit-activation/activateUnit.ts

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
- INVARIANTS: updateSiegeState idempotent. buildFortAtUnit zeros moves/attacks. getPrototypeCost has hardcoded chassis table for starters. getAiUnitIds sorted by status (ready first).
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
