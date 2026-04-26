import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { createDatabase, Migrator, KnowledgeRepository, ALL_MIGRATIONS } from "@knowledgine/core";
import { statusCommand } from "../../src/commands/status.js";

describe("status command — storage breakdown", () => {
  let testDir: string;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    testDir = join(tmpdir(), `knowledgine-status-bd-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    stderrSpy.mockRestore();
  });

  it("includes a per-category storage breakdown for an initialized DB", async () => {
    const knowledgineDir = join(testDir, ".knowledgine");
    mkdirSync(knowledgineDir, { recursive: true });

    const dbPath = join(knowledgineDir, "index.sqlite");
    const db = createDatabase(dbPath, { enableVec: true });
    new Migrator(db, ALL_MIGRATIONS).migrate();
    const repo = new KnowledgeRepository(db);
    repo.saveNote({
      filePath: "demo.md",
      title: "Demo",
      content: "demo content",
      frontmatter: {},
      createdAt: new Date().toISOString(),
    });
    db.close();

    await statusCommand({ path: testDir });

    const output = stderrSpy.mock.calls.map((c) => c[0]).join("\n");

    // Each category should show up as a label in the breakdown section.
    expect(output).toContain("Breakdown");
    expect(output).toContain("notes");
    expect(output).toContain("fts");
    expect(output).toContain("embeddings");
    expect(output).toContain("graph");
    expect(output).toContain("events");
    expect(output).toContain("memory");
  });
});
