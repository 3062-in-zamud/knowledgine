import type { Migration } from "../migrator.js";

const VECTOR_EMBEDDINGS_SQL = `
CREATE TABLE note_embeddings (
  note_id INTEGER PRIMARY KEY,
  embedding BLOB NOT NULL,
  model_name TEXT NOT NULL DEFAULT 'all-MiniLM-L6-v2',
  dimensions INTEGER NOT NULL DEFAULT 384,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  FOREIGN KEY (note_id) REFERENCES knowledge_notes(id) ON DELETE CASCADE
);

CREATE INDEX idx_note_embeddings_model ON note_embeddings(model_name);
`;

const VECTOR_TABLE_SQL = `
CREATE VIRTUAL TABLE note_embeddings_vec USING vec0(
  note_id INTEGER PRIMARY KEY,
  embedding FLOAT[384]
);
`;

const SYNC_TRIGGERS_SQL = `
CREATE TRIGGER note_embeddings_ad AFTER DELETE ON note_embeddings BEGIN
  DELETE FROM note_embeddings_vec WHERE note_id = old.note_id;
END;
`;

export const migration003: Migration = {
  version: 3,
  name: "vector_embeddings",
  up: (db) => {
    // Always create the regular table
    db.exec(VECTOR_EMBEDDINGS_SQL);

    // Try to create vec0 virtual table (requires sqlite-vec extension)
    try {
      db.exec(VECTOR_TABLE_SQL);
      db.exec(SYNC_TRIGGERS_SQL);
    } catch {
      // sqlite-vec not available — graceful degradation, keyword-only search still works
    }
  },
  down: (db) => {
    db.exec(`
      DROP TRIGGER IF EXISTS note_embeddings_ad;
      DROP TRIGGER IF EXISTS note_embeddings_au;
      DROP TRIGGER IF EXISTS note_embeddings_ai;
      DROP TABLE IF EXISTS note_embeddings_vec;
      DROP TABLE IF EXISTS note_embeddings;
    `);
  },
};
