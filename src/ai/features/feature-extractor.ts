/**
 * Extract a feature vector from a GameState for neural network input.
 * All features normalized to [0, 1].
 * Features are player-relative: forPlayer is always slot 0.
 */
import type { GameState, PlayerId, GamePhase, ResourceType } from '@engine/types';
import { ALL_RESOURCES } from '@engine/types';
import { calculateVP } from '@engine/rules/victory';
import { calculateLongestRoad } from '@engine/rules/longest-road';
import { totalResources } from '@engine/utils/resource-utils';
import { playerResourceProduction, playerPortAccess, getPipCount } from '../evaluation/board-analysis';
import { PER_PLAYER_SIZE, NUM_PLAYERS, GLOBAL_SIZE, BOARD_SUMMARY_SIZE, TOTAL_FEATURES } from './feature-schema';

const PHASE_LIST: GamePhase[] = [
  'PRE_GAME', 'SETUP_PLACE_SETTLEMENT', 'SETUP_PLACE_ROAD',
  'ROLL_DICE', 'DISCARD', 'MOVE_ROBBER', 'STEAL',
  'TRADE_BUILD_PLAY', 'ROAD_BUILDING_PLACE', 'YEAR_OF_PLENTY_PICK',
  'MONOPOLY_PICK', 'GAME_OVER',
];

const RESOURCE_PORTS: ResourceType[] = ['lumber', 'brick', 'wool', 'grain', 'ore'];

/**
 * Extract feature vector from game state.
 * @param state Game state
 * @param forPlayer The player whose perspective we extract from
 * @returns Float32Array of normalized features
 */
export function extractFeatures(state: GameState, forPlayer: PlayerId): Float32Array {
  const features = new Float32Array(TOTAL_FEATURES);
  let offset = 0;

  // Player-relative ordering: forPlayer first, then others in order
  const playerOrder = getPlayerOrder(state, forPlayer);

  // Per-player features
  for (const pid of playerOrder) {
    offset = writePlayerFeatures(features, offset, state, pid);
  }
  // Pad if fewer than 4 players
  for (let i = playerOrder.length; i < NUM_PLAYERS; i++) {
    offset += PER_PLAYER_SIZE;
  }

  // Global features
  offset = writeGlobalFeatures(features, offset, state);

  // Board summary
  offset = writeBoardSummary(features, offset, state, forPlayer);

  return features;
}

function getPlayerOrder(state: GameState, forPlayer: PlayerId): PlayerId[] {
  const order: PlayerId[] = [forPlayer];
  for (let i = 1; i < state.playerCount; i++) {
    order.push(((forPlayer + i) % state.playerCount) as PlayerId);
  }
  return order;
}

function writePlayerFeatures(
  features: Float32Array,
  offset: number,
  state: GameState,
  pid: PlayerId,
): number {
  const p = state.players[pid];
  const startOffset = offset;

  // Resources (normalized: divide by 19, max bank per type)
  for (const r of ALL_RESOURCES) {
    features[offset++] = clamp(p.resources[r] / 19);
  }

  // Total resources (normalized by ~30)
  features[offset++] = clamp(totalResources(p.resources) / 30);

  // Dev cards by type
  const devCounts = countDevCards(p.devCards, p.newDevCards);
  features[offset++] = clamp(devCounts.knight / 14);
  features[offset++] = clamp(devCounts.road_building / 2);
  features[offset++] = clamp(devCounts.year_of_plenty / 2);
  features[offset++] = clamp(devCounts.monopoly / 2);
  features[offset++] = clamp(devCounts.victory_point / 5);

  // Knights played (normalized by 14)
  features[offset++] = clamp(p.knightsPlayed / 14);

  // Remaining pieces
  features[offset++] = p.remainingSettlements / 5;
  features[offset++] = p.remainingCities / 4;
  features[offset++] = p.remainingRoads / 15;

  // VP (normalized by 10)
  features[offset++] = clamp(calculateVP(state, pid) / 10);

  // Has longest road / largest army
  features[offset++] = state.longestRoadPlayer === pid ? 1 : 0;
  features[offset++] = state.largestArmyPlayer === pid ? 1 : 0;

  // Buildings on board
  let settlements = 0;
  let cities = 0;
  for (let vid = 0; vid < state.topology.vertexCount; vid++) {
    const b = state.vertexBuildings[vid];
    if (b !== null && b.owner === pid) {
      if (b.type === 'settlement') settlements++;
      else cities++;
    }
  }
  features[offset++] = settlements / 5;
  features[offset++] = cities / 4;

  // Port access
  const ports = playerPortAccess(state, pid);
  features[offset++] = ports.has('generic') ? 1 : 0;
  for (const r of RESOURCE_PORTS) {
    features[offset++] = ports.has(r) ? 1 : 0;
  }

  // Production per resource (normalized: max ~15 pips)
  const prod = playerResourceProduction(state, pid);
  for (const r of ALL_RESOURCES) {
    features[offset++] = clamp(prod[r] / 15);
  }

  // Resource diversity (0-5 normalized)
  const diversityCount = ALL_RESOURCES.filter((r) => prod[r] > 0).length;
  features[offset++] = diversityCount / 5;

  // Road length
  const roadLength = calculateLongestRoad(state, pid);
  features[offset++] = clamp(roadLength / 15);

  // Verify we wrote the right number of features
  if (offset - startOffset !== PER_PLAYER_SIZE) {
    throw new Error(`Per-player feature count mismatch: ${offset - startOffset} vs ${PER_PLAYER_SIZE}`);
  }

  return offset;
}

