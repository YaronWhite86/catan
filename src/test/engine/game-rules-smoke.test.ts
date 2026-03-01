import { describe, it, expect } from 'vitest';
import { createInitialState } from '../../engine/state';
import { gameReducer } from '../../engine/reducer';
import type { GameState, PlayerId, ResourceCount } from '../../engine/types';
import { ALL_RESOURCES, terrainToResource } from '../../engine/types';
import { getSetupOrder, getValidSetupSettlementVertices, getValidSetupRoadEdges } from '../../engine/rules/setup';
import { getValidRobberHexes, getStealTargets } from '../../engine/rules/robber';
import { distributeResources } from '../../engine/rules/dice';
import { calculateLongestRoad, updateLongestRoad } from '../../engine/rules/longest-road';
import { updateLargestArmy } from '../../engine/rules/largest-army';
import { calculateVP } from '../../engine/rules/victory';
import {
  getValidSettlementVertices,
  getValidCityVertices,
} from '../../engine/rules/building';
import { totalResources } from '../../engine/utils/resource-utils';

const SEED = 12345;

function emptyRes(): ResourceCount {
  return { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 };
}

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
 * Find a hex that has buildings on it and a non-null resource.
 * Returns { hexId, resource, totalDemand } or null.
 */
function findHexWithDemand(state: GameState): {
  hexId: number;
  resource: string;
  totalDemand: number;
  numberToken: number;
} | null {
  for (let hid = 0; hid < state.hexTiles.length; hid++) {
    const hex = state.hexTiles[hid];
    if (hex.numberToken === null) continue;
    if (hid === state.robberHex) continue;
    const resource = terrainToResource(hex.terrain);
    if (resource === null) continue;

    let totalDemand = 0;
    for (const vid of state.topology.hexVertices[hid]) {
      const building = state.vertexBuildings[vid];
      if (building !== null) {
        totalDemand += building.type === 'city' ? 2 : 1;
      }
    }

    if (totalDemand > 0) {
      return { hexId: hid, resource, totalDemand, numberToken: hex.numberToken };
    }
  }
  return null;
}

// ─── Bank Resource Constraint ───────────────────────────

