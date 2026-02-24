"""
Lightweight Python reimplementation of the Catan game engine for AI training.

Mirrors the TypeScript engine's state transitions so that feature extraction
produces equivalent vectors.  Standalone -- no imports from the TS project.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import (
    Dict,
    List,
    Optional,
    Set,
    Tuple,
)

import numpy as np

# ──────────────────────────────────────────────────────────────────────
#  Constants
# ──────────────────────────────────────────────────────────────────────

RESOURCES: List[str] = ["lumber", "brick", "wool", "grain", "ore"]

TERRAIN_TYPES: List[str] = [
    "forest", "hills", "pasture", "fields", "mountains", "desert",
]

TERRAIN_DISTRIBUTION: List[str] = [
    "forest", "forest", "forest", "forest",
    "hills", "hills", "hills",
    "pasture", "pasture", "pasture", "pasture",
    "fields", "fields", "fields", "fields",
    "mountains", "mountains", "mountains",
    "desert",
]

NUMBER_TOKEN_DISTRIBUTION: List[int] = [
    2,
    3, 3,
    4, 4,
    5, 5,
    6, 6,
    8, 8,
    9, 9,
    10, 10,
    11, 11,
    12,
]

DEV_CARD_DISTRIBUTION: List[str] = (
    ["knight"] * 14
    + ["victory_point"] * 5
    + ["road_building"] * 2
    + ["year_of_plenty"] * 2
    + ["monopoly"] * 2
)

TERRAIN_TO_RESOURCE: Dict[str, Optional[str]] = {
    "forest": "lumber",
    "hills": "brick",
    "pasture": "wool",
    "fields": "grain",
    "mountains": "ore",
    "desert": None,
}

# Building costs: {resource: amount}
ROAD_COST: Dict[str, int] = {"lumber": 1, "brick": 1, "wool": 0, "grain": 0, "ore": 0}
SETTLEMENT_COST: Dict[str, int] = {"lumber": 1, "brick": 1, "wool": 1, "grain": 1, "ore": 0}
CITY_COST: Dict[str, int] = {"lumber": 0, "brick": 0, "wool": 0, "grain": 2, "ore": 3}
DEV_CARD_COST: Dict[str, int] = {"lumber": 0, "brick": 0, "wool": 1, "grain": 1, "ore": 1}

MAX_SETTLEMENTS = 5
MAX_CITIES = 4
MAX_ROADS = 15
BANK_PER_RESOURCE = 19

VP_TO_WIN = 10
MIN_LONGEST_ROAD = 5
MIN_LARGEST_ARMY = 3

STANDARD_HARBOR_TYPES: List[str] = [
    "generic", "grain", "ore", "generic", "wool",
    "generic", "generic", "brick", "lumber",
]

# Game phases (mirroring TS GamePhase)
PHASES = [
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

# ──────────────────────────────────────────────────────────────────────
#  Hex coordinate helpers  (axial, pointy-top)
# ──────────────────────────────────────────────────────────────────────

HEX_SIZE = 50.0

# Standard Catan 3-4-5-4-3 diamond
STANDARD_HEX_POSITIONS: List[Tuple[int, int]] = [
    # r = -2 (top row, 3 hexes)
    (0, -2), (1, -2), (2, -2),
    # r = -1 (4 hexes)
    (-1, -1), (0, -1), (1, -1), (2, -1),
    # r = 0 (5 hexes)
    (-2, 0), (-1, 0), (0, 0), (1, 0), (2, 0),
    # r = 1 (4 hexes)
    (-2, 1), (-1, 1), (0, 1), (1, 1),
    # r = 2 (3 hexes)
    (-2, 2), (-1, 2), (0, 2),
]


def hex_to_pixel(q: int, r: int, size: float = HEX_SIZE) -> Tuple[float, float]:
    x = size * (math.sqrt(3) * q + (math.sqrt(3) / 2) * r)
    y = size * (1.5 * r)
    return (x, y)


def hex_corner(cx: float, cy: float, size: float, i: int) -> Tuple[float, float]:
    angle_deg = 60 * i - 30
    angle_rad = math.pi / 180 * angle_deg
    return (cx + size * math.cos(angle_rad), cy + size * math.sin(angle_rad))


def hex_corners(cx: float, cy: float, size: float = HEX_SIZE) -> List[Tuple[float, float]]:
    return [hex_corner(cx, cy, size, i) for i in range(6)]


def points_equal(a: Tuple[float, float], b: Tuple[float, float], eps: float = 0.01) -> bool:
    return abs(a[0] - b[0]) < eps and abs(a[1] - b[1]) < eps


# ──────────────────────────────────────────────────────────────────────
#  Board topology
# ──────────────────────────────────────────────────────────────────────

@dataclass
class BoardTopology:
    """Pre-computed adjacency tables matching the TS BoardTopology."""

    hex_coords: List[Tuple[int, int]]               # [hid] -> (q, r)
    hex_centers: List[Tuple[float, float]]           # [hid] -> pixel center
    vertex_positions: List[Tuple[float, float]]      # [vid] -> pixel pos
    vertex_count: int
    edge_count: int

    # Adjacency tables
    vertex_adjacent_vertices: List[List[int]]        # [vid] -> [vid...]
    vertex_adjacent_edges: List[List[int]]           # [vid] -> [eid...]
    vertex_adjacent_hexes: List[List[int]]           # [vid] -> [hid...]
    edge_endpoints: List[Tuple[int, int]]            # [eid] -> (v1, v2) sorted
    edge_adjacent_edges: List[List[int]]             # [eid] -> [eid...]
    hex_vertices: List[List[int]]                    # [hid] -> 6 vids
    hex_edges: List[List[int]]                       # [hid] -> 6 eids


def build_board_topology(
    hex_positions: Optional[List[Tuple[int, int]]] = None,
    size: float = HEX_SIZE,
) -> BoardTopology:
    """Build the complete board topology -- mirrors TS buildBoardTopology."""
    if hex_positions is None:
        hex_positions = list(STANDARD_HEX_POSITIONS)

    hex_centers = [hex_to_pixel(q, r, size) for q, r in hex_positions]

    # Step 1/2: compute corners for every hex, deduplicate vertices
    vertex_positions: List[Tuple[float, float]] = []
    hex_corner_vids: List[List[int]] = []  # [hid][corner_idx] -> vid

    for hid, (cx, cy) in enumerate(hex_centers):
        corners = hex_corners(cx, cy, size)
        vids: List[int] = []
        for corner in corners:
            existing = -1
            for vid, vp in enumerate(vertex_positions):
                if points_equal(vp, corner):
                    existing = vid
                    break
            if existing >= 0:
                vids.append(existing)
            else:
                vids.append(len(vertex_positions))
                vertex_positions.append(corner)
        hex_corner_vids.append(vids)

    vertex_count = len(vertex_positions)

    # Step 3: identify edges (consecutive vertex pairs per hex), deduplicate
    edge_endpoints: List[Tuple[int, int]] = []
    edge_map: Dict[Tuple[int, int], int] = {}
    hex_edge_ids: List[List[int]] = []

    for hid in range(len(hex_positions)):
        vids = hex_corner_vids[hid]
        eids: List[int] = []
        for i in range(6):
            v1 = vids[i]
            v2 = vids[(i + 1) % 6]
            key = (min(v1, v2), max(v1, v2))
            if key not in edge_map:
                edge_map[key] = len(edge_endpoints)
                edge_endpoints.append(key)
            eids.append(edge_map[key])
        hex_edge_ids.append(eids)

    edge_count = len(edge_endpoints)

    # Step 4: adjacency tables
    hex_vertices = hex_corner_vids
    hex_edges = hex_edge_ids

    # vertex -> hexes
    v_adj_hexes: List[List[int]] = [[] for _ in range(vertex_count)]
    for hid in range(len(hex_positions)):
        for vid in hex_vertices[hid]:
            if hid not in v_adj_hexes[vid]:
                v_adj_hexes[vid].append(hid)

    # vertex -> edges
    v_adj_edges: List[List[int]] = [[] for _ in range(vertex_count)]
    for eid, (v1, v2) in enumerate(edge_endpoints):
        v_adj_edges[v1].append(eid)
        v_adj_edges[v2].append(eid)

    # vertex -> vertices
    v_adj_verts: List[List[int]] = [[] for _ in range(vertex_count)]
    for v1, v2 in edge_endpoints:
        if v2 not in v_adj_verts[v1]:
            v_adj_verts[v1].append(v2)
        if v1 not in v_adj_verts[v2]:
            v_adj_verts[v2].append(v1)

    # edge -> edges (sharing a vertex)
    e_adj_edges: List[List[int]] = [[] for _ in range(edge_count)]
    for eid in range(edge_count):
        v1, v2 = edge_endpoints[eid]
        for adj_eid in v_adj_edges[v1]:
            if adj_eid != eid and adj_eid not in e_adj_edges[eid]:
                e_adj_edges[eid].append(adj_eid)
        for adj_eid in v_adj_edges[v2]:
            if adj_eid != eid and adj_eid not in e_adj_edges[eid]:
                e_adj_edges[eid].append(adj_eid)

    return BoardTopology(
        hex_coords=list(hex_positions),
        hex_centers=hex_centers,
        vertex_positions=vertex_positions,
        vertex_count=vertex_count,
        edge_count=edge_count,
        vertex_adjacent_vertices=v_adj_verts,
        vertex_adjacent_edges=v_adj_edges,
        vertex_adjacent_hexes=v_adj_hexes,
        edge_endpoints=edge_endpoints,
        edge_adjacent_edges=e_adj_edges,
        hex_vertices=hex_vertices,
        hex_edges=hex_edges,
    )


# ──────────────────────────────────────────────────────────────────────
#  Harbor helpers
# ──────────────────────────────────────────────────────────────────────

@dataclass
class Harbor:
    type: str                   # 'generic' | resource name
    vertices: Tuple[int, int]   # the two vertices that benefit


def _get_coastal_edges(topo: BoardTopology) -> List[Tuple[int, int, int]]:
    """Return coastal edges as (eid, v1, v2) -- mirrors TS getCoastalEdges."""
    coastal: Set[int] = set()
    for vid in range(topo.vertex_count):
        if len(topo.vertex_adjacent_hexes[vid]) < 3:
            coastal.add(vid)

    edges: List[Tuple[int, int, int]] = []
    for eid, (v1, v2) in enumerate(topo.edge_endpoints):
        if v1 in coastal and v2 in coastal:
            shared = [
                h for h in topo.vertex_adjacent_hexes[v1]
                if h in topo.vertex_adjacent_hexes[v2]
            ]
            if len(shared) == 1:
                edges.append((eid, v1, v2))
    return edges


def assign_harbors(topo: BoardTopology) -> List[Harbor]:
    """Assign 9 harbors to evenly spaced coastal edges.  Mirrors TS assignHarbors."""
    coastal_edges = _get_coastal_edges(topo)

    center_x = sum(p[0] for p in topo.hex_centers) / len(topo.hex_centers)
    center_y = sum(p[1] for p in topo.hex_centers) / len(topo.hex_centers)

    def _angle(e: Tuple[int, int, int]) -> float:
        _, v1, v2 = e
        mx = (topo.vertex_positions[v1][0] + topo.vertex_positions[v2][0]) / 2
        my = (topo.vertex_positions[v1][1] + topo.vertex_positions[v2][1]) / 2
        return math.atan2(my - center_y, mx - center_x)

    coastal_edges.sort(key=_angle)

    total = len(coastal_edges)
    step = total / 9
    harbors: List[Harbor] = []
    for i in range(9):
        idx = int(i * step) % total
        _, v1, v2 = coastal_edges[idx]
        harbors.append(Harbor(type=STANDARD_HARBOR_TYPES[i], vertices=(v1, v2)))
    return harbors


def get_trade_ratio(harbors: List[Harbor], player_vertices: List[int], resource: str) -> int:
    """Best trade ratio for *resource* given the player's buildings.  Mirrors TS getTradeRatio."""
    ratio = 4
    for h in harbors:
        has_access = h.vertices[0] in player_vertices or h.vertices[1] in player_vertices
        if not has_access:
            continue
        if h.type == "generic":
            ratio = min(ratio, 3)
        elif h.type == resource:
            ratio = min(ratio, 2)
    return ratio


