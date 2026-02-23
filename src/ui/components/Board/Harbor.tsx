import type { HarborDefinition, Point } from '@engine/types';

interface HarborProps {
  harbor: HarborDefinition;
  vertexPositions: Point[];
}

export function Harbor({ harbor, vertexPositions }: HarborProps) {
  const [v1, v2] = harbor.vertices;
  const p1 = vertexPositions[v1];
  const p2 = vertexPositions[v2];
  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;

  // Push the label away from center
  const boardCenterX = 0;
  const boardCenterY = 0;
  const dx = midX - boardCenterX;
  const dy = midY - boardCenterY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const offset = 20;
  const labelX = midX + (dx / dist) * offset;
  const labelY = midY + (dy / dist) * offset;

  const label = harbor.type === 'generic' ? '3:1' : `2:1 ${harbor.type}`;

  return (
    <g>
      <line
        x1={p1.x}
        y1={p1.y}
        x2={p2.x}
        y2={p2.y}
        stroke="#8b7355"
        strokeWidth={3}
        strokeLinecap="round"
      />
      <rect
        x={labelX - 22}
        y={labelY - 8}
        width={44}
        height={16}
        rx={3}
        fill="rgba(250, 240, 220, 0.9)"
        stroke="#8b7355"
        strokeWidth={1}
      />
      <text
        x={labelX}
        y={labelY + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={9}
        fontWeight="bold"
        fill="#5a4320"
      >
        {label}
      </text>
    </g>
  );
}
