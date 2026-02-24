import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ClientMessage, ServerMessage } from '../src/shared/multiplayer-types.js';
import { RoomManager } from './room-manager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env['PORT'] ?? '3001', 10);
const IS_PROD = process.env['NODE_ENV'] === 'production';

const app = express();
const httpServer = createServer(app);

// In production, serve the built client files
if (IS_PROD) {
  const distPath = path.resolve(__dirname, '..', 'dist');
  app.use('/catan', express.static(distPath));
  // SPA fallback for /catan/ subpath (GitHub Pages style)
  app.get('/catan/*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
  // Also serve at root for cloud deployments (Render, Railway, etc.)
  app.use(express.static(distPath));
  app.get('/', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// WebSocket server
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

const roomManager = new RoomManager();

// Track which room/seat each WebSocket belongs to
interface WSMetadata {
  roomId: string | null;
  seatIndex: number | null;
}
const wsMetadata = new WeakMap<WebSocket, WSMetadata>();

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

wss.on('connection', (ws: WebSocket) => {
  wsMetadata.set(ws, { roomId: null, seatIndex: null });

  ws.on('message', (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(raw)) as ClientMessage;
    } catch {
      send(ws, { type: 'ERROR', message: 'Invalid JSON' });
      return;
    }

    try {
      handleMessage(ws, msg);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      send(ws, { type: 'ERROR', message });
    }
  });

  ws.on('close', () => {
    const meta = wsMetadata.get(ws);
    if (meta?.roomId != null && meta.seatIndex != null) {
      roomManager.handleDisconnect(meta.roomId, meta.seatIndex);
    }
  });
});

function handleMessage(ws: WebSocket, msg: ClientMessage): void {
  switch (msg.type) {
    case 'CREATE_ROOM': {
      const result = roomManager.createRoom(msg.seats, ws);
      wsMetadata.set(ws, { roomId: result.roomId, seatIndex: result.seatIndex });
      send(ws, {
        type: 'ROOM_CREATED',
        roomId: result.roomId,
        seatIndex: result.seatIndex,
        secret: result.secret,
      });
      send(ws, { type: 'ROOM_INFO', room: roomManager.getRoomInfo(result.roomId) });
      break;
    }

    case 'JOIN_ROOM': {
      const result = roomManager.joinRoom(msg.roomId, msg.playerName, ws);
      wsMetadata.set(ws, { roomId: msg.roomId, seatIndex: result.seatIndex });
      send(ws, {
        type: 'ROOM_JOINED',
        seatIndex: result.seatIndex,
        secret: result.secret,
      });
      // Broadcast to all connected clients
      roomManager.broadcastRoomInfo(msg.roomId);
      break;
    }

    case 'RECONNECT': {
      const result = roomManager.reconnect(msg.roomId, msg.secret, ws);
      wsMetadata.set(ws, { roomId: msg.roomId, seatIndex: result.seatIndex });
      // Notify others
      roomManager.broadcastToRoom(msg.roomId, {
        type: 'PLAYER_RECONNECTED',
        seatIndex: result.seatIndex,
      });
      roomManager.broadcastRoomInfo(msg.roomId);
      // If game is in progress, send current state
      roomManager.sendStateToPlayer(msg.roomId, result.seatIndex);
      break;
    }

    case 'LEAVE_ROOM': {
      const meta = wsMetadata.get(ws);
      if (meta?.roomId && meta.seatIndex != null) {
        roomManager.handleDisconnect(meta.roomId, meta.seatIndex);
        wsMetadata.set(ws, { roomId: null, seatIndex: null });
      }
      break;
    }

    case 'START_GAME': {
      const meta = wsMetadata.get(ws);
      if (!meta?.roomId) {
        send(ws, { type: 'ERROR', message: 'Not in a room' });
        return;
      }
      roomManager.startGame(meta.roomId, meta.seatIndex!);
      break;
    }

    case 'GAME_ACTION': {
      const meta = wsMetadata.get(ws);
      if (!meta?.roomId || meta.seatIndex == null) {
        send(ws, { type: 'ERROR', message: 'Not in a room' });
        return;
      }
      roomManager.handleAction(meta.roomId, meta.seatIndex, msg.action);
      break;
    }

    case 'END_ROOM': {
      const meta = wsMetadata.get(ws);
      if (!meta?.roomId) {
        send(ws, { type: 'ERROR', message: 'Not in a room' });
        return;
      }
      roomManager.endRoom(meta.roomId, meta.seatIndex!);
      break;
    }
  }
}

// Cleanup stale rooms every hour
setInterval(() => {
  roomManager.cleanupStaleRooms();
}, 60 * 60 * 1000);

const HOST = process.env['HOST'] ?? '0.0.0.0';

httpServer.listen(PORT, HOST, () => {
  console.log(`Catan server listening on ${HOST}:${PORT}`);
  if (IS_PROD) {
    console.log(`Serving client at http://localhost:${PORT}/`);
  } else {
    console.log('Dev mode: client served by Vite, WS proxied from Vite');
  }
});
