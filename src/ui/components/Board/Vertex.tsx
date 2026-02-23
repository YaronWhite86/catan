import type { Point, VertexBuilding } from '@engine/types';
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
    const color = PLAYER_COLORS[building.owner];
    if (building.type === 'city') {
      // City: larger square
      return (
        <rect
          x={x - 8}
          y={y - 8}
          width={16}
          height={16}
          fill={color}
          stroke="#2c3e50"
          strokeWidth={1.5}
          style={{ cursor: onClick ? 'pointer' : 'default' }}
          onClick={onClick}
        />
      );
    }
    // Settlement: small house shape
    return (
      <polygon
        points={`${x},${y - 8} ${x + 7},${y - 2} ${x + 7},${y + 6} ${x - 7},${y + 6} ${x - 7},${y - 2}`}
        fill={color}
        stroke="#2c3e50"
        strokeWidth={1.5}
        style={{ cursor: onClick ? 'pointer' : 'default' }}
        onClick={onClick}
      />
    );
  }

  if (isValid) {
    return (
      <circle
        cx={x}
        cy={y}
        r={8}
        fill="rgba(255,255,255,0.5)"
        stroke="#27ae60"
        strokeWidth={2}
        strokeDasharray="3,3"
        style={{ cursor: 'pointer' }}
        onClick={onClick}
      />
    );
  }

  // Empty, non-interactive vertex: no rendering
  return null;
}
