# Catan AI Training Pipeline

Train a neural network to play Settlers of Catan via PPO self-play, then export the weights for use in the TypeScript web application.

## Prerequisites

- Python 3.10+
- PyTorch 2.0+
- NumPy 1.24+

Install dependencies:

```bash
pip install -r requirements.txt
```

## Pipeline Overview

1. **Train** a policy-value network via PPO self-play
2. **Evaluate** the trained model against baselines
3. **Export** the value network weights to JSON for the TypeScript frontend

## Files

| File | Purpose |
|---|---|
| `catan_env.py` | Catan game environment (provided separately) |
| `feature_extractor.py` | Extract 227-feature vectors from game states (mirrors TypeScript) |
| `model.py` | PyTorch model definitions (CatanMLP, PolicyValueNet) |
| `trainer.py` | PPO self-play training loop |
| `evaluate.py` | Evaluate model against random/heuristic baselines |
| `export_weights.py` | Convert PyTorch weights to TypeScript-compatible JSON |

## How to Train

Basic training run:

```bash
python trainer.py --episodes 10000
```

Full options:

```bash
python trainer.py \
  --episodes 10000 \
  --lr 3e-4 \
  --batch-size 256 \
  --save-dir checkpoints \
  --save-interval 500 \
  --log-interval 50 \
  --opponent-update 200 \
  --gamma 0.99 \
  --gae-lambda 0.95 \
  --clip-epsilon 0.2 \
  --entropy-coeff 0.01 \
  --ppo-epochs 4 \
  --vp-shaping 0.05 \
  --device cpu
```

Checkpoints are saved to `checkpoints/` every 500 episodes by default. The latest checkpoint is always available at `checkpoints/latest.pt`.

### Training with GPU

If you have a CUDA-capable GPU:

```bash
python trainer.py --episodes 10000 --device cuda
```

## How to Evaluate

Evaluate against random opponents (baseline win rate should be ~25%):

```bash
python evaluate.py --checkpoint checkpoints/latest.pt --games 1000 --opponent random
```

Evaluate against heuristic opponents:

```bash
python evaluate.py --checkpoint checkpoints/latest.pt --games 500 --opponent heuristic --verbose
```

## How to Export Weights

Export trained weights to JSON for the TypeScript web application:

```bash
python export_weights.py \
  --checkpoint checkpoints/latest.pt \
  --output ../public/ai-models/default-model.json
```

To verify the export produces identical outputs:

```bash
python export_weights.py \
  --checkpoint checkpoints/latest.pt \
  --output ../public/ai-models/default-model.json \
  --verify
```

## Architecture

### Feature Vector (227 features)

The feature extractor produces a 227-element vector normalized to [0, 1]:

- **Per-player features** (33 x 4 = 132): Resources, dev cards, buildings, production, ports, VP, etc. Player-relative: the acting player is always slot 0.
- **Global features** (25): Turn number, phase one-hot, bank resources, robber info, current player.
- **Board summary** (70): Production concentration per player, hex ownership density.

This exactly mirrors `src/ai/features/feature-extractor.ts` so that weights trained in Python produce the same evaluations when loaded in TypeScript.

### Neural Network

**Value Network** (CatanMLP / TypeScript MLP):
```
Input(227) -> Linear(256) + ReLU -> Linear(128) + ReLU -> Linear(1) + Tanh
```
Output: scalar value estimate in [-1, 1].

**Policy-Value Network** (PolicyValueNet, for PPO training):
```
Shared:   Input(227) -> Linear(256) + ReLU -> Linear(128) + ReLU
Value:    Linear(128) -> Linear(1) + Tanh
Policy:   Linear(128) -> Linear(max_actions) -> logits
```

Only the value network weights (shared layers + value head) are exported to TypeScript.

### PPO Training

- **Self-play**: 4 neural agents play each game; one is designated the training player, the other 3 use a periodically-frozen copy of the weights.
- **Action masking**: Only legal actions receive probability mass during sampling.
- **Reward**: +1 win, -1 loss, small VP-gain shaping during the game.
- **GAE**: Generalized Advantage Estimation for variance reduction.

## Typical Training Timeline

| Episodes | Expected Behavior |
|---|---|
| 0-1000 | Random play, model learns basic structure |
| 1000-5000 | Starts preferring building over ending turn |
| 5000-10000 | Learns settlement/city priorities, basic resource management |
| 10000+ | Develops more sophisticated strategies |

Training speed depends on hardware. Expect ~0.5-2 seconds per episode on CPU.
