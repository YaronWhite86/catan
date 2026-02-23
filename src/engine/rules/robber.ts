import type { GameState, PlayerId, HexId, ResourceType } from '../types';
import { ALL_RESOURCES } from '../types';
import { subtractResources, totalResources, addResource, removeResource } from '../utils/resource-utils';
import { createPRNG } from '../utils/random';

/** Apply discard action */
export function applyDiscard(
  state: GameState,
  player: PlayerId,
  resources: { lumber: number; brick: number; wool: number; grain: number; ore: number },
): GameState {
  const newPlayers = [...state.players];
  const newBank = { ...state.bank };

  newPlayers[player] = {
    ...newPlayers[player],
    resources: subtractResources(newPlayers[player].resources, resources),
  };

  for (const r of ALL_RESOURCES) {
    newBank[r] += resources[r];
  }

  const remaining = state.playersNeedingDiscard.filter((p) => p !== player);

  if (remaining.length === 0) {
    // All discards done, move robber
    return {
      ...state,
      players: newPlayers,
      bank: newBank,
      playersNeedingDiscard: [],
      phase: 'MOVE_ROBBER',
      log: [...state.log, `${newPlayers[player].name} discarded resources`],
    };
  }

  return {
    ...state,
    players: newPlayers,
    bank: newBank,
    playersNeedingDiscard: remaining,
    log: [...state.log, `${newPlayers[player].name} discarded resources`],
  };
}

/** Get valid hexes to move the robber to (any hex except current robber position) */
export function getValidRobberHexes(state: GameState): HexId[] {
  return state.hexTiles
    .map((_, i) => i)
    .filter((hid) => hid !== state.robberHex);
}

/** Get players who can be stolen from at the robber hex */
export function getStealTargets(
  state: GameState,
  hex: HexId,
  thief: PlayerId,
): PlayerId[] {
  const targets = new Set<PlayerId>();

  for (const vid of state.topology.hexVertices[hex]) {
    const building = state.vertexBuildings[vid];
    if (building !== null && building.owner !== thief) {
      // Must have at least 1 resource
      if (totalResources(state.players[building.owner].resources) > 0) {
        targets.add(building.owner);
      }
    }
  }

  return Array.from(targets);
}

/** Apply move robber action */
export function applyMoveRobber(
  state: GameState,
  _player: PlayerId,
  hex: HexId,
): GameState {
  const targets = getStealTargets(state, hex, state.currentPlayer);

  const nextPhase = targets.length > 0 ? 'STEAL' as const : 'TRADE_BUILD_PLAY' as const;

  return {
    ...state,
    robberHex: hex,
    phase: nextPhase,
    log: [...state.log, `${state.players[state.currentPlayer].name} moved the robber`],
  };
}

/** Apply steal action */
export function applySteal(
  state: GameState,
  _thief: PlayerId,
  victim: PlayerId | null,
): GameState {
  if (victim === null) {
    return {
      ...state,
      phase: 'TRADE_BUILD_PLAY',
      log: [...state.log, `${state.players[state.currentPlayer].name} chose not to steal`],
    };
  }

  const newPlayers = [...state.players];

  // Pick a random resource from victim
  const victimResources = newPlayers[victim].resources;
  const available: ResourceType[] = [];
  for (const r of ALL_RESOURCES) {
    for (let i = 0; i < victimResources[r]; i++) {
      available.push(r);
    }
  }

  if (available.length === 0) {
    return {
      ...state,
      phase: 'TRADE_BUILD_PLAY',
      log: [...state.log, `${state.players[state.currentPlayer].name} tried to steal but ${newPlayers[victim].name} has nothing`],
    };
  }

  // Use PRNG for random steal
  const prng = createPRNG(state.prngState);
  const stolenIdx = prng.nextInt(0, available.length - 1);
  const stolen = available[stolenIdx];

  newPlayers[victim] = {
    ...newPlayers[victim],
    resources: removeResource(newPlayers[victim].resources, stolen),
  };
  newPlayers[state.currentPlayer] = {
    ...newPlayers[state.currentPlayer],
    resources: addResource(newPlayers[state.currentPlayer].resources, stolen),
  };

  return {
    ...state,
    players: newPlayers,
    prngState: state.prngState + 1,
    phase: 'TRADE_BUILD_PLAY',
    log: [...state.log, `${state.players[state.currentPlayer].name} stole a resource from ${newPlayers[victim].name}`],
  };
}
