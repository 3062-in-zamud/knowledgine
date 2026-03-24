import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createDatabase, Migrator, ALL_MIGRATIONS } from "@knowledgine/core";
import { registerSuggestCommand } from "../../src/commands/suggest.js";
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
  registerSuggestCommand(program);
  return program;
}

describe("suggest command", () => {
  let testDir: string;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let mockSearch: ReturnType<typeof vi.fn>;
  let mockFindRelated: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "knowledgine-suggest-test-"));
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
      query: "TypeScript type error",
      mode: "hybrid",
      actualMode: "hybrid",
      totalResults: 2,
      results: [
        {
          noteId: 1,
          filePath: "packages/core/errors.ts",
          title: "Custom error classes pattern",
          score: 0.85,
          matchReason: ["semantic match"],
          createdAt: "2025-01-01T00:00:00Z",
        },
        {
          noteId: 2,
          filePath: "docs/patterns.md",
          title: "Error handling best practices",
          score: 0.72,
          matchReason: ["keyword match"],
          createdAt: "2025-01-02T00:00:00Z",
        },
      ],
    });

    mockFindRelated = vi.fn().mockResolvedValue({
      noteId: 1,
      relatedNotes: [],
      problemSolutionPairs: [
        {
          id: 1,
          problemNoteId: 1,
          solutionNoteId: 2,
          problemPattern: "Database errors",
          solutionPattern: "Use DatabaseError wrapper with context",
          confidence: 0.92,
        },
      ],
      graphRelations: [],
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

  describe("query input", () => {
    it("should call search with mode hybrid when query argument is given", async () => {
      const program = makeProgram();
      await program.parseAsync(["suggest", "TypeScript type error", "--path", testDir], {
        from: "user",
      });

      expect(mockSearch).toHaveBeenCalledWith(
        expect.objectContaining({ query: "TypeScript type error", mode: "hybrid" }),
      );
    });

    it("should call search with mode hybrid when --context is given", async () => {
      const program = makeProgram();
      await program.parseAsync(
        ["suggest", "--context", "TypeScript type error", "--path", testDir],
        { from: "user" },
      );

      expect(mockSearch).toHaveBeenCalledWith(
        expect.objectContaining({ query: "TypeScript type error", mode: "hybrid" }),
      );
    });

    it("should use smart content extraction (not 200-char limit) when --file is given", async () => {
      const contextFile = join(testDir, "context.ts");
      // import 文が後半にある TypeScript ファイル（先頭200文字には含まれない）
      const prefix = "// ".repeat(70); // ~210文字のコメント
      const tsContent = `${prefix}\nimport { User } from "./types";\nexport function greet(name: string) {}\n`;
      writeFileSync(contextFile, tsContent);

      const program = makeProgram();
      await program.parseAsync(["suggest", "--file", contextFile, "--path", testDir], {
        from: "user",
      });

      // スマート抽出では import/export 行が優先されるため、先頭200文字制限では含まれなかった行も含む
      const calledQuery = (mockSearch.mock.calls[0][0] as { query: string }).query;
      expect(calledQuery).toContain('import { User } from "./types"');
      expect(calledQuery).toContain("export function greet");
    });
  });

  describe("output format", () => {
    it("should output plain format by default", async () => {
      const program = makeProgram();
      await program.parseAsync(["suggest", "TypeScript type error", "--path", testDir], {
        from: "user",
      });

      const allOutput = [
        ...consoleLogSpy.mock.calls.flat(),
        ...consoleErrorSpy.mock.calls.flat(),
      ].join("\n");
      expect(allOutput).toContain('Suggestions for "TypeScript type error"');
      expect(allOutput).toContain("packages/core/errors.ts");
    });

    it("should include PSP in plain output", async () => {
      const program = makeProgram();
      await program.parseAsync(["suggest", "TypeScript type error", "--path", testDir], {
        from: "user",
      });

      const allOutput = [
        ...consoleLogSpy.mock.calls.flat(),
        ...consoleErrorSpy.mock.calls.flat(),
      ].join("\n");
      expect(allOutput).toContain("PSP:");
      expect(allOutput).toContain("Use DatabaseError wrapper with context");
    });

    it("should output JSON format with --format json", async () => {
      const program = makeProgram();
      await program.parseAsync(
        ["suggest", "TypeScript type error", "--format", "json", "--path", testDir],
        { from: "user" },
      );

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output) as {
        query: string;
        mode: string;
        results: unknown[];
        psp: unknown[];
      };
      expect(parsed.query).toBe("TypeScript type error");
      expect(parsed.mode).toBe("hybrid");
      expect(Array.isArray(parsed.results)).toBe(true);
      expect(Array.isArray(parsed.psp)).toBe(true);
    });

    it("should call findRelated for PSP data", async () => {
      const program = makeProgram();
      await program.parseAsync(["suggest", "TypeScript type error", "--path", testDir], {
        from: "user",
      });

      // search returns 2 results, so findRelated should be called for top results
      expect(mockFindRelated).toHaveBeenCalled();
    });
  });

  describe("--limit option", () => {
    it("should respect --limit option", async () => {
      const program = makeProgram();
      await program.parseAsync(
        ["suggest", "TypeScript type error", "--limit", "3", "--path", testDir],
        { from: "user" },
      );

      expect(mockSearch).toHaveBeenCalledWith(expect.objectContaining({ limit: 3 }));
    });
  });

  describe("zero results", () => {
    it("should show appropriate message when no results", async () => {
      mockSearch.mockResolvedValueOnce({
        query: "unknown",
        mode: "hybrid",
        actualMode: "hybrid",
        totalResults: 0,
        results: [],
      });

      const program = makeProgram();
      await program.parseAsync(["suggest", "unknown", "--path", testDir], { from: "user" });

      const allOutput = [
        ...consoleLogSpy.mock.calls.flat(),
        ...consoleErrorSpy.mock.calls.flat(),
      ].join("\n");
      expect(allOutput).toContain("No related patterns found");
    });
  });

  describe("error handling", () => {
    it("should error when not initialized", async () => {
      rmSync(join(testDir, ".knowledgine"), { recursive: true, force: true });

      const program = makeProgram();
      await program.parseAsync(["suggest", "test", "--path", testDir], { from: "user" });

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Not initialized"));
      expect(process.exitCode).toBe(1);
    });

    it("should error when no query, context, or file is given", async () => {
      const program = makeProgram();
      await program.parseAsync(["suggest", "--path", testDir], { from: "user" });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("query, --context, or --file"),
      );
      expect(process.exitCode).toBe(1);
    });
  });
});
