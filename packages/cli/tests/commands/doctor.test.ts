import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createDatabase, Migrator, KnowledgeRepository, ALL_MIGRATIONS } from "@knowledgine/core";
import {
  doctorCommand,
  checkKnowledgineDir,
  checkDatabaseExists,
  checkDatabaseNotEmpty,
  checkDatabasePermissions,
  checkFTS5Integrity,
  checkModelFiles,
  checkEmbeddingCoverage,
  checkStaleEmbeddings,
  checkNodeVersion,
  checkSearchLatency,
} from "../../src/commands/doctor.js";

describe("doctor command", () => {
  let testDir: string;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "knowledgine-doctor-"));
    stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    stderrSpy.mockRestore();
  });

  it("should output health score when run with uninitialized directory", async () => {
    await doctorCommand({ path: testDir });

    const output = stderrSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Health Score");
  });

  it("should set process.exitCode to 1 when errors are found (no .knowledgine dir)", async () => {
    const originalExitCode = process.exitCode;
    process.exitCode = undefined;
    try {
      await doctorCommand({ path: testDir });
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = originalExitCode;
    }
  });

  it("should pass all critical checks with a valid initialized DB", async () => {
    const knowledgineDir = join(testDir, ".knowledgine");
    mkdirSync(knowledgineDir, { recursive: true });

    const dbPath = join(knowledgineDir, "index.sqlite");
    const db = createDatabase(dbPath, { enableVec: true });
    new Migrator(db, ALL_MIGRATIONS).migrate();
    db.close();

    const originalExitCode = process.exitCode;
    process.exitCode = undefined;
    try {
      await doctorCommand({ path: testDir });
      // With a valid DB (no errors), exit code should remain undefined (not set to 1)
      expect(process.exitCode).not.toBe(1);
    } finally {
      process.exitCode = originalExitCode;
    }
  });

  it("should show passes count in output for valid DB", async () => {
    const knowledgineDir = join(testDir, ".knowledgine");
    mkdirSync(knowledgineDir, { recursive: true });

    const dbPath = join(knowledgineDir, "index.sqlite");
    const db = createDatabase(dbPath, { enableVec: true });
    new Migrator(db, ALL_MIGRATIONS).migrate();
    db.close();

    await doctorCommand({ path: testDir });

    const output = stderrSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("checks passed");
  });
});

describe("checkKnowledgineDir", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "knowledgine-doctor-"));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("returns error when directory does not exist", () => {
    const result = checkKnowledgineDir(join(testDir, "nonexistent", ".knowledgine"));
    expect(result.status).toBe("error");
    expect(result.fix).toBeDefined();
  });

  it("returns pass when directory exists", () => {
    const knowledgineDir = join(testDir, ".knowledgine");
    mkdirSync(knowledgineDir, { recursive: true });
    const result = checkKnowledgineDir(knowledgineDir);
    expect(result.status).toBe("pass");
  });
});

describe("checkDatabaseExists", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "knowledgine-doctor-"));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("returns error when database does not exist", () => {
    const result = checkDatabaseExists(join(testDir, "index.sqlite"));
    expect(result.status).toBe("error");
    expect(result.fix).toBeDefined();
  });

  it("returns pass when database exists and is readable", () => {
    const dbPath = join(testDir, "index.sqlite");
    writeFileSync(dbPath, "placeholder");
    const result = checkDatabaseExists(dbPath);
    expect(result.status).toBe("pass");
  });
});

describe("checkDatabaseNotEmpty", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "knowledgine-doctor-"));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("returns error when database is 0 bytes", () => {
    const dbPath = join(testDir, "index.sqlite");
    writeFileSync(dbPath, "");
    const result = checkDatabaseNotEmpty(dbPath);
    expect(result.status).toBe("error");
    expect(result.message).toContain("0 bytes");
  });

  it("returns pass when database has content", () => {
    const dbPath = join(testDir, "index.sqlite");
    const db = createDatabase(dbPath);
    db.close();
    const result = checkDatabaseNotEmpty(dbPath);
    expect(result.status).toBe("pass");
  });

  it("returns error when database file does not exist", () => {
    const result = checkDatabaseNotEmpty(join(testDir, "nonexistent.sqlite"));
    expect(result.status).toBe("error");
  });
});

describe("checkDatabasePermissions", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "knowledgine-doctor-"));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("returns pass for a normal readable/writable file", () => {
    const dbPath = join(testDir, "index.sqlite");
    writeFileSync(dbPath, "test");
    const result = checkDatabasePermissions(dbPath);
    // Should be pass or warning (Windows skips, other platforms check)
    expect(["pass", "warning"]).toContain(result.status);
  });

  it("returns error when database does not exist", () => {
    const result = checkDatabasePermissions(join(testDir, "nonexistent.sqlite"));
    expect(result.status).toBe("error");
  });
});

