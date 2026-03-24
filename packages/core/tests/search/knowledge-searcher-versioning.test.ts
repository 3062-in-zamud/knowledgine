import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { KnowledgeSearcher } from "../../src/search/knowledge-searcher.js";
import { createTestDb } from "../helpers/test-db.js";
import type { TestContext } from "../helpers/test-db.js";

describe("KnowledgeSearcher versioning integration", () => {
  let ctx: TestContext;
  let searcher: KnowledgeSearcher;

  beforeEach(() => {
    ctx = createTestDb();
    searcher = new KnowledgeSearcher(ctx.repository);

    // Seed: active note
    const activeId = ctx.repository.saveNote({
      filePath: "active-note.md",
      title: "Active Note TypeScript",
      content: "TypeScript active documentation",
      frontmatter: {},
      createdAt: new Date().toISOString(),
    });

    // Seed: deprecated note
    const deprecatedId = ctx.repository.saveNote({
      filePath: "deprecated-note.md",
      title: "Deprecated Note TypeScript",
      content: "TypeScript deprecated old documentation",
      frontmatter: {},
      createdAt: new Date().toISOString(),
    });

    // Mark deprecated note
    ctx.db.prepare("UPDATE knowledge_notes SET deprecated = 1 WHERE id = ?").run(deprecatedId);
    void activeId;
  });

  afterEach(() => {
    ctx.db.close();
  });

  it("should exclude deprecated notes by default (includeDeprecated=false)", async () => {
    const results = await searcher.search({ query: "TypeScript" });
    const filePaths = results.map((r) => r.note.file_path);
    expect(filePaths).toContain("active-note.md");
    expect(filePaths).not.toContain("deprecated-note.md");
  });

  it("should include deprecated notes when includeDeprecated=true", async () => {
    const results = await searcher.search({ query: "TypeScript", includeDeprecated: true });
    const filePaths = results.map((r) => r.note.file_path);
    expect(filePaths).toContain("active-note.md");
    expect(filePaths).toContain("deprecated-note.md");
  });

  it("should give higher score to notes with more recent valid_from", async () => {
    // Create two active notes with different valid_from (via created_at backfill)
    const olderDate = "2020-01-01T00:00:00.000Z";
    const newerDate = new Date().toISOString();

    ctx.db
      .prepare(
        "INSERT INTO knowledge_notes (file_path, title, content, created_at, valid_from, deprecated) VALUES (?, ?, ?, ?, ?, 0)",
      )
      .run(
        "older-note.md",
        "Older Cache Memory",
        "cache memory older article",
        olderDate,
        olderDate,
      );

    ctx.db
      .prepare(
        "INSERT INTO knowledge_notes (file_path, title, content, created_at, valid_from, deprecated) VALUES (?, ?, ?, ?, ?, 0)",
      )
      .run(
        "newer-note.md",
        "Newer Cache Memory",
        "cache memory newer article",
        newerDate,
        newerDate,
      );

    // Rebuild FTS index for new direct inserts
    ctx.db.prepare("INSERT INTO knowledge_notes_fts(knowledge_notes_fts) VALUES('rebuild')").run();

    const results = await searcher.search({ query: "cache memory" });
    const olderResult = results.find((r) => r.note.file_path === "older-note.md");
    const newerResult = results.find((r) => r.note.file_path === "newer-note.md");

    expect(olderResult).toBeDefined();
    expect(newerResult).toBeDefined();
    // Newer note should have higher score due to valid_from bonus
    expect(newerResult!.score).toBeGreaterThan(olderResult!.score);
  });
});
