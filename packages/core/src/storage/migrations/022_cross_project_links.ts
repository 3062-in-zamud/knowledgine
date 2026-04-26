import type Database from "better-sqlite3";
import type { Migration } from "../migrator.js";

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS cross_project_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  local_note_id INTEGER NOT NULL,
  source_project_name TEXT,
  source_project_path TEXT NOT NULL,
  source_note_id INTEGER NOT NULL,
  link_type TEXT NOT NULL DEFAULT 'reference',
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (local_note_id) REFERENCES knowledge_notes(id) ON DELETE CASCADE,
  UNIQUE(local_note_id, source_project_path, source_note_id)
);
`;

const CREATE_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_cross_project_links_source
  ON cross_project_links(source_project_path);
`;

/**
 * Migration 022: cross_project_links table.
 *
 * Backs the `link` half of cross-project knowledge transfer. A row in
 * this table records that the local note `local_note_id` is a
 * lightweight stub pointing at `source_note_id` inside another project's
 * SQLite (`source_project_path`). NoteLinkService.resolveLink reads from
 * here at display time to fetch the source note body on demand.
 *
 * Forward-only and idempotent: rerunning the migration is a no-op
 * (`IF NOT EXISTS`). `down()` is intentionally empty — dropping this
 * table would orphan stub notes whose only purpose is being targets of
 * these rows.
 */
export const migration022: Migration = {
  version: 22,
  name: "022_cross_project_links",

  up(db: Database.Database) {
    db.exec(CREATE_TABLE_SQL);
    db.exec(CREATE_INDEX_SQL);
  },

  down(_db: Database.Database) {
    // Forward-only.
  },
};
