/**
 * Heuristic AI strategy with easy/medium/hard difficulty levels.
 *
 * - Easy: weighted random among legal actions
 * - Medium: greedy single-action scoring (pick highest-scored action)
 * - Hard: multi-action turn planning with lookahead
 */
import type { GameState, PlayerId } from '@engine/types';
import type { GameAction } from '@engine/actions';
import type { AIStrategy, AIDifficulty, ScoredAction } from '../types';
import { enumerateActions } from '../action-enumerator';
import { evaluateState } from '../evaluation/state-evaluator';
import { gameReducer } from '@engine/reducer';
import {
  scoreSetupVertex,
  scoreRobberHex,
  scoreStealTarget,
  scorePlentyResources,
  scoreMonopolyResource,
} from './heuristic-utils';

export class HeuristicStrategy implements AIStrategy {
  private difficulty: AIDifficulty;

  constructor(difficulty: AIDifficulty) {
    this.difficulty = difficulty;
  }

  chooseAction(state: GameState, player: PlayerId): GameAction {
    const actions = enumerateActions(state);
    if (actions.length === 0) {
      throw new Error(`No legal actions for player ${player} in phase ${state.phase}`);
    }
    if (actions.length === 1) return actions[0];

    switch (this.difficulty) {
      case 'easy':
        return this.chooseEasy(state, player, actions);
      case 'medium':
        return this.chooseMedium(state, player, actions);
      case 'hard':
        return this.chooseHard(state, player, actions);
    }
  }

  /** Easy: weighted random — slight preference for building over ending turn */
  private chooseEasy(state: GameState, player: PlayerId, actions: GameAction[]): GameAction {
    const scored = actions.map((action) => ({
      action,
      score: this.quickScore(state, player, action) + Math.random() * 50,
    }));
    scored.sort((a, b) => b.score - a.score);
    // Pick from top 3 randomly
    const topN = Math.min(3, scored.length);
    const idx = Math.floor(Math.random() * topN);
    return scored[idx].action;
  }

  /** Medium: greedy — pick the single highest-scored action */
  private chooseMedium(state: GameState, player: PlayerId, actions: GameAction[]): GameAction {
    const scored = this.scoreActions(state, player, actions);
    scored.sort((a, b) => b.score - a.score);
    return scored[0].action;
  }

  /** Hard: multi-action lookahead for TRADE_BUILD_PLAY phase */
  private chooseHard(state: GameState, player: PlayerId, actions: GameAction[]): GameAction {
    if (state.phase !== 'TRADE_BUILD_PLAY') {
      // For non-build phases, use greedy scoring
      return this.chooseMedium(state, player, actions);
    }

    // Try sequences of up to 3 actions to find the best end-of-turn state
    const bestSequence = this.findBestSequence(state, player, 3);
    if (bestSequence.length > 0) {
      return bestSequence[0];
    }

    // Fallback to greedy
    return this.chooseMedium(state, player, actions);
  }

  /** Quick heuristic score for an action (no simulation) */
  private quickScore(state: GameState, player: PlayerId, action: GameAction): number {
    switch (action.type) {
      case 'PLACE_SETUP_SETTLEMENT':
        return scoreSetupVertex(state, player, action.vertex, state.setupRound === 1);
      case 'PLACE_SETUP_ROAD':
        return 10; // All setup roads are roughly equal
      case 'BUILD_CITY':
        return 80;
      case 'BUILD_SETTLEMENT':
        return 60;
      case 'BUY_DEV_CARD':
        return 40;
      case 'BUILD_ROAD':
        return 20;
      case 'PLAY_KNIGHT':
        return 45;
      case 'PLAY_ROAD_BUILDING':
        return 35;
      case 'PLAY_YEAR_OF_PLENTY':
        return 35;
      case 'PLAY_MONOPOLY':
        return 35;
      case 'MARITIME_TRADE':
        return 15;
      case 'MOVE_ROBBER':
        return scoreRobberHex(state, player, action.hex);
      case 'STEAL_RESOURCE':
        return action.victim !== null
          ? scoreStealTarget(state, player, action.victim)
          : 0;
      case 'PICK_YEAR_OF_PLENTY_RESOURCES':
        return scorePlentyResources(state, player, action.resource1, action.resource2);
      case 'PICK_MONOPOLY_RESOURCE':
        return scoreMonopolyResource(state, player, action.resource);
      case 'END_TURN':
        return -1;
      default:
        return 0;
    }
  }

