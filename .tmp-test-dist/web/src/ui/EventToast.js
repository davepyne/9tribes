export function EventToast({ events }) {
    if (events.length === 0) {
        return null;
    }
    return (<div className="evt-root">
      {events.slice(0, 4).map((event, index) => (<div className="evt-item" key={`${event.kind ?? 'evt'}-${event.round}-${index}`}>
          <span className="evt-round">
            {event.kind === 'move' ? 'Move' : `R${event.round}`}
          </span>
          <p>{event.message}</p>
        </div>))}
    </div>);
}
