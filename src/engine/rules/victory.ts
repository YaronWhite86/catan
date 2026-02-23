import type { GameState, PlayerId } from '../types';
import {
  VP_TO_WIN,
  SETTLEMENT_VP,
  CITY_VP,
  LONGEST_ROAD_VP,
  LARGEST_ARMY_VP,
  VP_CARD_VP,
} from '../constants';

/** Calculate victory points for a player */
export function calculateVP(state: GameState, player: PlayerId): number {
  let vp = 0;

  // Buildings
  for (let vid = 0; vid < state.topology.vertexCount; vid++) {
    const building = state.vertexBuildings[vid];
    if (building === null || building.owner !== player) continue;
    vp += building.type === 'city' ? CITY_VP : SETTLEMENT_VP;
  }

  // Longest road
  if (state.longestRoadPlayer === player) {
    vp += LONGEST_ROAD_VP;
  }

  // Largest army
  if (state.largestArmyPlayer === player) {
    vp += LARGEST_ARMY_VP;
  }

  // VP cards (both playable and new)
  const vpCards = [
    ...state.players[player].devCards,
    ...state.players[player].newDevCards,
  ].filter((c) => c === 'victory_point').length;
  vp += vpCards * VP_CARD_VP;

  return vp;
}

/** Check if a player has won */
export function checkVictory(state: GameState, player: PlayerId): boolean {
  return calculateVP(state, player) >= VP_TO_WIN;
}

/** Check all players for victory (used at end of turn) */
export function checkGameOver(state: GameState): GameState {
  if (checkVictory(state, state.currentPlayer)) {
    return {
      ...state,
      phase: 'GAME_OVER',
      log: [...state.log, `${state.players[state.currentPlayer].name} wins with ${calculateVP(state, state.currentPlayer)} victory points!`],
    };
  }
  return state;
}
