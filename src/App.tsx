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
import { useP2PMultiplayer } from './ui/hooks/useP2PMultiplayer';
import { ErrorBoundary } from './ui/components/ErrorBoundary';

type InternalAction = GameAction | { type: '__RESET__'; state: GameState };

function internalReducer(state: GameState, action: InternalAction): GameState {
  if (action.type === '__RESET__') {
    return (action as { type: '__RESET__'; state: GameState }).state;
  }
  return gameReducer(state, action as GameAction);
}

type AppMode = 'setup' | 'local-game'
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

  // P2P game state
  const p2p = useP2PMultiplayer();

  // Check URL for peer param on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const peerId = params.get('peer');
    if (peerId) {
      setMode('p2p-joining');
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // Clear peer URL params
    const url = new URL(window.location.href);
    url.searchParams.delete('peer');
    window.history.replaceState({}, '', url.toString());
  }, []);

  const handleBack = useCallback(() => {
    setMode('setup');
    const url = new URL(window.location.href);
    url.searchParams.delete('peer');
    window.history.replaceState({}, '', url.toString());
  }, []);

  // ─── Render based on mode ───────────────────────────

  if (mode === 'setup') {
    return <SetupScreen onStart={handleStart} onCreateP2P={handleCreateP2P} />;
  }

  if (mode === 'local-game') {
    return (
      <ErrorBoundary onNewGame={handleNewGame}>
        <Game
          state={state}
          dispatch={dispatch}
          error={error}
          onNewGame={handleNewGame}
          playerConfigs={playerConfigs}
        />
      </ErrorBoundary>
    );
  }

  if (mode === 'p2p-joining') {
    const params = new URLSearchParams(window.location.search);
    const hostPeerId = params.get('peer') ?? '';

    // If we already have a seat and state, we're reconnecting — show game
    if (p2p.mySeat !== null && p2p.state) {
      return (
        <ErrorBoundary onNewGame={handleNewGame}>
          <Game
            state={p2p.state}
            dispatch={p2p.dispatch}
            error={p2p.error}
            onNewGame={handleNewGame}
            playerConfigs={playerConfigs}
            mySeat={p2p.mySeat}
            isOnline
          />
        </ErrorBoundary>
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

    // Build share URL — replace localhost with LAN-accessible hostname hint
    let p2pShareUrl = '';
    if (p2p.peerId) {
      const loc = window.location;
      const isLocalhost = loc.hostname === 'localhost' || loc.hostname === '127.0.0.1';
      const host = isLocalhost ? `<YOUR_LAN_IP>:${loc.port}` : loc.host;
      const proto = loc.protocol;
      p2pShareUrl = `${proto}//${host}${loc.pathname}?peer=${p2p.peerId}`;
    }

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
      <ErrorBoundary onNewGame={handleNewGame}>
        <Game
          state={p2p.state}
          dispatch={p2p.dispatch}
          error={p2p.error}
          onNewGame={handleNewGame}
          playerConfigs={p2pConfigs}
          mySeat={p2p.mySeat}
          isOnline
        />
      </ErrorBoundary>
    );
  }

  return null;
}

export default App;
