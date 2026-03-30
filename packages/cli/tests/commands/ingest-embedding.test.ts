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
  mockLoadSqliteVecExtension,
  mockIngestEngineIngest,
} = vi.hoisted(() => ({
  mockEmbedBatch: vi.fn(),
  mockClose: vi.fn(),
  mockIsModelAvailable: vi.fn(),
  mockGetNotesWithoutEmbeddingIds: vi.fn(),
  mockGetNotesByIds: vi.fn(),
  mockSaveEmbeddingBatch: vi.fn(),
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
      getNoteById: vi.fn().mockReturnValue(null),
      saveNote: vi.fn().mockReturnValue(1),
      findBySource: vi.fn().mockReturnValue([]),
      getIngestCursor: vi.fn().mockReturnValue(null),
      setIngestCursor: vi.fn(),
      deleteStaleNotes: vi.fn().mockReturnValue(0),
      count: vi.fn().mockReturnValue(0),
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
    vi.mocked(loadRcFile).mockReturnValue(null);
    mockIsModelAvailable.mockReturnValue(true);
    mockLoadSqliteVecExtension.mockResolvedValue(true);
    mockEmbedBatch.mockResolvedValue([new Float32Array(384)]);
    mockClose.mockResolvedValue(undefined);
    mockGetNotesWithoutEmbeddingIds.mockReturnValue([]);
    mockGetNotesByIds.mockReturnValue([]);
    mockSaveEmbeddingBatch.mockReturnValue({ saved: 0, failed: 0 });
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
