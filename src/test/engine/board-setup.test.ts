import { describe, it, expect } from 'vitest';
import { createBoard } from '../../engine/board/board-factory';
import { createPRNG } from '../../engine/utils/random';
import { STANDARD_HEX_POSITIONS, hexDistance } from '../../engine/board/hex-coords';
import { NUMBER_TOKEN_DISTRIBUTION } from '../../engine/constants';

describe('board setup: no adjacent 6/8 tokens', () => {
  it('generates boards with no adjacent 6 or 8 across 200 seeds', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const prng = createPRNG(seed);
      const board = createBoard(prng);

      // Find all hex indices with a 6 or 8
      const redIndices = board.hexTiles
        .filter((h) => h.numberToken === 6 || h.numberToken === 8)
        .map((h) => h.id);

      // No pair of red-token hexes should be adjacent
      for (let a = 0; a < redIndices.length; a++) {
        for (let b = a + 1; b < redIndices.length; b++) {
          const dist = hexDistance(
            STANDARD_HEX_POSITIONS[redIndices[a]],
            STANDARD_HEX_POSITIONS[redIndices[b]],
          );
          expect(dist, `seed ${seed}: hexes ${redIndices[a]} and ${redIndices[b]} both have 6/8 and are adjacent`).toBeGreaterThan(1);
        }
      }
    }
  });

  it('preserves the correct number token distribution', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const prng = createPRNG(seed);
      const board = createBoard(prng);

      const tokens = board.hexTiles
        .map((h) => h.numberToken)
        .filter((n): n is number => n !== null)
        .sort((a, b) => a - b);

      expect(tokens, `seed ${seed}: token distribution mismatch`).toEqual(
        [...NUMBER_TOKEN_DISTRIBUTION].sort((a, b) => a - b),
      );
    }
  });
});
