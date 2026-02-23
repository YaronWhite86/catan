import type { PlayerId, ResourceType, VertexId, EdgeId, HexId, ResourceCount } from './types';

// ─── Game Actions (Discriminated Union) ──────────────

export type GameAction =
  | StartGameAction
  | PlaceSetupSettlementAction
  | PlaceSetupRoadAction
  | RollDiceAction
  | DiscardResourcesAction
  | MoveRobberAction
  | StealResourceAction
  | BuildRoadAction
  | BuildSettlementAction
  | BuildCityAction
  | BuyDevCardAction
  | PlayKnightAction
  | PlayRoadBuildingAction
  | PlaceRoadBuildingRoadAction
  | PlayYearOfPlentyAction
  | PickYearOfPlentyResourcesAction
  | PlayMonopolyAction
  | PickMonopolyResourceAction
  | MaritimeTradeAction
  | ProposeDomesticTradeAction
  | AcceptDomesticTradeAction
  | RejectDomesticTradeAction
  | EndTurnAction;

export interface StartGameAction {
  type: 'START_GAME';
}

export interface PlaceSetupSettlementAction {
  type: 'PLACE_SETUP_SETTLEMENT';
  player: PlayerId;
  vertex: VertexId;
}

export interface PlaceSetupRoadAction {
  type: 'PLACE_SETUP_ROAD';
  player: PlayerId;
  edge: EdgeId;
}

export interface RollDiceAction {
  type: 'ROLL_DICE';
  player: PlayerId;
  // If provided, use these values (for testing). Otherwise use PRNG.
  dice?: [number, number];
}

export interface DiscardResourcesAction {
  type: 'DISCARD_RESOURCES';
  player: PlayerId;
  resources: ResourceCount;
}

export interface MoveRobberAction {
  type: 'MOVE_ROBBER';
  player: PlayerId;
  hex: HexId;
}

export interface StealResourceAction {
  type: 'STEAL_RESOURCE';
  player: PlayerId;
  victim: PlayerId | null; // null = choose not to steal (no valid targets)
}

export interface BuildRoadAction {
  type: 'BUILD_ROAD';
  player: PlayerId;
  edge: EdgeId;
}

export interface BuildSettlementAction {
  type: 'BUILD_SETTLEMENT';
  player: PlayerId;
  vertex: VertexId;
}

export interface BuildCityAction {
  type: 'BUILD_CITY';
  player: PlayerId;
  vertex: VertexId;
}

export interface BuyDevCardAction {
  type: 'BUY_DEV_CARD';
  player: PlayerId;
}

export interface PlayKnightAction {
  type: 'PLAY_KNIGHT';
  player: PlayerId;
}

export interface PlayRoadBuildingAction {
  type: 'PLAY_ROAD_BUILDING';
  player: PlayerId;
}

export interface PlaceRoadBuildingRoadAction {
  type: 'PLACE_ROAD_BUILDING_ROAD';
  player: PlayerId;
  edge: EdgeId;
}

export interface PlayYearOfPlentyAction {
  type: 'PLAY_YEAR_OF_PLENTY';
  player: PlayerId;
}

export interface PickYearOfPlentyResourcesAction {
  type: 'PICK_YEAR_OF_PLENTY_RESOURCES';
  player: PlayerId;
  resource1: ResourceType;
  resource2: ResourceType;
}

export interface PlayMonopolyAction {
  type: 'PLAY_MONOPOLY';
  player: PlayerId;
}

export interface PickMonopolyResourceAction {
  type: 'PICK_MONOPOLY_RESOURCE';
  player: PlayerId;
  resource: ResourceType;
}

export interface MaritimeTradeAction {
  type: 'MARITIME_TRADE';
  player: PlayerId;
  give: ResourceType;
  receive: ResourceType;
}

export interface ProposeDomesticTradeAction {
  type: 'PROPOSE_DOMESTIC_TRADE';
  player: PlayerId;
  offering: ResourceCount;
  requesting: ResourceCount;
}

export interface AcceptDomesticTradeAction {
  type: 'ACCEPT_DOMESTIC_TRADE';
  player: PlayerId; // the player accepting (not the proposer)
}

export interface RejectDomesticTradeAction {
  type: 'REJECT_DOMESTIC_TRADE';
  player: PlayerId;
}

export interface EndTurnAction {
  type: 'END_TURN';
  player: PlayerId;
}
