import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { SCHEMA_SQL } from "../../src/storage/schema.js";

interface NoteRow {
  id: number;
  file_path: string;
  title: string;
  content: string;
  content_hash: string | null;
}

interface CountRow {
  count: number;
}

describe("Schema", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(SCHEMA_SQL);
  });

  afterEach(() => {
    db.close();
  });

  it("should create all tables", () => {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain("knowledge_notes");
    expect(tableNames).toContain("extracted_patterns");
    expect(tableNames).toContain("problem_solution_pairs");
    expect(tableNames).toContain("note_links");
    expect(tableNames).toContain("knowledge_notes_fts");
  });

  it("should CRUD knowledge_notes", () => {
    const now = new Date().toISOString();

    // Insert
    const insert = db.prepare(`
      INSERT INTO knowledge_notes (file_path, title, content, frontmatter_json, created_at, content_hash)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = insert.run(
      "test/note.md",
      "Test Note",
      "Hello world",
      '{"tags":["test"]}',
      now,
      "abc123",
    );
    const id = Number(info.lastInsertRowid);
    expect(id).toBeGreaterThan(0);

    // Read
    const note = db.prepare("SELECT * FROM knowledge_notes WHERE id = ?").get(id) as NoteRow;
    expect(note.title).toBe("Test Note");
    expect(note.file_path).toBe("test/note.md");
    expect(note.content_hash).toBe("abc123");

    // Update
    db.prepare("UPDATE knowledge_notes SET title = ? WHERE id = ?").run("Updated Note", id);
    const updated = db.prepare("SELECT * FROM knowledge_notes WHERE id = ?").get(id) as NoteRow;
    expect(updated.title).toBe("Updated Note");

    // Delete
    db.prepare("DELETE FROM knowledge_notes WHERE id = ?").run(id);
    const deleted = db.prepare("SELECT * FROM knowledge_notes WHERE id = ?").get(id);
    expect(deleted).toBeUndefined();
  });

  it("should enforce extracted_patterns FK constraint", () => {
    expect(() => {
      db.prepare(
        `
        INSERT INTO extracted_patterns (note_id, pattern_type, content, confidence, created_at)
        VALUES (999, 'problem', 'test', 0.8, '2025-01-01')
      `,
      ).run();
    }).toThrow();
  });

  it("should enforce extracted_patterns pattern_type CHECK constraint", () => {
    const now = new Date().toISOString();
    db.prepare(
      `
      INSERT INTO knowledge_notes (file_path, title, content, created_at)
      VALUES ('test.md', 'Test', 'content', ?)
    `,
    ).run(now);

    expect(() => {
      db.prepare(
        `
        INSERT INTO extracted_patterns (note_id, pattern_type, content, confidence, created_at)
        VALUES (1, 'invalid_type', 'test', 0.8, ?)
      `,
      ).run(now);
    }).toThrow();
  });

  it("should enforce note_links UNIQUE constraint", () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO knowledge_notes (file_path, title, content, created_at) VALUES ('a.md', 'A', 'a', ?)`,
    ).run(now);
    db.prepare(
      `INSERT INTO knowledge_notes (file_path, title, content, created_at) VALUES ('b.md', 'B', 'b', ?)`,
    ).run(now);

    db.prepare(
      `INSERT INTO note_links (source_note_id, target_note_id, link_type, created_at) VALUES (1, 2, 'related', ?)`,
    ).run(now);

    expect(() => {
      db.prepare(
        `INSERT INTO note_links (source_note_id, target_note_id, link_type, created_at) VALUES (1, 2, 'derived', ?)`,
      ).run(now);
    }).toThrow();
  });

  it("should support FTS5 search", () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO knowledge_notes (file_path, title, content, created_at) VALUES ('a.md', 'TypeScript Guide', 'Learn TypeScript basics', ?)`,
    ).run(now);
    db.prepare(
      `INSERT INTO knowledge_notes (file_path, title, content, created_at) VALUES ('b.md', 'Python Guide', 'Learn Python basics', ?)`,
    ).run(now);

    const results = db
      .prepare(
        `
      SELECT n.* FROM knowledge_notes n
      JOIN knowledge_notes_fts fts ON n.id = fts.rowid
      WHERE knowledge_notes_fts MATCH 'TypeScript'
    `,
      )
      .all() as NoteRow[];

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("TypeScript Guide");
  });

  it("should support FTS5 search with Japanese", () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO knowledge_notes (file_path, title, content, created_at) VALUES ('a.md', 'データベース最適化', 'SQLiteのパフォーマンスを改善', ?)`,
    ).run(now);

    const results = db
      .prepare(
        `
      SELECT n.* FROM knowledge_notes n
      JOIN knowledge_notes_fts fts ON n.id = fts.rowid
      WHERE knowledge_notes_fts MATCH 'データベース'
    `,
      )
      .all() as NoteRow[];

    expect(results).toHaveLength(1);
  });

  it("should CASCADE DELETE from knowledge_notes to extracted_patterns", () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO knowledge_notes (file_path, title, content, created_at) VALUES ('a.md', 'A', 'content', ?)`,
    ).run(now);
    db.prepare(
      `INSERT INTO extracted_patterns (note_id, pattern_type, content, confidence, created_at) VALUES (1, 'problem', 'test', 0.8, ?)`,
    ).run(now);

    // Verify pattern exists
    const before = db.prepare("SELECT COUNT(*) as count FROM extracted_patterns").get() as CountRow;
    expect(before.count).toBe(1);

    // Delete note
    db.prepare("DELETE FROM knowledge_notes WHERE id = 1").run();

    // Pattern should be cascaded
    const after = db.prepare("SELECT COUNT(*) as count FROM extracted_patterns").get() as CountRow;
    expect(after.count).toBe(0);
  });

  it("should detect changes via content_hash", () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO knowledge_notes (file_path, title, content, created_at, content_hash) VALUES ('a.md', 'A', 'v1', ?, 'hash1')`,
    ).run(now);

    const note = db.prepare("SELECT content_hash FROM knowledge_notes WHERE id = 1").get() as Pick<
      NoteRow,
      "content_hash"
    >;
    expect(note.content_hash).toBe("hash1");

    db.prepare("UPDATE knowledge_notes SET content = ?, content_hash = ? WHERE id = 1").run(
      "v2",
      "hash2",
    );
    const updated = db
      .prepare("SELECT content_hash FROM knowledge_notes WHERE id = 1")
      .get() as Pick<NoteRow, "content_hash">;
    expect(updated.content_hash).toBe("hash2");
  });
});
