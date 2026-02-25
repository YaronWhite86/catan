import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import type { GameState } from '@engine/types';
import type { GameAction } from '@engine/actions';
import type {
  SeatConfig,
  RoomInfo,
  ServerMessage,
  ClientMessage,
  RoomPhase,
} from '@shared/multiplayer-types';
import { gameReducer, GameError } from '@engine/reducer';
import { createInitialState } from '@engine/state';
import { sanitizeStateForPlayer } from '@shared/sanitize';
import { maybeRunAI } from '@shared/ai-runner-browser';

function generateSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

interface PeerConnection {
  seatIndex: number;
  conn: DataConnection;
}

interface Room {
  hostSeat: number;
  hostSecret: string;
  seats: SeatConfig[];
  playerSecrets: (string | null)[];
  playerNames: (string | null)[];
  peerConnections: PeerConnection[];
  state: GameState | null;
  phase: RoomPhase;
  aiCleanup: (() => void) | null;
}

export interface P2PHostCallbacks {
  onRoomInfo: (info: RoomInfo) => void;
  onStateUpdate: (state: GameState) => void;
  onError: (message: string) => void;
  onPeerIdReady: (peerId: string) => void;
  onRoomCreated: (seatIndex: number, secret: string) => void;
  onRoomEnded: (reason: 'host_ended' | 'game_won') => void;
}

export class P2PHostManager {
  private peer: Peer | null = null;
  private room: Room | null = null;
  private callbacks: P2PHostCallbacks;
  private peerIdPromise: Promise<string>;
  private peerIdResolve!: (id: string) => void;

  constructor(callbacks: P2PHostCallbacks) {
    this.callbacks = callbacks;
    this.peerIdPromise = new Promise((resolve) => {
      this.peerIdResolve = resolve;
    });
    this.initPeer();
  }

  private initPeer(): void {
    this.peer = new Peer();

    this.peer.on('open', (id) => {
      this.peerIdResolve(id);
      this.callbacks.onPeerIdReady(id);
    });

    this.peer.on('connection', (conn) => {
      this.handleIncomingConnection(conn);
    });

    this.peer.on('error', (err) => {
      this.callbacks.onError(`PeerJS error: ${err.message}`);
    });
  }

  async getPeerId(): Promise<string> {
    return this.peerIdPromise;
  }

  createRoom(seats: SeatConfig[]): { seatIndex: number; secret: string } {
    const hostSecret = generateSecret();

    // Find the first human seat for the host
    let hostSeat = seats.findIndex(
      (s) => s.type === 'human-local' || s.type === 'human-remote',
    );
    if (hostSeat === -1) hostSeat = 0;

    const playerSecrets: (string | null)[] = seats.map(() => null);
    const playerNames: (string | null)[] = seats.map((s) => {
      if (s.type === 'ai') return s.name ?? 'AI';
      return null;
    });

    // Host gets connected immediately
    playerSecrets[hostSeat] = hostSecret;
    playerNames[hostSeat] = seats[hostSeat].name ?? 'Host';

    this.room = {
      hostSeat,
      hostSecret,
      seats,
      playerSecrets,
      playerNames,
      peerConnections: [],
      state: null,
      phase: 'waiting',
      aiCleanup: null,
    };

    this.callbacks.onRoomCreated(hostSeat, hostSecret);
    this.broadcastRoomInfo();

    return { seatIndex: hostSeat, secret: hostSecret };
  }

  startGame(): void {
    const room = this.room;
    if (!room) throw new Error('No room created');
    if (room.phase !== 'waiting') throw new Error('Game already started');

    // Check all human-remote seats are filled
    for (let i = 0; i < room.seats.length; i++) {
      if (room.seats[i].type === 'human-remote' && room.playerSecrets[i] === null) {
        this.callbacks.onError('Not all remote players have joined');
        return;
      }
    }

    // Build player names
    const names = room.seats.map((seat, i) => {
      if (seat.type === 'ai') {
        const diff = seat.difficulty ?? 'medium';
        const diffLabel = diff.charAt(0).toUpperCase() + diff.slice(1);
        return seat.name ?? `AI ${diffLabel} ${i + 1}`;
      }
      return room.playerNames[i] ?? `Player ${i + 1}`;
    });

    const seed = Date.now();
    let state = createInitialState(names, seed);
    state = gameReducer(state, { type: 'START_GAME' });

    room.state = state;
    room.phase = 'playing';

    this.broadcastState();
    this.broadcastRoomInfo();
    this.scheduleAI();
  }