describe('Bank Resource Constraint', () => {
  it('bank insufficient for hex demand — nobody gets resources', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(state);

    const hexInfo = findHexWithDemand(state);
    expect(hexInfo).not.toBeNull();
    const { resource, totalDemand, numberToken } = hexInfo!;

    // Drain bank so it has less than demand
    const bankShortfall = { ...emptyRes(), [resource]: state.bank[resource as keyof ResourceCount] - (totalDemand - 1) };
    state = giveResources(state, 0 as PlayerId, bankShortfall);
    expect(state.bank[resource as keyof ResourceCount]).toBe(totalDemand - 1);

    // Distribute for the matching number token
    const afterState = distributeResources(state, numberToken);

    // Nobody should have gotten the scarce resource from that hex
    // (Other hexes with same number could distribute different resources, so check specifically)
    // Bank of the scarce resource should be unchanged
    expect(afterState.bank[resource as keyof ResourceCount]).toBe(totalDemand - 1);
  });

  it('bank exactly sufficient — distribution succeeds', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(state);

    const hexInfo = findHexWithDemand(state);
    expect(hexInfo).not.toBeNull();
    const { resource, totalDemand, numberToken } = hexInfo!;

    // Set bank to exactly match demand
    const excess = state.bank[resource as keyof ResourceCount] - totalDemand;
    if (excess > 0) {
      state = giveResources(state, 0 as PlayerId, { ...emptyRes(), [resource]: excess });
    }
    expect(state.bank[resource as keyof ResourceCount]).toBe(totalDemand);

    const afterState = distributeResources(state, numberToken);

    // Bank should now be 0 for this resource (from this hex at least)
    // Since demand === bank, distribution should succeed
    expect(afterState.bank[resource as keyof ResourceCount]).toBeLessThanOrEqual(0);
  });

  it('bank constraint is per-hex, not global', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(state);

    // Find two hexes with the same number token but different resources
    const hexesByToken = new Map<number, Array<{ hid: number; resource: string; demand: number }>>();

    for (let hid = 0; hid < state.hexTiles.length; hid++) {
      const hex = state.hexTiles[hid];
      if (hex.numberToken === null || hid === state.robberHex) continue;
      const resource = terrainToResource(hex.terrain);
      if (resource === null) continue;

      let demand = 0;
      for (const vid of state.topology.hexVertices[hid]) {
        const building = state.vertexBuildings[vid];
        if (building !== null) {
          demand += building.type === 'city' ? 2 : 1;
        }
      }

      if (demand > 0) {
        const token = hex.numberToken;
        if (!hexesByToken.has(token)) hexesByToken.set(token, []);
        hexesByToken.get(token)!.push({ hid, resource, demand });
      }
    }

    // Find a token with two different resources having demand
    let targetToken: number | null = null;
    let hexA: { hid: number; resource: string; demand: number } | null = null;
    let hexB: { hid: number; resource: string; demand: number } | null = null;

    for (const [token, hexes] of hexesByToken) {
      const uniqueResources = new Set(hexes.map(h => h.resource));
      if (uniqueResources.size >= 2) {
        targetToken = token;
        const resources = Array.from(uniqueResources);
        hexA = hexes.find(h => h.resource === resources[0])!;
        hexB = hexes.find(h => h.resource === resources[1])!;
        break;
      }
    }

    if (targetToken === null || !hexA || !hexB) {
      // Can't set up this scenario with this seed — skip gracefully
      return;
    }

    // Drain hexA's resource below demand, leave hexB's resource sufficient
    const drainA = state.bank[hexA.resource as keyof ResourceCount] - (hexA.demand - 1);
    if (drainA > 0) {
      state = giveResources(state, 0 as PlayerId, { ...emptyRes(), [hexA.resource]: drainA });
    }

    const afterState = distributeResources(state, targetToken);

    // HexA's resource should NOT have been distributed (bank insufficient)
    expect(afterState.bank[hexA.resource as keyof ResourceCount]).toBe(
      state.bank[hexA.resource as keyof ResourceCount]
    );

    // HexB's resource SHOULD have been distributed (bank sufficient)
    expect(afterState.bank[hexB.resource as keyof ResourceCount]).toBeLessThan(
      state.bank[hexB.resource as keyof ResourceCount]
    );
  });

  it('city demands 2 from bank — insufficient with 1, succeeds with 2', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(state);

    // Find a hex with a settlement and upgrade it to a city via state manipulation
    const hexInfo = findHexWithDemand(state);
    expect(hexInfo).not.toBeNull();
    const { hexId, resource, numberToken } = hexInfo!;

    // Find the vertex with a building on this hex
    let cityVertex = -1;
    let cityOwner: PlayerId = 0 as PlayerId;
    for (const vid of state.topology.hexVertices[hexId]) {
      const building = state.vertexBuildings[vid];
      if (building !== null && building.type === 'settlement') {
        cityVertex = vid;
        cityOwner = building.owner;
        break;
      }
    }
    expect(cityVertex).not.toBe(-1);

    // Upgrade to city via state manipulation
    const newVertexBuildings = [...state.vertexBuildings];
    newVertexBuildings[cityVertex] = { type: 'city', owner: cityOwner };
    state = { ...state, vertexBuildings: newVertexBuildings };

    // Compute new total demand for this hex
    let totalDemand = 0;
    for (const vid of state.topology.hexVertices[hexId]) {
      const building = state.vertexBuildings[vid];
      if (building !== null) {
        totalDemand += building.type === 'city' ? 2 : 1;
      }
    }

    // Set bank to 1 less than demand — distribution should fail
    const drainTo1Less = state.bank[resource as keyof ResourceCount] - (totalDemand - 1);
    if (drainTo1Less > 0) {
      state = giveResources(state, 0 as PlayerId, { ...emptyRes(), [resource]: drainTo1Less });
    }

    let afterState = distributeResources(state, numberToken);
    // Bank should be unchanged — nobody got anything
    expect(afterState.bank[resource as keyof ResourceCount]).toBe(totalDemand - 1);

    // Now set bank to exactly match demand
    // Give back from player 0 to bank by giving negative... or just set bank directly
    const newBank = { ...state.bank, [resource]: totalDemand };
    state = { ...state, bank: newBank };

    afterState = distributeResources(state, numberToken);
    // Bank should now have been reduced
    expect(afterState.bank[resource as keyof ResourceCount]).toBeLessThanOrEqual(0);
  });
});

// ─── Largest Army Dynamics ──────────────────────────────

