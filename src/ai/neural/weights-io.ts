/**
 * Load model weights from JSON into MLP instance.
 */
import { MLP } from './model';
import type { ModelWeights } from './model';

/**
 * Parse a JSON object into ModelWeights format.
 * Expected JSON structure:
 * {
 *   "layers": [
 *     { "weights": [[...], ...], "biases": [...] },
 *     ...
 *   ]
 * }
 */
export function parseModelWeights(json: unknown): ModelWeights {
  const obj = json as Record<string, unknown>;
  if (!obj || !Array.isArray(obj.layers)) {
    throw new Error('Invalid model weights: missing layers array');
  }

  const layers = (obj.layers as Record<string, unknown>[]).map((layer, i) => {
    if (!Array.isArray(layer.weights) || !Array.isArray(layer.biases)) {
      throw new Error(`Invalid layer ${i}: missing weights or biases`);
    }
    return {
      weights: layer.weights as number[][],
      biases: layer.biases as number[],
    };
  });

  return { layers };
}

/**
 * Load model weights from a URL (e.g., /ai-models/default-model.json).
 */
export async function loadModelFromURL(url: string): Promise<MLP> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load model from ${url}: ${response.status}`);
  }
  const json = await response.json();
  const weights = parseModelWeights(json);
  return new MLP(weights);
}

/**
 * Create an MLP from a ModelWeights object.
 */
export function createModelFromWeights(weights: ModelWeights): MLP {
  return new MLP(weights);
}
