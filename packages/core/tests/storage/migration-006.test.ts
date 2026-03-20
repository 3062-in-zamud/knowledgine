import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import type { TestContext } from "../helpers/test-db.js";

describe("migration006: extraction_feedback", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestDb();
  });

  afterEach(() => {
    ctx.db.close();
  });

  describe("extraction_feedback table", () => {
    it("should create extraction_feedback table", () => {
      const result = ctx.db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='extraction_feedback'",
        )
        .get();
      expect(result).toBeDefined();
    });

    it("should have correct columns", () => {
      const cols = ctx.db
        .prepare("PRAGMA table_info(extraction_feedback)")
        .all() as Array<{ name: string }>;
      const colNames = cols.map((c) => c.name);
      expect(colNames).toContain("id");
      expect(colNames).toContain("entity_name");
      expect(colNames).toContain("entity_type");
      expect(colNames).toContain("error_type");
      expect(colNames).toContain("correct_type");
      expect(colNames).toContain("note_id");
      expect(colNames).toContain("details");
      expect(colNames).toContain("status");
      expect(colNames).toContain("created_at");
      expect(colNames).toContain("applied_at");
    });

    it("should insert a feedback record", () => {
      const info = ctx.db
        .prepare(
          `INSERT INTO extraction_feedback (entity_name, error_type)
           VALUES (?, ?)`,
        )
        .run("react", "false_positive");
      expect(info.lastInsertRowid).toBeGreaterThan(0);
    });

    it("should enforce error_type CHECK constraint", () => {
      expect(() => {
        ctx.db
          .prepare(
            `INSERT INTO extraction_feedback (entity_name, error_type)
             VALUES (?, ?)`,
          )
          .run("react", "invalid_type");
      }).toThrow();
    });

    it("should enforce status CHECK constraint", () => {
      expect(() => {
        ctx.db
          .prepare(
            `INSERT INTO extraction_feedback (entity_name, error_type, status)
             VALUES (?, ?, ?)`,
          )
          .run("react", "false_positive", "invalid_status");
      }).toThrow();
    });

    it("should default status to pending", () => {
      ctx.db
        .prepare(
          `INSERT INTO extraction_feedback (entity_name, error_type)
           VALUES (?, ?)`,
        )
        .run("react", "false_positive");

      const row = ctx.db
        .prepare("SELECT status FROM extraction_feedback WHERE entity_name = ?")
        .get("react") as { status: string };
      expect(row.status).toBe("pending");
    });

    it("should auto-set created_at", () => {
      ctx.db
        .prepare(
          `INSERT INTO extraction_feedback (entity_name, error_type)
           VALUES (?, ?)`,
        )
        .run("react", "false_positive");

      const row = ctx.db
        .prepare("SELECT created_at FROM extraction_feedback WHERE entity_name = ?")
        .get("react") as { created_at: string };
      expect(row.created_at).toBeTruthy();
    });

    it("should have indexes", () => {
      const indexes = ctx.db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='extraction_feedback'",
        )
        .all() as Array<{ name: string }>;
      const indexNames = indexes.map((i) => i.name);
      expect(indexNames).toContain("idx_feedback_status");
      expect(indexNames).toContain("idx_feedback_entity");
    });
  });
});
