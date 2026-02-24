import type { GameState, DevCardType } from '../src/engine/types.js';

/**
 * Sanitize game state for a specific player.
 * Hides dev cards of other players (replaces with 'hidden').
 */
export function sanitizeStateForPlayer(state: GameState, seatIndex: number): GameState {
  return {
    ...state,
    players: state.players.map((p, i) => {
      if (i === seatIndex) return p; // own cards visible
      return {
        ...p,
        devCards: p.devCards.map(() => 'hidden' as unknown as DevCardType),
        newDevCards: p.newDevCards.map(() => 'hidden' as unknown as DevCardType),
      };
    }),
    // Hide the dev card deck contents (just preserve length)
    devCardDeck: state.devCardDeck.map(() => 'hidden' as unknown as DevCardType),
  };
}