function writeGlobalFeatures(
  features: Float32Array,
  offset: number,
  state: GameState,
): number {
  // Turn number (normalized by ~200)
  features[offset++] = clamp(state.turnNumber / 200);

  // Phase one-hot
  for (const phase of PHASE_LIST) {
    features[offset++] = state.phase === phase ? 1 : 0;
  }

  // Bank resources
  for (const r of ALL_RESOURCES) {
    features[offset++] = clamp(state.bank[r] / 19);
  }

  // Dev cards remaining
  features[offset++] = clamp(state.devCardDeck.length / 25);

  // Robber hex info
  const robberHex = state.hexTiles[state.robberHex];
  features[offset++] = clamp(getPipCount(robberHex.numberToken) / 5);
  features[offset++] = robberHex.terrain === 'desert' ? 1 : 0;

  // Current player one-hot
  for (let i = 0; i < 4; i++) {
    features[offset++] = state.currentPlayer === i ? 1 : 0;
  }

  return offset;
}

function writeBoardSummary(
  features: Float32Array,
  offset: number,
  state: GameState,
  _forPlayer: PlayerId,
): number {
  // Per-resource production concentration per player (5 * 4 = 20)
  for (let i = 0; i < state.playerCount; i++) {
    const prod = playerResourceProduction(state, i as PlayerId);
    for (const r of ALL_RESOURCES) {
      features[offset++] = clamp(prod[r] / 15);
    }
  }
  // Pad for missing players
  for (let i = state.playerCount; i < 4; i++) {
    offset += 5;
  }

  // Vertex ownership summary: for each hex, how many vertices does each player own
  // Simplified: for each of the 19 hexes, 4-bit ownership presence (4 * ~12 = ~50)
  // We'll use a simplified 50-feature board summary
  const hexCount = Math.min(state.hexTiles.length, 19);
  for (let hid = 0; hid < hexCount && (offset - (PER_PLAYER_SIZE * NUM_PLAYERS + GLOBAL_SIZE + 20)) < BOARD_SUMMARY_SIZE - 20; hid++) {
    // For each hex, count buildings per player (normalized)
    let totalBuildings = 0;
    const perPlayer = new Array(4).fill(0);
    for (const vid of state.topology.hexVertices[hid]) {
      const b = state.vertexBuildings[vid];
      if (b !== null) {
        const mult = b.type === 'city' ? 2 : 1;
        perPlayer[b.owner] += mult;
        totalBuildings += mult;
      }
    }
    // Write density for first 2 players relative to forPlayer
    features[offset++] = clamp(totalBuildings / 6);
    if (offset >= TOTAL_FEATURES) break;
  }

  // Fill remaining with zeros (already initialized)
  offset = PER_PLAYER_SIZE * NUM_PLAYERS + GLOBAL_SIZE + BOARD_SUMMARY_SIZE;

  return offset;
}

function countDevCards(devCards: string[], newDevCards: string[]): Record<string, number> {
  const counts: Record<string, number> = {
    knight: 0, road_building: 0, year_of_plenty: 0, monopoly: 0, victory_point: 0,
  };
  for (const c of devCards) counts[c] = (counts[c] ?? 0) + 1;
  for (const c of newDevCards) counts[c] = (counts[c] ?? 0) + 1;
  return counts;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}