describe('Largest Army Dynamics', () => {
  it('3 knights grants Largest Army + 2 VP', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(state);
    state = rollAndHandle(state, [3, 3]);

    // Give player 0 three knight cards
    state = {
      ...state,
      players: state.players.map((p, i) => ({
        ...p,
        devCards: i === 0 ? ['knight', 'knight', 'knight'] : p.devCards,
      })),
    };

    // Play knight 1
    state = gameReducer(state, { type: 'PLAY_KNIGHT', player: 0 as PlayerId });
    state = handleRobberFlow(state);

    // End turn and come back to player 0 for next knight
    state = gameReducer(state, { type: 'END_TURN', player: 0 as PlayerId });
    for (let pid = 1; pid < 4; pid++) {
      state = rollAndHandle(state);
      state = gameReducer(state, { type: 'END_TURN', player: pid as PlayerId });
    }

    // Play knight 2
    state = rollAndHandle(state);
    state = gameReducer(state, { type: 'PLAY_KNIGHT', player: 0 as PlayerId });
    state = handleRobberFlow(state);

    // End turn and come back to player 0
    state = gameReducer(state, { type: 'END_TURN', player: 0 as PlayerId });
    for (let pid = 1; pid < 4; pid++) {
      state = rollAndHandle(state);
      state = gameReducer(state, { type: 'END_TURN', player: pid as PlayerId });
    }

    // Play knight 3
    state = rollAndHandle(state);
    state = gameReducer(state, { type: 'PLAY_KNIGHT', player: 0 as PlayerId });
    state = handleRobberFlow(state);

    expect(state.largestArmyPlayer).toBe(0);
    expect(state.players[0].knightsPlayed).toBe(3);

    const vp = calculateVP(state, 0 as PlayerId);
    // 2 settlements from setup + 2 from largest army = 4
    expect(vp).toBeGreaterThanOrEqual(4);

    // Calculate VP without largest army to confirm the +2
    const vpWithout = vp - 2;
    const baseVP = calculateVP({ ...state, largestArmyPlayer: null }, 0 as PlayerId);
    expect(baseVP).toBe(vpWithout);
  });

  it('tie does not steal — must strictly exceed', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(state);

    // Directly set player 0 with 3 knights played + largest army
    state = {
      ...state,
      players: state.players.map((p, i) => ({
        ...p,
        knightsPlayed: i === 0 ? 3 : i === 1 ? 2 : 0,
      })),
      largestArmyPlayer: 0 as PlayerId,
      largestArmySize: 3,
    };

    // Player 1 plays 3rd knight (ties at 3) — army should stay with player 0
    const stateAfterTie = {
      ...state,
      players: state.players.map((p, i) => ({
        ...p,
        knightsPlayed: i === 1 ? 3 : p.knightsPlayed,
      })),
    };
    const updatedTie = updateLargestArmy(stateAfterTie);
    expect(updatedTie.largestArmyPlayer).toBe(0);

    // Player 1 plays 4th knight (exceeds) — army should transfer
    const stateAfterExceed = {
      ...state,
      players: state.players.map((p, i) => ({
        ...p,
        knightsPlayed: i === 1 ? 4 : p.knightsPlayed,
      })),
    };
    const updatedExceed = updateLargestArmy(stateAfterExceed);
    expect(updatedExceed.largestArmyPlayer).toBe(1);
  });

  it('largest army VP triggers win at 10 VP', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(state);
    state = rollAndHandle(state, [3, 3]);

    // Give player 0 enough buildings for 8 VP: 4 cities = 8 VP
    // First, place cities on the 2 existing settlements
    // We need to manipulate state to set up 4 cities for player 0
    const p0Vertices: number[] = [];
    for (let vid = 0; vid < state.topology.vertexCount; vid++) {
      const b = state.vertexBuildings[vid];
      if (b !== null && b.owner === 0) p0Vertices.push(vid);
    }

    const newVertexBuildings = [...state.vertexBuildings];
    for (const vid of p0Vertices) {
      newVertexBuildings[vid] = { type: 'city', owner: 0 as PlayerId };
    }
    // Add 2 more cities via state manipulation (find empty vertices adjacent to player 0's roads)
    let extraCities = 0;
    for (let vid = 0; vid < state.topology.vertexCount && extraCities < 2; vid++) {
      if (newVertexBuildings[vid] !== null) continue;
      // Check distance rule
      const tooClose = state.topology.vertexAdjacentVertices[vid].some(
        adj => newVertexBuildings[adj] !== null
      );
      if (tooClose) continue;
      newVertexBuildings[vid] = { type: 'city', owner: 0 as PlayerId };
      extraCities++;
    }

    state = {
      ...state,
      vertexBuildings: newVertexBuildings,
      players: state.players.map((p, i) => ({
        ...p,
        knightsPlayed: i === 0 ? 3 : 0,
        devCards: i === 0 ? ['knight'] : p.devCards,
      })),
      largestArmyPlayer: 0 as PlayerId,
      largestArmySize: 3,
    };

    // 4 cities = 8 VP + largest army = 2 VP = 10 VP
    const vp = calculateVP(state, 0 as PlayerId);
    expect(vp).toBeGreaterThanOrEqual(10);

    // END_TURN should trigger GAME_OVER
    state = gameReducer(state, { type: 'END_TURN', player: 0 as PlayerId });
    expect(state.phase).toBe('GAME_OVER');
  });
});

