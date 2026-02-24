/**
 * Board analysis utilities: pip counts, resource production, port access.
 */
import type { GameState, PlayerId, ResourceType, VertexId } from '@engine/types';
import { terrainToResource, ALL_RESOURCES } from '@engine/types';
import type { HarborType } from '@engine/types';

/** Number of dots on a dice roll probability marker (pips) */
const PIP_COUNTS: Record<number, number> = {
  2: 1, 3: 2, 4: 3, 5: 4, 6: 5,
  8: 5, 9: 4, 10: 3, 11: 2, 12: 1,
};

/** Get the pip count for a number token (0 for null/7/desert) */
export function getPipCount(numberToken: number | null): number {
  if (numberToken === null) return 0;
  return PIP_COUNTS[numberToken] ?? 0;
}

/** Calculate total pip production for a vertex (sum of adjacent hex pips) */
export function vertexPipCount(state: GameState, vertex: VertexId): number {
  let pips = 0;
  for (const hid of state.topology.vertexAdjacentHexes[vertex]) {
    if (hid === state.robberHex) continue;
    pips += getPipCount(state.hexTiles[hid].numberToken);
  }
  return pips;
}

/** Get per-resource pip production for a vertex */
export function vertexResourceProduction(
  state: GameState,
  vertex: VertexId,
): Record<ResourceType, number> {
  const prod: Record<ResourceType, number> = { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 };
  for (const hid of state.topology.vertexAdjacentHexes[vertex]) {
    if (hid === state.robberHex) continue;
    const res = terrainToResource(state.hexTiles[hid].terrain);
    if (res !== null) {
      prod[res] += getPipCount(state.hexTiles[hid].numberToken);
    }
  }
  return prod;
}

/** Count unique resource types produced at a vertex */
export function vertexResourceDiversity(state: GameState, vertex: VertexId): number {
  const types = new Set<ResourceType>();
  for (const hid of state.topology.vertexAdjacentHexes[vertex]) {
    const res = terrainToResource(state.hexTiles[hid].terrain);
    if (res !== null) types.add(res);
  }
  return types.size;
}

/** Calculate total pip production for a player from all their buildings */
export function playerTotalProduction(state: GameState, player: PlayerId): number {
  let total = 0;
  for (let vid = 0; vid < state.topology.vertexCount; vid++) {
    const building = state.vertexBuildings[vid];
    if (building === null || building.owner !== player) continue;
    const multiplier = building.type === 'city' ? 2 : 1;
    total += vertexPipCount(state, vid) * multiplier;
  }
  return total;
}

/** Calculate per-resource pip production for a player */
export function playerResourceProduction(
  state: GameState,
  player: PlayerId,
): Record<ResourceType, number> {
  const prod: Record<ResourceType, number> = { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 };
  for (let vid = 0; vid < state.topology.vertexCount; vid++) {
    const building = state.vertexBuildings[vid];
    if (building === null || building.owner !== player) continue;
    const multiplier = building.type === 'city' ? 2 : 1;
    const vProd = vertexResourceProduction(state, vid);
    for (const r of ALL_RESOURCES) {
      prod[r] += vProd[r] * multiplier;
    }
  }
  return prod;
}

/** Get harbor types accessible to a player */
export function playerPortAccess(state: GameState, player: PlayerId): Set<HarborType> {
  const ports = new Set<HarborType>();
  for (const harbor of state.harbors) {
    for (const vid of harbor.vertices) {
      const building = state.vertexBuildings[vid];
      if (building !== null && building.owner === player) {
        ports.add(harbor.type);
      }
    }
  }
  return ports;
}

/** Check if a vertex is adjacent to any harbor */
export function vertexHarborType(state: GameState, vertex: VertexId): HarborType | null {
  for (const harbor of state.harbors) {
    if (harbor.vertices.includes(vertex)) {
      return harbor.type;
    }
  }
  return null;
}

/** Distance (in edges) from a vertex to the nearest harbor vertex */
export function vertexDistanceToHarbor(state: GameState, vertex: VertexId): number {
  const harborVertices = new Set<VertexId>();
  for (const harbor of state.harbors) {
    for (const vid of harbor.vertices) {
      harborVertices.add(vid);
    }
  }

  if (harborVertices.has(vertex)) return 0;

  // BFS
  const visited = new Set<VertexId>([vertex]);
  let frontier = [vertex];
  let depth = 0;

  while (frontier.length > 0 && depth < 10) {
    depth++;
    const next: VertexId[] = [];
    for (const v of frontier) {
      for (const adj of state.topology.vertexAdjacentVertices[v]) {
        if (visited.has(adj)) continue;
        if (harborVertices.has(adj)) return depth;
        visited.add(adj);
        next.push(adj);
      }
    }
    frontier = next;
  }

  return 99; // unreachable
}
