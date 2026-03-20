import { describe, it, expect, beforeAll } from "vitest";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { ModelManager } from "../../src/embedding/model-manager.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const modelsDir = join(__dirname, "..", "..", "models");
const modelManager = new ModelManager(modelsDir);
const modelAvailable = modelManager.isModelAvailable();

describe("OnnxEmbeddingProvider", () => {
  describe.skipIf(!modelAvailable)("with model available", () => {
    let provider: import("../../src/embedding/onnx-embedding-provider.js").OnnxEmbeddingProvider;

    beforeAll(async () => {
      const { OnnxEmbeddingProvider } =
        await import("../../src/embedding/onnx-embedding-provider.js");
      provider = new OnnxEmbeddingProvider("all-MiniLM-L6-v2", modelManager);
    });

    it("should return Float32Array of correct dimensions", async () => {
      const embedding = await provider.embed("Hello world");
      expect(embedding).toBeInstanceOf(Float32Array);
      expect(embedding.length).toBe(384);
    });

    it("should return unit-normalized vectors", async () => {
      const embedding = await provider.embed("test sentence");
      let norm = 0;
      for (const v of embedding) {
        norm += v * v;
      }
      expect(Math.sqrt(norm)).toBeCloseTo(1.0, 4);
    });

    it("should produce consistent embeddings for the same input", async () => {
      const e1 = await provider.embed("consistent text");
      const e2 = await provider.embed("consistent text");
      for (let i = 0; i < e1.length; i++) {
        expect(e1[i]).toBeCloseTo(e2[i], 6);
      }
    });

    it("should produce different embeddings for different inputs", async () => {
      const e1 = await provider.embed("TypeScript programming");
      const e2 = await provider.embed("cooking recipes");
      const dotProduct = e1.reduce((sum, v, i) => sum + v * e2[i], 0);
      // Cosine similarity should not be exactly 1.0 for different semantics
      expect(dotProduct).toBeLessThan(0.99);
    });

    it("should handle batch embedding", async () => {
      const embeddings = await provider.embedBatch(["hello", "world", "test"]);
      expect(embeddings).toHaveLength(3);
      for (const emb of embeddings) {
        expect(emb).toBeInstanceOf(Float32Array);
        expect(emb.length).toBe(384);
      }
    });
  });

  describe("without model available", () => {
    it("should throw EmbeddingNotAvailableError when model is missing", async () => {
      const emptyDir = join(__dirname, "nonexistent-models");
      const emptyManager = new ModelManager(emptyDir);
      expect(existsSync(emptyDir)).toBe(false);

      const { OnnxEmbeddingProvider } =
        await import("../../src/embedding/onnx-embedding-provider.js");
      const { EmbeddingNotAvailableError } = await import("../../src/errors.js");
      const provider = new OnnxEmbeddingProvider("all-MiniLM-L6-v2", emptyManager);

      await expect(provider.embed("test")).rejects.toBeInstanceOf(EmbeddingNotAvailableError);
    });
  });
});
