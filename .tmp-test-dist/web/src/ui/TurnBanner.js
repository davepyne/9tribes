export function TurnBanner({ factionName, factionColor, round }) {
    return (<div className="tb-root" style={{ '--tb-color': factionColor }}>
      <p className="tb-kicker">Now Acting</p>
      <h2 className="tb-faction">{factionName}</h2>
      <p className="tb-round">Round {round}</p>
    </div>);
}
