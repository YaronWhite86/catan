/**
 * Heuristic helper functions for AI decision-making.
 */
import type { GameState, PlayerId, VertexId, HexId, ResourceType, ResourceCount } from '@engine/types';
import { ALL_RESOURCES } from '@engine/types';
import { totalResources } from '@engine/utils/resource-utils';
import { calculateVP } from '@engine/rules/victory';
import {
  vertexPipCount,
  vertexResourceDiversity,
  vertexHarborType,
  vertexResourceProduction,
  playerResourceProduction,
} from '../evaluation/board-analysis';

/**
 * Score a vertex for setup placement.
 * Considers: pip count, resource diversity, port proximity bonus.
 */
export function scoreSetupVertex(
  state: GameState,
  player: PlayerId,
  vertex: VertexId,
  isSecondSettlement: boolean,
): number {
  let score = 0;

  // Pip count is the primary factor
  const pips = vertexPipCount(state, vertex);
  score += pips * 10;

  // Resource diversity bonus
  const diversity = vertexResourceDiversity(state, vertex);
  score += diversity * 15;

  // Harbor bonus
  const harbor = vertexHarborType(state, vertex);
  if (harbor !== null) {
    score += harbor === 'generic' ? 5 : 8;
  }

  // For second settlement: complement the first settlement's resources
  if (isSecondSettlement) {
    const existingProd = playerResourceProduction(state, player);
    const vertexProd = vertexResourceProduction(state, vertex);

    // Bonus for each new resource type we'd gain
    for (const r of ALL_RESOURCES) {
      if (existingProd[r] === 0 && vertexProd[r] > 0) {
        score += 12;
      }
    }

    // Extra bonus for grain/ore (needed for cities and dev cards)
    if (existingProd.grain === 0 && vertexProd.grain > 0) score += 5;
    if (existingProd.ore === 0 && vertexProd.ore > 0) score += 5;
  }

  // Small bonus for 6 and 8 hexes (highest probability)
  for (const hid of state.topology.vertexAdjacentHexes[vertex]) {
    const token = state.hexTiles[hid].numberToken;
    if (token === 6 || token === 8) score += 3;
  }

  return score;
}

/**
 * Score a hex for robber placement.
 * Prefers hexes that hurt the VP leader while avoiding self-harm.
 */
export function scoreRobberHex(
  state: GameState,
  player: PlayerId,
  hex: HexId,
): number {
  let score = 0;

  // Find VP leader (not us)
  let maxVP = -1;
  let leader: PlayerId | null = null;
  for (let i = 0; i < state.playerCount; i++) {
    if (i === player) continue;
    const vp = calculateVP(state, i as PlayerId);
    if (vp > maxVP) {
      maxVP = vp;
      leader = i as PlayerId;
    }
  }

  const hex6or8 = state.hexTiles[hex].numberToken === 6 || state.hexTiles[hex].numberToken === 8;
  const hexPips = state.hexTiles[hex].numberToken
    ? ({ 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 }[state.hexTiles[hex].numberToken!] ?? 0)
    : 0;

  // Check who has buildings on this hex
  for (const vid of state.topology.hexVertices[hex]) {
    const building = state.vertexBuildings[vid];
    if (building === null) continue;

    const multiplier = building.type === 'city' ? 2 : 1;

    if (building.owner === player) {
      // Avoid self-harm
      score -= hexPips * multiplier * 5;
    } else if (building.owner === leader) {
      // Bonus for hurting the leader
      score += hexPips * multiplier * 8;
    } else {
      // Small bonus for hurting other opponents
      score += hexPips * multiplier * 3;
    }
  }

  // Extra bonus for blocking 6/8
  if (hex6or8) score += 5;

  // Bonus for hexes where we can steal
  const stealTargets = state.topology.hexVertices[hex]
    .map((vid) => state.vertexBuildings[vid])
    .filter((b) => b !== null && b.owner !== player);
  if (stealTargets.length > 0) score += 3;

  return score;
}

/**
 * Score a steal target. Prefer stealing from the VP leader.
 */
export function scoreStealTarget(
  state: GameState,
  _player: PlayerId,
  victim: PlayerId,
): number {
  const victimVP = calculateVP(state, victim);
  const victimCards = totalResources(state.players[victim].resources);

  // Prefer stealing from the player with the most VP
  return victimVP * 10 + victimCards;
}

/**
 * Choose the best resources to pick for Year of Plenty.
 * Pick resources we need most for our best available build.
 */
export function scorePlentyResources(
  state: GameState,
  player: PlayerId,
  r1: ResourceType,
  r2: ResourceType,
): number {
  const hand = state.players[player].resources;
  let score = 0;

  // Simulate having these resources
  const simHand: ResourceCount = { ...hand };
  simHand[r1] += 1;
  simHand[r2] += 1;

  // Check if we can now afford city (highest value build)
  if (simHand.grain >= 2 && simHand.ore >= 3) score += 50;
  // Settlement
  else if (simHand.lumber >= 1 && simHand.brick >= 1 && simHand.wool >= 1 && simHand.grain >= 1) score += 40;
  // Dev card
  else if (simHand.wool >= 1 && simHand.grain >= 1 && simHand.ore >= 1) score += 30;
  // Road
  else if (simHand.lumber >= 1 && simHand.brick >= 1) score += 20;

  // Prefer resources we have less of (diversification)
  score += (hand[r1] === 0 ? 5 : 0) + (hand[r2] === 0 ? 5 : 0);

  return score;
}

/**
 * Score a monopoly resource pick. Pick the resource opponents have most of.
 */
export function scoreMonopolyResource(
  state: GameState,
  player: PlayerId,
  resource: ResourceType,
): number {
  let totalSteal = 0;
  for (let i = 0; i < state.playerCount; i++) {
    if (i === player) continue;
    totalSteal += state.players[i].resources[resource];
  }
  // Also consider: does this resource help us build something?
  const hand = state.players[player].resources;
  const afterSteal = hand[resource] + totalSteal;

  let buildBonus = 0;
  if (resource === 'ore' && afterSteal >= 3) buildBonus += 10;
  if (resource === 'grain' && afterSteal >= 2) buildBonus += 8;

  return totalSteal * 10 + buildBonus;
}

/**
 * Get resources the player is closest to affording for each build type.
 * Used for prioritizing maritime trades and discards.
 */
export function getBuildGap(
  hand: ResourceCount,
  cost: ResourceCount,
): Record<ResourceType, number> {
  const gap: Record<ResourceType, number> = { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 };
  for (const r of ALL_RESOURCES) {
    gap[r] = Math.max(0, cost[r] - hand[r]);
  }
  return gap;
}

/**
 * Count how many resources are missing to afford a cost.
 */
export function totalGap(hand: ResourceCount, cost: ResourceCount): number {
  let g = 0;
  for (const r of ALL_RESOURCES) {
    g += Math.max(0, cost[r] - hand[r]);
  }
  return g;
}
