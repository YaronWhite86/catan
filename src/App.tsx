import { useReducer, useState, useCallback } from 'react';
import type { GameState } from './engine/types';
import type { GameAction } from './engine/actions';
import { gameReducer, GameError } from './engine/reducer';
import { createInitialState } from './engine/state';
import type { PlayerConfig } from './ai/types';
import { SetupScreen } from './ui/components/Setup/SetupScreen';
import { Game } from './ui/components/Game';

type InternalAction = GameAction | { type: '__RESET__'; state: GameState };

function internalReducer(state: GameState, action: InternalAction): GameState {
  if (action.type === '__RESET__') {
    return (action as { type: '__RESET__'; state: GameState }).state;
  }
  return gameReducer(state, action as GameAction);
}

function App() {
  const [gameStarted, setGameStarted] = useState(false);
  const [playerConfigs, setPlayerConfigs] = useState<PlayerConfig[]>([]);
  const [state, rawDispatch] = useReducer(
    internalReducer,
    null as unknown as GameState,
    () => createInitialState(['P1', 'P2', 'P3', 'P4']),
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
        } else {
          throw e;
        }
      }
    },
    [],
  );

  const handleStart = useCallback(
    (names: string[], playerCount: number, configs: PlayerConfig[]) => {
      const seed = Date.now();
      const newState = createInitialState(names.slice(0, playerCount), seed);
      rawDispatch({ type: '__RESET__', state: newState });
      setPlayerConfigs(configs);
      setError(null);
      setGameStarted(true);
      // Auto-start the game
      setTimeout(() => {
        try {
          rawDispatch({ type: 'START_GAME' } as GameAction);
        } catch {
          // ignore if already started
        }
      }, 0);
    },
    [],
  );

  const handleNewGame = useCallback(() => {
    setGameStarted(false);
    setPlayerConfigs([]);
    setError(null);
  }, []);

  if (!gameStarted) {
    return <SetupScreen onStart={handleStart} />;
  }

  return (
    <Game
      state={state}
      dispatch={dispatch}
      error={error}
      onNewGame={handleNewGame}
      playerConfigs={playerConfigs}
    />
  );
}

export default App;
