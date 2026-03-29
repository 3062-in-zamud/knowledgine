import { describe, it, expect, beforeAll } from "vitest";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { ModelManager } from "../../src/embedding/model-manager.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const modelsDir = join(__dirname, "..", "..", "models");
const modelManager = new ModelManager(modelsDir);

// Check availability for each model
const miniLMAvailable = modelManager.isModelAvailable("all-MiniLM-L6-v2");
const e5Available = modelManager.isModelAvailable("multilingual-e5-small");

describe("OnnxEmbeddingProvider", () => {
  describe.skipIf(!miniLMAvailable)("all-MiniLM-L6-v2 (bert family)", () => {
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

    it("embedQuery should produce same result as embed for bert family", async () => {
      const text = "what is typescript";
      const embedResult = await provider.embed(text);
      const queryResult = await provider.embedQuery(text);
      // For BERT, embedQuery delegates to embed (same result)
      for (let i = 0; i < embedResult.length; i++) {
        expect(embedResult[i]).toBeCloseTo(queryResult[i], 6);
      }
    });
  });

  describe.skipIf(!e5Available)("multilingual-e5-small (e5 family)", () => {
    let provider: import("../../src/embedding/onnx-embedding-provider.js").OnnxEmbeddingProvider;

    beforeAll(async () => {
      const { OnnxEmbeddingProvider } =
        await import("../../src/embedding/onnx-embedding-provider.js");
      provider = new OnnxEmbeddingProvider("multilingual-e5-small", modelManager);
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

    it("embedQuery should return Float32Array of correct dimensions", async () => {
      const embedding = await provider.embedQuery("semantic search query");
      expect(embedding).toBeInstanceOf(Float32Array);
      expect(embedding.length).toBe(384);
    });

    it("embedQuery should produce different embedding than embed for e5 family", async () => {
      // E5 prepends "query: " for embedQuery and "passage: " for embed
      const text = "machine learning";
      const docEmb = await provider.embed(text);
      const queryEmb = await provider.embedQuery(text);
      // The embeddings should be different because different prefixes are applied
      const dotProduct = docEmb.reduce((sum, v, i) => sum + v * queryEmb[i], 0);
      // They won't be identical (different prefix changes embedding)
      expect(dotProduct).toBeLessThan(1.0);
    });

    it("should handle CJK text (Japanese)", async () => {
      const embedding = await provider.embed("TypeScriptはプログラミング言語です");
      expect(embedding).toBeInstanceOf(Float32Array);
      expect(embedding.length).toBe(384);
      let norm = 0;
      for (const v of embedding) norm += v * v;
      expect(Math.sqrt(norm)).toBeCloseTo(1.0, 4);
    });

    it("getDimensions should return 384", () => {
      expect(provider.getDimensions()).toBe(384);
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
      const provider = new OnnxEmbeddingProvider("multilingual-e5-small", emptyManager);

      await expect(provider.embed("test")).rejects.toBeInstanceOf(EmbeddingNotAvailableError);
    });

    it("should throw EmbeddingNotAvailableError on embedQuery when model is missing", async () => {
      const emptyDir = join(__dirname, "nonexistent-models-2");
      const emptyManager = new ModelManager(emptyDir);

      const { OnnxEmbeddingProvider } =
        await import("../../src/embedding/onnx-embedding-provider.js");
      const { EmbeddingNotAvailableError } = await import("../../src/errors.js");
      const provider = new OnnxEmbeddingProvider("multilingual-e5-small", emptyManager);

      await expect(provider.embedQuery("test query")).rejects.toBeInstanceOf(
        EmbeddingNotAvailableError,
      );
    });
  });

  describe("getDimensions", () => {
    it("should return 384 for all-MiniLM-L6-v2", async () => {
      const { OnnxEmbeddingProvider } =
        await import("../../src/embedding/onnx-embedding-provider.js");
      const provider = new OnnxEmbeddingProvider("all-MiniLM-L6-v2", modelManager);
      expect(provider.getDimensions()).toBe(384);
    });

    it("should return 384 for multilingual-e5-small", async () => {
      const { OnnxEmbeddingProvider } =
        await import("../../src/embedding/onnx-embedding-provider.js");
      const provider = new OnnxEmbeddingProvider("multilingual-e5-small", modelManager);
      expect(provider.getDimensions()).toBe(384);
    });
  });
});
