"""
PPO training loop for Catan AI via self-play.

Self-play: 4 copies of the neural agent play against each other in each game.
Opponent weights are periodically frozen to stabilize training.

Reward shaping:
    +1.0 for winning
    -1.0 for losing
    Small shaping for VP gains during the game

Usage:
    python trainer.py --episodes 10000 --lr 3e-4 --batch-size 256 --save-dir checkpoints
"""

from __future__ import annotations

import argparse
import os
import time
from collections import defaultdict
from dataclasses import dataclass, field

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.distributions import Categorical

from model import PolicyValueNet, INPUT_SIZE
from feature_extractor import extract_features, TOTAL_FEATURES
from catan_env import CatanEnv, CatanState, calculate_vp


# ---- PPO Hyperparameters ----

@dataclass
class PPOConfig:
    """PPO training configuration."""
    episodes: int = 10000
    lr: float = 3e-4
    batch_size: int = 256
    gamma: float = 0.99
    gae_lambda: float = 0.95
    clip_epsilon: float = 0.2
    entropy_coeff: float = 0.01
    value_loss_coeff: float = 0.5
    max_grad_norm: float = 0.5
    ppo_epochs: int = 4
    max_actions: int = 200
    save_dir: str = "checkpoints"
    save_interval: int = 500
    log_interval: int = 50
    opponent_update_interval: int = 200
    max_steps_per_game: int = 2000
    vp_shaping_coeff: float = 0.05
    device: str = "cpu"


# ---- Transition storage ----

@dataclass
class Transition:
    """Single step transition for PPO training."""
    state_features: np.ndarray
    action_idx: int
    reward: float
    done: bool
    log_prob: float
    value: float
    action_mask: np.ndarray


@dataclass
class RolloutBuffer:
    """Buffer for collecting rollout data across episodes."""
    transitions: list[Transition] = field(default_factory=list)

    def add(self, t: Transition) -> None:
        self.transitions.append(t)

    def clear(self) -> None:
        self.transitions.clear()

    def __len__(self) -> int:
        return len(self.transitions)


def build_action_mask(legal_action_count: int, max_actions: int) -> np.ndarray:
    """
    Build a binary mask: 1 for legal action indices, 0 for the rest.

    Legal actions are indexed 0..legal_action_count-1.
    """
    mask = np.zeros(max_actions, dtype=np.float32)
    mask[:legal_action_count] = 1.0
    return mask


# ---- Self-play game runner ----

