import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../helpers/test-db.js";
import type { TestContext } from "../helpers/test-db.js";
import { FeedbackRepository } from "../../src/feedback/feedback-repository.js";

describe("FeedbackRepository", () => {
  let ctx: TestContext;
  let repo: FeedbackRepository;

  beforeEach(() => {
    ctx = createTestDb();
    repo = new FeedbackRepository(ctx.db);
  });

  afterEach(() => {
    ctx.db.close();
  });

  describe("create", () => {
    it("should create a feedback record with minimal fields", () => {
      const record = repo.create({
        entityName: "react",
        errorType: "false_positive",
      });
      expect(record.id).toBeGreaterThan(0);
      expect(record.entityName).toBe("react");
      expect(record.errorType).toBe("false_positive");
      expect(record.status).toBe("pending");
      expect(record.createdAt).toBeTruthy();
      expect(record.appliedAt).toBeNull();
    });

    it("should create a feedback record with all fields", () => {
      const now = new Date().toISOString();
      // First create a note for the FK reference
      ctx.repository.saveNote({
        filePath: "test.md",
        title: "Test",
        content: "test",
        frontmatter: {},
        createdAt: now,
      });

      const record = repo.create({
        entityName: "typescript",
        errorType: "wrong_type",
        entityType: "tool",
        correctType: "technology",
        noteId: 1,
        details: "Should be technology not tool",
      });
      expect(record.entityName).toBe("typescript");
      expect(record.errorType).toBe("wrong_type");
      expect(record.entityType).toBe("tool");
      expect(record.correctType).toBe("technology");
      expect(record.noteId).toBe(1);
      expect(record.details).toBe("Should be technology not tool");
    });

    it("should create a missed_entity feedback", () => {
      const record = repo.create({
        entityName: "vitest",
        errorType: "missed_entity",
        correctType: "technology",
      });
      expect(record.errorType).toBe("missed_entity");
      expect(record.correctType).toBe("technology");
    });

    it("should throw for invalid error_type", () => {
      expect(() =>
        repo.create({
          entityName: "test",
          errorType: "invalid_type" as "false_positive",
        }),
      ).toThrow("Invalid error_type");
    });
  });

  describe("getById", () => {
    it("should return a feedback record by ID", () => {
      const created = repo.create({
        entityName: "react",
        errorType: "false_positive",
      });
      const found = repo.getById(created.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.entityName).toBe("react");
    });

    it("should return undefined for non-existent ID", () => {
      const found = repo.getById(999);
      expect(found).toBeUndefined();
    });
  });

  describe("list", () => {
    it("should return all records when no filter", () => {
      repo.create({ entityName: "a", errorType: "false_positive" });
      repo.create({
        entityName: "b",
        errorType: "wrong_type",
        entityType: "tool",
        correctType: "technology",
      });
      repo.create({ entityName: "c", errorType: "missed_entity" });

      const records = repo.list();
      expect(records).toHaveLength(3);
    });

    it("should filter by status", () => {
      repo.create({ entityName: "a", errorType: "false_positive" });
      const b = repo.create({
        entityName: "b",
        errorType: "wrong_type",
        entityType: "tool",
        correctType: "technology",
      });
      repo.updateStatus(b.id, "applied");

      const pending = repo.list({ status: "pending" });
      expect(pending).toHaveLength(1);
      expect(pending[0].entityName).toBe("a");

      const applied = repo.list({ status: "applied" });
      expect(applied).toHaveLength(1);
      expect(applied[0].entityName).toBe("b");
    });

    it("should respect limit option", () => {
      for (let i = 0; i < 5; i++) {
        repo.create({ entityName: `entity-${i}`, errorType: "false_positive" });
      }
      const records = repo.list({ limit: 3 });
      expect(records).toHaveLength(3);
    });

    it("should throw for invalid status filter", () => {
      expect(() => repo.list({ status: "bogus" })).toThrow("Invalid status");
    });
  });

  describe("updateStatus", () => {
    it("should update status to applied", () => {
      const created = repo.create({ entityName: "test", errorType: "false_positive" });
      repo.updateStatus(created.id, "applied");

      const updated = repo.getById(created.id);
      expect(updated!.status).toBe("applied");
      expect(updated!.appliedAt).toBeTruthy();
    });

    it("should update status to dismissed", () => {
      const created = repo.create({ entityName: "test", errorType: "false_positive" });
      repo.updateStatus(created.id, "dismissed");

      const updated = repo.getById(created.id);
      expect(updated!.status).toBe("dismissed");
      expect(updated!.appliedAt).toBeNull();
    });

    it("should throw for non-existent ID", () => {
      expect(() => repo.updateStatus(999, "applied")).toThrow("Feedback record not found");
    });

    it("should throw for invalid status", () => {
      const created = repo.create({ entityName: "test", errorType: "false_positive" });
      expect(() => repo.updateStatus(created.id, "bogus")).toThrow("Invalid status");
    });
  });

  describe("delete", () => {
    it("should delete a feedback record", () => {
      const created = repo.create({ entityName: "test", errorType: "false_positive" });
      repo.delete(created.id);

      const found = repo.getById(created.id);
      expect(found).toBeUndefined();
    });

    it("should throw for non-existent ID", () => {
      expect(() => repo.delete(999)).toThrow("Feedback record not found");
    });
  });

  describe("getStats", () => {
    it("should return correct stats", () => {
      repo.create({ entityName: "a", errorType: "false_positive" });
      repo.create({
        entityName: "b",
        errorType: "wrong_type",
        entityType: "tool",
        correctType: "technology",
      });
      const c = repo.create({ entityName: "c", errorType: "missed_entity" });
      repo.updateStatus(c.id, "applied");

      const stats = repo.getStats();
      expect(stats.total).toBe(3);
      expect(stats.pending).toBe(2);
      expect(stats.applied).toBe(1);
      expect(stats.dismissed).toBe(0);
    });

    it("should return zeros when no records", () => {
      const stats = repo.getStats();
      expect(stats.total).toBe(0);
      expect(stats.pending).toBe(0);
      expect(stats.applied).toBe(0);
      expect(stats.dismissed).toBe(0);
    });
  });
});
