/**
 * Feature schema: defines the feature vector layout for neural network input.
 * All features normalized to [0, 1].
 *
 * Total: ~250 features.
 */

// Per-player features (player-relative: self first, then opponents in order)
// Repeated 4 times (one per player slot)
export const PER_PLAYER_FEATURES = [
  // Resources (5)
  'res_lumber', 'res_brick', 'res_wool', 'res_grain', 'res_ore',
  // Total resources (1)
  'total_resources',
  // Dev cards by type (5)
  'dev_knights', 'dev_road_building', 'dev_year_of_plenty', 'dev_monopoly', 'dev_victory_point',
  // Knights played (1)
  'knights_played',
  // Remaining pieces (3)
  'remaining_settlements', 'remaining_cities', 'remaining_roads',
  // VP (1)
  'victory_points',
  // Has longest road / largest army (2)
  'has_longest_road', 'has_largest_army',
  // Buildings on board (2)
  'settlements_on_board', 'cities_on_board',
  // Port access (6) - generic + 5 specific
  'port_generic', 'port_lumber', 'port_brick', 'port_wool', 'port_grain', 'port_ore',
  // Production per resource in pips (5)
  'prod_lumber', 'prod_brick', 'prod_wool', 'prod_grain', 'prod_ore',
  // Resource diversity (1)
  'resource_diversity',
  // Longest road length (1)
  'road_length',
] as const;

export const PER_PLAYER_SIZE = PER_PLAYER_FEATURES.length; // 33
export const NUM_PLAYERS = 4;

// Global features
export const GLOBAL_FEATURES = [
  // Turn number (1)
  'turn_number',
  // Phase one-hot (12)
  'phase_pre_game', 'phase_setup_settlement', 'phase_setup_road',
  'phase_roll_dice', 'phase_discard', 'phase_move_robber', 'phase_steal',
  'phase_trade_build_play', 'phase_road_building', 'phase_year_of_plenty',
  'phase_monopoly', 'phase_game_over',
  // Bank resources (5)
  'bank_lumber', 'bank_brick', 'bank_wool', 'bank_grain', 'bank_ore',
  // Dev cards remaining (1)
  'dev_cards_remaining',
  // Robber hex info (2) - robber hex pips, is on desert
  'robber_hex_pips', 'robber_on_desert',
  // Current player one-hot (4)
  'current_p0', 'current_p1', 'current_p2', 'current_p3',
] as const;

export const GLOBAL_SIZE = GLOBAL_FEATURES.length; // 25

// Board summary features
// Per-resource production concentration per player (5 resources x 4 players = 20)
// Plus vertex/edge ownership summaries (50)
export const BOARD_SUMMARY_SIZE = 70;

export const TOTAL_FEATURES = PER_PLAYER_SIZE * NUM_PLAYERS + GLOBAL_SIZE + BOARD_SUMMARY_SIZE;
// 33 * 4 + 25 + 70 = 227
