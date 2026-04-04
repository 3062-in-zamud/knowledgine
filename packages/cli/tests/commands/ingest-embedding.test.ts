import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execFileSync } from "child_process";

// Use vi.hoisted() to avoid TDZ issues with vi.mock hoisting
const {
  mockEmbedBatch,
  mockClose,
  mockIsModelAvailable,
  mockGetNotesWithoutEmbeddingIds,
  mockGetNotesByIds,
  mockSaveEmbeddingBatch,
  mockGetVectorIndexStats,
  mockSyncMissingVectorsFromEmbeddings,
  mockLoadSqliteVecExtension,
  mockIngestEngineIngest,
} = vi.hoisted(() => ({
  mockEmbedBatch: vi.fn(),
  mockClose: vi.fn(),
  mockIsModelAvailable: vi.fn(),
  mockGetNotesWithoutEmbeddingIds: vi.fn(),
  mockGetNotesByIds: vi.fn(),
  mockSaveEmbeddingBatch: vi.fn(),
  mockGetVectorIndexStats: vi.fn(),
  mockSyncMissingVectorsFromEmbeddings: vi.fn(),
  mockLoadSqliteVecExtension: vi.fn(),
  mockIngestEngineIngest: vi.fn(),
}));

vi.mock("@knowledgine/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@knowledgine/core")>();
  return {
    ...actual,
    OnnxEmbeddingProvider: vi.fn().mockImplementation(() => ({
      embedBatch: mockEmbedBatch,
      close: mockClose,
    })),
    ModelManager: vi.fn().mockImplementation(() => ({
      isModelAvailable: mockIsModelAvailable,
      getModelDir: vi.fn().mockReturnValue("/mock/models/dir"),
      getModelPath: vi.fn().mockReturnValue("/mock/models/model.onnx"),
      getTokenizerPath: vi.fn().mockReturnValue("/mock/models/tokenizer.json"),
      getModelConfig: vi.fn().mockReturnValue({ dimensions: 384 }),
    })),
    loadSqliteVecExtension: mockLoadSqliteVecExtension,
    loadRcFile: vi.fn().mockReturnValue(null),
    KnowledgeRepository: vi.fn().mockImplementation(() => ({
      getNotesWithoutEmbeddingIds: mockGetNotesWithoutEmbeddingIds,
      getNotesByIds: mockGetNotesByIds,
      saveEmbeddingBatch: mockSaveEmbeddingBatch,
      getVectorIndexStats: mockGetVectorIndexStats,
      syncMissingVectorsFromEmbeddings: mockSyncMissingVectorsFromEmbeddings,
      getNoteById: vi.fn().mockReturnValue(null),
      saveNote: vi.fn().mockReturnValue(1),
      findBySource: vi.fn().mockReturnValue([]),
      getIngestCursor: vi.fn().mockReturnValue(null),
      setIngestCursor: vi.fn(),
      deleteStaleNotes: vi.fn().mockReturnValue(0),
      count: vi.fn().mockReturnValue(0),
      getStats: vi.fn().mockReturnValue({
        totalNotes: 0,
        totalPatterns: 0,
        totalLinks: 0,
        totalPairs: 0,
        patternsByType: {},
        notesBySource: {},
      }),
      getTopEntities: vi.fn().mockReturnValue([]),
    })),
    GraphRepository: vi.fn().mockImplementation(() => ({
      saveRelationship: vi.fn(),
      getRelationships: vi.fn().mockReturnValue([]),
    })),
  };
});

vi.mock("@knowledgine/ingest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@knowledgine/ingest")>();
  return {
    ...actual,
    IngestEngine: vi.fn().mockImplementation(() => ({
      ingest: mockIngestEngineIngest,
    })),
  };
});

import { ingestCommand } from "../../src/commands/ingest.js";
import { loadRcFile, OnnxEmbeddingProvider } from "@knowledgine/core";

