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
import { STANDARD_HEX_POSITIONS } from './hex-coords';

export interface BoardSetup {
  topology: BoardTopology;
  hexTiles: HexTile[];
  harbors: HarborDefinition[];
  desertHexId: number;
}

/**
 * Create a standard Catan board with shuffled terrain and number tokens.
 *
 * Number tokens are placed in a spiral pattern to avoid placing
 * 6 and 8 on adjacent hexes (standard Catan rule attempt).
 */
export function createBoard(prng: PRNG): BoardSetup {
  const topology = buildBoardTopology(STANDARD_HEX_POSITIONS);

  // Shuffle terrain tiles
  const terrains = shuffle(TERRAIN_DISTRIBUTION, prng);

  // Find desert position
  const desertIdx = terrains.indexOf('desert');

  // Assign number tokens to non-desert hexes
  const shuffledNumbers = shuffle(NUMBER_TOKEN_DISTRIBUTION, prng);

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
