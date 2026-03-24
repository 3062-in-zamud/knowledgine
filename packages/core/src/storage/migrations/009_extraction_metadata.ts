import type Database from "better-sqlite3";
import type { Migration } from "../migrator.js";

/**
 * Migration 009: Extraction Metadata
 *
 * Adds extraction metadata columns to knowledge_notes:
 * - code_location_json: JSON blob for code location info (file, line, etc.)
 * - extracted_at: timestamp when the note was extracted
 *
 * Also adds suggest_feedback table for recording user feedback on suggestions.
 */
export const migration009: Migration = {
  version: 11,
  name: "extraction_metadata",

  up: (db: Database.Database) => {
    // ① knowledge_notes: extraction metadata columns
    db.exec(`
      ALTER TABLE knowledge_notes ADD COLUMN code_location_json TEXT;
      ALTER TABLE knowledge_notes ADD COLUMN extracted_at TEXT;
    `);

    // ② suggest_feedback: user feedback on suggestions
    db.exec(`
      CREATE TABLE IF NOT EXISTS suggest_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        note_id INTEGER NOT NULL,
        query TEXT NOT NULL,
        is_useful INTEGER NOT NULL,
        context TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (note_id) REFERENCES knowledge_notes(id)
      );
    `);
  },

  down: (db: Database.Database) => {
    // Drop suggest_feedback table
    db.exec(`DROP TABLE IF EXISTS suggest_feedback;`);
    // Columns cannot be dropped in SQLite without recreating the table.
    // Same pattern as other migrations: keep columns to avoid FK/FTS complications.
  },
};
