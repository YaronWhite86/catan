import type { GameState, PlayerId, PlayerState } from './types';
import { createPRNG } from './utils/random';
import { emptyResources } from './utils/resource-utils';
import { createBoard } from './board/board-factory';
import { MAX_SETTLEMENTS, MAX_CITIES, MAX_ROADS, createInitialBank, DEV_CARD_DISTRIBUTION } from './constants';
import { shuffle } from './utils/random';

function createPlayer(id: PlayerId, name: string): PlayerState {
  return {
    id,
    name,
    resources: emptyResources(),
    devCards: [],
    newDevCards: [],
    knightsPlayed: 0,
    remainingSettlements: MAX_SETTLEMENTS,
    remainingCities: MAX_CITIES,
    remainingRoads: MAX_ROADS,
    hasPlayedDevCardThisTurn: false,
  };
}

export function createInitialState(
  playerNames: string[],
  seed: number = Date.now(),
): GameState {
  if (playerNames.length < 3 || playerNames.length > 4) {
    throw new Error('Catan requires 3 or 4 players');
  }

  const prng = createPRNG(seed);
  const board = createBoard(prng);

  const players = playerNames.map((name, i) =>
    createPlayer(i as PlayerId, name),
  );

  // Shuffle dev card deck
  const devCardDeck = shuffle(DEV_CARD_DISTRIBUTION, prng);

  return {
    phase: 'PRE_GAME',
    players,
    playerCount: players.length,
    currentPlayer: 0 as PlayerId,

    topology: board.topology,
    hexTiles: board.hexTiles,
    vertexBuildings: new Array(board.topology.vertexCount).fill(null),
    edgeRoads: new Array(board.topology.edgeCount).fill(null),
    harbors: board.harbors,
    robberHex: board.desertHexId,

    devCardDeck,
    bank: createInitialBank(),

    longestRoadPlayer: null,
    longestRoadLength: 0,
    largestArmyPlayer: null,
    largestArmySize: 0,

    turnNumber: 0,
    lastRoll: null,

    setupRound: 0,
    setupIndex: 0,

    playersNeedingDiscard: [],
    roadBuildingRoadsLeft: 0,

    pendingTrade: null,
    log: [],

    lastPlacedVertex: null,

    seed,
    prngState: seed,
  };
}
