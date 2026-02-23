import type { GameState, PlayerId } from '../types';
import { MIN_LARGEST_ARMY } from '../constants';

/** Update largest army awards */
export function updateLargestArmy(state: GameState): GameState {
  let largestSize = state.largestArmySize;
  let largestPlayer = state.largestArmyPlayer;

  for (let pid = 0; pid < state.playerCount; pid++) {
    const knights = state.players[pid].knightsPlayed;

    if (knights >= MIN_LARGEST_ARMY) {
      if (largestPlayer === null) {
        // First player to reach 3
        largestPlayer = pid as PlayerId;
        largestSize = knights;
      } else if (knights > largestSize) {
        // New leader (must strictly surpass)
        largestPlayer = pid as PlayerId;
        largestSize = knights;
      }
    }
  }

  if (largestPlayer !== state.largestArmyPlayer) {
    return {
      ...state,
      largestArmyPlayer: largestPlayer,
      largestArmySize: largestSize,
      log: largestPlayer !== null
        ? [...state.log, `${state.players[largestPlayer].name} now has Largest Army (${largestSize} knights)`]
        : state.log,
    };
  }

  return { ...state, largestArmySize: largestSize };
}
