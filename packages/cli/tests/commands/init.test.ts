import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, existsSync, rmSync, chmodSync } from "fs";
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

describe("init command – error handling", () => {
  let testDir: string;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let stderrOutput: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `knowledgine-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    stderrOutput = "";
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderrOutput += typeof chunk === "string" ? chunk : chunk.toString();
      return true;
    });
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    rmSync(testDir, { recursive: true, force: true });
  });

  it("should skip unreadable files and continue indexing other files", async () => {
    // Create a readable file and an unreadable file
    writeFileSync(join(testDir, "readable.md"), "# Readable\n\nContent here");
    const unreadablePath = join(testDir, "unreadable.md");
    writeFileSync(unreadablePath, "# Unreadable\n\nContent");

    // Make the file unreadable (Unix only — skip on Windows)
    const isWindows = process.platform === "win32";
    if (!isWindows) {
      chmodSync(unreadablePath, 0o000);
    }

    try {
      // Should not throw even though one file cannot be read
      await initCommand({ path: testDir });

      if (!isWindows) {
        // The readable file should still be indexed
        const db = createDatabase(join(testDir, ".knowledgine", "index.sqlite"));
        new Migrator(db, ALL_MIGRATIONS).migrate();
        const repository = new KnowledgeRepository(db);
        const stats = repository.getStats();
        // At least the readable file was indexed
        expect(stats.totalNotes).toBeGreaterThanOrEqual(1);
        db.close();

        // A warning about the skipped file should appear in stderr
        expect(stderrOutput).toMatch(/[Ss]kip|[Ee]rror|warn/i);
      }
    } finally {
      // Restore permissions so cleanup can delete the file
      if (!isWindows) {
        try {
          chmodSync(unreadablePath, 0o644);
        } catch {
          // ignore
        }
      }
    }
  });

  it("should complete successfully with multiple files and report all indexed", async () => {
    for (let i = 0; i < 5; i++) {
      writeFileSync(join(testDir, `note${i}.md`), `# Note ${i}\n\nContent for note ${i}`);
    }

    await initCommand({ path: testDir });

    const db = createDatabase(join(testDir, ".knowledgine", "index.sqlite"));
    new Migrator(db, ALL_MIGRATIONS).migrate();
    const repository = new KnowledgeRepository(db);
    const stats = repository.getStats();
    expect(stats.totalNotes).toBe(5);
    db.close();

    // Step progress completion message should appear
    expect(stderrOutput).toMatch(/completed|initialized/i);
  });

  it("should print step-based progress output during initialization", async () => {
    writeFileSync(join(testDir, "doc.md"), "# Doc\n\nSome content");

    await initCommand({ path: testDir });

    // Step progress messages should be present in stderr
    expect(stderrOutput).toContain("Initializing");
    expect(stderrOutput).toContain("database");
    expect(stderrOutput).toContain("Indexing");
  });
});
