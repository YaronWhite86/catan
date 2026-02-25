import { useState, useRef, useCallback, useEffect } from 'react';
import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import type { GameState } from '@engine/types';
import type { GameAction } from '@engine/actions';
import type {
  ClientMessage,
  ServerMessage,
  SeatConfig,
  RoomInfo,
} from '@shared/multiplayer-types';
import { P2PHostManager } from '../p2p/p2p-host-manager';

export interface UseP2PMultiplayerResult {
  state: GameState | null;
  roomInfo: RoomInfo | null;
  mySeat: number | null;
  error: string | null;
  isConnected: boolean;
  createRoom: (seats: SeatConfig[]) => void;
  joinRoom: (roomId: string, name: string) => void;
  startGame: () => void;
  dispatch: (action: GameAction) => void;
  endRoom: () => void;
  peerId: string | null;
  isHost: boolean;
}

function getP2PStorageKey(peerId: string): string {
  return `catan:p2p:${peerId}`;
}

interface StoredP2PSession {
  peerId: string;
  secret: string;
  seatIndex: number;
}

function loadP2PSession(peerId: string): StoredP2PSession | null {
  try {
    const raw = localStorage.getItem(getP2PStorageKey(peerId));
    if (!raw) return null;
    return JSON.parse(raw) as StoredP2PSession;
  } catch {
    return null;
  }
}

function saveP2PSession(session: StoredP2PSession): void {
  localStorage.setItem(getP2PStorageKey(session.peerId), JSON.stringify(session));
}

export function useP2PMultiplayer(): UseP2PMultiplayerResult {
  const [state, setState] = useState<GameState | null>(null);
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [mySeat, setMySeat] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);

  const hostManagerRef = useRef<P2PHostManager | null>(null);
  const joinerPeerRef = useRef<Peer | null>(null);
  const joinerConnRef = useRef<DataConnection | null>(null);
  const hostPeerIdRef = useRef<string | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hostManagerRef.current) {
        hostManagerRef.current.destroy();
        hostManagerRef.current = null;
      }
      if (joinerConnRef.current) {
        joinerConnRef.current.close();
        joinerConnRef.current = null;
      }
      if (joinerPeerRef.current) {
        joinerPeerRef.current.destroy();
        joinerPeerRef.current = null;
      }
    };
  }, []);

  // ─── Host path ───────────────────────────────────────

  const createRoom = useCallback((seats: SeatConfig[]) => {
    setIsHost(true);
    setError(null);

    const manager = new P2PHostManager({
      onRoomInfo: (info) => setRoomInfo(info),
      onStateUpdate: (s) => setState(s),
      onError: (msg) => setError(msg),
      onPeerIdReady: (id) => {
        setPeerId(id);
        setIsConnected(true);
        // Update URL
        const url = new URL(window.location.href);
        url.searchParams.set('peer', id);
        window.history.replaceState({}, '', url.toString());
      },
      onRoomCreated: (seatIndex, secret) => {
        setMySeat(seatIndex);
        // Save session for host reconnection awareness
        manager.getPeerId().then((id) => {
          saveP2PSession({ peerId: id, secret, seatIndex });
        });
      },
      onRoomEnded: () => {
        // Keep last state visible
      },
    });

    hostManagerRef.current = manager;

    // Wait for peer ID, then create the room
    manager.getPeerId().then(() => {
      manager.createRoom(seats);
    });
  }, []);

  // ─── Joiner path ─────────────────────────────────────

  const joinRoom = useCallback((hostPeerId: string, name: string) => {
    setIsHost(false);
    setError(null);
    hostPeerIdRef.current = hostPeerId;

    const peer = new Peer();
    joinerPeerRef.current = peer;

    peer.on('open', () => {
      const conn = peer.connect(hostPeerId, { reliable: true });
      joinerConnRef.current = conn;

      conn.on('open', () => {
        setIsConnected(true);

        // Check for existing session (reconnection)
        const session = loadP2PSession(hostPeerId);
        if (session) {
          conn.send({ type: 'RECONNECT', roomId: hostPeerId, secret: session.secret } satisfies ClientMessage);
        } else {
          const playerName = name.trim() || 'Player';
          conn.send({ type: 'JOIN_ROOM', roomId: hostPeerId, playerName } satisfies ClientMessage);
        }
      });

      conn.on('data', (data) => {
        const msg = data as ServerMessage;
        switch (msg.type) {
          case 'ROOM_JOINED': {
            setMySeat(msg.seatIndex);
            saveP2PSession({ peerId: hostPeerId, secret: msg.secret, seatIndex: msg.seatIndex });
            break;
          }
          case 'ROOM_INFO':
            setRoomInfo(msg.room);
            break;
          case 'STATE_UPDATE':
            setState(msg.state);
            setError(null);
            break;
          case 'ERROR':
            setError(msg.message);
            break;
          case 'ROOM_ENDED':
            // Keep last state visible
            break;
          default:
            break;
        }
      });

      conn.on('close', () => {
        setIsConnected(false);
      });

      conn.on('error', (err) => {
        setError(`Connection error: ${err.message}`);
      });
    });

    peer.on('error', (err) => {
      setError(`PeerJS error: ${err.message}`);
      setIsConnected(false);
    });
  }, []);

  // ─── Shared actions ──────────────────────────────────

  const startGame = useCallback(() => {
    if (hostManagerRef.current) {
      hostManagerRef.current.startGame();
    }
  }, []);

  const dispatch = useCallback((action: GameAction) => {
    if (hostManagerRef.current) {
      // Host: apply action directly
      hostManagerRef.current.handleHostAction(action);
    } else if (joinerConnRef.current?.open) {
      // Joiner: send action to host
      joinerConnRef.current.send({ type: 'GAME_ACTION', action } satisfies ClientMessage);
    }
  }, []);

  const endRoom = useCallback(() => {
    if (hostManagerRef.current) {
      hostManagerRef.current.endRoom();
    }
  }, []);

  return {
    state,
    roomInfo,
    mySeat,
    error,
    isConnected,
    peerId,
    isHost,
    createRoom,
    joinRoom,
    startGame,
    dispatch,
    endRoom,
  };
}
