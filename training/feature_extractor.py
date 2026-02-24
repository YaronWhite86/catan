"""
Feature extractor for Catan game states.

Mirrors the TypeScript feature extractor at src/ai/features/feature-extractor.ts.
Produces identical 227-element feature vectors for the same game states.

Takes a CatanState dataclass from catan_env.py as input.

Feature layout (all normalized 0-1):
  Per player (x4, player-relative: forPlayer first, then others in order):
    Resources: 5 (each / 19)
    Total resources: 1 (/30)
    Dev cards by type: 5 (knight/14, road_building/2, year_of_plenty/2, monopoly/2, victory_point/5)
    Knights played: 1 (/14)
    Remaining pieces: 3 (settlements/5, cities/4, roads/15)
    VP: 1 (/10)
    Has longest road/army: 2 (binary)
    Settlements/cities on board: 2 (/5, /4)
    Port access: 6 (generic + 5 specific, binary)
    Production per resource in pips: 5 (/15)
    Resource diversity: 1 (/5)
    Road length: 1 (/15)
    = 33 per player
  Global:
    Turn number: 1 (/200)
    Phase one-hot: 12
    Bank resources: 5 (/19)
    Dev cards remaining: 1 (/25)
    Robber hex pips: 1 (/5)
    Robber on desert: 1
    Current player one-hot: 4
    = 25
  Board summary: 70 (production concentration, hex ownership density)
  Total: 33*4 + 25 + 70 = 227
"""

from __future__ import annotations

import numpy as np
from typing import Optional

from catan_env import (
    CatanState,
    calculate_longest_road,
    calculate_vp,
    RESOURCES,
    TERRAIN_TO_RESOURCE,
)

# ---- Schema constants (must match feature-schema.ts) ----

PER_PLAYER_SIZE = 33
NUM_PLAYERS = 4
GLOBAL_SIZE = 25
BOARD_SUMMARY_SIZE = 70
TOTAL_FEATURES = PER_PLAYER_SIZE * NUM_PLAYERS + GLOBAL_SIZE + BOARD_SUMMARY_SIZE  # 227

ALL_RESOURCES = list(RESOURCES)  # ["lumber", "brick", "wool", "grain", "ore"]

PHASE_LIST = [
    "PRE_GAME",
    "SETUP_PLACE_SETTLEMENT",
    "SETUP_PLACE_ROAD",
    "ROLL_DICE",
    "DISCARD",
    "MOVE_ROBBER",
    "STEAL",
    "TRADE_BUILD_PLAY",
    "ROAD_BUILDING_PLACE",
    "YEAR_OF_PLENTY_PICK",
    "MONOPOLY_PICK",
    "GAME_OVER",
]

RESOURCE_PORTS = ["lumber", "brick", "wool", "grain", "ore"]

# Pip counts for dice roll probabilities (matches board-analysis.ts PIP_COUNTS)
PIP_COUNTS = {
    2: 1, 3: 2, 4: 3, 5: 4, 6: 5,
    8: 5, 9: 4, 10: 3, 11: 2, 12: 1,
}

DEV_CARD_TYPES = ["knight", "road_building", "year_of_plenty", "monopoly", "victory_point"]


def clamp(v: float) -> float:
    """Clamp value to [0, 1]."""
    return max(0.0, min(1.0, v))


def get_pip_count(number_token: Optional[int]) -> int:
    """Get pip count for a number token (0 for None/7/desert)."""
    if number_token is None:
        return 0
    return PIP_COUNTS.get(number_token, 0)


def extract_features(state: CatanState, for_player: int) -> np.ndarray:
    """
    Extract feature vector from a CatanState.

    Args:
        state: CatanState dataclass from catan_env.py
        for_player: The player whose perspective we extract from (0-3)

    Returns:
        numpy array of shape (TOTAL_FEATURES,) with values in [0, 1]
    """
    features = np.zeros(TOTAL_FEATURES, dtype=np.float32)
    offset = 0

    # Player-relative ordering: for_player first, then others in order
    player_order = _get_player_order(state, for_player)

    # Per-player features
    for pid in player_order:
        offset = _write_player_features(features, offset, state, pid)

    # Pad if fewer than 4 players
    for _ in range(len(player_order), NUM_PLAYERS):
        offset += PER_PLAYER_SIZE

    # Global features
    offset = _write_global_features(features, offset, state)

    # Board summary
    offset = _write_board_summary(features, offset, state, for_player)

    return features


