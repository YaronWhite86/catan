/**
 * Axial coordinate math for pointy-top hexagonal grid.
 *
 * Axial coordinates use (q, r) where:
 * - q increases to the right
 * - r increases downward-right
 * - The implicit s = -q - r (cube coordinate constraint)
 */

export interface AxialCoord {
  readonly q: number;
  readonly r: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Hex size (distance from center to corner) */
export const HEX_SIZE = 50;

/** Convert axial (q, r) to pixel center (pointy-top orientation) */
export function hexToPixel(hex: AxialCoord, size: number = HEX_SIZE): Point {
  const x = size * (Math.sqrt(3) * hex.q + (Math.sqrt(3) / 2) * hex.r);
  const y = size * ((3 / 2) * hex.r);
  return { x, y };
}

/** Pixel position of hex corner i (0..5), pointy-top, starting at top */
export function hexCorner(center: Point, size: number, i: number): Point {
  const angleDeg = 60 * i - 30;
  const angleRad = (Math.PI / 180) * angleDeg;
  return {
    x: center.x + size * Math.cos(angleRad),
    y: center.y + size * Math.sin(angleRad),
  };
}

/** All 6 corner positions of a hex */
export function hexCorners(center: Point, size: number = HEX_SIZE): Point[] {
  return [0, 1, 2, 3, 4, 5].map((i) => hexCorner(center, size, i));
}

/** The 6 axial neighbor directions */
export const AXIAL_DIRECTIONS: readonly AxialCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

/** Get axial neighbor in direction i (0..5) */
export function hexNeighbor(hex: AxialCoord, direction: number): AxialCoord {
  const d = AXIAL_DIRECTIONS[direction];
  return { q: hex.q + d.q, r: hex.r + d.r };
}

/** All 6 neighbors of a hex */
export function hexNeighbors(hex: AxialCoord): AxialCoord[] {
  return AXIAL_DIRECTIONS.map((d) => ({ q: hex.q + d.q, r: hex.r + d.r }));
}

/** Hex distance in axial coordinates */
export function hexDistance(a: AxialCoord, b: AxialCoord): number {
  return (
    (Math.abs(a.q - b.q) +
      Math.abs(a.q + a.r - b.q - b.r) +
      Math.abs(a.r - b.r)) /
    2
  );
}

/** Standard Catan board hex positions (19 hexes) in axial coordinates */
export const STANDARD_HEX_POSITIONS: readonly AxialCoord[] = [
  // Top row (3 hexes): r = -2
  { q: 0, r: -2 },
  { q: 1, r: -2 },
  { q: 2, r: -2 },
  // Second row (4 hexes): r = -1
  { q: -1, r: -1 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
  { q: 2, r: -1 },
  // Middle row (5 hexes): r = 0
  { q: -2, r: 0 },
  { q: -1, r: 0 },
  { q: 0, r: 0 },
  { q: 1, r: 0 },
  { q: 2, r: 0 },
  // Fourth row (4 hexes): r = 1
  { q: -2, r: 1 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
  { q: 1, r: 1 },
  // Bottom row (3 hexes): r = 2
  { q: -2, r: 2 },
  { q: -1, r: 2 },
  { q: 0, r: 2 },
];

/** Check if two points are approximately equal */
export function pointsEqual(a: Point, b: Point, epsilon: number = 0.01): boolean {
  return Math.abs(a.x - b.x) < epsilon && Math.abs(a.y - b.y) < epsilon;
}
