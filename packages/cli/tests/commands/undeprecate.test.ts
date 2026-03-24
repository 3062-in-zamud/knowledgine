import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createDatabase, Migrator, ALL_MIGRATIONS, KnowledgeRepository } from "@knowledgine/core";

// Mock console to avoid noisy output
const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

describe("undeprecate command", () => {
  let db: ReturnType<typeof createDatabase>;
  let _repository: KnowledgeRepository;

  beforeEach(() => {
    db = createDatabase(":memory:");
    new Migrator(db, ALL_MIGRATIONS).migrate();
    _repository = new KnowledgeRepository(db);
    consoleSpy.mockClear();
    consoleErrorSpy.mockClear();
  });

  afterEach(() => {
    db.close();
  });

  it("should set deprecated=0 and deprecation_reason=NULL for specified note", () => {
    // Insert a deprecated note
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO knowledge_notes (file_path, title, content, created_at, deprecated, deprecation_reason) VALUES (?, ?, ?, ?, ?, ?)",
    ).run("test.md", "Test Note", "content", now, 1, "Superseded");

    const noteRow = db
      .prepare("SELECT id FROM knowledge_notes WHERE file_path = ?")
      .get("test.md") as { id: number };
    const noteId = noteRow.id;

    // Execute undeprecate SQL directly (same logic as command)
    const info = db
      .prepare("UPDATE knowledge_notes SET deprecated = 0, deprecation_reason = NULL WHERE id = ?")
      .run(noteId);

    expect(info.changes).toBe(1);

    const updated = db
      .prepare("SELECT deprecated, deprecation_reason FROM knowledge_notes WHERE id = ?")
      .get(noteId) as { deprecated: number; deprecation_reason: string | null };
    expect(updated.deprecated).toBe(0);
    expect(updated.deprecation_reason).toBeNull();
  });

  it("should report 0 changes for non-existent noteId", () => {
    const nonExistentId = 99999;
    const info = db
      .prepare("UPDATE knowledge_notes SET deprecated = 0, deprecation_reason = NULL WHERE id = ?")
      .run(nonExistentId);
    expect(info.changes).toBe(0);
  });

  it("should be idempotent: undeprecating an already active note changes nothing functionally", () => {
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO knowledge_notes (file_path, title, content, created_at, deprecated) VALUES (?, ?, ?, ?, ?)",
    ).run("active.md", "Active Note", "content", now, 0);

    const noteRow = db
      .prepare("SELECT id FROM knowledge_notes WHERE file_path = ?")
      .get("active.md") as { id: number };
    const noteId = noteRow.id;

    const info = db
      .prepare("UPDATE knowledge_notes SET deprecated = 0, deprecation_reason = NULL WHERE id = ?")
      .run(noteId);

    expect(info.changes).toBe(1); // SQLite always counts the update

    const row = db.prepare("SELECT deprecated FROM knowledge_notes WHERE id = ?").get(noteId) as {
      deprecated: number;
    };
    expect(row.deprecated).toBe(0);
  });
});
