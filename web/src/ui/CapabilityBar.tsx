import type { CapabilityPipViewModel } from '../game/types/clientState';
import { CapabilityPip } from './CapabilityPip';

type CapabilityBarProps = {
  capabilities: CapabilityPipViewModel[];
};

export function CapabilityBar({ capabilities }: CapabilityBarProps) {
  return (
    <div className="capability-bar">
      <p className="panel-kicker">Capability Domains</p>
      <div className="capability-bar__pips">
        {capabilities.map((pip) => (
          <CapabilityPip key={pip.domainId} pip={pip} />
        ))}
      </div>
    </div>
  );
}
