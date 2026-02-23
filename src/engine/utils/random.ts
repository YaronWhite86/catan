/**
 * Seeded PRNG using mulberry32 algorithm.
 * All game randomness MUST flow through this for reproducibility.
 */
export interface PRNG {
  next(): number; // [0, 1)
  nextInt(min: number, max: number): number; // [min, max] inclusive
  seed: number;
}

export function createPRNG(seed: number): PRNG {
  let state = seed | 0;

  function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function nextInt(min: number, max: number): number {
    return min + Math.floor(next() * (max - min + 1));
  }

  return { next, nextInt, seed };
}

/** Fisher-Yates shuffle using seeded PRNG */
export function shuffle<T>(array: readonly T[], prng: PRNG): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = prng.nextInt(0, i);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
