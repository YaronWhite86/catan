import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';

import type { SeatConfig, ServerMessage, ClientMessage } from '@shared/multiplayer-types';
import type { P2PHostCallbacks } from '@ui/p2p/p2p-host-manager';

// ─── Mock PeerJS ──────────────────────────────────────

type EventHandler = (...args: unknown[]) => void;

class MockDataConnection {
  open = true;
  sentMessages: unknown[] = [];
  private listeners: Record<string, EventHandler[]> = {};

  on(event: string, fn: EventHandler) {
    (this.listeners[event] ??= []).push(fn);
    return this;
  }

  send(data: unknown) {
    this.sentMessages.push(data);
  }

  simulateOpen() {
    for (const fn of this.listeners['open'] ?? []) fn();
  }

  simulateClose() {
    for (const fn of this.listeners['close'] ?? []) fn();
  }

  injectMessage(msg: ClientMessage) {
    for (const fn of this.listeners['data'] ?? []) fn(msg);
  }
}

class MockPeer {
  id = 'mock-peer-id-12345';
  destroyed = false;
  private listeners: Record<string, EventHandler[]> = {};

  constructor() {
    // Auto-fire 'open' after microtask so onPeerIdReady triggers
    queueMicrotask(() => this.emit('open', this.id));
  }

  on(event: string, fn: EventHandler) {
    (this.listeners[event] ??= []).push(fn);
    return this;
  }

  emit(event: string, ...args: unknown[]) {
    for (const fn of this.listeners[event] ?? []) fn(...args);
  }

  simulateIncomingConnection(conn: MockDataConnection) {
    this.emit('connection', conn);
  }

  destroy() {
    this.destroyed = true;
  }
}

let mockPeerInstance: MockPeer;

vi.mock('peerjs', () => ({
  default: class {
    constructor() {
      mockPeerInstance = new MockPeer();
      // Copy methods so the real constructor returns our mock
      Object.assign(this, mockPeerInstance);
      // Bind prototype methods
      (this as unknown as Record<string, unknown>)['on'] = mockPeerInstance.on.bind(mockPeerInstance);
      (this as unknown as Record<string, unknown>)['destroy'] = mockPeerInstance.destroy.bind(mockPeerInstance);
      // Re-trigger the microtask since constructor already ran on mockPeerInstance
      // The microtask from MockPeer constructor fires on mockPeerInstance's listeners which are shared via `on`
    }
  },
}));

// ─── Mock AI runner ───────────────────────────────────

vi.mock('@shared/ai-runner-browser', () => ({
  maybeRunAI: vi.fn().mockReturnValue(null),
}));

// ─── Import after mocks ──────────────────────────────

import { P2PHostManager } from '@ui/p2p/p2p-host-manager';
import * as sanitizeModule from '@shared/sanitize';
import * as reducerModule from '@engine/reducer';
import { GameError } from '@engine/reducer';
import { maybeRunAI } from '@shared/ai-runner-browser';

// ─── Helpers ─────────────────────────────────────────

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createCallbacks(): P2PHostCallbacks & { [K in keyof P2PHostCallbacks]: Mock } {
  return {
    onRoomInfo: vi.fn(),
    onStateUpdate: vi.fn(),
    onError: vi.fn(),
    onPeerIdReady: vi.fn(),
    onRoomCreated: vi.fn(),
    onRoomEnded: vi.fn(),
  };
}

function simulateJoinerConnect(
  name: string,
): MockDataConnection {
  const conn = new MockDataConnection();
  mockPeerInstance.simulateIncomingConnection(conn);
  conn.simulateOpen();
  conn.injectMessage({ type: 'JOIN_ROOM', roomId: '', playerName: name });
  return conn;
}

// ─── Seat Configs ────────────────────────────────────

const SEATS_3P: SeatConfig[] = [
  { type: 'human-local', name: 'Host' },
  { type: 'human-remote', name: 'Remote1' },
  { type: 'ai', name: 'Bot' },
];

const SEATS_4P: SeatConfig[] = [
  { type: 'human-local', name: 'Host' },
  { type: 'human-remote', name: 'Remote1' },
  { type: 'human-remote', name: 'Remote2' },
  { type: 'ai', name: 'Bot' },
];

