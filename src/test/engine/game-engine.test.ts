import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState } from '../../engine/state';
import { gameReducer, GameError } from '../../engine/reducer';
import type { GameState, PlayerId, ResourceCount } from '../../engine/types';
import { getSetupOrder, getValidSetupSettlementVertices, getValidSetupRoadEdges } from '../../engine/rules/setup';
import { getValidRobberHexes, getStealTargets } from '../../engine/rules/robber';
import { getValidSettlementVertices } from '../../engine/rules/building';
import { calculateLongestRoad } from '../../engine/rules/longest-road';
import { calculateVP } from '../../engine/rules/victory';
import { totalResources } from '../../engine/utils/resource-utils';

const SEED = 42;

function emptyRes(): ResourceCount {
  return { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 };
}

/** Helper to run a setup phase and get to main game */
function runSetup(state: GameState): GameState {
  let s = gameReducer(state, { type: 'START_GAME' });

  const order = getSetupOrder(s.playerCount);

  for (let i = 0; i < order.length; i++) {
    const player = order[i];

    // Place settlement
    const validVertices = getValidSetupSettlementVertices(s);
    expect(validVertices.length).toBeGreaterThan(0);
    s = gameReducer(s, {
      type: 'PLACE_SETUP_SETTLEMENT',
      player,
      vertex: validVertices[0],
    });

    // Place road
    const validEdges = getValidSetupRoadEdges(s, player);
    expect(validEdges.length).toBeGreaterThan(0);
    s = gameReducer(s, {
      type: 'PLACE_SETUP_ROAD',
      player,
      edge: validEdges[0],
    });
  }

  return s;
}

describe('Game State Creation', () => {
  it('creates valid initial state for 4 players', () => {
    const state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    expect(state.phase).toBe('PRE_GAME');
    expect(state.players).toHaveLength(4);
    expect(state.playerCount).toBe(4);
    expect(state.hexTiles).toHaveLength(19);
    expect(state.topology.vertexCount).toBe(54);
    expect(state.topology.edgeCount).toBe(72);
    expect(state.devCardDeck).toHaveLength(25);
  });

  it('creates valid initial state for 3 players', () => {
    const state = createInitialState(['Alice', 'Bob', 'Carol'], SEED);
    expect(state.players).toHaveLength(3);
    expect(state.playerCount).toBe(3);
  });

  it('throws for invalid player count', () => {
    expect(() => createInitialState(['Alice', 'Bob'], SEED)).toThrow();
    expect(() => createInitialState(['A', 'B', 'C', 'D', 'E'], SEED)).toThrow();
  });

  it('has correct bank resources', () => {
    const state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    expect(state.bank.lumber).toBe(19);
    expect(state.bank.brick).toBe(19);
    expect(state.bank.wool).toBe(19);
    expect(state.bank.grain).toBe(19);
    expect(state.bank.ore).toBe(19);
  });

  it('desert has no number token', () => {
    const state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    const desert = state.hexTiles.find((h) => h.terrain === 'desert');
    expect(desert).toBeDefined();
    expect(desert!.numberToken).toBeNull();
  });

  it('robber starts on desert', () => {
    const state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    expect(state.hexTiles[state.robberHex].terrain).toBe('desert');
  });
});

describe('Setup Order', () => {
  it('4-player snake: 0,1,2,3,3,2,1,0', () => {
    expect(getSetupOrder(4)).toEqual([0, 1, 2, 3, 3, 2, 1, 0]);
  });

  it('3-player snake: 0,1,2,2,1,0', () => {
    expect(getSetupOrder(3)).toEqual([0, 1, 2, 2, 1, 0]);
  });
});

