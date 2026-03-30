import { describe, it, expect } from "vitest";
import { checkSemanticReadiness } from "../../src/utils/semantic-readiness.js";
import type { KnowledgineConfig } from "../../src/config.js";
import type { ModelManager } from "../../src/embedding/model-manager.js";
import type { KnowledgeRepository } from "../../src/storage/knowledge-repository.js";

function createMockConfig(embeddingEnabled: boolean): KnowledgineConfig {
  return {
    embedding: { enabled: embeddingEnabled, modelName: "all-MiniLM-L6-v2" },
  } as KnowledgineConfig;
}

function createMockModelManager(available: boolean): ModelManager {
  return { isModelAvailable: () => available } as unknown as ModelManager;
}

function createMockRepository(
  totalNotes: number,
  notesWithoutEmbeddings: number,
): KnowledgeRepository {
  return {
    getStats: () => ({ totalNotes, totalPatterns: 0 }),
    getNotesWithoutEmbeddingIds: () => new Array(notesWithoutEmbeddings).fill(0),
  } as unknown as KnowledgeRepository;
}

describe("checkSemanticReadiness", () => {
  describe("label conditions", () => {
    it("should return 'Not initialized' when no notes exist", () => {
      const result = checkSemanticReadiness(
        createMockConfig(true),
        createMockModelManager(true),
        createMockRepository(0, 0),
      );

      expect(result.label).toBe("Not initialized");
      expect(result.ready).toBe(false);
      expect(result.totalNotes).toBe(0);
    });

    it("should return FTS5-only label with upgrade hint when model not available", () => {
      const result = checkSemanticReadiness(
        createMockConfig(true),
        createMockModelManager(false),
        createMockRepository(10, 0),
      );

      expect(result.label).toBe("FTS5 only — run 'upgrade --semantic' to enable");
      expect(result.ready).toBe(false);
      expect(result.modelAvailable).toBe(false);
    });

    it("should return FTS5-only label with ingest hint when model available but embeddings=0", () => {
      const result = checkSemanticReadiness(
        createMockConfig(true),
        createMockModelManager(true),
        createMockRepository(10, 10), // all 10 notes without embeddings
      );

      expect(result.label).toBe("FTS5 only — run 'ingest --all' to generate embeddings");
      expect(result.ready).toBe(false);
      expect(result.embeddingsCount).toBe(0);
    });

    it("should return partial coverage label when some embeddings exist", () => {
      const result = checkSemanticReadiness(
        createMockConfig(true),
        createMockModelManager(true),
        createMockRepository(10, 5), // 5 out of 10 = 50%
      );

      expect(result.label).toBe("Ready (semantic: 50% coverage + FTS5)");
      expect(result.ready).toBe(true);
      expect(result.embeddingsCount).toBe(5);
    });

    it("should return full coverage label when all notes have embeddings", () => {
      const result = checkSemanticReadiness(
        createMockConfig(true),
        createMockModelManager(true),
        createMockRepository(10, 0), // all 10 notes have embeddings
      );

      expect(result.label).toBe("Ready (semantic + FTS5)");
      expect(result.ready).toBe(true);
      expect(result.embeddingsCount).toBe(10);
    });
  });

  describe("embeddingCoverage calculation", () => {
    it("should return 0 coverage when no notes exist", () => {
      const result = checkSemanticReadiness(
        createMockConfig(true),
        createMockModelManager(true),
        createMockRepository(0, 0),
      );

      expect(result.embeddingCoverage).toBe(0);
    });

    it("should return 0 coverage when embeddings=0", () => {
      const result = checkSemanticReadiness(
        createMockConfig(true),
        createMockModelManager(true),
        createMockRepository(10, 10),
      );

      expect(result.embeddingCoverage).toBe(0);
    });

    it("should round to nearest integer", () => {
      const result = checkSemanticReadiness(
        createMockConfig(true),
        createMockModelManager(true),
        createMockRepository(3, 1), // 2/3 = 66.67% -> 67%
      );

      expect(result.embeddingCoverage).toBe(67);
    });

    it("should return 100 when all notes have embeddings", () => {
      const result = checkSemanticReadiness(
        createMockConfig(true),
        createMockModelManager(true),
        createMockRepository(5, 0),
      );

      expect(result.embeddingCoverage).toBe(100);
    });

    it("should return 80 for 8 out of 10 notes", () => {
      const result = checkSemanticReadiness(
        createMockConfig(true),
        createMockModelManager(true),
        createMockRepository(10, 2), // 8/10 = 80%
      );

      expect(result.embeddingCoverage).toBe(80);
    });
  });

  describe("ready flag logic", () => {
    it("should be ready when config enabled, model available, and embeddings > 0", () => {
      const result = checkSemanticReadiness(
        createMockConfig(true),
        createMockModelManager(true),
        createMockRepository(10, 2), // 8 embeddings
      );

      expect(result.ready).toBe(true);
    });

    it("should not be ready when embeddings=0 even if model is available", () => {
      const result = checkSemanticReadiness(
        createMockConfig(true),
        createMockModelManager(true),
        createMockRepository(10, 10),
      );

      expect(result.ready).toBe(false);
    });

    it("should not be ready when config is disabled", () => {
      const result = checkSemanticReadiness(
        createMockConfig(false),
        createMockModelManager(true),
        createMockRepository(10, 0),
      );

      expect(result.ready).toBe(false);
      expect(result.configEnabled).toBe(false);
    });

    it("should not be ready when model is not available", () => {
      const result = checkSemanticReadiness(
        createMockConfig(true),
        createMockModelManager(false),
        createMockRepository(10, 0),
      );

      expect(result.ready).toBe(false);
    });
  });

  it("should not mutate the config object", () => {
    const config = createMockConfig(false);
    checkSemanticReadiness(config, createMockModelManager(true), createMockRepository(10, 10));

    expect(config.embedding.enabled).toBe(false);
  });
});
