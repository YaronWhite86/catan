import type { GameState, VertexId, EdgeId, HexId } from '@engine/types';
import { HexTile } from './HexTile';
import { Vertex } from './Vertex';
import { Edge } from './Edge';
import { Harbor } from './Harbor';
import { TERRAIN_GRADIENT_STOPS, PLAYER_GRADIENT_STOPS } from './board-theme';

interface BoardSVGProps {
  state: GameState;
  validVertices: Set<VertexId>;
  validEdges: Set<EdgeId>;
  validHexes: Set<HexId>;
  onVertexClick?: (vid: VertexId) => void;
  onEdgeClick?: (eid: EdgeId) => void;
  onHexClick?: (hid: HexId) => void;
}

function BoardDefs() {
  return (
    <defs>
      {/* ── Filters ── */}
      <filter id="drop-shadow-sm" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodColor="#000" floodOpacity="0.35" />
      </filter>
      <filter id="drop-shadow-lg" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#000" floodOpacity="0.45" />
      </filter>
      <filter id="token-emboss" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="-0.5" stdDeviation="0.4" floodColor="#fff" floodOpacity="0.6" />
        <feDropShadow dx="0" dy="0.8" stdDeviation="0.6" floodColor="#000" floodOpacity="0.25" />
      </filter>
      <filter id="hex-inner-shadow" x="-5%" y="-5%" width="110%" height="110%">
        <feComponentTransfer in="SourceAlpha">
          <feFuncA type="table" tableValues="1 0" />
        </feComponentTransfer>
        <feGaussianBlur stdDeviation="3" />
        <feOffset dx="0" dy="1" result="shadow" />
        <feFlood floodColor="#000" floodOpacity="0.15" result="color" />
        <feComposite in="color" in2="shadow" operator="in" result="innerShadow" />
        <feComposite in="SourceGraphic" in2="innerShadow" operator="over" />
      </filter>

      {/* ── Terrain Gradients ── */}
      {(Object.entries(TERRAIN_GRADIENT_STOPS) as [string, { light: string; mid: string; dark: string }][]).map(
        ([terrain, stops]) => (
          <radialGradient key={terrain} id={`grad-${terrain}`} cx="40%" cy="35%" r="65%">
            <stop offset="0%" stopColor={stops.light} />
            <stop offset="50%" stopColor={stops.mid} />
            <stop offset="100%" stopColor={stops.dark} />
          </radialGradient>
        ),
      )}

      {/* ── Player Gradients ── */}
      {PLAYER_GRADIENT_STOPS.map((stops, i) => (
        <linearGradient key={i} id={`player-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stops.light} />
          <stop offset="100%" stopColor={stops.dark} />
        </linearGradient>
      ))}

      {/* ── Token Gradient ── */}
      <radialGradient id="grad-token" cx="40%" cy="35%" r="60%">
        <stop offset="0%" stopColor="#fff8e8" />
        <stop offset="100%" stopColor="#e8d8b0" />
      </radialGradient>
    </defs>
  );
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
      <BoardDefs />

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
