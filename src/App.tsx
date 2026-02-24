import { useReducer, useState, useCallback, useEffect } from 'react';
import type { GameState } from './engine/types';
import type { GameAction } from './engine/actions';
import { gameReducer, GameError } from './engine/reducer';
import { createInitialState } from './engine/state';
import type { PlayerConfig } from './ai/types';
import type { SeatConfig } from './shared/multiplayer-types';
import { SetupScreen } from './ui/components/Setup/SetupScreen';
import { Game } from './ui/components/Game';
import { LobbyScreen } from './ui/components/Lobby/LobbyScreen';
import { JoinScreen } from './ui/components/Lobby/JoinScreen';
import { useMultiplayer } from './ui/hooks/useMultiplayer';

type InternalAction = GameAction | { type: '__RESET__'; state: GameState };

function internalReducer(state: GameState, action: InternalAction): GameState {
  if (action.type === '__RESET__') {
    return (action as { type: '__RESET__'; state: GameState }).state;
  }
  return gameReducer(state, action as GameAction);
}

type AppMode = 'setup' | 'local-game' | 'online-lobby' | 'online-joining' | 'online-game';

function App() {
  // Local game state
  const [mode, setMode] = useState<AppMode>('setup');
  const [playerConfigs, setPlayerConfigs] = useState<PlayerConfig[]>([]);
  const [state, rawDispatch] = useReducer(
    internalReducer,
    null as unknown as GameState,
    () => createInitialState(['P1', 'P2', 'P3', 'P4']),
  );
  const [error, setError] = useState<string | null>(null);

  // Online game state
  const mp = useMultiplayer();

  // Check URL for room param on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('room');
    if (roomId) {
      // Check if we have a stored session for reconnection
      const stored = localStorage.getItem(`catan:room:${roomId}`);
      if (stored) {
        // Auto-reconnect
        mp.joinRoom(roomId, '');
        setMode('online-joining');
      } else {
        setMode('online-joining');
      }
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Transition from joining/lobby to game when state arrives
  useEffect(() => {
    if (mp.state && (mode === 'online-lobby' || mode === 'online-joining')) {
      setMode('online-game');
    }
  }, [mp.state, mode]);

  // Transition from joining to lobby when we get a seat and room info
  useEffect(() => {
    if (mode === 'online-joining' && mp.mySeat !== null && mp.roomInfo) {
      if (mp.roomInfo.phase === 'waiting') {
        setMode('online-lobby');
      }
    }
  }, [mode, mp.mySeat, mp.roomInfo]);

  // Local game handlers
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
      setMode('local-game');
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

  const handleCreateOnline = useCallback(
    (_playerCount: number, configs: PlayerConfig[], names: string[]) => {
      // Convert PlayerConfig[] to SeatConfig[]
      const seats: SeatConfig[] = configs.map((c, i) => {
        if (c.isAI) {
          return {
            type: 'ai' as const,
            name: names[i]?.trim() || undefined,
            difficulty: c.difficulty,
            strategyType: c.strategyType,
          };
        }
        // First human is the host (human-local), others are remote
        const isFirstHuman = configs.slice(0, i).every(pc => pc.isAI);
        return {
          type: isFirstHuman ? 'human-local' as const : 'human-remote' as const,
          name: names[i]?.trim() || undefined,
        };
      });

      // Store configs for local reference (needed for Game component)
      setPlayerConfigs(configs);
      mp.createRoom(seats);
      setMode('online-lobby');
    },
    [mp],
  );

  const handleNewGame = useCallback(() => {
    setMode('setup');
    setPlayerConfigs([]);
    setError(null);
    // Clear room URL param
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url.toString());
  }, []);

  const handleBack = useCallback(() => {
    setMode('setup');
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url.toString());
  }, []);

  // ─── Render based on mode ───────────────────────────

  if (mode === 'setup') {
    return <SetupScreen onStart={handleStart} onCreateOnline={handleCreateOnline} />;
  }

  if (mode === 'local-game') {
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

  if (mode === 'online-joining') {
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('room') ?? '';

    // If we already have a seat, we're reconnecting — show lobby or game
    if (mp.mySeat !== null && mp.state) {
      return (
        <Game
          state={mp.state}
          dispatch={mp.dispatch}
          error={mp.error}
          onNewGame={handleNewGame}
          playerConfigs={playerConfigs}
          mySeat={mp.mySeat}
          isOnline
        />
      );
    }

    return (
      <JoinScreen
        roomId={roomId}
        roomInfo={mp.roomInfo}
        error={mp.error}
        isConnected={mp.isConnected}
        onJoin={(rid, name) => {
          mp.joinRoom(rid, name);
        }}
        onBack={handleBack}
      />
    );
  }

  if (mode === 'online-lobby') {
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('room') ?? mp.roomInfo?.roomId ?? '';

    if (!mp.roomInfo) {
      return (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', color: '#666',
        }}>
          Connecting to room...
        </div>
      );
    }

    return (
      <LobbyScreen
        roomId={roomId}
        roomInfo={mp.roomInfo}
        mySeat={mp.mySeat ?? 0}
        isConnected={mp.isConnected}
        onStartGame={mp.startGame}
        onEndRoom={() => {
          mp.endRoom();
          handleBack();
        }}
        onBack={handleBack}
      />
    );
  }

  if (mode === 'online-game') {
    if (!mp.state) {
      return (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', color: '#666',
        }}>
          Waiting for game state...
        </div>
      );
    }

    // Build playerConfigs from room info for the Game component
    const onlineConfigs: PlayerConfig[] = (mp.roomInfo?.seats ?? []).map(s => ({
      isAI: s.config.type === 'ai',
      difficulty: s.config.difficulty ?? 'medium',
      strategyType: s.config.strategyType ?? 'heuristic',
    }));

    return (
      <Game
        state={mp.state}
        dispatch={mp.dispatch}
        error={mp.error}
        onNewGame={handleNewGame}
        playerConfigs={onlineConfigs}
        mySeat={mp.mySeat}
        isOnline
      />
    );
  }

  return null;
}

export default App;
