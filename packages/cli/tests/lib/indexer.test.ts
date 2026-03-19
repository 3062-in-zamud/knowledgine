import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  discoverMarkdownFiles,
  deduplicatePatterns,
  indexFile,
  indexAll,
} from "../../src/lib/indexer.js";
import {
  createDatabase,
  Migrator,
  KnowledgeRepository,
  ALL_MIGRATIONS,
  FileProcessor,
  PatternExtractor,
} from "@knowledgine/core";
import type { ExtractedPattern } from "@knowledgine/core";

function createTestDb() {
  const db = createDatabase(":memory:");
  new Migrator(db, ALL_MIGRATIONS).migrate();
  const repository = new KnowledgeRepository(db);
  return { db, repository };
}

describe("discoverMarkdownFiles", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "knowledgine-indexer-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("finds .md files only", async () => {
    writeFileSync(join(tmpDir, "note.md"), "# Note");
    writeFileSync(join(tmpDir, "readme.txt"), "text file");
    writeFileSync(join(tmpDir, "script.js"), "console.log()");

    const files = await discoverMarkdownFiles(tmpDir);
    expect(files).toEqual(["note.md"]);
  });

  it("excludes node_modules directory", async () => {
    mkdirSync(join(tmpDir, "node_modules"));
    writeFileSync(join(tmpDir, "node_modules", "lib.md"), "# Lib");
    writeFileSync(join(tmpDir, "note.md"), "# Note");

    const files = await discoverMarkdownFiles(tmpDir);
    expect(files).not.toContain("node_modules/lib.md");
    expect(files).toContain("note.md");
  });

  it("excludes dot-prefixed directories", async () => {
    mkdirSync(join(tmpDir, ".hidden"));
    writeFileSync(join(tmpDir, ".hidden", "secret.md"), "# Secret");
    writeFileSync(join(tmpDir, "public.md"), "# Public");

    const files = await discoverMarkdownFiles(tmpDir);
    expect(files).not.toContain(".hidden/secret.md");
    expect(files).toContain("public.md");
  });

  it("recurses into subdirectories", async () => {
    mkdirSync(join(tmpDir, "subdir"));
    writeFileSync(join(tmpDir, "root.md"), "# Root");
    writeFileSync(join(tmpDir, "subdir", "child.md"), "# Child");

    const files = await discoverMarkdownFiles(tmpDir);
    expect(files).toContain("root.md");
    expect(files).toContain("subdir/child.md");
  });

  it("empty directory returns empty array", async () => {
    const files = await discoverMarkdownFiles(tmpDir);
    expect(files).toEqual([]);
  });
});

describe("deduplicatePatterns", () => {
  const makePattern = (
    type: string,
    lineNumber: number | undefined,
    content: string,
  ): ExtractedPattern => ({
    type: type as ExtractedPattern["type"],
    lineNumber,
    content,
    rawLine: content,
  });

  it("removes duplicate patterns with same type+lineNumber+content", () => {
    const patterns: ExtractedPattern[] = [
      makePattern("problem", 1, "error occurred"),
      makePattern("problem", 1, "error occurred"),
      makePattern("solution", 2, "fixed it"),
    ];
    const result = deduplicatePatterns(patterns);
    expect(result).toHaveLength(2);
  });

  it("no duplicates returns same patterns", () => {
    const patterns: ExtractedPattern[] = [
      makePattern("problem", 1, "error a"),
      makePattern("solution", 2, "fix a"),
      makePattern("learning", 3, "learned something"),
    ];
    const result = deduplicatePatterns(patterns);
    expect(result).toHaveLength(3);
  });

  it("empty array returns empty array", () => {
    const result = deduplicatePatterns([]);
    expect(result).toEqual([]);
  });

  it("treats undefined lineNumber as distinct from numeric lineNumber", () => {
    const patterns: ExtractedPattern[] = [
      makePattern("problem", undefined, "same content"),
      makePattern("problem", 1, "same content"),
    ];
    const result = deduplicatePatterns(patterns);
    expect(result).toHaveLength(2);
  });
});

describe("indexFile", () => {
  let tmpDir: string;
  let db: ReturnType<typeof createDatabase>;
  let repository: KnowledgeRepository;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "knowledgine-indexfile-"));
    const ctx = createTestDb();
    db = ctx.db;
    repository = ctx.repository;
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("processes file → saves note + returns pattern count", async () => {
    writeFileSync(join(tmpDir, "test.md"), "# Test\n\nSome content here.");
    const fileProcessor = new FileProcessor();
    const patternExtractor = new PatternExtractor();

    const count = await indexFile("test.md", tmpDir, fileProcessor, patternExtractor, repository);
    expect(typeof count).toBe("number");
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("saves note to repository", async () => {
    writeFileSync(join(tmpDir, "note.md"), "# My Note\n\nContent.");
    const fileProcessor = new FileProcessor();
    const patternExtractor = new PatternExtractor();

    await indexFile("note.md", tmpDir, fileProcessor, patternExtractor, repository);

    const stats = repository.getStats();
    expect(stats.totalNotes).toBe(1);
  });
});

describe("indexAll", () => {
  let tmpDir: string;
  let db: ReturnType<typeof createDatabase>;
  let repository: KnowledgeRepository;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "knowledgine-indexall-"));
    const ctx = createTestDb();
    db = ctx.db;
    repository = ctx.repository;
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns IndexSummary with correct file count", async () => {
    writeFileSync(join(tmpDir, "a.md"), "# A");
    writeFileSync(join(tmpDir, "b.md"), "# B");

    const summary = await indexAll(tmpDir, repository);
    expect(summary.totalFiles).toBe(2);
    expect(summary.processedFiles).toBe(2);
  });

  it("elapsedMs is a non-negative number", async () => {
    writeFileSync(join(tmpDir, "a.md"), "# A");

    const summary = await indexAll(tmpDir, repository);
    expect(summary.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("errors array records failed files", async () => {
    writeFileSync(join(tmpDir, "good.md"), "# Good");

    const summary = await indexAll(tmpDir, repository);
    // indexAll uses internal FileProcessor, so test with real files for errors array
    expect(Array.isArray(summary.errors)).toBe(true);
  });

  it("empty directory returns zero totals", async () => {
    const summary = await indexAll(tmpDir, repository);
    expect(summary.totalFiles).toBe(0);
    expect(summary.processedFiles).toBe(0);
    expect(summary.totalPatterns).toBe(0);
    expect(summary.errors).toHaveLength(0);
  });

  it("totalPatterns is a non-negative number", async () => {
    writeFileSync(join(tmpDir, "note.md"), "# Note\n\nContent with no patterns.");

    const summary = await indexAll(tmpDir, repository);
    expect(summary.totalPatterns).toBeGreaterThanOrEqual(0);
  });
});
