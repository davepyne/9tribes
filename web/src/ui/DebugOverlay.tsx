type DebugOverlayProps = {
  events: Array<{ sequence?: number; round: number; kind?: 'move' | 'turn'; message: string }>;
};

export function DebugOverlay({ events }: DebugOverlayProps) {
  if (events.length === 0) {
    return (
      <div className="dbg-root">
        <p className="dbg-empty">No events recorded.</p>
      </div>
    );
  }

  return (
    <div className="dbg-root">
      <p className="dbg-heading">Debug Events</p>
      <div className="dbg-list">
        {events.map((event, index) => (
          <div className="dbg-entry" key={`${event.kind ?? 'evt'}-${event.round}-${index}`}>
            <span className="dbg-entry-round">
              {event.kind === 'move' ? 'Move' : `R${event.round}`}
            </span>
            <p className="dbg-entry-msg">{event.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
