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
  it("should return ready=true when config enabled, model available, and embeddings exist", () => {
    const result = checkSemanticReadiness(
      createMockConfig(true),
      createMockModelManager(true),
      createMockRepository(10, 2), // 10 notes, 2 without embeddings = 8 embeddings
    );

    expect(result.ready).toBe(true);
    expect(result.configEnabled).toBe(true);
    expect(result.modelAvailable).toBe(true);
    expect(result.embeddingsCount).toBe(8);
    expect(result.totalNotes).toBe(10);
    expect(result.label).toBe("Ready (semantic + FTS5)");
  });

  it("should return ready=false when config disabled", () => {
    const result = checkSemanticReadiness(
      createMockConfig(false),
      createMockModelManager(true),
      createMockRepository(10, 0),
    );

    expect(result.ready).toBe(false);
    expect(result.configEnabled).toBe(false);
    expect(result.label).toBe("Ready (FTS5 only)");
  });

  it("should return ready=false when model not available", () => {
    const result = checkSemanticReadiness(
      createMockConfig(true),
      createMockModelManager(false),
      createMockRepository(10, 0),
    );

    expect(result.ready).toBe(false);
    expect(result.modelAvailable).toBe(false);
    expect(result.label).toBe("Ready (FTS5 only)");
  });

  it("should return ready=false when embeddings count is 0", () => {
    const result = checkSemanticReadiness(
      createMockConfig(true),
      createMockModelManager(true),
      createMockRepository(10, 10), // all notes without embeddings
    );

    expect(result.ready).toBe(false);
    expect(result.embeddingsCount).toBe(0);
    expect(result.label).toBe("Ready (FTS5 only)");
  });

  it("should return 'Not initialized' label when no notes exist", () => {
    const result = checkSemanticReadiness(
      createMockConfig(true),
      createMockModelManager(true),
      createMockRepository(0, 0),
    );

    expect(result.ready).toBe(false);
    expect(result.totalNotes).toBe(0);
    expect(result.label).toBe("Not initialized");
  });

  it("should not mutate the config object", () => {
    const config = createMockConfig(false);
    checkSemanticReadiness(config, createMockModelManager(true), createMockRepository(10, 10));

    expect(config.embedding.enabled).toBe(false);
  });
});
