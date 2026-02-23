import type { GameState, PlayerId, VertexId, EdgeId } from '../types';
import { hasResources, subtractResources, addResources } from '../utils/resource-utils';
import { ROAD_COST, SETTLEMENT_COST, CITY_COST } from '../constants';

/** Get vertices where a player can build a settlement (main game, not setup) */
export function getValidSettlementVertices(
  state: GameState,
  player: PlayerId,
): VertexId[] {
  if (state.players[player].remainingSettlements <= 0) return [];
  if (!hasResources(state.players[player].resources, SETTLEMENT_COST)) return [];

  const valid: VertexId[] = [];

  for (let vid = 0; vid < state.topology.vertexCount; vid++) {
    if (!isValidSettlementVertex(state, player, vid)) continue;
    valid.push(vid);
  }

  return valid;
}

/** Check if a specific vertex is valid for settlement placement */
export function isValidSettlementVertex(
  state: GameState,
  player: PlayerId,
  vertex: VertexId,
): boolean {
  // Must be empty
  if (state.vertexBuildings[vertex] !== null) return false;

  // Distance rule: no adjacent vertex has any building
  for (const adj of state.topology.vertexAdjacentVertices[vertex]) {
    if (state.vertexBuildings[adj] !== null) return false;
  }

  // Must be connected to player's road network
  const hasConnectedRoad = state.topology.vertexAdjacentEdges[vertex].some(
    (eid) => state.edgeRoads[eid]?.owner === player,
  );
  if (!hasConnectedRoad) return false;

  return true;
}

/** Get vertices where a player can upgrade to a city */
export function getValidCityVertices(
  state: GameState,
  player: PlayerId,
): VertexId[] {
  if (state.players[player].remainingCities <= 0) return [];
  if (!hasResources(state.players[player].resources, CITY_COST)) return [];

  const valid: VertexId[] = [];

  for (let vid = 0; vid < state.topology.vertexCount; vid++) {
    const building = state.vertexBuildings[vid];
    if (building !== null && building.type === 'settlement' && building.owner === player) {
      valid.push(vid);
    }
  }

  return valid;
}

/** Get edges where a player can build a road (main game) */
export function getValidRoadEdges(
  state: GameState,
  player: PlayerId,
): EdgeId[] {
  if (state.players[player].remainingRoads <= 0) return [];
  if (!hasResources(state.players[player].resources, ROAD_COST)) return [];

  return getValidRoadEdgesNoResourceCheck(state, player);
}

/** Get valid road edges ignoring resource check (for road building card) */
export function getValidRoadEdgesNoResourceCheck(
  state: GameState,
  player: PlayerId,
): EdgeId[] {
  if (state.players[player].remainingRoads <= 0) return [];

  const valid: EdgeId[] = [];

  for (let eid = 0; eid < state.topology.edgeCount; eid++) {
    if (state.edgeRoads[eid] !== null) continue;

    const [v1, v2] = state.topology.edgeEndpoints[eid];

    // Must connect to player's existing road network or building
    // A vertex is accessible if it has player's building OR
    // an adjacent edge with player's road AND no opponent building blocking
    const v1Accessible = isVertexAccessible(state, player, v1);
    const v2Accessible = isVertexAccessible(state, player, v2);

    if (v1Accessible || v2Accessible) {
      valid.push(eid);
    }
  }

  return valid;
}

/** Check if a vertex is accessible for road building by this player */
function isVertexAccessible(
  state: GameState,
  player: PlayerId,
  vertex: VertexId,
): boolean {
  // Player has a building here
  const building = state.vertexBuildings[vertex];
  if (building !== null && building.owner === player) return true;

  // Opponent building blocks traversal
  if (building !== null && building.owner !== player) return false;

  // Player has a road connected to this vertex
  return state.topology.vertexAdjacentEdges[vertex].some(
    (eid) => state.edgeRoads[eid]?.owner === player,
  );
}

/** Apply build road action */
export function applyBuildRoad(
  state: GameState,
  player: PlayerId,
  edge: EdgeId,
  free: boolean = false,
): GameState {
  const newEdgeRoads = [...state.edgeRoads];
  newEdgeRoads[edge] = { owner: player };

  const newPlayers = [...state.players];
  newPlayers[player] = {
    ...newPlayers[player],
    remainingRoads: newPlayers[player].remainingRoads - 1,
  };

  let newBank = state.bank;
  if (!free) {
    newPlayers[player] = {
      ...newPlayers[player],
      resources: subtractResources(newPlayers[player].resources, ROAD_COST),
    };
    newBank = addResources(state.bank, ROAD_COST);
  }

  return {
    ...state,
    edgeRoads: newEdgeRoads,
    players: newPlayers,
    bank: newBank,
    log: [...state.log, `${newPlayers[player].name} built a road`],
  };
}

/** Apply build settlement action */
export function applyBuildSettlement(
  state: GameState,
  player: PlayerId,
  vertex: VertexId,
): GameState {
  const newVertexBuildings = [...state.vertexBuildings];
  newVertexBuildings[vertex] = { type: 'settlement', owner: player };

  const newPlayers = [...state.players];
  newPlayers[player] = {
    ...newPlayers[player],
    remainingSettlements: newPlayers[player].remainingSettlements - 1,
    resources: subtractResources(newPlayers[player].resources, SETTLEMENT_COST),
  };

  const newBank = addResources(state.bank, SETTLEMENT_COST);

  return {
    ...state,
    vertexBuildings: newVertexBuildings,
    players: newPlayers,
    bank: newBank,
    log: [...state.log, `${newPlayers[player].name} built a settlement`],
  };
}

/** Apply build city action */
export function applyBuildCity(
  state: GameState,
  player: PlayerId,
  vertex: VertexId,
): GameState {
  const newVertexBuildings = [...state.vertexBuildings];
  newVertexBuildings[vertex] = { type: 'city', owner: player };

  const newPlayers = [...state.players];
  newPlayers[player] = {
    ...newPlayers[player],
    remainingCities: newPlayers[player].remainingCities - 1,
    remainingSettlements: newPlayers[player].remainingSettlements + 1, // settlement returned
    resources: subtractResources(newPlayers[player].resources, CITY_COST),
  };

  const newBank = addResources(state.bank, CITY_COST);

  return {
    ...state,
    vertexBuildings: newVertexBuildings,
    players: newPlayers,
    bank: newBank,
    log: [...state.log, `${newPlayers[player].name} built a city`],
  };
}