def run_self_play_game(
    env: CatanEnv,
    model: PolicyValueNet,
    opponent_model: PolicyValueNet | None,
    config: PPOConfig,
    device: torch.device,
    training_player: int = 0,
) -> tuple[list[Transition], dict]:
    """
    Run a single self-play game. All 4 players use neural network policies.

    The training_player's transitions are collected for PPO training.
    Other players may use the opponent_model (frozen weights) or the same model.

    Args:
        env: CatanEnv instance
        model: Current policy-value network (for training_player)
        opponent_model: Frozen opponent model (for other players), or None to use same model
        config: PPO configuration
        device: torch device
        training_player: Which player index (0-3) is being trained

    Returns:
        Tuple of (transitions for training_player, game stats dict)
    """
    state = env.reset()
    transitions: list[Transition] = []
    prev_vp = {i: 0 for i in range(4)}
    step_count = 0
    opp_model = opponent_model if opponent_model is not None else model

    done = False
    while not done and step_count < config.max_steps_per_game:
        acting_player = env.get_acting_player()
        legal_actions = env.get_legal_actions()

        if len(legal_actions) == 0:
            break

        # Choose which model to use
        if acting_player == training_player:
            current_model = model
        else:
            current_model = opp_model

        # Extract features from the CatanState
        state_features = extract_features(state, acting_player)
        features_tensor = torch.tensor(
            state_features, dtype=torch.float32, device=device
        ).unsqueeze(0)

        # Forward pass
        with torch.no_grad():
            policy_logits, value = current_model(features_tensor)

        policy_logits = policy_logits.squeeze(0)  # (max_actions,)
        value_scalar = value.squeeze().item()

        # Build action mask
        num_legal = len(legal_actions)
        action_mask = build_action_mask(num_legal, config.max_actions)
        mask_tensor = torch.tensor(action_mask, dtype=torch.bool, device=device)

        # Mask illegal actions: set logits of illegal actions to -inf
        masked_logits = policy_logits.clone()
        masked_logits[~mask_tensor] = float("-inf")

        # Sample action from softmax over legal actions
        dist = Categorical(logits=masked_logits)
        action_idx = dist.sample().item()
        log_prob = dist.log_prob(torch.tensor(action_idx, device=device)).item()

        # Clamp action_idx to legal range
        if action_idx >= num_legal:
            action_idx = 0  # fallback to first legal action

        chosen_action = legal_actions[action_idx]

        # Store transition only for training player
        if acting_player == training_player:
            transitions.append(Transition(
                state_features=state_features,
                action_idx=action_idx,
                reward=0.0,  # will be filled with shaping + terminal reward
                done=False,
                log_prob=log_prob,
                value=value_scalar,
                action_mask=action_mask,
            ))

        # Step environment (returns (CatanState, reward, done, info))
        state, _reward, done, info = env.step(chosen_action)
        step_count += 1

        # VP-based reward shaping for training player
        if acting_player == training_player and transitions:
            current_vp = calculate_vp(state, training_player)
            vp_delta = current_vp - prev_vp[training_player]
            if vp_delta > 0:
                transitions[-1].reward += vp_delta * config.vp_shaping_coeff
            prev_vp[training_player] = current_vp

    # Terminal reward
    winner = state.winner
    if transitions:
        if winner == training_player:
            transitions[-1].reward += 1.0
        elif winner is not None:
            transitions[-1].reward -= 1.0
        transitions[-1].done = True

    # Stats
    stats = {
        "winner": winner,
        "steps": step_count,
        "training_player_won": winner == training_player,
        "terminal_vp": calculate_vp(state, training_player),
    }

    return transitions, stats


# ---- GAE computation ----

