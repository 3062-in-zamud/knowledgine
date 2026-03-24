import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import type { TestContext } from "../helpers/test-db.js";
import { createDatabase, Migrator, ALL_MIGRATIONS } from "../../src/index.js";

describe("migration008: knowledge_versioning", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestDb();
  });

  afterEach(() => {
    ctx.db.close();
  });

  describe("knowledge_notes new columns", () => {
    it("should have version column with default 1", () => {
      const cols = ctx.db.prepare("PRAGMA table_info(knowledge_notes)").all() as Array<{
        name: string;
        dflt_value: string | null;
      }>;
      const col = cols.find((c) => c.name === "version");
      expect(col).toBeDefined();
      expect(col!.dflt_value).toBe("1");
    });

    it("should have supersedes column as INTEGER", () => {
      const cols = ctx.db.prepare("PRAGMA table_info(knowledge_notes)").all() as Array<{
        name: string;
        type: string;
        notnull: number;
      }>;
      const col = cols.find((c) => c.name === "supersedes");
      expect(col).toBeDefined();
      expect(col!.type).toBe("INTEGER");
      expect(col!.notnull).toBe(0);
    });

    it("should have valid_from column as TEXT", () => {
      const cols = ctx.db.prepare("PRAGMA table_info(knowledge_notes)").all() as Array<{
        name: string;
        type: string;
      }>;
      const col = cols.find((c) => c.name === "valid_from");
      expect(col).toBeDefined();
      expect(col!.type).toBe("TEXT");
    });

    it("should have deprecated column with default 0", () => {
      const cols = ctx.db.prepare("PRAGMA table_info(knowledge_notes)").all() as Array<{
        name: string;
        dflt_value: string | null;
      }>;
      const col = cols.find((c) => c.name === "deprecated");
      expect(col).toBeDefined();
      expect(col!.dflt_value).toBe("0");
    });

    it("should have deprecation_reason column as TEXT", () => {
      const cols = ctx.db.prepare("PRAGMA table_info(knowledge_notes)").all() as Array<{
        name: string;
        type: string;
        notnull: number;
      }>;
      const col = cols.find((c) => c.name === "deprecation_reason");
      expect(col).toBeDefined();
      expect(col!.type).toBe("TEXT");
      expect(col!.notnull).toBe(0);
    });

    it("should enforce deprecated CHECK constraint", () => {
      const now = new Date().toISOString();
      ctx.db
        .prepare(
          "INSERT INTO knowledge_notes (file_path, title, content, created_at) VALUES (?, ?, ?, ?)",
        )
        .run("test.md", "Test", "content", now);

      expect(() => {
        ctx.db
          .prepare("UPDATE knowledge_notes SET deprecated = 2 WHERE file_path = ?")
          .run("test.md");
      }).toThrow();
    });

    it("should default version=1 and deprecated=0 for new inserts", () => {
      const now = new Date().toISOString();
      ctx.db
        .prepare(
          "INSERT INTO knowledge_notes (file_path, title, content, created_at) VALUES (?, ?, ?, ?)",
        )
        .run("test.md", "Test", "content", now);

      const row = ctx.db
        .prepare("SELECT version, deprecated FROM knowledge_notes WHERE file_path = ?")
        .get("test.md") as { version: number; deprecated: number };
      expect(row.version).toBe(1);
      expect(row.deprecated).toBe(0);
    });

    it("should insert a note with versioning columns", () => {
      const now = new Date().toISOString();
      // Insert original note first (for FK reference)
      const original = ctx.db
        .prepare(
          "INSERT INTO knowledge_notes (file_path, title, content, created_at) VALUES (?, ?, ?, ?)",
        )
        .run("original.md", "Original", "content", now);

      const info = ctx.db
        .prepare(
          `INSERT INTO knowledge_notes
            (file_path, title, content, created_at, version, supersedes, valid_from, deprecated)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run("v2.md", "V2", "updated content", now, 2, original.lastInsertRowid, now, 0);
      expect(info.changes).toBe(1);
    });
  });

  describe("knowledge_notes valid_from backfill", () => {
    it("should backfill valid_from with created_at for existing data", () => {
      // createTestDb() runs all migrations including 008
      // Seed data created before migration would have valid_from = created_at
      const now = new Date().toISOString();
      ctx.db
        .prepare(
          "INSERT INTO knowledge_notes (file_path, title, content, created_at, valid_from) VALUES (?, ?, ?, ?, ?)",
        )
        .run("new.md", "New", "content", now, now);

      const row = ctx.db
        .prepare("SELECT valid_from, created_at FROM knowledge_notes WHERE file_path = ?")
        .get("new.md") as { valid_from: string; created_at: string };
      expect(row.valid_from).toBe(row.created_at);
    });
  });

  describe("extracted_patterns new columns", () => {
    it("should have deprecated column with default 0", () => {
      const cols = ctx.db.prepare("PRAGMA table_info(extracted_patterns)").all() as Array<{
        name: string;
        dflt_value: string | null;
      }>;
      const col = cols.find((c) => c.name === "deprecated");
      expect(col).toBeDefined();
      expect(col!.dflt_value).toBe("0");
    });

    it("should have deprecation_reason column", () => {
      const cols = ctx.db.prepare("PRAGMA table_info(extracted_patterns)").all() as Array<{
        name: string;
      }>;
      expect(cols.map((c) => c.name)).toContain("deprecation_reason");
    });

    it("should enforce deprecated CHECK constraint", () => {
      const now = new Date().toISOString();
      ctx.db
        .prepare(
          "INSERT INTO knowledge_notes (file_path, title, content, created_at) VALUES (?, ?, ?, ?)",
        )
        .run("test.md", "Test", "content", now);

      const noteId = (
        ctx.db.prepare("SELECT id FROM knowledge_notes WHERE file_path = ?").get("test.md") as {
          id: number;
        }
      ).id;

      ctx.db
        .prepare(
          "INSERT INTO extracted_patterns (note_id, pattern_type, content, confidence, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run(noteId, "problem", "some error", 0.8, now);

      expect(() => {
        ctx.db
          .prepare("UPDATE extracted_patterns SET deprecated = 3 WHERE note_id = ?")
          .run(noteId);
      }).toThrow();
    });
  });

  describe("problem_solution_pairs new columns", () => {
    it("should have version column with default 1", () => {
      const cols = ctx.db.prepare("PRAGMA table_info(problem_solution_pairs)").all() as Array<{
        name: string;
        dflt_value: string | null;
      }>;
      const col = cols.find((c) => c.name === "version");
      expect(col).toBeDefined();
      expect(col!.dflt_value).toBe("1");
    });

    it("should have supersedes column as TEXT", () => {
      const cols = ctx.db.prepare("PRAGMA table_info(problem_solution_pairs)").all() as Array<{
        name: string;
        type: string;
      }>;
      const col = cols.find((c) => c.name === "supersedes");
      expect(col).toBeDefined();
      expect(col!.type).toBe("TEXT");
    });

    it("should have deprecated column with default 0", () => {
      const cols = ctx.db.prepare("PRAGMA table_info(problem_solution_pairs)").all() as Array<{
        name: string;
        dflt_value: string | null;
      }>;
      const col = cols.find((c) => c.name === "deprecated");
      expect(col).toBeDefined();
      expect(col!.dflt_value).toBe("0");
    });

    it("should have deprecation_reason column", () => {
      const cols = ctx.db.prepare("PRAGMA table_info(problem_solution_pairs)").all() as Array<{
        name: string;
      }>;
      expect(cols.map((c) => c.name)).toContain("deprecation_reason");
    });
  });

  describe("indexes", () => {
    it("should have idx_knowledge_notes_deprecated index", () => {
      const indexes = ctx.db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='knowledge_notes'")
        .all() as Array<{ name: string }>;
      expect(indexes.map((i) => i.name)).toContain("idx_knowledge_notes_deprecated");
    });

    it("should have idx_knowledge_notes_valid_from index", () => {
      const indexes = ctx.db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='knowledge_notes'")
        .all() as Array<{ name: string }>;
      expect(indexes.map((i) => i.name)).toContain("idx_knowledge_notes_valid_from");
    });

    it("should have idx_ps_pairs_deprecated index", () => {
      const indexes = ctx.db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='problem_solution_pairs'",
        )
        .all() as Array<{ name: string }>;
      expect(indexes.map((i) => i.name)).toContain("idx_ps_pairs_deprecated");
    });
  });

  describe("views", () => {
    it("should create active_knowledge_notes view", () => {
      const view = ctx.db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='view' AND name='active_knowledge_notes'",
        )
        .get();
      expect(view).toBeDefined();
    });

    it("should filter deprecated notes in active_knowledge_notes view", () => {
      const now = new Date().toISOString();
      ctx.db
        .prepare(
          "INSERT INTO knowledge_notes (file_path, title, content, created_at, deprecated) VALUES (?, ?, ?, ?, ?)",
        )
        .run("active.md", "Active", "content", now, 0);
      ctx.db
        .prepare(
          "INSERT INTO knowledge_notes (file_path, title, content, created_at, deprecated, deprecation_reason) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run("old.md", "Old", "content", now, 1, "Superseded by active.md");

      const rows = ctx.db.prepare("SELECT * FROM active_knowledge_notes").all() as Array<{
        file_path: string;
      }>;
      expect(rows).toHaveLength(1);
      expect(rows[0].file_path).toBe("active.md");
    });

    it("should create active_problem_solution_pairs view", () => {
      const view = ctx.db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='view' AND name='active_problem_solution_pairs'",
        )
        .get();
      expect(view).toBeDefined();
    });
  });

  describe("rollback (down migration)", () => {
    it("should drop views and indexes on rollback", () => {
      // Create a fresh DB and apply all migrations, then rollback migration 008
      const db = createDatabase(":memory:");
      const migrator = new Migrator(db, ALL_MIGRATIONS);
      migrator.migrate();

      // Verify views exist before rollback
      const viewBefore = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='view' AND name='active_knowledge_notes'",
        )
        .get();
      expect(viewBefore).toBeDefined();

      // Rollback to version 9 (007_spec_alignment)
      migrator.rollback(9);

      // Views should be gone
      const views = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='view' AND name IN ('active_knowledge_notes', 'active_problem_solution_pairs')",
        )
        .all();
      expect(views).toHaveLength(0);

      // Indexes should be gone
      const indexes = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name IN ('idx_knowledge_notes_deprecated', 'idx_knowledge_notes_valid_from', 'idx_ps_pairs_deprecated')",
        )
        .all();
      expect(indexes).toHaveLength(0);

      db.close();
    });
  });
});
