import type Database from "better-sqlite3";
import type { Migration } from "../migrator.js";

export const migration016: Migration = {
  version: 18,
  name: "016_note_confidence",
  up(db: Database.Database) {
    db.exec(`ALTER TABLE knowledge_notes ADD COLUMN confidence REAL DEFAULT 1.0;`);
  },
  down(db: Database.Database) {
    db.pragma("foreign_keys = OFF");
    // Save view definitions that reference knowledge_notes before dropping the table
    const views = db
      .prepare(
        "SELECT name, sql FROM sqlite_master WHERE type='view' AND sql LIKE '%knowledge_notes%'",
      )
      .all() as Array<{ name: string; sql: string }>;
    for (const v of views) {
      db.exec(`DROP VIEW IF EXISTS ${v.name};`);
    }
    db.exec(`
      CREATE TABLE knowledge_notes_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        frontmatter_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        content_hash TEXT,
        version INTEGER DEFAULT 1,
        supersedes INTEGER,
        valid_from TEXT,
        deprecated INTEGER DEFAULT 0 CHECK(deprecated IN (0, 1)),
        deprecation_reason TEXT,
        extracted_at TEXT,
        code_location_json TEXT
      );
      INSERT INTO knowledge_notes_new SELECT
        id, file_path, title, content, frontmatter_json,
        created_at, updated_at, content_hash,
        version, supersedes, valid_from, deprecated, deprecation_reason,
        extracted_at, code_location_json
      FROM knowledge_notes;
      DROP TABLE knowledge_notes;
      ALTER TABLE knowledge_notes_new RENAME TO knowledge_notes;
    `);
    // Restore views
    for (const v of views) {
      db.exec(v.sql + ";");
    }
    db.pragma("foreign_keys = ON");
  },
};
