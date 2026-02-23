import type { GameState, PlayerId } from './types';
import { ALL_RESOURCES } from './types';
import type { GameAction } from './actions';
import { getValidSetupSettlementVertices, getValidSetupRoadEdges } from './rules/setup';
import { getDiscardCount } from './rules/dice';
import { getValidRobberHexes, getStealTargets } from './rules/robber';
import {
  getValidSettlementVertices,
  getValidCityVertices,
  getValidRoadEdges,
  getValidRoadEdgesNoResourceCheck,
} from './rules/building';
import { isValidMaritimeTrade } from './rules/trading';
import { canBuyDevCard, canPlayDevCard } from './rules/dev-cards';
import { hasResources, totalResources } from './utils/resource-utils';

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

function ok(): ValidationResult {
  return { valid: true };
}

function fail(reason: string): ValidationResult {
  return { valid: false, reason };
}

export function validateAction(
  state: GameState,
  action: GameAction,
): ValidationResult {
  switch (action.type) {
    case 'START_GAME':
      return validateStartGame(state);
    case 'PLACE_SETUP_SETTLEMENT':
      return validatePlaceSetupSettlement(state, action.player, action.vertex);
    case 'PLACE_SETUP_ROAD':
      return validatePlaceSetupRoad(state, action.player, action.edge);
    case 'ROLL_DICE':
      return validateRollDice(state, action.player);
    case 'DISCARD_RESOURCES':
      return validateDiscard(state, action.player, action.resources);
    case 'MOVE_ROBBER':
      return validateMoveRobber(state, action.player, action.hex);
    case 'STEAL_RESOURCE':
      return validateSteal(state, action.player, action.victim);
    case 'BUILD_ROAD':
      return validateBuildRoad(state, action.player, action.edge);
    case 'BUILD_SETTLEMENT':
      return validateBuildSettlement(state, action.player, action.vertex);
    case 'BUILD_CITY':
      return validateBuildCity(state, action.player, action.vertex);
    case 'BUY_DEV_CARD':
      return validateBuyDevCard(state, action.player);
    case 'PLAY_KNIGHT':
      return validatePlayKnight(state, action.player);
    case 'PLAY_ROAD_BUILDING':
      return validatePlayRoadBuilding(state, action.player);
    case 'PLACE_ROAD_BUILDING_ROAD':
      return validatePlaceRoadBuildingRoad(state, action.player, action.edge);
    case 'PLAY_YEAR_OF_PLENTY':
      return validatePlayYearOfPlenty(state, action.player);
    case 'PICK_YEAR_OF_PLENTY_RESOURCES':
      return validatePickYearOfPlentyResources(state, action.player, action.resource1, action.resource2);
    case 'PLAY_MONOPOLY':
      return validatePlayMonopoly(state, action.player);
    case 'PICK_MONOPOLY_RESOURCE':
      return validatePickMonopolyResource(state, action.player);
    case 'MARITIME_TRADE':
      return validateMaritimeTradeAction(state, action.player, action.give, action.receive);
    case 'PROPOSE_DOMESTIC_TRADE':
      return validateProposeDomesticTrade(state, action.player, action.offering, action.requesting);
    case 'ACCEPT_DOMESTIC_TRADE':
      return validateAcceptDomesticTrade(state, action.player);
    case 'REJECT_DOMESTIC_TRADE':
      return validateRejectDomesticTrade(state, action.player);
    case 'END_TURN':
      return validateEndTurn(state, action.player);
    default:
      return fail('Unknown action type');
  }
}

function validateStartGame(state: GameState): ValidationResult {
  if (state.phase !== 'PRE_GAME') return fail('Game already started');
  return ok();
}

function validatePlaceSetupSettlement(
  state: GameState,
  player: PlayerId,
  vertex: number,
): ValidationResult {
  if (state.phase !== 'SETUP_PLACE_SETTLEMENT') return fail('Not in setup settlement phase');
  if (state.currentPlayer !== player) return fail('Not your turn');

  const valid = getValidSetupSettlementVertices(state);
  if (!valid.includes(vertex)) return fail('Invalid settlement location');

  return ok();
}

function validatePlaceSetupRoad(
  state: GameState,
  player: PlayerId,
  edge: number,
): ValidationResult {
  if (state.phase !== 'SETUP_PLACE_ROAD') return fail('Not in setup road phase');
  if (state.currentPlayer !== player) return fail('Not your turn');

  const valid = getValidSetupRoadEdges(state, player);
  if (!valid.includes(edge)) return fail('Invalid road location');

  return ok();
}

