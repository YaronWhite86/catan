/**
 * Enumerate all legal GameActions for a given state + player.
 * Delegates to existing engine helpers for valid placements.
 */
import type { GameState, PlayerId, ResourceCount } from '@engine/types';
import { ALL_RESOURCES } from '@engine/types';
import type { GameAction } from '@engine/actions';
import { getValidSetupSettlementVertices, getValidSetupRoadEdges } from '@engine/rules/setup';
import {
  getValidSettlementVertices,
  getValidCityVertices,
  getValidRoadEdges,
  getValidRoadEdgesNoResourceCheck,
} from '@engine/rules/building';
import { getValidRobberHexes, getStealTargets } from '@engine/rules/robber';
import { getPlayerTradeRatio } from '@engine/rules/trading';
import { canBuyDevCard, canPlayDevCard } from '@engine/rules/dev-cards';
import { getDiscardCount } from '@engine/rules/dice';
import { totalResources } from '@engine/utils/resource-utils';

/**
 * Get the player who must act next. For most phases this is currentPlayer,
 * but for DISCARD it's playersNeedingDiscard[0].
 */
export function getActingPlayer(state: GameState): PlayerId {
  if (state.phase === 'DISCARD' && state.playersNeedingDiscard.length > 0) {
    return state.playersNeedingDiscard[0];
  }
  return state.currentPlayer;
}

/**
 * Enumerate all legal actions for the acting player in the current state.
 */
export function enumerateActions(state: GameState): GameAction[] {
  const player = getActingPlayer(state);

  switch (state.phase) {
    case 'SETUP_PLACE_SETTLEMENT':
      return enumerateSetupSettlement(state, player);
    case 'SETUP_PLACE_ROAD':
      return enumerateSetupRoad(state, player);
    case 'ROLL_DICE':
      return [{ type: 'ROLL_DICE', player }];
    case 'DISCARD':
      return enumerateDiscard(state, player);
    case 'MOVE_ROBBER':
      return enumerateMoveRobber(state, player);
    case 'STEAL':
      return enumerateSteal(state, player);
    case 'TRADE_BUILD_PLAY':
      return enumerateTradeBuildPlay(state, player);
    case 'ROAD_BUILDING_PLACE':
      return enumerateRoadBuildingPlace(state, player);
    case 'YEAR_OF_PLENTY_PICK':
      return enumerateYearOfPlenty(state, player);
    case 'MONOPOLY_PICK':
      return enumerateMonopoly(player);
    default:
      return [];
  }
}

function enumerateSetupSettlement(state: GameState, player: PlayerId): GameAction[] {
  return getValidSetupSettlementVertices(state).map((vertex) => ({
    type: 'PLACE_SETUP_SETTLEMENT' as const,
    player,
    vertex,
  }));
}

function enumerateSetupRoad(state: GameState, player: PlayerId): GameAction[] {
  return getValidSetupRoadEdges(state, player).map((edge) => ({
    type: 'PLACE_SETUP_ROAD' as const,
    player,
    edge,
  }));
}

/**
 * Generate smart discard combinations instead of all C(n,k).
 * Produces up to ~10 candidate discard sets by greedily keeping
 * resources closest to completing builds.
 */
function enumerateDiscard(state: GameState, player: PlayerId): GameAction[] {
  const hand = state.players[player].resources;
  const discardCount = getDiscardCount(state, player);
  const total = totalResources(hand);

  if (discardCount <= 0 || discardCount > total) return [];

  const keepCount = total - discardCount;
  const combos = generateSmartDiscards(hand, keepCount);

  return combos.map((keep) => {
    const resources: ResourceCount = {
      lumber: hand.lumber - keep.lumber,
      brick: hand.brick - keep.brick,
      wool: hand.wool - keep.wool,
      grain: hand.grain - keep.grain,
      ore: hand.ore - keep.ore,
    };
    return { type: 'DISCARD_RESOURCES' as const, player, resources };
  });
}

/**
 * Generate a set of "smart" keep-hands of exactly `keepCount` cards.
 * Prioritizes keeping resources needed for settlement, city, dev card, road.
 */
function generateSmartDiscards(hand: ResourceCount, keepCount: number): ResourceCount[] {
  const results: ResourceCount[] = [];
  const seen = new Set<string>();

  // Build priority targets (what we'd like to keep)
  const targets: ResourceCount[] = [
    { lumber: 1, brick: 1, wool: 1, grain: 1, ore: 0 }, // settlement
    { lumber: 0, brick: 0, wool: 0, grain: 2, ore: 3 }, // city
    { lumber: 0, brick: 0, wool: 1, grain: 1, ore: 1 }, // dev card
    { lumber: 1, brick: 1, wool: 0, grain: 0, ore: 0 }, // road
  ];

  for (const target of targets) {
    const keep = greedyKeep(hand, keepCount, target);
    const key = ALL_RESOURCES.map((r) => keep[r]).join(',');
    if (!seen.has(key)) {
      seen.add(key);
      results.push(keep);
    }
  }

  // Also try keeping the most abundant resources (balanced discard)
  const balanced = greedyKeepBalanced(hand, keepCount);
  const bKey = ALL_RESOURCES.map((r) => balanced[r]).join(',');
  if (!seen.has(bKey)) {
    seen.add(bKey);
    results.push(balanced);
  }

  // Try keeping resources evenly
  const even = greedyKeepEven(hand, keepCount);
  const eKey = ALL_RESOURCES.map((r) => even[r]).join(',');
  if (!seen.has(eKey)) {
    seen.add(eKey);
    results.push(even);
  }

  return results;
}

