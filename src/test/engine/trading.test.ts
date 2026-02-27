import { describe, it, expect } from 'vitest';
import { createInitialState } from '../../engine/state';
import { gameReducer } from '../../engine/reducer';
import type { GameState, PlayerId, ResourceCount } from '../../engine/types';
import { ALL_RESOURCES } from '../../engine/types';
import { getSetupOrder, getValidSetupSettlementVertices, getValidSetupRoadEdges } from '../../engine/rules/setup';
import { validateAction } from '../../engine/validator';
import { getPlayerTradeRatio } from '../../engine/rules/trading';

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

/** Helper: set a player's resources directly (adjusting bank accordingly) */
function givePlayerResources(state: GameState, player: PlayerId, resources: ResourceCount): GameState {
  // Calculate delta from current resources to maintain bank consistency
  const current = state.players[player].resources;
  const newPlayers = [...state.players];
  newPlayers[player] = {
    ...newPlayers[player],
    resources: { ...resources },
  };

  const newBank = { ...state.bank };
  for (const r of ALL_RESOURCES) {
    // Return current resources to bank, then take new resources from bank
    newBank[r] = newBank[r] + current[r] - resources[r];
  }

  return { ...state, players: newPlayers, bank: newBank };
}

/** Helper: set up a state with a pending trade */
function getStateWithPendingTrade(): { state: GameState; proposer: PlayerId; acceptor: PlayerId } {
  let s = getTradeReadyState();
  const proposer = s.currentPlayer;
  const acceptor = ((proposer + 1) % 4) as PlayerId;

  s = givePlayerResources(s, proposer, { ...emptyRes(), brick: 3 });
  s = givePlayerResources(s, acceptor, { ...emptyRes(), ore: 2 });

  s = gameReducer(s, {
    type: 'PROPOSE_DOMESTIC_TRADE',
    player: proposer,
    offering: { ...emptyRes(), brick: 1 },
    requesting: { ...emptyRes(), ore: 1 },
  });

  return { state: s, proposer, acceptor };
}

// ═════════════════════════════════════════════════════════════════════
// Category 1: Domestic Proposal Validation
// ═════════════════════════════════════════════════════════════════════

