import { describe, it, expect } from 'vitest';
import { createInitialState } from '../../engine/state';
import { gameReducer } from '../../engine/reducer';
import type { GameState, PlayerId } from '../../engine/types';
import { ALL_RESOURCES } from '../../engine/types';
import { getSetupOrder, getValidSetupSettlementVertices, getValidSetupRoadEdges } from '../../engine/rules/setup';
import { getValidRobberHexes, getStealTargets } from '../../engine/rules/robber';
import { calculateVP } from '../../engine/rules/victory';
import { canPlayDevCard } from '../../engine/rules/dev-cards';
import { updateLongestRoad } from '../../engine/rules/longest-road';
import { totalResources } from '../../engine/utils/resource-utils';
import { BANK_RESOURCES_PER_TYPE } from '../../engine/constants';
import { validateAction } from '../../engine/validator';
import { chooseAIAction } from '../../ai/controller/ai-controller';
import { getActingPlayer } from '../../ai/action-enumerator';

const SEED = 12345;

function emptyRes() {
  return { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 };
}

function handleRobberFlow(state: GameState): GameState {
  let s = state;

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

  if (s.phase === 'MOVE_ROBBER') {
    const hexes = getValidRobberHexes(s);
    s = gameReducer(s, { type: 'MOVE_ROBBER', player: s.currentPlayer, hex: hexes[0] });
  }

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

function rollAndHandle(state: GameState, dice?: [number, number]): GameState {
  let s = gameReducer(state, {
    type: 'ROLL_DICE',
    player: state.currentPlayer,
    dice,
  });
  return handleRobberFlow(s);
}

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

/**
 * Inject buildings for a player to reach a target VP from buildings alone.
 * Uses state manipulation (no resource checks) to place cities/settlements.
 */
function injectBuildingsForVP(
  state: GameState,
  player: PlayerId,
  targetVP: number,
): GameState {
  // Current building VP
  let currentBuildingVP = 0;
  for (let vid = 0; vid < state.topology.vertexCount; vid++) {
    const b = state.vertexBuildings[vid];
    if (b !== null && b.owner === player) {
      currentBuildingVP += b.type === 'city' ? 2 : 1;
    }
  }

  let needed = targetVP - currentBuildingVP;
  if (needed <= 0) return state;

  const newVertexBuildings = [...state.vertexBuildings];

  // First upgrade existing settlements to cities (gains +1 each)
  for (let vid = 0; vid < state.topology.vertexCount && needed > 0; vid++) {
    const b = newVertexBuildings[vid];
    if (b !== null && b.owner === player && b.type === 'settlement') {
      newVertexBuildings[vid] = { type: 'city', owner: player };
      needed -= 1; // city is 2VP, was 1VP, net +1
    }
  }

  // Place new buildings to fill remaining VP
  for (let vid = 0; vid < state.topology.vertexCount && needed > 0; vid++) {
    if (newVertexBuildings[vid] !== null) continue;
    // Distance rule check
    const tooClose = state.topology.vertexAdjacentVertices[vid].some(
      adj => newVertexBuildings[adj] !== null
    );
    if (tooClose) continue;

    if (needed >= 2) {
      newVertexBuildings[vid] = { type: 'city', owner: player };
      needed -= 2;
    } else {
      newVertexBuildings[vid] = { type: 'settlement', owner: player };
      needed -= 1;
    }
  }

  return { ...state, vertexBuildings: newVertexBuildings };
}

// ─── Win Detection ──────────────────────────────────────

describe('Win Detection', () => {
  it('10 VP from buildings triggers GAME_OVER', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(state);
    state = rollAndHandle(state, [3, 3]);

    // Inject buildings to reach 10 VP
    state = injectBuildingsForVP(state, 0 as PlayerId, 10);

    const vp = calculateVP(state, 0 as PlayerId);
    expect(vp).toBeGreaterThanOrEqual(10);

    // END_TURN should trigger GAME_OVER
    state = gameReducer(state, { type: 'END_TURN', player: 0 as PlayerId });
    expect(state.phase).toBe('GAME_OVER');
  });

  it('9 VP does not trigger GAME_OVER', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(state);
    state = rollAndHandle(state, [3, 3]);

    // Inject buildings to reach exactly 9 VP
    state = injectBuildingsForVP(state, 0 as PlayerId, 9);

    // Make sure no other VP sources
    state = {
      ...state,
      longestRoadPlayer: null,
      largestArmyPlayer: null,
      players: state.players.map((p, i) => ({
        ...p,
        devCards: i === 0 ? p.devCards.filter(c => c !== 'victory_point') : p.devCards,
        newDevCards: i === 0 ? p.newDevCards.filter(c => c !== 'victory_point') : p.newDevCards,
      })),
    };

    const vp = calculateVP(state, 0 as PlayerId);
    expect(vp).toBe(9);

    state = gameReducer(state, { type: 'END_TURN', player: 0 as PlayerId });
    expect(state.phase).toBe('ROLL_DICE');
  });

  it('hidden VP dev cards count toward victory', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(state);
    state = rollAndHandle(state, [3, 3]);

    // 8 VP from buildings + 2 VP cards = 10
    state = injectBuildingsForVP(state, 0 as PlayerId, 8);

    // Strip any existing VP sources besides buildings
    state = {
      ...state,
      longestRoadPlayer: null,
      largestArmyPlayer: null,
    };

    // Add 2 VP cards
    state = {
      ...state,
      players: state.players.map((p, i) => ({
        ...p,
        devCards: i === 0
          ? [...p.devCards.filter(c => c !== 'victory_point'), 'victory_point', 'victory_point']
          : p.devCards,
      })),
    };

    const vp = calculateVP(state, 0 as PlayerId);
    expect(vp).toBeGreaterThanOrEqual(10);

    state = gameReducer(state, { type: 'END_TURN', player: 0 as PlayerId });
    expect(state.phase).toBe('GAME_OVER');
  });

  it('VP cards cannot be played', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(state);
    state = rollAndHandle(state, [3, 3]);

    // Give player 0 a VP card
    state = {
      ...state,
      players: state.players.map((p, i) => ({
        ...p,
        devCards: i === 0 ? ['victory_point'] : p.devCards,
      })),
    };

    expect(canPlayDevCard(state, 0 as PlayerId, 'victory_point')).toBe(false);
  });

  it('longest road VP triggers win', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(state);
    state = rollAndHandle(state, [3, 3]);

    // 8 VP from buildings
    state = injectBuildingsForVP(state, 0 as PlayerId, 8);

    // Remove other VP sources
    state = {
      ...state,
      largestArmyPlayer: null,
      players: state.players.map((p, i) => ({
        ...p,
        devCards: i === 0 ? p.devCards.filter(c => c !== 'victory_point') : p.devCards,
        newDevCards: i === 0 ? p.newDevCards.filter(c => c !== 'victory_point') : p.newDevCards,
      })),
    };

    // Build a long road for player 0 to get longest road via DFS pathfinding
    const edgeRoads = [...state.edgeRoads];

    // Find all vertices adjacent to player 0's existing roads
    const startCandidates = new Set<number>();
    for (let eid = 0; eid < state.topology.edgeCount; eid++) {
      if (edgeRoads[eid]?.owner === 0) {
        const [v1, v2] = state.topology.edgeEndpoints[eid];
        startCandidates.add(v1);
        startCandidates.add(v2);
      }
    }

    // DFS to find longest empty path of 6 edges
    let bestEdges: number[] = [];
    function dfsRoad(vertex: number, visitedVerts: Set<number>, visitedEdges: number[]) {
      if (visitedEdges.length >= 6) {
        if (visitedEdges.length > bestEdges.length) bestEdges = [...visitedEdges];
        return;
      }
      if (visitedEdges.length > bestEdges.length) bestEdges = [...visitedEdges];

      for (const eid of state.topology.vertexAdjacentEdges[vertex]) {
        if (edgeRoads[eid] !== null) continue;
        const [v1, v2] = state.topology.edgeEndpoints[eid];
        const next = v1 === vertex ? v2 : v1;
        if (visitedVerts.has(next)) continue;
        const b = state.vertexBuildings[next];
        if (b !== null && b.owner !== 0) continue;

        visitedVerts.add(next);
        visitedEdges.push(eid);
        dfsRoad(next, visitedVerts, visitedEdges);
        visitedEdges.pop();
        visitedVerts.delete(next);
      }
    }

    for (const sv of startCandidates) {
      dfsRoad(sv, new Set([sv]), []);
      if (bestEdges.length >= 6) break;
    }

    for (const eid of bestEdges) {
      edgeRoads[eid] = { owner: 0 as PlayerId };
    }

    state = { ...state, edgeRoads };
    state = updateLongestRoad(state);

    // 8 buildings + 2 longest road = 10
    const vp = calculateVP(state, 0 as PlayerId);
    expect(vp).toBeGreaterThanOrEqual(10);

    state = gameReducer(state, { type: 'END_TURN', player: 0 as PlayerId });
    expect(state.phase).toBe('GAME_OVER');
  });

  it('win only checked on current player\'s turn', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(state);
    state = rollAndHandle(state, [3, 3]);

    // Give player 1 enough buildings for 10 VP
    state = injectBuildingsForVP(state, 1 as PlayerId, 10);

    const vp1 = calculateVP(state, 1 as PlayerId);
    expect(vp1).toBeGreaterThanOrEqual(10);

    // It's player 0's turn — END_TURN should NOT trigger GAME_OVER
    // because checkGameOver only checks currentPlayer
    expect(state.currentPlayer).toBe(0);
    state = gameReducer(state, { type: 'END_TURN', player: 0 as PlayerId });
    expect(state.phase).toBe('ROLL_DICE');
    expect(state.currentPlayer).toBe(1);

    // Now player 1 rolls and ends turn — should trigger GAME_OVER
    state = rollAndHandle(state);
    state = gameReducer(state, { type: 'END_TURN', player: 1 as PlayerId });
    expect(state.phase).toBe('GAME_OVER');
  });
});

