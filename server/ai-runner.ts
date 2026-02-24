import type { SeatConfig } from '../src/shared/multiplayer-types.js';
import type { GameState } from '../src/engine/types.js';
import { getActingPlayerFromState } from '../src/shared/multiplayer-types.js';
import { chooseAIAction } from '../src/ai/controller/ai-controller.js';

/**
 * Check if the current acting player is AI and schedule an action if so.
 * Returns a cleanup function to cancel the pending timer.
 */
export function maybeRunAI(
  state: GameState,
  seats: SeatConfig[],
  onAction: (playerIndex: number, action: ReturnType<typeof chooseAIAction>) => void,
): (() => void) | null {
  if (state.phase === 'GAME_OVER' || state.phase === 'PRE_GAME') return null;

  const actingPlayer = getActingPlayerFromState(state);
  const seatConfig = seats[actingPlayer];
  if (!seatConfig || seatConfig.type !== 'ai') return null;

  const delay = 300 + Math.random() * 500;
  const timer = setTimeout(() => {
    const action = chooseAIAction(
      state,
      actingPlayer,
      seatConfig.strategyType ?? 'heuristic',
      seatConfig.difficulty ?? 'medium',
    );
    onAction(actingPlayer, action);
  }, delay);

  return () => clearTimeout(timer);
}
