import type Database from "better-sqlite3";
import type { Migration } from "../migrator.js";

export const migration015: Migration = {
  version: 17,
  name: "015_embedding_format_version",

  up(db: Database.Database) {
    db.exec(`ALTER TABLE note_embeddings ADD COLUMN format_version INTEGER DEFAULT 1;`);
  },

  down(db: Database.Database) {
    // SQLite < 3.35.0 doesn't support DROP COLUMN — recreate with original schema
    db.pragma("foreign_keys = OFF");
    db.exec(`
      CREATE TABLE note_embeddings_new (
        note_id INTEGER PRIMARY KEY,
        embedding BLOB NOT NULL,
        model_name TEXT NOT NULL DEFAULT 'all-MiniLM-L6-v2',
        dimensions INTEGER NOT NULL DEFAULT 384,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        FOREIGN KEY (note_id) REFERENCES knowledge_notes(id) ON DELETE CASCADE
      );
      INSERT INTO note_embeddings_new (note_id, embedding, model_name, dimensions, created_at, updated_at)
        SELECT note_id, embedding, model_name, dimensions, created_at, updated_at FROM note_embeddings;
      DROP TABLE note_embeddings;
      ALTER TABLE note_embeddings_new RENAME TO note_embeddings;
      CREATE INDEX idx_note_embeddings_model ON note_embeddings(model_name);
    `);
    db.pragma("foreign_keys = ON");
  },
};