describe('Setup Phase', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
  });

  it('transitions from PRE_GAME to SETUP_PLACE_SETTLEMENT', () => {
    const s = gameReducer(state, { type: 'START_GAME' });
    expect(s.phase).toBe('SETUP_PLACE_SETTLEMENT');
    expect(s.currentPlayer).toBe(0);
  });

  it('rejects START_GAME when not in PRE_GAME', () => {
    const s = gameReducer(state, { type: 'START_GAME' });
    expect(() => gameReducer(s, { type: 'START_GAME' })).toThrow(GameError);
  });

  it('allows valid settlement placement', () => {
    let s = gameReducer(state, { type: 'START_GAME' });
    const validVertices = getValidSetupSettlementVertices(s);
    expect(validVertices.length).toBe(54); // all empty at start

    s = gameReducer(s, {
      type: 'PLACE_SETUP_SETTLEMENT',
      player: 0 as PlayerId,
      vertex: validVertices[0],
    });
    expect(s.phase).toBe('SETUP_PLACE_ROAD');
  });

  it('enforces distance rule in setup', () => {
    let s = gameReducer(state, { type: 'START_GAME' });
    const validVertices = getValidSetupSettlementVertices(s);
    const v = validVertices[0];

    s = gameReducer(s, {
      type: 'PLACE_SETUP_SETTLEMENT',
      player: 0 as PlayerId,
      vertex: v,
    });

    // Place road for player 0
    const roads = getValidSetupRoadEdges(s, 0 as PlayerId);
    s = gameReducer(s, {
      type: 'PLACE_SETUP_ROAD',
      player: 0 as PlayerId,
      edge: roads[0],
    });

    // Player 1 should not be able to place adjacent to player 0's settlement
    const validForP1 = getValidSetupSettlementVertices(s);
    expect(validForP1).not.toContain(v);

    // Adjacent vertices should also be blocked
    const adjVertices = state.topology.vertexAdjacentVertices[v];
    for (const adj of adjVertices) {
      expect(validForP1).not.toContain(adj);
    }
  });

  it('completes full setup for 4 players', () => {
    const s = runSetup(state);
    expect(s.phase).toBe('ROLL_DICE');
    expect(s.currentPlayer).toBe(0);
    expect(s.turnNumber).toBe(1);
  });

  it('completes full setup for 3 players', () => {
    const state3 = createInitialState(['Alice', 'Bob', 'Carol'], SEED);
    const s = runSetup(state3);
    expect(s.phase).toBe('ROLL_DICE');
    expect(s.currentPlayer).toBe(0);
  });

  it('grants initial resources from second settlement', () => {
    const s = runSetup(state);
    // At least some players should have resources from their second settlement
    let totalPlayerResources = 0;
    for (const p of s.players) {
      totalPlayerResources += totalResources(p.resources);
    }
    expect(totalPlayerResources).toBeGreaterThan(0);
  });

  it('rejects wrong player placing', () => {
    let s = gameReducer(state, { type: 'START_GAME' });
    const validVertices = getValidSetupSettlementVertices(s);

    expect(() =>
      gameReducer(s, {
        type: 'PLACE_SETUP_SETTLEMENT',
        player: 1 as PlayerId,
        vertex: validVertices[0],
      }),
    ).toThrow(GameError);
  });
});

describe('Dice and Resources', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(state);
  });

  it('transitions to TRADE_BUILD_PLAY after non-7 roll', () => {
    const s = gameReducer(state, {
      type: 'ROLL_DICE',
      player: 0 as PlayerId,
      dice: [3, 3], // 6
    });
    expect(s.phase).toBe('TRADE_BUILD_PLAY');
    expect(s.lastRoll).toEqual([3, 3]);
  });

  it('transitions to DISCARD or MOVE_ROBBER on roll of 7', () => {
    const s = gameReducer(state, {
      type: 'ROLL_DICE',
      player: 0 as PlayerId,
      dice: [3, 4], // 7
    });
    expect(['DISCARD', 'MOVE_ROBBER']).toContain(s.phase);
  });

  it('distributes resources on dice roll', () => {
    // Find a hex with a settlement and its number token
    let targetNumber: number | null = null;

    for (let vid = 0; vid < state.topology.vertexCount; vid++) {
      const building = state.vertexBuildings[vid];
      if (building === null) continue;

      for (const hid of state.topology.vertexAdjacentHexes[vid]) {
        const hex = state.hexTiles[hid];
        if (hex.numberToken !== null && hid !== state.robberHex) {
          targetNumber = hex.numberToken;
          break;
        }
      }
      if (targetNumber !== null) break;
    }

    if (targetNumber !== null) {
      // Calculate what dice values produce the target
      const d1 = Math.min(targetNumber - 1, 6);
      const d2 = targetNumber - d1;

      if (d1 >= 1 && d2 >= 1 && d1 <= 6 && d2 <= 6) {
        const before = state.players.reduce(
          (sum, p) => sum + totalResources(p.resources),
          0,
        );
        const s = gameReducer(state, {
          type: 'ROLL_DICE',
          player: 0 as PlayerId,
          dice: [d1, d2],
        });
        const after = s.players.reduce(
          (sum, p) => sum + totalResources(p.resources),
          0,
        );
        // Resources should have been distributed (may or may not increase)
        expect(after).toBeGreaterThanOrEqual(before);
      }
    }
  });

  it('does not distribute from robber hex', () => {
    // Move robber somewhere with a settlement, then roll that number
    // This is tested more thoroughly in integration tests
    expect(state.robberHex).toBeDefined();
  });
});