# ──────────────────────────────────────────────────────────────────────
#  Tiny helpers
# ──────────────────────────────────────────────────────────────────────

def _empty_resources() -> Dict[str, int]:
    return {r: 0 for r in RESOURCES}


def _has_resources(hand: Dict[str, int], cost: Dict[str, int]) -> bool:
    return all(hand.get(r, 0) >= cost.get(r, 0) for r in RESOURCES)


def _total_resources(hand: Dict[str, int]) -> int:
    return sum(hand.get(r, 0) for r in RESOURCES)


def _subtract(hand: Dict[str, int], cost: Dict[str, int]) -> Dict[str, int]:
    return {r: hand[r] - cost.get(r, 0) for r in RESOURCES}


def _add(hand: Dict[str, int], cost: Dict[str, int]) -> Dict[str, int]:
    return {r: hand[r] + cost.get(r, 0) for r in RESOURCES}


# ──────────────────────────────────────────────────────────────────────
#  Player state
# ──────────────────────────────────────────────────────────────────────

@dataclass
class PlayerState:
    id: int
    resources: Dict[str, int] = field(default_factory=_empty_resources)
    dev_cards: List[str] = field(default_factory=list)      # playable
    new_dev_cards: List[str] = field(default_factory=list)   # bought this turn
    knights_played: int = 0
    remaining_settlements: int = MAX_SETTLEMENTS
    remaining_cities: int = MAX_CITIES
    remaining_roads: int = MAX_ROADS
    has_played_dev_card_this_turn: bool = False

    def copy(self) -> "PlayerState":
        return PlayerState(
            id=self.id,
            resources=dict(self.resources),
            dev_cards=list(self.dev_cards),
            new_dev_cards=list(self.new_dev_cards),
            knights_played=self.knights_played,
            remaining_settlements=self.remaining_settlements,
            remaining_cities=self.remaining_cities,
            remaining_roads=self.remaining_roads,
            has_played_dev_card_this_turn=self.has_played_dev_card_this_turn,
        )


