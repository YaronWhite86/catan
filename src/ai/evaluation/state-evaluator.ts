/**
 * Score a GameState from a player's perspective.
 * Used by heuristic AI to evaluate actions by comparing resulting states.
 */
import type { GameState, PlayerId } from '@engine/types';
import { ALL_RESOURCES } from '@engine/types';
import { calculateVP } from '@engine/rules/victory';
import { totalResources } from '@engine/utils/resource-utils';
import { playerTotalProduction, playerResourceProduction } from './board-analysis';

/**
 * Evaluate a state from a player's perspective.
 * Higher score = better position for this player.
 */
export function evaluateState(state: GameState, player: PlayerId): number {
  let score = 0;

  // VP is the most important factor (weight: 100 per VP)
  const vp = calculateVP(state, player);
  score += vp * 100;

  // Resource production (pips) - weight: 3 per pip
  const production = playerTotalProduction(state, player);
  score += production * 3;

  // Resource diversity bonus: having production in all 5 types
  const resProd = playerResourceProduction(state, player);
  const producedTypes = ALL_RESOURCES.filter((r) => resProd[r] > 0).length;
  score += producedTypes * 8;

  // Resources in hand (small bonus, but too many is risky due to robber)
  const handSize = totalResources(state.players[player].resources);
  if (handSize <= 7) {
    score += handSize * 1;
  } else {
    // Penalty for being over 7 (robber risk)
    score += 7 - (handSize - 7) * 2;
  }

  // Dev cards (knights for largest army, VP cards hidden)
  const p = state.players[player];
  score += p.knightsPlayed * 5;
  score += p.devCards.filter((c) => c === 'victory_point').length * 50;
  score += p.newDevCards.filter((c) => c === 'victory_point').length * 50;

  // Remaining pieces (more remaining = more potential)
  score += (p.remainingSettlements > 0 ? 2 : 0);
  score += (p.remainingCities > 0 ? 3 : 0);

  // Roads built (for longest road progress)
  const roadsBuilt = 15 - p.remainingRoads;
  score += roadsBuilt * 1;

  // Longest road / largest army bonuses beyond VP
  if (state.longestRoadPlayer === player) score += 10;
  if (state.largestArmyPlayer === player) score += 10;

  // Comparative advantage: penalize opponents' progress
  for (let i = 0; i < state.playerCount; i++) {
    if (i === player) continue;
    const oppVP = calculateVP(state, i as PlayerId);
    // Small penalty for each opponent VP
    score -= oppVP * 5;
  }

  return score;
}