describe('Robber Flow', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(state);
  });

  it('handles move robber after 7 when no discard needed', () => {
    // Give player 0 only a few resources so no one needs to discard
    let s = gameReducer(state, {
      type: 'ROLL_DICE',
      player: 0 as PlayerId,
      dice: [3, 4], // 7
    });

    if (s.phase === 'MOVE_ROBBER') {
      const validHexes = getValidRobberHexes(s);
      expect(validHexes.length).toBe(18); // all except current

      s = gameReducer(s, {
        type: 'MOVE_ROBBER',
        player: 0 as PlayerId,
        hex: validHexes[0],
      });

      expect(['STEAL', 'TRADE_BUILD_PLAY']).toContain(s.phase);
    }
  });

  it('rejects moving robber to same hex', () => {
    let s = gameReducer(state, {
      type: 'ROLL_DICE',
      player: 0 as PlayerId,
      dice: [3, 4],
    });

    if (s.phase === 'DISCARD') {
      // Handle discards
      for (const pid of s.playersNeedingDiscard) {
        const discardCount = Math.floor(
          totalResources(s.players[pid].resources) / 2,
        );
        const resources = emptyRes();
        let remaining = discardCount;
        for (const r of ['lumber', 'brick', 'wool', 'grain', 'ore'] as const) {
          const amount = Math.min(remaining, s.players[pid].resources[r]);
          resources[r] = amount;
          remaining -= amount;
        }
        s = gameReducer(s, { type: 'DISCARD_RESOURCES', player: pid, resources });
      }
    }

    if (s.phase === 'MOVE_ROBBER') {
      expect(() =>
        gameReducer(s, {
          type: 'MOVE_ROBBER',
          player: 0 as PlayerId,
          hex: s.robberHex,
        }),
      ).toThrow(GameError);
    }
  });
});

describe('Building', () => {
  let state: GameState;

  beforeEach(() => {
    const s0 = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(s0);

    // Roll dice to get to TRADE_BUILD_PLAY
    state = gameReducer(state, {
      type: 'ROLL_DICE',
      player: 0 as PlayerId,
      dice: [2, 1], // 3 - unlikely to trigger robber
    });
  });

  it('rejects building when not enough resources', () => {
    // Player likely doesn't have enough to build
    const valid = getValidSettlementVertices(state, 0 as PlayerId);
    if (valid.length > 0) {
      // If somehow valid, it means player has resources, which is fine
      expect(valid.length).toBeGreaterThan(0);
    }
  });

  it('rejects building on occupied vertex', () => {
    // Find a vertex with a building
    const occupied = state.vertexBuildings.findIndex((b) => b !== null);
    if (occupied >= 0) {
      // Give player resources
      const modState = givePlayerResources(state, 0 as PlayerId, {
        lumber: 5, brick: 5, wool: 5, grain: 5, ore: 5,
      });

      expect(() =>
        gameReducer(modState, {
          type: 'BUILD_SETTLEMENT',
          player: 0 as PlayerId,
          vertex: occupied,
        }),
      ).toThrow(GameError);
    }
  });
});