# ──────────────────────────────────────────────────────────────────────
#  Game state (mutable -- we copy before modifying)
# ──────────────────────────────────────────────────────────────────────

@dataclass
class CatanState:
    # Phase / turn
    phase: str = "PRE_GAME"
    current_player: int = 0
    player_count: int = 4
    turn_number: int = 0

    # Board (set during reset)
    topology: Optional[BoardTopology] = None
    hex_terrains: List[str] = field(default_factory=list)    # [hid] -> terrain
    hex_numbers: List[Optional[int]] = field(default_factory=list)  # [hid] -> token or None
    vertex_buildings: List[Optional[Tuple[str, int]]] = field(default_factory=list)  # (type, owner) | None
    edge_roads: List[Optional[int]] = field(default_factory=list)   # owner | None
    harbors: List[Harbor] = field(default_factory=list)
    robber_hex: int = 0

    # Players
    players: List[PlayerState] = field(default_factory=list)

    # Dev card deck (draw from end)
    dev_card_deck: List[str] = field(default_factory=list)

    # Bank
    bank: Dict[str, int] = field(default_factory=lambda: {r: BANK_PER_RESOURCE for r in RESOURCES})

    # Awards
    longest_road_player: Optional[int] = None
    longest_road_length: int = 0
    largest_army_player: Optional[int] = None
    largest_army_size: int = 0

    # Dice
    last_roll: Optional[Tuple[int, int]] = None

    # Setup tracking
    setup_round: int = 0
    setup_index: int = 0

    # Discard tracking
    players_needing_discard: List[int] = field(default_factory=list)

    # Road-building card tracking
    road_building_roads_left: int = 0

    # Last placed vertex (for setup road)
    last_placed_vertex: Optional[int] = None

    # Winner (player id or None)
    winner: Optional[int] = None

    def copy(self) -> "CatanState":
        """Return a deep-enough copy for stepping."""
        s = CatanState(
            phase=self.phase,
            current_player=self.current_player,
            player_count=self.player_count,
            turn_number=self.turn_number,
            topology=self.topology,               # shared (immutable)
            hex_terrains=self.hex_terrains,        # shared (immutable after setup)
            hex_numbers=self.hex_numbers,          # shared
            vertex_buildings=list(self.vertex_buildings),
            edge_roads=list(self.edge_roads),
            harbors=self.harbors,                  # shared
            robber_hex=self.robber_hex,
            players=[p.copy() for p in self.players],
            dev_card_deck=list(self.dev_card_deck),
            bank=dict(self.bank),
            longest_road_player=self.longest_road_player,
            longest_road_length=self.longest_road_length,
            largest_army_player=self.largest_army_player,
            largest_army_size=self.largest_army_size,
            last_roll=self.last_roll,
            setup_round=self.setup_round,
            setup_index=self.setup_index,
            players_needing_discard=list(self.players_needing_discard),
            road_building_roads_left=self.road_building_roads_left,
            last_placed_vertex=self.last_placed_vertex,
            winner=self.winner,
        )
        return s


# ──────────────────────────────────────────────────────────────────────
#  Setup order (snake draft)
# ──────────────────────────────────────────────────────────────────────

def get_setup_order(player_count: int) -> List[int]:
    """E.g. 4-player: [0,1,2,3,3,2,1,0]."""
    forward = list(range(player_count))
    return forward + forward[::-1]


# ──────────────────────────────────────────────────────────────────────
#  Longest-road DFS  (mirrors TS exactly)
# ──────────────────────────────────────────────────────────────────────

def calculate_longest_road(state: CatanState, player: int) -> int:
    topo = state.topology
    assert topo is not None

    player_edges: Set[int] = set()
    for eid in range(topo.edge_count):
        if state.edge_roads[eid] == player:
            player_edges.add(eid)

    if not player_edges:
        return 0

    start_vertices: Set[int] = set()
    for eid in player_edges:
        v1, v2 = topo.edge_endpoints[eid]
        start_vertices.add(v1)
        start_vertices.add(v2)

    max_length = 0
    for sv in start_vertices:
        visited: Set[int] = set()
        length = _lr_dfs(state, player, player_edges, sv, visited)
        if length > max_length:
            max_length = length
    return max_length