  /** Score actions by simulating each one and evaluating the resulting state */
  private scoreActions(
    state: GameState,
    player: PlayerId,
    actions: GameAction[],
  ): ScoredAction[] {
    return actions.map((action) => {
      // For setup, use quick heuristic score
      if (action.type === 'PLACE_SETUP_SETTLEMENT') {
        return { action, score: scoreSetupVertex(state, player, action.vertex, state.setupRound === 1) };
      }

      // For phase-specific choices, use specialized scoring
      if (action.type === 'MOVE_ROBBER') {
        return { action, score: scoreRobberHex(state, player, action.hex) };
      }
      if (action.type === 'STEAL_RESOURCE') {
        return { action, score: action.victim !== null ? scoreStealTarget(state, player, action.victim) : 0 };
      }
      if (action.type === 'PICK_YEAR_OF_PLENTY_RESOURCES') {
        return { action, score: scorePlentyResources(state, player, action.resource1, action.resource2) };
      }
      if (action.type === 'PICK_MONOPOLY_RESOURCE') {
        return { action, score: scoreMonopolyResource(state, player, action.resource) };
      }

      // For build actions, simulate and evaluate
      try {
        const newState = gameReducer(state, action);
        const score = evaluateState(newState, player);
        return { action, score };
      } catch {
        // If action fails validation (shouldn't happen), give low score
        return { action, score: -1000 };
      }
    });
  }

  /**
   * Find the best sequence of actions for the build/trade phase.
   * Uses beam search with limited depth.
   */
  private findBestSequence(
    state: GameState,
    player: PlayerId,
    maxDepth: number,
  ): GameAction[] {
    interface SearchNode {
      state: GameState;
      actions: GameAction[];
      score: number;
    }

    const baseScore = evaluateState(state, player);
    let best: SearchNode = { state, actions: [], score: baseScore };

    // BFS-like beam search
    let frontier: SearchNode[] = [{ state, actions: [], score: baseScore }];

    for (let depth = 0; depth < maxDepth; depth++) {
      const nextFrontier: SearchNode[] = [];

      for (const node of frontier) {
        if (node.state.phase !== 'TRADE_BUILD_PLAY') continue;
        if (node.state.currentPlayer !== player) continue;

        const actions = enumerateActions(node.state);

        for (const action of actions) {
          if (action.type === 'END_TURN') {
            // Evaluate ending here
            const score = evaluateState(node.state, player);
            const candidate = { state: node.state, actions: [...node.actions, action], score };
            if (score > best.score) {
              best = candidate;
            }
            continue;
          }

          try {
            const newState = gameReducer(node.state, action);

            // Only continue if we're still in a build phase
            if (newState.phase === 'TRADE_BUILD_PLAY' || newState.phase === 'GAME_OVER') {
              const score = evaluateState(newState, player);
              nextFrontier.push({
                state: newState,
                actions: [...node.actions, action],
                score,
              });
              if (score > best.score) {
                best = { state: newState, actions: [...node.actions, action], score };
              }
            }
          } catch {
            // Skip invalid actions
          }
        }
      }

      // Keep top-K nodes (beam width)
      nextFrontier.sort((a, b) => b.score - a.score);
      frontier = nextFrontier.slice(0, 10);

      if (frontier.length === 0) break;
    }

    // If best sequence ends without END_TURN, append it
    if (best.actions.length > 0 && best.actions[best.actions.length - 1].type !== 'END_TURN') {
      // Return only the first action
      return [best.actions[0]];
    }

    return best.actions.length > 0 ? [best.actions[0]] : [];
  }
}
