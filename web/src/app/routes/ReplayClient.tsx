import { useEffect, useState } from 'react';
import { GameShell } from '../GameShell';
import { GameController } from '../../game/controller/GameController';
import type { ReplayBundle } from '../../game/types/replay';

export function ReplayClient() {
  const [controller, setController] = useState<GameController | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/replays/mvp-seed-42.json')
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Replay load failed with ${response.status}`);
        }
        return response.json() as Promise<ReplayBundle>;
      })
      .then((replay) => setController(new GameController({ mode: 'replay', replay })))
      .catch((loadError: Error) => setError(loadError.message));
  }, []);

  if (error) {
    return <div className="client-loading">Replay unavailable: {error}</div>;
  }

  if (!controller) {
    return <div className="client-loading">Loading replay-backed client…</div>;
  }

  return <GameShell controller={controller} />;
}
