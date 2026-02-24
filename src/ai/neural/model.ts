/**
 * Pure TypeScript MLP (Multi-Layer Perceptron) forward pass.
 * No external dependencies — just matrix multiply and ReLU.
 *
 * Architecture: Input -> Hidden(256, ReLU) -> Hidden(128, ReLU) -> Output(1, tanh)
 */

export interface LayerWeights {
  /** Weight matrix: [outputSize][inputSize] (row-major) */
  weights: number[][];
  /** Bias vector: [outputSize] */
  biases: number[];
}

export interface ModelWeights {
  layers: LayerWeights[];
}

export class MLP {
  private layers: LayerWeights[];

  constructor(weights: ModelWeights) {
    this.layers = weights.layers;
  }

  /** Forward pass: returns a single scalar value */
  forward(input: Float32Array | number[]): number {
    let current: number[] = Array.from(input);

    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i];
      const output = new Array(layer.biases.length);

      for (let j = 0; j < layer.biases.length; j++) {
        let sum = layer.biases[j];
        const w = layer.weights[j];
        for (let k = 0; k < current.length; k++) {
          sum += w[k] * current[k];
        }
        output[j] = sum;
      }

      // Apply activation: ReLU for hidden layers, tanh for last
      const isLastLayer = i === this.layers.length - 1;
      if (isLastLayer) {
        // tanh activation for output
        for (let j = 0; j < output.length; j++) {
          output[j] = Math.tanh(output[j]);
        }
      } else {
        // ReLU for hidden layers
        for (let j = 0; j < output.length; j++) {
          if (output[j] < 0) output[j] = 0;
        }
      }

      current = output;
    }

    return current[0];
  }
}

/** Create default MLP architecture dimensions */
export function getDefaultArchitecture(inputSize: number): number[] {
  return [inputSize, 256, 128, 1];
}
