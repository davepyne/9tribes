import { CapabilityPip } from './CapabilityPip.js';
export function CapabilityBar({ capabilities }) {
    return (<div className="capability-bar">
      <p className="panel-kicker">Capability Domains</p>
      <div className="capability-bar__pips">
        {capabilities.map((pip) => (<CapabilityPip key={pip.domainId} pip={pip}/>))}
      </div>
    </div>);
}
