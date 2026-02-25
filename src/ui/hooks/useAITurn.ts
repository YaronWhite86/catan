/**
 * Hook that watches game state and auto-dispatches AI actions with a delay.
 * Multi-step turns (ROLL -> ROBBER -> STEAL -> BUILD -> END) are handled naturally:
 * each dispatch updates state and re-triggers the effect.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import type { GameState, PlayerId } from '@engine/types';
import type { GameAction } from '@engine/actions';
import type { PlayerConfig } from '@ai/types';
import { getActingPlayer } from '@ai/action-enumerator';
import { chooseAIAction } from '@ai/controller/ai-controller';
import { hasResources, totalResources } from '@engine/utils/resource-utils';

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

  // AI auto-responds to pending domestic trade offers
  useEffect(() => {
    if (!state.pendingTrade) return;

    const trade = state.pendingTrade;
    const proposer = trade.from;

    // Find AI players who are not the proposer
    const aiResponders: PlayerId[] = [];
    const humanResponders: PlayerId[] = [];
    for (let i = 0; i < state.players.length; i++) {
      if (i === proposer) continue;
      if (i < playerConfigs.length && playerConfigs[i]?.isAI) {
        aiResponders.push(i as PlayerId);
      } else {
        humanResponders.push(i as PlayerId);
      }
    }

    if (aiResponders.length === 0) return;

    // Evaluate each AI player: can they and should they accept?
    const requestTotal = totalResources(trade.requesting);
    const offerTotal = totalResources(trade.offering);

    let acceptor: PlayerId | null = null;
    for (const aiId of aiResponders) {
      const aiHand = state.players[aiId].resources;
      // Resource check: does the AI have the requested resources?
      if (!hasResources(aiHand, trade.requesting)) continue;
      // Fairness check: reject if requesting more than offering + 1
      if (requestTotal > offerTotal + 1) continue;
      acceptor = aiId;
      break;
    }

    const timer = setTimeout(() => {
      if (acceptor !== null) {
        dispatch({ type: 'ACCEPT_DOMESTIC_TRADE', player: acceptor });
      } else if (humanResponders.length === 0) {
        // No AI wants to accept and no humans to ask — auto-reject
        dispatch({ type: 'REJECT_DOMESTIC_TRADE', player: proposer });
      }
      // Otherwise leave pending for human responders
    }, getDelay());

    return () => clearTimeout(timer);
  }, [state.pendingTrade, state.players, playerConfigs, dispatch, getDelay]);

  return { isAIThinking };
}
