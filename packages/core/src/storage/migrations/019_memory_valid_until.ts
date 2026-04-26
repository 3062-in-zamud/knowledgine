import type Database from "better-sqlite3";
import type { Migration } from "../migrator.js";

/**
 * Migration 019: Memory valid_until column
 *
 * Adds `valid_until` to memory_entries to support spec §8.2 Point-in-Time
 * Recall (asOf parameter). When `update_memory(createVersion: true)` writes a
 * new row, the previous row's `valid_until` is set to the new row's
 * `created_at`, allowing asOf queries to identify the version that was
 * current at any historical timestamp.
 *
 * Default NULL keeps the column backwards-compatible: rows without a
 * `valid_until` are treated as "still current" by recall().
 */
export const migration019: Migration = {
  version: 19,
  name: "019_memory_valid_until",

  up(db: Database.Database) {
    db.exec(`ALTER TABLE memory_entries ADD COLUMN valid_until TEXT DEFAULT NULL;`);
  },

  down(_db: Database.Database) {
    // SQLite cannot drop columns without recreating the table. Same pattern
    // as migrations 008-018: keep the column to avoid FK/FTS complications.
  },
};
