import { createContext, useContext, useReducer, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { GameState } from '@engine/types';
import type { GameAction } from '@engine/actions';
import { gameReducer, GameError } from '@engine/reducer';
import { createInitialState } from '@engine/state';

type InternalAction = GameAction | { type: '__RESET__'; state: GameState };

interface GameContextValue {
  state: GameState;
  dispatch: (action: GameAction) => void;
  error: string | null;
  clearError: () => void;
  resetGame: (playerNames: string[], seed?: number) => void;
}

const GameContext = createContext<GameContextValue | null>(null);

function internalReducer(state: GameState, action: InternalAction): GameState {
  if (action.type === '__RESET__') {
    return (action as { type: '__RESET__'; state: GameState }).state;
  }
  return gameReducer(state, action as GameAction);
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, rawDispatch] = useReducer(
    internalReducer,
    createInitialState(['Player 1', 'Player 2', 'Player 3', 'Player 4'], Date.now()),
  );
  const [error, setError] = useState<string | null>(null);

  const dispatch = useCallback(
    (action: GameAction) => {
      try {
        rawDispatch(action);
        setError(null);
      } catch (e) {
        if (e instanceof GameError) {
          setError(e.message);
        } else if (e instanceof Error) {
          console.error('Unexpected dispatch error:', e);
          setError(`Unexpected error: ${e.message}`);
        } else {
          console.error('Unexpected dispatch error:', e);
          setError('An unexpected error occurred');
        }
      }
    },
    [],
  );

  const clearError = useCallback(() => setError(null), []);

  const resetGame = useCallback(
    (playerNames: string[], seed?: number) => {
      const newState = createInitialState(playerNames, seed ?? Date.now());
      rawDispatch({ type: '__RESET__', state: newState });
      setError(null);
    },
    [],
  );

  return (
    <GameContext.Provider value={{ state, dispatch, error, clearError, resetGame }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}