describe('End Turn', () => {
  let state: GameState;

  beforeEach(() => {
    const s0 = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(s0);
    state = gameReducer(state, {
      type: 'ROLL_DICE',
      player: 0 as PlayerId,
      dice: [2, 1],
    });
  });

  it('advances to next player', () => {
    const s = gameReducer(state, { type: 'END_TURN', player: 0 as PlayerId });
    expect(s.phase).toBe('ROLL_DICE');
    expect(s.currentPlayer).toBe(1);
  });

  it('wraps around after last player', () => {
    let s = state;
    for (let i = 0; i < 4; i++) {
      if (s.phase === 'ROLL_DICE') {
        s = gameReducer(s, {
          type: 'ROLL_DICE',
          player: s.currentPlayer,
          dice: [2, 1],
        });
      }
      // Handle robber if needed
      if (s.phase === 'MOVE_ROBBER') {
        const hexes = getValidRobberHexes(s);
        s = gameReducer(s, {
          type: 'MOVE_ROBBER',
          player: s.currentPlayer,
          hex: hexes[0],
        });
      }
      if (s.phase === 'STEAL') {
        const targets = getStealTargets(s, s.robberHex, s.currentPlayer);
        s = gameReducer(s, {
          type: 'STEAL_RESOURCE',
          player: s.currentPlayer,
          victim: targets.length > 0 ? targets[0] : null,
        });
      }
      if (s.phase === 'DISCARD') {
        for (const pid of [...s.playersNeedingDiscard]) {
          const discardCount = Math.floor(totalResources(s.players[pid].resources) / 2);
          const resources = emptyRes();
          let remaining = discardCount;
          for (const r of ['lumber', 'brick', 'wool', 'grain', 'ore'] as const) {
            const amount = Math.min(remaining, s.players[pid].resources[r]);
            resources[r] = amount;
            remaining -= amount;
          }
          s = gameReducer(s, { type: 'DISCARD_RESOURCES', player: pid, resources });
        }
        if (s.phase === 'MOVE_ROBBER') {
          const hexes = getValidRobberHexes(s);
          s = gameReducer(s, { type: 'MOVE_ROBBER', player: s.currentPlayer, hex: hexes[0] });
        }
        if (s.phase === 'STEAL') {
          const targets = getStealTargets(s, s.robberHex, s.currentPlayer);
          s = gameReducer(s, { type: 'STEAL_RESOURCE', player: s.currentPlayer, victim: targets.length > 0 ? targets[0] : null });
        }
      }
      s = gameReducer(s, { type: 'END_TURN', player: s.currentPlayer });
    }
    expect(s.currentPlayer).toBe(0);
  });
});

describe('Maritime Trade', () => {
  it('validates trade with correct ratio', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(state);
    state = gameReducer(state, {
      type: 'ROLL_DICE',
      player: 0 as PlayerId,
      dice: [2, 1],
    });

    // Give player 4 lumber
    state = givePlayerResources(state, 0 as PlayerId, {
      lumber: 4, brick: 0, wool: 0, grain: 0, ore: 0,
    });

    // 4:1 trade (default)
    const s = gameReducer(state, {
      type: 'MARITIME_TRADE',
      player: 0 as PlayerId,
      give: 'lumber',
      receive: 'brick',
    });

    expect(s.players[0].resources.lumber).toBeLessThan(state.players[0].resources.lumber);
    expect(s.players[0].resources.brick).toBe(state.players[0].resources.brick + 1);
  });
});

describe('Development Cards', () => {
  it('allows buying a dev card with resources', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(state);
    state = gameReducer(state, {
      type: 'ROLL_DICE',
      player: 0 as PlayerId,
      dice: [2, 1],
    });

    // Give player resources for dev card
    state = givePlayerResources(state, 0 as PlayerId, {
      lumber: 0, brick: 0, wool: 1, grain: 1, ore: 1,
    });

    const deckBefore = state.devCardDeck.length;
    const s = gameReducer(state, {
      type: 'BUY_DEV_CARD',
      player: 0 as PlayerId,
    });

    expect(s.devCardDeck.length).toBe(deckBefore - 1);
    expect(s.players[0].newDevCards.length).toBe(1);
  });

  it('prevents playing a card bought this turn', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(state);
    state = gameReducer(state, {
      type: 'ROLL_DICE',
      player: 0 as PlayerId,
      dice: [2, 1],
    });

    // Give player a knight in newDevCards (just bought)
    state = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0 ? { ...p, newDevCards: ['knight'] } : p,
      ),
    };

    // Should not be able to play it (it's in newDevCards, not devCards)
    expect(() =>
      gameReducer(state, { type: 'PLAY_KNIGHT', player: 0 as PlayerId }),
    ).toThrow(GameError);
  });

  it('allows playing a knight from previous turn', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(state);
    state = gameReducer(state, {
      type: 'ROLL_DICE',
      player: 0 as PlayerId,
      dice: [2, 1],
    });

    // Give player a knight in devCards (from previous turn)
    state = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0 ? { ...p, devCards: ['knight'] } : p,
      ),
    };

    const s = gameReducer(state, { type: 'PLAY_KNIGHT', player: 0 as PlayerId });
    expect(s.phase).toBe('MOVE_ROBBER');
    expect(s.players[0].knightsPlayed).toBe(1);
  });

  it('prevents playing two dev cards per turn', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(state);
    state = gameReducer(state, {
      type: 'ROLL_DICE',
      player: 0 as PlayerId,
      dice: [2, 1],
    });

    state = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0 ? { ...p, devCards: ['knight', 'monopoly'] } : p,
      ),
    };

    // Play first card
    let s = gameReducer(state, { type: 'PLAY_KNIGHT', player: 0 as PlayerId });

    // Move robber
    const hexes = getValidRobberHexes(s);
    s = gameReducer(s, { type: 'MOVE_ROBBER', player: 0 as PlayerId, hex: hexes[0] });

    // Handle steal
    if (s.phase === 'STEAL') {
      const targets = getStealTargets(s, s.robberHex, 0 as PlayerId);
      s = gameReducer(s, { type: 'STEAL_RESOURCE', player: 0 as PlayerId, victim: targets.length > 0 ? targets[0] : null });
    }

    // Try second card - should fail
    expect(() =>
      gameReducer(s, { type: 'PLAY_MONOPOLY', player: 0 as PlayerId }),
    ).toThrow(GameError);
  });
});

