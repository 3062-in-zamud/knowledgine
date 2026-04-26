/**
 * Uniform-scale int8 quantization for L2-normalized 384-dim vectors.
 *
 * Each component of an L2-normalized vector lies in [-1, 1], so a single
 * shared scale (1/127) captures full dynamic range without per-row metadata.
 * Sharing the scale is required by sqlite-vec's `INT8[N]` virtual table —
 * it does not store per-row scales, so two vectors quantized with
 * different scales would become incomparable for KNN distance.
 */

export const QUANTIZATION_SCALE = 1 / 127;

/**
 * Quantize a Float32Array to Int8Array using uniform symmetric scale.
 * Components outside `[-1, 1]` are clamped to `[-128, 127]` without error.
 */
export function quantizeFloat32ToInt8(vec: Float32Array): Int8Array {
  const out = new Int8Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    const q = Math.round(vec[i] * 127);
    out[i] = q > 127 ? 127 : q < -128 ? -128 : q;
  }
  return out;
}

/** Inverse: `v[i] ≈ q[i] / 127`. Used for sanity tests and rerank. */
export function dequantizeInt8(bytes: Int8Array): Float32Array {
  const out = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = bytes[i] / 127;
  }
  return out;
}
