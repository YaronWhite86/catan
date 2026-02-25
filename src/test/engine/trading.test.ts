import { describe, it, expect } from 'vitest';
import { createInitialState } from '../../engine/state';
import { gameReducer } from '../../engine/reducer';
import type { GameState, PlayerId, ResourceCount } from '../../engine/types';
import { getSetupOrder, getValidSetupSettlementVertices, getValidSetupRoadEdges } from '../../engine/rules/setup';
import { validateAction } from '../../engine/validator';

const SEED = 42;

function emptyRes(): ResourceCount {
  return { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 };
}

/** Helper to run setup and get to main game, then advance to TRADE_BUILD_PLAY */
function getTradeReadyState(): GameState {
  let s = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
  s = gameReducer(s, { type: 'START_GAME' });

  const order = getSetupOrder(s.playerCount);
  for (let i = 0; i < order.length; i++) {
    const player = order[i];
    const validVertices = getValidSetupSettlementVertices(s);
    s = gameReducer(s, { type: 'PLACE_SETUP_SETTLEMENT', player, vertex: validVertices[0] });
    const validEdges = getValidSetupRoadEdges(s, player);
    s = gameReducer(s, { type: 'PLACE_SETUP_ROAD', player, edge: validEdges[0] });
  }

  // Roll dice to get to TRADE_BUILD_PLAY
  s = gameReducer(s, { type: 'ROLL_DICE', player: s.currentPlayer, dice: [3, 4] });

  // If we ended up in DISCARD or MOVE_ROBBER (rolled 7), re-roll with safe dice
  if (s.phase !== 'TRADE_BUILD_PLAY') {
    // Reset and try non-7 roll
    let s2 = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    s2 = gameReducer(s2, { type: 'START_GAME' });
    const order2 = getSetupOrder(s2.playerCount);
    for (let i = 0; i < order2.length; i++) {
      const player = order2[i];
      const vv = getValidSetupSettlementVertices(s2);
      s2 = gameReducer(s2, { type: 'PLACE_SETUP_SETTLEMENT', player, vertex: vv[0] });
      const ve = getValidSetupRoadEdges(s2, player);
      s2 = gameReducer(s2, { type: 'PLACE_SETUP_ROAD', player, edge: ve[0] });
    }
    s2 = gameReducer(s2, { type: 'ROLL_DICE', player: s2.currentPlayer, dice: [2, 4] });
    return s2;
  }

  return s;
}

describe('Domestic Trade Validation', () => {
  it('rejects accept when player lacks requested resources', () => {
    let s = getTradeReadyState();
    const proposer = s.currentPlayer;

    // Give proposer some resources to offer
    const players = [...s.players];
    players[proposer] = {
      ...players[proposer],
      resources: { ...emptyRes(), brick: 2 },
    };
    s = { ...s, players };

    // Propose: offering 1 brick, requesting 1 ore
    s = gameReducer(s, {
      type: 'PROPOSE_DOMESTIC_TRADE',
      player: proposer,
      offering: { ...emptyRes(), brick: 1 },
      requesting: { ...emptyRes(), ore: 1 },
    });

    expect(s.pendingTrade).not.toBeNull();

    // Find a non-proposer who does NOT have ore
    const acceptor = ((proposer + 1) % 4) as PlayerId;
    // Ensure acceptor has no ore
    const players2 = [...s.players];
    players2[acceptor] = {
      ...players2[acceptor],
      resources: { ...emptyRes(), lumber: 3 },
    };
    s = { ...s, players: players2 };

    // Validator should reject
    const result = validateAction(s, { type: 'ACCEPT_DOMESTIC_TRADE', player: acceptor });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Not enough resources');
  });

  it('allows accept when player has requested resources', () => {
    let s = getTradeReadyState();
    const proposer = s.currentPlayer;

    // Give proposer resources to offer
    const players = [...s.players];
    players[proposer] = {
      ...players[proposer],
      resources: { ...emptyRes(), brick: 2 },
    };
    s = { ...s, players };

    // Propose: offering 1 brick, requesting 1 ore
    s = gameReducer(s, {
      type: 'PROPOSE_DOMESTIC_TRADE',
      player: proposer,
      offering: { ...emptyRes(), brick: 1 },
      requesting: { ...emptyRes(), ore: 1 },
    });

    const acceptor = ((proposer + 1) % 4) as PlayerId;
    // Give acceptor the requested ore
    const players2 = [...s.players];
    players2[acceptor] = {
      ...players2[acceptor],
      resources: { ...emptyRes(), ore: 2 },
    };
    s = { ...s, players: players2 };

    const result = validateAction(s, { type: 'ACCEPT_DOMESTIC_TRADE', player: acceptor });
    expect(result.valid).toBe(true);
  });

  it('rejects proposer accepting own trade', () => {
    let s = getTradeReadyState();
    const proposer = s.currentPlayer;

    const players = [...s.players];
    players[proposer] = {
      ...players[proposer],
      resources: { ...emptyRes(), brick: 2, ore: 2 },
    };
    s = { ...s, players };

    s = gameReducer(s, {
      type: 'PROPOSE_DOMESTIC_TRADE',
      player: proposer,
      offering: { ...emptyRes(), brick: 1 },
      requesting: { ...emptyRes(), ore: 1 },
    });

    const result = validateAction(s, { type: 'ACCEPT_DOMESTIC_TRADE', player: proposer });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Cannot accept own trade');
  });

  it('successful trade transfers resources correctly', () => {
    let s = getTradeReadyState();
    const proposer = s.currentPlayer;
    const acceptor = ((proposer + 1) % 4) as PlayerId;

    const players = [...s.players];
    players[proposer] = {
      ...players[proposer],
      resources: { ...emptyRes(), brick: 3 },
    };
    players[acceptor] = {
      ...players[acceptor],
      resources: { ...emptyRes(), ore: 2 },
    };
    s = { ...s, players };

    // Propose: offering 2 brick, requesting 1 ore
    s = gameReducer(s, {
      type: 'PROPOSE_DOMESTIC_TRADE',
      player: proposer,
      offering: { ...emptyRes(), brick: 2 },
      requesting: { ...emptyRes(), ore: 1 },
    });

    // Accept
    s = gameReducer(s, { type: 'ACCEPT_DOMESTIC_TRADE', player: acceptor });

    // Proposer: 3 - 2 brick + 1 ore = 1 brick, 1 ore
    expect(s.players[proposer].resources.brick).toBe(1);
    expect(s.players[proposer].resources.ore).toBe(1);
    // Acceptor: 2 - 1 ore + 2 brick = 2 brick, 1 ore
    expect(s.players[acceptor].resources.brick).toBe(2);
    expect(s.players[acceptor].resources.ore).toBe(1);
    // Trade should be cleared
    expect(s.pendingTrade).toBeNull();
  });
});