def _lr_dfs(
    state: CatanState,
    player: int,
    player_edges: Set[int],
    vertex: int,
    visited_edges: Set[int],
) -> int:
    topo = state.topology
    assert topo is not None
    max_len = 0

    for eid in topo.vertex_adjacent_edges[vertex]:
        if eid not in player_edges:
            continue
        if eid in visited_edges:
            continue
        v1, v2 = topo.edge_endpoints[eid]
        next_v = v2 if v1 == vertex else v1

        bldg = state.vertex_buildings[next_v]
        blocked = bldg is not None and bldg[1] != player

        visited_edges.add(eid)
        if blocked:
            max_len = max(max_len, 1)
        else:
            path = 1 + _lr_dfs(state, player, player_edges, next_v, visited_edges)
            max_len = max(max_len, path)
        visited_edges.discard(eid)

    return max_len


def update_longest_road(state: CatanState) -> None:
    """In-place update of longest road awards.  Mirrors TS updateLongestRoad."""
    longest_length = state.longest_road_length
    longest_player = state.longest_road_player

    for pid in range(state.player_count):
        length = calculate_longest_road(state, pid)
        if length >= MIN_LONGEST_ROAD:
            if longest_player is None:
                longest_player = pid
                longest_length = length
            elif length > longest_length:
                longest_player = pid
                longest_length = length

    # Check if current holder still qualifies
    if longest_player is not None:
        cur = calculate_longest_road(state, longest_player)
        if cur < MIN_LONGEST_ROAD:
            longest_player = None
            longest_length = 0
            for pid in range(state.player_count):
                length = calculate_longest_road(state, pid)
                if length >= MIN_LONGEST_ROAD and length > longest_length:
                    longest_player = pid
                    longest_length = length

    state.longest_road_player = longest_player
    state.longest_road_length = longest_length


# ──────────────────────────────────────────────────────────────────────
#  Largest army
# ──────────────────────────────────────────────────────────────────────

def update_largest_army(state: CatanState) -> None:
    largest_size = state.largest_army_size
    largest_player = state.largest_army_player

    for pid in range(state.player_count):
        knights = state.players[pid].knights_played
        if knights >= MIN_LARGEST_ARMY:
            if largest_player is None:
                largest_player = pid
                largest_size = knights
            elif knights > largest_size:
                largest_player = pid
                largest_size = knights

    state.largest_army_player = largest_player
    state.largest_army_size = largest_size


# ──────────────────────────────────────────────────────────────────────
#  Victory points
# ──────────────────────────────────────────────────────────────────────

def calculate_vp(state: CatanState, player: int) -> int:
    vp = 0
    topo = state.topology
    assert topo is not None
    for vid in range(topo.vertex_count):
        b = state.vertex_buildings[vid]
        if b is not None and b[1] == player:
            vp += 2 if b[0] == "city" else 1

    if state.longest_road_player == player:
        vp += 2
    if state.largest_army_player == player:
        vp += 2

    p = state.players[player]
    vp += sum(1 for c in p.dev_cards if c == "victory_point")
    vp += sum(1 for c in p.new_dev_cards if c == "victory_point")
    return vp


def check_game_over(state: CatanState) -> None:
    """If current player has >= 10 VP, set GAME_OVER."""
    if calculate_vp(state, state.current_player) >= VP_TO_WIN:
        state.phase = "GAME_OVER"
        state.winner = state.current_player


# ──────────────────────────────────────────────────────────────────────
#  Building / road validity helpers
# ──────────────────────────────────────────────────────────────────────

def _is_vertex_accessible(state: CatanState, player: int, vertex: int) -> bool:
    """Can the player build a road touching this vertex?"""
    bldg = state.vertex_buildings[vertex]
    if bldg is not None:
        return bldg[1] == player  # own building OK, opponent blocks
    topo = state.topology
    assert topo is not None
    return any(state.edge_roads[eid] == player for eid in topo.vertex_adjacent_edges[vertex])


def get_valid_road_edges_no_resource_check(state: CatanState, player: int) -> List[int]:
    topo = state.topology
    assert topo is not None
    if state.players[player].remaining_roads <= 0:
        return []
    valid: List[int] = []
    for eid in range(topo.edge_count):
        if state.edge_roads[eid] is not None:
            continue
        v1, v2 = topo.edge_endpoints[eid]
        if _is_vertex_accessible(state, player, v1) or _is_vertex_accessible(state, player, v2):
            valid.append(eid)
    return valid


def get_valid_road_edges(state: CatanState, player: int) -> List[int]:
    p = state.players[player]
    if p.remaining_roads <= 0:
        return []
    if not _has_resources(p.resources, ROAD_COST):
        return []
    return get_valid_road_edges_no_resource_check(state, player)


def _is_valid_settlement_vertex(state: CatanState, player: int, vid: int) -> bool:
    """Check if a specific vertex is valid for settlement placement (main game)."""
    topo = state.topology
    assert topo is not None
    if state.vertex_buildings[vid] is not None:
        return False
    for adj in topo.vertex_adjacent_vertices[vid]:
        if state.vertex_buildings[adj] is not None:
            return False
    # Must be connected to player's road network
    if not any(state.edge_roads[eid] == player for eid in topo.vertex_adjacent_edges[vid]):
        return False
    return True


def get_valid_settlement_vertices(state: CatanState, player: int) -> List[int]:
    p = state.players[player]
    if p.remaining_settlements <= 0:
        return []
    if not _has_resources(p.resources, SETTLEMENT_COST):
        return []
    topo = state.topology
    assert topo is not None
    return [vid for vid in range(topo.vertex_count) if _is_valid_settlement_vertex(state, player, vid)]


def get_valid_city_vertices(state: CatanState, player: int) -> List[int]:
    p = state.players[player]
    if p.remaining_cities <= 0:
        return []
    if not _has_resources(p.resources, CITY_COST):
        return []
    topo = state.topology
    assert topo is not None
    return [
        vid for vid in range(topo.vertex_count)
        if state.vertex_buildings[vid] is not None
        and state.vertex_buildings[vid][0] == "settlement"
        and state.vertex_buildings[vid][1] == player
    ]


