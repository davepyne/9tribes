import type { CSSProperties } from 'react';

type TurnBannerProps = {
  factionName: string;
  factionColor: string;
  round: number;
};

export function TurnBanner({ factionName, factionColor, round }: TurnBannerProps) {
  return (
    <div className="tb-root" style={{ '--tb-color': factionColor } as CSSProperties}>
      <p className="tb-kicker">Now Acting</p>
      <h2 className="tb-faction">{factionName}</h2>
      <p className="tb-round">Round {round}</p>
    </div>
  );
}
