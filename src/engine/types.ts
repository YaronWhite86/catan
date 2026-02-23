import type { BoardTopology, VertexId, HexId } from './board/board-graph';

// Re-export topology types
export type { VertexId, EdgeId, HexId } from './board/board-graph';
export type { BoardTopology } from './board/board-graph';
export type { Point, AxialCoord } from './board/hex-coords';

// ─── Resource Types ──────────────────────────────────

export type ResourceType = 'lumber' | 'brick' | 'wool' | 'grain' | 'ore';

export const ALL_RESOURCES: readonly ResourceType[] = [
  'lumber', 'brick', 'wool', 'grain', 'ore',
];

export type ResourceCount = Record<ResourceType, number>;

// ─── Terrain & Tokens ─────────────────────────────────

export type TerrainType =
  | 'forest'
  | 'hills'
  | 'pasture'
  | 'fields'
  | 'mountains'
  | 'desert';

export interface HexTile {
  id: HexId;
  terrain: TerrainType;
  numberToken: number | null; // null for desert
}

// ─── Harbor ───────────────────────────────────────────

export type HarborType =
  | 'generic'    // 3:1
  | 'lumber'
  | 'brick'
  | 'wool'
  | 'grain'
  | 'ore';

export interface HarborDefinition {
  type: HarborType;
  vertices: [VertexId, VertexId]; // the two vertices that benefit
}

// ─── Player ───────────────────────────────────────────

export type PlayerId = 0 | 1 | 2 | 3;

export type DevCardType =
  | 'knight'
  | 'road_building'
  | 'year_of_plenty'
  | 'monopoly'
  | 'victory_point';

export interface PlayerState {
  id: PlayerId;
  name: string;
  resources: ResourceCount;
  devCards: DevCardType[];     // playable cards (from previous turns)
  newDevCards: DevCardType[];  // bought this turn, not yet playable
  knightsPlayed: number;
  remainingSettlements: number;
  remainingCities: number;
  remainingRoads: number;
  hasPlayedDevCardThisTurn: boolean;
}

// ─── Buildings ────────────────────────────────────────

export type BuildingType = 'settlement' | 'city';

export interface VertexBuilding {
  type: BuildingType;
  owner: PlayerId;
}

export interface EdgeRoad {
  owner: PlayerId;
}

// ─── Game Phase ───────────────────────────────────────

export type GamePhase =
  | 'PRE_GAME'
  | 'SETUP_PLACE_SETTLEMENT'
  | 'SETUP_PLACE_ROAD'
  | 'ROLL_DICE'
  | 'DISCARD'
  | 'MOVE_ROBBER'
  | 'STEAL'
  | 'TRADE_BUILD_PLAY'
  | 'ROAD_BUILDING_PLACE'
  | 'YEAR_OF_PLENTY_PICK'
  | 'MONOPOLY_PICK'
  | 'GAME_OVER';

// ─── Trade ────────────────────────────────────────────

export interface TradeOffer {
  from: PlayerId;
  offering: ResourceCount;
  requesting: ResourceCount;
  acceptedBy: PlayerId | null;
}

// ─── Game State ───────────────────────────────────────

export interface GameState {
  phase: GamePhase;
  players: PlayerState[];
  playerCount: number;
  currentPlayer: PlayerId;

  // Board
  topology: BoardTopology;
  hexTiles: HexTile[];
  vertexBuildings: (VertexBuilding | null)[];  // indexed by VertexId
  edgeRoads: (EdgeRoad | null)[];              // indexed by EdgeId
  harbors: HarborDefinition[];
  robberHex: HexId;

  // Development card deck
  devCardDeck: DevCardType[];

  // Bank resources
  bank: ResourceCount;

  // Awards
  longestRoadPlayer: PlayerId | null;
  longestRoadLength: number;
  largestArmyPlayer: PlayerId | null;
  largestArmySize: number;

  // Turn state
  turnNumber: number;
  lastRoll: [number, number] | null;

  // Setup tracking
  setupRound: number; // 0 = first round, 1 = second round
  setupIndex: number; // index into setup order

  // Discard tracking
  playersNeedingDiscard: PlayerId[];

  // Road building tracking
  roadBuildingRoadsLeft: number;

  // Trade
  pendingTrade: TradeOffer | null;

  // Game log
  log: string[];

  // Last placed settlement (for setup road placement)
  lastPlacedVertex: VertexId | null;

  // PRNG seed for reproducibility
  seed: number;
  prngState: number;
}

// ─── Terrain → Resource mapping ──────────────────────

export function terrainToResource(terrain: TerrainType): ResourceType | null {
  switch (terrain) {
    case 'forest': return 'lumber';
    case 'hills': return 'brick';
    case 'pasture': return 'wool';
    case 'fields': return 'grain';
    case 'mountains': return 'ore';
    case 'desert': return null;
  }
}
