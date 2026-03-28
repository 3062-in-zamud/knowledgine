import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { Command } from "commander";
import { registerServeCommand } from "../src/commands/serve.js";

// Mock @hono/node-server
vi.mock("@hono/node-server", () => ({
  serve: vi.fn().mockReturnValue({ close: vi.fn() }),
}));

// Mock @knowledgine/mcp-server
vi.mock("@knowledgine/mcp-server", () => ({
  createRestApp: vi.fn().mockReturnValue({ fetch: vi.fn() }),
}));

// Mock @knowledgine/core — all objects are created inline to avoid hoisting issues
vi.mock("@knowledgine/core", () => {
  const mockDb = { close: vi.fn(), prepare: vi.fn() };
  const mockEmbeddingProviderInstance = { close: vi.fn() };
  const mockModelManagerInstance = { isModelAvailable: vi.fn().mockReturnValue(true) };
  const mockMigrator = { migrate: vi.fn() };
  const mockRepository = { getStats: vi.fn().mockReturnValue({ totalNotes: 5 }) };
  const mockGraphRepository = {};

  return {
    loadConfig: vi.fn(),
    resolveDefaultPath: vi.fn((p: string) => p),
    createDatabase: vi.fn().mockReturnValue(mockDb),
    loadSqliteVecExtension: vi.fn().mockResolvedValue(undefined),
    Migrator: vi.fn().mockImplementation(() => mockMigrator),
    ALL_MIGRATIONS: [],
    KnowledgeRepository: vi.fn().mockImplementation(() => mockRepository),
    GraphRepository: vi.fn().mockImplementation(() => mockGraphRepository),
    KnowledgeService: vi.fn().mockImplementation((opts: unknown) => ({
      getStats: vi.fn().mockReturnValue({ totalNotes: 5 }),
      _opts: opts,
    })),
    OnnxEmbeddingProvider: vi.fn().mockImplementation(() => mockEmbeddingProviderInstance),
    ModelManager: vi.fn().mockImplementation(() => mockModelManagerInstance),
    DEFAULT_MODEL_NAME: "all-MiniLM-L6-v2",
    VERSION: "0.0.0-test",
  };
});

