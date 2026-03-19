import type { Migration } from "../migrator.js";

const MEMORY_LAYERS_SQL = `
CREATE TABLE memory_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id INTEGER,
  layer TEXT NOT NULL CHECK(layer IN ('episodic', 'semantic', 'procedural')),
  content TEXT NOT NULL,
  summary TEXT,
  access_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TEXT,
  promoted_from INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  metadata_json TEXT,
  FOREIGN KEY (note_id) REFERENCES knowledge_notes(id) ON DELETE SET NULL,
  FOREIGN KEY (promoted_from) REFERENCES memory_entries(id) ON DELETE SET NULL
);

CREATE INDEX idx_memory_entries_layer ON memory_entries(layer);
CREATE INDEX idx_memory_entries_note_id ON memory_entries(note_id);
CREATE INDEX idx_memory_entries_access_count ON memory_entries(access_count);

CREATE VIRTUAL TABLE memory_entries_fts USING fts5(
  content, summary, content='memory_entries', content_rowid='id', tokenize='trigram'
);

CREATE TRIGGER memory_entries_ai AFTER INSERT ON memory_entries BEGIN
  INSERT INTO memory_entries_fts(rowid, content, summary) VALUES (new.id, new.content, COALESCE(new.summary, ''));
END;

CREATE TRIGGER memory_entries_ad AFTER DELETE ON memory_entries BEGIN
  INSERT INTO memory_entries_fts(memory_entries_fts, rowid, content, summary) VALUES('delete', old.id, old.content, COALESCE(old.summary, ''));
END;

CREATE TRIGGER memory_entries_au AFTER UPDATE ON memory_entries BEGIN
  INSERT INTO memory_entries_fts(memory_entries_fts, rowid, content, summary) VALUES('delete', old.id, old.content, COALESCE(old.summary, ''));
  INSERT INTO memory_entries_fts(rowid, content, summary) VALUES (new.id, new.content, COALESCE(new.summary, ''));
END;
`;

export const migration002: Migration = {
  version: 2,
  name: "memory_layers",
  up: (db) => {
    db.exec(MEMORY_LAYERS_SQL);
  },
  down: (db) => {
    db.exec(`
      DROP TRIGGER IF EXISTS memory_entries_au;
      DROP TRIGGER IF EXISTS memory_entries_ad;
      DROP TRIGGER IF EXISTS memory_entries_ai;
      DROP TABLE IF EXISTS memory_entries_fts;
      DROP TABLE IF EXISTS memory_entries;
    `);
  },
};
