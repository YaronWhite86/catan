/**
 * Board topology: builds vertex/edge graph from hex layout.
 *
 * Algorithm:
 * 1. For each hex, compute 6 corner pixel positions
 * 2. Deduplicate vertices by epsilon comparison on pixel positions
 * 3. Identify edges as pairs of consecutive vertices per hex, deduplicate by sorted pair
 * 4. Build all adjacency tables
 */

import type { Point } from './hex-coords';
import { hexToPixel, hexCorners, STANDARD_HEX_POSITIONS, pointsEqual, HEX_SIZE } from './hex-coords';
import type { AxialCoord } from './hex-coords';

export type VertexId = number;
export type EdgeId = number;
export type HexId = number;

export interface BoardTopology {
  hexes: HexPosition[];
  vertexCount: number;
  edgeCount: number;
  vertexAdjacentVertices: VertexId[][];
  vertexAdjacentEdges: EdgeId[][];
  vertexAdjacentHexes: HexId[][];
  edgeEndpoints: [VertexId, VertexId][];
  edgeAdjacentEdges: EdgeId[][];
  hexVertices: VertexId[][];
  hexEdges: EdgeId[][];
  vertexPixelPositions: Point[];
  edgePixelPositions: [Point, Point][];
  hexPixelPositions: Point[];
}

export interface HexPosition {
  id: HexId;
  coord: AxialCoord;
  center: Point;
}

/** Build the complete board topology for standard Catan layout */
export function buildBoardTopology(
  hexPositions: readonly AxialCoord[] = STANDARD_HEX_POSITIONS,
  size: number = HEX_SIZE,
): BoardTopology {
  // Step 1: Compute hex centers and corners
  const hexCenters: Point[] = hexPositions.map((h) => hexToPixel(h, size));
  const hexes: HexPosition[] = hexPositions.map((coord, id) => ({
    id,
    coord,
    center: hexCenters[id],
  }));

  // Step 2: Compute all corners and deduplicate vertices
  const vertexPixelPositions: Point[] = [];
  const hexCornerVertexIds: number[][] = []; // [hexId][cornerIdx] => vertexId

  for (let hid = 0; hid < hexes.length; hid++) {
    const corners = hexCorners(hexCenters[hid], size);
    const vertexIds: number[] = [];

    for (const corner of corners) {
      let existingId = -1;
      for (let vid = 0; vid < vertexPixelPositions.length; vid++) {
        if (pointsEqual(vertexPixelPositions[vid], corner)) {
          existingId = vid;
          break;
        }
      }

      if (existingId >= 0) {
        vertexIds.push(existingId);
      } else {
        vertexIds.push(vertexPixelPositions.length);
        vertexPixelPositions.push(corner);
      }
    }

    hexCornerVertexIds.push(vertexIds);
  }

  const vertexCount = vertexPixelPositions.length;

  // Step 3: Identify edges (consecutive vertex pairs per hex) and deduplicate
  const edgeEndpoints: [VertexId, VertexId][] = [];
  const edgeMap = new Map<string, EdgeId>(); // "min,max" => edgeId
  const hexEdgeIds: number[][] = [];

  for (let hid = 0; hid < hexes.length; hid++) {
    const vids = hexCornerVertexIds[hid];
    const edgeIds: number[] = [];

    for (let i = 0; i < 6; i++) {
      const v1 = vids[i];
      const v2 = vids[(i + 1) % 6];
      const key = `${Math.min(v1, v2)},${Math.max(v1, v2)}`;

      let eid = edgeMap.get(key);
      if (eid === undefined) {
        eid = edgeEndpoints.length;
        edgeMap.set(key, eid);
        edgeEndpoints.push([Math.min(v1, v2), Math.max(v1, v2)]);
      }

      edgeIds.push(eid);
    }

    hexEdgeIds.push(edgeIds);
  }

  const edgeCount = edgeEndpoints.length;

  // Step 4: Build adjacency tables

  // hexVertices: [hid] => 6 vertex IDs (already computed)
  const hexVertices = hexCornerVertexIds;
  const hexEdges = hexEdgeIds;

  // vertexAdjacentHexes
  const vertexAdjacentHexes: HexId[][] = Array.from({ length: vertexCount }, () => []);
  for (let hid = 0; hid < hexes.length; hid++) {
    for (const vid of hexVertices[hid]) {
      if (!vertexAdjacentHexes[vid].includes(hid)) {
        vertexAdjacentHexes[vid].push(hid);
      }
    }
  }

  // vertexAdjacentEdges
  const vertexAdjacentEdges: EdgeId[][] = Array.from({ length: vertexCount }, () => []);
  for (let eid = 0; eid < edgeCount; eid++) {
    const [v1, v2] = edgeEndpoints[eid];
    vertexAdjacentEdges[v1].push(eid);
    vertexAdjacentEdges[v2].push(eid);
  }

  // vertexAdjacentVertices (neighbors connected by edge)
  const vertexAdjacentVertices: VertexId[][] = Array.from({ length: vertexCount }, () => []);
  for (const [v1, v2] of edgeEndpoints) {
    if (!vertexAdjacentVertices[v1].includes(v2)) {
      vertexAdjacentVertices[v1].push(v2);
    }
    if (!vertexAdjacentVertices[v2].includes(v1)) {
      vertexAdjacentVertices[v2].push(v1);
    }
  }

  // edgeAdjacentEdges (edges sharing a vertex)
  const edgeAdjacentEdges: EdgeId[][] = Array.from({ length: edgeCount }, () => []);
  for (let eid = 0; eid < edgeCount; eid++) {
    const [v1, v2] = edgeEndpoints[eid];
    for (const adjEid of vertexAdjacentEdges[v1]) {
      if (adjEid !== eid && !edgeAdjacentEdges[eid].includes(adjEid)) {
        edgeAdjacentEdges[eid].push(adjEid);
      }
    }
    for (const adjEid of vertexAdjacentEdges[v2]) {
      if (adjEid !== eid && !edgeAdjacentEdges[eid].includes(adjEid)) {
        edgeAdjacentEdges[eid].push(adjEid);
      }
    }
  }

  // Edge pixel positions (midpoint info for rendering)
  const edgePixelPositions: [Point, Point][] = edgeEndpoints.map(([v1, v2]) => [
    vertexPixelPositions[v1],
    vertexPixelPositions[v2],
  ]);

  return {
    hexes,
    vertexCount,
    edgeCount,
    vertexAdjacentVertices,
    vertexAdjacentEdges,
    vertexAdjacentHexes,
    edgeEndpoints,
    edgeAdjacentEdges,
    hexVertices,
    hexEdges,
    vertexPixelPositions,
    edgePixelPositions,
    hexPixelPositions: hexCenters,
  };
}

/** Find the edge ID connecting two vertices, or -1 if none */
export function findEdge(
  topology: BoardTopology,
  v1: VertexId,
  v2: VertexId,
): EdgeId {
  const key1 = Math.min(v1, v2);
  const key2 = Math.max(v1, v2);
  for (let eid = 0; eid < topology.edgeCount; eid++) {
    const [a, b] = topology.edgeEndpoints[eid];
    if (a === key1 && b === key2) return eid;
  }
  return -1;
}
