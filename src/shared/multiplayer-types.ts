import type { GameState, PlayerId } from '../engine/types';
import type { GameAction } from '../engine/actions';
import type { AIDifficulty, StrategyType } from '../ai/types';

// ─── Seat Configuration ──────────────────────────────

export interface SeatConfig {
  type: 'human-local' | 'human-remote' | 'ai';
  name?: string;
  difficulty?: AIDifficulty;
  strategyType?: StrategyType;
}

// ─── Room Info ───────────────────────────────────────

export type RoomPhase = 'waiting' | 'playing' | 'finished';

export interface RoomSeatInfo {
  config: SeatConfig;
  playerName: string | null;
  connected: boolean;
}

export interface RoomInfo {
  roomId: string;
  seats: RoomSeatInfo[];
  phase: RoomPhase;
}

// ─── Client → Server Messages ────────────────────────

export type ClientMessage =
  | { type: 'CREATE_ROOM'; seats: SeatConfig[] }
  | { type: 'JOIN_ROOM'; roomId: string; playerName: string }
  | { type: 'RECONNECT'; roomId: string; secret: string }
  | { type: 'LEAVE_ROOM' }
  | { type: 'START_GAME' }
  | { type: 'GAME_ACTION'; action: GameAction }
  | { type: 'END_ROOM' };

// ─── Server → Client Messages ────────────────────────

export type ServerMessage =
  | { type: 'ROOM_CREATED'; roomId: string; seatIndex: number; secret: string }
  | { type: 'ROOM_JOINED'; seatIndex: number; secret: string }
  | { type: 'ROOM_INFO'; room: RoomInfo }
  | { type: 'PLAYER_JOINED'; seatIndex: number; playerName: string }
  | { type: 'PLAYER_LEFT'; seatIndex: number }
  | { type: 'PLAYER_RECONNECTED'; seatIndex: number }
  | { type: 'STATE_UPDATE'; state: GameState }
  | { type: 'ERROR'; message: string }
  | { type: 'ROOM_ENDED'; reason: 'host_ended' | 'game_won' };

// ─── Helper to identify the acting player ────────────

export function getActingPlayerFromState(state: GameState): PlayerId {
  if (state.phase === 'DISCARD' && state.playersNeedingDiscard.length > 0) {
    return state.playersNeedingDiscard[0];
  }
  return state.currentPlayer;
}