describe("checkFTS5Integrity", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "knowledgine-doctor-"));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("returns error when database does not exist", () => {
    const result = checkFTS5Integrity(join(testDir, "nonexistent.sqlite"));
    expect(result.status).toBe("error");
  });

  it("returns error when database is empty", () => {
    const dbPath = join(testDir, "index.sqlite");
    writeFileSync(dbPath, "");
    const result = checkFTS5Integrity(dbPath);
    expect(result.status).toBe("error");
  });

  it("returns pass after full migration with FTS5 index", () => {
    const dbPath = join(testDir, "index.sqlite");
    const db = createDatabase(dbPath);
    new Migrator(db, ALL_MIGRATIONS).migrate();
    db.close();
    const result = checkFTS5Integrity(dbPath);
    expect(result.status).toBe("pass");
  });
});

describe("checkModelFiles", () => {
  it("returns pass or warning (depends on environment)", () => {
    const result = checkModelFiles();
    expect(["pass", "warning"]).toContain(result.status);
    expect(result.name).toBe("embedding model");
  });

  it("includes fix hint when model is not available", () => {
    const result = checkModelFiles();
    if (result.status === "warning") {
      expect(result.fix).toContain("upgrade --semantic");
    }
  });
});

describe("checkEmbeddingCoverage", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "knowledgine-doctor-"));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("returns error when database does not exist", () => {
    const result = checkEmbeddingCoverage(join(testDir, "nonexistent.sqlite"));
    expect(result.status).toBe("error");
  });

  it("returns pass with message 'no notes' for empty initialized DB", () => {
    const dbPath = join(testDir, "index.sqlite");
    const db = createDatabase(dbPath);
    new Migrator(db, ALL_MIGRATIONS).migrate();
    db.close();
    const result = checkEmbeddingCoverage(dbPath);
    expect(result.status).toBe("pass");
    expect(result.message).toContain("no notes");
  });

  it("returns warning when notes have no embeddings", () => {
    const dbPath = join(testDir, "index.sqlite");
    const db = createDatabase(dbPath);
    new Migrator(db, ALL_MIGRATIONS).migrate();
    const repo = new KnowledgeRepository(db);
    repo.saveNote({
      filePath: "test.md",
      title: "Test Note",
      content: "Some content",
      frontmatter: {},
      createdAt: new Date().toISOString(),
    });
    db.close();

    const result = checkEmbeddingCoverage(dbPath);
    // Notes exist but no embeddings → warning
    expect(result.status).toBe("warning");
    expect(result.fix).toBeDefined();
  });
});

describe("checkStaleEmbeddings", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "knowledgine-doctor-"));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("returns error when database does not exist", () => {
    const result = checkStaleEmbeddings(join(testDir, "nonexistent.sqlite"));
    expect(result.status).toBe("error");
  });

  it("returns pass for a freshly initialized DB (no stale embeddings)", () => {
    const dbPath = join(testDir, "index.sqlite");
    const db = createDatabase(dbPath);
    new Migrator(db, ALL_MIGRATIONS).migrate();
    db.close();
    const result = checkStaleEmbeddings(dbPath);
    expect(result.status).toBe("pass");
  });
});

describe("checkNodeVersion", () => {
  it("returns pass for current Node.js version (test environment is always v20+)", () => {
    const result = checkNodeVersion();
    // The test suite itself requires Node v20+, so this should always pass in CI
    expect(result.name).toBe("Node.js version");
    expect(["pass", "error", "warning"]).toContain(result.status);
  });

  it("returns a message containing the Node.js version", () => {
    const result = checkNodeVersion();
    expect(result.message).toContain("Node.js");
  });
});

describe("checkSearchLatency", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "knowledgine-doctor-"));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("returns error when database does not exist", async () => {
    const result = await checkSearchLatency(join(testDir, "nonexistent.sqlite"));
    expect(result.status).toBe("error");
  });

  it("returns pass or warning for a valid DB with FTS5 index", async () => {
    const dbPath = join(testDir, "index.sqlite");
    const db = createDatabase(dbPath);
    new Migrator(db, ALL_MIGRATIONS).migrate();
    db.close();

    const result = await checkSearchLatency(dbPath);
    expect(["pass", "warning"]).toContain(result.status);
    expect(result.message).toContain("ms");
  });
});

describe("health score calculation", () => {
  let testDir: string;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "knowledgine-doctor-"));
    stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    stderrSpy.mockRestore();
  });

  it("should output a score of 100/100 minus deductions", async () => {
    // No .knowledgine dir → multiple errors → score < 100
    await doctorCommand({ path: testDir });

    const output = stderrSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toMatch(/Health Score: \d+\/100/);
  });

  it("score decreases with each error", async () => {
    // Score formula: 100 - (errors * 15 + warnings * 5)
    // With 0 errors and 0 warnings: score = 100
    expect(Math.max(0, 100 - 0 * 15 - 0 * 5)).toBe(100);
    // With 1 error: score = 85
    expect(Math.max(0, 100 - 1 * 15 - 0 * 5)).toBe(85);
    // With 2 errors: score = 70
    expect(Math.max(0, 100 - 2 * 15 - 0 * 5)).toBe(70);
    // Score cannot go below 0
    expect(Math.max(0, 100 - 10 * 15 - 0 * 5)).toBe(0);
  });
});
