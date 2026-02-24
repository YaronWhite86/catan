"""
PyTorch neural network models for Catan AI.

CatanMLP:
    Value-only network matching the TypeScript architecture.
    Input: 227 -> Hidden: 256 (ReLU) -> Hidden: 128 (ReLU) -> Output: 1 (tanh)

PolicyValueNet:
    Shared-trunk network with separate value and policy heads for PPO training.
    Shared: 227 -> 256 (ReLU) -> 128 (ReLU)
    Value head: 128 -> 1 (tanh)
    Policy head: 128 -> max_actions (raw logits)
"""

from __future__ import annotations

import torch
import torch.nn as nn

from feature_extractor import TOTAL_FEATURES

# Default architecture dimensions (must match TS: getDefaultArchitecture)
INPUT_SIZE = TOTAL_FEATURES   # 227
HIDDEN1_SIZE = 256
HIDDEN2_SIZE = 128
VALUE_OUTPUT_SIZE = 1


class CatanMLP(nn.Module):
    """
    Value-only MLP matching the TypeScript MLP architecture.

    Architecture: Input(227) -> Linear(256) + ReLU -> Linear(128) + ReLU -> Linear(1) + Tanh
    Output: scalar value estimate in [-1, 1].
    """

    def __init__(self, input_size: int = INPUT_SIZE) -> None:
        super().__init__()
        self.fc1 = nn.Linear(input_size, HIDDEN1_SIZE)
        self.fc2 = nn.Linear(HIDDEN1_SIZE, HIDDEN2_SIZE)
        self.fc3 = nn.Linear(HIDDEN2_SIZE, VALUE_OUTPUT_SIZE)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Forward pass.

        Args:
            x: Input tensor of shape (batch, INPUT_SIZE) or (INPUT_SIZE,)

        Returns:
            Value estimate of shape (batch, 1) or (1,), values in [-1, 1]
        """
        x = torch.relu(self.fc1(x))
        x = torch.relu(self.fc2(x))
        x = torch.tanh(self.fc3(x))
        return x


class PolicyValueNet(nn.Module):
    """
    Combined policy + value network for PPO training.

    Shared trunk: Input(227) -> Linear(256) + ReLU -> Linear(128) + ReLU
    Value head:   Linear(128) -> Linear(1) + Tanh  -> scalar in [-1, 1]
    Policy head:  Linear(128) -> Linear(max_actions) -> raw logits

    The policy head outputs raw logits; action masking and softmax are applied
    externally during action selection.
    """

    def __init__(
        self,
        input_size: int = INPUT_SIZE,
        max_actions: int = 200,
    ) -> None:
        super().__init__()
        self.max_actions = max_actions

        # Shared trunk
        self.shared_fc1 = nn.Linear(input_size, HIDDEN1_SIZE)
        self.shared_fc2 = nn.Linear(HIDDEN1_SIZE, HIDDEN2_SIZE)

        # Value head
        self.value_head = nn.Linear(HIDDEN2_SIZE, 1)

        # Policy head
        self.policy_head = nn.Linear(HIDDEN2_SIZE, max_actions)

    def forward(
        self, x: torch.Tensor
    ) -> tuple[torch.Tensor, torch.Tensor]:
        """
        Forward pass returning both policy logits and value.

        Args:
            x: Input tensor of shape (batch, INPUT_SIZE)

        Returns:
            Tuple of:
                - policy_logits: (batch, max_actions) raw logits
                - value: (batch, 1) value estimates in [-1, 1]
        """
        # Shared trunk
        h = torch.relu(self.shared_fc1(x))
        h = torch.relu(self.shared_fc2(h))

        # Value head
        value = torch.tanh(self.value_head(h))

        # Policy head (raw logits, masking applied externally)
        policy_logits = self.policy_head(h)

        return policy_logits, value

    def get_value(self, x: torch.Tensor) -> torch.Tensor:
        """Get only the value estimate (for advantage computation)."""
        h = torch.relu(self.shared_fc1(x))
        h = torch.relu(self.shared_fc2(h))
        return torch.tanh(self.value_head(h))

    def get_policy(self, x: torch.Tensor) -> torch.Tensor:
        """Get only the policy logits."""
        h = torch.relu(self.shared_fc1(x))
        h = torch.relu(self.shared_fc2(h))
        return self.policy_head(h)

    def extract_value_weights(self) -> dict[str, torch.Tensor]:
        """
        Extract only the value network weights for export to TypeScript.

        Returns a state_dict with 3 linear layers:
            fc1 (shared), fc2 (shared), fc3 (value head)
        matching the CatanMLP / TS MLP architecture.
        """
        return {
            "fc1.weight": self.shared_fc1.weight.data.clone(),
            "fc1.bias": self.shared_fc1.bias.data.clone(),
            "fc2.weight": self.shared_fc2.weight.data.clone(),
            "fc2.bias": self.shared_fc2.bias.data.clone(),
            "fc3.weight": self.value_head.weight.data.clone(),
            "fc3.bias": self.value_head.bias.data.clone(),
        }