def get_valid_setup_settlement_vertices(state: CatanState) -> List[int]:
    topo = state.topology
    assert topo is not None
    valid: List[int] = []
    for vid in range(topo.vertex_count):
        if state.vertex_buildings[vid] is not None:
            continue
        has_adj = any(state.vertex_buildings[adj] is not None for adj in topo.vertex_adjacent_vertices[vid])
        if has_adj:
            continue
        valid.append(vid)
    return valid


def get_valid_setup_road_edges(state: CatanState) -> List[int]:
    if state.last_placed_vertex is None:
        return []
    topo = state.topology
    assert topo is not None
    return [
        eid for eid in topo.vertex_adjacent_edges[state.last_placed_vertex]
        if state.edge_roads[eid] is None
    ]


def get_valid_robber_hexes(state: CatanState) -> List[int]:
    return [hid for hid in range(len(state.hex_terrains)) if hid != state.robber_hex]


def get_steal_targets(state: CatanState, hex_id: int, thief: int) -> List[int]:
    topo = state.topology
    assert topo is not None
    targets: Set[int] = set()
    for vid in topo.hex_vertices[hex_id]:
        b = state.vertex_buildings[vid]
        if b is not None and b[1] != thief:
            if _total_resources(state.players[b[1]].resources) > 0:
                targets.add(b[1])
    return sorted(targets)


def _get_player_vertices(state: CatanState, player: int) -> List[int]:
    topo = state.topology
    assert topo is not None
    return [
        vid for vid in range(topo.vertex_count)
        if state.vertex_buildings[vid] is not None and state.vertex_buildings[vid][1] == player
    ]


def _get_player_trade_ratio(state: CatanState, player: int, resource: str) -> int:
    pverts = _get_player_vertices(state, player)
    return get_trade_ratio(state.harbors, pverts, resource)


def is_valid_maritime_trade(state: CatanState, player: int, give: str, receive: str) -> bool:
    if give == receive:
        return False
    ratio = _get_player_trade_ratio(state, player, give)
    if state.players[player].resources[give] < ratio:
        return False
    if state.bank[receive] <= 0:
        return False
    return True


def can_buy_dev_card(state: CatanState, player: int) -> bool:
    if len(state.dev_card_deck) == 0:
        return False
    return _has_resources(state.players[player].resources, DEV_CARD_COST)


def can_play_dev_card(state: CatanState, player: int, card_type: str) -> bool:
    if state.players[player].has_played_dev_card_this_turn:
        return False
    if card_type == "victory_point":
        return False
    return card_type in state.players[player].dev_cards


# ──────────────────────────────────────────────────────────────────────
#  Action application helpers  (mutate *state* in-place)
# ──────────────────────────────────────────────────────────────────────

def _distribute_resources(state: CatanState, dice_total: int) -> None:
    if dice_total == 7:
        return
    topo = state.topology
    assert topo is not None
    for hid in range(len(state.hex_terrains)):
        if state.hex_numbers[hid] != dice_total:
            continue
        if hid == state.robber_hex:
            continue
        resource = TERRAIN_TO_RESOURCE.get(state.hex_terrains[hid])
        if resource is None:
            continue
        total_demand = 0
        player_demand: Dict[int, int] = {}
        for vid in topo.hex_vertices[hid]:
            b = state.vertex_buildings[vid]
            if b is None:
                continue
            amount = 2 if b[0] == "city" else 1
            total_demand += amount
            player_demand[b[1]] = player_demand.get(b[1], 0) + amount
        if total_demand > state.bank[resource]:
            continue
        for pid, amount in player_demand.items():
            state.players[pid].resources[resource] += amount
            state.bank[resource] -= amount


def _remove_dev_card(cards: List[str], card_type: str) -> List[str]:
    idx = -1
    for i, c in enumerate(cards):
        if c == card_type:
            idx = i
            break
    if idx == -1:
        return list(cards)
    return cards[:idx] + cards[idx + 1:]


# ──────────────────────────────────────────────────────────────────────
#  CatanEnv  --  the main RL environment
# ──────────────────────────────────────────────────────────────────────