function validateRollDice(state: GameState, player: PlayerId): ValidationResult {
  if (state.phase !== 'ROLL_DICE') return fail('Not in roll dice phase');
  if (state.currentPlayer !== player) return fail('Not your turn');
  return ok();
}

function validateDiscard(
  state: GameState,
  player: PlayerId,
  resources: { lumber: number; brick: number; wool: number; grain: number; ore: number },
): ValidationResult {
  if (state.phase !== 'DISCARD') return fail('Not in discard phase');
  if (!state.playersNeedingDiscard.includes(player)) return fail('You do not need to discard');

  const discardAmount = ALL_RESOURCES.reduce((sum, r) => sum + resources[r], 0);
  const required = getDiscardCount(state, player);

  if (discardAmount !== required) return fail(`Must discard exactly ${required} cards`);

  // Check player has the resources
  for (const r of ALL_RESOURCES) {
    if (resources[r] < 0) return fail('Cannot discard negative resources');
    if (resources[r] > state.players[player].resources[r]) return fail(`Not enough ${r}`);
  }

  return ok();
}

function validateMoveRobber(state: GameState, player: PlayerId, hex: number): ValidationResult {
  if (state.phase !== 'MOVE_ROBBER') return fail('Not in move robber phase');
  if (state.currentPlayer !== player) return fail('Not your turn');

  if (!getValidRobberHexes(state).includes(hex)) return fail('Invalid robber location');

  return ok();
}

function validateSteal(
  state: GameState,
  player: PlayerId,
  victim: PlayerId | null,
): ValidationResult {
  if (state.phase !== 'STEAL') return fail('Not in steal phase');
  if (state.currentPlayer !== player) return fail('Not your turn');

  const targets = getStealTargets(state, state.robberHex, player);

  if (victim === null) {
    if (targets.length > 0) return fail('Must choose a victim');
    return ok();
  }

  if (!targets.includes(victim)) return fail('Invalid steal target');

  return ok();
}

function validateBuildRoad(state: GameState, player: PlayerId, edge: number): ValidationResult {
  if (state.phase !== 'TRADE_BUILD_PLAY') return fail('Not in build phase');
  if (state.currentPlayer !== player) return fail('Not your turn');

  const valid = getValidRoadEdges(state, player);
  if (!valid.includes(edge)) return fail('Invalid road location or insufficient resources');

  return ok();
}

function validateBuildSettlement(state: GameState, player: PlayerId, vertex: number): ValidationResult {
  if (state.phase !== 'TRADE_BUILD_PLAY') return fail('Not in build phase');
  if (state.currentPlayer !== player) return fail('Not your turn');

  const valid = getValidSettlementVertices(state, player);
  if (!valid.includes(vertex)) return fail('Invalid settlement location or insufficient resources');

  return ok();
}

function validateBuildCity(state: GameState, player: PlayerId, vertex: number): ValidationResult {
  if (state.phase !== 'TRADE_BUILD_PLAY') return fail('Not in build phase');
  if (state.currentPlayer !== player) return fail('Not your turn');

  const valid = getValidCityVertices(state, player);
  if (!valid.includes(vertex)) return fail('Invalid city location or insufficient resources');

  return ok();
}

function validateBuyDevCard(state: GameState, player: PlayerId): ValidationResult {
  if (state.phase !== 'TRADE_BUILD_PLAY') return fail('Not in build phase');
  if (state.currentPlayer !== player) return fail('Not your turn');
  if (!canBuyDevCard(state, player)) return fail('Cannot buy dev card');

  return ok();
}

function validatePlayKnight(state: GameState, player: PlayerId): ValidationResult {
  if (state.phase !== 'TRADE_BUILD_PLAY') return fail('Not in build phase');
  if (state.currentPlayer !== player) return fail('Not your turn');
  if (!canPlayDevCard(state, player, 'knight')) return fail('Cannot play knight');

  return ok();
}

function validatePlayRoadBuilding(state: GameState, player: PlayerId): ValidationResult {
  if (state.phase !== 'TRADE_BUILD_PLAY') return fail('Not in build phase');
  if (state.currentPlayer !== player) return fail('Not your turn');
  if (!canPlayDevCard(state, player, 'road_building')) return fail('Cannot play road building');

  return ok();
}

