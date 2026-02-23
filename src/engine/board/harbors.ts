/**
 * Harbor placement for standard Catan board.
 *
 * Harbors sit on coastal edges. Each harbor grants its trade bonus
 * to the two vertices of that edge.
 */

import type { HarborType, HarborDefinition, ResourceType } from '../types';
import type { BoardTopology, VertexId } from './board-graph';

/** Standard harbor types in order around the coast */
export const STANDARD_HARBOR_TYPES: HarborType[] = [
  'generic',
  'grain',
  'ore',
  'generic',
  'wool',
  'generic',
  'generic',
  'brick',
  'lumber',
];

/**
 * Find coastal vertices: those with fewer than 3 adjacent hexes.
 * Then identify harbor edge pairs by finding coastal edges.
 */
export function getCoastalVertices(topology: BoardTopology): Set<VertexId> {
  const coastal = new Set<VertexId>();
  for (let vid = 0; vid < topology.vertexCount; vid++) {
    if (topology.vertexAdjacentHexes[vid].length < 3) {
      coastal.add(vid);
    }
  }
  return coastal;
}

/**
 * Get coastal edges (both endpoints are coastal) sorted for consistent harbor placement.
 * Returns pairs of [edgeId, [v1, v2]].
 */
function getCoastalEdges(topology: BoardTopology): { eid: number; v1: VertexId; v2: VertexId }[] {
  const coastal = getCoastalVertices(topology);
  const edges: { eid: number; v1: VertexId; v2: VertexId }[] = [];

  for (let eid = 0; eid < topology.edgeCount; eid++) {
    const [v1, v2] = topology.edgeEndpoints[eid];
    // A coastal edge has both vertices coastal AND both vertices have exactly 2 adjacent hexes
    // (edges where one vertex has 1 hex are corner edges, not ideal for harbors)
    if (coastal.has(v1) && coastal.has(v2)) {
      // Only include edges where both vertices touch at least 1 hex
      // but the edge itself is on the coast (not internal)
      const sharedHexes = topology.vertexAdjacentHexes[v1].filter(
        (h) => topology.vertexAdjacentHexes[v2].includes(h)
      );
      // Coastal edges share exactly 1 hex (internal edges share 2)
      if (sharedHexes.length === 1) {
        edges.push({ eid, v1, v2 });
      }
    }
  }

  return edges;
}

/**
 * Assign harbors to coastal edges, evenly spaced around the coast.
 * Uses angular sorting from board center to distribute harbors.
 */
export function assignHarbors(topology: BoardTopology): HarborDefinition[] {
  const coastalEdges = getCoastalEdges(topology);

  // Sort coastal edges by angle from center for consistent placement
  const centerX = topology.hexPixelPositions.reduce((s, p) => s + p.x, 0) / topology.hexPixelPositions.length;
  const centerY = topology.hexPixelPositions.reduce((s, p) => s + p.y, 0) / topology.hexPixelPositions.length;

  coastalEdges.sort((a, b) => {
    const midA = {
      x: (topology.vertexPixelPositions[a.v1].x + topology.vertexPixelPositions[a.v2].x) / 2,
      y: (topology.vertexPixelPositions[a.v1].y + topology.vertexPixelPositions[a.v2].y) / 2,
    };
    const midB = {
      x: (topology.vertexPixelPositions[b.v1].x + topology.vertexPixelPositions[b.v2].x) / 2,
      y: (topology.vertexPixelPositions[b.v1].y + topology.vertexPixelPositions[b.v2].y) / 2,
    };
    const angleA = Math.atan2(midA.y - centerY, midA.x - centerX);
    const angleB = Math.atan2(midB.y - centerY, midB.x - centerX);
    return angleA - angleB;
  });

  // Pick 9 evenly spaced coastal edges for harbors
  const harbors: HarborDefinition[] = [];
  const totalCoastal = coastalEdges.length;
  const step = totalCoastal / 9;

  for (let i = 0; i < 9; i++) {
    const idx = Math.floor(i * step) % totalCoastal;
    const edge = coastalEdges[idx];
    harbors.push({
      type: STANDARD_HARBOR_TYPES[i],
      vertices: [edge.v1, edge.v2],
    });
  }

  return harbors;
}

/** Get the best trade ratio a player has for a given resource */
export function getTradeRatio(
  harbors: HarborDefinition[],
  playerVertices: VertexId[],
  resource: ResourceType,
): number {
  let ratio = 4; // default

  for (const harbor of harbors) {
    const hasAccess = harbor.vertices.some((v) => playerVertices.includes(v));
    if (!hasAccess) continue;

    if (harbor.type === 'generic') {
      ratio = Math.min(ratio, 3);
    } else if (harbor.type === resource) {
      ratio = Math.min(ratio, 2);
    }
  }

  return ratio;
}

/** Get all harbor-connected vertices for quick lookup */
export function buildVertexHarborMap(
  harbors: HarborDefinition[],
): Map<VertexId, HarborType> {
  const map = new Map<VertexId, HarborType>();
  for (const harbor of harbors) {
    for (const vid of harbor.vertices) {
      const existing = map.get(vid);
      // If vertex already has a harbor type, keep the more specific one
      if (!existing || (existing === 'generic' && harbor.type !== 'generic')) {
        map.set(vid, harbor.type);
      }
    }
  }
  return map;
}
