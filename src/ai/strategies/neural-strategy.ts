/**
 * Neural network-based AI strategy.
 * Scores actions by simulating each one, extracting features from the
 * resulting state, and evaluating with the MLP. Picks the highest-scored action.
 */
import type { GameState, PlayerId } from '@engine/types';
import type { GameAction } from '@engine/actions';
import type { AIStrategy } from '../types';
import { enumerateActions } from '../action-enumerator';
import { extractFeatures } from '../features/feature-extractor';
import { gameReducer } from '@engine/reducer';
import type { MLP } from '../neural/model';
import { scoreSetupVertex, scoreRobberHex, scoreStealTarget } from './heuristic-utils';

export class NeuralStrategy implements AIStrategy {
  private model: MLP;

  constructor(model: MLP) {
    this.model = model;
  }

  chooseAction(state: GameState, player: PlayerId): GameAction {
    const actions = enumerateActions(state);
    if (actions.length === 0) {
      throw new Error(`No legal actions for player ${player} in phase ${state.phase}`);
    }
    if (actions.length === 1) return actions[0];

    // For setup and robber, use heuristic since neural eval is for full states
    if (state.phase === 'SETUP_PLACE_SETTLEMENT') {
      return this.chooseSetupSettlement(state, player, actions);
    }
    if (state.phase === 'MOVE_ROBBER') {
      return this.chooseRobber(state, player, actions);
    }
    if (state.phase === 'STEAL') {
      return this.chooseSteal(state, player, actions);
    }

    // For other phases, use neural eval
    let bestAction = actions[0];
    let bestScore = -Infinity;

    for (const action of actions) {
      try {
        const newState = gameReducer(state, action);
        const features = extractFeatures(newState, player);
        const score = this.model.forward(features);

        if (score > bestScore) {
          bestScore = score;
          bestAction = action;
        }
      } catch {
        // Skip actions that throw
      }
    }

    return bestAction;
  }

  private chooseSetupSettlement(state: GameState, player: PlayerId, actions: GameAction[]): GameAction {
    let best = actions[0];
    let bestScore = -Infinity;
    for (const action of actions) {
      if (action.type !== 'PLACE_SETUP_SETTLEMENT') continue;
      const score = scoreSetupVertex(state, player, action.vertex, state.setupRound === 1);
      if (score > bestScore) {
        bestScore = score;
        best = action;
      }
    }
    return best;
  }

  private chooseRobber(state: GameState, player: PlayerId, actions: GameAction[]): GameAction {
    let best = actions[0];
    let bestScore = -Infinity;
    for (const action of actions) {
      if (action.type !== 'MOVE_ROBBER') continue;
      const score = scoreRobberHex(state, player, action.hex);
      if (score > bestScore) {
        bestScore = score;
        best = action;
      }
    }
    return best;
  }

  private chooseSteal(state: GameState, player: PlayerId, actions: GameAction[]): GameAction {
    let best = actions[0];
    let bestScore = -Infinity;
    for (const action of actions) {
      if (action.type !== 'STEAL_RESOURCE') continue;
      const score = action.victim !== null ? scoreStealTarget(state, player, action.victim) : 0;
      if (score > bestScore) {
        bestScore = score;
        best = action;
      }
    }
    return best;
  }
}
