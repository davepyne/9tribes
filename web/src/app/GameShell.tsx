import { useEffect, useMemo, useRef, useState } from 'react';
import type Phaser from 'phaser';
import type { GameController } from '../game/controller/GameController';
import type { ClientState } from '../game/types/clientState';
import type { PendingCombat } from '../game/controller/GameSession';
import type { UnitView } from '../game/types/worldView';
import type { SaveGameSummary } from './savegames';
import { createGame } from '../game/phaser/createGame';

// Legacy components
import { BottomCommandBar } from '../ui/BottomCommandBar';
import { ResearchWindow } from '../ui/ResearchWindow';
import { RightInspector } from '../ui/RightInspector';
import { TopHud } from '../ui/TopHud';

// V2 components
import { GameMenuBar } from '../ui/GameMenuBar';
import { ContextInspector } from '../ui/ContextInspector';
import { CommandTray } from '../ui/CommandTray';
import { TurnBanner } from '../ui/TurnBanner';
import { DebugOverlay } from '../ui/DebugOverlay';
import { ReportsOverlay } from '../ui/ReportsOverlay';
import { KnowledgeGainedModalProvider, useLearnDetector, useKnowledgeModal } from '../ui/KnowledgeGainedModal';
import { CombatLogPanel } from '../ui/CombatLogPanel';
import { playCombatSoundForPendingCombat, playSessionDeltaSounds } from './audio/sfxManager';

const params = new URLSearchParams(window.location.search);
const USE_V2_LAYOUT = params.get('layout') !== 'legacy';

type ShellContentProps = {
  controller: GameController;
  state: ClientState;
  hostRef: React.RefCallback<HTMLDivElement> | React.RefObject<HTMLDivElement> | null;
  gameRef: React.RefObject<Phaser.Game | null>;
  turnBanner: string | null;
  instructionsDismissed: boolean;
  researchOpen: boolean;
  debugVisible: boolean;
  activeOverlay: string | null;
  timelineMax: number;
  showPlayInstructions: boolean;
  onSetInstructionsDismissed: (v: boolean) => void;
  onSetTurnBanner: (v: string | null) => void;
  onSetResearchOpen: (v: boolean) => void;
  onSetDebugVisible: (v: boolean) => void;
  onSetActiveOverlay: (v: string | null) => void;
  onRestartSession?: () => void;
  onSaveGame?: () => SaveGameSummary | null;
};