  handleHostAction(action: GameAction): void {
    const room = this.room;
    if (!room || room.phase !== 'playing' || !room.state) {
      this.callbacks.onError('Game is not in progress');
      return;
    }

    // Validate the action comes from the host seat
    if ('player' in action && action.player !== room.hostSeat) {
      this.callbacks.onError('Action player does not match your seat');
      return;
    }

    this.applyAction(action, room.hostSeat);
  }

  endRoom(): void {
    const room = this.room;
    if (!room) return;

    if (room.aiCleanup) {
      room.aiCleanup();
      room.aiCleanup = null;
    }

    room.phase = 'finished';
    const msg: ServerMessage = { type: 'ROOM_ENDED', reason: 'host_ended' };
    this.broadcastToPeers(msg);
    this.callbacks.onRoomEnded('host_ended');
  }

  getRoomInfo(): RoomInfo | null {
    const room = this.room;
    if (!room) return null;

    return {
      roomId: '', // P2P uses peerId instead
      seats: room.seats.map((config, i) => ({
        config,
        playerName: room.playerNames[i],
        connected:
          i === room.hostSeat ||
          config.type === 'ai' ||
          room.peerConnections.some((pc) => pc.seatIndex === i),
      })),
      phase: room.phase,
    };
  }

  destroy(): void {
    const room = this.room;
    if (room?.aiCleanup) {
      room.aiCleanup();
      room.aiCleanup = null;
    }
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.room = null;
  }

  // ─── Private helpers ───────────────────────────────

  private handleIncomingConnection(conn: DataConnection): void {
    conn.on('open', () => {
      conn.on('data', (data) => {
        this.handlePeerMessage(conn, data as ClientMessage);
      });
      conn.on('close', () => {
        this.handlePeerDisconnect(conn);
      });
    });

    conn.on('error', (err) => {
      console.error('Peer connection error:', err);
    });
  }

  private handlePeerMessage(conn: DataConnection, msg: ClientMessage): void {
    const room = this.room;
    if (!room) {
      this.sendToPeer(conn, { type: 'ERROR', message: 'No room exists' });
      return;
    }

    switch (msg.type) {
      case 'JOIN_ROOM': {
        this.handleJoin(conn, msg.playerName);
        break;
      }
      case 'RECONNECT': {
        this.handleReconnect(conn, msg.secret);
        break;
      }
      case 'GAME_ACTION': {
        const pc = room.peerConnections.find((p) => p.conn === conn);
        if (!pc) {
          this.sendToPeer(conn, { type: 'ERROR', message: 'Not in room' });
          return;
        }
        // Validate action player matches seat
        if ('player' in msg.action && msg.action.player !== pc.seatIndex) {
          this.sendToPeer(conn, {
            type: 'ERROR',
            message: 'Action player does not match your seat',
          });
          return;
        }
        this.applyAction(msg.action, pc.seatIndex);
        break;
      }
      default:
        break;
    }
  }

  private handleJoin(conn: DataConnection, playerName: string): void {
    const room = this.room!;

    // Find first available human-remote seat
    let seatIndex = -1;
    for (let i = 0; i < room.seats.length; i++) {
      if (room.seats[i].type === 'human-remote' && room.playerSecrets[i] === null) {
        seatIndex = i;
        break;
      }
    }
    if (seatIndex === -1) {
      this.sendToPeer(conn, { type: 'ERROR', message: 'No available seats' });
      return;
    }

    const secret = generateSecret();
    room.playerSecrets[seatIndex] = secret;
    room.playerNames[seatIndex] = playerName;
    room.peerConnections.push({ seatIndex, conn });

    this.sendToPeer(conn, { type: 'ROOM_JOINED', seatIndex, secret });
    this.broadcastRoomInfo();

    // If game is already in progress, send current state
    if (room.state) {
      const sanitized = sanitizeStateForPlayer(room.state, seatIndex);
      this.sendToPeer(conn, { type: 'STATE_UPDATE', state: sanitized });
    }
  }