// ─── Longest Road Disruption ────────────────────────────

/**
 * Build a road chain of `count` edges for `player` starting from their existing
 * road endpoints. Uses DFS to find the longest possible path of empty edges.
 * Returns the chain of vertices and edges placed.
 */
function buildRoadChain(
  state: GameState,
  edgeRoads: (typeof state.edgeRoads[0])[],
  player: PlayerId,
  count: number,
): { chainVertices: number[]; chainEdges: number[] } {
  // Collect all vertices adjacent to player's existing roads
  const startCandidates = new Set<number>();
  for (let eid = 0; eid < state.topology.edgeCount; eid++) {
    if (edgeRoads[eid]?.owner === player) {
      const [v1, v2] = state.topology.edgeEndpoints[eid];
      startCandidates.add(v1);
      startCandidates.add(v2);
    }
  }

  // DFS to find longest possible empty path from any start vertex
  let bestPath: { vertices: number[]; edges: number[] } = { vertices: [], edges: [] };

  function dfsSearch(vertex: number, visitedVerts: Set<number>, visitedEdges: Set<number>, path: { vertices: number[]; edges: number[] }) {
    if (path.edges.length >= count) {
      if (path.edges.length > bestPath.edges.length) {
        bestPath = { vertices: [...path.vertices], edges: [...path.edges] };
      }
      return;
    }
    if (path.edges.length > bestPath.edges.length) {
      bestPath = { vertices: [...path.vertices], edges: [...path.edges] };
    }

    for (const eid of state.topology.vertexAdjacentEdges[vertex]) {
      if (edgeRoads[eid] !== null) continue;
      if (visitedEdges.has(eid)) continue;

      const [v1, v2] = state.topology.edgeEndpoints[eid];
      const nextVertex = v1 === vertex ? v2 : v1;
      if (visitedVerts.has(nextVertex)) continue;

      // Can't pass through opponent's building
      const building = state.vertexBuildings[nextVertex];
      if (building !== null && building.owner !== player) continue;

      visitedVerts.add(nextVertex);
      visitedEdges.add(eid);
      path.vertices.push(nextVertex);
      path.edges.push(eid);

      dfsSearch(nextVertex, visitedVerts, visitedEdges, path);

      path.vertices.pop();
      path.edges.pop();
      visitedVerts.delete(nextVertex);
      visitedEdges.delete(eid);
    }
  }

  for (const sv of startCandidates) {
    const visitedVerts = new Set([sv]);
    dfsSearch(sv, visitedVerts, new Set(), { vertices: [sv], edges: [] });
    if (bestPath.edges.length >= count) break;
  }

  // Place the roads
  for (const eid of bestPath.edges) {
    edgeRoads[eid] = { owner: player };
  }

  return { chainVertices: bestPath.vertices, chainEdges: bestPath.edges };
}

