import type { GameState, PlayerId } from './types';
import type { GameAction } from './actions';
import { validateAction } from './validator';
import { getSetupOrder, placeSetupSettlement, placeSetupRoad } from './rules/setup';
import { applyDiceRoll } from './rules/dice';
import { applyDiscard, applyMoveRobber, applySteal } from './rules/robber';
import {
  applyBuildRoad,
  applyBuildSettlement,
  applyBuildCity,
  getValidRoadEdgesNoResourceCheck,
} from './rules/building';
import {
  applyMaritimeTrade,
  applyProposeTrade,
  applyAcceptTrade,
  applyRejectTrade,
} from './rules/trading';
import {
  applyBuyDevCard,
  applyPlayKnight,
  applyPlayRoadBuilding,
  applyPlayYearOfPlenty,
  applyPickYearOfPlentyResources,
  applyPlayMonopoly,
  applyPickMonopolyResource,
  promoteNewDevCards,
} from './rules/dev-cards';
import { updateLongestRoad } from './rules/longest-road';
import { updateLargestArmy } from './rules/largest-army';
import { checkGameOver } from './rules/victory';

export class GameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GameError';
  }
}

/**
 * Main game reducer. Validates the action, applies it, and handles auto-transitions.
 */
export function gameReducer(state: GameState, action: GameAction): GameState {
  const validation = validateAction(state, action);
  if (!validation.valid) {
    throw new GameError(validation.reason ?? 'Invalid action');
  }

  let newState = applyAction(state, action);
  newState = resolveAutoTransitions(newState);
  return newState;
}

function applyAction(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_GAME': {
      const setupOrder = getSetupOrder(state.playerCount);
      return {
        ...state,
        phase: 'SETUP_PLACE_SETTLEMENT',
        currentPlayer: setupOrder[0],
        setupIndex: 0,
        setupRound: 0,
        log: [...state.log, 'Game started! Place your initial settlements.'],
      };
    }

    case 'PLACE_SETUP_SETTLEMENT':
      return placeSetupSettlement(state, action.player, action.vertex);

    case 'PLACE_SETUP_ROAD':
      return placeSetupRoad(state, action.player, action.edge);

    case 'ROLL_DICE':
      return applyDiceRoll(state, action.player, action.dice);

    case 'DISCARD_RESOURCES':
      return applyDiscard(state, action.player, action.resources);

    case 'MOVE_ROBBER':
      return applyMoveRobber(state, action.player, action.hex);

    case 'STEAL_RESOURCE':
      return applySteal(state, action.player, action.victim);

    case 'BUILD_ROAD': {
      let newState = applyBuildRoad(state, action.player, action.edge);
      newState = updateLongestRoad(newState);
      return newState;
    }

    case 'BUILD_SETTLEMENT': {
      let newState = applyBuildSettlement(state, action.player, action.vertex);
      // Building a settlement may break someone's longest road
      newState = updateLongestRoad(newState);
      return newState;
    }

    case 'BUILD_CITY':
      return applyBuildCity(state, action.player, action.vertex);

    case 'BUY_DEV_CARD':
      return applyBuyDevCard(state, action.player);

    case 'PLAY_KNIGHT': {
      let newState = applyPlayKnight(state, action.player);
      newState = updateLargestArmy(newState);
      return newState;
    }

    case 'PLAY_ROAD_BUILDING':
      return applyPlayRoadBuilding(state, action.player);

    case 'PLACE_ROAD_BUILDING_ROAD': {
      let newState = applyBuildRoad(state, action.player, action.edge, true);
      newState = {
        ...newState,
        roadBuildingRoadsLeft: state.roadBuildingRoadsLeft - 1,
      };

      if (newState.roadBuildingRoadsLeft <= 0) {
        newState = { ...newState, phase: 'TRADE_BUILD_PLAY' };
      } else {
        // Check if there are any valid edges left
        const validEdges = getValidRoadEdgesNoResourceCheck(newState, action.player);
        if (validEdges.length === 0) {
          newState = { ...newState, phase: 'TRADE_BUILD_PLAY', roadBuildingRoadsLeft: 0 };
        }
      }

      newState = updateLongestRoad(newState);
      return newState;
    }

    case 'PLAY_YEAR_OF_PLENTY':
      return applyPlayYearOfPlenty(state, action.player);

    case 'PICK_YEAR_OF_PLENTY_RESOURCES':
      return applyPickYearOfPlentyResources(
        state,
        action.player,
        action.resource1,
        action.resource2,
      );

    case 'PLAY_MONOPOLY':
      return applyPlayMonopoly(state, action.player);

    case 'PICK_MONOPOLY_RESOURCE':
      return applyPickMonopolyResource(state, action.player, action.resource);

    case 'MARITIME_TRADE':
      return applyMaritimeTrade(state, action.player, action.give, action.receive);

    case 'PROPOSE_DOMESTIC_TRADE':
      return applyProposeTrade(state, action.player, action.offering, action.requesting);

    case 'ACCEPT_DOMESTIC_TRADE':
      return applyAcceptTrade(state, action.player);

    case 'REJECT_DOMESTIC_TRADE':
      return applyRejectTrade(state, action.player);

    case 'END_TURN': {
      // Promote new dev cards
      let newState = promoteNewDevCards(state, action.player);

      // Check victory
      newState = checkGameOver(newState);
      if (newState.phase === 'GAME_OVER') return newState;

      // Advance to next player
      const nextPlayer = ((action.player + 1) % state.playerCount) as PlayerId;
      return {
        ...newState,
        phase: 'ROLL_DICE',
        currentPlayer: nextPlayer,
        turnNumber: state.turnNumber + 1,
        lastRoll: null,
        pendingTrade: null,
        log: [...newState.log, `${state.players[nextPlayer].name}'s turn`],
      };
    }

    default:
      return state;
  }
}

/** Handle automatic state transitions */
function resolveAutoTransitions(state: GameState): GameState {
  // No auto-transitions needed currently — all transitions are explicit in action handlers
  return state;
}