function KnowledgeGainedShellContent({
  controller,
  state,
  hostRef,
  gameRef,
  turnBanner,
  instructionsDismissed,
  researchOpen,
  debugVisible,
  activeOverlay,
  timelineMax,
  showPlayInstructions,
  onSetInstructionsDismissed,
  onSetTurnBanner,
  onSetResearchOpen,
  onSetDebugVisible,
  onSetActiveOverlay,
  onRestartSession,
  onSaveGame,
}: ShellContentProps) {
  const { showKnowledgeGained } = useKnowledgeModal();
  const [combatLocked, setCombatLocked] = useState(false);
  const previousStateRef = useRef<ClientState | null>(null);

  useLearnDetector(
    state.world.units,
    state.world.factions,
    state.activeFactionId,
    showKnowledgeGained,
  );

  useEffect(() => {
    playSessionDeltaSounds(previousStateRef.current, state);
    previousStateRef.current = state;
  }, [state]);

  // Register combat-pending callback to bridge React -> Phaser animation
  useEffect(() => {
    if (!gameRef.current) return;

    const game = gameRef.current;
    const scene = game.scene.getScene('MapScene') as import('../game/phaser/scenes/MapScene').MapScene | undefined;
    if (!scene) return;

    controller.onCombatPending((pending: PendingCombat) => {
      const currentState = controller.getState();
      const attacker = currentState.world.units.find((u: UnitView) => u.id === pending.attackerId);
      const defender = currentState.world.units.find((u: UnitView) => u.id === pending.defenderId);
      if (!attacker || !defender) {
        // Fallback: apply immediately if we can't find the units
        controller.applyPendingCombat();
        return;
      }

      playCombatSoundForPendingCombat(pending, attacker);

      // AI-vs-AI combats get instant mode; anything involving a human gets full animation
      const isInstant = !controller.isCombatInvolvesHuman(attacker.factionId, defender.factionId);

      setCombatLocked(true);
      scene.startCombatAnimation(
        {
          attackerDamage: pending.result.attackerDamage,
          defenderDamage: pending.result.defenderDamage,
          attackerDestroyed: pending.result.attackerDestroyed,
          defenderDestroyed: pending.result.defenderDestroyed,
          attackerRouted: pending.result.attackerRouted,
          defenderRouted: pending.result.defenderRouted,
          attackerFled: pending.result.attackerFled,
          defenderFled: pending.result.defenderFled,
        },
        attacker,
        defender,
        () => {
          controller.applyPendingCombat();
          setCombatLocked(false);
        },
        isInstant, // instant mode for AI-vs-AI, full animation otherwise
      );
    });

    return () => {
      // Cleanup: cancel any in-progress animation
      scene?.cancelCombatAnimation();
      if (controller.isCombatInProgress()) {
        controller.applyPendingCombat();
        setCombatLocked(false);
      }
    };
  }, [controller, gameRef.current]);

  const activeFaction = state.world.factions.find((f) => f.id === state.activeFactionId);
  const turnBannerData = state.playFeedback?.lastTurnChange;

  const handleMenuAction = (action: string) => {
    switch (action) {
      case 'open_faction_summary':
        onSetActiveOverlay('faction_summary');
        break;
      case 'open_combat_log':
        onSetActiveOverlay('combat_log');
        break;
      case 'open_supply_report':
        onSetActiveOverlay('supply_report');
        break;
      case 'open_ai_intents':
        onSetActiveOverlay('ai_intents');
        break;
      case 'toggle_debug_overlay':
        onSetDebugVisible(!debugVisible);
        break;
      case 'new_game':
        window.location.search = '';
        break;
      case 'save': {
        const summary = onSaveGame?.();
        if (summary) {
          onSetTurnBanner(`Saved: ${summary.label}`);
        }
        break;
      }
      case 'load':
        window.location.search = 'screen=load';
        break;
      default:
        break;
    }
  };

  const handleDeselect = () => {
    controller.dispatch({ type: 'select_hex', q: -1, r: -1 });
  };

  return (
    <div className="game-shell--v2">
      <div className="game-shell__canvas-host" ref={hostRef} />
      {combatLocked && <div className="combat-overlay-lock" />}

      <CombatLogPanel events={state.hud.recentCombat} />

      <GameMenuBar
        state={state}
        onOpenResearch={() => onSetResearchOpen(true)}
        onEndTurn={() => controller.dispatch({ type: 'end_turn' })}
        onRestartSession={onRestartSession}
        onMenuAction={handleMenuAction}
      />

      <ContextInspector
        state={state}
        onSetCityProduction={(cityId, prototypeId) =>
          controller.dispatch({ type: 'set_city_production', cityId, prototypeId })
        }
        onCancelCityProduction={(cityId) =>
          controller.dispatch({ type: 'cancel_city_production', cityId })
        }
        onRemoveFromQueue={(cityId, queueIndex) =>
          controller.dispatch({ type: 'remove_from_queue', cityId, queueIndex })
        }
        onSetTargetingMode={(mode) =>
          controller.dispatch({ type: 'set_targeting_mode', mode })
        }
        onDeselect={handleDeselect}
        onCloseCityProduction={() => controller.dispatch({ type: 'close_city_production' })}
      />

      <CommandTray
        state={state}
        timelineMax={timelineMax}
        onSetTurn={(turnIndex) => controller.dispatch({ type: 'set_replay_turn', turnIndex })}
        onEndTurn={() => controller.dispatch({ type: 'end_turn' })}
        onSetTargetingMode={(mode) =>
          controller.dispatch({ type: 'set_targeting_mode', mode })
        }
        onBuildFort={(unitId) => controller.dispatch({ type: 'build_fort', unitId })}
        onBuildCity={(unitId) => controller.dispatch({ type: 'build_city', unitId })}
        onSacrifice={(unitId) => controller.dispatch({ type: 'sacrifice_unit', unitId })}
      />

      {turnBannerData ? (
        <TurnBanner
          factionName={turnBannerData.factionName}
          factionColor={activeFaction?.color ?? '#d6a34b'}
          round={state.turn}
        />
      ) : null}

      {debugVisible ? <DebugOverlay events={state.debug.turnEvents} /> : null}

      {activeOverlay ? (
        <ReportsOverlay
          reportType={activeOverlay as 'faction_summary' | 'combat_log' | 'supply_report' | 'ai_intents'}
          state={state}
          onClose={() => onSetActiveOverlay(null)}
        />
      ) : null}

      {researchOpen && state.research ? (
        <ResearchWindow
          state={state}
          onStartResearch={(nodeId) => controller.dispatch({ type: 'start_research', nodeId })}
          onCancelResearch={() => controller.dispatch({ type: 'cancel_research' })}
          onClose={() => onSetResearchOpen(false)}
        />
      ) : null}
    </div>
  );
}

type GameShellProps = {
  controller: GameController;
  onRestartSession?: () => void;
  onSaveGame?: () => SaveGameSummary | null;
};