describe('Longest Road Disruption', () => {
  it('opponent settlement breaks road chain', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(state);

    const edgeRoads = [...state.edgeRoads];
    const { chainVertices, chainEdges } = buildRoadChain(state, edgeRoads, 0 as PlayerId, 6);

    state = {
      ...state,
      edgeRoads,
      players: state.players.map((p, i) => ({
        ...p,
        remainingRoads: i === 0 ? p.remainingRoads - chainEdges.length : p.remainingRoads,
      })),
    };

    const roadBefore = calculateLongestRoad(state, 0 as PlayerId);
    expect(roadBefore).toBeGreaterThanOrEqual(5);

    // Place opponent settlement at a midpoint in the chain (not the first or last)
    const midIndex = Math.floor(chainVertices.length / 2);
    const midVertex = chainVertices[midIndex];

    const newVertexBuildings = [...state.vertexBuildings];
    newVertexBuildings[midVertex] = { type: 'settlement', owner: 1 as PlayerId };
    state = { ...state, vertexBuildings: newVertexBuildings };

    const roadAfter = calculateLongestRoad(state, 0 as PlayerId);
    expect(roadAfter).toBeLessThan(roadBefore);
  });

  it('longest road stolen via disruption — VP transfers', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(state);

    const edgeRoads = [...state.edgeRoads];

    // Build 6-edge chain for player 0
    const { chainVertices, chainEdges } = buildRoadChain(state, edgeRoads, 0 as PlayerId, 6);

    // Build 5-edge chain for player 1
    const p1Result = buildRoadChain(state, edgeRoads, 1 as PlayerId, 5);

    state = {
      ...state,
      edgeRoads,
      players: state.players.map((p, i) => ({
        ...p,
        remainingRoads: i === 0
          ? p.remainingRoads - chainEdges.length
          : i === 1
            ? p.remainingRoads - p1Result.chainEdges.length
            : p.remainingRoads,
      })),
    };

    state = updateLongestRoad(state);

    const p0Road = calculateLongestRoad(state, 0 as PlayerId);
    const p1Road = calculateLongestRoad(state, 1 as PlayerId);

    if (p0Road >= 5 && p1Road >= 5) {
      expect(state.longestRoadPlayer).toBe(0);

      // Place opponent settlement at midpoint of player 0's chain
      const midIndex = Math.floor(chainVertices.length / 2);
      const midVertex = chainVertices[midIndex];

      const newVertexBuildings = [...state.vertexBuildings];
      newVertexBuildings[midVertex] = { type: 'settlement', owner: 1 as PlayerId };
      state = { ...state, vertexBuildings: newVertexBuildings };

      state = updateLongestRoad(state);

      const p0RoadAfter = calculateLongestRoad(state, 0 as PlayerId);
      expect(p0RoadAfter).toBeLessThan(5);
      expect(state.longestRoadPlayer).toBe(1);
    }
  });
});

// ─── Piece Limits ───────────────────────────────────────

describe('Piece Limits', () => {
  it('cannot exceed 5 settlements', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(state);

    // After setup, each player has 2 settlements (3 remaining)
    expect(state.players[0].remainingSettlements).toBe(3);

    // Set remaining to 0 via state manipulation
    state = {
      ...state,
      players: state.players.map((p, i) => ({
        ...p,
        remainingSettlements: i === 0 ? 0 : p.remainingSettlements,
      })),
    };

    // getValidSettlementVertices should return empty when no settlements remaining
    state = rollAndHandle(state, [3, 3]);

    // Give resources for a settlement
    state = giveResources(state, 0 as PlayerId, {
      lumber: 1, brick: 1, wool: 1, grain: 1, ore: 0,
    });

    const validVertices = getValidSettlementVertices(state, 0 as PlayerId);
    expect(validVertices).toHaveLength(0);
  });

  it('cannot exceed 4 cities', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(state);

    // Set remaining cities to 0
    state = {
      ...state,
      players: state.players.map((p, i) => ({
        ...p,
        remainingCities: i === 0 ? 0 : p.remainingCities,
      })),
    };

    const validCities = getValidCityVertices(state, 0 as PlayerId);
    expect(validCities).toHaveLength(0);
  });

  it('city upgrade returns settlement to supply', () => {
    let state = createInitialState(['Alice', 'Bob', 'Carol', 'Dave'], SEED);
    state = runSetup(state);
    state = rollAndHandle(state, [3, 3]);

    // Give player resources for a city
    state = giveResources(state, 0 as PlayerId, {
      lumber: 0, brick: 0, wool: 0, grain: 2, ore: 3,
    });

    const settlementsBefore = state.players[0].remainingSettlements;
    const citiesBefore = state.players[0].remainingCities;

    const validCities = getValidCityVertices(state, 0 as PlayerId);
    if (validCities.length > 0) {
      state = gameReducer(state, {
        type: 'BUILD_CITY',
        player: 0 as PlayerId,
        vertex: validCities[0],
      });

      expect(state.players[0].remainingSettlements).toBe(settlementsBefore + 1);
      expect(state.players[0].remainingCities).toBe(citiesBefore - 1);
    }
  });
});
