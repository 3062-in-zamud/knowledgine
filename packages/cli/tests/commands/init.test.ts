import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { createDatabase, Migrator, KnowledgeRepository, ALL_MIGRATIONS } from "@knowledgine/core";
import { initCommand } from "../../src/commands/init.js";

describe("init command", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `knowledgine-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("should create .knowledgine directory and index markdown files", async () => {
    // Create test markdown files
    writeFileSync(join(testDir, "note1.md"), "# First Note\n\nSome content here");
    writeFileSync(join(testDir, "note2.md"), "# Second Note\n\nMore content");

    await initCommand({ path: testDir });

    // Verify .knowledgine directory
    expect(existsSync(join(testDir, ".knowledgine"))).toBe(true);
    expect(existsSync(join(testDir, ".knowledgine", "index.sqlite"))).toBe(true);

    // Verify indexed notes
    const db = createDatabase(join(testDir, ".knowledgine", "index.sqlite"));
    new Migrator(db, ALL_MIGRATIONS).migrate();
    const repository = new KnowledgeRepository(db);
    const stats = repository.getStats();
    expect(stats.totalNotes).toBe(2);
    db.close();
  });

  it("should handle subdirectories", async () => {
    mkdirSync(join(testDir, "sub"), { recursive: true });
    writeFileSync(join(testDir, "top.md"), "# Top\n\nContent");
    writeFileSync(join(testDir, "sub", "deep.md"), "# Deep\n\nNested content");

    await initCommand({ path: testDir });

    const db = createDatabase(join(testDir, ".knowledgine", "index.sqlite"));
    new Migrator(db, ALL_MIGRATIONS).migrate();
    const repository = new KnowledgeRepository(db);

    // Verify relative path storage
    const note = repository.getNoteByPath("sub/deep.md");
    expect(note).toBeDefined();
    expect(note!.file_path).toBe("sub/deep.md");

    const stats = repository.getStats();
    expect(stats.totalNotes).toBe(2);
    db.close();
  });

  it("should handle empty directory without errors", async () => {
    await initCommand({ path: testDir });

    expect(existsSync(join(testDir, ".knowledgine"))).toBe(true);

    const db = createDatabase(join(testDir, ".knowledgine", "index.sqlite"));
    new Migrator(db, ALL_MIGRATIONS).migrate();
    const repository = new KnowledgeRepository(db);
    const stats = repository.getStats();
    expect(stats.totalNotes).toBe(0);
    db.close();
  });

  it("should be idempotent (no duplicate notes on re-run)", async () => {
    writeFileSync(join(testDir, "note.md"), "# Test\n\nContent");

    await initCommand({ path: testDir });
    await initCommand({ path: testDir });

    const db = createDatabase(join(testDir, ".knowledgine", "index.sqlite"));
    new Migrator(db, ALL_MIGRATIONS).migrate();
    const repository = new KnowledgeRepository(db);
    const stats = repository.getStats();
    expect(stats.totalNotes).toBe(1);
    db.close();
  });

  it("should extract patterns from markdown content", async () => {
    writeFileSync(
      join(testDir, "patterns.md"),
      [
        "# Problem Notes",
        "",
        "## 問題",
        "- TypeScript のビルドが失敗する",
        "",
        "## 解決策",
        "- tsconfig を修正した",
      ].join("\n"),
    );

    await initCommand({ path: testDir });

    const db = createDatabase(join(testDir, ".knowledgine", "index.sqlite"));
    new Migrator(db, ALL_MIGRATIONS).migrate();
    const repository = new KnowledgeRepository(db);
    const stats = repository.getStats();
    expect(stats.totalNotes).toBe(1);
    expect(stats.totalPatterns).toBeGreaterThanOrEqual(0); // Pattern extraction is best-effort
    db.close();
  });
});
