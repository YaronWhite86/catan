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
    return (
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke={PLAYER_COLORS[road.owner]}
        strokeWidth={5}
        strokeLinecap="round"
      />
    );
  }

  if (isValid) {
    // Clickable area for placing roads
    return (
      <g style={{ cursor: 'pointer' }} onClick={onClick}>
        <line
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={to.y}
          stroke="rgba(39, 174, 96, 0.5)"
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray="5,5"
        />
        {/* Invisible wider hit area */}
        <line
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={to.y}
          stroke="transparent"
          strokeWidth={14}
          strokeLinecap="round"
        />
      </g>
    );
  }

  return null;
}
