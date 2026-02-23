import type { HexTile as HexTileType, Point } from '@engine/types';
import { hexCorners, HEX_SIZE } from '@engine/board/hex-coords';
import { TERRAIN_COLORS } from '@engine/constants';

interface HexTileProps {
  hex: HexTileType;
  center: Point;
  hasRobber: boolean;
}

export function HexTile({ hex, center, hasRobber }: HexTileProps) {
  const corners = hexCorners(center, HEX_SIZE);
  const points = corners.map((c) => `${c.x},${c.y}`).join(' ');
  const color = TERRAIN_COLORS[hex.terrain];
  const isRedNumber = hex.numberToken === 6 || hex.numberToken === 8;

  return (
    <g>
      <polygon
        points={points}
        fill={color}
        stroke="#5a4320"
        strokeWidth={2}
      />
      {hex.numberToken !== null && (
        <g>
          <circle cx={center.x} cy={center.y} r={14} fill="#faf0dc" stroke="#5a4320" strokeWidth={1} />
          <text
            x={center.x}
            y={center.y + 1}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={hex.numberToken >= 10 ? 11 : 13}
            fontWeight="bold"
            fill={isRedNumber ? '#c0392b' : '#2c3e50'}
          >
            {hex.numberToken}
          </text>
          {/* Dots indicating probability */}
          <text
            x={center.x}
            y={center.y + 12}
            textAnchor="middle"
            fontSize={6}
            fill={isRedNumber ? '#c0392b' : '#7f8c8d'}
          >
            {getProbabilityDots(hex.numberToken)}
          </text>
        </g>
      )}
      {hasRobber && (
        <g>
          <circle cx={center.x} cy={center.y} r={12} fill="rgba(0,0,0,0.7)" />
          <text
            x={center.x}
            y={center.y + 1}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={14}
            fill="white"
          >
            R
          </text>
        </g>
      )}
    </g>
  );
}

function getProbabilityDots(num: number): string {
  const pips: Record<number, number> = {
    2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1,
  };
  return '\u2022'.repeat(pips[num] ?? 0);
}