def compute_gae(
    transitions: list[Transition],
    gamma: float,
    gae_lambda: float,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Compute Generalized Advantage Estimation (GAE) and returns.

    Args:
        transitions: List of transitions from a single episode
        gamma: Discount factor
        gae_lambda: GAE lambda parameter

    Returns:
        Tuple of (returns, advantages) as numpy arrays
    """
    n = len(transitions)
    if n == 0:
        return np.array([], dtype=np.float32), np.array([], dtype=np.float32)

    advantages = np.zeros(n, dtype=np.float32)
    last_gae = 0.0

    for t in reversed(range(n)):
        if t == n - 1 or transitions[t].done:
            next_value = 0.0
        else:
            next_value = transitions[t + 1].value

        delta = transitions[t].reward + gamma * next_value - transitions[t].value
        advantages[t] = last_gae = delta + gamma * gae_lambda * last_gae

        # Reset GAE at episode boundaries
        if transitions[t].done and t > 0:
            last_gae = 0.0

    returns = advantages + np.array([t.value for t in transitions], dtype=np.float32)
    return returns, advantages


# ---- PPO update ----

def ppo_update(
    model: PolicyValueNet,
    optimizer: optim.Optimizer,
    transitions: list[Transition],
    returns: np.ndarray,
    advantages: np.ndarray,
    config: PPOConfig,
    device: torch.device,
) -> dict[str, float]:
    """
    Perform PPO update on collected transitions.

    Args:
        model: Policy-value network
        optimizer: Optimizer
        transitions: Collected transitions
        returns: Computed returns
        advantages: Computed advantages
        config: PPO configuration
        device: torch device

    Returns:
        Dictionary of training metrics
    """
    n = len(transitions)
    if n == 0:
        return {"policy_loss": 0.0, "value_loss": 0.0, "entropy": 0.0, "total_loss": 0.0}

    # Prepare tensors
    states = torch.tensor(
        np.stack([t.state_features for t in transitions]),
        dtype=torch.float32, device=device,
    )
    actions = torch.tensor(
        [t.action_idx for t in transitions],
        dtype=torch.long, device=device,
    )
    old_log_probs = torch.tensor(
        [t.log_prob for t in transitions],
        dtype=torch.float32, device=device,
    )
    returns_t = torch.tensor(returns, dtype=torch.float32, device=device)
    advantages_t = torch.tensor(advantages, dtype=torch.float32, device=device)
    action_masks = torch.tensor(
        np.stack([t.action_mask for t in transitions]),
        dtype=torch.bool, device=device,
    )

    # Normalize advantages
    if len(advantages_t) > 1:
        advantages_t = (advantages_t - advantages_t.mean()) / (advantages_t.std() + 1e-8)

    total_metrics: dict[str, float] = defaultdict(float)

    for _ in range(config.ppo_epochs):
        # Shuffle and create minibatches
        indices = np.arange(n)
        np.random.shuffle(indices)

        for start in range(0, n, config.batch_size):
            end = min(start + config.batch_size, n)
            batch_idx = indices[start:end]

            b_states = states[batch_idx]
            b_actions = actions[batch_idx]
            b_old_log_probs = old_log_probs[batch_idx]
            b_returns = returns_t[batch_idx]
            b_advantages = advantages_t[batch_idx]
            b_masks = action_masks[batch_idx]

            # Forward pass
            policy_logits, values = model(b_states)
            values = values.squeeze(-1)

            # Mask illegal actions
            masked_logits = policy_logits.clone()
            masked_logits[~b_masks] = float("-inf")

            # Compute new log probs and entropy
            dist = Categorical(logits=masked_logits)
            new_log_probs = dist.log_prob(b_actions)
            entropy = dist.entropy().mean()

            # PPO clipped objective
            ratio = torch.exp(new_log_probs - b_old_log_probs)
            surr1 = ratio * b_advantages
            surr2 = torch.clamp(
                ratio, 1.0 - config.clip_epsilon, 1.0 + config.clip_epsilon
            ) * b_advantages
            policy_loss = -torch.min(surr1, surr2).mean()

            # Value loss
            value_loss = nn.functional.mse_loss(values, b_returns)

            # Total loss
            loss = (
                policy_loss
                + config.value_loss_coeff * value_loss
                - config.entropy_coeff * entropy
            )

            # Backprop
            optimizer.zero_grad()
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), config.max_grad_norm)
            optimizer.step()

            total_metrics["policy_loss"] += policy_loss.item()
            total_metrics["value_loss"] += value_loss.item()
            total_metrics["entropy"] += entropy.item()
            total_metrics["total_loss"] += loss.item()
            total_metrics["num_updates"] += 1

    # Average metrics
    num_updates = max(total_metrics["num_updates"], 1)
    return {
        "policy_loss": total_metrics["policy_loss"] / num_updates,
        "value_loss": total_metrics["value_loss"] / num_updates,
        "entropy": total_metrics["entropy"] / num_updates,
        "total_loss": total_metrics["total_loss"] / num_updates,
    }


# ---- Main training loop ----

def train(config: PPOConfig) -> None:
    """Main PPO training loop with self-play."""
    device = torch.device(config.device)
    print(f"Training on device: {device}")
    print(f"Config: episodes={config.episodes}, lr={config.lr}, batch_size={config.batch_size}")

    # Create models
    model = PolicyValueNet(
        input_size=INPUT_SIZE, max_actions=config.max_actions
    ).to(device)
    opponent_model = PolicyValueNet(
        input_size=INPUT_SIZE, max_actions=config.max_actions
    ).to(device)
    opponent_model.load_state_dict(model.state_dict())
    opponent_model.eval()

    optimizer = optim.Adam(model.parameters(), lr=config.lr, eps=1e-5)

    # Create save directory
    os.makedirs(config.save_dir, exist_ok=True)

    # Create environment
    env = CatanEnv(player_count=4)

    # Training metrics
    win_count = 0
    total_games = 0
    recent_wins: list[bool] = []
    recent_steps: list[int] = []
    recent_vps: list[int] = []
    buffer = RolloutBuffer()

    print("\n=== Starting PPO Self-Play Training ===\n")
    start_time = time.time()

    for episode in range(1, config.episodes + 1):
        # Rotate which player slot is the training player
        training_player = (episode - 1) % 4

        # Run self-play game
        transitions, stats = run_self_play_game(
            env=env,
            model=model,
            opponent_model=opponent_model,
            config=config,
            device=device,
            training_player=training_player,
        )

        # Add transitions to buffer
        for t in transitions:
            buffer.add(t)

        # Track stats
        total_games += 1
        won = stats["training_player_won"]
        if won:
            win_count += 1
        recent_wins.append(won)
        recent_steps.append(stats["steps"])
        recent_vps.append(stats["terminal_vp"])

        # Keep only last 100 for rolling stats
        if len(recent_wins) > 100:
            recent_wins = recent_wins[-100:]
            recent_steps = recent_steps[-100:]
            recent_vps = recent_vps[-100:]

        # PPO update when buffer is large enough
        if len(buffer) >= config.batch_size:
            returns, advantages = compute_gae(
                buffer.transitions, config.gamma, config.gae_lambda
            )
            metrics = ppo_update(
                model, optimizer, buffer.transitions, returns, advantages,
                config, device,
            )
            buffer.clear()
        else:
            metrics = None

        # Logging
        if episode % config.log_interval == 0:
            elapsed = time.time() - start_time
            win_rate = sum(recent_wins) / len(recent_wins) if recent_wins else 0
            avg_steps = sum(recent_steps) / len(recent_steps) if recent_steps else 0
            avg_vp = sum(recent_vps) / len(recent_vps) if recent_vps else 0

            print(
                f"Episode {episode}/{config.episodes} | "
                f"Win rate (last 100): {win_rate:.2%} | "
                f"Avg steps: {avg_steps:.0f} | "
                f"Avg VP: {avg_vp:.1f} | "
                f"Time: {elapsed:.0f}s"
            )

            if metrics is not None:
                print(
                    f"  Policy loss: {metrics['policy_loss']:.4f} | "
                    f"Value loss: {metrics['value_loss']:.4f} | "
                    f"Entropy: {metrics['entropy']:.4f}"
                )

        # Update opponent weights periodically
        if episode % config.opponent_update_interval == 0:
            opponent_model.load_state_dict(model.state_dict())
            opponent_model.eval()
            print(f"  [Opponent weights updated at episode {episode}]")

        # Save checkpoint
        if episode % config.save_interval == 0:
            _save_checkpoint(model, optimizer, config, episode, recent_wins)

    # Final save
    final_path = os.path.join(config.save_dir, "final.pt")
    torch.save({
        "episode": config.episodes,
        "model_state_dict": model.state_dict(),
        "optimizer_state_dict": optimizer.state_dict(),
        "win_rate": sum(recent_wins) / len(recent_wins) if recent_wins else 0,
        "config": {
            "episodes": config.episodes,
            "lr": config.lr,
            "batch_size": config.batch_size,
            "max_actions": config.max_actions,
        },
    }, final_path)

    elapsed = time.time() - start_time
    win_rate = sum(recent_wins) / len(recent_wins) if recent_wins else 0
    print(f"\n=== Training Complete ===")
    print(f"Total episodes: {config.episodes}")
    print(f"Final win rate (last 100): {win_rate:.2%}")
    print(f"Total time: {elapsed:.0f}s ({elapsed / config.episodes:.2f}s/episode)")
    print(f"Final checkpoint: {final_path}")


def _save_checkpoint(
    model: PolicyValueNet,
    optimizer: optim.Optimizer,
    config: PPOConfig,
    episode: int,
    recent_wins: list[bool],
) -> None:
    """Save a training checkpoint."""
    checkpoint_path = os.path.join(config.save_dir, f"checkpoint_{episode}.pt")
    win_rate = sum(recent_wins) / len(recent_wins) if recent_wins else 0
    payload = {
        "episode": episode,
        "model_state_dict": model.state_dict(),
        "optimizer_state_dict": optimizer.state_dict(),
        "win_rate": win_rate,
        "config": {
            "episodes": config.episodes,
            "lr": config.lr,
            "batch_size": config.batch_size,
            "max_actions": config.max_actions,
        },
    }
    torch.save(payload, checkpoint_path)
    print(f"  [Checkpoint saved: {checkpoint_path}]")

    # Also save as latest
    latest_path = os.path.join(config.save_dir, "latest.pt")
    torch.save(payload, latest_path)


def parse_args() -> PPOConfig:
    """Parse command line arguments into PPOConfig."""
    parser = argparse.ArgumentParser(
        description="PPO training for Catan AI via self-play"
    )
    parser.add_argument(
        "--episodes", type=int, default=10000,
        help="Number of training episodes",
    )
    parser.add_argument(
        "--lr", type=float, default=3e-4,
        help="Learning rate",
    )
    parser.add_argument(
        "--batch-size", type=int, default=256,
        help="PPO minibatch size",
    )
    parser.add_argument(
        "--save-dir", type=str, default="checkpoints",
        help="Directory for saving checkpoints",
    )
    parser.add_argument(
        "--save-interval", type=int, default=500,
        help="Save checkpoint every N episodes",
    )
    parser.add_argument(
        "--log-interval", type=int, default=50,
        help="Log metrics every N episodes",
    )
    parser.add_argument(
        "--opponent-update", type=int, default=200,
        help="Update opponent weights every N episodes",
    )
    parser.add_argument(
        "--max-actions", type=int, default=200,
        help="Max action space size",
    )
    parser.add_argument(
        "--gamma", type=float, default=0.99,
        help="Discount factor",
    )
    parser.add_argument(
        "--gae-lambda", type=float, default=0.95,
        help="GAE lambda",
    )
    parser.add_argument(
        "--clip-epsilon", type=float, default=0.2,
        help="PPO clip epsilon",
    )
    parser.add_argument(
        "--entropy-coeff", type=float, default=0.01,
        help="Entropy bonus coefficient",
    )
    parser.add_argument(
        "--ppo-epochs", type=int, default=4,
        help="PPO epochs per update",
    )
    parser.add_argument(
        "--vp-shaping", type=float, default=0.05,
        help="VP-based reward shaping coefficient",
    )
    parser.add_argument(
        "--device", type=str, default="cpu",
        help="Device (cpu or cuda)",
    )

    args = parser.parse_args()

    return PPOConfig(
        episodes=args.episodes,
        lr=args.lr,
        batch_size=args.batch_size,
        save_dir=args.save_dir,
        save_interval=args.save_interval,
        log_interval=args.log_interval,
        opponent_update_interval=args.opponent_update,
        max_actions=args.max_actions,
        gamma=args.gamma,
        gae_lambda=args.gae_lambda,
        clip_epsilon=args.clip_epsilon,
        entropy_coeff=args.entropy_coeff,
        ppo_epochs=args.ppo_epochs,
        vp_shaping_coeff=args.vp_shaping,
        device=args.device,
    )


if __name__ == "__main__":
    config = parse_args()
    train(config)