class CatanEnv:
    """
    Gym-like interface for Settlers of Catan.

    Actions are plain tuples (see module docstring for the full list).
    """

    def __init__(self, player_count: int = 4):
        if player_count not in (3, 4):
            raise ValueError("player_count must be 3 or 4")
        self._player_count = player_count
        self.state: CatanState = CatanState()
        self._rng: np.random.RandomState = np.random.RandomState()

    # ── reset ─────────────────────────────────────────────────────

    def reset(self, seed: Optional[int] = None) -> CatanState:
        if seed is not None:
            self._rng = np.random.RandomState(seed)
        else:
            self._rng = np.random.RandomState()

        topo = build_board_topology()

        # Shuffle terrain
        terrains = list(TERRAIN_DISTRIBUTION)
        self._rng.shuffle(terrains)

        desert_idx = terrains.index("desert")

        # Shuffle number tokens
        numbers = list(NUMBER_TOKEN_DISTRIBUTION)
        self._rng.shuffle(numbers)

        hex_numbers: List[Optional[int]] = []
        num_i = 0
        for t in terrains:
            if t == "desert":
                hex_numbers.append(None)
            else:
                hex_numbers.append(int(numbers[num_i]))
                num_i += 1

        harbors = assign_harbors(topo)

        # Shuffle dev cards
        deck = list(DEV_CARD_DISTRIBUTION)
        self._rng.shuffle(deck)

        players = [PlayerState(id=i) for i in range(self._player_count)]

        self.state = CatanState(
            phase="SETUP_PLACE_SETTLEMENT",
            current_player=0,
            player_count=self._player_count,
            turn_number=0,
            topology=topo,
            hex_terrains=terrains,
            hex_numbers=hex_numbers,
            vertex_buildings=[None] * topo.vertex_count,
            edge_roads=[None] * topo.edge_count,
            harbors=harbors,
            robber_hex=desert_idx,
            players=players,
            dev_card_deck=deck,
            bank={r: BANK_PER_RESOURCE for r in RESOURCES},
            longest_road_player=None,
            longest_road_length=0,
            largest_army_player=None,
            largest_army_size=0,
            last_roll=None,
            setup_round=0,
            setup_index=0,
            players_needing_discard=[],
            road_building_roads_left=0,
            last_placed_vertex=None,
            winner=None,
        )
        return self.state

    # ── convenience ───────────────────────────────────────────────

    def get_acting_player(self) -> int:
        """Return the player index that must act next."""
        s = self.state
        if s.phase == "DISCARD" and s.players_needing_discard:
            return s.players_needing_discard[0]
        return s.current_player

    # ── legal actions ─────────────────────────────────────────────

    def get_legal_actions(self) -> List[tuple]:
        s = self.state
        phase = s.phase

        if phase == "GAME_OVER":
            return []

        if phase == "SETUP_PLACE_SETTLEMENT":
            verts = get_valid_setup_settlement_vertices(s)
            return [("PLACE_SETUP_SETTLEMENT", v) for v in verts]

        if phase == "SETUP_PLACE_ROAD":
            edges = get_valid_setup_road_edges(s)
            return [("PLACE_SETUP_ROAD", e) for e in edges]

        if phase == "ROLL_DICE":
            return [("ROLL_DICE",)]

        if phase == "DISCARD":
            # The first player in the needing-discard list acts.
            pid = s.players_needing_discard[0]
            p = s.players[pid]
            total = _total_resources(p.resources)
            discard_count = total // 2
            return self._enumerate_discard(p.resources, discard_count)

        if phase == "MOVE_ROBBER":
            hexes = get_valid_robber_hexes(s)
            return [("MOVE_ROBBER", h) for h in hexes]

        if phase == "STEAL":
            targets = get_steal_targets(s, s.robber_hex, s.current_player)
            if not targets:
                return [("STEAL_RESOURCE", None)]
            return [("STEAL_RESOURCE", t) for t in targets]

        if phase == "TRADE_BUILD_PLAY":
            return self._trade_build_play_actions()

        if phase == "ROAD_BUILDING_PLACE":
            edges = get_valid_road_edges_no_resource_check(s, s.current_player)
            return [("PLACE_ROAD_BUILDING_ROAD", e) for e in edges]

        if phase == "YEAR_OF_PLENTY_PICK":
            actions: List[tuple] = []
            for i, r1 in enumerate(RESOURCES):
                for r2 in RESOURCES[i:]:
                    # bank check
                    if r1 == r2:
                        if s.bank[r1] >= 2:
                            actions.append(("PICK_YEAR_OF_PLENTY_RESOURCES", r1, r2))
                    else:
                        if s.bank[r1] >= 1 and s.bank[r2] >= 1:
                            actions.append(("PICK_YEAR_OF_PLENTY_RESOURCES", r1, r2))
            return actions

        if phase == "MONOPOLY_PICK":
            return [("PICK_MONOPOLY_RESOURCE", r) for r in RESOURCES]

        return []

    # -- sub-enumerators --

    def _trade_build_play_actions(self) -> List[tuple]:
        s = self.state
        pid = s.current_player
        actions: List[tuple] = []

        # Build road
        for eid in get_valid_road_edges(s, pid):
            actions.append(("BUILD_ROAD", eid))

        # Build settlement
        for vid in get_valid_settlement_vertices(s, pid):
            actions.append(("BUILD_SETTLEMENT", vid))

        # Build city
        for vid in get_valid_city_vertices(s, pid):
            actions.append(("BUILD_CITY", vid))

        # Buy dev card
        if can_buy_dev_card(s, pid):
            actions.append(("BUY_DEV_CARD",))

        # Play dev cards
        if can_play_dev_card(s, pid, "knight"):
            actions.append(("PLAY_KNIGHT",))
        if can_play_dev_card(s, pid, "road_building"):
            actions.append(("PLAY_ROAD_BUILDING",))
        if can_play_dev_card(s, pid, "year_of_plenty"):
            actions.append(("PLAY_YEAR_OF_PLENTY",))
        if can_play_dev_card(s, pid, "monopoly"):
            actions.append(("PLAY_MONOPOLY",))

        # Maritime trade
        for give in RESOURCES:
            for receive in RESOURCES:
                if is_valid_maritime_trade(s, pid, give, receive):
                    actions.append(("MARITIME_TRADE", give, receive))

        # End turn (always legal in TRADE_BUILD_PLAY)
        actions.append(("END_TURN",))

        return actions

    @staticmethod
    def _enumerate_discard(hand: Dict[str, int], count: int) -> List[tuple]:
        """Enumerate all ways to discard exactly *count* cards from *hand*.

        Returns action tuples of form ('DISCARD_RESOURCES', l, b, w, g, o).
        For very large hands this can be expensive; that's fine for training.
        """
        results: List[tuple] = []
        res = RESOURCES  # order: lumber, brick, wool, grain, ore

        def _recurse(idx: int, remaining: int, chosen: List[int]) -> None:
            if idx == len(res):
                if remaining == 0:
                    results.append(("DISCARD_RESOURCES",) + tuple(chosen))
                return
            max_take = min(hand[res[idx]], remaining)
            for take in range(max_take + 1):
                # Prune: even if we take max of everything remaining,
                # can we still reach the target?
                left_after = remaining - take
                max_possible = sum(hand[res[j]] for j in range(idx + 1, len(res)))
                if left_after > max_possible:
                    continue
                _recurse(idx + 1, left_after, chosen + [take])

        _recurse(0, count, [])
        return results

    # ── step ──────────────────────────────────────────────────────

    def step(self, action: tuple) -> Tuple[CatanState, float, bool, dict]:
        """Apply *action*, return (new_state, reward, done, info).

        Reward is +1 for the winning player, -1 for all others on game end,
        and 0 otherwise.
        """
        s = self.state  # we mutate a copy
        s = s.copy()
        self.state = s

        action_type = action[0]
        info: dict = {}

        # ── SETUP ──
        if action_type == "PLACE_SETUP_SETTLEMENT":
            vertex = action[1]
            self._apply_setup_settlement(vertex)

        elif action_type == "PLACE_SETUP_ROAD":
            edge = action[1]
            self._apply_setup_road(edge)

        # ── ROLL DICE ──
        elif action_type == "ROLL_DICE":
            self._apply_roll_dice()

        # ── DISCARD ──
        elif action_type == "DISCARD_RESOURCES":
            # ('DISCARD_RESOURCES', l, b, w, g, o)
            resources = {RESOURCES[i]: action[i + 1] for i in range(5)}
            self._apply_discard(resources)

        # ── ROBBER ──
        elif action_type == "MOVE_ROBBER":
            self._apply_move_robber(action[1])

        elif action_type == "STEAL_RESOURCE":
            self._apply_steal(action[1])

        # ── BUILD ──
        elif action_type == "BUILD_ROAD":
            self._apply_build_road(s.current_player, action[1], free=False)
            update_longest_road(s)

        elif action_type == "BUILD_SETTLEMENT":
            self._apply_build_settlement(action[1])
            update_longest_road(s)

        elif action_type == "BUILD_CITY":
            self._apply_build_city(action[1])

        # ── DEV CARDS ──
        elif action_type == "BUY_DEV_CARD":
            self._apply_buy_dev_card()

        elif action_type == "PLAY_KNIGHT":
            self._apply_play_knight()

        elif action_type == "PLAY_ROAD_BUILDING":
            self._apply_play_road_building()

        elif action_type == "PLACE_ROAD_BUILDING_ROAD":
            self._apply_place_road_building_road(action[1])

        elif action_type == "PLAY_YEAR_OF_PLENTY":
            self._apply_play_year_of_plenty()

        elif action_type == "PICK_YEAR_OF_PLENTY_RESOURCES":
            self._apply_pick_yop(action[1], action[2])

        elif action_type == "PLAY_MONOPOLY":
            self._apply_play_monopoly()

        elif action_type == "PICK_MONOPOLY_RESOURCE":
            self._apply_pick_monopoly(action[1])

        # ── TRADE ──
        elif action_type == "MARITIME_TRADE":
            self._apply_maritime_trade(action[1], action[2])

        # ── END TURN ──
        elif action_type == "END_TURN":
            self._apply_end_turn()

        else:
            raise ValueError(f"Unknown action type: {action_type}")

        done = s.phase == "GAME_OVER"
        reward = 0.0
        if done:
            info["winner"] = s.winner
        return s, reward, done, info

    # ── action implementations (mutate self.state in place) ──

    def _apply_setup_settlement(self, vertex: int) -> None:
        s = self.state
        pid = s.current_player
        s.vertex_buildings[vertex] = ("settlement", pid)
        s.players[pid].remaining_settlements -= 1

        # Second round: grant resources from adjacent hexes
        if s.setup_round == 1:
            topo = s.topology
            assert topo is not None
            for hid in topo.vertex_adjacent_hexes[vertex]:
                res = TERRAIN_TO_RESOURCE.get(s.hex_terrains[hid])
                if res is not None:
                    s.players[pid].resources[res] += 1
                    s.bank[res] -= 1

        s.last_placed_vertex = vertex
        s.phase = "SETUP_PLACE_ROAD"

    def _apply_setup_road(self, edge: int) -> None:
        s = self.state
        pid = s.current_player
        s.edge_roads[edge] = pid
        s.players[pid].remaining_roads -= 1

        order = get_setup_order(s.player_count)
        next_idx = s.setup_index + 1

        if next_idx >= len(order):
            # Setup complete
            s.phase = "ROLL_DICE"
            s.current_player = 0
            s.last_placed_vertex = None
            s.turn_number = 1
        else:
            s.current_player = order[next_idx]
            s.setup_index = next_idx
            s.setup_round = 1 if next_idx >= s.player_count else 0
            s.phase = "SETUP_PLACE_SETTLEMENT"
            s.last_placed_vertex = None

    def _apply_roll_dice(self) -> None:
        s = self.state
        d1 = int(self._rng.randint(1, 7))  # [1,6]
        d2 = int(self._rng.randint(1, 7))
        total = d1 + d2
        s.last_roll = (d1, d2)

        if total == 7:
            need = [
                pid for pid in range(s.player_count)
                if _total_resources(s.players[pid].resources) > 7
            ]
            if need:
                s.phase = "DISCARD"
                s.players_needing_discard = need
            else:
                s.phase = "MOVE_ROBBER"
        else:
            _distribute_resources(s, total)
            s.phase = "TRADE_BUILD_PLAY"

    def _apply_discard(self, resources: Dict[str, int]) -> None:
        s = self.state
        pid = s.players_needing_discard[0]
        p = s.players[pid]
        for r in RESOURCES:
            p.resources[r] -= resources[r]
            s.bank[r] += resources[r]

        s.players_needing_discard = s.players_needing_discard[1:]
        if not s.players_needing_discard:
            s.phase = "MOVE_ROBBER"

    def _apply_move_robber(self, hex_id: int) -> None:
        s = self.state
        s.robber_hex = hex_id
        targets = get_steal_targets(s, hex_id, s.current_player)
        s.phase = "STEAL" if targets else "TRADE_BUILD_PLAY"

    def _apply_steal(self, victim: Optional[int]) -> None:
        s = self.state
        if victim is None:
            s.phase = "TRADE_BUILD_PLAY"
            return

        v_res = s.players[victim].resources
        available: List[str] = []
        for r in RESOURCES:
            available.extend([r] * v_res[r])

        if not available:
            s.phase = "TRADE_BUILD_PLAY"
            return

        idx = int(self._rng.randint(0, len(available)))
        stolen = available[idx]
        s.players[victim].resources[stolen] -= 1
        s.players[s.current_player].resources[stolen] += 1
        s.phase = "TRADE_BUILD_PLAY"

    def _apply_build_road(self, player: int, edge: int, free: bool = False) -> None:
        s = self.state
        s.edge_roads[edge] = player
        p = s.players[player]
        p.remaining_roads -= 1
        if not free:
            for r in RESOURCES:
                p.resources[r] -= ROAD_COST[r]
                s.bank[r] += ROAD_COST[r]

    def _apply_build_settlement(self, vertex: int) -> None:
        s = self.state
        pid = s.current_player
        s.vertex_buildings[vertex] = ("settlement", pid)
        p = s.players[pid]
        p.remaining_settlements -= 1
        for r in RESOURCES:
            p.resources[r] -= SETTLEMENT_COST[r]
            s.bank[r] += SETTLEMENT_COST[r]

    def _apply_build_city(self, vertex: int) -> None:
        s = self.state
        pid = s.current_player
        s.vertex_buildings[vertex] = ("city", pid)
        p = s.players[pid]
        p.remaining_cities -= 1
        p.remaining_settlements += 1  # settlement returned
        for r in RESOURCES:
            p.resources[r] -= CITY_COST[r]
            s.bank[r] += CITY_COST[r]

    def _apply_buy_dev_card(self) -> None:
        s = self.state
        pid = s.current_player
        card = s.dev_card_deck.pop()
        p = s.players[pid]
        for r in RESOURCES:
            p.resources[r] -= DEV_CARD_COST[r]
            s.bank[r] += DEV_CARD_COST[r]
        p.new_dev_cards.append(card)

    def _apply_play_knight(self) -> None:
        s = self.state
        pid = s.current_player
        p = s.players[pid]
        p.dev_cards = _remove_dev_card(p.dev_cards, "knight")
        p.knights_played += 1
        p.has_played_dev_card_this_turn = True
        update_largest_army(s)
        s.phase = "MOVE_ROBBER"

    def _apply_play_road_building(self) -> None:
        s = self.state
        pid = s.current_player
        p = s.players[pid]
        p.dev_cards = _remove_dev_card(p.dev_cards, "road_building")
        p.has_played_dev_card_this_turn = True
        roads_to_place = min(2, p.remaining_roads)
        if roads_to_place == 0:
            return  # stay in TRADE_BUILD_PLAY
        s.phase = "ROAD_BUILDING_PLACE"
        s.road_building_roads_left = roads_to_place

    def _apply_place_road_building_road(self, edge: int) -> None:
        s = self.state
        pid = s.current_player
        self._apply_build_road(pid, edge, free=True)
        s.road_building_roads_left -= 1

        if s.road_building_roads_left <= 0:
            s.phase = "TRADE_BUILD_PLAY"
        else:
            valid = get_valid_road_edges_no_resource_check(s, pid)
            if not valid:
                s.phase = "TRADE_BUILD_PLAY"
                s.road_building_roads_left = 0

        update_longest_road(s)

    def _apply_play_year_of_plenty(self) -> None:
        s = self.state
        pid = s.current_player
        p = s.players[pid]
        p.dev_cards = _remove_dev_card(p.dev_cards, "year_of_plenty")
        p.has_played_dev_card_this_turn = True
        s.phase = "YEAR_OF_PLENTY_PICK"

    def _apply_pick_yop(self, r1: str, r2: str) -> None:
        s = self.state
        pid = s.current_player
        p = s.players[pid]
        p.resources[r1] += 1
        p.resources[r2] += 1
        s.bank[r1] -= 1
        s.bank[r2] -= 1
        s.phase = "TRADE_BUILD_PLAY"

    def _apply_play_monopoly(self) -> None:
        s = self.state
        pid = s.current_player
        p = s.players[pid]
        p.dev_cards = _remove_dev_card(p.dev_cards, "monopoly")
        p.has_played_dev_card_this_turn = True
        s.phase = "MONOPOLY_PICK"

    def _apply_pick_monopoly(self, resource: str) -> None:
        s = self.state
        pid = s.current_player
        total_stolen = 0
        for i in range(s.player_count):
            if i == pid:
                continue
            amount = s.players[i].resources[resource]
            if amount > 0:
                total_stolen += amount
                s.players[i].resources[resource] = 0
        s.players[pid].resources[resource] += total_stolen
        s.phase = "TRADE_BUILD_PLAY"

    def _apply_maritime_trade(self, give: str, receive: str) -> None:
        s = self.state
        pid = s.current_player
        ratio = _get_player_trade_ratio(s, pid, give)
        p = s.players[pid]
        p.resources[give] -= ratio
        p.resources[receive] += 1
        s.bank[give] += ratio
        s.bank[receive] -= 1

    def _apply_end_turn(self) -> None:
        s = self.state
        pid = s.current_player
        p = s.players[pid]

        # Promote new dev cards
        p.dev_cards.extend(p.new_dev_cards)
        p.new_dev_cards = []
        p.has_played_dev_card_this_turn = False

        # Check victory
        check_game_over(s)
        if s.phase == "GAME_OVER":
            return

        # Next player
        next_pid = (pid + 1) % s.player_count
        s.current_player = next_pid
        s.turn_number += 1
        s.last_roll = None
        s.phase = "ROLL_DICE"


