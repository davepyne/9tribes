export function CapabilityPip({ pip }) {
    const classes = [
        'capability-pip',
        pip.hasResearchTrack ? 'capability-pip--research-track' : '',
        pip.codified ? 'capability-pip--codified' : '',
        !pip.hasResearchTrack ? 'capability-pip--ecology-only' : '',
    ].filter(Boolean).join(' ');
    const progressPct = Math.min(100, (pip.level / 10) * 100);
    return (<div className={classes} title={pip.description}>
      <div className="capability-pip__header">
        <span className="capability-pip__name">{pip.domainName}</span>
        <span className="capability-pip__level">{pip.level}</span>
      </div>
      <div className="capability-pip__progress">
        <div className="capability-pip__progress-fill" style={{ width: `${progressPct}%` }}/>
      </div>
      <div className="capability-pip__thresholds">
        {pip.t1Ready ? <span className="capability-pip__threshold capability-pip__threshold--t1">T1 ✓</span> : null}
        {pip.t2Ready ? <span className="capability-pip__threshold capability-pip__threshold--t2">T2 ✓</span> : null}
      </div>
    </div>);
}
