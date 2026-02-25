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
import { useP2PMultiplayer } from './ui/hooks/useP2PMultiplayer';

type InternalAction = GameAction | { type: '__RESET__'; state: GameState };

function internalReducer(state: GameState, action: InternalAction): GameState {
  if (action.type === '__RESET__') {
    return (action as { type: '__RESET__'; state: GameState }).state;
  }
  return gameReducer(state, action as GameAction);
}

type AppMode = 'setup' | 'local-game'
  | 'online-lobby' | 'online-joining' | 'online-game'
  | 'p2p-lobby' | 'p2p-joining' | 'p2p-game';

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
  const p2p = useP2PMultiplayer();

  // Check URL for room/peer param on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('room');
    const peerId = params.get('peer');
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
    } else if (peerId) {
      setMode('p2p-joining');
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

  // P2P: Transition from joining/lobby to game when state arrives
  useEffect(() => {
    if (p2p.state && (mode === 'p2p-lobby' || mode === 'p2p-joining')) {
      setMode('p2p-game');
    }
  }, [p2p.state, mode]);

  // P2P: Transition from joining to lobby when we get a seat and room info
  useEffect(() => {
    if (mode === 'p2p-joining' && p2p.mySeat !== null && p2p.roomInfo) {
      if (p2p.roomInfo.phase === 'waiting') {
        setMode('p2p-lobby');
      }
    }
  }, [mode, p2p.mySeat, p2p.roomInfo]);

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

  const handleCreateP2P = useCallback(
    (_playerCount: number, configs: PlayerConfig[], names: string[]) => {
      // Convert PlayerConfig[] to SeatConfig[] (same logic as online)
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

      setPlayerConfigs(configs);
      p2p.createRoom(seats);
      setMode('p2p-lobby');
    },
    [p2p],
  );

  const handleNewGame = useCallback(() => {
    setMode('setup');
    setPlayerConfigs([]);
    setError(null);
    // Clear room/peer URL params
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    url.searchParams.delete('peer');
    window.history.replaceState({}, '', url.toString());
  }, []);

  const handleBack = useCallback(() => {
    setMode('setup');
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    url.searchParams.delete('peer');
    window.history.replaceState({}, '', url.toString());
  }, []);

  // ─── Render based on mode ───────────────────────────

  if (mode === 'setup') {
    return <SetupScreen onStart={handleStart} onCreateOnline={handleCreateOnline} onCreateP2P={handleCreateP2P} />;
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

  if (mode === 'p2p-joining') {
    const params = new URLSearchParams(window.location.search);
    const hostPeerId = params.get('peer') ?? '';

    // If we already have a seat and state, we're reconnecting — show game
    if (p2p.mySeat !== null && p2p.state) {
      return (
        <Game
          state={p2p.state}
          dispatch={p2p.dispatch}
          error={p2p.error}
          onNewGame={handleNewGame}
          playerConfigs={playerConfigs}
          mySeat={p2p.mySeat}
          isOnline
        />
      );
    }

    return (
      <JoinScreen
        roomId={hostPeerId}
        roomInfo={p2p.roomInfo}
        error={p2p.error}
        isConnected={p2p.isConnected}
        onJoin={(rid, name) => {
          p2p.joinRoom(rid, name);
        }}
        onBack={handleBack}
        isP2P
      />
    );
  }

  if (mode === 'p2p-lobby') {
    if (!p2p.roomInfo) {
      return (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', color: '#666',
        }}>
          Setting up P2P connection...
        </div>
      );
    }

    const p2pShareUrl = p2p.peerId
      ? `${window.location.origin}${window.location.pathname}?peer=${p2p.peerId}`
      : '';

    return (
      <LobbyScreen
        roomId={p2p.peerId ?? ''}
        roomInfo={p2p.roomInfo}
        mySeat={p2p.mySeat ?? 0}
        isConnected={p2p.isConnected}
        onStartGame={p2p.startGame}
        onEndRoom={() => {
          p2p.endRoom();
          handleBack();
        }}
        onBack={handleBack}
        title="P2P Game Lobby"
        subtitle="Direct connection (no server)"
        shareUrl={p2pShareUrl}
      />
    );
  }

  if (mode === 'p2p-game') {
    if (!p2p.state) {
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
    const p2pConfigs: PlayerConfig[] = (p2p.roomInfo?.seats ?? []).map(s => ({
      isAI: s.config.type === 'ai',
      difficulty: s.config.difficulty ?? 'medium',
      strategyType: s.config.strategyType ?? 'heuristic',
    }));

    return (
      <Game
        state={p2p.state}
        dispatch={p2p.dispatch}
        error={p2p.error}
        onNewGame={handleNewGame}
        playerConfigs={p2pConfigs}
        mySeat={p2p.mySeat}
        isOnline
      />
    );
  }

  return null;
}

export default App;
