import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock fs.existsSync to simulate initialized directory
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
  };
});

// Mock @knowledgine/core
vi.mock("@knowledgine/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@knowledgine/core")>();
  return {
    ...actual,
    loadConfig: vi.fn().mockReturnValue({
      dbPath: ":memory:",
      embedding: { enabled: false },
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
    KnowledgeRepository: vi.fn().mockImplementation(() => ({})),
    GraphRepository: vi.fn().mockImplementation(() => ({})),
    KnowledgeService: vi.fn().mockImplementation(() => ({
      search: vi.fn().mockResolvedValue({
        query: "TypeScript",
        mode: "semantic",
        actualMode: "keyword",
        modeUsed: "keyword",
        totalResults: 1,
        fallbackInfo: {
          reason: "Embedding provider not available — semantic search requires embeddings",
          modeUsed: "keyword",
          originalMode: "semantic",
        },
        results: [
          {
            noteId: 1,
            filePath: "notes/typescript.md",
            title: "TypeScript Guide",
            score: 0.9,
            matchReason: ['キーワード一致: "TypeScript"'],
            createdAt: "2024-01-01T00:00:00Z",
            fellBack: true,
            fallbackInfo: {
              reason: "Embedding provider not available — semantic search requires embeddings",
              modeUsed: "keyword",
              originalMode: "semantic",
            },
          },
        ],
      }),
    })),
    OnnxEmbeddingProvider: vi.fn(),
    ModelManager: vi.fn().mockImplementation(() => ({})),
    checkSemanticReadiness: vi.fn().mockReturnValue({ ready: false }),
    CrossProjectSearcher: vi.fn(),
    ALL_MIGRATIONS: [],
    DEFAULT_MODEL_NAME: "test-model",
  };
});

import { searchCommand } from "../../src/commands/search.js";

describe("searchCommand fallback notification", () => {
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
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    process.exitCode = originalExitCode;
    vi.clearAllMocks();
  });

  it("should display fallback warning when semantic search is unavailable", async () => {
    await searchCommand("TypeScript", { mode: "semantic" });

    const output = stderrOutput.join("\n");
    expect(output).toContain("semantic search unavailable");
    expect(output).toContain("falling back to keyword search");
  });

  it("should display fallback reason in warning message", async () => {
    await searchCommand("TypeScript", { mode: "semantic" });

    const output = stderrOutput.join("\n");
    expect(output).toContain("Reason:");
    expect(output).toContain("Embedding provider not available");
  });

  it("should display fix command when falling back to keyword", async () => {
    await searchCommand("TypeScript", { mode: "semantic" });

    const output = stderrOutput.join("\n");
    expect(output).toContain("Fix:");
    expect(output).toContain("knowledgine ingest --all --path /fake/path");
  });

  it("should exit with error code when --no-fallback is specified and semantic is unavailable", async () => {
    await searchCommand("TypeScript", { mode: "semantic", fallback: false });

    expect(process.exitCode).toBe(1);
    const output = stderrOutput.join("\n");
    expect(output).toContain("not available");
  });
});
