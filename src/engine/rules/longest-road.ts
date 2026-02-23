import type { GameState, PlayerId, EdgeId, VertexId } from '../types';
import { MIN_LONGEST_ROAD } from '../constants';

/**
 * Calculate the longest road for a player using DFS.
 *
 * Key rules:
 * - Only count edges (roads) owned by the player
 * - Opponent settlements/cities BREAK road continuity
 * - A path can cross itself at a vertex (only edges are unique per path)
 * - DFS from every vertex that has the player's road
 */
export function calculateLongestRoad(
  state: GameState,
  player: PlayerId,
): number {
  // Find all edges owned by this player
  const playerEdges = new Set<EdgeId>();
  for (let eid = 0; eid < state.topology.edgeCount; eid++) {
    if (state.edgeRoads[eid]?.owner === player) {
      playerEdges.add(eid);
    }
  }

  if (playerEdges.size === 0) return 0;

  // Find all vertices that are endpoints of player's roads
  const startVertices = new Set<VertexId>();
  for (const eid of playerEdges) {
    const [v1, v2] = state.topology.edgeEndpoints[eid];
    startVertices.add(v1);
    startVertices.add(v2);
  }

  let maxLength = 0;

  // DFS from each start vertex
  for (const startVertex of startVertices) {
    const visited = new Set<EdgeId>();
    const length = dfs(state, player, playerEdges, startVertex, visited);
    maxLength = Math.max(maxLength, length);
  }

  return maxLength;
}

function dfs(
  state: GameState,
  player: PlayerId,
  playerEdges: Set<EdgeId>,
  vertex: VertexId,
  visitedEdges: Set<EdgeId>,
): number {
  let maxLength = 0;

  for (const eid of state.topology.vertexAdjacentEdges[vertex]) {
    if (!playerEdges.has(eid)) continue;
    if (visitedEdges.has(eid)) continue;

    // Find the other vertex of this edge
    const [v1, v2] = state.topology.edgeEndpoints[eid];
    const nextVertex = v1 === vertex ? v2 : v1;

    // Check if opponent building blocks traversal through this vertex
    // (but we can still count the edge leading INTO a blocked vertex)
    const building = state.vertexBuildings[nextVertex];
    const blocked = building !== null && building.owner !== player;

    visitedEdges.add(eid);

    if (blocked) {
      // Can count this edge but can't continue through
      maxLength = Math.max(maxLength, 1);
    } else {
      const pathLength = 1 + dfs(state, player, playerEdges, nextVertex, visitedEdges);
      maxLength = Math.max(maxLength, pathLength);
    }

    visitedEdges.delete(eid);
  }

  return maxLength;
}

/** Update longest road awards for all players */
export function updateLongestRoad(state: GameState): GameState {
  let longestLength = state.longestRoadLength;
  let longestPlayer = state.longestRoadPlayer;

  for (let pid = 0; pid < state.playerCount; pid++) {
    const length = calculateLongestRoad(state, pid as PlayerId);

    if (length >= MIN_LONGEST_ROAD) {
      if (longestPlayer === null && length >= MIN_LONGEST_ROAD) {
        // First player to reach 5
        longestPlayer = pid as PlayerId;
        longestLength = length;
      } else if (length > longestLength) {
        // New leader
        longestPlayer = pid as PlayerId;
        longestLength = length;
      }
    }
  }

  // Check if current holder still qualifies
  if (longestPlayer !== null) {
    const currentLength = calculateLongestRoad(state, longestPlayer);
    if (currentLength < MIN_LONGEST_ROAD) {
      // Find new longest, if any
      longestPlayer = null;
      longestLength = 0;
      for (let pid = 0; pid < state.playerCount; pid++) {
        const length = calculateLongestRoad(state, pid as PlayerId);
        if (length >= MIN_LONGEST_ROAD && length > longestLength) {
          longestPlayer = pid as PlayerId;
          longestLength = length;
        }
      }
    }
  }

  if (longestPlayer !== state.longestRoadPlayer) {
    const log = longestPlayer !== null
      ? [...state.log, `${state.players[longestPlayer].name} now has Longest Road (${longestLength})`]
      : state.log;
    return { ...state, longestRoadPlayer: longestPlayer, longestRoadLength: longestLength, log };
  }

  return { ...state, longestRoadLength: longestLength };
}