export function GameShell({ controller, onRestartSession, onSaveGame }: GameShellProps) {
  const [state, setState] = useState<ClientState>(() => controller.getState());
  const [turnBanner, setTurnBanner] = useState<string | null>(null);
  const [instructionsDismissed, setInstructionsDismissed] = useState(false);
  const [researchOpen, setResearchOpen] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => controller.subscribe(() => setState(controller.getState())), [controller]);

  useEffect(() => {
    setState(controller.getState());
    setTurnBanner(null);
    setInstructionsDismissed(false);
  }, [controller]);

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }

    gameRef.current = createGame(hostRef.current, controller);
    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, [controller]);

  useEffect(() => {
    const factionName = state.playFeedback?.lastTurnChange?.factionName;
    if (!factionName) {
      return;
    }

    setTurnBanner(`Now Acting: ${factionName}`);
    const timeout = window.setTimeout(() => setTurnBanner(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [state.playFeedback?.lastTurnChange?.factionId, state.playFeedback?.endTurnCount]);

  useEffect(() => {
    if ((state.playFeedback?.moveCount ?? 0) > 0) {
      setInstructionsDismissed(true);
    }
  }, [state.playFeedback?.moveCount]);

  const [activeOverlay, setActiveOverlay] = useState<string | null>(null);
  const [debugVisible, setDebugVisible] = useState(false);

  const timelineMax = useMemo(() => Math.max(0, (state.replay?.turns.length ?? 1) - 1), [state.replay?.turns.length]);
  const showPlayInstructions = state.mode === 'play' && !instructionsDismissed;

  const handleMenuAction = (action: string) => {
    switch (action) {
      case 'open_faction_summary':
        setActiveOverlay('faction_summary');
        break;
      case 'open_combat_log':
        setActiveOverlay('combat_log');
        break;
      case 'open_supply_report':
        setActiveOverlay('supply_report');
        break;
      case 'open_ai_intents':
        setActiveOverlay('ai_intents');
        break;
      case 'toggle_debug_overlay':
        setDebugVisible((v) => !v);
        break;
      default:
        break;
    }
  };

  const handleDeselect = () => {
    controller.dispatch({ type: 'select_hex', q: -1, r: -1 });
  };

  // ── V2 Layout ──
  if (USE_V2_LAYOUT) {
    return (
      <KnowledgeGainedModalProvider>
        <KnowledgeGainedShellContent
          controller={controller}
          state={state}
          hostRef={hostRef}
          gameRef={gameRef}
          turnBanner={turnBanner}
          instructionsDismissed={instructionsDismissed}
          researchOpen={researchOpen}
          debugVisible={debugVisible}
          activeOverlay={activeOverlay}
          timelineMax={timelineMax}
          showPlayInstructions={showPlayInstructions}
          onSetInstructionsDismissed={setInstructionsDismissed}
          onSetTurnBanner={setTurnBanner}
          onSetResearchOpen={setResearchOpen}
          onSetDebugVisible={setDebugVisible}
          onSetActiveOverlay={setActiveOverlay}
          onRestartSession={onRestartSession}
          onSaveGame={onSaveGame}
        />
      </KnowledgeGainedModalProvider>
    );
  }

  // ── Legacy Layout ──
  return (
    <div className="game-shell">
      <TopHud state={state} turnBanner={turnBanner} onOpenResearch={() => setResearchOpen(true)} />

      <main className="game-layout">
        <section className="game-stage">
          {showPlayInstructions ? (
            <div className="play-instructions panel">
              <div className="panel-heading compact">
                <p className="panel-kicker">Playtest</p>
                <h2>First Turn</h2>
              </div>
              <p>Select a friendly unit, drag it to a highlighted tile, then End Turn.</p>
            </div>
          ) : null}
          <div className="game-stage__frame" ref={hostRef} />
        </section>

        <RightInspector
          state={state}
          onSetCityProduction={(cityId, prototypeId) => controller.dispatch({ type: 'set_city_production', cityId, prototypeId })}
        />
      </main>

      <BottomCommandBar
        state={state}
        timelineMax={timelineMax}
        onSetTurn={(turnIndex) => controller.dispatch({ type: 'set_replay_turn', turnIndex })}
        onEndTurn={() => controller.dispatch({ type: 'end_turn' })}
        onRestartSession={onRestartSession}
      />

      {researchOpen && state.research ? (
        <ResearchWindow
          state={state}
          onStartResearch={(nodeId) => controller.dispatch({ type: 'start_research', nodeId })}
          onCancelResearch={() => controller.dispatch({ type: 'cancel_research' })}
          onClose={() => setResearchOpen(false)}
        />
      ) : null}
    </div>
  );
}
