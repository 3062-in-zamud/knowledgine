import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import type { TestContext } from "../helpers/test-db.js";
import { createDatabase, Migrator, ALL_MIGRATIONS } from "../../src/index.js";

describe("migration009: extraction_metadata", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestDb();
  });

  afterEach(() => {
    ctx.db.close();
  });

  describe("knowledge_notes: code_location_json column", () => {
    it("should have code_location_json column as TEXT", () => {
      const cols = ctx.db.prepare("PRAGMA table_info(knowledge_notes)").all() as Array<{
        name: string;
        type: string;
        notnull: number;
      }>;
      const col = cols.find((c) => c.name === "code_location_json");
      expect(col).toBeDefined();
      expect(col!.type).toBe("TEXT");
      expect(col!.notnull).toBe(0);
    });

    it("should allow NULL for code_location_json", () => {
      const now = new Date().toISOString();
      ctx.db
        .prepare(
          "INSERT INTO knowledge_notes (file_path, title, content, created_at) VALUES (?, ?, ?, ?)",
        )
        .run("test.md", "Test", "content", now);

      const row = ctx.db
        .prepare("SELECT code_location_json FROM knowledge_notes WHERE file_path = ?")
        .get("test.md") as { code_location_json: string | null };
      expect(row.code_location_json).toBeNull();
    });

    it("should store JSON text in code_location_json", () => {
      const now = new Date().toISOString();
      const json = JSON.stringify({ file: "src/foo.ts", line: 42 });
      ctx.db
        .prepare(
          "INSERT INTO knowledge_notes (file_path, title, content, created_at, code_location_json) VALUES (?, ?, ?, ?, ?)",
        )
        .run("test.md", "Test", "content", now, json);

      const row = ctx.db
        .prepare("SELECT code_location_json FROM knowledge_notes WHERE file_path = ?")
        .get("test.md") as { code_location_json: string };
      expect(row.code_location_json).toBe(json);
    });
  });

  describe("knowledge_notes: extracted_at column", () => {
    it("should have extracted_at column as TEXT", () => {
      const cols = ctx.db.prepare("PRAGMA table_info(knowledge_notes)").all() as Array<{
        name: string;
        type: string;
        notnull: number;
      }>;
      const col = cols.find((c) => c.name === "extracted_at");
      expect(col).toBeDefined();
      expect(col!.type).toBe("TEXT");
      expect(col!.notnull).toBe(0);
    });

    it("should allow NULL for extracted_at", () => {
      const now = new Date().toISOString();
      ctx.db
        .prepare(
          "INSERT INTO knowledge_notes (file_path, title, content, created_at) VALUES (?, ?, ?, ?)",
        )
        .run("test.md", "Test", "content", now);

      const row = ctx.db
        .prepare("SELECT extracted_at FROM knowledge_notes WHERE file_path = ?")
        .get("test.md") as { extracted_at: string | null };
      expect(row.extracted_at).toBeNull();
    });

    it("should store ISO timestamp in extracted_at", () => {
      const now = new Date().toISOString();
      ctx.db
        .prepare(
          "INSERT INTO knowledge_notes (file_path, title, content, created_at, extracted_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run("test.md", "Test", "content", now, now);

      const row = ctx.db
        .prepare("SELECT extracted_at FROM knowledge_notes WHERE file_path = ?")
        .get("test.md") as { extracted_at: string };
      expect(row.extracted_at).toBe(now);
    });
  });

  describe("suggest_feedback table", () => {
    it("should have suggest_feedback table", () => {
      const table = ctx.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='suggest_feedback'")
        .get();
      expect(table).toBeDefined();
    });

    it("should have id column as INTEGER PRIMARY KEY AUTOINCREMENT", () => {
      const cols = ctx.db.prepare("PRAGMA table_info(suggest_feedback)").all() as Array<{
        name: string;
        type: string;
        pk: number;
      }>;
      const col = cols.find((c) => c.name === "id");
      expect(col).toBeDefined();
      expect(col!.type).toBe("INTEGER");
      expect(col!.pk).toBe(1);
    });

    it("should have note_id column as NOT NULL", () => {
      const cols = ctx.db.prepare("PRAGMA table_info(suggest_feedback)").all() as Array<{
        name: string;
        type: string;
        notnull: number;
      }>;
      const col = cols.find((c) => c.name === "note_id");
      expect(col).toBeDefined();
      expect(col!.notnull).toBe(1);
    });

    it("should have query column as TEXT NOT NULL", () => {
      const cols = ctx.db.prepare("PRAGMA table_info(suggest_feedback)").all() as Array<{
        name: string;
        type: string;
        notnull: number;
      }>;
      const col = cols.find((c) => c.name === "query");
      expect(col).toBeDefined();
      expect(col!.type).toBe("TEXT");
      expect(col!.notnull).toBe(1);
    });

    it("should have is_useful column as INTEGER NOT NULL", () => {
      const cols = ctx.db.prepare("PRAGMA table_info(suggest_feedback)").all() as Array<{
        name: string;
        type: string;
        notnull: number;
      }>;
      const col = cols.find((c) => c.name === "is_useful");
      expect(col).toBeDefined();
      expect(col!.type).toBe("INTEGER");
      expect(col!.notnull).toBe(1);
    });

    it("should have context column as TEXT (nullable)", () => {
      const cols = ctx.db.prepare("PRAGMA table_info(suggest_feedback)").all() as Array<{
        name: string;
        type: string;
        notnull: number;
      }>;
      const col = cols.find((c) => c.name === "context");
      expect(col).toBeDefined();
      expect(col!.type).toBe("TEXT");
      expect(col!.notnull).toBe(0);
    });

    it("should have created_at with default datetime('now')", () => {
      const cols = ctx.db.prepare("PRAGMA table_info(suggest_feedback)").all() as Array<{
        name: string;
        dflt_value: string | null;
      }>;
      const col = cols.find((c) => c.name === "created_at");
      expect(col).toBeDefined();
      expect(col!.dflt_value).toContain("datetime");
    });

    it("should insert a suggest_feedback record linked to a note", () => {
      const now = new Date().toISOString();
      ctx.db
        .prepare(
          "INSERT INTO knowledge_notes (file_path, title, content, created_at) VALUES (?, ?, ?, ?)",
        )
        .run("test.md", "Test", "content", now);

      const noteRow = ctx.db
        .prepare("SELECT id FROM knowledge_notes WHERE file_path = ?")
        .get("test.md") as { id: number };

      const info = ctx.db
        .prepare(
          "INSERT INTO suggest_feedback (note_id, query, is_useful, context, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run(noteRow.id, "how to use TypeScript", 1, "context info", now);
      expect(info.changes).toBe(1);
    });

    it("should enforce FK: note_id must reference knowledge_notes", () => {
      // SQLite FKs are enforced only when PRAGMA foreign_keys = ON
      ctx.db.pragma("foreign_keys = ON");
      const now = new Date().toISOString();
      expect(() => {
        ctx.db
          .prepare(
            "INSERT INTO suggest_feedback (note_id, query, is_useful, created_at) VALUES (?, ?, ?, ?)",
          )
          .run(99999, "query", 1, now);
      }).toThrow();
    });

    it("should auto-increment id", () => {
      const now = new Date().toISOString();
      ctx.db
        .prepare(
          "INSERT INTO knowledge_notes (file_path, title, content, created_at) VALUES (?, ?, ?, ?)",
        )
        .run("test.md", "Test", "content", now);
      const noteRow = ctx.db
        .prepare("SELECT id FROM knowledge_notes WHERE file_path = ?")
        .get("test.md") as { id: number };

      ctx.db
        .prepare(
          "INSERT INTO suggest_feedback (note_id, query, is_useful, created_at) VALUES (?, ?, ?, ?)",
        )
        .run(noteRow.id, "query1", 1, now);
      ctx.db
        .prepare(
          "INSERT INTO suggest_feedback (note_id, query, is_useful, created_at) VALUES (?, ?, ?, ?)",
        )
        .run(noteRow.id, "query2", 0, now);

      const rows = ctx.db.prepare("SELECT id FROM suggest_feedback ORDER BY id").all() as Array<{
        id: number;
      }>;
      expect(rows[0].id).toBe(1);
      expect(rows[1].id).toBe(2);
    });
  });

  describe("migration009 is included in ALL_MIGRATIONS", () => {
    it("should apply migration009 when running ALL_MIGRATIONS", () => {
      const db = createDatabase(":memory:");
      const migrator = new Migrator(db, ALL_MIGRATIONS);
      migrator.migrate();

      // code_location_json column should exist
      const cols = db.prepare("PRAGMA table_info(knowledge_notes)").all() as Array<{
        name: string;
      }>;
      expect(cols.map((c) => c.name)).toContain("code_location_json");
      expect(cols.map((c) => c.name)).toContain("extracted_at");

      // suggest_feedback table should exist
      const table = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='suggest_feedback'")
        .get();
      expect(table).toBeDefined();

      db.close();
    });
  });
});