describe("embedding generation after ingest", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "knowledgine-embedding-test-"));
    execFileSync("git", ["init"], { cwd: testDir });
    mkdirSync(join(testDir, ".knowledgine"), { recursive: true });
    writeFileSync(join(testDir, "test.md"), "# Test\n\nContent for embedding testing");

    // Default: ingest returns 1 note ID so embedding code is reached
    mockIngestEngineIngest.mockResolvedValue({
      processed: 1,
      errors: 0,
      deleted: 0,
      skipped: 0,
      elapsedMs: 100,
      noteIds: [1],
    });

    // Reset mocks to safe defaults
    vi.clearAllMocks();
    mockEmbedBatch.mockReset();
    mockClose.mockReset();
    mockIsModelAvailable.mockReset();
    mockGetNotesWithoutEmbeddingIds.mockReset();
    mockGetNotesByIds.mockReset();
    mockSaveEmbeddingBatch.mockReset();
    mockGetVectorIndexStats.mockReset();
    mockSyncMissingVectorsFromEmbeddings.mockReset();
    mockLoadSqliteVecExtension.mockReset();
    mockIngestEngineIngest.mockReset();
    vi.mocked(loadRcFile).mockReturnValue(null);
    mockIsModelAvailable.mockReturnValue(true);
    mockLoadSqliteVecExtension.mockResolvedValue(true);
    mockEmbedBatch.mockResolvedValue([new Float32Array(384)]);
    mockClose.mockResolvedValue(undefined);
    mockGetNotesWithoutEmbeddingIds.mockReturnValue([]);
    mockGetNotesByIds.mockReturnValue([]);
    mockSaveEmbeddingBatch.mockReturnValue({ saved: 0, failed: 0 });
    mockGetVectorIndexStats.mockReturnValue({
      vecAvailable: true,
      embeddingRows: 0,
      vectorRows: 0,
      missingVectorRows: 0,
    });
    mockSyncMissingVectorsFromEmbeddings.mockReturnValue(0);
    // Restore ingest mock after clearAllMocks
    mockIngestEngineIngest.mockResolvedValue({
      processed: 1,
      errors: 0,
      deleted: 0,
      skipped: 0,
      elapsedMs: 100,
      noteIds: [1],
    });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("should skip embedding generation when embedding is not enabled in config", async () => {
    vi.mocked(loadRcFile).mockReturnValue(null);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await ingestCommand({ source: "markdown", path: testDir });

    expect(process.exitCode).toBeUndefined();
    expect(OnnxEmbeddingProvider).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("should skip embedding generation when no notes need embeddings", async () => {
    vi.mocked(loadRcFile).mockReturnValue({ semantic: true });
    mockGetNotesWithoutEmbeddingIds.mockReturnValue([]);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await ingestCommand({ source: "markdown", path: testDir });

    expect(process.exitCode).toBeUndefined();
    expect(OnnxEmbeddingProvider).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("should show 'model not available' hint when model is not downloaded", async () => {
    vi.mocked(loadRcFile).mockReturnValue({ semantic: true });
    mockIsModelAvailable.mockReturnValue(false);
    mockGetNotesWithoutEmbeddingIds.mockReturnValue([1]);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await ingestCommand({ source: "markdown", path: testDir });

    expect(process.exitCode).toBeUndefined();
    const errorMessages = errorSpy.mock.calls.map((c) => c.join(" "));
    const hasModelNotAvailable = errorMessages.some((msg) =>
      msg.includes("Embedding model not available"),
    );
    expect(hasModelNotAvailable).toBe(true);
    expect(OnnxEmbeddingProvider).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("should generate embeddings when model is available and notes need embedding", async () => {
    vi.mocked(loadRcFile).mockReturnValue({ semantic: true });
    mockIsModelAvailable.mockReturnValue(true);
    mockGetNotesWithoutEmbeddingIds.mockReturnValue([1]);
    mockGetNotesByIds.mockReturnValue([
      {
        id: 1,
        content: "Test content",
        title: "Test",
        source: "markdown",
        createdAt: 0,
        updatedAt: 0,
      },
    ]);
    mockEmbedBatch.mockResolvedValue([new Float32Array(384).fill(0.1)]);
    mockSaveEmbeddingBatch.mockReturnValue({ saved: 1, failed: 0 });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await ingestCommand({ source: "markdown", path: testDir });

    expect(process.exitCode).toBeUndefined();
    expect(OnnxEmbeddingProvider).toHaveBeenCalled();
    expect(mockEmbedBatch).toHaveBeenCalled();
    expect(mockSaveEmbeddingBatch).toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalled();

    errorSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it("should not break ingest when embedding generation throws an error", async () => {
    vi.mocked(loadRcFile).mockReturnValue({ semantic: true });
    mockIsModelAvailable.mockReturnValue(true);
    mockGetNotesWithoutEmbeddingIds.mockReturnValue([1]);
    mockGetNotesByIds.mockReturnValue([
      {
        id: 1,
        content: "Test content",
        title: "Test",
        source: "markdown",
        createdAt: 0,
        updatedAt: 0,
      },
    ]);
    mockEmbedBatch.mockRejectedValue(new Error("ONNX runtime error"));

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await ingestCommand({ source: "markdown", path: testDir });

    // Ingest itself should succeed even when embedding fails
    expect(process.exitCode).toBeUndefined();
    const errorMessages = errorSpy.mock.calls.map((c) => c.join(" "));
    const hasSkippedMessage = errorMessages.some((msg) =>
      msg.includes("Embedding generation skipped"),
    );
    expect(hasSkippedMessage).toBe(true);
    errorSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it("should warn and skip when --no-embeddings flag is set with notes to process", async () => {
    vi.mocked(loadRcFile).mockReturnValue({ semantic: true });
    mockIsModelAvailable.mockReturnValue(true);
    mockGetNotesWithoutEmbeddingIds.mockReturnValue([1]);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await ingestCommand({ source: "markdown", path: testDir, noEmbeddings: true });

    expect(process.exitCode).toBeUndefined();
    expect(OnnxEmbeddingProvider).not.toHaveBeenCalled();
    // Should show warning about skipping
    const errorMessages = errorSpy.mock.calls.map((c) => c.join(" "));
    const hasWarning = errorMessages.some((msg) => msg.includes("--no-embeddings"));
    expect(hasWarning).toBe(true);
    errorSpy.mockRestore();
  });

  it("should use embedding.modelName from rc config when specified", async () => {
    vi.mocked(loadRcFile).mockReturnValue({
      semantic: true,
      embedding: { enabled: true, modelName: "all-MiniLM-L6-v2" },
    });
    mockIsModelAvailable.mockReturnValue(true);
    mockGetNotesWithoutEmbeddingIds.mockReturnValue([1]);
    mockGetNotesByIds.mockReturnValue([
      {
        id: 1,
        content: "Test content",
        title: "Test",
        source: "markdown",
        createdAt: 0,
        updatedAt: 0,
      },
    ]);
    mockEmbedBatch.mockResolvedValue([new Float32Array(384).fill(0.1)]);
    mockSaveEmbeddingBatch.mockReturnValue({ saved: 1, failed: 0 });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await ingestCommand({ source: "markdown", path: testDir });

    expect(OnnxEmbeddingProvider).toHaveBeenCalledWith("all-MiniLM-L6-v2", expect.anything());

    errorSpy.mockRestore();
    stderrSpy.mockRestore();
  });
});

describe("--embed-missing flow", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "knowledgine-embed-missing-test-"));
    execFileSync("git", ["init"], { cwd: testDir });
    mkdirSync(join(testDir, ".knowledgine"), { recursive: true });
    writeFileSync(join(testDir, "test.md"), "# Test\n\nContent for embed-missing testing");

    vi.clearAllMocks();
    mockEmbedBatch.mockReset();
    mockClose.mockReset();
    mockIsModelAvailable.mockReset();
    mockGetNotesWithoutEmbeddingIds.mockReset();
    mockGetNotesByIds.mockReset();
    mockSaveEmbeddingBatch.mockReset();
    mockGetVectorIndexStats.mockReset();
    mockSyncMissingVectorsFromEmbeddings.mockReset();
    mockLoadSqliteVecExtension.mockReset();
    mockIngestEngineIngest.mockReset();
    vi.mocked(loadRcFile).mockReturnValue({ semantic: true });
    mockIsModelAvailable.mockReturnValue(true);
    mockLoadSqliteVecExtension.mockResolvedValue(true);
    mockEmbedBatch.mockResolvedValue([new Float32Array(384)]);
    mockClose.mockResolvedValue(undefined);
    mockGetNotesWithoutEmbeddingIds.mockReturnValue([]);
    mockGetNotesByIds.mockReturnValue([]);
    mockSaveEmbeddingBatch.mockReturnValue({ saved: 0, failed: 0 });
    mockGetVectorIndexStats.mockReturnValue({
      vecAvailable: true,
      embeddingRows: 0,
      vectorRows: 0,
      missingVectorRows: 0,
    });
    mockSyncMissingVectorsFromEmbeddings.mockReturnValue(0);
    // IngestEngine.ingest should NOT be called for --embed-missing
    mockIngestEngineIngest.mockResolvedValue({
      processed: 0,
      errors: 0,
      deleted: 0,
      skipped: 0,
      elapsedMs: 0,
      noteIds: [],
    });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    process.exitCode = undefined;
  });

  it("should not run ingest engine when --embed-missing is specified", async () => {
    mockGetNotesWithoutEmbeddingIds.mockReturnValue([]);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await ingestCommand({ embedMissing: true, path: testDir });

    expect(mockIngestEngineIngest).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("should report 'All notes have embeddings' when no notes are missing embeddings", async () => {
    mockGetNotesWithoutEmbeddingIds.mockReturnValue([]);
    mockGetVectorIndexStats.mockReturnValue({
      vecAvailable: true,
      embeddingRows: 3,
      vectorRows: 3,
      missingVectorRows: 0,
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await ingestCommand({ embedMissing: true, path: testDir });

    expect(process.exitCode).toBeUndefined();
    const messages = errorSpy.mock.calls.map((c) => c.join(" "));
    expect(messages.some((m) => m.includes("All notes have embeddings"))).toBe(true);
    errorSpy.mockRestore();
  });

  it("should repair vector index when embeddings exist but vector rows are missing", async () => {
    mockGetNotesWithoutEmbeddingIds.mockReturnValue([]);
    mockGetVectorIndexStats
      .mockReturnValueOnce({
        vecAvailable: true,
        embeddingRows: 4,
        vectorRows: 1,
        missingVectorRows: 3,
      })
      .mockReturnValueOnce({
        vecAvailable: true,
        embeddingRows: 4,
        vectorRows: 4,
        missingVectorRows: 0,
      });
    mockSyncMissingVectorsFromEmbeddings.mockReturnValue(3);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await ingestCommand({ embedMissing: true, path: testDir });

    expect(process.exitCode).toBeUndefined();
    expect(mockSyncMissingVectorsFromEmbeddings).toHaveBeenCalled();
    const messages = errorSpy.mock.calls.map((c) => c.join(" "));
    expect(messages.some((m) => m.includes("Vector index repaired"))).toBe(true);
    errorSpy.mockRestore();
  });

  it("should generate embeddings for missing notes and report summary", async () => {
    mockGetNotesWithoutEmbeddingIds
      .mockReturnValueOnce([1, 2])
      .mockReturnValueOnce([]);
    mockGetVectorIndexStats
      .mockReturnValueOnce({
        vecAvailable: true,
        embeddingRows: 0,
        vectorRows: 0,
        missingVectorRows: 0,
      })
      .mockReturnValueOnce({
        vecAvailable: true,
        embeddingRows: 2,
        vectorRows: 2,
        missingVectorRows: 0,
      });
    mockGetNotesByIds.mockReturnValue([
      { id: 1, content: "Note 1", title: "N1", source: "markdown", createdAt: 0, updatedAt: 0 },
      { id: 2, content: "Note 2", title: "N2", source: "markdown", createdAt: 0, updatedAt: 0 },
    ]);
    mockEmbedBatch.mockResolvedValue([new Float32Array(384), new Float32Array(384)]);
    mockSaveEmbeddingBatch.mockReturnValue({ saved: 2, failed: 0 });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await ingestCommand({ embedMissing: true, path: testDir });

    expect(process.exitCode).toBeUndefined();
    expect(OnnxEmbeddingProvider).toHaveBeenCalled();
    expect(mockEmbedBatch).toHaveBeenCalled();
    expect(mockSaveEmbeddingBatch).toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalled();

    const messages = errorSpy.mock.calls.map((c) => c.join(" "));
    expect(messages.some((m) => m.includes("generated"))).toBe(true);

    errorSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it("should warn when semantic search is not enabled", async () => {
    vi.mocked(loadRcFile).mockReturnValue(null);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await ingestCommand({ embedMissing: true, path: testDir });

    expect(process.exitCode).toBe(1);
    const messages = errorSpy.mock.calls.map((c) => c.join(" "));
    expect(messages.some((m) => m.includes("Semantic search is not enabled"))).toBe(true);
    errorSpy.mockRestore();
  });

  it("should warn when model is not downloaded", async () => {
    mockIsModelAvailable.mockReturnValue(false);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await ingestCommand({ embedMissing: true, path: testDir });

    expect(process.exitCode).toBe(1);
    const messages = errorSpy.mock.calls.map((c) => c.join(" "));
    expect(messages.some((m) => m.includes("Embedding model not available"))).toBe(true);
    errorSpy.mockRestore();
  });

  it("should retry failed batches up to MAX_EMBED_RETRIES times", async () => {
    mockGetNotesWithoutEmbeddingIds.mockReturnValue([1]);
    mockGetVectorIndexStats
      .mockReturnValueOnce({
        vecAvailable: true,
        embeddingRows: 0,
        vectorRows: 0,
        missingVectorRows: 0,
      })
      .mockReturnValueOnce({
        vecAvailable: true,
        embeddingRows: 1,
        vectorRows: 1,
        missingVectorRows: 0,
      });
    mockGetNotesByIds.mockReturnValue([
      { id: 1, content: "Note 1", title: "N1", source: "markdown", createdAt: 0, updatedAt: 0 },
    ]);

    // Fail twice, succeed on third attempt
    mockEmbedBatch
      .mockRejectedValueOnce(new Error("transient error"))
      .mockRejectedValueOnce(new Error("transient error"))
      .mockResolvedValueOnce([new Float32Array(384)]);
    mockSaveEmbeddingBatch.mockReturnValue({ saved: 1, failed: 0 });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await ingestCommand({ embedMissing: true, path: testDir });

    expect(process.exitCode).toBeUndefined();
    expect(mockEmbedBatch).toHaveBeenCalledTimes(3);

    errorSpy.mockRestore();
    stderrSpy.mockRestore();
  });
});
