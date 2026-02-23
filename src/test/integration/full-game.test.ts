import { describe, it, expect } from 'vitest';
import { createInitialState } from '../../engine/state';
import { gameReducer } from '../../engine/reducer';
import type { GameState, PlayerId, ResourceCount } from '../../engine/types';
import { ALL_RESOURCES } from '../../engine/types';
import { getSetupOrder, getValidSetupSettlementVertices, getValidSetupRoadEdges } from '../../engine/rules/setup';
import { getValidRobberHexes, getStealTargets } from '../../engine/rules/robber';
import {
  getValidCityVertices,
  getValidRoadEdges,
} from '../../engine/rules/building';
import { calculateVP } from '../../engine/rules/victory';
import { totalResources } from '../../engine/utils/resource-utils';

const SEED = 12345;

function emptyRes(): ResourceCount {
  return { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 };
}

/** Give a player resources for testing */
function giveResources(
  state: GameState,
  player: PlayerId,
  resources: ResourceCount,
): GameState {
  const newPlayers = [...state.players];
  const newBank = { ...state.bank };
  const newRes = { ...newPlayers[player].resources };
  for (const r of ALL_RESOURCES) {
    newRes[r] += resources[r];
    newBank[r] -= resources[r];
  }
  newPlayers[player] = { ...newPlayers[player], resources: newRes };
  return { ...state, players: newPlayers, bank: newBank };
}

/** Handle 7 roll flow: discard, move robber, steal */
function handleRobberFlow(state: GameState): GameState {
  let s = state;

  // Discard phase
  if (s.phase === 'DISCARD') {
    while (s.playersNeedingDiscard.length > 0) {
      const pid = s.playersNeedingDiscard[0];
      const discardCount = Math.floor(totalResources(s.players[pid].resources) / 2);
      const resources = emptyRes();
      let remaining = discardCount;
      for (const r of ALL_RESOURCES) {
        const amount = Math.min(remaining, s.players[pid].resources[r]);
        resources[r] = amount;
        remaining -= amount;
      }
      s = gameReducer(s, { type: 'DISCARD_RESOURCES', player: pid, resources });
    }
  }

  // Move robber
  if (s.phase === 'MOVE_ROBBER') {
    const hexes = getValidRobberHexes(s);
    s = gameReducer(s, { type: 'MOVE_ROBBER', player: s.currentPlayer, hex: hexes[0] });
  }

  // Steal
  if (s.phase === 'STEAL') {
    const targets = getStealTargets(s, s.robberHex, s.currentPlayer);
    s = gameReducer(s, {
      type: 'STEAL_RESOURCE',
      player: s.currentPlayer,
      victim: targets.length > 0 ? targets[0] : null,
    });
  }

  return s;
}

/** Roll dice and handle consequences */
function rollAndHandle(state: GameState, dice?: [number, number]): GameState {
  let s = gameReducer(state, {
    type: 'ROLL_DICE',
    player: state.currentPlayer,
    dice,
  });
  return handleRobberFlow(s);
}

/** Run a full setup phase */
function runSetup(state: GameState): GameState {
  let s = gameReducer(state, { type: 'START_GAME' });
  const order = getSetupOrder(s.playerCount);

  for (let i = 0; i < order.length; i++) {
    const player = order[i];
    const validVertices = getValidSetupSettlementVertices(s);
    s = gameReducer(s, {
      type: 'PLACE_SETUP_SETTLEMENT',
      player,
      vertex: validVertices[0],
    });
    const validEdges = getValidSetupRoadEdges(s, player);
    s = gameReducer(s, {
      type: 'PLACE_SETUP_ROAD',
      player,
      edge: validEdges[0],
    });
  }

  return s;
}

