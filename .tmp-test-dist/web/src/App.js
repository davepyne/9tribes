import { useEffect } from 'react';
import { MenuClient } from './app/routes/MenuClient.js';
import { PlayClient } from './app/routes/PlayClient.js';
import { ReplayClient } from './app/routes/ReplayClient.js';
import { syncMusicForMode } from './app/audio/musicManager.js';
function App() {
    const mode = new URLSearchParams(window.location.search).get('mode');
    useEffect(() => {
        syncMusicForMode(mode);
    }, [mode]);
    if (mode === 'play') {
        return <PlayClient />;
    }
    if (mode === 'replay') {
        return <ReplayClient />;
    }
    return <MenuClient />;
}
export default App;
