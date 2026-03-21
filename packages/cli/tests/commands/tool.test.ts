import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { createDatabase, Migrator, KnowledgeRepository, ALL_MIGRATIONS } from "@knowledgine/core";
import {
  toolSearchCommand,
  toolRelatedCommand,
  toolStatsCommand,
  toolEntitiesCommand,
} from "../../src/commands/tool.js";
import {
  formatSearchResults,
  formatRelatedNotes,
  formatStats,
  formatEntities,
} from "../../src/lib/formatter.js";
import type { SearchKnowledgeResult, FindRelatedResult, StatsResult, SearchEntitiesResult } from "@knowledgine/core";

describe("tool command", () => {
  let testDir: string;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let output: string[];
  let originalExitCode: number | undefined;

  beforeEach(() => {
    testDir = join(tmpdir(), `knowledgine-tool-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    output = [];
    stderrSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(" "));
    });
    originalExitCode = process.exitCode as number | undefined;
    process.exitCode = 0;
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    process.exitCode = originalExitCode;
    rmSync(testDir, { recursive: true, force: true });
  });

  function setupTestDb(): void {
    const knowledgineDir = join(testDir, ".knowledgine");
    mkdirSync(knowledgineDir, { recursive: true });
    const dbPath = join(knowledgineDir, "index.sqlite");
    const db = createDatabase(dbPath);
    new Migrator(db, ALL_MIGRATIONS).migrate();
    const repository = new KnowledgeRepository(db);
    const now = new Date().toISOString();
    repository.saveNote({
      filePath: "typescript-guide.md",
      title: "TypeScript Guide",
      content: "Learn TypeScript basics and advanced patterns",
      frontmatter: { tags: ["typescript", "programming"] },
      createdAt: now,
    });
    repository.saveNote({
      filePath: "react-hooks.md",
      title: "React Hooks",
      content: "Understanding React hooks for state management",
      frontmatter: { tags: ["react", "programming"] },
      createdAt: now,
    });
    db.close();
    // Create .knowledginerc so loadConfig works
    writeFileSync(
      join(testDir, ".knowledginerc"),
      JSON.stringify({ rootPath: testDir }),
    );
  }

  // ── tool search ──────────────────────────────────────────────

  describe("toolSearchCommand", () => {
    it("should output results for matching query", async () => {
      setupTestDb();
      await toolSearchCommand("TypeScript", { path: testDir });
      const text = output.join("\n");
      expect(text).toContain("TypeScript");
      expect(process.exitCode).toBe(0);
    });

    it("should output no results message for non-matching query", async () => {
      setupTestDb();
      await toolSearchCommand("nonexistent_zzz_query_12345", { path: testDir });
      const text = output.join("\n");
      expect(text).toContain("No results");
    });

    it("should set exitCode=1 when not initialized", async () => {
      await toolSearchCommand("test", { path: testDir });
      expect(process.exitCode).toBe(1);
      const text = output.join("\n");
      expect(text).toContain("Not initialized");
    });

    it("should set exitCode=1 for invalid limit", async () => {
      setupTestDb();
      await toolSearchCommand("test", { path: testDir, limit: "0" });
      expect(process.exitCode).toBe(1);
      const text = output.join("\n");
      expect(text).toContain("--limit");
    });

    it("should set exitCode=1 for invalid mode", async () => {
      setupTestDb();
      await toolSearchCommand("test", { path: testDir, mode: "invalid" });
      expect(process.exitCode).toBe(1);
      const text = output.join("\n");
      expect(text).toContain("--mode");
    });

    it("should set exitCode=1 for invalid format", async () => {
      setupTestDb();
      await toolSearchCommand("test", { path: testDir, format: "xml" });
      expect(process.exitCode).toBe(1);
      const text = output.join("\n");
      expect(text).toContain("--format");
    });
  });

  // ── tool related ─────────────────────────────────────────────

  describe("toolRelatedCommand", () => {
    it("should output related notes by noteId", async () => {
      setupTestDb();
      await toolRelatedCommand({ path: testDir, id: "1" });
      const text = output.join("\n");
      expect(text).toContain("noteId=1");
      expect(process.exitCode).toBe(0);
    });

    it("should output related notes by file path", async () => {
      setupTestDb();
      await toolRelatedCommand({ path: testDir, file: "typescript-guide.md" });
      const text = output.join("\n");
      expect(text).toContain("noteId=1");
    });

    it("should set exitCode=1 when not initialized", async () => {
      await toolRelatedCommand({ path: testDir, id: "1" });
      expect(process.exitCode).toBe(1);
    });

    it("should set exitCode=1 when neither --id nor --file provided", async () => {
      setupTestDb();
      await toolRelatedCommand({ path: testDir });
      expect(process.exitCode).toBe(1);
      const text = output.join("\n");
      expect(text).toContain("--id");
    });

    it("should set exitCode=1 for non-existent file", async () => {
      setupTestDb();
      await toolRelatedCommand({ path: testDir, file: "nonexistent.md" });
      expect(process.exitCode).toBe(1);
      const text = output.join("\n");
      expect(text).toContain("Note not found");
    });
  });

  // ── tool stats ────────────────────────────────────────────────

  describe("toolStatsCommand", () => {
    it("should output statistics", async () => {
      setupTestDb();
      await toolStatsCommand({ path: testDir });
      const text = output.join("\n");
      expect(text).toContain("Total Notes");
      expect(text).toContain("2");
      expect(process.exitCode).toBe(0);
    });

    it("should set exitCode=1 when not initialized", async () => {
      await toolStatsCommand({ path: testDir });
      expect(process.exitCode).toBe(1);
    });

    it("should output json format", async () => {
      setupTestDb();
      await toolStatsCommand({ path: testDir, format: "json" });
      const text = output.join("\n");
      const parsed = JSON.parse(text);
      expect(parsed.totalNotes).toBe(2);
    });
  });

  // ── tool entities ─────────────────────────────────────────────

  describe("toolEntitiesCommand", () => {
    it("should output no entities found when graph is empty", async () => {
      setupTestDb();
      await toolEntitiesCommand("TypeScript", { path: testDir });
      const text = output.join("\n");
      expect(text).toContain("No entities found");
      expect(process.exitCode).toBe(0);
    });

    it("should set exitCode=1 when not initialized", async () => {
      await toolEntitiesCommand("TypeScript", { path: testDir });
      expect(process.exitCode).toBe(1);
    });
  });
});

// ── formatter ─────────────────────────────────────────────────

describe("formatter", () => {
  const sampleSearchResults: SearchKnowledgeResult["results"] = [
    {
      noteId: 1,
      filePath: "typescript-guide.md",
      title: "TypeScript Guide",
      score: 0.95,
      matchReason: ["keyword match"],
      createdAt: "2024-01-01T00:00:00.000Z",
    },
    {
      noteId: 2,
      filePath: "react-hooks.md",
      title: "React Hooks",
      score: 0.80,
      matchReason: ["keyword match"],
      createdAt: "2024-01-01T00:00:00.000Z",
    },
  ];

  const sampleRelatedResult: FindRelatedResult = {
    noteId: 1,
    relatedNotes: [
      { noteId: 2, filePath: "react-hooks.md", title: "React Hooks", score: 0.7, reasons: ["common tag"] },
    ],
    problemSolutionPairs: [],
    graphRelations: [],
  };

  const sampleStats: StatsResult = {
    totalNotes: 10,
    totalPatterns: 5,
    totalLinks: 3,
    totalPairs: 2,
    patternsByType: { problem: 2, solution: 3 },
    embeddingStatus: { available: false, notesWithoutEmbeddings: null },
    graphStats: null,
  };

  const sampleEntities: SearchEntitiesResult = {
    query: "TypeScript",
    totalResults: 1,
    entities: [
      { id: 1, name: "typescript", entityType: "technology", description: "TS language", createdAt: "2024-01-01" },
    ],
  };

  describe("formatSearchResults", () => {
    it("should format as json", () => {
      const output = formatSearchResults(sampleSearchResults, "json");
      const parsed = JSON.parse(output);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].filePath).toBe("typescript-guide.md");
    });

    it("should format as table", () => {
      const output = formatSearchResults(sampleSearchResults, "table");
      expect(output).toContain("Score");
      expect(output).toContain("TypeScript Guide");
    });

    it("should format as plain", () => {
      const output = formatSearchResults(sampleSearchResults, "plain");
      expect(output).toContain("[0.95]");
      expect(output).toContain("typescript-guide.md");
    });

    it("should return empty string for empty results in table mode", () => {
      const output = formatSearchResults([], "table");
      expect(output).toBe("");
    });
  });

  describe("formatRelatedNotes", () => {
    it("should format as json", () => {
      const output = formatRelatedNotes(sampleRelatedResult, "json");
      const parsed = JSON.parse(output);
      expect(parsed.noteId).toBe(1);
    });

    it("should format as table", () => {
      const output = formatRelatedNotes(sampleRelatedResult, "table");
      expect(output).toContain("noteId=1");
      expect(output).toContain("React Hooks");
    });

    it("should format as plain", () => {
      const output = formatRelatedNotes(sampleRelatedResult, "plain");
      expect(output).toContain("Note ID: 1");
    });

    it("should show no related notes message when empty", () => {
      const emptyResult: FindRelatedResult = { ...sampleRelatedResult, relatedNotes: [] };
      const output = formatRelatedNotes(emptyResult, "table");
      expect(output).toContain("no related notes found");
    });
  });

  describe("formatStats", () => {
    it("should format as json", () => {
      const output = formatStats(sampleStats, "json");
      const parsed = JSON.parse(output);
      expect(parsed.totalNotes).toBe(10);
    });

    it("should format as table", () => {
      const output = formatStats(sampleStats, "table");
      expect(output).toContain("Total Notes");
      expect(output).toContain("10");
    });

    it("should format as plain", () => {
      const output = formatStats(sampleStats, "plain");
      expect(output).toContain("Notes: 10");
    });
  });

  describe("formatEntities", () => {
    it("should format as json", () => {
      const output = formatEntities(sampleEntities, "json");
      const parsed = JSON.parse(output);
      expect(parsed.entities[0].name).toBe("typescript");
    });

    it("should format as table", () => {
      const output = formatEntities(sampleEntities, "table");
      expect(output).toContain("technology");
      expect(output).toContain("typescript");
    });

    it("should format as plain", () => {
      const output = formatEntities(sampleEntities, "plain");
      expect(output).toContain("[technology]");
      expect(output).toContain("typescript");
    });

    it("should return empty string for empty entities in table mode", () => {
      const emptyResult: SearchEntitiesResult = { ...sampleEntities, entities: [], totalResults: 0 };
      const output = formatEntities(emptyResult, "table");
      expect(output).toBe("");
    });
  });
});
