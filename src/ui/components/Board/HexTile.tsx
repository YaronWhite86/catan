import type { HexTile as HexTileType, Point, TerrainType } from '@engine/types';
import { hexCorners, HEX_SIZE } from '@engine/board/hex-coords';

interface HexTileProps {
  hex: HexTileType;
  center: Point;
  hasRobber: boolean;
}

export function HexTile({ hex, center, hasRobber }: HexTileProps) {
  const corners = hexCorners(center, HEX_SIZE);
  const points = corners.map((c) => `${c.x},${c.y}`).join(' ');
  const isRedNumber = hex.numberToken === 6 || hex.numberToken === 8;

  return (
    <g>
      <polygon
        points={points}
        fill={`url(#grad-${hex.terrain})`}
        filter="url(#hex-inner-shadow)"
        stroke="#4a3520"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <TerrainDecoration terrain={hex.terrain} cx={center.x} cy={center.y} />
      {hex.numberToken !== null && !hasRobber && (
        <NumberToken cx={center.x} cy={center.y} num={hex.numberToken} isRed={isRedNumber} />
      )}
      {hasRobber && <Robber cx={center.x} cy={center.y} />}
    </g>
  );
}

// ─── Number Token ──────────────────────────────────

function NumberToken({ cx, cy, num, isRed }: { cx: number; cy: number; num: number; isRed: boolean }) {
  const dots = getProbabilityDotCount(num);
  const dotSpacing = 4;
  const dotsWidth = (dots - 1) * dotSpacing;
  const dotStartX = cx - dotsWidth / 2;

  return (
    <g>
      {/* Shadow beneath token */}
      <circle cx={cx + 0.5} cy={cy + 1} r={16} fill="rgba(0,0,0,0.2)" />
      {/* Token body */}
      <circle cx={cx} cy={cy} r={16} fill="url(#grad-token)" filter="url(#token-emboss)" />
      {/* Inner highlight ring */}
      <circle cx={cx} cy={cy} r={14} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={0.5} />
      {/* Number */}
      <text
        x={cx}
        y={cy + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize={isRed ? 16 : (num >= 10 ? 12 : 14)}
        fontWeight="bold"
        fill={isRed ? '#c0392b' : '#2c3e50'}
      >
        {num}
      </text>
      {/* Probability dots */}
      {Array.from({ length: dots }, (_, i) => (
        <circle
          key={i}
          cx={dotStartX + i * dotSpacing}
          cy={cy + 11}
          r={1.2}
          fill={isRed ? '#c0392b' : '#7f8c8d'}
        />
      ))}
    </g>
  );
}

function getProbabilityDotCount(num: number): number {
  const pips: Record<number, number> = {
    2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1,
  };
  return pips[num] ?? 0;
}

// ─── Robber ────────────────────────────────────────

function Robber({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g filter="url(#drop-shadow-lg)">
      {/* Semi-transparent backdrop */}
      <circle cx={cx} cy={cy} r={18} fill="rgba(0,0,0,0.35)" />
      {/* Cloaked figure */}
      <g transform={`translate(${cx},${cy - 2})`}>
        {/* Body / cloak */}
        <path
          d="M0,-11 C-4,-11 -7,-8 -8,-4 L-9,8 C-9,10 -7,12 -5,12 L5,12 C7,12 9,10 9,8 L8,-4 C7,-8 4,-11 0,-11Z"
          fill="#1a1a1a"
        />
        {/* Hood */}
        <path
          d="M0,-13 C-6,-13 -9,-9 -9,-5 C-9,-2 -6,0 0,0 C6,0 9,-2 9,-5 C9,-9 6,-13 0,-13Z"
          fill="#2a2a2a"
        />
        {/* Face shadow */}
        <ellipse cx={0} cy={-5} rx={5} ry={4} fill="#111" />
        {/* Eyes */}
        <circle cx={-2.5} cy={-5.5} r={1} fill="#cc3333" />
        <circle cx={2.5} cy={-5.5} r={1} fill="#cc3333" />
      </g>
    </g>
  );
}

// ─── Terrain Decorations ───────────────────────────

function TerrainDecoration({ terrain, cx, cy }: { terrain: TerrainType; cx: number; cy: number }) {
  switch (terrain) {
    case 'forest': return <ForestDecoration cx={cx} cy={cy} />;
    case 'hills': return <HillsDecoration cx={cx} cy={cy} />;
    case 'pasture': return <PastureDecoration cx={cx} cy={cy} />;
    case 'fields': return <FieldsDecoration cx={cx} cy={cy} />;
    case 'mountains': return <MountainsDecoration cx={cx} cy={cy} />;
    case 'desert': return <DesertDecoration cx={cx} cy={cy} />;
  }
}

function ForestDecoration({ cx, cy }: { cx: number; cy: number }) {
  // 3 evergreen trees with trunks
  const trees = [
    { x: cx - 14, y: cy - 10 },
    { x: cx + 2, y: cy - 16 },
    { x: cx + 12, y: cy - 8 },
  ];
  return (
    <g opacity={0.3}>
      {trees.map((t, i) => (
        <g key={i}>
          <rect x={t.x - 1} y={t.y + 8} width={2} height={5} fill="#3d2a12" />
          <polygon points={`${t.x},${t.y - 6} ${t.x + 7},${t.y + 8} ${t.x - 7},${t.y + 8}`} fill="#1a5c1a" />
          <polygon points={`${t.x},${t.y - 2} ${t.x + 5},${t.y + 5} ${t.x - 5},${t.y + 5}`} fill="#227722" />
        </g>
      ))}
    </g>
  );
}

function HillsDecoration({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g opacity={0.25}>
      {/* Two overlapping hills */}
      <ellipse cx={cx - 8} cy={cy - 6} rx={16} ry={10} fill="#9e4420" />
      <ellipse cx={cx + 10} cy={cy - 4} rx={14} ry={9} fill="#b05028" />
      {/* Brick-pattern lines */}
      <line x1={cx - 18} y1={cy - 6} x2={cx - 2} y2={cy - 6} stroke="#6a2e14" strokeWidth={0.8} />
      <line x1={cx - 14} y1={cy - 2} x2={cx + 2} y2={cy - 2} stroke="#6a2e14" strokeWidth={0.8} />
      <line x1={cx + 2} y1={cy - 4} x2={cx + 20} y2={cy - 4} stroke="#6a2e14" strokeWidth={0.8} />
    </g>
  );
}

function PastureDecoration({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g opacity={0.3}>
      {/* Grass tufts */}
      <path d={`M${cx - 18},${cy - 4} Q${cx - 16},${cy - 10} ${cx - 14},${cy - 4}`} fill="none" stroke="#3a8a28" strokeWidth={1.2} />
      <path d={`M${cx - 16},${cy - 4} Q${cx - 14},${cy - 9} ${cx - 12},${cy - 4}`} fill="none" stroke="#3a8a28" strokeWidth={1.2} />
      <path d={`M${cx + 12},${cy - 6} Q${cx + 14},${cy - 12} ${cx + 16},${cy - 6}`} fill="none" stroke="#3a8a28" strokeWidth={1.2} />
      <path d={`M${cx + 14},${cy - 6} Q${cx + 16},${cy - 11} ${cx + 18},${cy - 6}`} fill="none" stroke="#3a8a28" strokeWidth={1.2} />
      {/* Small sheep silhouette */}
      <g transform={`translate(${cx - 2},${cy - 10})`}>
        {/* Fluffy body */}
        <ellipse cx={0} cy={0} rx={6} ry={4} fill="#e8e8e0" />
        {/* Head */}
        <circle cx={-5.5} cy={-1.5} r={2.2} fill="#444" />
        {/* Legs */}
        <line x1={-3} y1={3.5} x2={-3} y2={7} stroke="#444" strokeWidth={1} />
        <line x1={3} y1={3.5} x2={3} y2={7} stroke="#444" strokeWidth={1} />
      </g>
    </g>
  );
}

function FieldsDecoration({ cx, cy }: { cx: number; cy: number }) {
  // 3 wheat stalks
  const stalks = [
    { x: cx - 10, y: cy - 6 },
    { x: cx, y: cy - 10 },
    { x: cx + 10, y: cy - 6 },
  ];
  return (
    <g opacity={0.3}>
      {stalks.map((s, i) => (
        <g key={i}>
          {/* Stalk */}
          <line x1={s.x} y1={s.y + 12} x2={s.x} y2={s.y - 4} stroke="#8a6a10" strokeWidth={1} />
          {/* Grain kernels */}
          <ellipse cx={s.x - 2} cy={s.y - 2} rx={1.5} ry={3} fill="#c89e20" transform={`rotate(-15,${s.x - 2},${s.y - 2})`} />
          <ellipse cx={s.x + 2} cy={s.y - 2} rx={1.5} ry={3} fill="#c89e20" transform={`rotate(15,${s.x + 2},${s.y - 2})`} />
          <ellipse cx={s.x} cy={s.y - 5} rx={1.3} ry={2.8} fill="#c89e20" />
        </g>
      ))}
    </g>
  );
}

function MountainsDecoration({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g opacity={0.3}>
      {/* Back peak */}
      <polygon points={`${cx + 6},${cy - 20} ${cx + 22},${cy} ${cx - 10},${cy}`} fill="#555e68" />
      {/* Snow cap back */}
      <polygon points={`${cx + 6},${cy - 20} ${cx + 10},${cy - 14} ${cx + 2},${cy - 14}`} fill="#e8e8f0" />
      {/* Front peak */}
      <polygon points={`${cx - 8},${cy - 16} ${cx + 10},${cy + 2} ${cx - 26},${cy + 2}`} fill="#6a7580" />
      {/* Snow cap front */}
      <polygon points={`${cx - 8},${cy - 16} ${cx - 4},${cy - 10} ${cx - 12},${cy - 10}`} fill="#f0f0f8" />
    </g>
  );
}

function DesertDecoration({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g opacity={0.28}>
      {/* Dune curves */}
      <path
        d={`M${cx - 22},${cy - 2} Q${cx - 10},${cy - 10} ${cx},${cy - 4} Q${cx + 10},${cy + 2} ${cx + 22},${cy - 4}`}
        fill="none" stroke="#b8a060" strokeWidth={1.5}
      />
      <path
        d={`M${cx - 18},${cy + 4} Q${cx - 6},${cy - 2} ${cx + 6},${cy + 2} Q${cx + 14},${cy + 6} ${cx + 20},${cy + 2}`}
        fill="none" stroke="#b8a060" strokeWidth={1}
      />
      {/* Small cactus */}
      <g transform={`translate(${cx + 4},${cy - 10})`}>
        <rect x={-1.5} y={0} width={3} height={10} rx={1.5} fill="#5a8a38" />
        <rect x={-6} y={2} width={4.5} height={3} rx={1.5} fill="#5a8a38" />
        <rect x={-6} y={-1} width={3} height={3} rx={1.5} fill="#5a8a38" />
        <rect x={3} y={3} width={5} height={3} rx={1.5} fill="#5a8a38" />
        <rect x={5} y={0} width={3} height={3} rx={1.5} fill="#5a8a38" />
      </g>
    </g>
  );
}
