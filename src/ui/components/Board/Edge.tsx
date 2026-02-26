import type { Point, EdgeRoad } from '@engine/types';
import { PLAYER_COLORS } from '@engine/constants';

interface EdgeProps {
  from: Point;
  to: Point;
  road: EdgeRoad | null;
  isValid: boolean;
  onClick?: () => void;
}

export function Edge({ from, to, road, isValid, onClick }: EdgeProps) {
  if (road) {
    const color = PLAYER_COLORS[road.owner];
    return (
      <g>
        {/* Layer 1: Dark outline */}
        <line
          x1={from.x} y1={from.y}
          x2={to.x} y2={to.y}
          stroke="#1a1a1a"
          strokeWidth={8}
          strokeLinecap="round"
        />
        {/* Layer 2: Player color */}
        <line
          x1={from.x} y1={from.y}
          x2={to.x} y2={to.y}
          stroke={color}
          strokeWidth={5}
          strokeLinecap="round"
        />
        {/* Layer 3: White highlight */}
        <line
          x1={from.x} y1={from.y}
          x2={to.x} y2={to.y}
          stroke="rgba(255,255,255,0.25)"
          strokeWidth={2}
          strokeLinecap="round"
        />
      </g>
    );
  }

  if (isValid) {
    return (
      <g style={{ cursor: 'pointer' }} onClick={onClick}>
        {/* Green glow background */}
        <line
          x1={from.x} y1={from.y}
          x2={to.x} y2={to.y}
          stroke="rgba(39, 174, 96, 0.2)"
          strokeWidth={10}
          strokeLinecap="round"
        />
        {/* Dashed indicator */}
        <line
          x1={from.x} y1={from.y}
          x2={to.x} y2={to.y}
          stroke="rgba(39, 174, 96, 0.5)"
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray="5,5"
        />
        {/* Invisible wider hit area */}
        <line
          x1={from.x} y1={from.y}
          x2={to.x} y2={to.y}
          stroke="transparent"
          strokeWidth={14}
          strokeLinecap="round"
        />
      </g>
    );
  }

  return null;
}
