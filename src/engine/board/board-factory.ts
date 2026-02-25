/**
 * Board factory: creates a shuffled Catan board.
 */

import type { HexTile } from '../types';
import type { PRNG } from '../utils/random';
import { shuffle } from '../utils/random';
import { TERRAIN_DISTRIBUTION, NUMBER_TOKEN_DISTRIBUTION } from '../constants';
import { buildBoardTopology } from './board-graph';
import type { BoardTopology } from './board-graph';
import { assignHarbors } from './harbors';
import type { HarborDefinition } from '../types';
import { STANDARD_HEX_POSITIONS, hexDistance } from './hex-coords';
import type { TerrainType } from '../types';

export interface BoardSetup {
  topology: BoardTopology;
  hexTiles: HexTile[];
  harbors: HarborDefinition[];
  desertHexId: number;
}

/**
 * Check whether any pair of adjacent hexes both have a 6 or 8 token.
 * Uses axial distance to determine adjacency (distance === 1).
 */
function hasAdjacentRedTokens(numbers: number[], terrains: TerrainType[]): boolean {
  // Build list of hex indices that received a 6 or 8
  const redIndices: number[] = [];
  let numIdx = 0;
  for (let i = 0; i < terrains.length; i++) {
    if (terrains[i] === 'desert') continue;
    if (numbers[numIdx] === 6 || numbers[numIdx] === 8) {
      redIndices.push(i);
    }
    numIdx++;
  }

  // Check each pair for adjacency
  for (let a = 0; a < redIndices.length; a++) {
    for (let b = a + 1; b < redIndices.length; b++) {
      if (hexDistance(STANDARD_HEX_POSITIONS[redIndices[a]], STANDARD_HEX_POSITIONS[redIndices[b]]) === 1) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Create a standard Catan board with shuffled terrain and number tokens.
 *
 * Number tokens are shuffled and validated so that 6 and 8 are never
 * placed on adjacent hexes (standard Catan rule). Re-shuffles up to
 * 100 times if needed — valid arrangements are common.
 */
export function createBoard(prng: PRNG): BoardSetup {
  const topology = buildBoardTopology(STANDARD_HEX_POSITIONS);

  // Shuffle terrain tiles
  const terrains = shuffle(TERRAIN_DISTRIBUTION, prng);

  // Find desert position
  const desertIdx = terrains.indexOf('desert');

  // Assign number tokens to non-desert hexes, re-shuffling if 6/8 are adjacent
  let shuffledNumbers = shuffle(NUMBER_TOKEN_DISTRIBUTION, prng);
  let attempts = 0;
  while (hasAdjacentRedTokens(shuffledNumbers, terrains) && attempts < 100) {
    shuffledNumbers = shuffle(NUMBER_TOKEN_DISTRIBUTION, prng);
    attempts++;
  }

  let numberIdx = 0;
  const hexTiles: HexTile[] = terrains.map((terrain, id) => ({
    id,
    terrain,
    numberToken: terrain === 'desert' ? null : shuffledNumbers[numberIdx++],
  }));

  // Assign harbors
  const harbors = assignHarbors(topology);

  return {
    topology,
    hexTiles,
    harbors,
    desertHexId: desertIdx,
  };
}
