import { describe, it, expect } from 'vitest';
import { buildBoardTopology, findEdge } from '../../engine/board/board-graph';
import { STANDARD_HEX_POSITIONS } from '../../engine/board/hex-coords';

describe('Board Topology', () => {
  const topology = buildBoardTopology(STANDARD_HEX_POSITIONS);

  it('has 19 hexes', () => {
    expect(topology.hexes).toHaveLength(19);
  });

  it('has 54 vertices', () => {
    expect(topology.vertexCount).toBe(54);
    expect(topology.vertexPixelPositions).toHaveLength(54);
  });

  it('has 72 edges', () => {
    expect(topology.edgeCount).toBe(72);
    expect(topology.edgeEndpoints).toHaveLength(72);
  });

  it('every hex has exactly 6 vertices', () => {
    for (let hid = 0; hid < 19; hid++) {
      expect(topology.hexVertices[hid]).toHaveLength(6);
    }
  });

  it('every hex has exactly 6 edges', () => {
    for (let hid = 0; hid < 19; hid++) {
      expect(topology.hexEdges[hid]).toHaveLength(6);
    }
  });

  it('hex vertices are within valid range', () => {
    for (let hid = 0; hid < 19; hid++) {
      for (const vid of topology.hexVertices[hid]) {
        expect(vid).toBeGreaterThanOrEqual(0);
        expect(vid).toBeLessThan(54);
      }
    }
  });

  it('edge endpoints are within valid range', () => {
    for (let eid = 0; eid < 72; eid++) {
      const [v1, v2] = topology.edgeEndpoints[eid];
      expect(v1).toBeGreaterThanOrEqual(0);
      expect(v1).toBeLessThan(54);
      expect(v2).toBeGreaterThanOrEqual(0);
      expect(v2).toBeLessThan(54);
      expect(v1).not.toBe(v2);
    }
  });

  it('vertices have 2 or 3 adjacent vertices (Catan topology)', () => {
    for (let vid = 0; vid < 54; vid++) {
      const count = topology.vertexAdjacentVertices[vid].length;
      expect(count).toBeGreaterThanOrEqual(2);
      expect(count).toBeLessThanOrEqual(3);
    }
  });

  it('vertices have 2 or 3 adjacent edges', () => {
    for (let vid = 0; vid < 54; vid++) {
      const count = topology.vertexAdjacentEdges[vid].length;
      expect(count).toBeGreaterThanOrEqual(2);
      expect(count).toBeLessThanOrEqual(3);
    }
  });

  it('vertices touch 1, 2, or 3 hexes', () => {
    for (let vid = 0; vid < 54; vid++) {
      const count = topology.vertexAdjacentHexes[vid].length;
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(3);
    }
  });

  it('vertex adjacency is symmetric', () => {
    for (let vid = 0; vid < 54; vid++) {
      for (const neighbor of topology.vertexAdjacentVertices[vid]) {
        expect(topology.vertexAdjacentVertices[neighbor]).toContain(vid);
      }
    }
  });

  it('edge endpoints are consistent with vertex adjacency', () => {
    for (let eid = 0; eid < 72; eid++) {
      const [v1, v2] = topology.edgeEndpoints[eid];
      expect(topology.vertexAdjacentVertices[v1]).toContain(v2);
      expect(topology.vertexAdjacentVertices[v2]).toContain(v1);
    }
  });

  it('findEdge returns correct edge IDs', () => {
    for (let eid = 0; eid < 72; eid++) {
      const [v1, v2] = topology.edgeEndpoints[eid];
      expect(findEdge(topology, v1, v2)).toBe(eid);
      expect(findEdge(topology, v2, v1)).toBe(eid);
    }
  });

  it('findEdge returns -1 for non-existent edges', () => {
    // Vertex 0 and a non-adjacent vertex
    const nonAdj = Array.from({ length: 54 }, (_, i) => i)
      .find((v) => !topology.vertexAdjacentVertices[0].includes(v) && v !== 0);
    if (nonAdj !== undefined) {
      expect(findEdge(topology, 0, nonAdj)).toBe(-1);
    }
  });

  it('internal vertices have 3 adjacent hexes, coastal have fewer', () => {
    let internalCount = 0;
    let coastalCount = 0;
    for (let vid = 0; vid < 54; vid++) {
      if (topology.vertexAdjacentHexes[vid].length === 3) {
        internalCount++;
      } else {
        coastalCount++;
      }
    }
    // Standard board: some internal, some coastal
    expect(internalCount).toBeGreaterThan(0);
    expect(coastalCount).toBeGreaterThan(0);
    expect(internalCount + coastalCount).toBe(54);
  });
});
