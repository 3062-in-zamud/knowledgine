import type Database from "better-sqlite3";
import type { Migration } from "../migrator.js";

/**
 * Migration 010: Memory Protocol
 *
 * Adds MCP Memory Protocol fields to memory_entries:
 * - tags_json: JSON array of string tags
 * - deleted: soft-delete flag (0=active, 1=deleted)
 * - deleted_at: timestamp of soft-delete
 * - delete_reason: reason provided at soft-delete
 */
export const migration010: Migration = {
  version: 12,
  name: "010_memory_protocol",

  up(db: Database.Database) {
    db.exec(`ALTER TABLE memory_entries ADD COLUMN tags_json TEXT DEFAULT NULL;`);
    db.exec(`ALTER TABLE memory_entries ADD COLUMN deleted INTEGER DEFAULT 0;`);
    db.exec(`ALTER TABLE memory_entries ADD COLUMN deleted_at TEXT DEFAULT NULL;`);
    db.exec(`ALTER TABLE memory_entries ADD COLUMN delete_reason TEXT DEFAULT NULL;`);
    db.exec(`ALTER TABLE memory_entries ADD COLUMN version INTEGER DEFAULT 1;`);
    db.exec(`ALTER TABLE memory_entries ADD COLUMN supersedes_memory_id INTEGER DEFAULT NULL;`);
  },

  down(_db: Database.Database) {
    // Columns cannot be dropped in SQLite without recreating the table.
    // Same pattern as other migrations: keep columns to avoid FK/FTS complications.
  },
};