def _get_player_order(state: CatanState, for_player: int) -> list[int]:
    """Get player-relative ordering: for_player first, then others in order."""
    order = [for_player]
    for i in range(1, state.player_count):
        order.append((for_player + i) % state.player_count)
    return order


def _write_player_features(
    features: np.ndarray, offset: int, state: CatanState, pid: int
) -> int:
    """Write per-player features starting at offset. Returns new offset."""
    p = state.players[pid]
    start_offset = offset

    # Resources (normalized: divide by 19, max bank per type)
    for r in ALL_RESOURCES:
        features[offset] = clamp(p.resources[r] / 19)
        offset += 1

    # Total resources (normalized by ~30)
    total = sum(p.resources[r] for r in ALL_RESOURCES)
    features[offset] = clamp(total / 30)
    offset += 1

    # Dev cards by type (both playable and new)
    dev_counts = _count_dev_cards(p.dev_cards, p.new_dev_cards)
    features[offset] = clamp(dev_counts["knight"] / 14)
    offset += 1
    features[offset] = clamp(dev_counts["road_building"] / 2)
    offset += 1
    features[offset] = clamp(dev_counts["year_of_plenty"] / 2)
    offset += 1
    features[offset] = clamp(dev_counts["monopoly"] / 2)
    offset += 1
    features[offset] = clamp(dev_counts["victory_point"] / 5)
    offset += 1

    # Knights played (normalized by 14)
    features[offset] = clamp(p.knights_played / 14)
    offset += 1

    # Remaining pieces
    features[offset] = p.remaining_settlements / 5
    offset += 1
    features[offset] = p.remaining_cities / 4
    offset += 1
    features[offset] = p.remaining_roads / 15
    offset += 1

    # VP (normalized by 10)
    vp = calculate_vp(state, pid)
    features[offset] = clamp(vp / 10)
    offset += 1

    # Has longest road / largest army
    features[offset] = 1.0 if state.longest_road_player == pid else 0.0
    offset += 1
    features[offset] = 1.0 if state.largest_army_player == pid else 0.0
    offset += 1

    # Buildings on board
    # In CatanState, vertex_buildings[vid] is (type_str, owner_int) or None
    topo = state.topology
    assert topo is not None
    settlements = 0
    cities = 0
    for vid in range(topo.vertex_count):
        b = state.vertex_buildings[vid]
        if b is not None and b[1] == pid:
            if b[0] == "settlement":
                settlements += 1
            else:
                cities += 1
    features[offset] = settlements / 5
    offset += 1
    features[offset] = cities / 4
    offset += 1

    # Port access
    ports = _player_port_access(state, pid)
    features[offset] = 1.0 if "generic" in ports else 0.0
    offset += 1
    for r in RESOURCE_PORTS:
        features[offset] = 1.0 if r in ports else 0.0
        offset += 1

    # Production per resource (normalized: max ~15 pips)
    prod = _player_resource_production(state, pid)
    for r in ALL_RESOURCES:
        features[offset] = clamp(prod[r] / 15)
        offset += 1

    # Resource diversity (0-5 normalized)
    diversity_count = sum(1 for r in ALL_RESOURCES if prod[r] > 0)
    features[offset] = diversity_count / 5
    offset += 1

    # Road length
    road_length = calculate_longest_road(state, pid)
    features[offset] = clamp(road_length / 15)
    offset += 1

    # Verify we wrote the right number of features
    assert offset - start_offset == PER_PLAYER_SIZE, (
        f"Per-player feature count mismatch: {offset - start_offset} vs {PER_PLAYER_SIZE}"
    )

    return offset


def _write_global_features(features: np.ndarray, offset: int, state: CatanState) -> int:
    """Write global features starting at offset. Returns new offset."""
    # Turn number (normalized by ~200)
    features[offset] = clamp(state.turn_number / 200)
    offset += 1

    # Phase one-hot
    for phase in PHASE_LIST:
        features[offset] = 1.0 if state.phase == phase else 0.0
        offset += 1

    # Bank resources
    for r in ALL_RESOURCES:
        features[offset] = clamp(state.bank[r] / 19)
        offset += 1

    # Dev cards remaining
    features[offset] = clamp(len(state.dev_card_deck) / 25)
    offset += 1

    # Robber hex info
    robber_number = state.hex_numbers[state.robber_hex]
    robber_terrain = state.hex_terrains[state.robber_hex]
    features[offset] = clamp(get_pip_count(robber_number) / 5)
    offset += 1
    features[offset] = 1.0 if robber_terrain == "desert" else 0.0
    offset += 1

    # Current player one-hot
    for i in range(4):
        features[offset] = 1.0 if state.current_player == i else 0.0
        offset += 1

    return offset


