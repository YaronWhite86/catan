/**
 * AI Controller: factory that creates strategies and manages AI turns.
 */
import type { GameState, PlayerId } from '@engine/types';
import type { GameAction } from '@engine/actions';
import type { AIStrategy, AIDifficulty, StrategyType } from '../types';
import { HeuristicStrategy } from '../strategies/heuristic-strategy';
import { NeuralStrategy } from '../strategies/neural-strategy';
import { loadModelFromURL } from '../neural/weights-io';
import type { MLP } from '../neural/model';

const strategyCache = new Map<string, AIStrategy>();
let neuralModel: MLP | null = null;
let neuralModelLoading = false;

/**
 * Preload the neural model weights. Call early to avoid delay on first use.
 */
export async function preloadNeuralModel(url: string = `${import.meta.env.BASE_URL}ai-models/default-model.json`): Promise<void> {
  if (neuralModel || neuralModelLoading) return;
  neuralModelLoading = true;
  try {
    neuralModel = await loadModelFromURL(url);
  } catch (e) {
    console.warn('Failed to load neural model, will fall back to heuristic:', e);
    neuralModel = null;
  } finally {
    neuralModelLoading = false;
  }
}

/**
 * Get or create an AI strategy instance.
 */
export function getStrategy(
  strategyType: StrategyType,
  difficulty: AIDifficulty,
): AIStrategy {
  const key = `${strategyType}-${difficulty}`;
  let strategy = strategyCache.get(key);
  if (!strategy) {
    switch (strategyType) {
      case 'heuristic':
        strategy = new HeuristicStrategy(difficulty);
        break;
      case 'neural':
        if (neuralModel) {
          strategy = new NeuralStrategy(neuralModel);
        } else {
          // Fall back to hard heuristic if neural model not loaded
          console.warn('Neural model not loaded, falling back to hard heuristic');
          strategy = new HeuristicStrategy('hard');
        }
        break;
    }
    strategyCache.set(key, strategy);
  }
  return strategy;
}

/**
 * Choose an action for an AI player.
 */
export function chooseAIAction(
  state: GameState,
  player: PlayerId,
  strategyType: StrategyType,
  difficulty: AIDifficulty,
): GameAction {
  const strategy = getStrategy(strategyType, difficulty);
  return strategy.chooseAction(state, player);
}

/**
 * Clear the strategy cache (useful when model is loaded/changed).
 */
export function clearStrategyCache(): void {
  strategyCache.clear();
}