describe('Full Game Integration Test', () => {
  it('plays a complete game from setup through multiple turns', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);

    // ─── Setup ───
    state = runSetup(state);
    expect(state.phase).toBe('ROLL_DICE');
    expect(state.currentPlayer).toBe(0);
    expect(state.turnNumber).toBe(1);

    // Each player should have 2 settlements and 2 roads
    for (let i = 0; i < 4; i++) {
      expect(state.players[i].remainingSettlements).toBe(3); // 5 - 2
      expect(state.players[i].remainingRoads).toBe(13); // 15 - 2
      expect(calculateVP(state, i as PlayerId)).toBeGreaterThanOrEqual(2);
    }

    // ─── Turn 1: Player 0 rolls ───
    state = rollAndHandle(state, [3, 3]);
    expect(state.phase).toBe('TRADE_BUILD_PLAY');

    // End turn
    state = gameReducer(state, { type: 'END_TURN', player: 0 as PlayerId });
    expect(state.currentPlayer).toBe(1);

    // ─── Turn 2: Player 1 ───
    state = rollAndHandle(state, [4, 2]);
    state = gameReducer(state, { type: 'END_TURN', player: 1 as PlayerId });
    expect(state.currentPlayer).toBe(2);

    // ─── Turn 3: Player 2 ───
    state = rollAndHandle(state, [5, 3]);
    state = gameReducer(state, { type: 'END_TURN', player: 2 as PlayerId });
    expect(state.currentPlayer).toBe(3);

    // ─── Turn 4: Player 3 ───
    state = rollAndHandle(state, [2, 4]);
    state = gameReducer(state, { type: 'END_TURN', player: 3 as PlayerId });
    expect(state.currentPlayer).toBe(0);

    // ─── Several more rounds ───
    for (let round = 0; round < 5; round++) {
      for (let pid = 0; pid < 4; pid++) {
        expect(state.currentPlayer).toBe(pid);
        state = rollAndHandle(state, [3, 2]); // always roll 5

        // If player has enough resources, try building
        const roads = getValidRoadEdges(state, pid as PlayerId);
        if (roads.length > 0) {
          state = gameReducer(state, {
            type: 'BUILD_ROAD',
            player: pid as PlayerId,
            edge: roads[0],
          });
        }

        state = gameReducer(state, { type: 'END_TURN', player: pid as PlayerId });
      }
    }

    // Game should still be going
    expect(state.phase).not.toBe('GAME_OVER');
    expect(state.turnNumber).toBeGreaterThan(20);
  });

  it('handles maritime trade correctly', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(state);
    state = rollAndHandle(state, [3, 3]);

    // Give player 0 enough for 4:1 trade
    state = giveResources(state, 0 as PlayerId, {
      lumber: 4, brick: 0, wool: 0, grain: 0, ore: 0,
    });

    const lumberBefore = state.players[0].resources.lumber;
    const brickBefore = state.players[0].resources.brick;

    state = gameReducer(state, {
      type: 'MARITIME_TRADE',
      player: 0 as PlayerId,
      give: 'lumber',
      receive: 'brick',
    });

    expect(state.players[0].resources.lumber).toBe(lumberBefore - 4);
    expect(state.players[0].resources.brick).toBe(brickBefore + 1);
  });

  it('handles development card flow', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(state);
    state = rollAndHandle(state, [3, 3]);

    // Give player resources for dev card
    state = giveResources(state, 0 as PlayerId, {
      lumber: 0, brick: 0, wool: 1, grain: 1, ore: 1,
    });

    // Buy dev card
    state = gameReducer(state, { type: 'BUY_DEV_CARD', player: 0 as PlayerId });
    expect(state.players[0].newDevCards).toHaveLength(1);

    // Can't play it this turn (it's new)
    const cardType = state.players[0].newDevCards[0];
    expect(state.players[0].devCards).not.toContain(cardType);

    // End turn - card should move to playable
    state = gameReducer(state, { type: 'END_TURN', player: 0 as PlayerId });
    expect(state.players[0].devCards).toHaveLength(1);
    expect(state.players[0].newDevCards).toHaveLength(0);
  });

  it('handles robber on 7 with large hands', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(state);

    // Give player 1 a big hand (>7 cards)
    state = giveResources(state, 1 as PlayerId, {
      lumber: 3, brick: 3, wool: 3, grain: 3, ore: 0,
    });

    // Roll 7
    state = gameReducer(state, {
      type: 'ROLL_DICE',
      player: 0 as PlayerId,
      dice: [3, 4], // = 7
    });

    if (state.phase === 'DISCARD') {
      expect(state.playersNeedingDiscard).toContain(1 as PlayerId);

      // Player 1 must discard
      const totalBefore = totalResources(state.players[1].resources);
      const discardCount = Math.floor(totalBefore / 2);

      const resources = emptyRes();
      let remaining = discardCount;
      for (const r of ALL_RESOURCES) {
        const amount = Math.min(remaining, state.players[1].resources[r]);
        resources[r] = amount;
        remaining -= amount;
      }

      state = gameReducer(state, {
        type: 'DISCARD_RESOURCES',
        player: 1 as PlayerId,
        resources,
      });

      const totalAfter = totalResources(state.players[1].resources);
      expect(totalAfter).toBe(totalBefore - discardCount);
    }

    // Continue robber flow
    state = handleRobberFlow(state);
    expect(state.phase).toBe('TRADE_BUILD_PLAY');
  });

  it('handles 3-player game setup', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol'], SEED);
    state = runSetup(state);

    expect(state.phase).toBe('ROLL_DICE');
    expect(state.playerCount).toBe(3);

    // Each player has 2 settlements
    for (let i = 0; i < 3; i++) {
      expect(state.players[i].remainingSettlements).toBe(3);
    }
  });

  it('detects city upgrade flow', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(state);
    state = rollAndHandle(state, [3, 3]);

    // Give player resources for a city
    state = giveResources(state, 0 as PlayerId, {
      lumber: 0, brick: 0, wool: 0, grain: 2, ore: 3,
    });

    const validCities = getValidCityVertices(state, 0 as PlayerId);
    if (validCities.length > 0) {
      const settlementsBefore = state.players[0].remainingSettlements;
      const citiesBefore = state.players[0].remainingCities;

      state = gameReducer(state, {
        type: 'BUILD_CITY',
        player: 0 as PlayerId,
        vertex: validCities[0],
      });

      // Settlement returned, city used
      expect(state.players[0].remainingSettlements).toBe(settlementsBefore + 1);
      expect(state.players[0].remainingCities).toBe(citiesBefore - 1);
      expect(state.vertexBuildings[validCities[0]]?.type).toBe('city');
    }
  });

  it('monopoly card steals all of one resource', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(state);
    state = rollAndHandle(state, [3, 3]);

    // Give all players some wool, give p0 a monopoly card
    state = {
      ...state,
      players: state.players.map((p, i) => ({
        ...p,
        devCards: i === 0 ? ['monopoly'] : p.devCards,
        resources: { ...p.resources, wool: i === 0 ? 0 : 5 },
      })),
    };

    state = gameReducer(state, { type: 'PLAY_MONOPOLY', player: 0 as PlayerId });
    expect(state.phase).toBe('MONOPOLY_PICK');

    state = gameReducer(state, {
      type: 'PICK_MONOPOLY_RESOURCE',
      player: 0 as PlayerId,
      resource: 'wool',
    });

    // Player 0 gets 15 wool (5 from each of 3 opponents)
    expect(state.players[0].resources.wool).toBe(15);
    expect(state.players[1].resources.wool).toBe(0);
    expect(state.players[2].resources.wool).toBe(0);
    expect(state.players[3].resources.wool).toBe(0);
    expect(state.phase).toBe('TRADE_BUILD_PLAY');
  });

  it('year of plenty takes 2 from bank', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(state);
    state = rollAndHandle(state, [3, 3]);

    state = {
      ...state,
      players: state.players.map((p, i) => ({
        ...p,
        devCards: i === 0 ? ['year_of_plenty'] : p.devCards,
      })),
    };

    state = gameReducer(state, { type: 'PLAY_YEAR_OF_PLENTY', player: 0 as PlayerId });
    expect(state.phase).toBe('YEAR_OF_PLENTY_PICK');

    const oreBefore = state.players[0].resources.ore;
    const bankOreBefore = state.bank.ore;

    state = gameReducer(state, {
      type: 'PICK_YEAR_OF_PLENTY_RESOURCES',
      player: 0 as PlayerId,
      resource1: 'ore',
      resource2: 'ore',
    });

    expect(state.players[0].resources.ore).toBe(oreBefore + 2);
    expect(state.bank.ore).toBe(bankOreBefore - 2);
    expect(state.phase).toBe('TRADE_BUILD_PLAY');
  });

  it('road building places 2 free roads', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(state);
    state = rollAndHandle(state, [3, 3]);

    state = {
      ...state,
      players: state.players.map((p, i) => ({
        ...p,
        devCards: i === 0 ? ['road_building'] : p.devCards,
      })),
    };

    const roadsBefore = state.players[0].remainingRoads;
    state = gameReducer(state, { type: 'PLAY_ROAD_BUILDING', player: 0 as PlayerId });
    expect(state.phase).toBe('ROAD_BUILDING_PLACE');
    expect(state.roadBuildingRoadsLeft).toBe(2);

    // Place first road
    const edges1 = state.edgeRoads.map((r, i) => r === null ? i : -1).filter((i) => i >= 0);
    // Find valid edges for player 0
    const validEdges = edges1.filter((eid) => {
      const [v1, v2] = state.topology.edgeEndpoints[eid];
      return state.topology.vertexAdjacentEdges[v1].some(
        (e) => state.edgeRoads[e]?.owner === 0,
      ) || state.topology.vertexAdjacentEdges[v2].some(
        (e) => state.edgeRoads[e]?.owner === 0,
      );
    });

    if (validEdges.length >= 2) {
      state = gameReducer(state, {
        type: 'PLACE_ROAD_BUILDING_ROAD',
        player: 0 as PlayerId,
        edge: validEdges[0],
      });

      if (state.phase === 'ROAD_BUILDING_PLACE') {
        // Find new valid edges
        const validEdges2 = edges1.filter((eid) => {
          if (state.edgeRoads[eid] !== null) return false;
          const [v1, v2] = state.topology.edgeEndpoints[eid];
          return state.topology.vertexAdjacentEdges[v1].some(
            (e) => state.edgeRoads[e]?.owner === 0,
          ) || state.topology.vertexAdjacentEdges[v2].some(
            (e) => state.edgeRoads[e]?.owner === 0,
          );
        });

        if (validEdges2.length > 0) {
          state = gameReducer(state, {
            type: 'PLACE_ROAD_BUILDING_ROAD',
            player: 0 as PlayerId,
            edge: validEdges2[0],
          });
        }
      }

      expect(state.players[0].remainingRoads).toBeLessThan(roadsBefore);
      expect(state.phase).toBe('TRADE_BUILD_PLAY');
    }
  });

  it('domestic trade works between players', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(state);
    state = rollAndHandle(state, [3, 3]);

    // Give resources to both players
    state = giveResources(state, 0 as PlayerId, {
      lumber: 2, brick: 0, wool: 0, grain: 0, ore: 0,
    });
    state = giveResources(state, 1 as PlayerId, {
      lumber: 0, brick: 0, wool: 2, grain: 0, ore: 0,
    });

    // Player 0 proposes trade
    state = gameReducer(state, {
      type: 'PROPOSE_DOMESTIC_TRADE',
      player: 0 as PlayerId,
      offering: { lumber: 1, brick: 0, wool: 0, grain: 0, ore: 0 },
      requesting: { lumber: 0, brick: 0, wool: 1, grain: 0, ore: 0 },
    });

    expect(state.pendingTrade).not.toBeNull();

    // Player 1 accepts
    const p0LumberBefore = state.players[0].resources.lumber;
    const p0WoolBefore = state.players[0].resources.wool;

    state = gameReducer(state, {
      type: 'ACCEPT_DOMESTIC_TRADE',
      player: 1 as PlayerId,
    });

    expect(state.players[0].resources.lumber).toBe(p0LumberBefore - 1);
    expect(state.players[0].resources.wool).toBe(p0WoolBefore + 1);
    expect(state.pendingTrade).toBeNull();
  });
});