describe('Domestic Proposal Validation', () => {
  it('rejects proposal in wrong phase (ROLL_DICE)', () => {
    let s = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    s = gameReducer(s, { type: 'START_GAME' });

    const order = getSetupOrder(s.playerCount);
    for (let i = 0; i < order.length; i++) {
      const player = order[i];
      const vv = getValidSetupSettlementVertices(s);
      s = gameReducer(s, { type: 'PLACE_SETUP_SETTLEMENT', player, vertex: vv[0] });
      const ve = getValidSetupRoadEdges(s, player);
      s = gameReducer(s, { type: 'PLACE_SETUP_ROAD', player, edge: ve[0] });
    }

    // Now in ROLL_DICE phase
    expect(s.phase).toBe('ROLL_DICE');
    const result = validateAction(s, {
      type: 'PROPOSE_DOMESTIC_TRADE',
      player: s.currentPlayer,
      offering: { ...emptyRes(), brick: 1 },
      requesting: { ...emptyRes(), ore: 1 },
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Not in trade phase');
  });

  it('rejects proposal from non-current player', () => {
    const s = getTradeReadyState();
    const nonCurrent = ((s.currentPlayer + 1) % 4) as PlayerId;

    const result = validateAction(s, {
      type: 'PROPOSE_DOMESTIC_TRADE',
      player: nonCurrent,
      offering: { ...emptyRes(), brick: 1 },
      requesting: { ...emptyRes(), ore: 1 },
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Not your turn');
  });

  it('rejects proposal when proposer lacks offered resources', () => {
    let s = getTradeReadyState();
    s = givePlayerResources(s, s.currentPlayer, emptyRes());

    const result = validateAction(s, {
      type: 'PROPOSE_DOMESTIC_TRADE',
      player: s.currentPlayer,
      offering: { ...emptyRes(), brick: 1 },
      requesting: { ...emptyRes(), ore: 1 },
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Not enough resources');
  });

  it('rejects proposal when trade is already pending', () => {
    const { state, proposer } = getStateWithPendingTrade();

    const result = validateAction(state, {
      type: 'PROPOSE_DOMESTIC_TRADE',
      player: proposer,
      offering: { ...emptyRes(), brick: 1 },
      requesting: { ...emptyRes(), ore: 1 },
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Trade already pending');
  });

  it('rejects proposal with zero offering', () => {
    let s = getTradeReadyState();
    s = givePlayerResources(s, s.currentPlayer, { ...emptyRes(), brick: 2 });

    const result = validateAction(s, {
      type: 'PROPOSE_DOMESTIC_TRADE',
      player: s.currentPlayer,
      offering: emptyRes(),
      requesting: { ...emptyRes(), ore: 1 },
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Trade must include resources');
  });

  it('rejects proposal with zero requesting', () => {
    let s = getTradeReadyState();
    s = givePlayerResources(s, s.currentPlayer, { ...emptyRes(), brick: 2 });

    const result = validateAction(s, {
      type: 'PROPOSE_DOMESTIC_TRADE',
      player: s.currentPlayer,
      offering: { ...emptyRes(), brick: 1 },
      requesting: emptyRes(),
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Trade must include resources');
  });

  it('accepts valid proposal and sets pendingTrade correctly', () => {
    let s = getTradeReadyState();
    const proposer = s.currentPlayer;
    s = givePlayerResources(s, proposer, { ...emptyRes(), brick: 2 });

    const offering = { ...emptyRes(), brick: 1 };
    const requesting = { ...emptyRes(), ore: 1 };

    s = gameReducer(s, {
      type: 'PROPOSE_DOMESTIC_TRADE',
      player: proposer,
      offering,
      requesting,
    });

    expect(s.pendingTrade).not.toBeNull();
    expect(s.pendingTrade!.from).toBe(proposer);
    expect(s.pendingTrade!.offering).toEqual(offering);
    expect(s.pendingTrade!.requesting).toEqual(requesting);
    expect(s.pendingTrade!.acceptedBy).toBeNull();
  });

  it('accepts multi-resource offering proposal', () => {
    let s = getTradeReadyState();
    const proposer = s.currentPlayer;
    s = givePlayerResources(s, proposer, { lumber: 2, brick: 3, wool: 0, grain: 0, ore: 0 });

    const offering = { lumber: 1, brick: 2, wool: 0, grain: 0, ore: 0 };
    const requesting = { ...emptyRes(), ore: 2 };

    s = gameReducer(s, {
      type: 'PROPOSE_DOMESTIC_TRADE',
      player: proposer,
      offering,
      requesting,
    });

    expect(s.pendingTrade).not.toBeNull();
    expect(s.pendingTrade!.offering).toEqual(offering);
  });
});

// ═════════════════════════════════════════════════════════════════════
// Category 2: Domestic Accept Validation
// ═════════════════════════════════════════════════════════════════════

describe('Domestic Accept Validation', () => {
  it('rejects accept when no pending trade', () => {
    const s = getTradeReadyState();
    const player = ((s.currentPlayer + 1) % 4) as PlayerId;

    const result = validateAction(s, { type: 'ACCEPT_DOMESTIC_TRADE', player });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('No pending trade');
  });

  it('rejects accept when acceptor lacks requested resources', () => {
    let s = getTradeReadyState();
    const proposer = s.currentPlayer;

    // Give proposer some resources to offer
    s = givePlayerResources(s, proposer, { ...emptyRes(), brick: 2 });

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
    s = givePlayerResources(s, acceptor, { ...emptyRes(), lumber: 3 });

    // Validator should reject
    const result = validateAction(s, { type: 'ACCEPT_DOMESTIC_TRADE', player: acceptor });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Not enough resources');
  });

  it('allows accept when acceptor has requested resources', () => {
    let s = getTradeReadyState();
    const proposer = s.currentPlayer;

    // Give proposer resources to offer
    s = givePlayerResources(s, proposer, { ...emptyRes(), brick: 2 });

    // Propose: offering 1 brick, requesting 1 ore
    s = gameReducer(s, {
      type: 'PROPOSE_DOMESTIC_TRADE',
      player: proposer,
      offering: { ...emptyRes(), brick: 1 },
      requesting: { ...emptyRes(), ore: 1 },
    });

    const acceptor = ((proposer + 1) % 4) as PlayerId;
    // Give acceptor the requested ore
    s = givePlayerResources(s, acceptor, { ...emptyRes(), ore: 2 });

    const result = validateAction(s, { type: 'ACCEPT_DOMESTIC_TRADE', player: acceptor });
    expect(result.valid).toBe(true);
  });

  it('rejects proposer accepting own trade', () => {
    let s = getTradeReadyState();
    const proposer = s.currentPlayer;

    s = givePlayerResources(s, proposer, { ...emptyRes(), brick: 2, ore: 2 });

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

  it('rejects accept when proposer no longer has offered resources (Fix B)', () => {
    let s = getTradeReadyState();
    const proposer = s.currentPlayer;
    const acceptor = ((proposer + 1) % 4) as PlayerId;

    s = givePlayerResources(s, proposer, { ...emptyRes(), brick: 2 });
    s = givePlayerResources(s, acceptor, { ...emptyRes(), ore: 2 });

    s = gameReducer(s, {
      type: 'PROPOSE_DOMESTIC_TRADE',
      player: proposer,
      offering: { ...emptyRes(), brick: 2 },
      requesting: { ...emptyRes(), ore: 1 },
    });

    // Simulate proposer losing resources (manually set to 0 to bypass normal flow)
    s = givePlayerResources(s, proposer, emptyRes());

    const result = validateAction(s, { type: 'ACCEPT_DOMESTIC_TRADE', player: acceptor });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Proposer no longer has the offered resources');
  });

  it('rejects accept when proposer has only partial offered resources', () => {
    let s = getTradeReadyState();
    const proposer = s.currentPlayer;
    const acceptor = ((proposer + 1) % 4) as PlayerId;

    s = givePlayerResources(s, proposer, { ...emptyRes(), brick: 3 });
    s = givePlayerResources(s, acceptor, { ...emptyRes(), ore: 2 });

    s = gameReducer(s, {
      type: 'PROPOSE_DOMESTIC_TRADE',
      player: proposer,
      offering: { ...emptyRes(), brick: 3 },
      requesting: { ...emptyRes(), ore: 1 },
    });

    // Proposer now has only 1 brick (lost some somehow)
    s = givePlayerResources(s, proposer, { ...emptyRes(), brick: 1 });

    const result = validateAction(s, { type: 'ACCEPT_DOMESTIC_TRADE', player: acceptor });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Proposer no longer has the offered resources');
  });
});

// ═════════════════════════════════════════════════════════════════════
// Category 3: Domestic Resource Transfer
// ═════════════════════════════════════════════════════════════════════

describe('Domestic Resource Transfer', () => {
  it('single-resource trade transfers correctly', () => {
    let s = getTradeReadyState();
    const proposer = s.currentPlayer;
    const acceptor = ((proposer + 1) % 4) as PlayerId;

    s = givePlayerResources(s, proposer, { ...emptyRes(), brick: 3 });
    s = givePlayerResources(s, acceptor, { ...emptyRes(), ore: 2 });

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
  });

  it('multi-resource trade transfers correctly', () => {
    let s = getTradeReadyState();
    const proposer = s.currentPlayer;
    const acceptor = ((proposer + 1) % 4) as PlayerId;

    s = givePlayerResources(s, proposer, { lumber: 2, brick: 3, wool: 0, grain: 0, ore: 0 });
    s = givePlayerResources(s, acceptor, { lumber: 0, brick: 0, wool: 1, grain: 2, ore: 0 });

    s = gameReducer(s, {
      type: 'PROPOSE_DOMESTIC_TRADE',
      player: proposer,
      offering: { lumber: 1, brick: 2, wool: 0, grain: 0, ore: 0 },
      requesting: { lumber: 0, brick: 0, wool: 1, grain: 1, ore: 0 },
    });

    s = gameReducer(s, { type: 'ACCEPT_DOMESTIC_TRADE', player: acceptor });

    // Proposer: had (2L, 3B) - (1L, 2B) + (1W, 1G) = (1L, 1B, 1W, 1G)
    expect(s.players[proposer].resources).toEqual({ lumber: 1, brick: 1, wool: 1, grain: 1, ore: 0 });
    // Acceptor: had (1W, 2G) - (1W, 1G) + (1L, 2B) = (1L, 2B, 0W, 1G)
    expect(s.players[acceptor].resources).toEqual({ lumber: 1, brick: 2, wool: 0, grain: 1, ore: 0 });
  });

  it('pendingTrade is cleared after accept', () => {
    const { state, acceptor } = getStateWithPendingTrade();
    expect(state.pendingTrade).not.toBeNull();

    const s = gameReducer(state, { type: 'ACCEPT_DOMESTIC_TRADE', player: acceptor });
    expect(s.pendingTrade).toBeNull();
  });

  it('uninvolved players are unaffected by trade', () => {
    const { state, proposer, acceptor } = getStateWithPendingTrade();
    const uninvolved1 = ((proposer + 2) % 4) as PlayerId;
    const uninvolved2 = ((proposer + 3) % 4) as PlayerId;

    const before1 = { ...state.players[uninvolved1].resources };
    const before2 = { ...state.players[uninvolved2].resources };

    const s = gameReducer(state, { type: 'ACCEPT_DOMESTIC_TRADE', player: acceptor });

    expect(s.players[uninvolved1].resources).toEqual(before1);
    expect(s.players[uninvolved2].resources).toEqual(before2);
  });

  it('log entries are recorded for proposal and acceptance', () => {
    const { state, acceptor } = getStateWithPendingTrade();
    const logBefore = state.log.length;

    // The proposal already added a log entry; check acceptance adds one
    const s = gameReducer(state, { type: 'ACCEPT_DOMESTIC_TRADE', player: acceptor });

    expect(s.log.length).toBeGreaterThan(logBefore);
    expect(s.log[s.log.length - 1]).toContain('accepted the trade');
  });
});

// ═════════════════════════════════════════════════════════════════════
// Category 4: Domestic Reject Behavior
// ═════════════════════════════════════════════════════════════════════

describe('Domestic Reject Behavior', () => {
  it('reject clears pendingTrade', () => {
    const { state, acceptor } = getStateWithPendingTrade();
    expect(state.pendingTrade).not.toBeNull();

    const s = gameReducer(state, { type: 'REJECT_DOMESTIC_TRADE', player: acceptor });
    expect(s.pendingTrade).toBeNull();
  });

  it('reject does not transfer any resources', () => {
    const { state, proposer, acceptor } = getStateWithPendingTrade();
    const proposerRes = { ...state.players[proposer].resources };
    const acceptorRes = { ...state.players[acceptor].resources };

    const s = gameReducer(state, { type: 'REJECT_DOMESTIC_TRADE', player: acceptor });

    expect(s.players[proposer].resources).toEqual(proposerRes);
    expect(s.players[acceptor].resources).toEqual(acceptorRes);
  });

  it('proposer can cancel own trade (reject)', () => {
    const { state, proposer } = getStateWithPendingTrade();

    // Proposer rejects their own trade (cancellation)
    const result = validateAction(state, { type: 'REJECT_DOMESTIC_TRADE', player: proposer });
    expect(result.valid).toBe(true);

    const s = gameReducer(state, { type: 'REJECT_DOMESTIC_TRADE', player: proposer });
    expect(s.pendingTrade).toBeNull();
  });

  it('uninvolved player can reject', () => {
    const { state, proposer } = getStateWithPendingTrade();
    const uninvolved = ((proposer + 2) % 4) as PlayerId;

    const result = validateAction(state, { type: 'REJECT_DOMESTIC_TRADE', player: uninvolved });
    expect(result.valid).toBe(true);

    const s = gameReducer(state, { type: 'REJECT_DOMESTIC_TRADE', player: uninvolved });
    expect(s.pendingTrade).toBeNull();
  });

  it('reject with no pending trade returns error', () => {
    const s = getTradeReadyState();
    expect(s.pendingTrade).toBeNull();

    const result = validateAction(s, { type: 'REJECT_DOMESTIC_TRADE', player: s.currentPlayer });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('No pending trade');
  });

  it('can propose again after reject', () => {
    const { state, proposer, acceptor } = getStateWithPendingTrade();

    // Reject
    let s = gameReducer(state, { type: 'REJECT_DOMESTIC_TRADE', player: acceptor });
    expect(s.pendingTrade).toBeNull();

    // Propose again
    const result = validateAction(s, {
      type: 'PROPOSE_DOMESTIC_TRADE',
      player: proposer,
      offering: { ...emptyRes(), brick: 1 },
      requesting: { ...emptyRes(), ore: 1 },
    });
    expect(result.valid).toBe(true);

    s = gameReducer(s, {
      type: 'PROPOSE_DOMESTIC_TRADE',
      player: proposer,
      offering: { ...emptyRes(), brick: 1 },
      requesting: { ...emptyRes(), ore: 1 },
    });
    expect(s.pendingTrade).not.toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════
// Category 5: Building Blocked While Trade Pending (Fix A)
// ═════════════════════════════════════════════════════════════════════

describe('Building Blocked While Trade Pending (Fix A)', () => {
  it('cannot build road while trade is pending', () => {
    const { state, proposer } = getStateWithPendingTrade();

    // Give proposer road resources
    const s = givePlayerResources(state, proposer, { lumber: 5, brick: 5, wool: 0, grain: 0, ore: 0 });

    const result = validateAction(s, {
      type: 'BUILD_ROAD',
      player: proposer,
      edge: 0, // edge doesn't matter - should fail before location check
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Cannot build while trade is pending');
  });

  it('cannot build settlement while trade is pending', () => {
    const { state, proposer } = getStateWithPendingTrade();

    const result = validateAction(state, {
      type: 'BUILD_SETTLEMENT',
      player: proposer,
      vertex: 0,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Cannot build while trade is pending');
  });

  it('cannot build city while trade is pending', () => {
    const { state, proposer } = getStateWithPendingTrade();

    const result = validateAction(state, {
      type: 'BUILD_CITY',
      player: proposer,
      vertex: 0,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Cannot build while trade is pending');
  });

  it('cannot buy dev card while trade is pending', () => {
    const { state, proposer } = getStateWithPendingTrade();

    const s = givePlayerResources(state, proposer, { lumber: 0, brick: 0, wool: 5, grain: 5, ore: 5 });

    const result = validateAction(s, {
      type: 'BUY_DEV_CARD',
      player: proposer,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Cannot build while trade is pending');
  });
});

// ═════════════════════════════════════════════════════════════════════
// Category 6: Maritime Trade Validation
// ═════════════════════════════════════════════════════════════════════

describe('Maritime Trade Validation', () => {
  it('rejects maritime trade in wrong phase', () => {
    let s = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    s = gameReducer(s, { type: 'START_GAME' });

    const order = getSetupOrder(s.playerCount);
    for (let i = 0; i < order.length; i++) {
      const player = order[i];
      const vv = getValidSetupSettlementVertices(s);
      s = gameReducer(s, { type: 'PLACE_SETUP_SETTLEMENT', player, vertex: vv[0] });
      const ve = getValidSetupRoadEdges(s, player);
      s = gameReducer(s, { type: 'PLACE_SETUP_ROAD', player, edge: ve[0] });
    }

    expect(s.phase).toBe('ROLL_DICE');
    const result = validateAction(s, {
      type: 'MARITIME_TRADE',
      player: s.currentPlayer,
      give: 'brick',
      receive: 'ore',
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Not in trade phase');
  });

  it('rejects maritime trade from non-current player', () => {
    let s = getTradeReadyState();
    const nonCurrent = ((s.currentPlayer + 1) % 4) as PlayerId;
    s = givePlayerResources(s, nonCurrent, { ...emptyRes(), brick: 4 });

    const result = validateAction(s, {
      type: 'MARITIME_TRADE',
      player: nonCurrent,
      give: 'brick',
      receive: 'ore',
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Not your turn');
  });

  it('rejects maritime trade with same give/receive', () => {
    let s = getTradeReadyState();
    s = givePlayerResources(s, s.currentPlayer, { ...emptyRes(), brick: 8 });

    const result = validateAction(s, {
      type: 'MARITIME_TRADE',
      player: s.currentPlayer,
      give: 'brick',
      receive: 'brick',
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Invalid maritime trade');
  });

  it('rejects maritime trade with insufficient resources for 4:1', () => {
    let s = getTradeReadyState();
    s = givePlayerResources(s, s.currentPlayer, { ...emptyRes(), brick: 3 });

    const result = validateAction(s, {
      type: 'MARITIME_TRADE',
      player: s.currentPlayer,
      give: 'brick',
      receive: 'ore',
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Invalid maritime trade');
  });

  it('rejects maritime trade when bank has 0 of requested resource', () => {
    let s = getTradeReadyState();
    s = givePlayerResources(s, s.currentPlayer, { ...emptyRes(), brick: 4 });

    // Drain the bank of ore
    s = { ...s, bank: { ...s.bank, ore: 0 } };

    const result = validateAction(s, {
      type: 'MARITIME_TRADE',
      player: s.currentPlayer,
      give: 'brick',
      receive: 'ore',
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Invalid maritime trade');
  });

  it('accepts valid 4:1 maritime trade', () => {
    let s = getTradeReadyState();
    s = givePlayerResources(s, s.currentPlayer, { ...emptyRes(), brick: 4 });

    const result = validateAction(s, {
      type: 'MARITIME_TRADE',
      player: s.currentPlayer,
      give: 'brick',
      receive: 'ore',
    });
    expect(result.valid).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════
// Category 7: Maritime Trade Resource Transfer
// ═════════════════════════════════════════════════════════════════════

describe('Maritime Trade Resource Transfer', () => {
  it('4:1 trade: player loses 4 of given resource, gains 1 of received', () => {
    let s = getTradeReadyState();
    const player = s.currentPlayer;
    s = givePlayerResources(s, player, { ...emptyRes(), brick: 5 });

    s = gameReducer(s, {
      type: 'MARITIME_TRADE',
      player,
      give: 'brick',
      receive: 'ore',
    });

    expect(s.players[player].resources.brick).toBe(1); // 5 - 4
    expect(s.players[player].resources.ore).toBe(1);   // 0 + 1
  });

  it('bank is updated symmetrically in maritime trade', () => {
    let s = getTradeReadyState();
    const player = s.currentPlayer;
    s = givePlayerResources(s, player, { ...emptyRes(), brick: 4 });

    const bankBrickBefore = s.bank.brick;
    const bankOreBefore = s.bank.ore;

    s = gameReducer(s, {
      type: 'MARITIME_TRADE',
      player,
      give: 'brick',
      receive: 'ore',
    });

    expect(s.bank.brick).toBe(bankBrickBefore + 4);
    expect(s.bank.ore).toBe(bankOreBefore - 1);
  });

  it('log entry is recorded for maritime trade', () => {
    let s = getTradeReadyState();
    const player = s.currentPlayer;
    s = givePlayerResources(s, player, { ...emptyRes(), brick: 4 });
    const logBefore = s.log.length;

    s = gameReducer(s, {
      type: 'MARITIME_TRADE',
      player,
      give: 'brick',
      receive: 'ore',
    });

    expect(s.log.length).toBeGreaterThan(logBefore);
    expect(s.log[s.log.length - 1]).toContain('maritime');
  });

  it('multiple maritime trades in one turn', () => {
    let s = getTradeReadyState();
    const player = s.currentPlayer;
    s = givePlayerResources(s, player, { ...emptyRes(), brick: 8 });

    // First trade
    s = gameReducer(s, {
      type: 'MARITIME_TRADE',
      player,
      give: 'brick',
      receive: 'ore',
    });

    expect(s.players[player].resources.brick).toBe(4);
    expect(s.players[player].resources.ore).toBe(1);

    // Second trade
    s = gameReducer(s, {
      type: 'MARITIME_TRADE',
      player,
      give: 'brick',
      receive: 'lumber',
    });

    expect(s.players[player].resources.brick).toBe(0);
    expect(s.players[player].resources.ore).toBe(1);
    expect(s.players[player].resources.lumber).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════
// Category 8: Maritime Harbor Ratios
// ═════════════════════════════════════════════════════════════════════

describe('Maritime Harbor Ratios', () => {
  it('3:1 generic port allows trade at ratio 3', () => {
    let s = getTradeReadyState();
    const player = s.currentPlayer;

    // Find a generic harbor and place a settlement on one of its vertices
    const genericHarbor = s.harbors.find(h => h.type === 'generic');
    expect(genericHarbor).toBeDefined();

    // Place a building on one of the harbor vertices (directly manipulate state)
    const harborVertex = genericHarbor!.vertices[0];
    const newVertexBuildings = [...s.vertexBuildings];
    newVertexBuildings[harborVertex] = { type: 'settlement', owner: player };
    s = { ...s, vertexBuildings: newVertexBuildings };

    s = givePlayerResources(s, player, { ...emptyRes(), brick: 3 });

    // Player should be able to trade at 3:1
    const ratio = getPlayerTradeRatio(s, player, 'brick');
    expect(ratio).toBe(3);

    const result = validateAction(s, {
      type: 'MARITIME_TRADE',
      player,
      give: 'brick',
      receive: 'ore',
    });
    expect(result.valid).toBe(true);
  });

  it('2:1 specific port allows trade at ratio 2 for that resource', () => {
    let s = getTradeReadyState();
    const player = s.currentPlayer;

    // Find a specific harbor (e.g., brick)
    const specificHarbor = s.harbors.find(h => h.type !== 'generic');
    expect(specificHarbor).toBeDefined();
    const harborResource = specificHarbor!.type as string;

    // Place a building on one of the harbor vertices
    const harborVertex = specificHarbor!.vertices[0];
    const newVertexBuildings = [...s.vertexBuildings];
    newVertexBuildings[harborVertex] = { type: 'settlement', owner: player };
    s = { ...s, vertexBuildings: newVertexBuildings };

    const ratio = getPlayerTradeRatio(s, player, harborResource as any);
    expect(ratio).toBe(2);
  });

  it('2:1 port does not affect other resources', () => {
    let s = getTradeReadyState();
    const player = s.currentPlayer;

    // Find a specific harbor
    const specificHarbor = s.harbors.find(h => h.type !== 'generic');
    expect(specificHarbor).toBeDefined();
    const harborResource = specificHarbor!.type as string;

    // Place a building on one of the harbor vertices
    const harborVertex = specificHarbor!.vertices[0];
    const newVertexBuildings = [...s.vertexBuildings];
    newVertexBuildings[harborVertex] = { type: 'settlement', owner: player };
    s = { ...s, vertexBuildings: newVertexBuildings };

    // For a different resource, ratio should still be 4 (no generic harbor access)
    const otherResource = ALL_RESOURCES.find(r => r !== harborResource)!;
    // Check the ratio - it could be 4 if no other harbor, or something else depending on setup
    const ratio = getPlayerTradeRatio(s, player, otherResource);
    // The specific port only helps its own resource; without a generic port, others remain at 4
    // (unless the player also has settlements on other harbors from setup)
    expect(ratio).toBeGreaterThanOrEqual(3); // at least 3 (could have generic from setup)
    expect(ratio).toBeGreaterThan(2); // but should not be 2 for this resource
  });

  it('3:1 port rejects with only 2 of the resource', () => {
    let s = getTradeReadyState();
    const player = s.currentPlayer;

    // Place a building on a generic harbor vertex
    const genericHarbor = s.harbors.find(h => h.type === 'generic');
    expect(genericHarbor).toBeDefined();

    const harborVertex = genericHarbor!.vertices[0];
    const newVertexBuildings = [...s.vertexBuildings];
    newVertexBuildings[harborVertex] = { type: 'settlement', owner: player };
    s = { ...s, vertexBuildings: newVertexBuildings };

    // Give player only 2 of a resource (less than 3:1 ratio)
    s = givePlayerResources(s, player, { ...emptyRes(), wool: 2 });

    const result = validateAction(s, {
      type: 'MARITIME_TRADE',
      player,
      give: 'wool',
      receive: 'ore',
    });
    expect(result.valid).toBe(false);
  });

  it('getPlayerTradeRatio returns correct default (4) with no harbors', () => {
    let s = getTradeReadyState();
    const player = s.currentPlayer;

    // Remove all buildings from harbor vertices to ensure no harbor access
    const harborVertices = new Set<number>();
    for (const h of s.harbors) {
      harborVertices.add(h.vertices[0]);
      harborVertices.add(h.vertices[1]);
    }

    const newVertexBuildings = [...s.vertexBuildings];
    for (const vid of harborVertices) {
      newVertexBuildings[vid] = null;
    }
    s = { ...s, vertexBuildings: newVertexBuildings };

    for (const resource of ALL_RESOURCES) {
      const ratio = getPlayerTradeRatio(s, player, resource);
      expect(ratio).toBe(4);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════
// Category 9: Trade Phase Constraints
// ═════════════════════════════════════════════════════════════════════

describe('Trade Phase Constraints', () => {
  it('END_TURN clears pendingTrade', () => {
    const { state, proposer } = getStateWithPendingTrade();
    expect(state.pendingTrade).not.toBeNull();

    // Clear pending trade first so END_TURN can proceed (pending trade state shouldn't block end turn)
    // Actually, let's check: the reducer should clear pendingTrade on END_TURN
    const s = gameReducer(state, { type: 'END_TURN', player: proposer });
    expect(s.pendingTrade).toBeNull();
  });

  it('cannot propose trade during ROLL_DICE phase', () => {
    let s = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    s = gameReducer(s, { type: 'START_GAME' });

    const order = getSetupOrder(s.playerCount);
    for (let i = 0; i < order.length; i++) {
      const player = order[i];
      const vv = getValidSetupSettlementVertices(s);
      s = gameReducer(s, { type: 'PLACE_SETUP_SETTLEMENT', player, vertex: vv[0] });
      const ve = getValidSetupRoadEdges(s, player);
      s = gameReducer(s, { type: 'PLACE_SETUP_ROAD', player, edge: ve[0] });
    }

    expect(s.phase).toBe('ROLL_DICE');
    const result = validateAction(s, {
      type: 'PROPOSE_DOMESTIC_TRADE',
      player: s.currentPlayer,
      offering: { ...emptyRes(), brick: 1 },
      requesting: { ...emptyRes(), ore: 1 },
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Not in trade phase');
  });

  it('propose → reject → propose again in same turn', () => {
    let s = getTradeReadyState();
    const proposer = s.currentPlayer;
    const other = ((proposer + 1) % 4) as PlayerId;

    s = givePlayerResources(s, proposer, { ...emptyRes(), brick: 3, wool: 2 });

    // First proposal
    s = gameReducer(s, {
      type: 'PROPOSE_DOMESTIC_TRADE',
      player: proposer,
      offering: { ...emptyRes(), brick: 1 },
      requesting: { ...emptyRes(), ore: 1 },
    });
    expect(s.pendingTrade).not.toBeNull();

    // Reject
    s = gameReducer(s, { type: 'REJECT_DOMESTIC_TRADE', player: other });
    expect(s.pendingTrade).toBeNull();

    // Second proposal (different offer)
    s = gameReducer(s, {
      type: 'PROPOSE_DOMESTIC_TRADE',
      player: proposer,
      offering: { ...emptyRes(), wool: 1 },
      requesting: { ...emptyRes(), lumber: 1 },
    });
    expect(s.pendingTrade).not.toBeNull();
    expect(s.pendingTrade!.offering.wool).toBe(1);
  });

  it('propose → accept → propose again in same turn', () => {
    let s = getTradeReadyState();
    const proposer = s.currentPlayer;
    const acceptor = ((proposer + 1) % 4) as PlayerId;

    s = givePlayerResources(s, proposer, { ...emptyRes(), brick: 3, wool: 2 });
    s = givePlayerResources(s, acceptor, { ...emptyRes(), ore: 3 });

    // First proposal
    s = gameReducer(s, {
      type: 'PROPOSE_DOMESTIC_TRADE',
      player: proposer,
      offering: { ...emptyRes(), brick: 1 },
      requesting: { ...emptyRes(), ore: 1 },
    });

    // Accept
    s = gameReducer(s, { type: 'ACCEPT_DOMESTIC_TRADE', player: acceptor });
    expect(s.pendingTrade).toBeNull();

    // Proposer now has brick:2, wool:2, ore:1 - propose again
    s = gameReducer(s, {
      type: 'PROPOSE_DOMESTIC_TRADE',
      player: proposer,
      offering: { ...emptyRes(), wool: 1 },
      requesting: { ...emptyRes(), lumber: 1 },
    });
    expect(s.pendingTrade).not.toBeNull();
    expect(s.pendingTrade!.offering.wool).toBe(1);
  });
});
