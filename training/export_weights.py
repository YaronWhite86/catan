"""
Export PyTorch model weights to JSON format compatible with the TypeScript MLP.

The TypeScript ModelWeights format:
{
  "layers": [
    { "weights": [[...], ...], "biases": [...] },   // Layer 1: 227 -> 256
    { "weights": [[...], ...], "biases": [...] },   // Layer 2: 256 -> 128
    { "weights": [[...], ...], "biases": [...] }    // Layer 3: 128 -> 1
  ]
}

weights[i] is the i-th row of the weight matrix (output dimension),
so weights[j][k] = W[j,k] where j is output index and k is input index.
This matches PyTorch's nn.Linear convention (weight shape: [out_features, in_features]).

Usage:
    python export_weights.py --checkpoint checkpoints/latest.pt --output ../public/ai-models/default-model.json
"""

from __future__ import annotations

import argparse
import json
import os
import sys

import torch

from model import PolicyValueNet, CatanMLP, INPUT_SIZE


def export_from_policy_value_net(checkpoint_path: str, output_path: str) -> None:
    """
    Export value network weights from a PolicyValueNet checkpoint.

    The value network consists of 3 linear layers:
        shared_fc1 (227 -> 256)
        shared_fc2 (256 -> 128)
        value_head (128 -> 1)

    These map directly to the TypeScript MLP layers.
    """
    print(f"Loading checkpoint: {checkpoint_path}")
    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=True)

    # Load the model
    state_dict = checkpoint["model_state_dict"]

    # Check if this is a PolicyValueNet or CatanMLP
    if "shared_fc1.weight" in state_dict:
        # PolicyValueNet -- extract value network layers
        layer_mappings = [
            ("shared_fc1.weight", "shared_fc1.bias"),
            ("shared_fc2.weight", "shared_fc2.bias"),
            ("value_head.weight", "value_head.bias"),
        ]
    elif "fc1.weight" in state_dict:
        # CatanMLP -- direct mapping
        layer_mappings = [
            ("fc1.weight", "fc1.bias"),
            ("fc2.weight", "fc2.bias"),
            ("fc3.weight", "fc3.bias"),
        ]
    else:
        print("Error: Unrecognized model architecture in checkpoint.")
        print(f"Available keys: {list(state_dict.keys())}")
        sys.exit(1)

    # Build the JSON structure
    layers = []
    for weight_key, bias_key in layer_mappings:
        weight = state_dict[weight_key]  # shape: [out_features, in_features]
        bias = state_dict[bias_key]      # shape: [out_features]

        # Convert to nested lists (row-major: weights[j][k] where j=output, k=input)
        # This matches the TypeScript convention: layer.weights[j] is the weight vector
        # for output neuron j, and layer.weights[j][k] is the connection from input k.
        layer = {
            "weights": weight.tolist(),
            "biases": bias.tolist(),
        }
        layers.append(layer)

        print(f"  Layer: {weight_key} -> shape {list(weight.shape)}")

    model_weights = {"layers": layers}

    # Write JSON
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(model_weights, f)

    # Report file size
    file_size = os.path.getsize(output_path)
    print(f"\nExported to: {output_path}")
    print(f"File size: {file_size / 1024:.1f} KB")
    print(f"Layers: {len(layers)}")
    for i, layer in enumerate(layers):
        w = layer["weights"]
        print(f"  Layer {i}: weights [{len(w)}][{len(w[0])}], biases [{len(layer['biases'])}]")


def verify_export(checkpoint_path: str, output_path: str) -> None:
    """
    Verify that the exported JSON weights produce the same output as the PyTorch model.
    """
    import numpy as np

    print("\n--- Verification ---")

    # Load PyTorch model
    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=True)
    state_dict = checkpoint["model_state_dict"]

    if "shared_fc1.weight" in state_dict:
        config = checkpoint.get("config", {})
        max_actions = config.get("max_actions", 200)
        model = PolicyValueNet(input_size=INPUT_SIZE, max_actions=max_actions)
        model.load_state_dict(state_dict)
        model.eval()

        # Generate random input
        x = torch.randn(1, INPUT_SIZE)
        with torch.no_grad():
            _, value = model(x)
        pytorch_value = value.item()
    else:
        model = CatanMLP(input_size=INPUT_SIZE)
        model.load_state_dict(state_dict)
        model.eval()

        x = torch.randn(1, INPUT_SIZE)
        with torch.no_grad():
            value = model(x)
        pytorch_value = value.item()

    # Load JSON weights and do manual forward pass
    with open(output_path, "r") as f:
        weights_json = json.load(f)

    # Manual forward pass matching TypeScript MLP.forward()
    current = x.squeeze(0).numpy().tolist()

    for i, layer in enumerate(weights_json["layers"]):
        w = layer["weights"]
        b = layer["biases"]
        output = []
        for j in range(len(b)):
            s = b[j]
            for k in range(len(current)):
                s += w[j][k] * current[k]
            output.append(s)

        is_last = i == len(weights_json["layers"]) - 1
        if is_last:
            output = [np.tanh(v) for v in output]
        else:
            output = [max(0, v) for v in output]

        current = output

    json_value = current[0]

    print(f"PyTorch value:  {pytorch_value:.8f}")
    print(f"JSON value:     {json_value:.8f}")
    print(f"Difference:     {abs(pytorch_value - json_value):.2e}")

    if abs(pytorch_value - json_value) < 1e-5:
        print("PASS: Values match within tolerance.")
    else:
        print("WARNING: Values differ more than expected. Check weight export.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export PyTorch Catan AI weights to TypeScript-compatible JSON"
    )
    parser.add_argument(
        "--checkpoint",
        type=str,
        required=True,
        help="Path to PyTorch checkpoint (.pt file)",
    )
    parser.add_argument(
        "--output",
        type=str,
        required=True,
        help="Output path for JSON weights file",
    )
    parser.add_argument(
        "--verify",
        action="store_true",
        default=False,
        help="Verify exported weights produce same output as PyTorch model",
    )

    args = parser.parse_args()

    if not os.path.exists(args.checkpoint):
        print(f"Error: Checkpoint file not found: {args.checkpoint}")
        sys.exit(1)

    export_from_policy_value_net(args.checkpoint, args.output)

    if args.verify:
        verify_export(args.checkpoint, args.output)


if __name__ == "__main__":
    main()
