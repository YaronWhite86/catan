import type { GameState, PlayerId } from '../types';
import { terrainToResource, ALL_RESOURCES } from '../types';
import { createPRNG } from '../utils/random';
import { addResource } from '../utils/resource-utils';

export interface DiceResult {
  dice: [number, number];
  total: number;
  newPrngState: number;
}

/** Roll two dice using seeded PRNG */
export function rollDice(prngState: number, override?: [number, number]): DiceResult {
  if (override) {
    return {
      dice: override,
      total: override[0] + override[1],
      newPrngState: prngState,
    };
  }

  const prng = createPRNG(prngState);
  const d1 = prng.nextInt(1, 6);
  const d2 = prng.nextInt(1, 6);
  // Advance PRNG state
  const newState = prngState + 1;

  return {
    dice: [d1, d2] as [number, number],
    total: d1 + d2,
    newPrngState: newState,
  };
}

/** Distribute resources for a dice roll */
export function distributeResources(
  state: GameState,
  diceTotal: number,
): GameState {
  if (diceTotal === 7) return state; // Robber, handled separately

  // For each hex matching the dice roll
  // First compute demand per hex per resource
  const newPlayers = state.players.map((p) => ({ ...p }));
  const newBank = { ...state.bank };

  for (let hid = 0; hid < state.hexTiles.length; hid++) {
    const hex = state.hexTiles[hid];
    if (hex.numberToken !== diceTotal) continue;
    if (hid === state.robberHex) continue; // Robber blocks

    const resource = terrainToResource(hex.terrain);
    if (resource === null) continue;

    // Count total demand from settlements and cities on this hex's vertices
    let totalDemand = 0;
    const playerDemand = new Map<PlayerId, number>();

    for (const vid of state.topology.hexVertices[hid]) {
      const building = state.vertexBuildings[vid];
      if (building === null) continue;

      const amount = building.type === 'city' ? 2 : 1;
      totalDemand += amount;
      playerDemand.set(
        building.owner,
        (playerDemand.get(building.owner) ?? 0) + amount,
      );
    }

    // If bank can't fulfill total demand for this hex, nobody gets
    if (totalDemand > newBank[resource]) continue;

    // Distribute
    for (const [pid, amount] of playerDemand) {
      newPlayers[pid] = {
        ...newPlayers[pid],
        resources: addResource(newPlayers[pid].resources, resource, amount),
      };
      newBank[resource] -= amount;
    }
  }

  return {
    ...state,
    players: newPlayers,
    bank: newBank,
  };
}

/** Get players who need to discard (more than 7 cards) */
export function getPlayersNeedingDiscard(state: GameState): PlayerId[] {
  return state.players
    .filter((p) => {
      const total = ALL_RESOURCES.reduce((sum, r) => sum + p.resources[r], 0);
      return total > 7;
    })
    .map((p) => p.id);
}

/** How many cards a player must discard (half rounded down) */
export function getDiscardCount(state: GameState, player: PlayerId): number {
  const total = ALL_RESOURCES.reduce(
    (sum, r) => sum + state.players[player].resources[r],
    0,
  );
  return Math.floor(total / 2);
}

/** Apply dice roll action */
export function applyDiceRoll(
  state: GameState,
  player: PlayerId,
  diceOverride?: [number, number],
): GameState {
  const result = rollDice(state.prngState, diceOverride);

  let newState: GameState = {
    ...state,
    lastRoll: result.dice,
    prngState: result.newPrngState,
    log: [...state.log, `${state.players[player].name} rolled ${result.total} (${result.dice[0]}+${result.dice[1]})`],
  };

  if (result.total === 7) {
    // Check for discards
    const needDiscard = getPlayersNeedingDiscard(newState);
    if (needDiscard.length > 0) {
      return {
        ...newState,
        phase: 'DISCARD',
        playersNeedingDiscard: needDiscard,
      };
    }
    // No discards needed, move robber
    return {
      ...newState,
      phase: 'MOVE_ROBBER',
    };
  }

  // Normal roll: distribute resources
  newState = distributeResources(newState, result.total);
  return {
    ...newState,
    phase: 'TRADE_BUILD_PLAY',
  };
}