// ─── Full Game to Victory ───────────────────────────────

describe('Full Game to Victory', () => {
  it('AI-driven game reaches valid GAME_OVER with consistent state', () => {
    let state = createInitialState(['AI1', 'AI2', 'AI3', 'AI4'], 42);
    state = gameReducer(state, { type: 'START_GAME' });

    let steps = 0;
    const maxSteps = 2000;

    while (state.phase !== 'GAME_OVER' && steps < maxSteps) {
      const player = getActingPlayer(state);
      const action = chooseAIAction(state, player, 'heuristic', 'medium');

      const validation = validateAction(state, action);
      expect(validation.valid).toBe(true);

      state = gameReducer(state, action);
      steps++;
    }

    expect(state.phase).toBe('GAME_OVER');

    const winner = state.currentPlayer;
    const winnerVP = calculateVP(state, winner);
    expect(winnerVP).toBeGreaterThanOrEqual(10);

    // Verify piece counts are consistent
    for (let pid = 0; pid < 4; pid++) {
      const p = state.players[pid];
      expect(p.remainingSettlements).toBeGreaterThanOrEqual(0);
      expect(p.remainingSettlements).toBeLessThanOrEqual(5);
      expect(p.remainingCities).toBeGreaterThanOrEqual(0);
      expect(p.remainingCities).toBeLessThanOrEqual(4);
      expect(p.remainingRoads).toBeGreaterThanOrEqual(0);
      expect(p.remainingRoads).toBeLessThanOrEqual(15);
    }

    // Verify resource conservation: bank + all player resources = initial total
    for (const r of ALL_RESOURCES) {
      const totalInPlay = state.bank[r] +
        state.players.reduce((sum, p) => sum + p.resources[r], 0);
      expect(totalInPlay).toBe(BANK_RESOURCES_PER_TYPE);
    }

    // Verify game log contains a win message
    const winLog = state.log.find(msg => msg.includes('wins with'));
    expect(winLog).toBeDefined();
  });
});
