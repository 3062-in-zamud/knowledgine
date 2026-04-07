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
  DEFAULT_MODEL_NAME,
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
    const knowledgineDir = join(testDir, ".knowledgine");
    mkdirSync(knowledgineDir, { recursive: true });

    const dbPath = join(knowledgineDir, "index.sqlite");
    const db = createDatabase(dbPath, { enableVec: true });
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

    await statusCommand({ path: testDir });

    const output = stderrSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("1");
    expect(output).toContain("indexed");
    expect(output).toContain("Database");
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
    expect(output).toContain(DEFAULT_MODEL_NAME);
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
    expect(output).toContain("MCP:");
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
    // Status should contain readiness info (FTS5 only when no embeddings)
    expect(output).toContain("FTS5 only");
  });

  it("should show 'FTS5 only' when notes exist but no embeddings", async () => {
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
    // With notes but no embeddings, should show FTS5 only (not semantic + FTS5)
    expect(output).toContain("FTS5 only");
    expect(output).not.toContain("semantic + FTS5");
  });

  it("should show upgrade hint when semantic is not ready", async () => {
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
    expect(output).toContain("upgrade --semantic");
  });
});