const SEATS_AI_FIRST: SeatConfig[] = [
  { type: 'ai', name: 'Bot' },
  { type: 'human-local', name: 'Host' },
  { type: 'human-remote', name: 'Remote1' },
];

// ─── Tests ────────────────────────────────────────────

describe('P2PHostManager', () => {
  let callbacks: ReturnType<typeof createCallbacks>;
  let manager: P2PHostManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    (maybeRunAI as Mock).mockReturnValue(null);
    callbacks = createCallbacks();
    manager = new P2PHostManager(callbacks);
    await flushPromises();
  });

  // ─── 1. PeerJS Initialization ──────────────────────

  describe('PeerJS Initialization', () => {
    it('calls onPeerIdReady with mock peer ID after construction', () => {
      expect(callbacks.onPeerIdReady).toHaveBeenCalledWith('mock-peer-id-12345');
    });

    it('getPeerId() resolves to the mock peer ID', async () => {
      const peerId = await manager.getPeerId();
      expect(peerId).toBe('mock-peer-id-12345');
    });

    it('PeerJS error event triggers onError callback', () => {
      mockPeerInstance.emit('error', { message: 'Connection failed' });
      expect(callbacks.onError).toHaveBeenCalledWith('PeerJS error: Connection failed');
    });
  });

  // ─── 2. Room Creation ──────────────────────────────

  describe('Room Creation', () => {
    it('createRoom returns correct seatIndex (0) and a 48-char hex secret', () => {
      const result = manager.createRoom(SEATS_3P);
      expect(result.seatIndex).toBe(0);
      expect(result.secret).toMatch(/^[0-9a-f]{48}$/);
    });

    it('host assigned to first human seat, skipping leading AI seats', () => {
      const result = manager.createRoom(SEATS_AI_FIRST);
      expect(result.seatIndex).toBe(1); // seat 0 is AI, seat 1 is human-local
    });

    it('onRoomCreated callback fires with matching seat index and secret', () => {
      const result = manager.createRoom(SEATS_3P);
      expect(callbacks.onRoomCreated).toHaveBeenCalledWith(result.seatIndex, result.secret);
    });

    it('onRoomInfo called with correct structure after createRoom', () => {
      manager.createRoom(SEATS_3P);
      expect(callbacks.onRoomInfo).toHaveBeenCalledTimes(1);
      const info = callbacks.onRoomInfo.mock.calls[0][0];
      expect(info.phase).toBe('waiting');
      expect(info.seats).toHaveLength(3);
      // Host seat is connected
      expect(info.seats[0].connected).toBe(true);
      // Remote seat is not connected yet
      expect(info.seats[1].connected).toBe(false);
      // AI seat is connected
      expect(info.seats[2].connected).toBe(true);
    });

    it('getRoomInfo() returns the same info', () => {
      manager.createRoom(SEATS_3P);
      const info = manager.getRoomInfo();
      expect(info).not.toBeNull();
      expect(info!.phase).toBe('waiting');
      expect(info!.seats[0].connected).toBe(true);
      expect(info!.seats[1].connected).toBe(false);
      expect(info!.seats[2].connected).toBe(true);
    });
  });

  // ─── 3. Player Joining ─────────────────────────────

  describe('Player Joining', () => {
    beforeEach(() => {
      manager.createRoom(SEATS_3P);
      callbacks.onRoomInfo.mockClear();
    });

    it('joiner assigned to first human-remote seat and receives ROOM_JOINED', () => {
      const conn = simulateJoinerConnect('Alice');
      const joinMsg = conn.sentMessages.find(
        (m) => (m as ServerMessage).type === 'ROOM_JOINED',
      ) as ServerMessage & { type: 'ROOM_JOINED' };
      expect(joinMsg).toBeDefined();
      expect(joinMsg.seatIndex).toBe(1); // first human-remote
      expect(joinMsg.secret).toMatch(/^[0-9a-f]{48}$/);
    });

    it('onRoomInfo broadcast again after join, showing joiner connected', () => {
      simulateJoinerConnect('Alice');
      expect(callbacks.onRoomInfo).toHaveBeenCalled();
      const lastCall = callbacks.onRoomInfo.mock.calls[callbacks.onRoomInfo.mock.calls.length - 1][0];
      expect(lastCall.seats[1].connected).toBe(true);
      expect(lastCall.seats[1].playerName).toBe('Alice');
    });

    it('second joiner gets next available seat (SEATS_4P)', () => {
      // Recreate with 4P seats
      manager.createRoom(SEATS_4P);
      const conn1 = simulateJoinerConnect('Alice');
      const conn2 = simulateJoinerConnect('Bob');

      const join1 = conn1.sentMessages.find(
        (m) => (m as ServerMessage).type === 'ROOM_JOINED',
      ) as ServerMessage & { type: 'ROOM_JOINED' };
      const join2 = conn2.sentMessages.find(
        (m) => (m as ServerMessage).type === 'ROOM_JOINED',
      ) as ServerMessage & { type: 'ROOM_JOINED' };

      expect(join1.seatIndex).toBe(1);
      expect(join2.seatIndex).toBe(2);
    });

    it('no seats available → joiner receives ERROR', () => {
      // Seat 1 is the only remote seat, fill it
      simulateJoinerConnect('Alice');
      const conn2 = simulateJoinerConnect('Eve');
      const errorMsg = conn2.sentMessages.find(
        (m) => (m as ServerMessage).type === 'ERROR',
      ) as ServerMessage & { type: 'ERROR' };
      expect(errorMsg).toBeDefined();
      expect(errorMsg.message).toBe('No available seats');
    });

    it('no room exists → joiner receives ERROR', async () => {
      // Create a fresh manager with no room
      const cb2 = createCallbacks();
      void new P2PHostManager(cb2);
      await flushPromises();

      const conn = new MockDataConnection();
      mockPeerInstance.simulateIncomingConnection(conn);
      conn.simulateOpen();
      conn.injectMessage({ type: 'JOIN_ROOM', roomId: '', playerName: 'Eve' });

      const errorMsg = conn.sentMessages.find(
        (m) => (m as ServerMessage).type === 'ERROR',
      ) as ServerMessage & { type: 'ERROR' };
      expect(errorMsg).toBeDefined();
      expect(errorMsg.message).toBe('No room exists');
    });
  });

  // ─── 4. Reconnection ──────────────────────────────

  describe('Reconnection', () => {
    let joinerSecret: string;
    let joinerConn: MockDataConnection;

    beforeEach(() => {
      manager.createRoom(SEATS_3P);
      joinerConn = simulateJoinerConnect('Alice');
      const joinMsg = joinerConn.sentMessages.find(
        (m) => (m as ServerMessage).type === 'ROOM_JOINED',
      ) as ServerMessage & { type: 'ROOM_JOINED' };
      joinerSecret = joinMsg.secret;
      callbacks.onRoomInfo.mockClear();
    });

    it('valid secret restores seat with same seatIndex', () => {
      const newConn = new MockDataConnection();
      mockPeerInstance.simulateIncomingConnection(newConn);
      newConn.simulateOpen();
      newConn.injectMessage({ type: 'RECONNECT', roomId: '', secret: joinerSecret });

      const joinMsg = newConn.sentMessages.find(
        (m) => (m as ServerMessage).type === 'ROOM_JOINED',
      ) as ServerMessage & { type: 'ROOM_JOINED' };
      expect(joinMsg).toBeDefined();
      expect(joinMsg.seatIndex).toBe(1);
    });

    it('invalid secret → ERROR', () => {
      const newConn = new MockDataConnection();
      mockPeerInstance.simulateIncomingConnection(newConn);
      newConn.simulateOpen();
      newConn.injectMessage({ type: 'RECONNECT', roomId: '', secret: 'bad-secret' });

      const errorMsg = newConn.sentMessages.find(
        (m) => (m as ServerMessage).type === 'ERROR',
      ) as ServerMessage & { type: 'ERROR' };
      expect(errorMsg).toBeDefined();
      expect(errorMsg.message).toBe('Invalid reconnection secret');
    });

    it('reconnect replaces old connection (old conn stops receiving broadcasts)', () => {
      const newConn = new MockDataConnection();
      mockPeerInstance.simulateIncomingConnection(newConn);
      newConn.simulateOpen();
      newConn.injectMessage({ type: 'RECONNECT', roomId: '', secret: joinerSecret });

      // Clear previous messages
      joinerConn.sentMessages.length = 0;
      newConn.sentMessages.length = 0;

      // Trigger a room info broadcast by ending the room
      manager.endRoom();

      // New conn should receive ROOM_ENDED, old should not
      const newMessages = newConn.sentMessages.map((m) => (m as ServerMessage).type);
      const oldMessages = joinerConn.sentMessages.map((m) => (m as ServerMessage).type);
      expect(newMessages).toContain('ROOM_ENDED');
      expect(oldMessages).not.toContain('ROOM_ENDED');
    });

    it('reconnect during active game sends STATE_UPDATE with sanitized state', () => {
      // Start the game first
      manager.startGame();
      callbacks.onRoomInfo.mockClear();

      const newConn = new MockDataConnection();
      mockPeerInstance.simulateIncomingConnection(newConn);
      newConn.simulateOpen();
      newConn.injectMessage({ type: 'RECONNECT', roomId: '', secret: joinerSecret });

      const stateMsg = newConn.sentMessages.find(
        (m) => (m as ServerMessage).type === 'STATE_UPDATE',
      ) as ServerMessage & { type: 'STATE_UPDATE' };
      expect(stateMsg).toBeDefined();
      // State should be sanitized (devCardDeck hidden)
      expect(stateMsg.state.devCardDeck.every((c: unknown) => c === 'hidden')).toBe(true);
    });
  });

  // ─── 5. Game Start ─────────────────────────────────

  describe('Game Start', () => {
    it('startGame() broadcasts STATE_UPDATE to host callback and joiner connection', () => {
      manager.createRoom(SEATS_3P);
      const conn = simulateJoinerConnect('Alice');
      conn.sentMessages.length = 0;

      manager.startGame();

      expect(callbacks.onStateUpdate).toHaveBeenCalledTimes(1);
      const stateMsg = conn.sentMessages.find(
        (m) => (m as ServerMessage).type === 'STATE_UPDATE',
      );
      expect(stateMsg).toBeDefined();
    });

    it('fails with onError if seats unfilled', () => {
      manager.createRoom(SEATS_3P);
      // Don't join any remote player
      manager.startGame();
      expect(callbacks.onError).toHaveBeenCalledWith('Not all remote players have joined');
    });

    it('phase transitions from waiting to playing', () => {
      manager.createRoom(SEATS_3P);
      simulateJoinerConnect('Alice');
      expect(manager.getRoomInfo()!.phase).toBe('waiting');

      manager.startGame();
      expect(manager.getRoomInfo()!.phase).toBe('playing');
    });

    it('calling startGame() twice throws Game already started', () => {
      manager.createRoom(SEATS_3P);
      simulateJoinerConnect('Alice');
      manager.startGame();
      expect(() => manager.startGame()).toThrow('Game already started');
    });
  });

  // ─── 6. Action Dispatch ────────────────────────────

  describe('Action Dispatch', () => {
    let joinerConn: MockDataConnection;

    beforeEach(() => {
      manager.createRoom(SEATS_3P);
      joinerConn = simulateJoinerConnect('Alice');
      manager.startGame();
      callbacks.onError.mockClear();
      joinerConn.sentMessages.length = 0;
    });

    it('host action with wrong player index → onError', () => {
      manager.handleHostAction({ type: 'ROLL_DICE', player: 1 });
      expect(callbacks.onError).toHaveBeenCalledWith('Action player does not match your seat');
    });

    it('joiner action with wrong seat → joiner receives ERROR', () => {
      joinerConn.injectMessage({
        type: 'GAME_ACTION',
        action: { type: 'ROLL_DICE', player: 0 },
      });
      const errorMsg = joinerConn.sentMessages.find(
        (m) => (m as ServerMessage).type === 'ERROR',
      ) as ServerMessage & { type: 'ERROR' };
      expect(errorMsg).toBeDefined();
      expect(errorMsg.message).toBe('Action player does not match your seat');
    });

    it('GAME_ACTION from unrecognized connection → ERROR: Not in room', () => {
      const strangerConn = new MockDataConnection();
      mockPeerInstance.simulateIncomingConnection(strangerConn);
      strangerConn.simulateOpen();
      strangerConn.injectMessage({
        type: 'GAME_ACTION',
        action: { type: 'ROLL_DICE', player: 0 },
      });
      const errorMsg = strangerConn.sentMessages.find(
        (m) => (m as ServerMessage).type === 'ERROR',
      ) as ServerMessage & { type: 'ERROR' };
      expect(errorMsg).toBeDefined();
      expect(errorMsg.message).toBe('Not in room');
    });

    it('GameError from reducer sent to host via onError (not to joiner)', () => {
      // Spy on gameReducer to throw a GameError when host acts
      const spy = vi.spyOn(reducerModule, 'gameReducer');
      spy.mockImplementationOnce(() => {
        throw new GameError('Invalid move');
      });

      manager.handleHostAction({ type: 'ROLL_DICE', player: 0 });
      expect(callbacks.onError).toHaveBeenCalledWith('Invalid move');
      // Joiner should NOT get an error for the host's bad action
      const joinerErrors = joinerConn.sentMessages.filter(
        (m) => (m as ServerMessage).type === 'ERROR',
      );
      expect(joinerErrors).toHaveLength(0);

      spy.mockRestore();
    });

    it('GameError from reducer sent to joiner connection (not to host callback)', () => {
      const spy = vi.spyOn(reducerModule, 'gameReducer');
      spy.mockImplementationOnce(() => {
        throw new GameError('Not your turn');
      });

      joinerConn.injectMessage({
        type: 'GAME_ACTION',
        action: { type: 'ROLL_DICE', player: 1 },
      });

      const errorMsg = joinerConn.sentMessages.find(
        (m) => (m as ServerMessage).type === 'ERROR',
      ) as ServerMessage & { type: 'ERROR' };
      expect(errorMsg).toBeDefined();
      expect(errorMsg.message).toBe('Not your turn');
      // Host should NOT get the error callback for joiner's bad action
      expect(callbacks.onError).not.toHaveBeenCalled();

      spy.mockRestore();
    });
  });

  // ─── 7. Disconnect ─────────────────────────────────

  describe('Disconnect', () => {
    it('disconnected peer seat shows connected: false in getRoomInfo()', () => {
      manager.createRoom(SEATS_3P);
      const conn = simulateJoinerConnect('Alice');
      expect(manager.getRoomInfo()!.seats[1].connected).toBe(true);

      conn.simulateClose();
      expect(manager.getRoomInfo()!.seats[1].connected).toBe(false);
    });

    it('PLAYER_LEFT broadcast to remaining peers (SEATS_4P)', () => {
      manager.createRoom(SEATS_4P);
      const conn1 = simulateJoinerConnect('Alice');
      const conn2 = simulateJoinerConnect('Bob');
      conn1.sentMessages.length = 0;
      conn2.sentMessages.length = 0;

      // Disconnect Alice (seat 1)
      conn1.simulateClose();

      // Bob should receive PLAYER_LEFT
      const leftMsg = conn2.sentMessages.find(
        (m) => (m as ServerMessage).type === 'PLAYER_LEFT',
      ) as ServerMessage & { type: 'PLAYER_LEFT' };
      expect(leftMsg).toBeDefined();
      expect(leftMsg.seatIndex).toBe(1);
    });

    it('onRoomInfo called again with updated connection status', () => {
      manager.createRoom(SEATS_3P);
      const conn = simulateJoinerConnect('Alice');
      callbacks.onRoomInfo.mockClear();

      conn.simulateClose();
      expect(callbacks.onRoomInfo).toHaveBeenCalled();
      const lastInfo = callbacks.onRoomInfo.mock.calls[callbacks.onRoomInfo.mock.calls.length - 1][0];
      expect(lastInfo.seats[1].connected).toBe(false);
    });
  });

  // ─── 8. End Room ───────────────────────────────────

  describe('End Room', () => {
    it('endRoom() sends ROOM_ENDED to all peers', () => {
      manager.createRoom(SEATS_3P);
      const conn = simulateJoinerConnect('Alice');
      conn.sentMessages.length = 0;

      manager.endRoom();

      const endMsg = conn.sentMessages.find(
        (m) => (m as ServerMessage).type === 'ROOM_ENDED',
      ) as ServerMessage & { type: 'ROOM_ENDED' };
      expect(endMsg).toBeDefined();
      expect(endMsg.reason).toBe('host_ended');
    });

    it('onRoomEnded callback fired with host_ended', () => {
      manager.createRoom(SEATS_3P);
      simulateJoinerConnect('Alice');
      manager.endRoom();
      expect(callbacks.onRoomEnded).toHaveBeenCalledWith('host_ended');
    });

    it('phase transitions to finished', () => {
      manager.createRoom(SEATS_3P);
      simulateJoinerConnect('Alice');
      manager.endRoom();
      // getRoomInfo still works because room exists but phase is finished
      // Actually after endRoom, the room still exists
      const info = manager.getRoomInfo();
      expect(info!.phase).toBe('finished');
    });

    it('endRoom() with no room does not throw', () => {
      // No room created
      expect(() => manager.endRoom()).not.toThrow();
    });
  });

  // ─── 9. State Sanitization ─────────────────────────

  describe('State Sanitization', () => {
    let sanitizeSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      sanitizeSpy = vi.spyOn(sanitizeModule, 'sanitizeStateForPlayer');
    });

    afterEach(() => {
      sanitizeSpy.mockRestore();
    });

    it('sanitizeStateForPlayer called with seat 0 for host callback', () => {
      manager.createRoom(SEATS_3P);
      simulateJoinerConnect('Alice');
      sanitizeSpy.mockClear();

      manager.startGame();

      // Find the call for seat 0 (host)
      const hostCall = sanitizeSpy.mock.calls.find((c: unknown[]) => c[1] === 0);
      expect(hostCall).toBeDefined();
    });

    it('called once per peer with their respective seat index', () => {
      manager.createRoom(SEATS_4P);
      simulateJoinerConnect('Alice');
      simulateJoinerConnect('Bob');
      sanitizeSpy.mockClear();

      manager.startGame();

      // Should be called for host (0), peer1 (1), peer2 (2) = 3 times
      const seatIndices = sanitizeSpy.mock.calls.map((c: unknown[]) => c[1]);
      expect(seatIndices).toContain(0);
      expect(seatIndices).toContain(1);
      expect(seatIndices).toContain(2);
      expect(sanitizeSpy).toHaveBeenCalledTimes(3);
    });

    it("joiner's STATE_UPDATE has devCardDeck filled with hidden values", () => {
      manager.createRoom(SEATS_3P);
      const conn = simulateJoinerConnect('Alice');
      conn.sentMessages.length = 0;

      manager.startGame();

      const stateMsg = conn.sentMessages.find(
        (m) => (m as ServerMessage).type === 'STATE_UPDATE',
      ) as ServerMessage & { type: 'STATE_UPDATE' };
      expect(stateMsg).toBeDefined();
      expect(stateMsg.state.devCardDeck.length).toBeGreaterThan(0);
      expect(stateMsg.state.devCardDeck.every((c: unknown) => c === 'hidden')).toBe(true);
    });
  });

  // ─── 10. Game Over ─────────────────────────────────

  describe('Game Over', () => {
    it('game over triggers onRoomEnded(game_won) and ROOM_ENDED to peers', () => {
      manager.createRoom(SEATS_3P);
      const conn = simulateJoinerConnect('Alice');
      manager.startGame();
      callbacks.onRoomEnded.mockClear();
      conn.sentMessages.length = 0;

      // Spy on gameReducer to return GAME_OVER state
      const spy = vi.spyOn(reducerModule, 'gameReducer');
      spy.mockImplementationOnce((state) => ({ ...state, phase: 'GAME_OVER' as const }));

      // Trigger an action that goes through applyAction
      manager.handleHostAction({ type: 'ROLL_DICE', player: 0 });

      expect(callbacks.onRoomEnded).toHaveBeenCalledWith('game_won');

      const endMsg = conn.sentMessages.find(
        (m) => (m as ServerMessage).type === 'ROOM_ENDED',
      ) as ServerMessage & { type: 'ROOM_ENDED' };
      expect(endMsg).toBeDefined();
      expect(endMsg.reason).toBe('game_won');

      expect(manager.getRoomInfo()!.phase).toBe('finished');

      spy.mockRestore();
    });
  });

  // ─── 11. Destroy ───────────────────────────────────

  describe('Destroy', () => {
    it('destroy() calls peer.destroy() and getRoomInfo() returns null', () => {
      manager.createRoom(SEATS_3P);
      expect(manager.getRoomInfo()).not.toBeNull();

      manager.destroy();

      expect(mockPeerInstance.destroyed).toBe(true);
      expect(manager.getRoomInfo()).toBeNull();
    });
  });
});
