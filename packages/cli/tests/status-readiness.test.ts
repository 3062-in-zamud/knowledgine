import { describe, it, expect, vi } from "vitest";
import { checkSemanticReadiness } from "@knowledgine/core";
import type { KnowledgineConfig } from "@knowledgine/core";
import type { ModelManager } from "@knowledgine/core";
import type { KnowledgeRepository } from "@knowledgine/core";

function makeConfig(enabled: boolean): KnowledgineConfig {
  return {
    rootPath: "/tmp/test",
    dbPath: "/tmp/test/.knowledgine/index.sqlite",
    embedding: {
      enabled,
      modelName: "all-MiniLM-L6-v2",
      dimensions: 384,
    },
    search: {
      defaultMode: "keyword",
      defaultLimit: 20,
    },
  };
}

function makeModelManager(available: boolean): ModelManager {
  return {
    isModelAvailable: vi.fn().mockReturnValue(available),
    getModelDir: vi.fn(),
    getModelPath: vi.fn(),
    getTokenizerPath: vi.fn(),
  } as unknown as ModelManager;
}

function makeRepository(
  totalNotes: number,
  vectorRows: number,
  embeddingRows: number = vectorRows,
): KnowledgeRepository {
  return {
    getStats: vi.fn().mockReturnValue({ totalNotes, totalPatterns: 0 }),
    getVectorIndexStats: vi.fn().mockReturnValue({
      vecAvailable: true,
      embeddingRows,
      vectorRows,
      missingVectorRows: Math.max(0, embeddingRows - vectorRows),
    }),
  } as unknown as KnowledgeRepository;
}

describe("checkSemanticReadiness", () => {
  it("embeddings=0, config.enabled=false -> label 'FTS5 only', ready=false", () => {
    const config = makeConfig(false);
    const modelManager = makeModelManager(false);
    const repository = makeRepository(5, 0);

    const result = checkSemanticReadiness(config, modelManager, repository);

    expect(result.ready).toBe(false);
    expect(result.label).toBe("FTS5 only — embedding disabled in config");
    expect(result.configEnabled).toBe(false);
    expect(result.embeddingsCount).toBe(0);
  });

  it("vectors=0, config.enabled=true, model available -> label 'FTS5 only', ready=false", () => {
    const config = makeConfig(true);
    const modelManager = makeModelManager(true);
    const repository = makeRepository(5, 0); // model available but no searchable vectors yet

    const result = checkSemanticReadiness(config, modelManager, repository);

    expect(result.ready).toBe(false);
    expect(result.label).toBe("FTS5 only — run 'ingest --embed-missing' to repair semantic search");
    expect(result.modelAvailable).toBe(true);
    expect(result.configEnabled).toBe(true);
    expect(result.embeddingsCount).toBe(0);
  });

  it("vectors>0, config.enabled=true, model available -> label 'Ready (semantic + FTS5)', ready=true", () => {
    const config = makeConfig(true);
    const modelManager = makeModelManager(true);
    const repository = makeRepository(5, 5);

    const result = checkSemanticReadiness(config, modelManager, repository);

    expect(result.ready).toBe(true);
    expect(result.label).toBe("Ready (semantic + FTS5)");
    expect(result.embeddingsCount).toBe(5);
  });

  it("totalNotes=0 -> label 'Not initialized'", () => {
    const config = makeConfig(true);
    const modelManager = makeModelManager(true);
    const repository = makeRepository(0, 0);

    const result = checkSemanticReadiness(config, modelManager, repository);

    expect(result.ready).toBe(false);
    expect(result.label).toBe("Not initialized");
    expect(result.totalNotes).toBe(0);
  });

  it("partial embeddings (some notes indexed, not all) -> ready=false when embeddingsCount=0", () => {
    const config = makeConfig(true);
    const modelManager = makeModelManager(true);
    const repository = makeRepository(3, 0);

    const result = checkSemanticReadiness(config, modelManager, repository);

    expect(result.ready).toBe(false);
    expect(result.embeddingsCount).toBe(0);
  });

  it("partial embeddings (some notes have embeddings) -> ready=true", () => {
    const config = makeConfig(true);
    const modelManager = makeModelManager(true);
    const repository = makeRepository(5, 3);

    const result = checkSemanticReadiness(config, modelManager, repository);

    expect(result.ready).toBe(true);
    expect(result.embeddingsCount).toBe(3);
    expect(result.label).toBe("Ready (semantic: 60% coverage + FTS5)");
  });

  it("returns correct counts", () => {
    const config = makeConfig(true);
    const modelManager = makeModelManager(true);
    const repository = makeRepository(10, 6);

    const result = checkSemanticReadiness(config, modelManager, repository);

    expect(result.totalNotes).toBe(10);
    expect(result.embeddingsCount).toBe(6);
  });
});
