import { useMemo } from 'react';
import type { GameState, VertexId, EdgeId, HexId } from '@engine/types';
import { getValidSetupSettlementVertices, getValidSetupRoadEdges } from '@engine/rules/setup';
import { getValidRobberHexes } from '@engine/rules/robber';
import {
  getValidSettlementVertices,
  getValidCityVertices,
  getValidRoadEdges,
  getValidRoadEdgesNoResourceCheck,
} from '@engine/rules/building';
import { canBuyDevCard, canPlayDevCard } from '@engine/rules/dev-cards';

export type PlacementMode =
  | 'none'
  | 'settlement'
  | 'city'
  | 'road'
  | 'robber'
  | 'setup_settlement'
  | 'setup_road'
  | 'road_building';

export interface ValidActions {
  validVertices: Set<VertexId>;
  validEdges: Set<EdgeId>;
  validHexes: Set<HexId>;
  canBuildRoad: boolean;
  canBuildSettlement: boolean;
  canBuildCity: boolean;
  canBuyCard: boolean;
  canPlayKnight: boolean;
  canPlayRoadBuilding: boolean;
  canPlayYearOfPlenty: boolean;
  canPlayMonopoly: boolean;
  canEndTurn: boolean;
  canRollDice: boolean;
}

export function useValidActions(
  state: GameState,
  placementMode: PlacementMode,
): ValidActions {
  return useMemo(() => {
    const player = state.currentPlayer;
    let validVertices = new Set<VertexId>();
    let validEdges = new Set<EdgeId>();
    let validHexes = new Set<HexId>();

    // Compute clickable positions based on phase and placement mode
    switch (state.phase) {
      case 'SETUP_PLACE_SETTLEMENT':
        validVertices = new Set(getValidSetupSettlementVertices(state));
        break;

      case 'SETUP_PLACE_ROAD':
        validEdges = new Set(getValidSetupRoadEdges(state, player));
        break;

      case 'MOVE_ROBBER':
        validHexes = new Set(getValidRobberHexes(state));
        break;

      case 'ROAD_BUILDING_PLACE':
        validEdges = new Set(getValidRoadEdgesNoResourceCheck(state, player));
        break;

      case 'TRADE_BUILD_PLAY':
        if (placementMode === 'settlement') {
          validVertices = new Set(getValidSettlementVertices(state, player));
        } else if (placementMode === 'city') {
          validVertices = new Set(getValidCityVertices(state, player));
        } else if (placementMode === 'road') {
          validEdges = new Set(getValidRoadEdges(state, player));
        }
        break;
    }

    const inBuildPhase = state.phase === 'TRADE_BUILD_PLAY';

    return {
      validVertices,
      validEdges,
      validHexes,
      canBuildRoad: inBuildPhase && getValidRoadEdges(state, player).length > 0,
      canBuildSettlement: inBuildPhase && getValidSettlementVertices(state, player).length > 0,
      canBuildCity: inBuildPhase && getValidCityVertices(state, player).length > 0,
      canBuyCard: inBuildPhase && canBuyDevCard(state, player),
      canPlayKnight: inBuildPhase && canPlayDevCard(state, player, 'knight'),
      canPlayRoadBuilding: inBuildPhase && canPlayDevCard(state, player, 'road_building'),
      canPlayYearOfPlenty: inBuildPhase && canPlayDevCard(state, player, 'year_of_plenty'),
      canPlayMonopoly: inBuildPhase && canPlayDevCard(state, player, 'monopoly'),
      canEndTurn: inBuildPhase,
      canRollDice: state.phase === 'ROLL_DICE',
    };
  }, [state, placementMode]);
}
