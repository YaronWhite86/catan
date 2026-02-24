"""
Evaluate a trained Catan AI model against baseline opponents.

Plays N games of the trained model vs heuristic/random baselines
and reports win rates and other statistics.

Usage:
    python evaluate.py --checkpoint checkpoints/latest.pt --games 1000 --opponent random
    python evaluate.py --checkpoint checkpoints/latest.pt --games 500 --opponent heuristic
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from collections import defaultdict

import numpy as np
import torch
from torch.distributions import Categorical

from model import PolicyValueNet, CatanMLP, INPUT_SIZE
from feature_extractor import extract_features, TOTAL_FEATURES
from catan_env import (
    CatanEnv,
    CatanState,
    calculate_vp,
    TERRAIN_TO_RESOURCE,
    RESOURCES,
)


# ---- Opponent strategies ----

PIP_COUNTS = {2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1}


class RandomOpponent:
    """Picks a random legal action each turn."""

    def choose_action(
        self, state: CatanState, legal_actions: list[tuple], player: int
    ) -> tuple:
        if len(legal_actions) == 0:
            raise ValueError("No legal actions available")
        idx = np.random.randint(len(legal_actions))
        return legal_actions[idx]


class HeuristicOpponent:
    """
    Simple heuristic opponent that uses hand-crafted scoring.

    Priority: build city > build settlement > buy dev card > build road >
              maritime trade > end turn.
    """

    def choose_action(
        self, state: CatanState, legal_actions: list[tuple], player: int
    ) -> tuple:
        if len(legal_actions) == 0:
            raise ValueError("No legal actions available")
        if len(legal_actions) == 1:
            return legal_actions[0]

        # Score each action
        scored = [
            (self._score_action(a, state, player), i)
            for i, a in enumerate(legal_actions)
        ]
        scored.sort(key=lambda x: -x[0])  # highest score first

        # Add a small random tiebreaker
        best_score = scored[0][0]
        candidates = [idx for score, idx in scored if score >= best_score - 1.0]
        chosen_idx = candidates[np.random.randint(len(candidates))]
        return legal_actions[chosen_idx]

    def _score_action(self, action: tuple, state: CatanState, player: int) -> float:
        action_type = action[0]

        # Setup: score by production pips at the vertex
        if action_type == "PLACE_SETUP_SETTLEMENT":
            return self._score_setup_vertex(state, action[1])
        if action_type == "PLACE_SETUP_ROAD":
            return 10.0 + np.random.random()

        # Building priorities
        if action_type == "BUILD_CITY":
            return 80.0
        if action_type == "BUILD_SETTLEMENT":
            return 60.0
        if action_type == "BUY_DEV_CARD":
            return 40.0
        if action_type == "BUILD_ROAD":
            return 20.0

        # Dev card plays
        if action_type == "PLAY_KNIGHT":
            return 45.0
        if action_type in (
            "PLAY_ROAD_BUILDING", "PLAY_YEAR_OF_PLENTY", "PLAY_MONOPOLY"
        ):
            return 35.0

        # Maritime trade
        if action_type == "MARITIME_TRADE":
            return 15.0

        # Robber
        if action_type == "MOVE_ROBBER":
            return 10.0 + np.random.random() * 5

        # Steal
        if action_type == "STEAL_RESOURCE":
            return 10.0 if action[1] is not None else 0.0

        # Year of plenty / monopoly picks
        if action_type == "PICK_YEAR_OF_PLENTY_RESOURCES":
            return 10.0 + np.random.random()
        if action_type == "PICK_MONOPOLY_RESOURCE":
            return 10.0 + np.random.random()

        # Discard
        if action_type == "DISCARD_RESOURCES":
            return np.random.random()

        # Road building placement
        if action_type == "PLACE_ROAD_BUILDING_ROAD":
            return 10.0 + np.random.random()

        # End turn (lowest priority)
        if action_type == "END_TURN":
            return -1.0

        # Roll dice
        if action_type == "ROLL_DICE":
            return 100.0

        return 0.0

    def _score_setup_vertex(self, state: CatanState, vertex: int) -> float:
        """Score a setup vertex by pip count of adjacent hexes."""
        topo = state.topology
        assert topo is not None
        total_pips = 0
        resource_types: set[str] = set()
        for hid in topo.vertex_adjacent_hexes[vertex]:
            token = state.hex_numbers[hid]
            if token is not None:
                total_pips += PIP_COUNTS.get(token, 0)
            terrain = state.hex_terrains[hid]
            res = TERRAIN_TO_RESOURCE.get(terrain)
            if res is not None:
                resource_types.add(res)
        return total_pips * 10.0 + len(resource_types) * 15.0


class NeuralOpponent:
    """Neural network opponent using a PolicyValueNet."""

    def __init__(
        self,
        model: PolicyValueNet,
        device: torch.device,
        max_actions: int = 200,
    ):
        self.model = model
        self.device = device
        self.max_actions = max_actions

    def choose_action(
        self, state: CatanState, legal_actions: list[tuple], player: int
    ) -> tuple:
        if len(legal_actions) == 0:
            raise ValueError("No legal actions available")
        if len(legal_actions) == 1:
            return legal_actions[0]

        state_features = extract_features(state, player)
        features_tensor = torch.tensor(
            state_features, dtype=torch.float32, device=self.device
        ).unsqueeze(0)

        with torch.no_grad():
            policy_logits, _ = self.model(features_tensor)
            policy_logits = policy_logits.squeeze(0)

        # Mask illegal actions
        num_legal = len(legal_actions)
        mask = torch.zeros(self.max_actions, dtype=torch.bool, device=self.device)
        mask[:num_legal] = True

        masked_logits = policy_logits.clone()
        masked_logits[~mask] = float("-inf")

        # Greedy selection (argmax)
        action_idx = masked_logits.argmax().item()
        if action_idx >= num_legal:
            action_idx = 0
        return legal_actions[action_idx]


# ---- Evaluation ----

def evaluate(
    checkpoint_path: str,
    num_games: int,
    opponent_type: str,
    device_str: str = "cpu",
    max_actions: int = 200,
    verbose: bool = False,
) -> dict:
    """
    Evaluate a trained model against baseline opponents.

    The trained model plays as player 0; other 3 players use the baseline.

    Args:
        checkpoint_path: Path to model checkpoint
        num_games: Number of games to play
        opponent_type: "random" or "heuristic"
        device_str: Device string
        max_actions: Max action space size
        verbose: Print per-game results

    Returns:
        Dictionary of evaluation statistics
    """
    device = torch.device(device_str)

    # Load model
    print(f"Loading model from: {checkpoint_path}")
    checkpoint = torch.load(
        checkpoint_path, map_location="cpu", weights_only=True
    )
    state_dict = checkpoint["model_state_dict"]

    if "shared_fc1.weight" in state_dict:
        model = PolicyValueNet(input_size=INPUT_SIZE, max_actions=max_actions)
        model.load_state_dict(state_dict)
    else:
        model = CatanMLP(input_size=INPUT_SIZE)
        model.load_state_dict(state_dict)
    model.to(device)
    model.eval()

    # Create opponents
    if opponent_type == "random":
        opponent = RandomOpponent()
        print("Opponent: Random")
    elif opponent_type == "heuristic":
        opponent = HeuristicOpponent()
        print("Opponent: Heuristic")
    else:
        print(f"Unknown opponent type: {opponent_type}")
        sys.exit(1)

    # Neural agent for player 0
    if isinstance(model, PolicyValueNet):
        neural_agent = NeuralOpponent(model, device, max_actions)
    else:
        # CatanMLP is value-only; fall back to heuristic with neural ranking
        neural_agent = None

    # Run games
    env = CatanEnv(player_count=4)

    wins_by_player: dict[int, int] = defaultdict(int)
    total_steps_list: list[int] = []
    trained_vps: list[int] = []

    print(f"\nPlaying {num_games} games...")
    start_time = time.time()

    for game_idx in range(num_games):
        state = env.reset()
        step_count = 0
        max_steps = 2000
        done = False

        while not done and step_count < max_steps:
            acting_player = env.get_acting_player()
            legal_actions = env.get_legal_actions()

            if len(legal_actions) == 0:
                break

            # Player 0 = trained model, players 1-3 = opponent
            if acting_player == 0 and neural_agent is not None:
                action = neural_agent.choose_action(
                    state, legal_actions, acting_player
                )
            else:
                action = opponent.choose_action(
                    state, legal_actions, acting_player
                )

            state, _reward, done, info = env.step(action)
            step_count += 1

        winner = state.winner
        if winner is not None:
            wins_by_player[winner] += 1

        total_steps_list.append(step_count)
        trained_vps.append(calculate_vp(state, 0))

        if verbose and (game_idx + 1) % 100 == 0:
            pct = (game_idx + 1) / num_games * 100
            win_rate = wins_by_player.get(0, 0) / (game_idx + 1)
            print(
                f"  Game {game_idx + 1}/{num_games} ({pct:.0f}%) - "
                f"Trained win rate: {win_rate:.2%}"
            )

    elapsed = time.time() - start_time

    # Compute statistics
    total_finished = sum(wins_by_player.values())
    trained_wins = wins_by_player.get(0, 0)
    trained_win_rate = trained_wins / num_games if num_games > 0 else 0

    results = {
        "num_games": num_games,
        "opponent_type": opponent_type,
        "trained_wins": trained_wins,
        "trained_win_rate": trained_win_rate,
        "wins_by_player": dict(wins_by_player),
        "games_finished": total_finished,
        "games_timed_out": num_games - total_finished,
        "avg_steps": float(np.mean(total_steps_list)),
        "avg_trained_vp": float(np.mean(trained_vps)),
        "median_trained_vp": float(np.median(trained_vps)),
        "elapsed_seconds": elapsed,
    }

    return results


def print_results(results: dict) -> None:
    """Print evaluation results in a formatted table."""
    print("\n" + "=" * 60)
    print("  EVALUATION RESULTS")
    print("=" * 60)
    print(f"  Games played:        {results['num_games']}")
    print(f"  Opponent type:       {results['opponent_type']}")
    print(f"  Games finished:      {results['games_finished']}")
    print(f"  Games timed out:     {results['games_timed_out']}")
    print()
    print(f"  Trained model (P0):")
    print(f"    Wins:              {results['trained_wins']}")
    print(f"    Win rate:          {results['trained_win_rate']:.2%}")
    print(f"    Avg VP:            {results['avg_trained_vp']:.1f}")
    print(f"    Median VP:         {results['median_trained_vp']:.1f}")
    print()
    print(f"  Wins by player:")
    for pid in sorted(results["wins_by_player"].keys()):
        count = results["wins_by_player"][pid]
        pct = count / results["num_games"] * 100 if results["num_games"] > 0 else 0
        label = "TRAINED" if pid == 0 else "opponent"
        print(f"    Player {pid} ({label}): {count} ({pct:.1f}%)")
    print()
    print(f"  Avg game length:     {results['avg_steps']:.0f} steps")
    print(
        f"  Evaluation time:     {results['elapsed_seconds']:.1f}s "
        f"({results['elapsed_seconds'] / max(results['num_games'], 1):.2f}s/game)"
    )
    print()
    baseline = 0.25  # expected win rate in 4-player game
    improvement = (results["trained_win_rate"] - baseline) / baseline * 100
    print(f"  Baseline (random):   25.0%")
    print(f"  Improvement:         {improvement:+.1f}%")
    print("=" * 60)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Evaluate trained Catan AI model"
    )
    parser.add_argument(
        "--checkpoint", type=str, required=True,
        help="Path to model checkpoint (.pt file)",
    )
    parser.add_argument(
        "--games", type=int, default=1000,
        help="Number of games to play (default: 1000)",
    )
    parser.add_argument(
        "--opponent", type=str, default="random",
        choices=["random", "heuristic"],
        help="Opponent type: random or heuristic (default: random)",
    )
    parser.add_argument(
        "--device", type=str, default="cpu",
        help="Device (cpu or cuda, default: cpu)",
    )
    parser.add_argument(
        "--max-actions", type=int, default=200,
        help="Max action space size (default: 200)",
    )
    parser.add_argument(
        "--verbose", action="store_true",
        help="Print progress every 100 games",
    )

    args = parser.parse_args()

    if not os.path.exists(args.checkpoint):
        print(f"Error: Checkpoint not found: {args.checkpoint}")
        sys.exit(1)

    results = evaluate(
        checkpoint_path=args.checkpoint,
        num_games=args.games,
        opponent_type=args.opponent,
        device_str=args.device,
        max_actions=args.max_actions,
        verbose=args.verbose,
    )

    print_results(results)


if __name__ == "__main__":
    main()