function validatePlaceRoadBuildingRoad(state: GameState, player: PlayerId, edge: number): ValidationResult {
  if (state.phase !== 'ROAD_BUILDING_PLACE') return fail('Not in road building phase');
  if (state.currentPlayer !== player) return fail('Not your turn');

  const valid = getValidRoadEdgesNoResourceCheck(state, player);
  if (!valid.includes(edge)) return fail('Invalid road location');

  return ok();
}

function validatePlayYearOfPlenty(state: GameState, player: PlayerId): ValidationResult {
  if (state.phase !== 'TRADE_BUILD_PLAY') return fail('Not in build phase');
  if (state.currentPlayer !== player) return fail('Not your turn');
  if (!canPlayDevCard(state, player, 'year_of_plenty')) return fail('Cannot play year of plenty');

  return ok();
}

function validatePickYearOfPlentyResources(
  state: GameState,
  player: PlayerId,
  resource1: string,
  resource2: string,
): ValidationResult {
  if (state.phase !== 'YEAR_OF_PLENTY_PICK') return fail('Not in year of plenty phase');
  if (state.currentPlayer !== player) return fail('Not your turn');

  // Check bank has resources
  const bank = state.bank;
  if (resource1 === resource2) {
    if (bank[resource1 as keyof typeof bank] < 2) return fail('Bank does not have enough');
  } else {
    if (bank[resource1 as keyof typeof bank] < 1) return fail(`Bank has no ${resource1}`);
    if (bank[resource2 as keyof typeof bank] < 1) return fail(`Bank has no ${resource2}`);
  }

  return ok();
}

function validatePlayMonopoly(state: GameState, player: PlayerId): ValidationResult {
  if (state.phase !== 'TRADE_BUILD_PLAY') return fail('Not in build phase');
  if (state.currentPlayer !== player) return fail('Not your turn');
  if (!canPlayDevCard(state, player, 'monopoly')) return fail('Cannot play monopoly');

  return ok();
}

function validatePickMonopolyResource(state: GameState, player: PlayerId): ValidationResult {
  if (state.phase !== 'MONOPOLY_PICK') return fail('Not in monopoly phase');
  if (state.currentPlayer !== player) return fail('Not your turn');

  return ok();
}

function validateMaritimeTradeAction(
  state: GameState,
  player: PlayerId,
  give: string,
  receive: string,
): ValidationResult {
  if (state.phase !== 'TRADE_BUILD_PLAY') return fail('Not in trade phase');
  if (state.currentPlayer !== player) return fail('Not your turn');
  if (!isValidMaritimeTrade(state, player, give as any, receive as any)) {
    return fail('Invalid maritime trade');
  }

  return ok();
}

function validateProposeDomesticTrade(
  state: GameState,
  player: PlayerId,
  offering: any,
  requesting: any,
): ValidationResult {
  if (state.phase !== 'TRADE_BUILD_PLAY') return fail('Not in trade phase');
  if (state.currentPlayer !== player) return fail('Not your turn');
  if (state.pendingTrade !== null) return fail('Trade already pending');

  // Check player has the offered resources
  if (!hasResources(state.players[player].resources, offering)) {
    return fail('Not enough resources to offer');
  }

  // Check at least something is being traded
  const totalOffer = totalResources(offering);
  const totalRequest = totalResources(requesting);
  if (totalOffer === 0 || totalRequest === 0) return fail('Trade must include resources');

  return ok();
}

function validateAcceptDomesticTrade(state: GameState, player: PlayerId): ValidationResult {
  if (state.phase !== 'TRADE_BUILD_PLAY') return fail('Not in trade phase');
  if (state.pendingTrade === null) return fail('No pending trade');
  if (state.pendingTrade.from === player) return fail('Cannot accept own trade');

  // Check acceptor has the requested resources
  if (!hasResources(state.players[player].resources, state.pendingTrade.requesting)) {
    return fail('Not enough resources to accept');
  }

  return ok();
}

function validateRejectDomesticTrade(state: GameState, _player: PlayerId): ValidationResult {
  if (state.phase !== 'TRADE_BUILD_PLAY') return fail('Not in trade phase');
  if (state.pendingTrade === null) return fail('No pending trade');

  return ok();
}

function validateEndTurn(state: GameState, player: PlayerId): ValidationResult {
  if (state.phase !== 'TRADE_BUILD_PLAY') return fail('Not in build phase');
  if (state.currentPlayer !== player) return fail('Not your turn');

  return ok();
}
