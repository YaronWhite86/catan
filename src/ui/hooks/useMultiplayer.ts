import { useState, useEffect, useRef, useCallback } from 'react';
import type { GameState } from '@engine/types';
import type { GameAction } from '@engine/actions';
import type {
  ClientMessage,
  ServerMessage,
  SeatConfig,
  RoomInfo,
} from '@shared/multiplayer-types';

export interface UseMultiplayerResult {
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
}

const MAX_RETRIES = 3;
const BASE_BACKOFF = 1000;

function getStorageKey(roomId: string): string {
  return `catan:room:${roomId}`;
}

interface StoredSession {
  roomId: string;
  secret: string;
  seatIndex: number;
}

function loadSession(roomId: string): StoredSession | null {
  try {
    const raw = localStorage.getItem(getStorageKey(roomId));
    if (!raw) return null;
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

function saveSession(session: StoredSession): void {
  localStorage.setItem(getStorageKey(session.roomId), JSON.stringify(session));
}

function getWsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

export function useMultiplayer(): UseMultiplayerResult {
  const [state, setState] = useState<GameState | null>(null);
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [mySeat, setMySeat] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const intentionalCloseRef = useRef(false);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const handleMessage = useCallback((event: MessageEvent) => {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(event.data as string) as ServerMessage;
    } catch {
      return;
    }

    switch (msg.type) {
      case 'ROOM_CREATED': {
        roomIdRef.current = msg.roomId;
        setMySeat(msg.seatIndex);
        saveSession({ roomId: msg.roomId, secret: msg.secret, seatIndex: msg.seatIndex });
        // Update URL without reload
        const url = new URL(window.location.href);
        url.searchParams.set('room', msg.roomId);
        window.history.replaceState({}, '', url.toString());
        break;
      }
      case 'ROOM_JOINED': {
        setMySeat(msg.seatIndex);
        if (roomIdRef.current) {
          saveSession({ roomId: roomIdRef.current, secret: msg.secret, seatIndex: msg.seatIndex });
        }
        break;
      }
      case 'ROOM_INFO':
        setRoomInfo(msg.room);
        break;
      case 'PLAYER_JOINED':
      case 'PLAYER_LEFT':
      case 'PLAYER_RECONNECTED':
        // Room info updates come separately
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
    }
  }, []);

  const connect = useCallback((onOpen?: () => void) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      onOpen?.();
      return;
    }

    intentionalCloseRef.current = false;
    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      retryCountRef.current = 0;
      setError(null);
      onOpen?.();
    };

    ws.onmessage = handleMessage;

    ws.onclose = () => {
      setIsConnected(false);
      wsRef.current = null;

      if (intentionalCloseRef.current) return;

      // Auto-reconnect with backoff
      if (retryCountRef.current < MAX_RETRIES && roomIdRef.current) {
        const delay = BASE_BACKOFF * Math.pow(2, retryCountRef.current);
        retryCountRef.current++;
        retryTimerRef.current = setTimeout(() => {
          const roomId = roomIdRef.current;
          if (!roomId) return;
          const session = loadSession(roomId);
          connect(() => {
            if (session) {
              send({ type: 'RECONNECT', roomId, secret: session.secret });
            }
          });
        }, delay);
      }
    };

    ws.onerror = () => {
      // onclose will fire after this
    };
  }, [handleMessage, send]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      intentionalCloseRef.current = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const createRoom = useCallback((seats: SeatConfig[]) => {
    connect(() => {
      send({ type: 'CREATE_ROOM', seats });
    });
  }, [connect, send]);

  const joinRoom = useCallback((roomId: string, name: string) => {
    roomIdRef.current = roomId;
    // Check for existing session (reconnection)
    const session = loadSession(roomId);
    connect(() => {
      if (session) {
        send({ type: 'RECONNECT', roomId, secret: session.secret });
      } else {
        send({ type: 'JOIN_ROOM', roomId, playerName: name });
      }
    });
  }, [connect, send]);

  const startGame = useCallback(() => {
    send({ type: 'START_GAME' });
  }, [send]);

  const dispatch = useCallback((action: GameAction) => {
    send({ type: 'GAME_ACTION', action });
  }, [send]);

  const endRoom = useCallback(() => {
    send({ type: 'END_ROOM' });
  }, [send]);

  return {
    state,
    roomInfo,
    mySeat,
    error,
    isConnected,
    createRoom,
    joinRoom,
    startGame,
    dispatch,
    endRoom,
  };
}
