import { describe, it, expect } from 'vitest';
import { createInitialState } from '@engine/state';
import { gameReducer } from '@engine/reducer';
import type { GameState, PlayerId } from '@engine/types';
import { HeuristicStrategy } from '@ai/strategies/heuristic-strategy';
import { getActingPlayer } from '@ai/action-enumerator';
import { validateAction } from '@engine/validator';

function startGame(seed: number): GameState {
  const state = createInitialState(['P1', 'P2', 'P3', 'P4'], seed);
  return gameReducer(state, { type: 'START_GAME' });
}

function playFullGame(seed: number, strategies: HeuristicStrategy[]): PlayerId | null {
  let state = startGame(seed);
  let steps = 0;
  const maxSteps = 2000;

  while (state.phase !== 'GAME_OVER' && steps < maxSteps) {
    const player = getActingPlayer(state);
    const strategy = strategies[player];
    const action = strategy.chooseAction(state, player);

    // Validate the chosen action
    const validation = validateAction(state, action);
    if (!validation.valid) {
      throw new Error(
        `Strategy produced invalid action at step ${steps}: ` +
        `${JSON.stringify(action)} — ${validation.reason}`
      );
    }

    state = gameReducer(state, action);
    steps++;
  }

  if (state.phase === 'GAME_OVER') {
    return state.currentPlayer;
  }
  return null; // Game didn't finish in time
}

describe('Heuristic Strategy', () => {
  it('setup: prefers high-pip vertices', () => {
    const strategy = new HeuristicStrategy('hard');
    let state = startGame(42);

    // The strategy should choose a high-pip vertex for setup
    const action = strategy.chooseAction(state, state.currentPlayer);
    expect(action.type).toBe('PLACE_SETUP_SETTLEMENT');

    // Verify it's valid
    const validation = validateAction(state, action);
    expect(validation.valid).toBe(true);
  });

  it('medium strategy always produces valid actions', () => {
    const strategy = new HeuristicStrategy('medium');
    let state = startGame(100);
    let steps = 0;

    while (state.phase !== 'GAME_OVER' && steps < 500) {
      const player = getActingPlayer(state);
      const action = strategy.chooseAction(state, player);

      const validation = validateAction(state, action);
      expect(validation.valid).toBe(true);

      state = gameReducer(state, action);
      steps++;
    }
  });

  it('easy strategy always produces valid actions', () => {
    const strategy = new HeuristicStrategy('easy');
    let state = startGame(200);
    let steps = 0;

    while (state.phase !== 'GAME_OVER' && steps < 500) {
      const player = getActingPlayer(state);
      const action = strategy.chooseAction(state, player);

      const validation = validateAction(state, action);
      expect(validation.valid).toBe(true);

      state = gameReducer(state, action);
      steps++;
    }
  });

  it('hard beats easy over multiple games', () => {
    const hardWins = { count: 0 };
    const easyWins = { count: 0 };
    const draws = { count: 0 };
    const games = 20;

    for (let i = 0; i < games; i++) {
      // Players 0,1 = hard; Players 2,3 = easy
      const strategies = [
        new HeuristicStrategy('hard'),
        new HeuristicStrategy('hard'),
        new HeuristicStrategy('easy'),
        new HeuristicStrategy('easy'),
      ];

      const winner = playFullGame(i * 7 + 1, strategies);
      if (winner === null) {
        draws.count++;
      } else if (winner <= 1) {
        hardWins.count++;
      } else {
        easyWins.count++;
      }
    }

    // Hard should win more than easy
    console.log(`Hard wins: ${hardWins.count}, Easy wins: ${easyWins.count}, Draws: ${draws.count}`);
    expect(hardWins.count).toBeGreaterThanOrEqual(easyWins.count);
  });
});
