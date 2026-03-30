import type { EmbeddingProvider } from "../../src/embedding/embedding-provider.js";

const DIMENSIONS = 384;

/**
 * テスト用決定論的埋め込みプロバイダー。
 * テキストのバイト値からシード値を計算し、再現性のある Float32Array を生成する。
 */
export class MockEmbeddingProvider implements EmbeddingProvider {
  private dimensions: number;

  constructor(dimensions: number = DIMENSIONS) {
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<Float32Array> {
    return this.computeDeterministicEmbedding(text);
  }

  async embedQuery(text: string): Promise<Float32Array> {
    // E5 query: prefix would normally be added by the real provider.
    // In tests, delegate to the same deterministic embedding.
    return this.computeDeterministicEmbedding(text);
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return texts.map((t) => this.computeDeterministicEmbedding(t));
  }

  getDimensions(): number {
    return this.dimensions;
  }

  private computeDeterministicEmbedding(text: string): Float32Array {
    const vec = new Float32Array(this.dimensions);
    // Simple deterministic hash: spread character codes across dimensions
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      const idx = (i * 31 + charCode) % this.dimensions;
      vec[idx] += charCode / 128.0;
    }
    // Normalize to unit vector
    let norm = 0;
    for (const v of vec) {
      norm += v * v;
    }
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < vec.length; i++) {
        vec[i] /= norm;
      }
    }
    return vec;
  }
}