# ──────────────────────────────────────────────────────────────────────
#  Quick smoke test
# ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    env = CatanEnv(player_count=4)
    state = env.reset(seed=42)
    topo = state.topology
    assert topo is not None
    print(f"Vertices: {topo.vertex_count}  Edges: {topo.edge_count}  Hexes: {len(topo.hex_coords)}")
    assert topo.vertex_count == 54, f"Expected 54 vertices, got {topo.vertex_count}"
    assert topo.edge_count == 72, f"Expected 72 edges, got {topo.edge_count}"
    assert len(topo.hex_coords) == 19

    step_count = 0
    done = False
    while not done:
        actions = env.get_legal_actions()
        if not actions:
            print(f"No legal actions in phase {state.phase}")
            break
        # Pick first legal action (deterministic but not smart)
        action = actions[0]
        state, reward, done, info = env.step(action)
        step_count += 1
        if step_count % 200 == 0:
            vps = [calculate_vp(state, p) for p in range(state.player_count)]
            print(f"Step {step_count}: phase={state.phase} turn={state.turn_number} VPs={vps}")
        if step_count > 10000:
            print("Stopping after 10000 steps (game not over).")
            break

    if done:
        print(f"Game over after {step_count} steps.  Winner: player {state.winner}")
        for p in range(state.player_count):
            print(f"  Player {p}: {calculate_vp(state, p)} VP")
    else:
        print(f"Game still running after {step_count} steps in phase {state.phase}")
