import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { createDatabase, Migrator, ALL_MIGRATIONS } from "@knowledgine/core";
import { registerRecallCommand } from "../../src/commands/recall.js";
import { Command } from "commander";

// KnowledgeService をモック
vi.mock("@knowledgine/core", async (importOriginal) => {
  const original = await importOriginal<typeof import("@knowledgine/core")>();
  return {
    ...original,
    KnowledgeService: vi.fn(),
  };
});

import { KnowledgeService } from "@knowledgine/core";
const MockedKnowledgeService = vi.mocked(KnowledgeService);

function makeProgram(): Command {
  const program = new Command();
  program.exitOverride(); // prevent process.exit in tests
  registerRecallCommand(program);
  return program;
}

describe("recall command", () => {
  let testDir: string;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let mockSearch: ReturnType<typeof vi.fn>;
  let mockFindRelated: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    testDir = join(tmpdir(), `knowledgine-recall-test-${randomUUID()}`);
    mkdirSync(join(testDir, ".knowledgine"), { recursive: true });

    // Create minimal sqlite db
    const db = createDatabase(join(testDir, ".knowledgine", "index.sqlite"));
    new Migrator(db, ALL_MIGRATIONS).migrate();
    db.close();

    // Write a minimal config
    writeFileSync(
      join(testDir, ".knowledgine", "config.json"),
      JSON.stringify({ dbPath: join(testDir, ".knowledgine", "index.sqlite") }),
    );

    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    mockSearch = vi.fn().mockResolvedValue({
      query: "test",
      mode: "keyword",
      actualMode: "keyword",
      totalResults: 2,
      results: [
        {
          noteId: 1,
          filePath: "note1.md",
          title: "First Note",
          score: 0.9,
          matchReason: ["keyword match"],
          createdAt: "2025-01-01T00:00:00Z",
        },
        {
          noteId: 2,
          filePath: "note2.md",
          title: "Second Note",
          score: 0.7,
          matchReason: ["keyword match"],
          createdAt: "2025-01-02T00:00:00Z",
        },
      ],
    });

    mockFindRelated = vi.fn().mockResolvedValue({
      noteId: 1,
      relatedNotes: [
        {
          noteId: 2,
          filePath: "note2.md",
          title: "Second Note",
          score: 0.8,
          reasons: ["shared tag"],
        },
      ],
      problemSolutionPairs: [
        {
          id: 1,
          problemNoteId: 1,
          solutionNoteId: 2,
          problemPattern: "crashes on startup",
          solutionPattern: "check initialization order",
          confidence: 0.75,
        },
      ],
      graphRelations: [
        {
          entityId: 10,
          name: "TypeScript",
          entityType: "technology",
          relatedEntities: [{ id: 11, name: "JavaScript", entityType: "technology", hops: 1 }],
        },
      ],
    });

    MockedKnowledgeService.mockImplementation(
      () =>
        ({
          search: mockSearch,
          findRelated: mockFindRelated,
        }) as unknown as InstanceType<typeof KnowledgeService>,
    );
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  describe("basic query search", () => {
    it("should call KnowledgeService.search with query", async () => {
      const program = makeProgram();
      await program.parseAsync(["recall", "test query", "--path", testDir], { from: "user" });

      expect(mockSearch).toHaveBeenCalledWith(
        expect.objectContaining({ query: "test query", limit: 10, mode: "keyword" }),
      );
    });

    it("should output plain format by default", async () => {
      const program = makeProgram();
      await program.parseAsync(["recall", "test", "--path", testDir], { from: "user" });

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Recall results for"));
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("First Note"));
    });

    it("should output JSON format with --format json", async () => {
      const program = makeProgram();
      await program.parseAsync(["recall", "test", "--format", "json", "--path", testDir], {
        from: "user",
      });

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output) as { ok: boolean; command: string; result: unknown };
      expect(parsed.ok).toBe(true);
      expect(parsed.command).toBe("recall");
      expect(parsed.result).toBeDefined();
    });

    it("should output YAML format with --format yaml", async () => {
      const program = makeProgram();
      await program.parseAsync(["recall", "test", "--format", "yaml", "--path", testDir], {
        from: "user",
      });

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0] as string;
      expect(output).toContain("ok: true");
      expect(output).toContain("command: recall");
    });

    it("should respect --limit option", async () => {
      const program = makeProgram();
      await program.parseAsync(["recall", "test", "--limit", "5", "--path", testDir], {
        from: "user",
      });

      expect(mockSearch).toHaveBeenCalledWith(expect.objectContaining({ limit: 5 }));
    });

    it("should show error when no query and no --related", async () => {
      const program = makeProgram();
      await program.parseAsync(["recall", "--path", testDir], { from: "user" });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("query argument is required"),
      );
      expect(process.exitCode).toBe(1);
    });
  });

  describe("--related option", () => {
    it("should call KnowledgeService.findRelated with noteId", async () => {
      const program = makeProgram();
      await program.parseAsync(["recall", "--related", "1", "--path", testDir], { from: "user" });

      expect(mockFindRelated).toHaveBeenCalledWith(expect.objectContaining({ noteId: 1 }));
    });

    it("should output plain format for --related", async () => {
      const program = makeProgram();
      await program.parseAsync(["recall", "--related", "1", "--path", testDir], { from: "user" });

      const allOutput = consoleErrorSpy.mock.calls.flat().join("\n");
      expect(allOutput).toContain("Recall for note ID: 1");
      expect(allOutput).toContain("Related Notes:");
      expect(allOutput).toContain("Problem-Solution Pairs:");
      expect(allOutput).toContain("Knowledge Graph Relations:");
    });

    it("should output JSON format for --related with --format json", async () => {
      const program = makeProgram();
      await program.parseAsync(
        ["recall", "--related", "1", "--format", "json", "--path", testDir],
        { from: "user" },
      );

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output) as { ok: boolean; command: string; result: unknown };
      expect(parsed.ok).toBe(true);
      expect(parsed.command).toBe("recall");
    });

    it("should output YAML format for --related with --format yaml", async () => {
      const program = makeProgram();
      await program.parseAsync(
        ["recall", "--related", "1", "--format", "yaml", "--path", testDir],
        { from: "user" },
      );

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0] as string;
      expect(output).toContain("ok: true");
      expect(output).toContain("noteId");
    });

    it("should error on invalid noteId", async () => {
      const program = makeProgram();
      await program.parseAsync(["recall", "--related", "abc", "--path", testDir], { from: "user" });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("--related must be a positive integer"),
      );
      expect(process.exitCode).toBe(1);
    });

    it("should error on negative noteId", async () => {
      const program = makeProgram();
      await program.parseAsync(["recall", "--related", "-1", "--path", testDir], { from: "user" });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("--related must be a positive integer"),
      );
      expect(process.exitCode).toBe(1);
    });
  });

  describe("error handling", () => {
    it("should error when not initialized", async () => {
      rmSync(join(testDir, ".knowledgine"), { recursive: true, force: true });

      const program = makeProgram();
      await program.parseAsync(["recall", "test", "--path", testDir], { from: "user" });

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Not initialized"));
      expect(process.exitCode).toBe(1);
    });

    it("should error on invalid format", async () => {
      const program = makeProgram();
      await program.parseAsync(["recall", "test", "--format", "csv", "--path", testDir], {
        from: "user",
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("--format must be one of"),
      );
      expect(process.exitCode).toBe(1);
    });

    it("should error on invalid limit", async () => {
      const program = makeProgram();
      await program.parseAsync(["recall", "test", "--limit", "0", "--path", testDir], {
        from: "user",
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("--limit must be a positive integer"),
      );
      expect(process.exitCode).toBe(1);
    });
  });
});
