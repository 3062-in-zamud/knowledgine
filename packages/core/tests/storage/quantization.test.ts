import { describe, it, expect } from "vitest";
import {
  quantizeFloat32ToInt8,
  dequantizeInt8,
  QUANTIZATION_SCALE,
} from "../../src/storage/quantization.js";

describe("quantizeFloat32ToInt8", () => {
  it("uses a uniform scale of 1/127", () => {
    expect(QUANTIZATION_SCALE).toBeCloseTo(1 / 127, 6);
  });

  it("maps 0 to 0", () => {
    const q = quantizeFloat32ToInt8(new Float32Array([0, 0, 0]));
    expect(q[0]).toBe(0);
    expect(q[1]).toBe(0);
    expect(q[2]).toBe(0);
  });

  it("maps 1.0 to 127 and -1.0 to -127", () => {
    const q = quantizeFloat32ToInt8(new Float32Array([1.0, -1.0]));
    expect(q[0]).toBe(127);
    expect(q[1]).toBe(-127);
  });

  it("clamps values outside [-1, 1] without throwing", () => {
    const q = quantizeFloat32ToInt8(new Float32Array([2.5, -3.0, 1.0001]));
    expect(q[0]).toBe(127);
    expect(q[1]).toBe(-128);
    expect(q[2]).toBe(127);
  });

  it("rounds half-values consistently", () => {
    // 0.5 * 127 = 63.5 → Math.round → 64 (Banker's? Node uses commercial)
    const q = quantizeFloat32ToInt8(new Float32Array([0.5]));
    expect(Math.abs(q[0] - 64)).toBeLessThanOrEqual(1);
  });

  it("produces an Int8Array of the same length as the input", () => {
    const v = new Float32Array(384);
    for (let i = 0; i < 384; i++) v[i] = (i % 7) / 10;
    const q = quantizeFloat32ToInt8(v);
    expect(q).toBeInstanceOf(Int8Array);
    expect(q.length).toBe(384);
  });
});

describe("dequantizeInt8 (round-trip)", () => {
  it("reconstructs L2-normalized vectors with error <= 1/127", () => {
    const v = new Float32Array(384);
    let n = 0;
    for (let i = 0; i < 384; i++) {
      v[i] = Math.sin(i * 0.31) - Math.cos(i * 0.17);
      n += v[i] * v[i];
    }
    n = Math.sqrt(n);
    for (let i = 0; i < 384; i++) v[i] /= n;

    const q = quantizeFloat32ToInt8(v);
    const dq = dequantizeInt8(q);

    let maxErr = 0;
    for (let i = 0; i < 384; i++) maxErr = Math.max(maxErr, Math.abs(v[i] - dq[i]));
    expect(maxErr).toBeLessThanOrEqual(1 / 127 + 1e-7);
  });

  it("is exact at integer multiples of 1/127", () => {
    const q = new Int8Array([0, 64, -64, 127, -127]);
    const dq = dequantizeInt8(q);
    expect(dq[0]).toBeCloseTo(0, 6);
    expect(dq[1]).toBeCloseTo(64 / 127, 6);
    expect(dq[2]).toBeCloseTo(-64 / 127, 6);
    expect(dq[3]).toBeCloseTo(1.0, 6);
    expect(dq[4]).toBeCloseTo(-1.0, 6);
  });
});
