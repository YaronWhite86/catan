import type { GameState, PlayerId, ResourceType, ResourceCount, VertexId } from '../types';
import { addResources, subtractResources, addResource, removeResource } from '../utils/resource-utils';
import { getTradeRatio } from '../board/harbors';

/** Get vertices owned by a player (for harbor lookup) */
function getPlayerVertices(state: GameState, player: PlayerId): VertexId[] {
  const vertices: VertexId[] = [];
  for (let vid = 0; vid < state.topology.vertexCount; vid++) {
    const building = state.vertexBuildings[vid];
    if (building !== null && building.owner === player) {
      vertices.push(vid);
    }
  }
  return vertices;
}

/** Get the trade ratio for a player and resource */
export function getPlayerTradeRatio(
  state: GameState,
  player: PlayerId,
  resource: ResourceType,
): number {
  const playerVertices = getPlayerVertices(state, player);
  return getTradeRatio(state.harbors, playerVertices, resource);
}

/** Check if a maritime trade is valid */
export function isValidMaritimeTrade(
  state: GameState,
  player: PlayerId,
  give: ResourceType,
  receive: ResourceType,
): boolean {
  if (give === receive) return false;

  const ratio = getPlayerTradeRatio(state, player, give);
  if (state.players[player].resources[give] < ratio) return false;
  if (state.bank[receive] <= 0) return false;

  return true;
}

/** Apply maritime trade */
export function applyMaritimeTrade(
  state: GameState,
  player: PlayerId,
  give: ResourceType,
  receive: ResourceType,
): GameState {
  const ratio = getPlayerTradeRatio(state, player, give);

  const newPlayers = [...state.players];
  newPlayers[player] = {
    ...newPlayers[player],
    resources: addResource(
      removeResource(newPlayers[player].resources, give, ratio),
      receive,
    ),
  };

  const newBank = removeResource(addResource(state.bank, give, ratio), receive);

  return {
    ...state,
    players: newPlayers,
    bank: newBank,
    log: [...state.log, `${newPlayers[player].name} traded ${ratio} ${give} for 1 ${receive} (maritime)`],
  };
}

/** Apply propose domestic trade */
export function applyProposeTrade(
  state: GameState,
  player: PlayerId,
  offering: ResourceCount,
  requesting: ResourceCount,
): GameState {
  return {
    ...state,
    pendingTrade: {
      from: player,
      offering,
      requesting,
      acceptedBy: null,
    },
    log: [...state.log, `${state.players[player].name} proposed a trade`],
  };
}

/** Apply accept domestic trade */
export function applyAcceptTrade(
  state: GameState,
  acceptor: PlayerId,
): GameState {
  const trade = state.pendingTrade;
  if (!trade) return state;

  const newPlayers = [...state.players];

  // Proposer gives offering, receives requesting
  newPlayers[trade.from] = {
    ...newPlayers[trade.from],
    resources: addResources(
      subtractResources(newPlayers[trade.from].resources, trade.offering),
      trade.requesting,
    ),
  };

  // Acceptor gives requesting, receives offering
  newPlayers[acceptor] = {
    ...newPlayers[acceptor],
    resources: addResources(
      subtractResources(newPlayers[acceptor].resources, trade.requesting),
      trade.offering,
    ),
  };

  return {
    ...state,
    players: newPlayers,
    pendingTrade: null,
    log: [...state.log, `${newPlayers[acceptor].name} accepted the trade`],
  };
}

/** Apply reject domestic trade */
export function applyRejectTrade(
  state: GameState,
  player: PlayerId,
): GameState {
  return {
    ...state,
    pendingTrade: null,
    log: [...state.log, `${state.players[player].name} rejected the trade`],
  };
}
