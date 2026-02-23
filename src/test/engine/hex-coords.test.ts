import { describe, it, expect } from 'vitest';
import {
  hexToPixel,
  hexCorner,
  hexCorners,
  hexNeighbor,
  hexNeighbors,
  hexDistance,
  STANDARD_HEX_POSITIONS,
  pointsEqual,
  HEX_SIZE,
} from '../../engine/board/hex-coords';

describe('hexToPixel', () => {
  it('converts origin to (0, 0)', () => {
    const p = hexToPixel({ q: 0, r: 0 });
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
  });

  it('converts (1, 0) correctly', () => {
    const p = hexToPixel({ q: 1, r: 0 });
    expect(p.x).toBeCloseTo(Math.sqrt(3) * HEX_SIZE);
    expect(p.y).toBeCloseTo(0);
  });

  it('converts (0, 1) correctly', () => {
    const p = hexToPixel({ q: 0, r: 1 });
    expect(p.x).toBeCloseTo((Math.sqrt(3) / 2) * HEX_SIZE);
    expect(p.y).toBeCloseTo(1.5 * HEX_SIZE);
  });
});

describe('hexCorner', () => {
  it('returns 6 distinct corners', () => {
    const center = { x: 0, y: 0 };
    const corners = hexCorners(center, HEX_SIZE);
    expect(corners).toHaveLength(6);

    // All corners should be at distance HEX_SIZE from center
    for (const c of corners) {
      const dist = Math.sqrt(c.x * c.x + c.y * c.y);
      expect(dist).toBeCloseTo(HEX_SIZE);
    }
  });

  it('first corner (i=0) is at 30 degrees clockwise from top for pointy-top', () => {
    const center = { x: 0, y: 0 };
    const c = hexCorner(center, HEX_SIZE, 0);
    // angle = 60*0 - 30 = -30 deg
    expect(c.x).toBeCloseTo(HEX_SIZE * Math.cos((-30 * Math.PI) / 180));
    expect(c.y).toBeCloseTo(HEX_SIZE * Math.sin((-30 * Math.PI) / 180));
  });
});

describe('hexNeighbors', () => {
  it('returns 6 neighbors', () => {
    const neighbors = hexNeighbors({ q: 0, r: 0 });
    expect(neighbors).toHaveLength(6);
  });

  it('neighbor direction 0 is (1, 0)', () => {
    const n = hexNeighbor({ q: 0, r: 0 }, 0);
    expect(n).toEqual({ q: 1, r: 0 });
  });
});

describe('hexDistance', () => {
  it('distance from origin to itself is 0', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: 0 })).toBe(0);
  });

  it('distance to immediate neighbor is 1', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 1, r: 0 })).toBe(1);
    expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: 1 })).toBe(1);
    expect(hexDistance({ q: 0, r: 0 }, { q: -1, r: 1 })).toBe(1);
  });

  it('distance across board is correct', () => {
    expect(hexDistance({ q: -2, r: 0 }, { q: 2, r: 0 })).toBe(4);
    expect(hexDistance({ q: 0, r: -2 }, { q: 0, r: 2 })).toBe(4);
  });
});

describe('STANDARD_HEX_POSITIONS', () => {
  it('has 19 hex positions', () => {
    expect(STANDARD_HEX_POSITIONS).toHaveLength(19);
  });

  it('all positions are unique', () => {
    const keys = STANDARD_HEX_POSITIONS.map((h) => `${h.q},${h.r}`);
    expect(new Set(keys).size).toBe(19);
  });

  it('all positions are within distance 2 of origin', () => {
    for (const pos of STANDARD_HEX_POSITIONS) {
      expect(hexDistance({ q: 0, r: 0 }, pos)).toBeLessThanOrEqual(2);
    }
  });
});

describe('pointsEqual', () => {
  it('considers identical points equal', () => {
    expect(pointsEqual({ x: 1, y: 2 }, { x: 1, y: 2 })).toBe(true);
  });

  it('considers very close points equal', () => {
    expect(pointsEqual({ x: 1, y: 2 }, { x: 1.005, y: 2.005 })).toBe(true);
  });

  it('considers distant points not equal', () => {
    expect(pointsEqual({ x: 1, y: 2 }, { x: 2, y: 2 })).toBe(false);
  });
});
