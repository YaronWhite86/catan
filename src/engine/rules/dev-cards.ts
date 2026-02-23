import type { GameState, PlayerId, DevCardType, ResourceType } from '../types';
import { hasResources, subtractResources, addResources, addResource } from '../utils/resource-utils';
import { DEV_CARD_COST } from '../constants';

/** Check if a player can buy a dev card */
export function canBuyDevCard(state: GameState, player: PlayerId): boolean {
  if (state.devCardDeck.length === 0) return false;
  return hasResources(state.players[player].resources, DEV_CARD_COST);
}

/** Check if a player can play a dev card */
export function canPlayDevCard(
  state: GameState,
  player: PlayerId,
  cardType: DevCardType,
): boolean {
  if (state.players[player].hasPlayedDevCardThisTurn) return false;
  if (cardType === 'victory_point') return false; // VP cards are never played
  return state.players[player].devCards.includes(cardType);
}

/** Apply buy dev card */
export function applyBuyDevCard(state: GameState, player: PlayerId): GameState {
  const newDeck = [...state.devCardDeck];
  const card = newDeck.pop()!;

  const newPlayers = [...state.players];
  newPlayers[player] = {
    ...newPlayers[player],
    resources: subtractResources(newPlayers[player].resources, DEV_CARD_COST),
    newDevCards: [...newPlayers[player].newDevCards, card],
  };

  const newBank = addResources(state.bank, DEV_CARD_COST);

  return {
    ...state,
    players: newPlayers,
    devCardDeck: newDeck,
    bank: newBank,
    log: [...state.log, `${newPlayers[player].name} bought a development card`],
  };
}

/** Remove a dev card from player's hand */
function removeDevCard(devCards: DevCardType[], cardType: DevCardType): DevCardType[] {
  const idx = devCards.indexOf(cardType);
  if (idx === -1) return devCards;
  return [...devCards.slice(0, idx), ...devCards.slice(idx + 1)];
}

/** Apply play knight */
export function applyPlayKnight(state: GameState, player: PlayerId): GameState {
  const newPlayers = [...state.players];
  newPlayers[player] = {
    ...newPlayers[player],
    devCards: removeDevCard(newPlayers[player].devCards, 'knight'),
    knightsPlayed: newPlayers[player].knightsPlayed + 1,
    hasPlayedDevCardThisTurn: true,
  };

  return {
    ...state,
    players: newPlayers,
    phase: 'MOVE_ROBBER',
    log: [...state.log, `${newPlayers[player].name} played a Knight`],
  };
}

/** Apply play road building */
export function applyPlayRoadBuilding(state: GameState, player: PlayerId): GameState {
  const newPlayers = [...state.players];
  newPlayers[player] = {
    ...newPlayers[player],
    devCards: removeDevCard(newPlayers[player].devCards, 'road_building'),
    hasPlayedDevCardThisTurn: true,
  };

  // How many roads can actually be placed?
  const roadsToPlace = Math.min(2, newPlayers[player].remainingRoads);

  if (roadsToPlace === 0) {
    return {
      ...state,
      players: newPlayers,
      log: [...state.log, `${newPlayers[player].name} played Road Building (no roads to place)`],
    };
  }

  return {
    ...state,
    players: newPlayers,
    phase: 'ROAD_BUILDING_PLACE',
    roadBuildingRoadsLeft: roadsToPlace,
    log: [...state.log, `${newPlayers[player].name} played Road Building`],
  };
}

/** Apply play year of plenty */
export function applyPlayYearOfPlenty(state: GameState, player: PlayerId): GameState {
  const newPlayers = [...state.players];
  newPlayers[player] = {
    ...newPlayers[player],
    devCards: removeDevCard(newPlayers[player].devCards, 'year_of_plenty'),
    hasPlayedDevCardThisTurn: true,
  };

  return {
    ...state,
    players: newPlayers,
    phase: 'YEAR_OF_PLENTY_PICK',
    log: [...state.log, `${newPlayers[player].name} played Year of Plenty`],
  };
}

/** Apply pick year of plenty resources */
export function applyPickYearOfPlentyResources(
  state: GameState,
  player: PlayerId,
  resource1: ResourceType,
  resource2: ResourceType,
): GameState {
  const newPlayers = [...state.players];
  let newResources = addResource(newPlayers[player].resources, resource1);
  newResources = addResource(newResources, resource2);
  newPlayers[player] = { ...newPlayers[player], resources: newResources };

  const newBank = { ...state.bank };
  newBank[resource1] -= 1;
  newBank[resource2] -= 1;

  return {
    ...state,
    players: newPlayers,
    bank: newBank,
    phase: 'TRADE_BUILD_PLAY',
    log: [...state.log, `${newPlayers[player].name} took ${resource1} and ${resource2}`],
  };
}

/** Apply play monopoly */
export function applyPlayMonopoly(state: GameState, player: PlayerId): GameState {
  const newPlayers = [...state.players];
  newPlayers[player] = {
    ...newPlayers[player],
    devCards: removeDevCard(newPlayers[player].devCards, 'monopoly'),
    hasPlayedDevCardThisTurn: true,
  };

  return {
    ...state,
    players: newPlayers,
    phase: 'MONOPOLY_PICK',
    log: [...state.log, `${newPlayers[player].name} played Monopoly`],
  };
}

/** Apply pick monopoly resource */
export function applyPickMonopolyResource(
  state: GameState,
  player: PlayerId,
  resource: ResourceType,
): GameState {
  const newPlayers = state.players.map((p) => ({ ...p }));

  let totalStolen = 0;
  for (let i = 0; i < newPlayers.length; i++) {
    if (i === player) continue;
    const amount = newPlayers[i].resources[resource];
    if (amount > 0) {
      totalStolen += amount;
      newPlayers[i] = {
        ...newPlayers[i],
        resources: { ...newPlayers[i].resources, [resource]: 0 },
      };
    }
  }

  newPlayers[player] = {
    ...newPlayers[player],
    resources: addResource(newPlayers[player].resources, resource, totalStolen),
  };

  return {
    ...state,
    players: newPlayers,
    phase: 'TRADE_BUILD_PLAY',
    log: [...state.log, `${newPlayers[player].name} monopolized ${resource} (took ${totalStolen})`],
  };
}

/** Move new dev cards to playable at end of turn */
export function promoteNewDevCards(state: GameState, player: PlayerId): GameState {
  const newPlayers = [...state.players];
  newPlayers[player] = {
    ...newPlayers[player],
    devCards: [...newPlayers[player].devCards, ...newPlayers[player].newDevCards],
    newDevCards: [],
    hasPlayedDevCardThisTurn: false,
  };

  return { ...state, players: newPlayers };
}