describe("serve-semantic", () => {
  let testDir: string;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    testDir = join(tmpdir(), `knowledgine-serve-semantic-${randomUUID()}`);
    mkdirSync(resolve(testDir, ".knowledgine"), { recursive: true });
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Reset relevant mocks
    const core = await import("@knowledgine/core");

    // Restore createDatabase to return a db with close()
    vi.mocked(core.createDatabase).mockReturnValue({
      close: vi.fn(),
      prepare: vi.fn(),
    } as unknown as ReturnType<typeof core.createDatabase>);

    // Reset loadSqliteVecExtension
    vi.mocked(core.loadSqliteVecExtension).mockResolvedValue(undefined);

    // Reset KnowledgeService to return an instance with getStats
    vi.mocked(core.KnowledgeService).mockImplementation(
      (opts: unknown) =>
        ({
          getStats: vi.fn().mockReturnValue({ totalNotes: 5 }),
          _opts: opts,
        }) as unknown as InstanceType<typeof core.KnowledgeService>,
    );

    // Reset OnnxEmbeddingProvider
    vi.mocked(core.OnnxEmbeddingProvider).mockImplementation(
      () =>
        ({
          close: vi.fn(),
        }) as unknown as InstanceType<typeof core.OnnxEmbeddingProvider>,
    );

    // Reset ModelManager to default (isModelAvailable returns true)
    vi.mocked(core.ModelManager).mockImplementation(
      () =>
        ({
          isModelAvailable: vi.fn().mockReturnValue(true),
        }) as unknown as InstanceType<typeof core.ModelManager>,
    );
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    consoleErrorSpy.mockRestore();
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  describe("option definitions", () => {
    it("should register --port, --host, --path options", () => {
      const program = new Command();
      program.exitOverride();
      registerServeCommand(program);
      const serveCmd = program.commands.find((c) => c.name() === "serve")!;
      expect(serveCmd.options.find((o) => o.long === "--port")).toBeDefined();
      expect(serveCmd.options.find((o) => o.long === "--host")).toBeDefined();
      expect(serveCmd.options.find((o) => o.long === "--path")).toBeDefined();
    });

    it("should have default port 3456 and host 127.0.0.1", () => {
      const program = new Command();
      program.exitOverride();
      registerServeCommand(program);
      const serveCmd = program.commands.find((c) => c.name() === "serve")!;
      expect(serveCmd.options.find((o) => o.long === "--port")?.defaultValue).toBe("3456");
      expect(serveCmd.options.find((o) => o.long === "--host")?.defaultValue).toBe("127.0.0.1");
    });
  });

  describe("embeddingProvider is passed to KnowledgeService", () => {
    it("should pass embeddingProvider when config.embedding.enabled is true and model is available", async () => {
      const core = await import("@knowledgine/core");
      vi.mocked(core.loadConfig).mockReturnValue({
        dbPath: join(testDir, ".knowledgine", "db.sqlite"),
        embedding: { enabled: true, modelName: "all-MiniLM-L6-v2" },
      } as ReturnType<typeof core.loadConfig>);

      // Ensure ModelManager.isModelAvailable returns true
      vi.mocked(core.ModelManager).mockImplementationOnce(() => ({
        isModelAvailable: vi.fn().mockReturnValue(true),
      }));

      writeFileSync(join(testDir, ".knowledgine", ".gitkeep"), "");

      const program = new Command();
      program.exitOverride();
      registerServeCommand(program);
      await program.parseAsync(["serve", "--path", testDir], { from: "user" });

      expect(core.loadSqliteVecExtension).toHaveBeenCalled();
      expect(core.OnnxEmbeddingProvider).toHaveBeenCalled();
      expect(core.KnowledgeService).toHaveBeenCalledWith(
        expect.objectContaining({
          embeddingProvider: expect.any(Object),
        }),
      );
    });

    it("should NOT pass embeddingProvider when config.embedding.enabled is false", async () => {
      const core = await import("@knowledgine/core");
      vi.mocked(core.loadConfig).mockReturnValue({
        dbPath: join(testDir, ".knowledgine", "db.sqlite"),
        embedding: { enabled: false, modelName: "all-MiniLM-L6-v2" },
      } as ReturnType<typeof core.loadConfig>);

      writeFileSync(join(testDir, ".knowledgine", ".gitkeep"), "");

      const program = new Command();
      program.exitOverride();
      registerServeCommand(program);
      await program.parseAsync(["serve", "--path", testDir], { from: "user" });

      expect(core.loadSqliteVecExtension).not.toHaveBeenCalled();
      expect(core.OnnxEmbeddingProvider).not.toHaveBeenCalled();
      expect(core.KnowledgeService).toHaveBeenCalledWith(
        expect.objectContaining({
          embeddingProvider: undefined,
        }),
      );
    });

    it("should NOT pass embeddingProvider when model is not available", async () => {
      const core = await import("@knowledgine/core");
      vi.mocked(core.loadConfig).mockReturnValue({
        dbPath: join(testDir, ".knowledgine", "db.sqlite"),
        embedding: { enabled: true, modelName: "all-MiniLM-L6-v2" },
      } as ReturnType<typeof core.loadConfig>);

      // ModelManager returns false for isModelAvailable
      vi.mocked(core.ModelManager).mockImplementationOnce(() => ({
        isModelAvailable: vi.fn().mockReturnValue(false),
      }));

      writeFileSync(join(testDir, ".knowledgine", ".gitkeep"), "");

      const program = new Command();
      program.exitOverride();
      registerServeCommand(program);
      await program.parseAsync(["serve", "--path", testDir], { from: "user" });

      expect(core.OnnxEmbeddingProvider).not.toHaveBeenCalled();
      expect(core.KnowledgeService).toHaveBeenCalledWith(
        expect.objectContaining({
          embeddingProvider: undefined,
        }),
      );
    });

    it("should log search mode in startup output", async () => {
      const core = await import("@knowledgine/core");
      vi.mocked(core.loadConfig).mockReturnValue({
        dbPath: join(testDir, ".knowledgine", "db.sqlite"),
        embedding: { enabled: true, modelName: "all-MiniLM-L6-v2" },
      } as ReturnType<typeof core.loadConfig>);

      vi.mocked(core.ModelManager).mockImplementationOnce(() => ({
        isModelAvailable: vi.fn().mockReturnValue(true),
      }));

      writeFileSync(join(testDir, ".knowledgine", ".gitkeep"), "");

      const program = new Command();
      program.exitOverride();
      registerServeCommand(program);
      await program.parseAsync(["serve", "--path", testDir], { from: "user" });

      const { serve } = await import("@hono/node-server");
      expect(vi.mocked(serve)).toHaveBeenCalledWith(expect.any(Object), expect.any(Function));
    });
  });
});
