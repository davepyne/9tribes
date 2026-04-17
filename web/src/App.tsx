import { useEffect } from 'react';
import { MenuClient } from './app/routes/MenuClient';
import { PlayClient } from './app/routes/PlayClient';
import { syncMusicForMode } from './app/audio/musicManager';

function App() {
  const mode = new URLSearchParams(window.location.search).get('mode');

  useEffect(() => {
    syncMusicForMode(mode);
  }, [mode]);

  if (mode === 'play') {
    return <PlayClient />;
  }

  return <MenuClient />;
}

export default App;