def _write_board_summary(
    features: np.ndarray, offset: int, state: CatanState, for_player: int
) -> int:
    """Write board summary features starting at offset. Returns new offset."""
    topo = state.topology
    assert topo is not None

    # Per-resource production concentration per player (5 * 4 = 20)
    for i in range(state.player_count):
        prod = _player_resource_production(state, i)
        for r in ALL_RESOURCES:
            features[offset] = clamp(prod[r] / 15)
            offset += 1

    # Pad for missing players
    for i in range(state.player_count, 4):
        offset += 5

    # Vertex ownership summary: for each hex, total building density
    # Matches the TS writeBoardSummary logic
    hex_count = min(len(state.hex_terrains), 19)
    base_offset = PER_PLAYER_SIZE * NUM_PLAYERS + GLOBAL_SIZE + 20

    for hid in range(hex_count):
        if (offset - base_offset) >= BOARD_SUMMARY_SIZE - 20:
            break
        # For each hex, count buildings (normalized)
        total_buildings = 0
        for vid in topo.hex_vertices[hid]:
            b = state.vertex_buildings[vid]
            if b is not None:
                mult = 2 if b[0] == "city" else 1
                total_buildings += mult
        features[offset] = clamp(total_buildings / 6)
        offset += 1
        if offset >= TOTAL_FEATURES:
            break

    # Fill remaining with zeros (already initialized), snap offset
    offset = PER_PLAYER_SIZE * NUM_PLAYERS + GLOBAL_SIZE + BOARD_SUMMARY_SIZE

    return offset


def _count_dev_cards(dev_cards: list[str], new_dev_cards: list[str]) -> dict[str, int]:
    """Count development cards by type (both playable and new)."""
    counts = {t: 0 for t in DEV_CARD_TYPES}
    for c in dev_cards:
        if c in counts:
            counts[c] += 1
    for c in new_dev_cards:
        if c in counts:
            counts[c] += 1
    return counts


def _player_port_access(state: CatanState, player: int) -> set[str]:
    """
    Get harbor types accessible to a player.
    Matches evaluation/board-analysis.ts playerPortAccess.

    In CatanState, harbors are Harbor dataclass instances with .type and .vertices (tuple).
    vertex_buildings[vid] is (type_str, owner_int) or None.
    """
    ports: set[str] = set()
    for harbor in state.harbors:
        for vid in harbor.vertices:
            b = state.vertex_buildings[vid]
            if b is not None and b[1] == player:
                ports.add(harbor.type)
    return ports


def _player_resource_production(state: CatanState, player: int) -> dict[str, float]:
    """
    Calculate per-resource pip production for a player.
    Matches evaluation/board-analysis.ts playerResourceProduction.
    """
    topo = state.topology
    assert topo is not None
    prod = {r: 0.0 for r in ALL_RESOURCES}
    for vid in range(topo.vertex_count):
        b = state.vertex_buildings[vid]
        if b is None or b[1] != player:
            continue
        multiplier = 2 if b[0] == "city" else 1
        v_prod = _vertex_resource_production(state, vid)
        for r in ALL_RESOURCES:
            prod[r] += v_prod[r] * multiplier
    return prod


def _vertex_resource_production(state: CatanState, vertex: int) -> dict[str, float]:
    """
    Get per-resource pip production for a vertex.
    Matches evaluation/board-analysis.ts vertexResourceProduction.
    """
    topo = state.topology
    assert topo is not None
    prod = {r: 0.0 for r in ALL_RESOURCES}
    for hid in topo.vertex_adjacent_hexes[vertex]:
        if hid == state.robber_hex:
            continue
        terrain = state.hex_terrains[hid]
        res = TERRAIN_TO_RESOURCE.get(terrain)
        if res is not None:
            prod[res] += get_pip_count(state.hex_numbers[hid])
    return prod
