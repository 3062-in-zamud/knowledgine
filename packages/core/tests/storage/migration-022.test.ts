import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3";
import { createDatabase } from "../../src/storage/database.js";
import { Migrator } from "../../src/storage/migrator.js";
import { ALL_MIGRATIONS } from "../../src/index.js";
import { migration022 } from "../../src/storage/migrations/022_cross_project_links.js";

function migrationsBefore22() {
  // Strictly older than 22 — see the matching note in migration-021.test.ts
  // for why `!== 22` is unsafe once a 23+ migration lands.
  return ALL_MIGRATIONS.filter((m) => m.version < 22);
}

describe("migration022: cross_project_links", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createDatabase(":memory:");
    new Migrator(db, migrationsBefore22()).migrate();
  });

  afterEach(() => {
    db.close();
  });

  it("creates the cross_project_links table with the expected columns", () => {
    new Migrator(db, [migration022]).migrate();
    const cols = db.prepare("PRAGMA table_info(cross_project_links)").all() as Array<{
      name: string;
      notnull: number;
    }>;
    const names = cols.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "id",
        "local_note_id",
        "source_project_name",
        "source_project_path",
        "source_note_id",
        "link_type",
        "metadata_json",
        "created_at",
      ]),
    );
    // local_note_id, source_project_path, source_note_id, link_type, created_at are NOT NULL
    const requiredCols = new Set([
      "local_note_id",
      "source_project_path",
      "source_note_id",
      "link_type",
      "created_at",
    ]);
    for (const c of cols) {
      if (requiredCols.has(c.name)) expect(c.notnull).toBe(1);
    }
  });

  it("creates idx_cross_project_links_source on source_project_path", () => {
    new Migrator(db, [migration022]).migrate();
    const idx = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_cross_project_links_source'",
      )
      .get() as { name: string } | undefined;
    expect(idx?.name).toBe("idx_cross_project_links_source");
  });

  it("enforces UNIQUE(local_note_id, source_project_path, source_note_id)", () => {
    new Migrator(db, [migration022]).migrate();
    db.prepare(
      "INSERT INTO knowledge_notes (id, file_path, title, content, created_at) VALUES (1, 'a.md', 'A', 'a', datetime('now'))",
    ).run();
    db.prepare(
      `INSERT INTO cross_project_links
        (local_note_id, source_project_name, source_project_path, source_note_id, link_type, metadata_json, created_at)
       VALUES (1, 'src', '/path/src', 42, 'reference', NULL, datetime('now'))`,
    ).run();
    expect(() =>
      db
        .prepare(
          `INSERT INTO cross_project_links
            (local_note_id, source_project_name, source_project_path, source_note_id, link_type, metadata_json, created_at)
           VALUES (1, 'src', '/path/src', 42, 'reference', NULL, datetime('now'))`,
        )
        .run(),
    ).toThrow(/UNIQUE constraint failed/);
  });

  it("cascades deletes from knowledge_notes via FOREIGN KEY ... ON DELETE CASCADE", () => {
    new Migrator(db, [migration022]).migrate();
    // foreign_keys are turned on by createDatabase()
    db.prepare(
      "INSERT INTO knowledge_notes (id, file_path, title, content, created_at) VALUES (1, 'b.md', 'B', 'b', datetime('now'))",
    ).run();
    db.prepare(
      `INSERT INTO cross_project_links
        (local_note_id, source_project_name, source_project_path, source_note_id, link_type, metadata_json, created_at)
       VALUES (1, 's', '/p', 99, 'reference', NULL, datetime('now'))`,
    ).run();
    db.prepare("DELETE FROM knowledge_notes WHERE id = 1").run();
    const remaining = db.prepare("SELECT COUNT(*) as c FROM cross_project_links").get() as {
      c: number;
    };
    expect(remaining.c).toBe(0);
  });

  it("is idempotent (rerunning the migration is a no-op)", () => {
    new Migrator(db, [migration022]).migrate();
    db.prepare(
      "INSERT INTO knowledge_notes (id, file_path, title, content, created_at) VALUES (1, 'c.md', 'C', 'c', datetime('now'))",
    ).run();
    db.prepare(
      `INSERT INTO cross_project_links
        (local_note_id, source_project_name, source_project_path, source_note_id, link_type, metadata_json, created_at)
       VALUES (1, 's2', '/p2', 7, 'reference', NULL, datetime('now'))`,
    ).run();
    // Run migration022.up() again directly (Migrator would skip on
    // schema_version match, so we exercise the up() body directly)
    expect(() => migration022.up(db)).not.toThrow();
    const c = db.prepare("SELECT COUNT(*) as c FROM cross_project_links").get() as { c: number };
    expect(c.c).toBe(1); // existing row preserved (CREATE TABLE IF NOT EXISTS)
  });

  it("forward-only: down() is empty", () => {
    new Migrator(db, [migration022]).migrate();
    expect(() => migration022.down(db)).not.toThrow();
    // Table still exists after down() because down is intentionally empty
    const exists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cross_project_links'")
      .get() as { name: string } | undefined;
    expect(exists?.name).toBe("cross_project_links");
  });

  it("registered in ALL_MIGRATIONS at version 22", () => {
    const versions = ALL_MIGRATIONS.map((m) => m.version);
    expect(versions).toContain(22);
    expect(Math.max(...versions)).toBe(22);
  });
});
