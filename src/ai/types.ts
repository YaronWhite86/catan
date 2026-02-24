import type { GameState, PlayerId } from '@engine/types';
import type { GameAction } from '@engine/actions';

export type AIDifficulty = 'easy' | 'medium' | 'hard';
export type StrategyType = 'heuristic' | 'neural';

export interface PlayerConfig {
  isAI: boolean;
  difficulty: AIDifficulty;
  strategyType: StrategyType;
}

export interface ScoredAction {
  action: GameAction;
  score: number;
}

export interface AIStrategy {
  chooseAction(state: GameState, player: PlayerId): GameAction;
}
