import type { Point, VertexBuilding, PlayerId } from '@engine/types';
import { PLAYER_COLORS } from '@engine/constants';

interface VertexProps {
  position: Point;
  building: VertexBuilding | null;
  isValid: boolean;
  onClick?: () => void;
}

export function Vertex({ position, building, isValid, onClick }: VertexProps) {
  const { x, y } = position;

  if (building) {
    if (building.type === 'city') {
      return (
        <g style={{ cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
          <CityShape x={x} y={y} owner={building.owner} />
        </g>
      );
    }
    return (
      <g style={{ cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
        <SettlementShape x={x} y={y} owner={building.owner} />
      </g>
    );
  }

  if (isValid) {
    return (
      <g style={{ cursor: 'pointer' }} onClick={onClick}>
        {/* Outer glow */}
        <circle cx={x} cy={y} r={10} fill="rgba(39,174,96,0.15)" stroke="none" />
        {/* Inner dashed indicator */}
        <circle
          cx={x}
          cy={y}
          r={7}
          fill="rgba(255,255,255,0.5)"
          stroke="#27ae60"
          strokeWidth={2}
          strokeDasharray="3,3"
        />
      </g>
    );
  }

  return null;
}

// ─── Settlement Shape ──────────────────────────────

function SettlementShape({ x, y, owner }: { x: number; y: number; owner: PlayerId }) {
  const color = PLAYER_COLORS[owner];
  // House: ~14x14, centered at (x, y)
  // Roof peak at top, walls, door and window
  return (
    <g filter="url(#drop-shadow-sm)">
      {/* House body + roof */}
      <path
        d={`M${x},${y - 9} L${x + 8},${y - 2} L${x + 8},${y + 7} L${x - 8},${y + 7} L${x - 8},${y - 2} Z`}
        fill={`url(#player-grad-${owner})`}
        stroke="#1a1a1a"
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      {/* Roofline accent */}
      <line
        x1={x - 8} y1={y - 2}
        x2={x + 8} y2={y - 2}
        stroke={color}
        strokeWidth={0.8}
        opacity={0.5}
      />
      {/* Door */}
      <rect x={x - 2} y={y + 1} width={4} height={6} rx={1} fill="#1a1a1a" opacity={0.4} />
      {/* Window */}
      <circle cx={x + 4} cy={y + 1} r={1.8} fill="#1a1a1a" opacity={0.3} />
    </g>
  );
}

// ─── City Shape ────────────────────────────────────

function CityShape({ x, y, owner }: { x: number; y: number; owner: PlayerId }) {
  const color = PLAYER_COLORS[owner];
  // Castle: two towers + central body, ~20x20
  return (
    <g filter="url(#drop-shadow-lg)">
      {/* Left tower */}
      <path
        d={`M${x - 10},${y - 10} L${x - 6},${y - 14} L${x - 2},${y - 10} L${x - 2},${y + 8} L${x - 10},${y + 8} Z`}
        fill={`url(#player-grad-${owner})`}
        stroke="#1a1a1a"
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      {/* Right tower */}
      <path
        d={`M${x + 2},${y - 10} L${x + 6},${y - 14} L${x + 10},${y - 10} L${x + 10},${y + 8} L${x + 2},${y + 8} Z`}
        fill={`url(#player-grad-${owner})`}
        stroke="#1a1a1a"
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      {/* Central body */}
      <rect
        x={x - 2} y={y - 6}
        width={4} height={14}
        fill={`url(#player-grad-${owner})`}
        stroke="#1a1a1a"
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      {/* Horizontal roofline accent */}
      <line
        x1={x - 10} y1={y - 10}
        x2={x + 10} y2={y - 10}
        stroke={color}
        strokeWidth={0.8}
        opacity={0.5}
      />
      {/* Tower windows */}
      <circle cx={x - 6} cy={y - 3} r={1.5} fill="#1a1a1a" opacity={0.3} />
      <circle cx={x + 6} cy={y - 3} r={1.5} fill="#1a1a1a" opacity={0.3} />
      {/* Arched gate */}
      <path
        d={`M${x - 2},${y + 8} L${x - 2},${y + 3} A2,2 0 0,1 ${x + 2},${y + 3} L${x + 2},${y + 8}`}
        fill="#1a1a1a"
        opacity={0.4}
      />
    </g>
  );
}
