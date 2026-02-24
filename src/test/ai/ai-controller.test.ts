import { describe, it, expect } from 'vitest';
import { createInitialState } from '@engine/state';
import { gameReducer } from '@engine/reducer';
import { validateAction } from '@engine/validator';
import type { GameState, PlayerId } from '@engine/types';
import { chooseAIAction } from '@ai/controller/ai-controller';
import { getActingPlayer } from '@ai/action-enumerator';
import { calculateVP } from '@engine/rules/victory';
import type { AIDifficulty } from '@ai/types';

function startGame(seed: number): GameState {
  const state = createInitialState(['AI1', 'AI2', 'AI3', 'AI4'], seed);
  return gameReducer(state, { type: 'START_GAME' });
}

function runFullAIGame(
  seed: number,
  difficulties: AIDifficulty[] = ['medium', 'medium', 'medium', 'medium'],
): { winner: PlayerId | null; steps: number; finalState: GameState } {
  let state = startGame(seed);
  let steps = 0;
  const maxSteps = 2000;

  while (state.phase !== 'GAME_OVER' && steps < maxSteps) {
    const player = getActingPlayer(state);
    const difficulty = difficulties[player];

    const action = chooseAIAction(state, player, 'heuristic', difficulty);

    // Every action must be valid
    const validation = validateAction(state, action);
    if (!validation.valid) {
      throw new Error(
        `AI produced invalid action at step ${steps}, phase ${state.phase}, player ${player}: ` +
        `${JSON.stringify(action)} — ${validation.reason}`
      );
    }

    state = gameReducer(state, action);
    steps++;
  }

  const winner = state.phase === 'GAME_OVER' ? state.currentPlayer : null;
  return { winner, steps, finalState: state };
}

describe('AI Controller', () => {
  it('runs a full game with 4 medium AI players to completion', () => {
    const { winner, steps, finalState } = runFullAIGame(42);

    // Game should reach completion
    expect(finalState.phase).toBe('GAME_OVER');
    expect(winner).not.toBeNull();
    expect(steps).toBeLessThan(2000);

    // Winner should have >= 10 VP
    if (winner !== null) {
      const vp = calculateVP(finalState, winner);
      expect(vp).toBeGreaterThanOrEqual(10);
    }
  });

  it('runs 50 full games without any errors', () => {
    const results: { winner: PlayerId | null; steps: number }[] = [];

    for (let seed = 1; seed <= 50; seed++) {
      const { winner, steps } = runFullAIGame(seed);
      results.push({ winner, steps });
    }

    const completed = results.filter((r) => r.winner !== null);
    const avgSteps = completed.reduce((sum, r) => sum + r.steps, 0) / completed.length;

    console.log(`Completed: ${completed.length}/50, Avg steps: ${avgSteps.toFixed(0)}`);

    // At least 80% should complete (some might hit step limit with unlucky seeds)
    expect(completed.length).toBeGreaterThanOrEqual(40);
  });

  it('runs games with easy AI players', () => {
    for (let seed = 100; seed < 110; seed++) {
      const { finalState } = runFullAIGame(seed, ['easy', 'easy', 'easy', 'easy']);
      // Just verifying no crashes — easy games may take longer / not finish
      expect(finalState).toBeDefined();
    }
  });

  it('runs games with hard AI players', () => {
    const completed: number[] = [];
    for (let seed = 200; seed < 210; seed++) {
      const { winner, steps } = runFullAIGame(seed, ['hard', 'hard', 'hard', 'hard']);
      if (winner !== null) completed.push(steps);
    }

    console.log(`Hard AI: ${completed.length}/10 completed`);
    expect(completed.length).toBeGreaterThanOrEqual(5);
  });

  it('runs games with mixed difficulty', () => {
    for (let seed = 300; seed < 310; seed++) {
      const { finalState } = runFullAIGame(seed, ['hard', 'medium', 'easy', 'medium']);
      expect(finalState).toBeDefined();
    }
  });
});
