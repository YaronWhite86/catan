import type { ResourceCount, TerrainType, DevCardType, ResourceType } from './types';

// ─── Building Costs ──────────────────────────────────

export const ROAD_COST: ResourceCount = {
  lumber: 1, brick: 1, wool: 0, grain: 0, ore: 0,
};

export const SETTLEMENT_COST: ResourceCount = {
  lumber: 1, brick: 1, wool: 1, grain: 1, ore: 0,
};

export const CITY_COST: ResourceCount = {
  lumber: 0, brick: 0, wool: 0, grain: 2, ore: 3,
};

export const DEV_CARD_COST: ResourceCount = {
  lumber: 0, brick: 0, wool: 1, grain: 1, ore: 1,
};

// ─── Piece Limits ────────────────────────────────────

export const MAX_SETTLEMENTS = 5;
export const MAX_CITIES = 4;
export const MAX_ROADS = 15;

// ─── Bank ────────────────────────────────────────────

export const BANK_RESOURCES_PER_TYPE = 19;

export function createInitialBank(): ResourceCount {
  return {
    lumber: BANK_RESOURCES_PER_TYPE,
    brick: BANK_RESOURCES_PER_TYPE,
    wool: BANK_RESOURCES_PER_TYPE,
    grain: BANK_RESOURCES_PER_TYPE,
    ore: BANK_RESOURCES_PER_TYPE,
  };
}

// ─── Terrain Distribution ────────────────────────────

export const TERRAIN_DISTRIBUTION: TerrainType[] = [
  'forest', 'forest', 'forest', 'forest',
  'hills', 'hills', 'hills',
  'pasture', 'pasture', 'pasture', 'pasture',
  'fields', 'fields', 'fields', 'fields',
  'mountains', 'mountains', 'mountains',
  'desert',
];

// ─── Number Token Distribution ───────────────────────

export const NUMBER_TOKEN_DISTRIBUTION: number[] = [
  2,
  3, 3,
  4, 4,
  5, 5,
  6, 6,
  8, 8,
  9, 9,
  10, 10,
  11, 11,
  12,
];

// ─── Development Card Distribution ──────────────────

export const DEV_CARD_DISTRIBUTION: DevCardType[] = [
  // 14 Knights
  ...Array(14).fill('knight') as DevCardType[],
  // 5 Victory Points
  ...Array(5).fill('victory_point') as DevCardType[],
  // 2 Road Building
  'road_building', 'road_building',
  // 2 Year of Plenty
  'year_of_plenty', 'year_of_plenty',
  // 2 Monopoly
  'monopoly', 'monopoly',
];

// ─── Victory Points ─────────────────────────────────

export const VP_TO_WIN = 10;
export const LONGEST_ROAD_VP = 2;
export const LARGEST_ARMY_VP = 2;
export const SETTLEMENT_VP = 1;
export const CITY_VP = 2;
export const VP_CARD_VP = 1;

export const MIN_LONGEST_ROAD = 5;
export const MIN_LARGEST_ARMY = 3;

// ─── Trade Ratios ───────────────────────────────────

export const DEFAULT_TRADE_RATIO = 4;
export const GENERIC_PORT_RATIO = 3;
export const SPECIFIC_PORT_RATIO = 2;

// ─── Player Colors ──────────────────────────────────

export const PLAYER_COLORS: readonly string[] = [
  '#e74c3c', // red
  '#3498db', // blue
  '#f39c12', // orange
  '#2ecc71', // green
];

// ─── Resource Colors ────────────────────────────────

export const TERRAIN_COLORS: Record<TerrainType, string> = {
  forest: '#2d7a2d',
  hills: '#c45a2d',
  pasture: '#7ec850',
  fields: '#daa520',
  mountains: '#808080',
  desert: '#f0d9a0',
};

export const RESOURCE_LABELS: Record<ResourceType, string> = {
  lumber: 'Lumber',
  brick: 'Brick',
  wool: 'Wool',
  grain: 'Grain',
  ore: 'Ore',
};
