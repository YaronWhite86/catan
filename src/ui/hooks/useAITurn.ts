/**
 * Hook that watches game state and auto-dispatches AI actions with a delay.
 * Multi-step turns (ROLL -> ROBBER -> STEAL -> BUILD -> END) are handled naturally:
 * each dispatch updates state and re-triggers the effect.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import type { GameState } from '@engine/types';
import type { GameAction } from '@engine/actions';
import type { PlayerConfig } from '@ai/types';
import { getActingPlayer } from '@ai/action-enumerator';
import { chooseAIAction } from '@ai/controller/ai-controller';

export type AISpeed = 'slow' | 'normal' | 'fast';

const SPEED_DELAYS: Record<AISpeed, [number, number]> = {
  slow: [600, 1200],
  normal: [300, 800],
  fast: [50, 150],
};

export function useAITurn(
  state: GameState,
  playerConfigs: PlayerConfig[],
  dispatch: (action: GameAction) => void,
  speed: AISpeed = 'normal',
): { isAIThinking: boolean } {
  const [isAIThinking, setIsAIThinking] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether dispatch is in-flight to avoid double-dispatch
  const dispatchingRef = useRef(false);

  const getDelay = useCallback(() => {
    const [min, max] = SPEED_DELAYS[speed];
    return min + Math.random() * (max - min);
  }, [speed]);

  useEffect(() => {
    // Don't act during terminal or pre-game phases
    if (state.phase === 'GAME_OVER' || state.phase === 'PRE_GAME') {
      setIsAIThinking(false);
      return;
    }

    const actingPlayer = getActingPlayer(state);

    // Check if this player is AI
    if (actingPlayer >= playerConfigs.length || !playerConfigs[actingPlayer]?.isAI) {
      setIsAIThinking(false);
      return;
    }

    // Avoid double-dispatch
    if (dispatchingRef.current) return;

    const config = playerConfigs[actingPlayer];
    setIsAIThinking(true);

    timerRef.current = setTimeout(() => {
      try {
        dispatchingRef.current = true;
        const action = chooseAIAction(
          state,
          actingPlayer,
          config.strategyType,
          config.difficulty,
        );
        dispatch(action);
      } catch (e) {
        console.error(`AI error for player ${actingPlayer}:`, e);
      } finally {
        dispatchingRef.current = false;
      }
    }, getDelay());

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [
    state.phase,
    state.currentPlayer,
    state.playersNeedingDiscard,
    state.roadBuildingRoadsLeft,
    // Also trigger on turn number changes to catch state updates
    state.turnNumber,
    playerConfigs,
    dispatch,
    getDelay,
    state,
  ]);

  return { isAIThinking };
}
