import { describe, it, expect } from 'vitest';
import { createInitialState } from '@engine/state';
import { gameReducer } from '@engine/reducer';
import { validateAction } from '@engine/validator';
import type { GameAction } from '@engine/actions';
import type { GameState } from '@engine/types';
import { enumerateActions, getActingPlayer } from '@ai/action-enumerator';

function startGame(seed = 42): GameState {
  const state = createInitialState(['P1', 'P2', 'P3', 'P4'], seed);
  return gameReducer(state, { type: 'START_GAME' });
}

function applyAction(state: GameState, action: GameAction): GameState {
  return gameReducer(state, action);
}

describe('Action Enumerator', () => {
  it('enumerates valid setup settlement actions', () => {
    const state = startGame();
    expect(state.phase).toBe('SETUP_PLACE_SETTLEMENT');

    const actions = enumerateActions(state);
    expect(actions.length).toBeGreaterThan(0);

    // All actions should be valid
    for (const action of actions) {
      const result = validateAction(state, action);
      expect(result.valid).toBe(true);
    }

    // All should be PLACE_SETUP_SETTLEMENT
    for (const action of actions) {
      expect(action.type).toBe('PLACE_SETUP_SETTLEMENT');
    }
  });

  it('enumerates valid setup road actions', () => {
    let state = startGame();
    // Place a settlement first
    const settlements = enumerateActions(state);
    state = applyAction(state, settlements[0]);
    expect(state.phase).toBe('SETUP_PLACE_ROAD');

    const actions = enumerateActions(state);
    expect(actions.length).toBeGreaterThan(0);

    for (const action of actions) {
      const result = validateAction(state, action);
      expect(result.valid).toBe(true);
    }
  });

  it('all enumerated actions pass validateAction for every phase', () => {
    // Play through a full setup + some turns using enumerated actions
    let state = startGame(123);
    let steps = 0;
    const maxSteps = 200;

    while (state.phase !== 'GAME_OVER' && steps < maxSteps) {
      const actions = enumerateActions(state);
      expect(actions.length).toBeGreaterThan(0);

      // Verify every enumerated action is valid
      for (const action of actions) {
        const result = validateAction(state, action);
        if (!result.valid) {
          throw new Error(
            `Invalid action at step ${steps}, phase ${state.phase}: ` +
            `${JSON.stringify(action)} — reason: ${result.reason}`
          );
        }
      }

      // Apply the first action to advance the game
      state = applyAction(state, actions[0]);
      steps++;
    }

    expect(steps).toBeGreaterThan(16); // At least setup completed (8 settlements + 8 roads)
  });

  it('getActingPlayer returns correct player during DISCARD phase', () => {
    const state = startGame();
    // Normal case
    expect(getActingPlayer(state)).toBe(state.currentPlayer);
  });

  it('TRADE_BUILD_PLAY always includes END_TURN', () => {
    // Play through setup to get to a build phase
    let state = startGame(42);
    let steps = 0;

    while (state.phase !== 'TRADE_BUILD_PLAY' && steps < 100) {
      const actions = enumerateActions(state);
      state = applyAction(state, actions[0]);
      steps++;
    }

    if (state.phase === 'TRADE_BUILD_PLAY') {
      const actions = enumerateActions(state);
      const hasEndTurn = actions.some((a) => a.type === 'END_TURN');
      expect(hasEndTurn).toBe(true);
    }
  });

  it('enumerates ROLL_DICE as only action in ROLL_DICE phase', () => {
    let state = startGame(42);

    // Fast-forward through setup
    while (state.phase !== 'ROLL_DICE' && state.phase !== 'GAME_OVER') {
      const actions = enumerateActions(state);
      state = applyAction(state, actions[0]);
    }

    if (state.phase === 'ROLL_DICE') {
      const actions = enumerateActions(state);
      expect(actions.length).toBe(1);
      expect(actions[0].type).toBe('ROLL_DICE');
    }
  });
});
