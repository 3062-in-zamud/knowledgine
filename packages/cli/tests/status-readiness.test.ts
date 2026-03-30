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

function makeRepository(totalNotes: number, notesWithoutEmbeddings: number): KnowledgeRepository {
  return {
    getStats: vi.fn().mockReturnValue({ totalNotes, totalPatterns: 0 }),
    getNotesWithoutEmbeddingIds: vi.fn().mockReturnValue(new Array(notesWithoutEmbeddings)),
  } as unknown as KnowledgeRepository;
}

describe("checkSemanticReadiness", () => {
  it("embeddings=0, config.enabled=false -> label 'FTS5 only', ready=false", () => {
    const config = makeConfig(false);
    const modelManager = makeModelManager(false);
    const repository = makeRepository(5, 5); // 5 notes, none have embeddings

    const result = checkSemanticReadiness(config, modelManager, repository);

    expect(result.ready).toBe(false);
    expect(result.label).toBe("FTS5 only — embedding disabled in config");
    expect(result.configEnabled).toBe(false);
    expect(result.embeddingsCount).toBe(0);
  });

  it("embeddings=0, config.enabled=true, model available -> label 'FTS5 only', ready=false (no embeddings generated)", () => {
    const config = makeConfig(true);
    const modelManager = makeModelManager(true);
    const repository = makeRepository(5, 5); // model available but no embeddings generated yet

    const result = checkSemanticReadiness(config, modelManager, repository);

    expect(result.ready).toBe(false);
    expect(result.label).toBe("FTS5 only — run 'ingest --all' to generate embeddings");
    expect(result.modelAvailable).toBe(true);
    expect(result.configEnabled).toBe(true);
    expect(result.embeddingsCount).toBe(0);
  });

  it("embeddings>0, config.enabled=true, model available -> label 'Ready (semantic + FTS5)', ready=true", () => {
    const config = makeConfig(true);
    const modelManager = makeModelManager(true);
    const repository = makeRepository(5, 0); // all notes have embeddings

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
    const repository = makeRepository(3, 3); // 3 notes, none with embeddings

    const result = checkSemanticReadiness(config, modelManager, repository);

    expect(result.ready).toBe(false);
    expect(result.embeddingsCount).toBe(0);
  });

  it("partial embeddings (some notes have embeddings) -> ready=true", () => {
    const config = makeConfig(true);
    const modelManager = makeModelManager(true);
    const repository = makeRepository(5, 2); // 5 notes, 3 have embeddings

    const result = checkSemanticReadiness(config, modelManager, repository);

    expect(result.ready).toBe(true);
    expect(result.embeddingsCount).toBe(3);
    expect(result.label).toBe("Ready (semantic: 60% coverage + FTS5)");
  });

  it("returns correct counts", () => {
    const config = makeConfig(true);
    const modelManager = makeModelManager(true);
    const repository = makeRepository(10, 4); // 10 notes, 6 have embeddings

    const result = checkSemanticReadiness(config, modelManager, repository);

    expect(result.totalNotes).toBe(10);
    expect(result.embeddingsCount).toBe(6);
  });
});
