import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
  };
});

const { mockSearch, mockOnnxEmbeddingProvider } = vi.hoisted(() => ({
  mockSearch: vi.fn(),
  mockOnnxEmbeddingProvider: vi.fn(),
}));

vi.mock("@knowledgine/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@knowledgine/core")>();
  return {
    ...actual,
    loadConfig: vi.fn().mockReturnValue({
      dbPath: ":memory:",
      embedding: {
        enabled: true,
        modelName: "all-MiniLM-L6-v2",
      },
    }),
    loadRcFile: vi.fn().mockReturnValue(null),
    resolveDefaultPath: vi.fn().mockReturnValue("/fake/path"),
    createDatabase: vi.fn().mockReturnValue({
      close: vi.fn(),
    }),
    loadSqliteVecExtension: vi.fn().mockResolvedValue(undefined),
    Migrator: vi.fn().mockImplementation(() => ({
      migrate: vi.fn(),
    })),
    KnowledgeRepository: vi.fn().mockImplementation(() => ({
      getVectorIndexStats: vi.fn().mockReturnValue({
        vecAvailable: true,
        embeddingRows: 10,
        vectorRows: 0,
        missingVectorRows: 10,
      }),
    })),
    GraphRepository: vi.fn().mockImplementation(() => ({})),
    KnowledgeService: vi.fn().mockImplementation(() => ({
      search: mockSearch,
    })),
    OnnxEmbeddingProvider: vi.fn().mockImplementation(() => {
      mockOnnxEmbeddingProvider();
      return {
        embedQuery: vi.fn(),
        embed: vi.fn(),
        close: vi.fn(),
      };
    }),
    ModelManager: vi.fn().mockImplementation(() => ({
      isModelAvailable: vi.fn().mockReturnValue(true),
    })),
    checkSemanticReadiness: vi.fn().mockReturnValue({ ready: false }),
    CrossProjectSearcher: vi.fn(),
    ALL_MIGRATIONS: [],
    DEFAULT_MODEL_NAME: "all-MiniLM-L6-v2",
  };
});

import { searchCommand } from "../../src/commands/search.js";
import { OnnxEmbeddingProvider } from "@knowledgine/core";

describe("searchCommand semantic repair path", () => {
  let stderrOutput: string[];
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let originalExitCode: number | undefined;

  beforeEach(() => {
    stderrOutput = [];
    stderrSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      stderrOutput.push(args.map(String).join(" "));
    });
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
    mockSearch.mockResolvedValue({
      query: "FastAPI",
      mode: "semantic",
      actualMode: "semantic",
      modeUsed: "semantic",
      totalResults: 1,
      results: [
        {
          noteId: 1,
          filePath: "README.md",
          title: "FastAPI",
          score: 0.91,
          matchReason: ['意味的に一致: "FastAPI"'],
          createdAt: "2024-01-01T00:00:00Z",
        },
      ],
    });
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    process.exitCode = originalExitCode;
    vi.clearAllMocks();
  });

  it("should initialize the embedding provider when embeddings exist but vector rows are missing", async () => {
    await searchCommand("FastAPI", { mode: "semantic" });

    expect(OnnxEmbeddingProvider).toHaveBeenCalledWith("all-MiniLM-L6-v2", expect.anything());
    expect(mockOnnxEmbeddingProvider).toHaveBeenCalledTimes(1);
    expect(stderrOutput.join("\n")).not.toContain("falling back to keyword search");
    expect(process.exitCode).toBeUndefined();
  });
});
