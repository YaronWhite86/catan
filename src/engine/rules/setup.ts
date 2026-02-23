import type { GameState, PlayerId, VertexId, EdgeId } from '../types';
import { terrainToResource } from '../types';
import { emptyResources, addResource } from '../utils/resource-utils';

/**
 * Get the setup placement order (snake draft).
 * For 4 players: 0,1,2,3,3,2,1,0
 * For 3 players: 0,1,2,2,1,0
 */
export function getSetupOrder(playerCount: number): PlayerId[] {
  const forward = Array.from({ length: playerCount }, (_, i) => i as PlayerId);
  const reverse = [...forward].reverse();
  return [...forward, ...reverse];
}

/** Get valid vertices for setup settlement placement */
export function getValidSetupSettlementVertices(state: GameState): VertexId[] {
  const valid: VertexId[] = [];

  for (let vid = 0; vid < state.topology.vertexCount; vid++) {
    // Must be empty
    if (state.vertexBuildings[vid] !== null) continue;

    // Distance rule: no adjacent vertex has a building
    const hasAdjacentBuilding = state.topology.vertexAdjacentVertices[vid].some(
      (adj) => state.vertexBuildings[adj] !== null,
    );
    if (hasAdjacentBuilding) continue;

    valid.push(vid);
  }

  return valid;
}

/** Get valid edges for setup road placement (must be adjacent to last placed settlement) */
export function getValidSetupRoadEdges(state: GameState, _player: PlayerId): EdgeId[] {
  if (state.lastPlacedVertex === null) return [];

  const valid: EdgeId[] = [];
  const vertex = state.lastPlacedVertex;

  for (const eid of state.topology.vertexAdjacentEdges[vertex]) {
    // Must be empty
    if (state.edgeRoads[eid] !== null) continue;
    valid.push(eid);
  }

  return valid;
}

/** Apply setup settlement placement */
export function placeSetupSettlement(
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
  };

  // Second round: grant initial resources from adjacent hexes
  if (state.setupRound === 1) {
    let resources = emptyResources();
    for (const hid of state.topology.vertexAdjacentHexes[vertex]) {
      const res = terrainToResource(state.hexTiles[hid].terrain);
      if (res !== null) {
        resources = addResource(resources, res);
      }
    }
    const newBank = { ...state.bank };
    for (const r of ['lumber', 'brick', 'wool', 'grain', 'ore'] as const) {
      if (resources[r] > 0) {
        newPlayers[player] = {
          ...newPlayers[player],
          resources: addResource(newPlayers[player].resources, r, resources[r]),
        };
        newBank[r] -= resources[r];
      }
    }
    return {
      ...state,
      vertexBuildings: newVertexBuildings,
      players: newPlayers,
      bank: newBank,
      lastPlacedVertex: vertex,
      phase: 'SETUP_PLACE_ROAD',
      log: [...state.log, `${newPlayers[player].name} placed a settlement`],
    };
  }

  return {
    ...state,
    vertexBuildings: newVertexBuildings,
    players: newPlayers,
    lastPlacedVertex: vertex,
    phase: 'SETUP_PLACE_ROAD',
    log: [...state.log, `${newPlayers[player].name} placed a settlement`],
  };
}

/** Apply setup road placement and advance to next setup step or main game */
export function placeSetupRoad(
  state: GameState,
  player: PlayerId,
  edge: EdgeId,
): GameState {
  const newEdgeRoads = [...state.edgeRoads];
  newEdgeRoads[edge] = { owner: player };

  const newPlayers = [...state.players];
  newPlayers[player] = {
    ...newPlayers[player],
    remainingRoads: newPlayers[player].remainingRoads - 1,
  };

  const setupOrder = getSetupOrder(state.playerCount);
  const nextIndex = state.setupIndex + 1;

  // Check if setup is complete
  if (nextIndex >= setupOrder.length) {
    // Setup complete, start main game with player 0
    return {
      ...state,
      edgeRoads: newEdgeRoads,
      players: newPlayers,
      phase: 'ROLL_DICE',
      currentPlayer: 0 as PlayerId,
      lastPlacedVertex: null,
      turnNumber: 1,
      log: [...state.log, `${newPlayers[player].name} placed a road`, 'Setup complete! Game begins.'],
    };
  }

  // Next player in setup order
  const nextPlayer = setupOrder[nextIndex];
  const nextRound = nextIndex >= state.playerCount ? 1 : 0;

  return {
    ...state,
    edgeRoads: newEdgeRoads,
    players: newPlayers,
    phase: 'SETUP_PLACE_SETTLEMENT',
    currentPlayer: nextPlayer,
    setupIndex: nextIndex,
    setupRound: nextRound,
    lastPlacedVertex: null,
    log: [...state.log, `${newPlayers[player].name} placed a road`],
  };
}
