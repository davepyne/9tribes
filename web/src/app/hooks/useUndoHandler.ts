import { useEffect } from 'react';
import type { GameController } from '../../game/controller/GameController';

export function useUndoHandler(controller: GameController) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        controller.dispatch({ type: 'undo' });
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [controller]);
}
