import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { MemoryManager } from "../../src/memory/memory-manager.js";
import { Migrator } from "../../src/storage/migrator.js";
import { migration001 } from "../../src/storage/migrations/001_initial.js";
import { migration002 } from "../../src/storage/migrations/002_memory_layers.js";
import {
  ValidationError,
  MemoryNotFoundError,
  MemoryPromotionError,
  MemoryDemotionError,
} from "../../src/errors.js";
import type { MemoryLayer } from "../../src/types.js";

describe("MemoryManager", () => {
  let db: Database.Database;
  let manager: MemoryManager;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    new Migrator(db, [migration001, migration002]).migrate();
    manager = new MemoryManager(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("store", () => {
    it("should store an episodic memory entry", () => {
      const id = manager.store("episodic", "Test memory content");
      expect(id).toBeGreaterThan(0);
    });

    it("should store a semantic memory entry", () => {
      const id = manager.store("semantic", "Semantic content");
      expect(id).toBeGreaterThan(0);
    });

    it("should store a procedural memory entry", () => {
      const id = manager.store("procedural", "Procedural content");
      expect(id).toBeGreaterThan(0);
    });

    it("should store with noteId", () => {
      // Insert a knowledge note first
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO knowledge_notes (file_path, title, content, created_at) VALUES (?, ?, ?, ?)`,
      ).run("test.md", "Test", "Content", now);

      const id = manager.store("episodic", "Memory linked to note", 1);
      expect(id).toBeGreaterThan(0);
    });

    it("should store with metadata", () => {
      const id = manager.store("episodic", "Memory with metadata", undefined, {
        source: "test",
        tags: ["a", "b"],
      });
      expect(id).toBeGreaterThan(0);
    });

    it("should throw ValidationError for empty content", () => {
      expect(() => manager.store("episodic", "")).toThrow(ValidationError);
      expect(() => manager.store("episodic", "   ")).toThrow(ValidationError);
    });

    it("should throw ValidationError for invalid layer", () => {
      expect(() => manager.store("invalid" as unknown as MemoryLayer, "content")).toThrow(
        ValidationError,
      );
    });
  });

  describe("retrieve", () => {
    it("should retrieve entries sorted by last_accessed_at desc", () => {
      const id1 = manager.store("episodic", "First entry");
      const id2 = manager.store("episodic", "Second entry");
      const id3 = manager.store("episodic", "Third entry");

      // Set distinct last_accessed_at to ensure deterministic order
      db.prepare("UPDATE memory_entries SET last_accessed_at = ? WHERE id = ?").run(
        "2025-01-01T00:00:00Z",
        id1,
      );
      db.prepare("UPDATE memory_entries SET last_accessed_at = ? WHERE id = ?").run(
        "2025-01-02T00:00:00Z",
        id2,
      );
      db.prepare("UPDATE memory_entries SET last_accessed_at = ? WHERE id = ?").run(
        "2025-01-03T00:00:00Z",
        id3,
      );

      const entries = manager.retrieve("episodic");
      expect(entries).toHaveLength(3);
      expect(entries[0].content).toBe("Third entry");
      expect(entries[1].content).toBe("Second entry");
      expect(entries[2].content).toBe("First entry");
    });

    it("should increment access_count on retrieve", () => {
      manager.store("episodic", "Test entry");
      const first = manager.retrieve("episodic");
      expect(first[0].accessCount).toBe(1);

      const second = manager.retrieve("episodic");
      expect(second[0].accessCount).toBe(2);
    });

    it("should update last_accessed_at on retrieve", () => {
      manager.store("episodic", "Test entry");
      const entries = manager.retrieve("episodic");
      expect(entries[0].lastAccessedAt).toBeDefined();
    });

    it("should respect limit", () => {
      manager.store("episodic", "Entry 1");
      manager.store("episodic", "Entry 2");
      manager.store("episodic", "Entry 3");

      const entries = manager.retrieve("episodic", 2);
      expect(entries).toHaveLength(2);
    });

    it("should return empty array for empty layer", () => {
      const entries = manager.retrieve("semantic");
      expect(entries).toEqual([]);
    });

    it("should increment access_count by 2 after two retrieves", () => {
      manager.store("episodic", "Entry");
      manager.retrieve("episodic");
      manager.retrieve("episodic");

      // Use getContext (no side effects) to verify the count
      const ctx = manager.getContext();
      expect(ctx.episodic[0].accessCount).toBe(2);
    });
  });

  describe("search", () => {
    beforeEach(() => {
      manager.store("episodic", "TypeScript is a typed superset of JavaScript");
      manager.store("semantic", "React hooks enable functional components");
      manager.store("procedural", "Always run tests before deploying");
    });

    it("should find entries by FTS5 search", () => {
      const results = manager.search("TypeScript");
      expect(results).toHaveLength(1);
      expect(results[0].content).toContain("TypeScript");
    });

    it("should filter by layer", () => {
      const results = manager.search("TypeScript", "semantic");
      expect(results).toHaveLength(0);
    });

    it("should search across all layers when layer is not specified", () => {
      const results = manager.search("typed");
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it("should return empty array when no matches", () => {
      const results = manager.search("nonexistent");
      expect(results).toEqual([]);
    });

    it("should throw ValidationError for empty query", () => {
      expect(() => manager.search("")).toThrow(ValidationError);
      expect(() => manager.search("   ")).toThrow(ValidationError);
    });

    it("should search Japanese content", () => {
      manager.store("episodic", "データベースの最適化手法について");
      const results = manager.search("データベース");
      expect(results).toHaveLength(1);
    });

    it("should use LIKE fallback for 1-2 character queries", () => {
      manager.store("episodic", "XZ unique short query test");
      const results = manager.search("XZ");
      expect(results).toHaveLength(1);
      expect(results[0].content).toContain("XZ");
    });

    it("should handle FTS5 special characters safely", () => {
      manager.store("episodic", "Use OR operator in queries");
      // "OR" is a FTS5 special keyword, but should be safe because we quote
      const results = manager.search("OR operator");
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("update", () => {
    it("should update content", () => {
      const id = manager.store("episodic", "Original content");
      manager.update(id, { content: "Updated content" });

      const ctx = manager.getContext();
      expect(ctx.episodic[0].content).toBe("Updated content");
    });

    it("should update summary", () => {
      const id = manager.store("episodic", "Some content");
      manager.update(id, { summary: "A summary" });

      const ctx = manager.getContext();
      expect(ctx.episodic[0].summary).toBe("A summary");
    });

    it("should update metadata", () => {
      const id = manager.store("episodic", "Content");
      manager.update(id, { metadata: { key: "value" } });

      const ctx = manager.getContext();
      expect(ctx.episodic[0].metadata).toEqual({ key: "value" });
    });

    it("should set updated_at on update", () => {
      const id = manager.store("episodic", "Content");
      manager.update(id, { content: "New content" });

      const ctx = manager.getContext();
      expect(ctx.episodic[0].updatedAt).toBeDefined();
    });

    it("should throw MemoryNotFoundError for non-existent id", () => {
      expect(() => manager.update(999, { content: "test" })).toThrow(MemoryNotFoundError);
    });
  });

  describe("remove", () => {
    it("should remove an existing entry and return true", () => {
      const id = manager.store("episodic", "To be removed");
      const result = manager.remove(id);
      expect(result).toBe(true);

      const ctx = manager.getContext();
      expect(ctx.episodic).toHaveLength(0);
    });

    it("should return false for non-existent id", () => {
      const result = manager.remove(999);
      expect(result).toBe(false);
    });
  });

  describe("promote", () => {
    it("should promote episodic to semantic when access_count >= 3", () => {
      const id = manager.store("episodic", "Promotable content");
      // Retrieve 3 times to increment access_count to 3
      manager.retrieve("episodic");
      manager.retrieve("episodic");
      manager.retrieve("episodic");

      const promoted = manager.promote(id);
      expect(promoted.layer).toBe("semantic");
    });

    it("should promote semantic to procedural when access_count >= 10", () => {
      const id = manager.store("semantic", "Highly accessed content");
      // Manually set access_count to 10
      db.prepare("UPDATE memory_entries SET access_count = 10 WHERE id = ?").run(id);

      const promoted = manager.promote(id);
      expect(promoted.layer).toBe("procedural");
    });

    it("should throw MemoryPromotionError when access_count below threshold", () => {
      const id = manager.store("episodic", "Low access");
      manager.retrieve("episodic"); // access_count = 1

      expect(() => manager.promote(id)).toThrow(MemoryPromotionError);
    });

    it("should throw MemoryPromotionError for procedural layer", () => {
      const id = manager.store("procedural", "Already top");
      expect(() => manager.promote(id)).toThrow(MemoryPromotionError);
    });

    it("should throw MemoryNotFoundError for non-existent id", () => {
      expect(() => manager.promote(999)).toThrow(MemoryNotFoundError);
    });

    it("should promote at exact threshold (access_count = 3)", () => {
      const id = manager.store("episodic", "Boundary test");
      db.prepare("UPDATE memory_entries SET access_count = 3 WHERE id = ?").run(id);

      const promoted = manager.promote(id);
      expect(promoted.layer).toBe("semantic");
    });

    it("should promote at exact threshold (access_count = 10)", () => {
      const id = manager.store("semantic", "Boundary test");
      db.prepare("UPDATE memory_entries SET access_count = 10 WHERE id = ?").run(id);

      const promoted = manager.promote(id);
      expect(promoted.layer).toBe("procedural");
    });
  });

  describe("demote", () => {
    it("should demote procedural to semantic", () => {
      const id = manager.store("procedural", "Demotable content");
      const demoted = manager.demote(id);
      expect(demoted.layer).toBe("semantic");
    });

    it("should demote semantic to episodic", () => {
      const id = manager.store("semantic", "Demotable");
      const demoted = manager.demote(id);
      expect(demoted.layer).toBe("episodic");
    });

    it("should throw MemoryDemotionError for episodic layer", () => {
      const id = manager.store("episodic", "Already bottom");
      expect(() => manager.demote(id)).toThrow(MemoryDemotionError);
    });

    it("should throw MemoryNotFoundError for non-existent id", () => {
      expect(() => manager.demote(999)).toThrow(MemoryNotFoundError);
    });
  });

  describe("lifecycle: promote → demote → access → re-promote", () => {
    it("should handle full promotion lifecycle correctly", () => {
      const id = manager.store("episodic", "Lifecycle test");

      // Build up access_count to 3
      db.prepare("UPDATE memory_entries SET access_count = 3 WHERE id = ?").run(id);

      // Promote: episodic → semantic
      const promoted = manager.promote(id);
      expect(promoted.layer).toBe("semantic");

      // Demote: semantic → episodic (access_count preserved)
      const demoted = manager.demote(id);
      expect(demoted.layer).toBe("episodic");

      // Access count should still be 3 (not reset)
      const ctx = manager.getContext();
      expect(ctx.episodic[0].accessCount).toBe(3);

      // Re-promote should work since access_count >= 3
      const rePromoted = manager.promote(id);
      expect(rePromoted.layer).toBe("semantic");
    });
  });

  describe("getContext", () => {
    it("should return entries grouped by layer", () => {
      manager.store("episodic", "Episodic 1");
      manager.store("semantic", "Semantic 1");
      manager.store("procedural", "Procedural 1");

      const ctx = manager.getContext();
      expect(ctx.episodic).toHaveLength(1);
      expect(ctx.semantic).toHaveLength(1);
      expect(ctx.procedural).toHaveLength(1);
    });

    it("should limit episodic to 5 entries", () => {
      for (let i = 0; i < 8; i++) {
        manager.store("episodic", `Episodic ${i}`);
      }

      const ctx = manager.getContext();
      expect(ctx.episodic).toHaveLength(5);
    });

    it("should limit semantic to 10 entries", () => {
      for (let i = 0; i < 15; i++) {
        manager.store("semantic", `Semantic ${i}`);
      }

      const ctx = manager.getContext();
      expect(ctx.semantic).toHaveLength(10);
    });

    it("should return all procedural entries", () => {
      for (let i = 0; i < 20; i++) {
        manager.store("procedural", `Procedural ${i}`);
      }

      const ctx = manager.getContext();
      expect(ctx.procedural).toHaveLength(20);
    });

    it("should filter by noteId", () => {
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO knowledge_notes (file_path, title, content, created_at) VALUES (?, ?, ?, ?)`,
      ).run("a.md", "A", "content", now);
      db.prepare(
        `INSERT INTO knowledge_notes (file_path, title, content, created_at) VALUES (?, ?, ?, ?)`,
      ).run("b.md", "B", "content", now);

      manager.store("episodic", "Entry for note 1", 1);
      manager.store("episodic", "Entry for note 2", 2);

      const ctx = manager.getContext(1);
      expect(ctx.episodic).toHaveLength(1);
      expect(ctx.episodic[0].content).toBe("Entry for note 1");
    });

    it("should return empty context for empty database", () => {
      const ctx = manager.getContext();
      expect(ctx.episodic).toEqual([]);
      expect(ctx.semantic).toEqual([]);
      expect(ctx.procedural).toEqual([]);
    });

    it("should NOT change access_count", () => {
      manager.store("episodic", "Read-only check");

      manager.getContext();
      manager.getContext();
      manager.getContext();

      // Use a raw query to verify access_count is still 0
      const row = db.prepare("SELECT access_count FROM memory_entries WHERE id = 1").get() as {
        access_count: number;
      };
      expect(row.access_count).toBe(0);
    });
  });
});