/** Keep as many resources matching the target as possible, then fill with most abundant */
function greedyKeep(hand: ResourceCount, keepCount: number, target: ResourceCount): ResourceCount {
  const keep: ResourceCount = { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 };
  let remaining = keepCount;

  // First, keep resources matching the target
  for (const r of ALL_RESOURCES) {
    const toKeep = Math.min(target[r], hand[r], remaining);
    keep[r] = toKeep;
    remaining -= toKeep;
  }

  // Fill remaining slots with most abundant resources
  if (remaining > 0) {
    const sorted = [...ALL_RESOURCES].sort((a, b) => (hand[b] - keep[b]) - (hand[a] - keep[a]));
    for (const r of sorted) {
      const canKeep = Math.min(hand[r] - keep[r], remaining);
      keep[r] += canKeep;
      remaining -= canKeep;
      if (remaining <= 0) break;
    }
  }

  return keep;
}

/** Keep the most abundant resources */
function greedyKeepBalanced(hand: ResourceCount, keepCount: number): ResourceCount {
  const keep: ResourceCount = { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 };
  let remaining = keepCount;

  const sorted = [...ALL_RESOURCES].sort((a, b) => hand[b] - hand[a]);
  for (const r of sorted) {
    const toKeep = Math.min(hand[r], remaining);
    keep[r] = toKeep;
    remaining -= toKeep;
    if (remaining <= 0) break;
  }

  return keep;
}

/** Keep resources evenly distributed */
function greedyKeepEven(hand: ResourceCount, keepCount: number): ResourceCount {
  const keep: ResourceCount = { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 };
  let remaining = keepCount;

  // Round-robin: keep 1 of each available resource at a time
  const available = ALL_RESOURCES.filter((r) => hand[r] > 0);
  while (remaining > 0 && available.length > 0) {
    for (let i = available.length - 1; i >= 0; i--) {
      const r = available[i];
      if (keep[r] < hand[r] && remaining > 0) {
        keep[r]++;
        remaining--;
      }
      if (keep[r] >= hand[r]) {
        available.splice(i, 1);
      }
    }
  }

  return keep;
}

function enumerateMoveRobber(state: GameState, player: PlayerId): GameAction[] {
  return getValidRobberHexes(state).map((hex) => ({
    type: 'MOVE_ROBBER' as const,
    player,
    hex,
  }));
}

function enumerateSteal(state: GameState, player: PlayerId): GameAction[] {
  const targets = getStealTargets(state, state.robberHex, player);
  if (targets.length === 0) {
    return [{ type: 'STEAL_RESOURCE', player, victim: null }];
  }
  return targets.map((victim) => ({
    type: 'STEAL_RESOURCE' as const,
    player,
    victim,
  }));
}

function enumerateTradeBuildPlay(state: GameState, player: PlayerId): GameAction[] {
  const actions: GameAction[] = [];

  // Build roads
  for (const edge of getValidRoadEdges(state, player)) {
    actions.push({ type: 'BUILD_ROAD', player, edge });
  }

  // Build settlements
  for (const vertex of getValidSettlementVertices(state, player)) {
    actions.push({ type: 'BUILD_SETTLEMENT', player, vertex });
  }

  // Build cities
  for (const vertex of getValidCityVertices(state, player)) {
    actions.push({ type: 'BUILD_CITY', player, vertex });
  }

  // Buy dev card
  if (canBuyDevCard(state, player)) {
    actions.push({ type: 'BUY_DEV_CARD', player });
  }

  // Play dev cards
  if (canPlayDevCard(state, player, 'knight')) {
    actions.push({ type: 'PLAY_KNIGHT', player });
  }
  if (canPlayDevCard(state, player, 'road_building') &&
      getValidRoadEdgesNoResourceCheck(state, player).length > 0) {
    actions.push({ type: 'PLAY_ROAD_BUILDING', player });
  }
  if (canPlayDevCard(state, player, 'year_of_plenty')) {
    actions.push({ type: 'PLAY_YEAR_OF_PLENTY', player });
  }
  if (canPlayDevCard(state, player, 'monopoly')) {
    actions.push({ type: 'PLAY_MONOPOLY', player });
  }

  // Maritime trades
  for (const give of ALL_RESOURCES) {
    const ratio = getPlayerTradeRatio(state, player, give);
    if (state.players[player].resources[give] >= ratio) {
      for (const receive of ALL_RESOURCES) {
        if (give !== receive && state.bank[receive] > 0) {
          actions.push({ type: 'MARITIME_TRADE', player, give, receive });
        }
      }
    }
  }

  // End turn is always available
  actions.push({ type: 'END_TURN', player });

  return actions;
}

function enumerateRoadBuildingPlace(state: GameState, player: PlayerId): GameAction[] {
  return getValidRoadEdgesNoResourceCheck(state, player).map((edge) => ({
    type: 'PLACE_ROAD_BUILDING_ROAD' as const,
    player,
    edge,
  }));
}

function enumerateYearOfPlenty(state: GameState, player: PlayerId): GameAction[] {
  const actions: GameAction[] = [];
  const bank = state.bank;

  for (const r1 of ALL_RESOURCES) {
    if (bank[r1] <= 0) continue;
    for (const r2 of ALL_RESOURCES) {
      if (r1 === r2 && bank[r1] < 2) continue;
      if (r2 < r1) continue; // avoid duplicates: only r1 <= r2
      if (bank[r2] <= 0) continue;
      actions.push({
        type: 'PICK_YEAR_OF_PLENTY_RESOURCES',
        player,
        resource1: r1,
        resource2: r2,
      });
    }
  }

  return actions;
}

function enumerateMonopoly(player: PlayerId): GameAction[] {
  return ALL_RESOURCES.map((resource) => ({
    type: 'PICK_MONOPOLY_RESOURCE' as const,
    player,
    resource,
  }));
}
