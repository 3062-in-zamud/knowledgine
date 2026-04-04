import type Database from "better-sqlite3";
import type { Migration } from "../migrator.js";

export const migration015: Migration = {
  version: 17,
  name: "015_embedding_format_version",

  up(db: Database.Database) {
    db.exec(`ALTER TABLE note_embeddings ADD COLUMN format_version INTEGER DEFAULT 1;`);
  },

  down(db: Database.Database) {
    // SQLite doesn't support DROP COLUMN before 3.35.0
    // Recreate table without format_version
    db.exec(`
      CREATE TABLE note_embeddings_new AS SELECT note_id, embedding, model_name, dimensions, created_at, updated_at FROM note_embeddings;
      DROP TABLE note_embeddings;
      ALTER TABLE note_embeddings_new RENAME TO note_embeddings;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_note_embeddings_note ON note_embeddings(note_id);
    `);
  },
};
