import type { GameState, VertexId, EdgeId, HexId } from '@engine/types';
import { HexTile } from './HexTile';
import { Vertex } from './Vertex';
import { Edge } from './Edge';
import { Harbor } from './Harbor';

interface BoardSVGProps {
  state: GameState;
  validVertices: Set<VertexId>;
  validEdges: Set<EdgeId>;
  validHexes: Set<HexId>;
  onVertexClick?: (vid: VertexId) => void;
  onEdgeClick?: (eid: EdgeId) => void;
  onHexClick?: (hid: HexId) => void;
}

export function BoardSVG({
  state,
  validVertices,
  validEdges,
  validHexes,
  onVertexClick,
  onEdgeClick,
  onHexClick,
}: BoardSVGProps) {
  const { topology, hexTiles, vertexBuildings, edgeRoads, harbors, robberHex } = state;

  // Compute viewBox from vertex positions
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pos of topology.vertexPixelPositions) {
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x);
    maxY = Math.max(maxY, pos.y);
  }
  const padding = 60;
  const vbX = minX - padding;
  const vbY = minY - padding;
  const vbW = maxX - minX + padding * 2;
  const vbH = maxY - minY + padding * 2;

  return (
    <svg
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      style={{ width: '100%', height: 'auto', display: 'block', margin: '0 auto' }}
    >
      {/* Ocean background */}
      <rect x={vbX} y={vbY} width={vbW} height={vbH} fill="#2980b9" rx={8} />

      {/* Harbors (behind hexes) */}
      {harbors.map((harbor, i) => (
        <Harbor
          key={`harbor-${i}`}
          harbor={harbor}
          vertexPositions={topology.vertexPixelPositions}
        />
      ))}

      {/* Hex tiles */}
      {hexTiles.map((hex) => (
        <g
          key={`hex-${hex.id}`}
          onClick={() => validHexes.has(hex.id) && onHexClick?.(hex.id)}
          style={{ cursor: validHexes.has(hex.id) ? 'pointer' : 'default' }}
        >
          <HexTile
            hex={hex}
            center={topology.hexPixelPositions[hex.id]}
            hasRobber={hex.id === robberHex}
          />
          {validHexes.has(hex.id) && (
            <circle
              cx={topology.hexPixelPositions[hex.id].x}
              cy={topology.hexPixelPositions[hex.id].y}
              r={20}
              fill="rgba(231, 76, 60, 0.3)"
              stroke="#e74c3c"
              strokeWidth={2}
              strokeDasharray="4,4"
            />
          )}
        </g>
      ))}

      {/* Edges / Roads */}
      {Array.from({ length: topology.edgeCount }, (_, eid) => {
        const [p1, p2] = topology.edgePixelPositions[eid];
        return (
          <Edge
            key={`edge-${eid}`}
            from={p1}
            to={p2}
            road={edgeRoads[eid]}
            isValid={validEdges.has(eid)}
            onClick={() => onEdgeClick?.(eid)}
          />
        );
      })}

      {/* Vertices / Buildings */}
      {Array.from({ length: topology.vertexCount }, (_, vid) => (
        <Vertex
          key={`vertex-${vid}`}
          position={topology.vertexPixelPositions[vid]}
          building={vertexBuildings[vid]}
          isValid={validVertices.has(vid)}
          onClick={() => onVertexClick?.(vid)}
        />
      ))}
    </svg>
  );
}
