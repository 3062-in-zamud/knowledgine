import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import type { TestContext } from "../helpers/test-db.js";
import { createDatabase, Migrator, ALL_MIGRATIONS } from "../../src/index.js";

describe("migration016: note_confidence", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestDb();
  });

  afterEach(() => {
    ctx.db.close();
  });

  describe("confidence column", () => {
    it("should have confidence column as REAL with DEFAULT 1.0", () => {
      const cols = ctx.db.prepare("PRAGMA table_info(knowledge_notes)").all() as Array<{
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | null;
      }>;
      const col = cols.find((c) => c.name === "confidence");
      expect(col).toBeDefined();
      expect(col!.type).toBe("REAL");
      expect(col!.dflt_value).toBe("1.0");
    });

    it("should default to 1.0 when not specified", () => {
      const now = new Date().toISOString();
      ctx.db
        .prepare(
          "INSERT INTO knowledge_notes (file_path, title, content, created_at) VALUES (?, ?, ?, ?)",
        )
        .run("test.md", "Test", "content", now);

      const row = ctx.db
        .prepare("SELECT confidence FROM knowledge_notes WHERE file_path = ?")
        .get("test.md") as { confidence: number };
      expect(row.confidence).toBe(1.0);
    });
  });

  describe("saveNote with confidence", () => {
    it("should save note with confidence=0.2", () => {
      const id = ctx.repository.saveNote({
        filePath: "low-conf.md",
        title: "Low Confidence",
        content: "some content",
        frontmatter: {},
        createdAt: new Date().toISOString(),
        confidence: 0.2,
      });

      const note = ctx.repository.getNoteById(id);
      expect(note).toBeDefined();
      expect(note!.confidence).toBe(0.2);
    });

    it("should save note with confidence=1.0", () => {
      const id = ctx.repository.saveNote({
        filePath: "high-conf.md",
        title: "High Confidence",
        content: "some content",
        frontmatter: {},
        createdAt: new Date().toISOString(),
        confidence: 1.0,
      });

      const note = ctx.repository.getNoteById(id);
      expect(note).toBeDefined();
      expect(note!.confidence).toBe(1.0);
    });

    it("should default to 1.0 when confidence not provided", () => {
      const id = ctx.repository.saveNote({
        filePath: "default-conf.md",
        title: "Default Confidence",
        content: "some content",
        frontmatter: {},
        createdAt: new Date().toISOString(),
      });

      const note = ctx.repository.getNoteById(id);
      expect(note).toBeDefined();
      expect(note!.confidence).toBe(1.0);
    });
  });

  describe("getNotesWithoutEmbeddingIds with confidence filtering", () => {
    it("should exclude notes with confidence=0.2 (<=0.3)", () => {
      const id = ctx.repository.saveNote({
        filePath: "low.md",
        title: "Low",
        content: "low confidence note",
        frontmatter: {},
        createdAt: new Date().toISOString(),
        confidence: 0.2,
      });

      const ids = ctx.repository.getNotesWithoutEmbeddingIds();
      expect(ids).not.toContain(id);
    });

    it("should exclude notes with confidence=0.3 (<=0.3)", () => {
      const id = ctx.repository.saveNote({
        filePath: "boundary.md",
        title: "Boundary",
        content: "boundary confidence note",
        frontmatter: {},
        createdAt: new Date().toISOString(),
        confidence: 0.3,
      });

      const ids = ctx.repository.getNotesWithoutEmbeddingIds();
      expect(ids).not.toContain(id);
    });

    it("should include notes with confidence=null (legacy)", () => {
      // Insert directly with NULL confidence to simulate legacy data
      const now = new Date().toISOString();
      ctx.db
        .prepare(
          "INSERT INTO knowledge_notes (file_path, title, content, created_at, confidence) VALUES (?, ?, ?, ?, NULL)",
        )
        .run("legacy.md", "Legacy", "legacy content", now);

      const row = ctx.db
        .prepare("SELECT id FROM knowledge_notes WHERE file_path = ?")
        .get("legacy.md") as { id: number };

      const ids = ctx.repository.getNotesWithoutEmbeddingIds();
      expect(ids).toContain(row.id);
    });

    it("should include notes with confidence=1.0", () => {
      const id = ctx.repository.saveNote({
        filePath: "high.md",
        title: "High",
        content: "high confidence note",
        frontmatter: {},
        createdAt: new Date().toISOString(),
        confidence: 1.0,
      });

      const ids = ctx.repository.getNotesWithoutEmbeddingIds();
      expect(ids).toContain(id);
    });

    it("should include notes with confidence=0.5 (>0.3)", () => {
      const id = ctx.repository.saveNote({
        filePath: "medium.md",
        title: "Medium",
        content: "medium confidence note",
        frontmatter: {},
        createdAt: new Date().toISOString(),
        confidence: 0.5,
      });

      const ids = ctx.repository.getNotesWithoutEmbeddingIds();
      expect(ids).toContain(id);
    });
  });

  describe("migration016 is included in ALL_MIGRATIONS", () => {
    it("should apply migration016 when running ALL_MIGRATIONS", () => {
      const db = createDatabase(":memory:");
      const migrator = new Migrator(db, ALL_MIGRATIONS);
      migrator.migrate();

      const cols = db.prepare("PRAGMA table_info(knowledge_notes)").all() as Array<{
        name: string;
      }>;
      expect(cols.map((c) => c.name)).toContain("confidence");

      db.close();
    });
  });
});
