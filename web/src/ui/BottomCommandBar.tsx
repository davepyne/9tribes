import type { ClientState } from '../game/types/clientState';

type BottomCommandBarProps = {
  state: ClientState;
  timelineMax: number;
  onSetTurn: (turnIndex: number) => void;
  onEndTurn: () => void;
  onRestartSession?: () => void;
};

export function BottomCommandBar({ state, timelineMax, onSetTurn, onEndTurn, onRestartSession }: BottomCommandBarProps) {
  const selectedUnitId = state.selected?.type === 'unit' ? state.selected.unitId : null;
  const selectedUnit = selectedUnitId
    ? state.world.units.find((unit) => unit.id === selectedUnitId)
    : null;
  const hoveredMove = state.actions.hoveredMove;
  const hoveredAttackTarget = state.actions.hoveredAttackTarget;
  const spentLabel = selectedUnit
    ? selectedUnit.canAct
      ? `${selectedUnit.movesRemaining}/${selectedUnit.movesMax} moves ready`
      : selectedUnit.isActiveFaction
        ? 'Unit spent or out of moves'
        : 'Waiting for this faction’s turn'
    : null;

  return (
    <section className="bottom-command-bar">
      <div className="panel command-panel">
        <div className="panel-heading compact">
          <p className="panel-kicker">{state.mode === 'play' ? 'Orders' : 'Playback'}</p>
          <h2>{state.mode === 'play' ? 'Command Bar' : 'Replay Timeline'}</h2>
        </div>

        {state.mode === 'play' ? (
          <>
            <div className="timeline-controls">
              <button type="button" onClick={onEndTurn} disabled={!state.actions.canEndTurn}>End Turn [Enter]</button>
              {onRestartSession ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!state.playFeedback?.isDirty || window.confirm('Restart this playtest session and lose current progress?')) {
                      onRestartSession();
                    }
                  }}
                >
                  Restart Session
                </button>
              ) : null}
            </div>
            {selectedUnit ? (
              <div className="event-list">
                <div className="event-row">
                  <span className="event-round">Unit</span>
                  <p>{selectedUnit.prototypeName} at {selectedUnit.q},{selectedUnit.r}</p>
                </div>
                <div className="event-row">
                  <span className="event-round">{state.actions.targetingMode === 'attack' ? 'Attack' : 'Move'}</span>
                  <p>
                    {state.actions.targetingMode === 'attack'
                      ? hoveredAttackTarget
                        ? `Attack enemy at ${hoveredAttackTarget.q},${hoveredAttackTarget.r} from distance ${hoveredAttackTarget.distance}.`
                        : state.actions.attackTargets.length > 0
                          ? 'Click a red-highlighted enemy to attack, or press Esc to cancel.'
                          : 'No enemies are in attack range.'
                      : hoveredMove
                        ? `Move here for cost ${hoveredMove.cost}; ${hoveredMove.movesRemainingAfterMove} moves remain.`
                        : state.actions.legalMoves.length > 0
                          ? 'Drag the unit to a highlighted tile to move. Press A to attack.'
                          : 'No legal moves remain. Press A if an enemy is in range.'}
                  </p>
                </div>
                <div className="event-row">
                  <span className="event-round">State</span>
                  <p>{spentLabel} {state.actions.targetingMode === 'attack' ? '· Attack mode active' : ''}</p>
                </div>
              </div>
            ) : (
              <p className="quiet-copy">Select a friendly unit, then drag it to a highlighted tile to move. Press A to target an attack.</p>
            )}
          </>
        ) : (
          <>
            <div className="timeline-controls">
              <button type="button" onClick={() => onSetTurn(0)}>Start</button>
              <button type="button" onClick={() => onSetTurn(Math.max(0, state.turnIndex - 1))}>Back</button>
              <button type="button" onClick={() => onSetTurn(Math.min(timelineMax, state.turnIndex + 1))}>Step</button>
              <button type="button" onClick={onEndTurn}>Advance</button>
            </div>

            <input
              className="timeline-slider"
              type="range"
              min={0}
              max={timelineMax}
              value={state.turnIndex}
              onChange={(event) => onSetTurn(Number(event.target.value))}
            />
          </>
        )}
      </div>

      <div className="panel command-panel">
        <div className="panel-heading compact">
          <p className="panel-kicker">Trace</p>
          <h2>{state.mode === 'play' ? 'Session Events' : 'Round Events'}</h2>
        </div>

        <div className="event-list">
          {state.debug.turnEvents.length === 0 ? (
            <p className="quiet-copy">{state.mode === 'play' ? 'No session events recorded yet.' : 'No debug events recorded for this round.'}</p>
          ) : (
            state.debug.turnEvents.map((event, index) => (
              <div className="event-row" key={`${event.sequence ?? event.round}-${index}`}>
                <span className="event-round">{event.kind === 'move' ? 'Move' : `R${event.round}`}</span>
                <p>{event.message}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
