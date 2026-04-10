import { useEffect, useState } from 'react';
import { GameShell } from '../GameShell.js';
import { GameController } from '../../game/controller/GameController.js';
export function ReplayClient() {
    const [controller, setController] = useState(null);
    const [error, setError] = useState(null);
    useEffect(() => {
        fetch('/replays/mvp-seed-42.json')
            .then((response) => {
            if (!response.ok) {
                throw new Error(`Replay load failed with ${response.status}`);
            }
            return response.json();
        })
            .then((replay) => setController(new GameController({ mode: 'replay', replay })))
            .catch((loadError) => setError(loadError.message));
    }, []);
    if (error) {
        return <div className="client-loading">Replay unavailable: {error}</div>;
    }
    if (!controller) {
        return <div className="client-loading">Loading replay-backed client…</div>;
    }
    return <GameShell controller={controller}/>;
}
