import type Database from "better-sqlite3";
import type { Migration } from "../migrator.js";

/**
 * Migration 020: Memory expires_at column
 *
 * Adds `expires_at` to memory_entries to support spec §9.2 ttl capability.
 * `store_memory({ttl})` writes `now + ttl*1000` ms. recall_memory filters
 * out entries whose `expires_at <= now()` (lazy expire — no background
 * cleanup job).
 *
 * For versioned updates the new row inherits the old row's `expires_at`
 * by default; explicitly passing `ttl` on update overrides the inheritance.
 *
 * NULL means "no expiration" and is the default for legacy rows.
 */
export const migration020: Migration = {
  version: 20,
  name: "020_memory_expires_at",

  up(db: Database.Database) {
    db.exec(`ALTER TABLE memory_entries ADD COLUMN expires_at TEXT DEFAULT NULL;`);
  },

  down(_db: Database.Database) {
    // SQLite cannot drop columns without recreating the table.
  },
};