  private handleReconnect(conn: DataConnection, secret: string): void {
    const room = this.room!;

    const seatIndex = room.playerSecrets.indexOf(secret);
    if (seatIndex === -1) {
      this.sendToPeer(conn, { type: 'ERROR', message: 'Invalid reconnection secret' });
      return;
    }

    // Remove old connection for this seat if any
    room.peerConnections = room.peerConnections.filter((pc) => pc.seatIndex !== seatIndex);
    room.peerConnections.push({ seatIndex, conn });

    this.sendToPeer(conn, { type: 'ROOM_JOINED', seatIndex, secret });
    this.broadcastRoomInfo();

    if (room.state) {
      const sanitized = sanitizeStateForPlayer(room.state, seatIndex);
      this.sendToPeer(conn, { type: 'STATE_UPDATE', state: sanitized });
    }
  }

  private handlePeerDisconnect(conn: DataConnection): void {
    const room = this.room;
    if (!room) return;

    const idx = room.peerConnections.findIndex((pc) => pc.conn === conn);
    if (idx !== -1) {
      const seatIndex = room.peerConnections[idx].seatIndex;
      room.peerConnections.splice(idx, 1);
      this.broadcastToPeers({ type: 'PLAYER_LEFT', seatIndex });
      this.broadcastRoomInfo();
    }
  }

  private applyAction(action: GameAction, seatIndex: number): void {
    const room = this.room!;
    if (!room.state) return;

    // Cancel any pending AI timer
    if (room.aiCleanup) {
      room.aiCleanup();
      room.aiCleanup = null;
    }

    try {
      room.state = gameReducer(room.state, action);
    } catch (e) {
      if (e instanceof GameError) {
        // Send error to the acting player
        if (seatIndex === room.hostSeat) {
          this.callbacks.onError(e.message);
        } else {
          const pc = room.peerConnections.find((p) => p.seatIndex === seatIndex);
          if (pc) this.sendToPeer(pc.conn, { type: 'ERROR', message: e.message });
        }
        return;
      }
      throw e;
    }

    // Check for game over
    if (room.state.phase === 'GAME_OVER') {
      room.phase = 'finished';
      this.broadcastState();
      this.broadcastToPeers({ type: 'ROOM_ENDED', reason: 'game_won' });
      this.callbacks.onRoomEnded('game_won');
      return;
    }

    this.broadcastState();
    this.scheduleAI();
  }

  private broadcastState(): void {
    const room = this.room;
    if (!room?.state) return;

    // Send sanitized state to host
    const hostState = sanitizeStateForPlayer(room.state, room.hostSeat);
    this.callbacks.onStateUpdate(hostState);

    // Send sanitized state to each peer
    for (const pc of room.peerConnections) {
      const sanitized = sanitizeStateForPlayer(room.state, pc.seatIndex);
      this.sendToPeer(pc.conn, { type: 'STATE_UPDATE', state: sanitized });
    }
  }

  private broadcastRoomInfo(): void {
    const info = this.getRoomInfo();
    if (!info) return;

    this.callbacks.onRoomInfo(info);
    this.broadcastToPeers({ type: 'ROOM_INFO', room: info });
  }

  private broadcastToPeers(msg: ServerMessage): void {
    const room = this.room;
    if (!room) return;

    for (const pc of room.peerConnections) {
      this.sendToPeer(pc.conn, msg);
    }
  }

  private sendToPeer(conn: DataConnection, msg: ServerMessage): void {
    if (conn.open) {
      conn.send(msg);
    }
  }

  private scheduleAI(): void {
    const room = this.room;
    if (!room?.state || room.phase !== 'playing') return;

    const cleanup = maybeRunAI(room.state, room.seats, (playerIndex, action) => {
      try {
        this.applyAction(action, playerIndex);
      } catch (e) {
        console.error(`AI error for player ${playerIndex}:`, e);
      }
    });

    room.aiCleanup = cleanup;
  }
}
