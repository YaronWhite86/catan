import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WebSocket } from 'ws';
import type { GameState } from '../src/engine/types.js';
import type { GameAction } from '../src/engine/actions.js';
import type { SeatConfig, RoomInfo, ServerMessage, RoomPhase } from '../src/shared/multiplayer-types.js';
import type { PlayerConfig } from '../src/ai/types.js';
import { gameReducer, GameError } from '../src/engine/reducer.js';
import { createInitialState } from '../src/engine/state.js';
import { sanitizeStateForPlayer } from './sanitize.js';
import { maybeRunAI } from './ai-runner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'data', 'rooms');

const STALE_ROOM_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface Room {
  id: string;
  hostSeat: number;
  hostSecret: string;
  seats: SeatConfig[];
  playerSecrets: (string | null)[];
  playerNames: (string | null)[];
  connections: (WebSocket | null)[];
  state: GameState | null;
  phase: RoomPhase;
  lastActivity: number;
  aiCleanup: (() => void) | null;
}

function generateId(length: number): string {
  return randomBytes(length).toString('base64url').slice(0, length).toUpperCase();
}

function generateSecret(): string {
  return randomBytes(24).toString('base64url');
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  constructor() {
    this.loadRooms();
  }

  createRoom(seats: SeatConfig[], hostWs: WebSocket): { roomId: string; seatIndex: number; secret: string } {
    const roomId = generateId(6);
    const hostSecret = generateSecret();

    // Find the first human-local or human-remote seat for the host
    let hostSeat = seats.findIndex(s => s.type === 'human-local' || s.type === 'human-remote');
    if (hostSeat === -1) hostSeat = 0;

    const playerSecrets: (string | null)[] = seats.map(() => null);
    const playerNames: (string | null)[] = seats.map((s) => {
      if (s.type === 'ai') return s.name ?? 'AI';
      return null;
    });
    const connections: (WebSocket | null)[] = seats.map(() => null);

    // Host gets connected immediately
    playerSecrets[hostSeat] = hostSecret;
    playerNames[hostSeat] = seats[hostSeat].name ?? 'Host';
    connections[hostSeat] = hostWs;

    const room: Room = {
      id: roomId,
      hostSeat,
      hostSecret,
      seats,
      playerSecrets,
      playerNames,
      connections,
      state: null,
      phase: 'waiting',
      lastActivity: Date.now(),
      aiCleanup: null,
    };

    this.rooms.set(roomId, room);
    this.persistRoom(room);

    return { roomId, seatIndex: hostSeat, secret: hostSecret };
  }

  joinRoom(roomId: string, playerName: string, ws: WebSocket): { seatIndex: number; secret: string } {
    const room = this.getRoom(roomId);

    // Find first available human-remote seat
    let seatIndex = -1;
    for (let i = 0; i < room.seats.length; i++) {
      if (room.seats[i].type === 'human-remote' && room.playerSecrets[i] === null) {
        seatIndex = i;
        break;
      }
    }
    if (seatIndex === -1) {
      throw new Error('No available seats in this room');
    }

    const secret = generateSecret();
    room.playerSecrets[seatIndex] = secret;
    room.playerNames[seatIndex] = playerName;
    room.connections[seatIndex] = ws;
    room.lastActivity = Date.now();

    this.persistRoom(room);
    return { seatIndex, secret };
  }

  reconnect(roomId: string, secret: string, ws: WebSocket): { seatIndex: number } {
    const room = this.getRoom(roomId);

    // Find seat matching secret
    const seatIndex = room.playerSecrets.indexOf(secret);
    if (seatIndex === -1) {
      throw new Error('Invalid reconnection secret');
    }

    room.connections[seatIndex] = ws;
    room.lastActivity = Date.now();
    return { seatIndex };
  }

  startGame(roomId: string, requestingSeat: number): void {
    const room = this.getRoom(roomId);

    if (room.phase !== 'waiting') {
      throw new Error('Game already started');
    }

    // Only host can start
    if (requestingSeat !== room.hostSeat) {
      throw new Error('Only the host can start the game');
    }

    // Check all human-remote seats are filled
    for (let i = 0; i < room.seats.length; i++) {
      if (room.seats[i].type === 'human-remote' && room.playerSecrets[i] === null) {
        throw new Error('Not all remote players have joined');
      }
    }

    // Build player names
    const names = room.seats.map((seat, i) => {
      if (seat.type === 'ai') {
        const diff = (seat.difficulty ?? 'medium');
        const diffLabel = diff.charAt(0).toUpperCase() + diff.slice(1);
        return seat.name ?? `AI ${diffLabel} ${i + 1}`;
      }
      return room.playerNames[i] ?? `Player ${i + 1}`;
    });

    const seed = Date.now();
    let state = createInitialState(names, seed);

    // Start the game
    state = gameReducer(state, { type: 'START_GAME' });

    room.state = state;
    room.phase = 'playing';
    room.lastActivity = Date.now();

    this.persistRoom(room);
    this.broadcastState(room);
    this.scheduleAI(room);
  }

  handleAction(roomId: string, seatIndex: number, action: GameAction): void {
    const room = this.getRoom(roomId);

    if (room.phase !== 'playing' || !room.state) {
      throw new Error('Game is not in progress');
    }

    // Validate the action comes from the correct seat
    // Actions have a 'player' field (except START_GAME which shouldn't be sent here)
    if ('player' in action && action.player !== seatIndex) {
      throw new Error('Action player does not match your seat');
    }

    // Cancel any pending AI timer
    if (room.aiCleanup) {
      room.aiCleanup();
      room.aiCleanup = null;
    }

    try {
      room.state = gameReducer(room.state, action);
    } catch (e) {
      if (e instanceof GameError) {
        // Send error only to the acting player
        this.sendToSeat(room, seatIndex, { type: 'ERROR', message: e.message });
        return;
      }
      throw e;
    }

    room.lastActivity = Date.now();

    // Check for game over
    if (room.state.phase === 'GAME_OVER') {
      room.phase = 'finished';
      this.broadcastState(room);
      this.broadcastToRoom(roomId, { type: 'ROOM_ENDED', reason: 'game_won' });
      this.persistRoom(room);
      return;
    }

    this.broadcastState(room);
    this.persistRoom(room);
    this.scheduleAI(room);
  }

  endRoom(roomId: string, requestingSeat: number): void {
    const room = this.getRoom(roomId);

    if (requestingSeat !== room.hostSeat) {
      throw new Error('Only the host can end the room');
    }

    if (room.aiCleanup) {
      room.aiCleanup();
      room.aiCleanup = null;
    }

    room.phase = 'finished';
    this.broadcastToRoom(roomId, { type: 'ROOM_ENDED', reason: 'host_ended' });
    this.persistRoom(room);
  }

  handleDisconnect(roomId: string, seatIndex: number): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.connections[seatIndex] = null;

    // Notify other players
    this.broadcastToRoom(roomId, { type: 'PLAYER_LEFT', seatIndex });
    this.broadcastRoomInfo(roomId);
  }

  getRoomInfo(roomId: string): RoomInfo {
    const room = this.getRoom(roomId);
    return {
      roomId: room.id,
      seats: room.seats.map((config, i) => ({
        config,
        playerName: room.playerNames[i],
        connected: room.connections[i] !== null || config.type === 'ai',
      })),
      phase: room.phase,
    };
  }

  broadcastRoomInfo(roomId: string): void {
    const room = this.getRoom(roomId);
    const info = this.getRoomInfo(roomId);
    this.broadcastToRoom(room.id, { type: 'ROOM_INFO', room: info });
  }

  broadcastToRoom(roomId: string, msg: ServerMessage): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    for (const ws of room.connections) {
      if (ws && ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    }
  }

  sendStateToPlayer(roomId: string, seatIndex: number): void {
    const room = this.rooms.get(roomId);
    if (!room?.state) return;

    const sanitized = sanitizeStateForPlayer(room.state, seatIndex);
    this.sendToSeat(room, seatIndex, { type: 'STATE_UPDATE', state: sanitized });
  }

  cleanupStaleRooms(): void {
    const now = Date.now();
    for (const [roomId, room] of this.rooms) {
      if (now - room.lastActivity > STALE_ROOM_MS) {
        if (room.aiCleanup) room.aiCleanup();
        this.rooms.delete(roomId);
        try {
          fs.unlinkSync(path.join(DATA_DIR, `${roomId}.json`));
        } catch {
          // ignore
        }
      }
    }
  }

  // ─── Private helpers ───────────────────────────────

  private getRoom(roomId: string): Room {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Room ${roomId} not found`);
    return room;
  }

  private sendToSeat(room: Room, seatIndex: number, msg: ServerMessage): void {
    const ws = room.connections[seatIndex];
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  private broadcastState(room: Room): void {
    if (!room.state) return;

    for (let i = 0; i < room.connections.length; i++) {
      const ws = room.connections[i];
      if (ws && ws.readyState === ws.OPEN) {
        const sanitized = sanitizeStateForPlayer(room.state, i);
        ws.send(JSON.stringify({ type: 'STATE_UPDATE', state: sanitized } satisfies ServerMessage));
      }
    }
  }

  private scheduleAI(room: Room): void {
    if (!room.state || room.phase !== 'playing') return;

    const cleanup = maybeRunAI(room.state, room.seats, (playerIndex, action) => {
      try {
        this.handleAction(room.id, playerIndex, action);
      } catch (e) {
        console.error(`AI error in room ${room.id} for player ${playerIndex}:`, e);
      }
    });

    room.aiCleanup = cleanup;
  }

  private persistRoom(room: Room): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const data = {
        id: room.id,
        hostSeat: room.hostSeat,
        hostSecret: room.hostSecret,
        seats: room.seats,
        playerSecrets: room.playerSecrets,
        playerNames: room.playerNames,
        state: room.state,
        phase: room.phase,
        lastActivity: room.lastActivity,
      };
      fs.writeFileSync(path.join(DATA_DIR, `${room.id}.json`), JSON.stringify(data));
    } catch (e) {
      console.error(`Failed to persist room ${room.id}:`, e);
    }
  }

  private loadRooms(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) return;

      const files = fs.readdirSync(DATA_DIR);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const raw = fs.readFileSync(path.join(DATA_DIR, file), 'utf-8');
          const data = JSON.parse(raw);
          const room: Room = {
            id: data.id,
            hostSeat: data.hostSeat,
            hostSecret: data.hostSecret,
            seats: data.seats,
            playerSecrets: data.playerSecrets,
            playerNames: data.playerNames,
            connections: data.seats.map(() => null),
            state: data.state,
            phase: data.phase,
            lastActivity: data.lastActivity,
            aiCleanup: null,
          };
          this.rooms.set(room.id, room);
        } catch (e) {
          console.error(`Failed to load room from ${file}:`, e);
        }
      }
      console.log(`Loaded ${this.rooms.size} room(s) from disk`);
    } catch {
      // data directory doesn't exist yet, that's fine
    }
  }
}
