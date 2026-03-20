import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import {
  createDatabase,
  Migrator,
  KnowledgeRepository,
  ALL_MIGRATIONS,
} from "@knowledgine/core";
import { statusCommand } from "../../src/commands/status.js";

describe("status command", () => {
  let testDir: string;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    testDir = join(tmpdir(), `knowledgine-status-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    stderrSpy.mockRestore();
  });

  it("should show 'Not initialized' for directory without .knowledgine", async () => {
    await statusCommand({ path: testDir });

    const output = stderrSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Not initialized");
  });

  it("should show database stats for initialized directory", async () => {
    // Initialize database
    const knowledgineDir = join(testDir, ".knowledgine");
    mkdirSync(knowledgineDir, { recursive: true });

    const dbPath = join(knowledgineDir, "index.sqlite");
    const db = createDatabase(dbPath, { enableVec: true });
    new Migrator(db, ALL_MIGRATIONS).migrate();
    const repo = new KnowledgeRepository(db);

    // Add a test note
    repo.saveNote({
      filePath: "test.md",
      title: "Test Note",
      content: "Some content",
      frontmatter: {},
      createdAt: new Date().toISOString(),
    });
    db.close();

    await statusCommand({ path: testDir });

    const output = stderrSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("1 indexed");
    expect(output).toContain("Database:");
  });

  it("should show model availability", async () => {
    const knowledgineDir = join(testDir, ".knowledgine");
    mkdirSync(knowledgineDir, { recursive: true });

    const dbPath = join(knowledgineDir, "index.sqlite");
    const db = createDatabase(dbPath, { enableVec: true });
    new Migrator(db, ALL_MIGRATIONS).migrate();
    db.close();

    await statusCommand({ path: testDir });

    const output = stderrSpy.mock.calls.map((c) => c[0]).join("\n");
    // Model won't be available in test environment
    expect(output).toMatch(/Model:.*all-MiniLM-L6-v2/);
  });

  it("should show MCP config status", async () => {
    const knowledgineDir = join(testDir, ".knowledgine");
    mkdirSync(knowledgineDir, { recursive: true });

    const dbPath = join(knowledgineDir, "index.sqlite");
    const db = createDatabase(dbPath, { enableVec: true });
    new Migrator(db, ALL_MIGRATIONS).migrate();
    db.close();

    await statusCommand({ path: testDir });

    const output = stderrSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("MCP Config:");
    expect(output).toContain("Claude Desktop:");
    expect(output).toContain("Cursor:");
  });

  it("should show overall status", async () => {
    const knowledgineDir = join(testDir, ".knowledgine");
    mkdirSync(knowledgineDir, { recursive: true });

    const dbPath = join(knowledgineDir, "index.sqlite");
    const db = createDatabase(dbPath, { enableVec: true });
    new Migrator(db, ALL_MIGRATIONS).migrate();
    const repo = new KnowledgeRepository(db);
    repo.saveNote({
      filePath: "test.md",
      title: "Test",
      content: "Content",
      frontmatter: {},
      createdAt: new Date().toISOString(),
    });
    db.close();

    await statusCommand({ path: testDir });

    const output = stderrSpy.mock.calls.map((c) => c[0]).join("\n");
    // Without model, status should be "Partial"
    expect(output).toContain("Partial");
  });
});