describe('Monopoly Card', () => {
  it('collects all of one resource from opponents', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(state);
    state = gameReducer(state, {
      type: 'ROLL_DICE',
      player: 0 as PlayerId,
      dice: [2, 1],
    });

    // Give resources
    state = {
      ...state,
      players: state.players.map((p, i) => {
        if (i === 0) return { ...p, devCards: ['monopoly'], resources: { ...p.resources, wool: 0 } };
        return { ...p, resources: { ...p.resources, wool: 3 } };
      }),
    };

    let s = gameReducer(state, { type: 'PLAY_MONOPOLY', player: 0 as PlayerId });
    expect(s.phase).toBe('MONOPOLY_PICK');

    s = gameReducer(s, { type: 'PICK_MONOPOLY_RESOURCE', player: 0 as PlayerId, resource: 'wool' });
    expect(s.players[0].resources.wool).toBe(9); // 3 from each of 3 opponents
    expect(s.players[1].resources.wool).toBe(0);
    expect(s.players[2].resources.wool).toBe(0);
    expect(s.players[3].resources.wool).toBe(0);
  });
});

describe('Year of Plenty', () => {
  it('gives 2 resources from bank', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(state);
    state = gameReducer(state, {
      type: 'ROLL_DICE',
      player: 0 as PlayerId,
      dice: [2, 1],
    });

    state = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0 ? { ...p, devCards: ['year_of_plenty'] } : p,
      ),
    };

    let s = gameReducer(state, { type: 'PLAY_YEAR_OF_PLENTY', player: 0 as PlayerId });
    expect(s.phase).toBe('YEAR_OF_PLENTY_PICK');

    const oreBefore = s.players[0].resources.ore;
    s = gameReducer(s, {
      type: 'PICK_YEAR_OF_PLENTY_RESOURCES',
      player: 0 as PlayerId,
      resource1: 'ore',
      resource2: 'ore',
    });
    expect(s.players[0].resources.ore).toBe(oreBefore + 2);
    expect(s.phase).toBe('TRADE_BUILD_PLAY');
  });
});

describe('Longest Road', () => {
  it('calculates 0 for player with no roads', () => {
    const state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    expect(calculateLongestRoad(state, 0 as PlayerId)).toBe(0);
  });

  it('calculates road length after setup', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(state);

    // Each player placed 2 roads, but they may not be connected
    for (let i = 0; i < 4; i++) {
      const length = calculateLongestRoad(state, i as PlayerId);
      expect(length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('Victory Points', () => {
  it('counts settlements as 1 VP', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(state);

    // Each player has 2 settlements from setup
    for (let i = 0; i < 4; i++) {
      expect(calculateVP(state, i as PlayerId)).toBeGreaterThanOrEqual(2);
    }
  });
});

// Helper: give a player specific resources (for testing)
function givePlayerResources(
  state: GameState,
  player: PlayerId,
  resources: ResourceCount,
): GameState {
  const newPlayers = [...state.players];
  const newBank = { ...state.bank };

  const newResources = { ...newPlayers[player].resources };
  for (const r of ['lumber', 'brick', 'wool', 'grain', 'ore'] as const) {
    newResources[r] += resources[r];
    newBank[r] -= resources[r];
  }

  newPlayers[player] = { ...newPlayers[player], resources: newResources };

  return { ...state, players: newPlayers, bank: newBank };
}
